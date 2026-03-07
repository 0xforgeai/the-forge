// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArenaVault
 * @notice Covenant-based staking vault for $FORGE.
 *         Implements: covenants (Flame/Steel/Obsidian/Eternal), loyalty multiplier,
 *         rage quit tax, 5-day vesting, and pro-rata yield distribution.
 *
 * @dev Uses a pull-based yield model (MasterChef-style rewardPerToken accumulator)
 *      instead of iterating all stakers. O(1) for deposits and claims.
 *
 * Fixes applied:
 *   C-2: Replaced unbounded distributeYield loop with rewardPerToken accumulator
 *   C-3: Replaced stakerCount + stakers[] array with simple activeStakerCount
 *   C-7: Fixed claimYield to calculate newlyVested only once
 */
contract ArenaVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ──────────────────────────────────────────────

    enum Covenant { FLAME, STEEL, OBSIDIAN, ETERNAL }

    struct CovenantConfig {
        uint32 lockDays;       // 1, 3, 7, 30
        uint16 apyBonusBps;    // 0, 5000, 15000, 30000 (basis points)
        uint16 rageQuitMulti;  // 100, 200, 300, 10000 (100 = 1x)
    }

    struct StakePosition {
        uint256 amount;             // staked principal
        uint256 unvestedRewards;    // pending vesting
        uint256 vestedRewards;      // claimable vested rewards
        uint256 vestingStart;       // when rewards started vesting
        uint256 totalEarned;        // lifetime earned
        uint256 totalTaxPaid;       // lifetime tax paid
        uint256 stakedAt;           // timestamp
        uint256 lockExpiresAt;      // timestamp
        uint256 lastYieldClaim;     // last time yield was claimed
        uint256 rewardDebt;         // accumulated rewardPerToken already accounted for
        Covenant covenant;
        bool active;
    }

    // ─── State ──────────────────────────────────────────────

    IERC20 public immutable forgeToken;

    mapping(address => StakePosition) public positions;

    // Covenant configs
    mapping(Covenant => CovenantConfig) public covenantConfigs;

    // Loyalty: days staked → multiplier (scaled by 100, e.g. 100 = 1.0x, 300 = 3.0x)
    uint16[6] public loyaltySchedule = [100, 120, 150, 200, 250, 300];

    // Rage quit tax: day index → base tax % (scaled by 100)
    uint16[7] public rageQuitTax = [5000, 4000, 3000, 2000, 1000, 500, 0];

    // Vesting
    uint32 public constant VESTING_DAYS = 5;

    // ─── Pull-based yield (MasterChef pattern) ──────────────

    /// @notice Accumulated reward per unit of weighted stake, scaled by 1e18
    uint256 public rewardPerTokenStored;

    /// @notice Total weighted stake across all active stakers
    uint256 public totalWeightedStake;

    // Stats
    uint256 public totalStaked;
    uint256 public totalBurned;
    uint256 public totalTaxCollected;
    uint256 public activeStakerCount;

    // ─── Events ─────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount, Covenant covenant, uint256 lockExpires);
    event Unstaked(address indexed user, uint256 returned, uint256 taxed, uint256 forfeitedRewards);
    event YieldDeposited(uint256 amount, uint256 newRewardPerToken);
    event YieldClaimed(address indexed user, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────

    error AlreadyStaked();
    error NotStaked();
    error InsufficientAmount();
    error LockNotExpired(uint256 expiresAt);
    error EternalCannotUnstake();
    error NothingToClaim();
    error NoStakersToReceive();

    // ─── Constructor ────────────────────────────────────────

    constructor(address _forgeToken, address _owner) Ownable(_owner) {
        forgeToken = IERC20(_forgeToken);

        covenantConfigs[Covenant.FLAME]    = CovenantConfig({ lockDays: 1,  apyBonusBps: 0,     rageQuitMulti: 100 });
        covenantConfigs[Covenant.STEEL]    = CovenantConfig({ lockDays: 3,  apyBonusBps: 5000,  rageQuitMulti: 200 });
        covenantConfigs[Covenant.OBSIDIAN] = CovenantConfig({ lockDays: 7,  apyBonusBps: 15000, rageQuitMulti: 300 });
        covenantConfigs[Covenant.ETERNAL]  = CovenantConfig({ lockDays: 30, apyBonusBps: 30000, rageQuitMulti: 10000 });
    }

    // ─── Stake ──────────────────────────────────────────────

    function stake(uint256 amount, Covenant covenant) external nonReentrant {
        if (positions[msg.sender].active) revert AlreadyStaked();
        if (amount == 0) revert InsufficientAmount();

        CovenantConfig memory cfg = covenantConfigs[covenant];
        uint256 lockExpires = block.timestamp + (uint256(cfg.lockDays) * 1 days);

        forgeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 weight = _calcWeight(amount, 0, cfg.apyBonusBps);

        positions[msg.sender] = StakePosition({
            amount: amount,
            unvestedRewards: 0,
            vestedRewards: 0,
            vestingStart: 0,
            totalEarned: 0,
            totalTaxPaid: 0,
            stakedAt: block.timestamp,
            lockExpiresAt: lockExpires,
            lastYieldClaim: block.timestamp,
            rewardDebt: (weight * rewardPerTokenStored) / 1e18,
            covenant: covenant,
            active: true
        });

        totalWeightedStake += weight;
        totalStaked += amount;
        activeStakerCount++;

        emit Staked(msg.sender, amount, covenant, lockExpires);
    }

    // ─── Unstake ────────────────────────────────────────────

    function unstake() external nonReentrant {
        StakePosition storage pos = positions[msg.sender];
        if (!pos.active) revert NotStaked();

        CovenantConfig memory cfg = covenantConfigs[pos.covenant];

        // ETERNAL: can unstake only AFTER lock period
        if (pos.covenant == Covenant.ETERNAL && block.timestamp < pos.lockExpiresAt) {
            revert EternalCannotUnstake();
        }

        // Lock period check for all covenants
        if (block.timestamp < pos.lockExpiresAt) {
            revert LockNotExpired(pos.lockExpiresAt);
        }

        // Settle pending yield before unstaking
        _settleYield(msg.sender);

        // Calculate rage quit tax
        uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
        uint256 taxPct = _getRageQuitTaxPct(daysStaked, cfg.rageQuitMulti);
        uint256 taxAmount = (pos.amount * taxPct) / 10000;
        uint256 returnAmount = pos.amount - taxAmount;

        // Forfeit unvested rewards
        uint256 forfeitedRewards = pos.unvestedRewards;

        // Remove weight
        uint256 loyaltyMulti = _getLoyaltyMultiplier(daysStaked);
        uint256 weight = _calcWeight(pos.amount, loyaltyMulti, cfg.apyBonusBps);
        if (totalWeightedStake >= weight) {
            totalWeightedStake -= weight;
        } else {
            totalWeightedStake = 0;
        }

        // Collect any vested rewards
        uint256 newlyVested = _calcVestedAmount(pos);
        uint256 vestedToClaim = pos.vestedRewards + newlyVested;

        // Update state
        pos.active = false;
        pos.totalTaxPaid += taxAmount;
        pos.unvestedRewards = 0;
        pos.vestedRewards = 0;
        pos.rewardDebt = 0;
        totalStaked -= pos.amount;
        activeStakerCount--;

        // Transfer tokens
        if (returnAmount + vestedToClaim > 0) {
            forgeToken.safeTransfer(msg.sender, returnAmount + vestedToClaim);
        }

        // Tax redistributed via accumulator to remaining stakers
        if (taxAmount > 0 && totalWeightedStake > 0) {
            rewardPerTokenStored += (taxAmount * 1e18) / totalWeightedStake;
            totalTaxCollected += taxAmount;
        } else if (taxAmount > 0) {
            totalBurned += taxAmount;
        }

        // Forfeited rewards also redistributed
        if (forfeitedRewards > 0 && totalWeightedStake > 0) {
            rewardPerTokenStored += (forfeitedRewards * 1e18) / totalWeightedStake;
        }

        emit Unstaked(msg.sender, returnAmount + vestedToClaim, taxAmount, forfeitedRewards);
    }

    // ─── Deposit Yield (Owner) ──────────────────────────────

    /**
     * @notice Owner deposits yield (from bout rake, treasury emissions, etc.)
     *         O(1) — updates the global rewardPerToken accumulator.
     */
    function depositYield(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert InsufficientAmount();
        if (totalWeightedStake == 0) revert NoStakersToReceive();

        forgeToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPerTokenStored += (amount * 1e18) / totalWeightedStake;

        emit YieldDeposited(amount, rewardPerTokenStored);
    }

    /**
     * @notice Claim vested rewards. Settles pending accumulator yield first.
     *         C-7 fix: newlyVested calculated exactly once.
     */
    function claimYield() external nonReentrant {
        StakePosition storage pos = positions[msg.sender];
        if (!pos.active) revert NotStaked();

        // Settle pending yield from accumulator
        _settleYield(msg.sender);

        // Calculate newly vested — single calculation (C-7 fix)
        uint256 newlyVested = _calcVestedAmount(pos);
        uint256 totalClaim = pos.vestedRewards + newlyVested;
        if (totalClaim == 0) revert NothingToClaim();

        // Update state
        pos.unvestedRewards -= newlyVested;
        pos.vestedRewards = 0;

        // Reset vesting clock for remaining unvested
        if (pos.unvestedRewards > 0) {
            pos.vestingStart = block.timestamp;
        } else {
            pos.vestingStart = 0;
        }

        forgeToken.safeTransfer(msg.sender, totalClaim);
        emit YieldClaimed(msg.sender, totalClaim);
    }

    // ─── Internal: Settle yield from accumulator ────────────

    function _settleYield(address user) internal {
        StakePosition storage pos = positions[user];
        if (!pos.active) return;

        CovenantConfig memory cfg = covenantConfigs[pos.covenant];
        uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
        uint256 loyaltyMulti = _getLoyaltyMultiplier(daysStaked);
        uint256 weight = _calcWeight(pos.amount, loyaltyMulti, cfg.apyBonusBps);

        uint256 pending = (weight * rewardPerTokenStored / 1e18) - pos.rewardDebt;

        if (pending > 0) {
            // Vest any existing unvested first
            uint256 newlyVested = _calcVestedAmount(pos);
            pos.vestedRewards += newlyVested;
            pos.unvestedRewards = pos.unvestedRewards - newlyVested + pending;
            pos.vestingStart = block.timestamp;
            pos.totalEarned += pending;
            pos.lastYieldClaim = block.timestamp;
        }

        // Always update debt to current accumulator
        pos.rewardDebt = (weight * rewardPerTokenStored) / 1e18;
    }

    // ─── Views ──────────────────────────────────────────────

    function getPosition(address user) external view returns (StakePosition memory) {
        return positions[user];
    }

    function getLoyaltyMultiplier(address user) external view returns (uint256) {
        StakePosition memory pos = positions[user];
        if (!pos.active) return 100;
        uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
        return _getLoyaltyMultiplier(daysStaked);
    }

    function getRageQuitCost(address user) external view returns (uint256 taxAmount, uint256 returnAmount) {
        StakePosition memory pos = positions[user];
        if (!pos.active) return (0, 0);
        CovenantConfig memory cfg = covenantConfigs[pos.covenant];
        uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
        uint256 taxPct = _getRageQuitTaxPct(daysStaked, cfg.rageQuitMulti);
        taxAmount = (pos.amount * taxPct) / 10000;
        returnAmount = pos.amount - taxAmount;
    }

    function getClaimable(address user) external view returns (uint256) {
        StakePosition memory pos = positions[user];
        if (!pos.active) return 0;
        return pos.vestedRewards + _calcVestedAmount(pos);
    }

    function getPendingYield(address user) external view returns (uint256) {
        StakePosition memory pos = positions[user];
        if (!pos.active) return 0;
        CovenantConfig memory cfg = covenantConfigs[pos.covenant];
        uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
        uint256 loyaltyMulti = _getLoyaltyMultiplier(daysStaked);
        uint256 weight = _calcWeight(pos.amount, loyaltyMulti, cfg.apyBonusBps);
        uint256 owed = (weight * rewardPerTokenStored) / 1e18;
        return owed > pos.rewardDebt ? owed - pos.rewardDebt : 0;
    }

    function getStakerCount() external view returns (uint256) {
        return activeStakerCount;
    }

    // ─── Internal ───────────────────────────────────────────

    function _getLoyaltyMultiplier(uint256 daysStaked) internal view returns (uint256) {
        uint256 idx = daysStaked;
        if (idx >= loyaltySchedule.length) idx = loyaltySchedule.length - 1;
        return uint256(loyaltySchedule[idx]);
    }

    function _getRageQuitTaxPct(uint256 daysStaked, uint16 covenantMulti) internal view returns (uint256) {
        uint256 idx = daysStaked;
        if (idx >= rageQuitTax.length) idx = rageQuitTax.length - 1;
        uint256 baseTax = uint256(rageQuitTax[idx]);
        uint256 tax = (baseTax * uint256(covenantMulti)) / 100;
        if (tax > 10000) tax = 10000;
        return tax;
    }

    function _calcWeight(uint256 amount, uint256 loyaltyMulti, uint16 apyBonusBps) internal pure returns (uint256) {
        if (loyaltyMulti == 0) loyaltyMulti = 100;
        uint256 bonusMulti = 10000 + uint256(apyBonusBps);
        return (amount * loyaltyMulti * bonusMulti) / (100 * 10000);
    }

    function _calcVestedAmount(StakePosition memory pos) internal view returns (uint256) {
        if (pos.unvestedRewards == 0 || pos.vestingStart == 0) return 0;

        uint256 elapsed = block.timestamp - pos.vestingStart;
        uint256 vestingPeriod = uint256(VESTING_DAYS) * 1 days;

        if (elapsed >= vestingPeriod) {
            return pos.unvestedRewards;
        }

        return (pos.unvestedRewards * elapsed) / vestingPeriod;
    }
}
