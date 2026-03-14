// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ForgeToken.sol";
import "../src/ArenaVault.sol";
import "../src/ForgeArena.sol";
import "../src/VictoryEscrow.sol";
import "../src/ForgeBonds.sol";

/**
 * @title VictoryEscrowTest
 * @notice Tests for VictoryEscrow: lockPayout, claimInstant, claimAsBond, relay variants.
 */
contract VictoryEscrowTest is Test {
    ForgeToken    public token;
    ArenaVault    public vault;
    ForgeArena    public arena;
    VictoryEscrow public escrow;
    ForgeBonds    public bonds;

    address public owner   = address(0x1);
    address public treasury = address(0x2);
    address public winner1 = address(0x10);
    address public winner2 = address(0x11);

    bytes32 public boutId = keccak256("bout-escrow-001");

    function setUp() public {
        vm.startPrank(owner);

        token  = new ForgeToken(owner);
        vault  = new ArenaVault(address(token), owner);
        arena  = new ForgeArena(address(token), address(vault), treasury, owner);
        escrow = new VictoryEscrow(address(token), owner, 500); // 5% burn
        bonds  = new ForgeBonds(address(token), block.timestamp, 500, owner);

        // Wire up
        vault.setDepositor(address(arena), true);
        arena.setVictoryEscrow(address(escrow));
        escrow.setForgeBonds(address(bonds));

        // Fund winners to simulate arena having tokens
        token.transfer(address(arena), 100_000 ether);
        token.transfer(winner1, 10_000 ether);
        token.transfer(winner2, 10_000 ether);

        vm.stopPrank();
    }

    // ─── lockPayout ─────────────────────────────────

    function test_lockPayout() public {
        // Arena locks a payout for winner1
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        assertEq(escrow.getEscrowCount(boutId), 1);

        VictoryEscrow.Escrow memory e = escrow.getEscrow(boutId, 0);
        assertEq(e.winner, winner1);
        assertEq(e.amount, 1000 ether);
        assertFalse(e.claimed);
    }

    function test_lockPayout_multiple() public {
        vm.startPrank(address(arena));
        token.approve(address(escrow), 3000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        escrow.lockPayout(boutId, winner2, 2000 ether);
        vm.stopPrank();

        assertEq(escrow.getEscrowCount(boutId), 2);
    }

    // ─── claimInstant ───────────────────────────────

    function test_claimInstant() public {
        // Lock payout
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        uint256 supplyBefore = token.totalSupply();
        uint256 balBefore = token.balanceOf(winner1);

        // Winner claims instant
        vm.prank(winner1);
        escrow.claimInstant(boutId, 0);

        uint256 balAfter = token.balanceOf(winner1);
        uint256 supplyAfter = token.totalSupply();

        // Should receive 95% (5% burned)
        assertEq(balAfter - balBefore, 950 ether);
        // Supply should decrease by 5% burn
        assertEq(supplyBefore - supplyAfter, 50 ether);

        // Should be marked claimed
        VictoryEscrow.Escrow memory e = escrow.getEscrow(boutId, 0);
        assertTrue(e.claimed);
    }

    function test_claimInstant_revertsDoubleClaim() public {
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        vm.prank(winner1);
        escrow.claimInstant(boutId, 0);

        vm.prank(winner1);
        vm.expectRevert(VictoryEscrow.AlreadyClaimed.selector);
        escrow.claimInstant(boutId, 0);
    }

    function test_claimInstant_revertsWrongWinner() public {
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        vm.prank(winner2); // wrong winner
        vm.expectRevert(VictoryEscrow.NotWinner.selector);
        escrow.claimInstant(boutId, 0);
    }

    // ─── claimInstantFor (relay) ─────────────────────

    function test_claimInstantFor() public {
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        uint256 balBefore = token.balanceOf(winner1);

        vm.prank(owner);
        escrow.claimInstantFor(boutId, 0, winner1);

        uint256 balAfter = token.balanceOf(winner1);
        assertEq(balAfter - balBefore, 950 ether);
    }

    // ─── claimAsBond ────────────────────────────────

    function test_claimAsBond() public {
        // Lock payout
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        // Winner claims as bond (10% discount, 7 day expiry)
        vm.prank(winner1);
        escrow.claimAsBond(boutId, 0, 1000, block.timestamp + 7 days);

        // Full amount should be in ForgeBonds contract
        assertEq(token.balanceOf(address(bonds)), 1000 ether);

        // Bond should exist
        ForgeBonds.Bond memory bond = bonds.getBond(0);
        assertEq(bond.creator, winner1);
        assertEq(bond.faceValue, 1000 ether);
        assertEq(bond.remainingValue, 1000 ether);
        assertEq(bond.discountBps, 1000);

        // Escrow should be claimed
        VictoryEscrow.Escrow memory e = escrow.getEscrow(boutId, 0);
        assertTrue(e.claimed);
    }

    function test_claimAsBondFor() public {
        vm.startPrank(address(arena));
        token.approve(address(escrow), 1000 ether);
        escrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        vm.prank(owner);
        escrow.claimAsBondFor(boutId, 0, winner1, 1000, block.timestamp + 7 days);

        assertEq(token.balanceOf(address(bonds)), 1000 ether);
    }

    function test_claimAsBond_revertsForgeBondsNotSet() public {
        // Deploy a fresh escrow without ForgeBonds set
        vm.startPrank(owner);
        VictoryEscrow freshEscrow = new VictoryEscrow(address(token), owner, 500);
        token.transfer(address(arena), 1000 ether);
        vm.stopPrank();

        vm.startPrank(address(arena));
        token.approve(address(freshEscrow), 1000 ether);
        freshEscrow.lockPayout(boutId, winner1, 1000 ether);
        vm.stopPrank();

        vm.prank(winner1);
        vm.expectRevert(VictoryEscrow.ForgeBondsNotSet.selector);
        freshEscrow.claimAsBond(boutId, 0, 1000, block.timestamp + 7 days);
    }
}
