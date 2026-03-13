// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IArenaVault {
    function depositYield(uint256 amount) external;
}

/**
 * @title ForgeArena
 * @notice On-chain bout lifecycle: entry fees, bets, burns, payouts.
 *
 *         Flow:
 *         1. Owner creates a bout with entry fee + config
 *         2. Agents call enterBout() — $FORGE transferred in, % burned
 *         3. Anyone calls placeBet() — $FORGE transferred in, % burned
 *         4. Owner calls resolveBout() with placements
 *         5. Winners call claimPayout() / claimBetPayout() (pull pattern)
 *
 *         Burns are real on-chain ERC20Burnable.burn() calls.
 *         Rake split: 50% → ArenaVault (staker yield), 50% → protocol treasury.
 */
contract ForgeArena is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ──────────────────────────────────────────────

    enum BoutStatus { NONE, OPEN, LIVE, RESOLVED, CANCELLED }

    struct BoutConfig {
        uint256 entryFee;             // $FORGE to enter
        uint16  entryBurnBps;         // burn % on entry fee (1000 = 10%)
        uint16  betBurnBps;           // burn % on bets (200 = 2%)
        uint16  protocolRakeBps;      // protocol rake on bet pool (500 = 5%)
        uint16  agentPurseBps;        // agent share of bet pool (2000 = 20%)
        uint16  bettorPoolBps;        // bettor share of bet pool (7500 = 75%)
        uint8   maxEntrants;          // max agents per bout
    }

    struct Bout {
        bytes32       id;
        BoutStatus    status;
        BoutConfig    config;
        uint256       totalEntryPool;   // net entry fees (after burn)
        uint256       totalBetPool;     // net bets (after burn)
        uint256       totalBurned;      // total burned in this bout
        uint8         entrantCount;
        bool          resolved;
    }

    struct Entrant {
        address wallet;
        uint256 feePaid;
        uint8   placement;  // 0 = unranked, 1 = 1st, 2 = 2nd, 3 = 3rd
        uint256 payout;
        bool    claimed;
    }

    struct Bet {
        address bettor;
        uint8   entrantIdx;  // index into bout's entrant array
        uint256 amount;      // net amount (after burn)
        uint256 payout;
        bool    claimed;
    }

    // ─── State ──────────────────────────────────────────────

    ERC20Burnable public immutable forgeToken;
    IArenaVault   public arenaVault;
    address       public treasury;

    mapping(bytes32 => Bout) public bouts;
    mapping(bytes32 => Entrant[]) public boutEntrants;
    mapping(bytes32 => Bet[]) public boutBets;
    mapping(bytes32 => mapping(address => bool)) public hasEntered;
    mapping(bytes32 => mapping(address => bool)) public hasBet;

    uint256 public totalBoutsCreated;
    uint256 public totalBurned;
    uint256 public totalRakeToVault;

    // ─── Events ─────────────────────────────────────────────

    event BoutCreated(bytes32 indexed boutId, uint256 entryFee, uint8 maxEntrants);
    event BoutEntered(bytes32 indexed boutId, address indexed agent, uint256 feePaid, uint256 burned);
    event BetPlaced(bytes32 indexed boutId, address indexed bettor, uint8 entrantIdx, uint256 amount, uint256 burned);
    event BoutResolved(bytes32 indexed boutId, uint256 agentPurse, uint256 bettorPool, uint256 rakeToVault, uint256 rakeToProtocol);
    event PayoutClaimed(bytes32 indexed boutId, address indexed claimant, uint256 amount);
    event BoutCancelled(bytes32 indexed boutId);

    // ─── Errors ─────────────────────────────────────────────

    error BoutNotFound();
    error BoutNotOpen();
    error BoutNotLive();
    error BoutNotResolved();
    error BoutFull();
    error AlreadyEntered();
    error AlreadyBet();
    error NothingToClaim();
    error BoutAlreadyResolved();

    // ─── Constructor ────────────────────────────────────────

    constructor(
        address _forgeToken,
        address _arenaVault,
        address _treasury,
        address _owner
    ) Ownable(_owner) {
        forgeToken = ERC20Burnable(_forgeToken);
        arenaVault = IArenaVault(_arenaVault);
        treasury = _treasury;
    }

    // ─── Admin ──────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setArenaVault(address _vault) external onlyOwner {
        arenaVault = IArenaVault(_vault);
    }

    // ─── Create Bout ────────────────────────────────────────

    function createBout(
        bytes32 boutId,
        uint256 entryFee,
        uint16  entryBurnBps,
        uint16  betBurnBps,
        uint16  protocolRakeBps,
        uint16  agentPurseBps,
        uint16  bettorPoolBps,
        uint8   maxEntrants
    ) external onlyOwner {
        require(bouts[boutId].status == BoutStatus.NONE, "Bout already exists");
        require(protocolRakeBps + agentPurseBps + bettorPoolBps == 10000, "Bps must sum to 10000");

        bouts[boutId] = Bout({
            id: boutId,
            status: BoutStatus.OPEN,
            config: BoutConfig({
                entryFee: entryFee,
                entryBurnBps: entryBurnBps,
                betBurnBps: betBurnBps,
                protocolRakeBps: protocolRakeBps,
                agentPurseBps: agentPurseBps,
                bettorPoolBps: bettorPoolBps,
                maxEntrants: maxEntrants
            }),
            totalEntryPool: 0,
            totalBetPool: 0,
            totalBurned: 0,
            entrantCount: 0,
            resolved: false
        });

        totalBoutsCreated++;
        emit BoutCreated(boutId, entryFee, maxEntrants);
    }

    // ─── Set Bout Live ──────────────────────────────────────

    function setBoutLive(bytes32 boutId) external onlyOwner {
        Bout storage bout = bouts[boutId];
        if (bout.status != BoutStatus.OPEN) revert BoutNotOpen();
        bout.status = BoutStatus.LIVE;
    }

    // ─── Cancel Bout ────────────────────────────────────────

    function cancelBout(bytes32 boutId) external onlyOwner {
        Bout storage bout = bouts[boutId];
        require(bout.status == BoutStatus.OPEN || bout.status == BoutStatus.LIVE, "Cannot cancel");
        bout.status = BoutStatus.CANCELLED;

        Entrant[] storage entrants = boutEntrants[boutId];
        for (uint256 i = 0; i < entrants.length; i++) {
            if (entrants[i].feePaid > 0) {
                IERC20(address(forgeToken)).safeTransfer(entrants[i].wallet, entrants[i].feePaid);
            }
        }

        Bet[] storage betList = boutBets[boutId];
        for (uint256 i = 0; i < betList.length; i++) {
            if (betList[i].amount > 0) {
                IERC20(address(forgeToken)).safeTransfer(betList[i].bettor, betList[i].amount);
            }
        }

        emit BoutCancelled(boutId);
    }

    // ─── Enter Bout ─────────────────────────────────────────

    function enterBout(bytes32 boutId) external nonReentrant {
        Bout storage bout = bouts[boutId];
        if (bout.status != BoutStatus.OPEN) revert BoutNotOpen();
        if (bout.entrantCount >= bout.config.maxEntrants) revert BoutFull();
        if (hasEntered[boutId][msg.sender]) revert AlreadyEntered();

        uint256 fee = bout.config.entryFee;
        uint256 burnAmount = (fee * bout.config.entryBurnBps) / 10000;
        uint256 netFee = fee - burnAmount;

        IERC20(address(forgeToken)).safeTransferFrom(msg.sender, address(this), fee);

        if (burnAmount > 0) {
            forgeToken.burn(burnAmount);
            bout.totalBurned += burnAmount;
            totalBurned += burnAmount;
        }

        boutEntrants[boutId].push(Entrant({
            wallet: msg.sender,
            feePaid: netFee,
            placement: 0,
            payout: 0,
            claimed: false
        }));

        bout.totalEntryPool += netFee;
        bout.entrantCount++;
        hasEntered[boutId][msg.sender] = true;

        emit BoutEntered(boutId, msg.sender, fee, burnAmount);
    }

    // ─── Place Bet ──────────────────────────────────────────

    function placeBet(bytes32 boutId, uint8 entrantIdx, uint256 amount) external nonReentrant {
        Bout storage bout = bouts[boutId];
        require(bout.status == BoutStatus.OPEN || bout.status == BoutStatus.LIVE, "Not accepting bets");
        require(entrantIdx < bout.entrantCount, "Invalid entrant");
        if (hasBet[boutId][msg.sender]) revert AlreadyBet();
        require(amount > 0, "Amount must be > 0");

        uint256 burnAmount = (amount * bout.config.betBurnBps) / 10000;
        uint256 netBet = amount - burnAmount;

        IERC20(address(forgeToken)).safeTransferFrom(msg.sender, address(this), amount);

        if (burnAmount > 0) {
            forgeToken.burn(burnAmount);
            bout.totalBurned += burnAmount;
            totalBurned += burnAmount;
        }

        boutBets[boutId].push(Bet({
            bettor: msg.sender,
            entrantIdx: entrantIdx,
            amount: netBet,
            payout: 0,
            claimed: false
        }));

        bout.totalBetPool += netBet;
        hasBet[boutId][msg.sender] = true;

        emit BetPlaced(boutId, msg.sender, entrantIdx, amount, burnAmount);
    }

    // ─── Resolve Bout ───────────────────────────────────────

    function resolveBout(bytes32 boutId, uint8[] calldata placements) external onlyOwner nonReentrant {
        Bout storage bout = bouts[boutId];
        if (bout.status != BoutStatus.LIVE) revert BoutNotLive();
        if (bout.resolved) revert BoutAlreadyResolved();

        bout.status = BoutStatus.RESOLVED;
        bout.resolved = true;

        // Calculate pool splits
        uint256 protocolRake = (bout.totalBetPool * bout.config.protocolRakeBps) / 10000;
        uint256 agentShare   = (bout.totalBetPool * bout.config.agentPurseBps) / 10000;
        uint256 bettorShare  = bout.totalBetPool - protocolRake - agentShare;
        uint256 agentPurse   = bout.totalEntryPool + agentShare;

        // Set agent placements & payouts
        if (placements.length > 0) {
            _setAgentPayouts(boutId, placements, agentPurse);
        } else {
            // Nobody solved — entry pool goes to protocol
            protocolRake += agentPurse;
        }

        // Set bettor payouts
        _setBettorPayouts(boutId, placements, bettorShare);

        // Distribute rake
        uint256 rakeToVault = protocolRake / 2;
        uint256 rakeToProtocol = protocolRake - rakeToVault;
        _distributeRake(rakeToVault, rakeToProtocol);

        emit BoutResolved(boutId, agentPurse, bettorShare, rakeToVault, rakeToProtocol);
    }

    // ─── Internal: Agent Payouts ────────────────────────────

    function _setAgentPayouts(
        bytes32 boutId,
        uint8[] calldata placements,
        uint256 agentPurse
    ) internal {
        Entrant[] storage entrants = boutEntrants[boutId];

        for (uint256 i = 0; i < placements.length && i < 3; i++) {
            require(placements[i] < entrants.length, "Invalid placement idx");
            entrants[placements[i]].placement = uint8(i + 1);
            entrants[placements[i]].payout = _calcAgentPayout(i, placements.length, agentPurse);
        }
    }

    function _calcAgentPayout(
        uint256 placementRank,
        uint256 totalPlaced,
        uint256 agentPurse
    ) internal pure returns (uint256) {
        if (totalPlaced == 1) return agentPurse; // winner-take-all

        if (totalPlaced == 2) {
            return placementRank == 0
                ? (agentPurse * 7500) / 10000  // 75%
                : (agentPurse * 2500) / 10000;  // 25%
        }

        // 3+ solvers: 60/25/15
        uint16[3] memory splits = [uint16(6000), uint16(2500), uint16(1500)];
        if (placementRank < 3) {
            return (agentPurse * splits[placementRank]) / 10000;
        }
        return 0;
    }

    // ─── Internal: Bettor Payouts ───────────────────────────

    function _setBettorPayouts(
        bytes32 boutId,
        uint8[] calldata placements,
        uint256 bettorShare
    ) internal {
        Bet[] storage betList = boutBets[boutId];
        if (betList.length == 0) return;

        if (placements.length > 0) {
            // Find total winning bet amount
            uint256 winningTotal = 0;
            for (uint256 i = 0; i < betList.length; i++) {
                if (_isWinningBet(betList[i].entrantIdx, placements)) {
                    winningTotal += betList[i].amount;
                }
            }

            if (winningTotal > 0) {
                // Parimutuel split
                for (uint256 i = 0; i < betList.length; i++) {
                    if (_isWinningBet(betList[i].entrantIdx, placements)) {
                        betList[i].payout = (bettorShare * betList[i].amount) / winningTotal;
                    }
                }
            } else {
                // Nobody bet on winners — refund proportionally
                _refundBettors(betList, bettorShare);
            }
        } else {
            // Nobody solved — refund proportionally
            _refundBettors(betList, bettorShare);
        }
    }

    function _isWinningBet(uint8 entrantIdx, uint8[] calldata placements) internal pure returns (bool) {
        for (uint256 j = 0; j < placements.length && j < 3; j++) {
            if (entrantIdx == placements[j]) return true;
        }
        return false;
    }

    function _refundBettors(Bet[] storage betList, uint256 pool) internal {
        uint256 totalBetAmount = 0;
        for (uint256 i = 0; i < betList.length; i++) {
            totalBetAmount += betList[i].amount;
        }
        if (totalBetAmount == 0) return;
        for (uint256 i = 0; i < betList.length; i++) {
            betList[i].payout = (pool * betList[i].amount) / totalBetAmount;
        }
    }

    // ─── Internal: Rake Distribution ────────────────────────

    function _distributeRake(uint256 rakeToVault, uint256 rakeToProtocol) internal {
        if (rakeToVault > 0 && address(arenaVault) != address(0)) {
            IERC20(address(forgeToken)).approve(address(arenaVault), rakeToVault);
            arenaVault.depositYield(rakeToVault);
            totalRakeToVault += rakeToVault;
        }

        if (rakeToProtocol > 0) {
            IERC20(address(forgeToken)).safeTransfer(treasury, rakeToProtocol);
        }
    }

    // ─── Claim Payouts (Pull Pattern) ───────────────────────

    function claimPayout(bytes32 boutId) external nonReentrant {
        if (bouts[boutId].status != BoutStatus.RESOLVED) revert BoutNotResolved();

        Entrant[] storage entrants = boutEntrants[boutId];
        uint256 totalClaim = 0;

        for (uint256 i = 0; i < entrants.length; i++) {
            if (entrants[i].wallet == msg.sender && entrants[i].payout > 0 && !entrants[i].claimed) {
                totalClaim += entrants[i].payout;
                entrants[i].claimed = true;
            }
        }

        if (totalClaim == 0) revert NothingToClaim();
        IERC20(address(forgeToken)).safeTransfer(msg.sender, totalClaim);
        emit PayoutClaimed(boutId, msg.sender, totalClaim);
    }

    function claimBetPayout(bytes32 boutId) external nonReentrant {
        if (bouts[boutId].status != BoutStatus.RESOLVED) revert BoutNotResolved();

        Bet[] storage betList = boutBets[boutId];
        uint256 totalClaim = 0;

        for (uint256 i = 0; i < betList.length; i++) {
            if (betList[i].bettor == msg.sender && betList[i].payout > 0 && !betList[i].claimed) {
                totalClaim += betList[i].payout;
                betList[i].claimed = true;
            }
        }

        if (totalClaim == 0) revert NothingToClaim();
        IERC20(address(forgeToken)).safeTransfer(msg.sender, totalClaim);
        emit PayoutClaimed(boutId, msg.sender, totalClaim);
    }

    // ─── Views ──────────────────────────────────────────────

    function getBout(bytes32 boutId) external view returns (Bout memory) {
        return bouts[boutId];
    }

    function getEntrants(bytes32 boutId) external view returns (Entrant[] memory) {
        return boutEntrants[boutId];
    }

    function getBets(bytes32 boutId) external view returns (Bet[] memory) {
        return boutBets[boutId];
    }

    function getEntrantCount(bytes32 boutId) external view returns (uint8) {
        return bouts[boutId].entrantCount;
    }
}
