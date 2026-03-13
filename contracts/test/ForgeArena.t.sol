// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ForgeToken.sol";
import "../src/ArenaVault.sol";
import "../src/ForgeArena.sol";

contract ForgeArenaTest is Test {
    ForgeToken public token;
    ArenaVault public vault;
    ForgeArena public arena;

    address public owner = address(0x1);
    address public treasury = address(0x2);
    address public agent1 = address(0x10);
    address public agent2 = address(0x11);
    address public agent3 = address(0x12);
    address public bettor1 = address(0x20);
    address public bettor2 = address(0x21);
    address public staker1 = address(0x30);

    bytes32 public boutId = keccak256("bout-001");

    function setUp() public {
        vm.startPrank(owner);

        // Deploy token — full supply to owner
        token = new ForgeToken(owner);

        // Deploy vault
        vault = new ArenaVault(address(token), owner);

        // Deploy arena
        arena = new ForgeArena(address(token), address(vault), treasury, owner);

        // Authorize arena as depositor on vault
        vault.setDepositor(address(arena), true);

        // Distribute tokens to agents and bettors
        token.transfer(agent1, 50_000 ether);
        token.transfer(agent2, 50_000 ether);
        token.transfer(agent3, 50_000 ether);
        token.transfer(bettor1, 100_000 ether);
        token.transfer(bettor2, 100_000 ether);
        token.transfer(staker1, 100_000 ether);

        vm.stopPrank();
    }

    // ─── Helpers ────────────────────────────────────

    function _createDefaultBout() internal {
        vm.prank(owner);
        arena.createBout(
            boutId,
            500 ether,   // entryFee
            1000,        // entryBurnBps = 10%
            200,         // betBurnBps = 2%
            500,         // protocolRakeBps = 5%
            2000,        // agentPurseBps = 20%
            7500,        // bettorPoolBps = 75%
            32           // maxEntrants
        );
    }

    function _approveAndEnter(address agent) internal {
        vm.startPrank(agent);
        token.approve(address(arena), 500 ether);
        arena.enterBout(boutId);
        vm.stopPrank();
    }

    function _approveAndBet(address bettor, uint8 entrantIdx, uint256 amount) internal {
        vm.startPrank(bettor);
        token.approve(address(arena), amount);
        arena.placeBet(boutId, entrantIdx, amount);
        vm.stopPrank();
    }

    // ─── Create Bout Tests ─────────────────────────

    function test_CreateBout() public {
        _createDefaultBout();
        ForgeArena.Bout memory bout = arena.getBout(boutId);
        assertEq(uint(bout.status), uint(ForgeArena.BoutStatus.OPEN));
        assertEq(bout.config.entryFee, 500 ether);
        assertEq(bout.entrantCount, 0);
    }

    function test_CreateBout_RevertsDuplicateId() public {
        _createDefaultBout();
        vm.prank(owner);
        vm.expectRevert("Bout already exists");
        arena.createBout(boutId, 500 ether, 1000, 200, 500, 2000, 7500, 32);
    }

    function test_CreateBout_RevertsBadBps() public {
        vm.prank(owner);
        vm.expectRevert("Bps must sum to 10000");
        arena.createBout(boutId, 500 ether, 1000, 200, 500, 2000, 5000, 32); // sums to 7500
    }

    // ─── Enter Bout Tests ──────────────────────────

    function test_EnterBout() public {
        _createDefaultBout();

        uint256 balBefore = token.balanceOf(agent1);
        _approveAndEnter(agent1);
        uint256 balAfter = token.balanceOf(agent1);

        // Agent paid 500 FORGE
        assertEq(balBefore - balAfter, 500 ether);

        // Bout state updated
        ForgeArena.Bout memory bout = arena.getBout(boutId);
        assertEq(bout.entrantCount, 1);

        // 10% burned = 50 FORGE
        assertEq(bout.totalBurned, 50 ether);

        // Net entry pool = 450
        assertEq(bout.totalEntryPool, 450 ether);
    }

    function test_EnterBout_RevertsDoubleEntry() public {
        _createDefaultBout();
        _approveAndEnter(agent1);

        vm.startPrank(agent1);
        token.approve(address(arena), 500 ether);
        vm.expectRevert(ForgeArena.AlreadyEntered.selector);
        arena.enterBout(boutId);
        vm.stopPrank();
    }

    // ─── Place Bet Tests ───────────────────────────

    function test_PlaceBet() public {
        _createDefaultBout();
        _approveAndEnter(agent1);

        uint256 balBefore = token.balanceOf(bettor1);
        _approveAndBet(bettor1, 0, 1000 ether);
        uint256 balAfter = token.balanceOf(bettor1);

        // Bettor paid 1000 FORGE
        assertEq(balBefore - balAfter, 1000 ether);

        // 2% burned = 20 FORGE
        ForgeArena.Bout memory bout = arena.getBout(boutId);
        assertEq(bout.totalBetPool, 980 ether);  // net
    }

    function test_PlaceBet_RevertsDoublebet() public {
        _createDefaultBout();
        _approveAndEnter(agent1);
        _approveAndBet(bettor1, 0, 1000 ether);

        vm.startPrank(bettor1);
        token.approve(address(arena), 1000 ether);
        vm.expectRevert(ForgeArena.AlreadyBet.selector);
        arena.placeBet(boutId, 0, 1000 ether);
        vm.stopPrank();
    }

    // ─── Full Bout Lifecycle ───────────────────────

    function test_FullBoutLifecycle() public {
        _createDefaultBout();

        // 3 agents enter
        _approveAndEnter(agent1);
        _approveAndEnter(agent2);
        _approveAndEnter(agent3);

        // Set bout live
        vm.prank(owner);
        arena.setBoutLive(boutId);

        // 2 bettors bet
        _approveAndBet(bettor1, 0, 2000 ether); // bets on agent1 (idx 0)
        _approveAndBet(bettor2, 1, 1000 ether); // bets on agent2 (idx 1)

        ForgeArena.Bout memory boutBefore = arena.getBout(boutId);
        assertEq(boutBefore.entrantCount, 3);

        // Need a staker in vault for depositYield to work
        vm.startPrank(staker1);
        token.approve(address(vault), 10_000 ether);
        vault.stake(10_000 ether, ArenaVault.Covenant.FLAME);
        vm.stopPrank();

        // Approve vault to receive tokens from arena (for depositYield)
        // Arena needs to have its token approved for vault's transferFrom

        // Resolve: agent1 wins, agent2 second, agent3 third
        uint8[] memory placements = new uint8[](3);
        placements[0] = 0; // agent1 = 1st
        placements[1] = 1; // agent2 = 2nd
        placements[2] = 2; // agent3 = 3rd

        vm.prank(owner);
        arena.resolveBout(boutId, placements);

        // Check bout resolved
        ForgeArena.Bout memory bout = arena.getBout(boutId);
        assertEq(uint(bout.status), uint(ForgeArena.BoutStatus.RESOLVED));

        // Agent1 claims (1st place)
        uint256 agent1BalBefore = token.balanceOf(agent1);
        vm.prank(agent1);
        arena.claimPayout(boutId);
        uint256 agent1Payout = token.balanceOf(agent1) - agent1BalBefore;
        assertTrue(agent1Payout > 0, "Agent1 should get payout");

        // Bettor1 claims (bet on agent1 who won)
        uint256 bettor1BalBefore = token.balanceOf(bettor1);
        vm.prank(bettor1);
        arena.claimBetPayout(boutId);
        uint256 bettor1Payout = token.balanceOf(bettor1) - bettor1BalBefore;
        assertTrue(bettor1Payout > 0, "Bettor1 should get payout");

        // Bettor2 also claims (bet on agent2 who placed 2nd — also a podium finisher)
        uint256 bettor2BalBefore = token.balanceOf(bettor2);
        vm.prank(bettor2);
        arena.claimBetPayout(boutId);
        uint256 bettor2Payout = token.balanceOf(bettor2) - bettor2BalBefore;
        assertTrue(bettor2Payout > 0, "Bettor2 should get payout for 2nd place bet");
    }

    // ─── Edge Case: Nobody Solved ──────────────────

    function test_NobodySolved_RefundBettors() public {
        _createDefaultBout();
        _approveAndEnter(agent1);

        vm.prank(owner);
        arena.setBoutLive(boutId);

        _approveAndBet(bettor1, 0, 1000 ether);

        // Need staker for vault
        vm.startPrank(staker1);
        token.approve(address(vault), 10_000 ether);
        vault.stake(10_000 ether, ArenaVault.Covenant.FLAME);
        vm.stopPrank();

        // Resolve with empty placements (nobody solved)
        uint8[] memory placements = new uint8[](0);
        vm.prank(owner);
        arena.resolveBout(boutId, placements);

        // Bettor should be able to claim refund (proportional share of bettor pool)
        uint256 balBefore = token.balanceOf(bettor1);
        vm.prank(bettor1);
        arena.claimBetPayout(boutId);
        uint256 refund = token.balanceOf(bettor1) - balBefore;
        assertTrue(refund > 0, "Bettor should get refund when nobody solved");
    }

    // ─── Cancel Bout ───────────────────────────────

    function test_CancelBout_RefundsAll() public {
        _createDefaultBout();
        _approveAndEnter(agent1);
        _approveAndBet(bettor1, 0, 1000 ether);

        uint256 agent1Bal = token.balanceOf(agent1);
        uint256 bettor1Bal = token.balanceOf(bettor1);

        vm.prank(owner);
        arena.cancelBout(boutId);

        // Agent gets net entry fee refunded (post-burn amount stored)
        assertTrue(token.balanceOf(agent1) > agent1Bal, "Agent should get refund");
        // Bettor gets net bet refunded
        assertTrue(token.balanceOf(bettor1) > bettor1Bal, "Bettor should get refund");
    }

    // ─── Double Claim Prevention ───────────────────

    function test_DoubleClaim_Reverts() public {
        _createDefaultBout();
        _approveAndEnter(agent1);

        vm.prank(owner);
        arena.setBoutLive(boutId);

        // Need staker for vault
        vm.startPrank(staker1);
        token.approve(address(vault), 10_000 ether);
        vault.stake(10_000 ether, ArenaVault.Covenant.FLAME);
        vm.stopPrank();

        uint8[] memory placements = new uint8[](1);
        placements[0] = 0;
        vm.prank(owner);
        arena.resolveBout(boutId, placements);

        vm.prank(agent1);
        arena.claimPayout(boutId);

        vm.prank(agent1);
        vm.expectRevert(ForgeArena.NothingToClaim.selector);
        arena.claimPayout(boutId);
    }

    // ─── Burns ──────────────────────────────────────

    function test_BurnsReduceSupply() public {
        uint256 supplyBefore = token.totalSupply();

        _createDefaultBout();
        _approveAndEnter(agent1);           // 50 burned (10% of 500)
        _approveAndBet(bettor1, 0, 1000 ether);  // 20 burned (2% of 1000)

        uint256 supplyAfter = token.totalSupply();
        assertEq(supplyBefore - supplyAfter, 70 ether, "Total supply should decrease by burns");
        assertEq(arena.totalBurned(), 70 ether);
    }
}
