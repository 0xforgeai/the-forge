// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IForgeBonds {
    function createBond(
        address creator,
        bytes32 boutId,
        uint256 faceValue,
        uint16  discountBps,
        uint256 expiresAt
    ) external returns (uint256 bondId);
}

/**
 * @title VictoryEscrow
 * @notice Receives winner payouts from ForgeArena after bout resolution.
 *         Gives winners two choices:
 *           1. Instant Claim — burns a tax % (default 5%), receives the rest
 *           2. Claim as Bond — full amount goes to ForgeBonds as an OTC bond
 *
 *         Relay variants (*For) let the backend act on behalf of API-key agents.
 */
contract VictoryEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ──────────────────────────────────────────────

    ERC20Burnable public immutable forgeToken;
    IForgeBonds   public forgeBonds;
    uint16        public instantBurnBps;   // 500 = 5% default

    struct Escrow {
        address winner;
        uint256 amount;
        bytes32 boutId;
        bool    claimed;
    }

    /// @notice boutId => array of winner escrows
    mapping(bytes32 => Escrow[]) public escrows;

    // ─── Events ─────────────────────────────────────────────

    event PayoutLocked(bytes32 indexed boutId, address indexed winner, uint256 amount, uint256 escrowIdx);
    event InstantClaimed(bytes32 indexed boutId, address indexed winner, uint256 netAmount, uint256 burned);
    event BondCreated(bytes32 indexed boutId, address indexed winner, uint256 bondId, uint256 amount);
    event ForgeBondsUpdated(address indexed newForgeBonds);
    event InstantBurnBpsUpdated(uint16 newBps);

    // ─── Errors ─────────────────────────────────────────────

    error EscrowNotFound();
    error AlreadyClaimed();
    error NotWinner();
    error ForgeBondsNotSet();

    // ─── Constructor ────────────────────────────────────────

    constructor(
        address _forgeToken,
        address _owner,
        uint16  _instantBurnBps
    ) Ownable(_owner) {
        forgeToken = ERC20Burnable(_forgeToken);
        instantBurnBps = _instantBurnBps;
    }

    // ─── Admin ──────────────────────────────────────────────

    function setForgeBonds(address _forgeBonds) external onlyOwner {
        forgeBonds = IForgeBonds(_forgeBonds);
        emit ForgeBondsUpdated(_forgeBonds);
    }

    function setInstantBurnBps(uint16 _bps) external onlyOwner {
        require(_bps <= 5000, "Burn tax too high"); // cap at 50%
        instantBurnBps = _bps;
        emit InstantBurnBpsUpdated(_bps);
    }

    // ─── Lock Payout (called by ForgeArena) ─────────────────

    /**
     * @notice Lock a winner's payout in escrow. Called by ForgeArena.resolveAndEscrow().
     *         Tokens must already be transferred to this contract before calling.
     * @param boutId  The bout identifier
     * @param winner  The winner's address
     * @param amount  Token amount escrowed
     */
    function lockPayout(bytes32 boutId, address winner, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        // Transfer tokens from caller (ForgeArena) to this contract
        IERC20(address(forgeToken)).safeTransferFrom(msg.sender, address(this), amount);

        uint256 idx = escrows[boutId].length;
        escrows[boutId].push(Escrow({
            winner: winner,
            amount: amount,
            boutId: boutId,
            claimed: false
        }));

        emit PayoutLocked(boutId, winner, amount, idx);
    }

    // ─── Instant Claim ──────────────────────────────────────

    /**
     * @notice Winner claims instantly. Burns instantBurnBps%, receives the rest.
     */
    function claimInstant(bytes32 boutId, uint256 escrowIdx) external nonReentrant {
        _claimInstant(boutId, escrowIdx, msg.sender);
    }

    /**
     * @notice Relay: backend claims on behalf of a winner.
     */
    function claimInstantFor(
        bytes32 boutId,
        uint256 escrowIdx,
        address winner
    ) external onlyOwner nonReentrant {
        _claimInstant(boutId, escrowIdx, winner);
    }

    function _claimInstant(bytes32 boutId, uint256 escrowIdx, address winner) internal {
        Escrow storage escrow = _getEscrow(boutId, escrowIdx);
        if (escrow.claimed) revert AlreadyClaimed();
        if (escrow.winner != winner) revert NotWinner();

        escrow.claimed = true;

        uint256 burnAmount = (escrow.amount * instantBurnBps) / 10000;
        uint256 netAmount = escrow.amount - burnAmount;

        if (burnAmount > 0) {
            forgeToken.burn(burnAmount);
        }

        if (netAmount > 0) {
            IERC20(address(forgeToken)).safeTransfer(winner, netAmount);
        }

        emit InstantClaimed(boutId, winner, netAmount, burnAmount);
    }

    // ─── Claim as Bond ──────────────────────────────────────

    /**
     * @notice Winner creates an OTC bond from their payout (no burn, full value).
     */
    function claimAsBond(
        bytes32 boutId,
        uint256 escrowIdx,
        uint16  discountBps,
        uint256 expiryTimestamp
    ) external nonReentrant {
        _claimAsBond(boutId, escrowIdx, msg.sender, discountBps, expiryTimestamp);
    }

    /**
     * @notice Relay: backend creates bond on behalf of a winner.
     */
    function claimAsBondFor(
        bytes32 boutId,
        uint256 escrowIdx,
        address winner,
        uint16  discountBps,
        uint256 expiryTimestamp
    ) external onlyOwner nonReentrant {
        _claimAsBond(boutId, escrowIdx, winner, discountBps, expiryTimestamp);
    }

    function _claimAsBond(
        bytes32 boutId,
        uint256 escrowIdx,
        address winner,
        uint16  discountBps,
        uint256 expiryTimestamp
    ) internal {
        if (address(forgeBonds) == address(0)) revert ForgeBondsNotSet();

        Escrow storage escrow = _getEscrow(boutId, escrowIdx);
        if (escrow.claimed) revert AlreadyClaimed();
        if (escrow.winner != winner) revert NotWinner();

        escrow.claimed = true;

        // Approve ForgeBonds to pull the tokens
        IERC20(address(forgeToken)).approve(address(forgeBonds), escrow.amount);

        // Create bond — ForgeBonds will transferFrom this contract
        uint256 bondId = forgeBonds.createBond(
            winner,
            boutId,
            escrow.amount,
            discountBps,
            expiryTimestamp
        );

        emit BondCreated(boutId, winner, bondId, escrow.amount);
    }

    // ─── Views ──────────────────────────────────────────────

    function getEscrow(bytes32 boutId, uint256 escrowIdx) external view returns (Escrow memory) {
        return _getEscrow(boutId, escrowIdx);
    }

    function getEscrowCount(bytes32 boutId) external view returns (uint256) {
        return escrows[boutId].length;
    }

    function getEscrows(bytes32 boutId) external view returns (Escrow[] memory) {
        return escrows[boutId];
    }

    // ─── Internal ───────────────────────────────────────────

    function _getEscrow(bytes32 boutId, uint256 escrowIdx) internal view returns (Escrow storage) {
        Escrow[] storage list = escrows[boutId];
        if (escrowIdx >= list.length) revert EscrowNotFound();
        return list[escrowIdx];
    }
}
