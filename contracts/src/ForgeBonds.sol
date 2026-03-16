// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ForgeBonds
 * @notice On-chain OTC bond marketplace with lazy yield accrual.
 *
 *         Key design:
 *           - APR is IMMUTABLE per bond (snapshot from getCurrentAprBps() at creation)
 *           - Yield accrues continuously, calculated lazily at interaction time
 *           - No cron/keeper needed — same pattern as Compound/Aave
 *           - Yield is funded from a yieldPool (funded by treasury/rake)
 *           - Bonds can be partially filled (buyer purchases a portion)
 *
 *         Bootstrap APR schedule:
 *           - First N days: high APR per tier (e.g. 2000% day 1-7, 1000% day 8-14...)
 *           - After schedule ends: falls to baseAprBps (e.g. 5%)
 *           - Each bond locks the APR at creation — no silent overwrite
 */
contract ForgeBonds is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ──────────────────────────────────────────────

    struct AprTier {
        uint32 dayStart;   // inclusive (0-indexed from launch)
        uint32 dayEnd;     // exclusive
        uint32 aprBps;     // basis points (200000 = 2000%)
    }

    struct Bond {
        address creator;
        bytes32 boutId;
        uint256 faceValue;          // original total value
        uint256 remainingValue;     // unsold portion
        uint16  discountBps;        // e.g. 1000 = 10% discount for buyer
        uint32  aprBps;             // IMMUTABLE — snapshot at creation
        uint256 accruedYield;       // last-calculated accrued amount
        uint256 lastYieldAt;        // timestamp of last accrual calc
        uint256 createdAt;          // timestamp of creation
        uint256 expiresAt;          // expiry timestamp
        bool    expired;
    }

    // ─── State ──────────────────────────────────────────────

    ERC20Burnable public forgeToken;
    uint256 public immutable launchTimestamp;

    AprTier[] public aprSchedule;
    uint32 public baseAprBps;       // post-bootstrap rate (e.g. 500 = 5%)

    mapping(uint256 => Bond) public bonds;
    uint256 public nextBondId;

    /// @notice Tokens available to pay yield claims
    uint256 public yieldPool;

    /// @notice Track all active bond IDs for enumeration
    uint256[] public activeBondIds;
    mapping(uint256 => uint256) private _activeBondIndex; // bondId => index in activeBondIds

    // ─── Events ─────────────────────────────────────────────

    event BondListed(uint256 indexed bondId, address indexed creator, bytes32 indexed boutId, uint256 faceValue, uint16 discountBps, uint32 aprBps, uint256 expiresAt);
    event BondPurchased(uint256 indexed bondId, address indexed buyer, uint256 amount, uint256 pricePaid);
    event YieldClaimed(uint256 indexed bondId, address indexed creator, uint256 amount);
    event BondExpired(uint256 indexed bondId, uint256 returnedToCreator, uint256 yieldPaid);
    event YieldPoolFunded(address indexed funder, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────

    error BondNotFound();
    error BondAlreadyExpired();
    error BondNotExpired();
    error NotBondCreator();
    error InsufficientAmount();
    error InsufficientYieldPool();
    error BondStillActive();

    // ─── Constructor ────────────────────────────────────────

    /**
     * @param _forgeToken     ForgeToken address
     * @param _launchTimestamp Unix timestamp of launch (for APR schedule)
     * @param _baseAprBps     Post-bootstrap APR in basis points (500 = 5%)
     * @param _owner          Owner address
     */
    constructor(
        address _forgeToken,
        uint256 _launchTimestamp,
        uint32  _baseAprBps,
        address _owner
    ) Ownable(_owner) {
        if (_forgeToken != address(0)) {
            forgeToken = ERC20Burnable(_forgeToken);
        }
        launchTimestamp = _launchTimestamp;
        baseAprBps = _baseAprBps;
    }

    /// @notice One-time setter for forgeToken. Cannot be called once set.
    function setForgeToken(address _forgeToken) external onlyOwner {
        require(address(forgeToken) == address(0), "Token already set");
        require(_forgeToken != address(0), "Zero address");
        forgeToken = ERC20Burnable(_forgeToken);
    }

    // ─── Admin ──────────────────────────────────────────────

    /**
     * @notice Set the bootstrap APR schedule. Can only be called once (or by owner to update pre-launch).
     * @param tiers Array of AprTier structs defining the schedule
     */
    function setAprSchedule(AprTier[] calldata tiers) external onlyOwner {
        delete aprSchedule;
        for (uint256 i = 0; i < tiers.length; i++) {
            aprSchedule.push(tiers[i]);
        }
    }

    /**
     * @notice Fund the yield pool. Anyone can call (treasury, rake, donations).
     */
    function fundYieldPool(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        IERC20(address(forgeToken)).safeTransferFrom(msg.sender, address(this), amount);
        yieldPool += amount;
        emit YieldPoolFunded(msg.sender, amount);
    }

    // ─── Create Bond ────────────────────────────────────────

    /**
     * @notice Create a new bond. Called by VictoryEscrow when winner chooses OTC path.
     *         Tokens are transferred from msg.sender (VictoryEscrow) to this contract.
     * @param creator    The bond creator (winner)
     * @param boutId     The bout this bond originated from
     * @param faceValue  Total face value of the bond
     * @param discountBps Discount offered to buyers (e.g. 1000 = 10%)
     * @param expiresAt  Expiry timestamp
     * @return bondId    The new bond's ID
     */
    function createBond(
        address creator,
        bytes32 boutId,
        uint256 faceValue,
        uint16  discountBps,
        uint256 expiresAt
    ) external returns (uint256 bondId) {
        require(faceValue > 0, "Face value must be > 0");
        require(expiresAt > block.timestamp, "Expiry must be in the future");
        require(discountBps <= 5000, "Discount too high"); // cap at 50%

        // Transfer tokens from caller (VictoryEscrow)
        IERC20(address(forgeToken)).safeTransferFrom(msg.sender, address(this), faceValue);

        bondId = nextBondId++;
        uint32 currentApr = getCurrentAprBps();

        bonds[bondId] = Bond({
            creator: creator,
            boutId: boutId,
            faceValue: faceValue,
            remainingValue: faceValue,
            discountBps: discountBps,
            aprBps: currentApr,        // IMMUTABLE snapshot
            accruedYield: 0,
            lastYieldAt: block.timestamp,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            expired: false
        });

        // Track as active
        _activeBondIndex[bondId] = activeBondIds.length;
        activeBondIds.push(bondId);

        emit BondListed(bondId, creator, boutId, faceValue, discountBps, currentApr, expiresAt);
    }

    // ─── Buy Bond ───────────────────────────────────────────

    /**
     * @notice Buy all or part of a bond. Buyer pays discounted price, receives face value portion.
     */
    function buyBond(uint256 bondId, uint256 amount) external nonReentrant {
        _buyBond(bondId, amount, msg.sender);
    }

    /**
     * @notice Relay: backend buys bond on behalf of a user.
     */
    function buyBondFor(uint256 bondId, uint256 amount, address buyer) external onlyOwner nonReentrant {
        _buyBond(bondId, amount, buyer);
    }

    function _buyBond(uint256 bondId, uint256 amount, address buyer) internal {
        Bond storage bond = bonds[bondId];
        if (bond.faceValue == 0) revert BondNotFound();
        if (bond.expired) revert BondAlreadyExpired();
        if (amount == 0 || amount > bond.remainingValue) revert InsufficientAmount();

        // Lazy accrue yield before state change
        _accrueYield(bondId);

        // Calculate discounted price: buyer pays less than face value
        uint256 discountedPrice = amount - ((amount * bond.discountBps) / 10000);

        // Buyer pays discounted price
        IERC20(address(forgeToken)).safeTransferFrom(buyer, address(this), discountedPrice);

        // Transfer face value portion to buyer (from tokens held in contract)
        IERC20(address(forgeToken)).safeTransfer(buyer, amount);

        // The discount cost (amount - discountedPrice) is absorbed by the bond creator
        // (they listed at a discount to sell faster)

        bond.remainingValue -= amount;

        // If fully sold, remove from active list
        if (bond.remainingValue == 0) {
            _removeFromActive(bondId);
        }

        emit BondPurchased(bondId, buyer, amount, discountedPrice);
    }

    // ─── Claim Yield ────────────────────────────────────────

    /**
     * @notice Creator claims accrued yield on their bond.
     */
    function claimYield(uint256 bondId) external nonReentrant {
        _claimYield(bondId, msg.sender);
    }

    /**
     * @notice Relay: backend claims yield on behalf of creator.
     */
    function claimYieldFor(uint256 bondId, address creator) external onlyOwner nonReentrant {
        _claimYield(bondId, creator);
    }

    function _claimYield(uint256 bondId, address creator) internal {
        Bond storage bond = bonds[bondId];
        if (bond.faceValue == 0) revert BondNotFound();
        if (bond.creator != creator) revert NotBondCreator();

        // Lazy accrue
        _accrueYield(bondId);

        uint256 claimable = bond.accruedYield;
        if (claimable == 0) revert InsufficientAmount();

        // Cap by yield pool
        if (claimable > yieldPool) {
            claimable = yieldPool;
        }

        bond.accruedYield -= claimable;
        yieldPool -= claimable;

        IERC20(address(forgeToken)).safeTransfer(creator, claimable);

        emit YieldClaimed(bondId, creator, claimable);
    }

    // ─── Expire Bond ────────────────────────────────────────

    /**
     * @notice Expire a bond past its expiry. Returns remaining value + accrued yield to creator.
     *         Anyone can call this (public service — contracts can't self-execute).
     */
    function expireBond(uint256 bondId) external nonReentrant {
        Bond storage bond = bonds[bondId];
        if (bond.faceValue == 0) revert BondNotFound();
        if (bond.expired) revert BondAlreadyExpired();
        if (block.timestamp < bond.expiresAt) revert BondNotExpired();

        // Final lazy accrue (caps at expiry time)
        _accrueYield(bondId);

        bond.expired = true;

        uint256 yieldPayout = bond.accruedYield;
        if (yieldPayout > yieldPool) {
            yieldPayout = yieldPool;
        }

        uint256 returnToCreator = bond.remainingValue + yieldPayout;
        bond.accruedYield = 0;
        bond.remainingValue = 0;
        yieldPool -= yieldPayout;

        _removeFromActive(bondId);

        if (returnToCreator > 0) {
            IERC20(address(forgeToken)).safeTransfer(bond.creator, returnToCreator);
        }

        emit BondExpired(bondId, returnToCreator, yieldPayout);
    }

    // ─── Lazy Yield Accrual ─────────────────────────────────

    /**
     * @dev Called before any state change on a bond.
     *      Calculates time-weighted yield based on remainingValue and immutable APR.
     *      Same pattern as Compound/Aave interest accrual.
     */
    function _accrueYield(uint256 bondId) internal {
        Bond storage bond = bonds[bondId];
        if (bond.remainingValue == 0 || bond.expired) return;

        uint256 elapsed = block.timestamp - bond.lastYieldAt;
        if (elapsed == 0) return;

        // Cap elapsed at expiry
        if (block.timestamp > bond.expiresAt) {
            elapsed = bond.expiresAt - bond.lastYieldAt;
        }

        // yield = remainingValue * aprBps / 10000 * elapsed / 365 days
        uint256 yieldAmount = (bond.remainingValue * uint256(bond.aprBps) * elapsed) / (10000 * 365 days);

        bond.accruedYield += yieldAmount;
        bond.lastYieldAt = block.timestamp > bond.expiresAt ? bond.expiresAt : block.timestamp;
    }

    // ─── Views ──────────────────────────────────────────────

    /**
     * @notice Get current APR based on how many days since launch.
     *         Walks the bootstrap schedule, falls back to baseAprBps.
     */
    function getCurrentAprBps() public view returns (uint32) {
        if (block.timestamp < launchTimestamp) return baseAprBps;

        uint256 daysSinceLaunch = (block.timestamp - launchTimestamp) / 1 days;

        for (uint256 i = 0; i < aprSchedule.length; i++) {
            if (daysSinceLaunch >= aprSchedule[i].dayStart && daysSinceLaunch < aprSchedule[i].dayEnd) {
                return aprSchedule[i].aprBps;
            }
        }

        return baseAprBps;
    }

    /**
     * @notice Calculate pending yield for a bond without modifying state.
     */
    function pendingYield(uint256 bondId) external view returns (uint256) {
        Bond memory bond = bonds[bondId];
        if (bond.remainingValue == 0 || bond.expired) return bond.accruedYield;

        uint256 elapsed = block.timestamp - bond.lastYieldAt;
        if (elapsed == 0) return bond.accruedYield;

        if (block.timestamp > bond.expiresAt) {
            elapsed = bond.expiresAt - bond.lastYieldAt;
        }

        uint256 yieldAmount = (bond.remainingValue * uint256(bond.aprBps) * elapsed) / (10000 * 365 days);
        return bond.accruedYield + yieldAmount;
    }

    function getBond(uint256 bondId) external view returns (Bond memory) {
        return bonds[bondId];
    }

    function getActiveBonds() external view returns (uint256[] memory) {
        return activeBondIds;
    }

    function getAprScheduleLength() external view returns (uint256) {
        return aprSchedule.length;
    }

    // ─── Internal ───────────────────────────────────────────

    function _removeFromActive(uint256 bondId) internal {
        uint256 idx = _activeBondIndex[bondId];
        uint256 lastIdx = activeBondIds.length - 1;

        if (idx != lastIdx) {
            uint256 lastBondId = activeBondIds[lastIdx];
            activeBondIds[idx] = lastBondId;
            _activeBondIndex[lastBondId] = idx;
        }

        activeBondIds.pop();
        delete _activeBondIndex[bondId];
    }
}
