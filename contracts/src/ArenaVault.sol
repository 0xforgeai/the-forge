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
 */
contract ArenaVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ──────────────────────────────────────────────

    enum Covenant { FLAME, STEEL, OBSIDIAN, ETERNAL }

    struct CovenantConfig {
        uint32 lockDays;       // 1, 3, 7, 30
        uint16 apyBonusBps;    // 0, 5000, 15000, 30000 (basis points)
        uint16 rageQuitMulti;  // 100, 200, 300, 10000 (100 = 1x, 10000 = can't unstake)
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
        Covenant covenant;
        bool active;
    }

    // ─── State ──────────────────────────────────────────────

    IERC20 public immutable forgeToken;

    mapping(address => StakePosition) public positions;
    address[] public stakers;
    mapping(address => bool) public isStaker;

    // Covenant configs
    mapping(Covenant => CovenantConfig) public covenantConfigs;

    // Loyalty: days staked → multiplier (scaled by 100, e.g. 100 = 1.0x, 300 = 3.0x)
    uint16[6] public loyaltySchedule = [100, 120, 150, 200, 250, 300];

    // Rage quit tax: day index → base tax % (scaled by 100)
    uint16[7] public rageQuitTax = [5000, 4000, 3000, 2000, 1000, 500, 0];

    // Vesting
    uint32 public constant VESTING_DAYS = 5;

    // Yield pool: accumulated yield to distribute
    uint256 public yieldPool;

    // Total weighted stake (for pro-rata yield)
    uint256 public totalWeightedStake;

    // Stats
    uint256 public totalStaked;
    uint256 public totalBurned;
    uint256 public totalTaxCollected;
    uint256 public stakerCount;

    // ─── Events ─────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount, Covenant covenant, uint256 lockExpires);
    event Unstaked(address indexed user, uint256 returned, uint256 taxed, uint256 forfeitedRewards);
    event YieldDeposited(uint256 amount);
    event YieldClaimed(address indexed user, uint256 amount);
    event RewardsVested(address indexed user, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────

    error AlreadyStaked();
    error NotStaked();
    error InsufficientAmount();
    error LockNotExpired(uint256 expiresAt);
    error EternalCannotUnstake();
    error NothingToClaim();

    // ─── Constructor ────────────────────────────────────────

    constructor(address _forgeToken, address _owner) Ownable(_owner) {
        forgeToken = IERC20(_forgeToken);

        // Configure covenants
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
            covenant: covenant,
            active: true
        });

        if (!isStaker[msg.sender]) {
            stakers.push(msg.sender);
            isStaker[msg.sender] = true;
        }

        uint256 weight = _calcWeight(amount, 0, cfg.apyBonusBps);
        totalWeightedStake += weight;
        totalStaked += amount;
        stakerCount++;

        emit Staked(msg.sender, amount, covenant, lockExpires);
    }

    // ─── Unstake ────────────────────────────────────────────

    function unstake() external nonReentrant {
        StakePosition storage pos = positions[msg.sender];
        if (!pos.active) revert NotStaked();

        CovenantConfig memory cfg = covenantConfigs[pos.covenant];

        // Eternal check
        if (pos.covenant == Covenant.ETERNAL && block.timestamp < pos.lockExpiresAt) {
            revert EternalCannotUnstake();
        }

        // Lock period check
        if (block.timestamp < pos.lockExpiresAt) {
            revert LockNotExpired(pos.lockExpiresAt);
        }

        // Calculate rage quit tax
        uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
        uint256 taxPct = _getRageQuitTaxPct(daysStaked, cfg.rageQuitMulti);
        uint256 taxAmount = (pos.amount * taxPct) / 10000;
        uint256 returnAmount = pos.amount - taxAmount;

        // Forfeit unvested rewards
        uint256 forfeitedRewards = pos.unvestedRewards;

        // Remove weight before modifying
        uint256 loyaltyMulti = _getLoyaltyMultiplier(daysStaked);
        uint256 weight = _calcWeight(pos.amount, loyaltyMulti, cfg.apyBonusBps);
        if (totalWeightedStake >= weight) {
            totalWeightedStake -= weight;
        } else {
            totalWeightedStake = 0;
        }

        // Vest any remaining claimable
        uint256 vestedToClaim = pos.vestedRewards + _calcVestedAmount(pos);

        // Update state
        pos.active = false;
        pos.totalTaxPaid += taxAmount;
        totalStaked -= pos.amount;
        stakerCount--;

        // Transfer tokens
        if (returnAmount + vestedToClaim > 0) {
            forgeToken.safeTransfer(msg.sender, returnAmount + vestedToClaim);
        }

        // Tax goes back to yield pool for remaining stakers
        if (taxAmount > 0) {
            yieldPool += taxAmount;
            totalTaxCollected += taxAmount;
        }

        // Forfeited rewards go back to yield pool
        if (forfeitedRewards > 0) {
            yieldPool += forfeitedRewards;
        }

        emit Unstaked(msg.sender, returnAmount + vestedToClaim, taxAmount, forfeitedRewards);
    }

    // ─── Deposit Yield (Owner) ──────────────────────────────

    /**
     * @notice Owner deposits yield (from bout rake, treasury emissions, etc.)
     *         Tokens are distributed pro-rata to stakers based on weighted stake.
     */
    function depositYield(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert InsufficientAmount();
        forgeToken.safeTransferFrom(msg.sender, address(this), amount);
        yieldPool += amount;
        emit YieldDeposited(amount);
    }

    /**
     * @notice Distribute accumulated yield pool to all active stakers.
     *         Called periodically by owner (e.g., after each bout).
     */
    function distributeYield() external onlyOwner {
        if (yieldPool == 0 || totalWeightedStake == 0) return;

        uint256 pool = yieldPool;
        yieldPool = 0;

        for (uint256 i = 0; i < stakers.length; i++) {
            StakePosition storage pos = positions[stakers[i]];
            if (!pos.active) continue;

            CovenantConfig memory cfg = covenantConfigs[pos.covenant];
            uint256 daysStaked = (block.timestamp - pos.stakedAt) / 1 days;
            uint256 loyaltyMulti = _getLoyaltyMultiplier(daysStaked);
            uint256 weight = _calcWeight(pos.amount, loyaltyMulti, cfg.apyBonusBps);

            uint256 share = (pool * weight) / totalWeightedStake;
            if (share == 0) continue;

            // Add to unvested rewards (vest over 5 days)
            // First, vest any existing unvested
            uint256 newlyVested = _calcVestedAmount(pos);
            pos.vestedRewards += newlyVested;

            pos.unvestedRewards = pos.unvestedRewards - newlyVested + share;
            pos.vestingStart = block.timestamp;
            pos.totalEarned += share;
            pos.lastYieldClaim = block.timestamp;

            // Update loyalty for weight tracking
            uint256 newWeight = _calcWeight(pos.amount, loyaltyMulti, cfg.apyBonusBps);
            totalWeightedStake = totalWeightedStake - weight + newWeight;
        }
    }

    /**
     * @notice Claim vested rewards.
     */
    function claimYield() external nonReentrant {
        StakePosition storage pos = positions[msg.sender];
        if (!pos.active) revert NotStaked();

        uint256 vested = pos.vestedRewards + _calcVestedAmount(pos);
        if (vested == 0) revert NothingToClaim();

        // Update unvested
        uint256 newlyVested = _calcVestedAmount(pos);
        pos.unvestedRewards -= newlyVested;
        pos.vestedRewards = 0;

        forgeToken.safeTransfer(msg.sender, vested);
        emit YieldClaimed(msg.sender, vested);
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

    function getStakerCount() external view returns (uint256) {
        return stakerCount;
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
        if (tax > 10000) tax = 10000; // cap at 100%
        return tax;
    }

    function _calcWeight(uint256 amount, uint256 loyaltyMulti, uint16 apyBonusBps) internal pure returns (uint256) {
        // weight = amount × (loyaltyMulti / 100) × (1 + apyBonus / 10000)
        // Simplified with fixed point:
        if (loyaltyMulti == 0) loyaltyMulti = 100; // default 1.0x
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
