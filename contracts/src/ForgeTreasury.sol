// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ForgeTreasury
 * @notice Transparent on-chain treasury for the 40% $FORGE reward allocation.
 *         Rate-limited emissions prevent rug pulls and give holders confidence.
 *
 *         Design:
 *           - Holds up to 400M $FORGE (40% of supply)
 *           - Weekly emission cap enforced on-chain (cannot exceed schedule)
 *           - Owner can emit to ArenaVault (staker yield) or ForgeArena (bout prizes)
 *           - Anyone can view balance, emission rate, and history
 *           - 48h timelock on emission cap changes
 */
contract ForgeTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ──────────────────────────────────────────────

    IERC20 public forgeToken;

    /// @notice Maximum tokens emittable per week (starts at Year 1 rate)
    uint256 public weeklyEmissionCap;

    /// @notice Tokens emitted in current week
    uint256 public emittedThisWeek;

    /// @notice Start of current emission week
    uint256 public currentWeekStart;

    /// @notice Total tokens emitted lifetime
    uint256 public totalEmitted;

    /// @notice Authorized recipients (ArenaVault, ForgeArena, etc.)
    mapping(address => bool) public authorizedRecipients;

    /// @notice Pending cap change (timelock)
    uint256 public pendingCap;
    uint256 public pendingCapActivatesAt;

    uint256 public constant TIMELOCK_DURATION = 48 hours;
    uint256 public constant WEEK = 7 days;

    // ─── Events ─────────────────────────────────────────────

    event Emitted(address indexed recipient, uint256 amount, string memo);
    event RecipientUpdated(address indexed recipient, bool authorized);
    event WeeklyCapUpdated(uint256 oldCap, uint256 newCap);
    event CapChangeQueued(uint256 newCap, uint256 activatesAt);
    event TokenSet(address indexed token);

    // ─── Errors ─────────────────────────────────────────────

    error TokenAlreadySet();
    error ZeroAddress();
    error NotAuthorizedRecipient();
    error ExceedsWeeklyCap(uint256 requested, uint256 remaining);
    error TimelockNotReady(uint256 activatesAt);
    error NoPendingCap();

    // ─── Constructor ────────────────────────────────────────

    /**
     * @param _owner           Owner (deployer or multisig)
     * @param _weeklyEmissionCap Initial weekly cap (in token units, e.g. 5M * 1e18)
     */
    constructor(
        address _owner,
        uint256 _weeklyEmissionCap
    ) Ownable(_owner) {
        weeklyEmissionCap = _weeklyEmissionCap;
        currentWeekStart = block.timestamp;
    }

    /// @notice One-time setter for forgeToken. Cannot be called once set.
    function setForgeToken(address _forgeToken) external onlyOwner {
        if (address(forgeToken) != address(0)) revert TokenAlreadySet();
        if (_forgeToken == address(0)) revert ZeroAddress();
        forgeToken = IERC20(_forgeToken);
        emit TokenSet(_forgeToken);
    }

    // ─── Emission ───────────────────────────────────────────

    /**
     * @notice Emit tokens to an authorized recipient (ArenaVault, ForgeArena, etc.)
     *         Rate-limited by weekly cap. Resets every 7 days.
     * @param recipient Target contract address
     * @param amount    Token amount to send
     * @param memo      Human-readable reason (e.g. "weekly vault yield", "bout #47 prize pool")
     */
    function emitTokens(address recipient, uint256 amount, string calldata memo) external onlyOwner nonReentrant {
        if (!authorizedRecipients[recipient]) revert NotAuthorizedRecipient();

        // Roll over to new week if needed
        _rollWeek();

        uint256 remaining = weeklyEmissionCap - emittedThisWeek;
        if (amount > remaining) revert ExceedsWeeklyCap(amount, remaining);

        emittedThisWeek += amount;
        totalEmitted += amount;

        forgeToken.safeTransfer(recipient, amount);

        // solhint-disable-next-line no-empty-blocks
        emit Emitted(recipient, amount, memo);
    }

    // ─── Admin ──────────────────────────────────────────────

    function setRecipient(address recipient, bool authorized) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        authorizedRecipients[recipient] = authorized;
        // solhint-disable-next-line no-empty-blocks
        emit RecipientUpdated(recipient, authorized);
    }

    /**
     * @notice Queue a weekly cap change. Takes effect after 48h timelock.
     *         This prevents sudden rug — holders have 48h to react.
     */
    function queueCapChange(uint256 newCap) external onlyOwner {
        pendingCap = newCap;
        pendingCapActivatesAt = block.timestamp + TIMELOCK_DURATION;
        // solhint-disable-next-line no-empty-blocks
        emit CapChangeQueued(newCap, pendingCapActivatesAt);
    }

    /// @notice Execute a queued cap change after timelock expires.
    function executeCapChange() external onlyOwner {
        if (pendingCapActivatesAt == 0) revert NoPendingCap();
        if (block.timestamp < pendingCapActivatesAt) revert TimelockNotReady(pendingCapActivatesAt);

        uint256 oldCap = weeklyEmissionCap;
        weeklyEmissionCap = pendingCap;
        pendingCap = 0;
        pendingCapActivatesAt = 0;

        // solhint-disable-next-line no-empty-blocks
        emit WeeklyCapUpdated(oldCap, weeklyEmissionCap);
    }

    // ─── Internal ───────────────────────────────────────────

    function _rollWeek() internal {
        if (block.timestamp >= currentWeekStart + WEEK) {
            currentWeekStart = block.timestamp;
            emittedThisWeek = 0;
        }
    }

    // ─── Views ──────────────────────────────────────────────

    /// @notice Tokens remaining in this week's emission budget
    function remainingThisWeek() external view returns (uint256) {
        if (block.timestamp >= currentWeekStart + WEEK) {
            return weeklyEmissionCap; // new week, full budget
        }
        return weeklyEmissionCap - emittedThisWeek;
    }

    /// @notice Treasury balance
    function balance() external view returns (uint256) {
        return forgeToken.balanceOf(address(this));
    }

    /// @notice Time until current week resets
    function timeUntilWeekReset() external view returns (uint256) {
        uint256 weekEnd = currentWeekStart + WEEK;
        if (block.timestamp >= weekEnd) return 0;
        return weekEnd - block.timestamp;
    }
}
