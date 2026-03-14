// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ForgeToken.sol";
import "../src/ForgeBonds.sol";
import "../src/VictoryEscrow.sol";

/**
 * @title ForgeBondsTest
 * @notice Tests for ForgeBonds: createBond, buyBond, claimYield (lazy), expireBond, APR schedule.
 */
contract ForgeBondsTest is Test {
    ForgeToken    public token;
    ForgeBonds    public bonds;
    VictoryEscrow public escrow;

    address public owner  = address(0x1);
    address public creator = address(0x10);
    address public buyer   = address(0x20);
    address public funder  = address(0x30);

    bytes32 public boutId = keccak256("bout-bond-001");

    function setUp() public {
        vm.startPrank(owner);

        token  = new ForgeToken(owner);
        bonds  = new ForgeBonds(address(token), block.timestamp, 500, owner); // 5% base APR
        escrow = new VictoryEscrow(address(token), owner, 500);

        escrow.setForgeBonds(address(bonds));

        // Distribute tokens
        token.transfer(creator, 100_000 ether);
        token.transfer(buyer, 100_000 ether);
        token.transfer(funder, 100_000 ether);
        token.transfer(address(escrow), 50_000 ether);

        // Set bootstrap APR schedule
        ForgeBonds.AprTier[] memory tiers = new ForgeBonds.AprTier[](2);
        tiers[0] = ForgeBonds.AprTier({ dayStart: 0, dayEnd: 7,  aprBps: 200000 }); // 2000% first week
        tiers[1] = ForgeBonds.AprTier({ dayStart: 7, dayEnd: 14, aprBps: 100000 }); // 1000% second week
        bonds.setAprSchedule(tiers);

        vm.stopPrank();
    }

    // ─── Helpers ────────────────────────────────────

    function _createBondViaEscrow(uint256 faceValue) internal returns (uint256 bondId) {
        vm.startPrank(address(escrow));
        token.approve(address(bonds), faceValue);
        bondId = bonds.createBond(creator, boutId, faceValue, 1000, block.timestamp + 7 days);
        vm.stopPrank();
    }

    function _fundYieldPool(uint256 amount) internal {
        vm.startPrank(funder);
        token.approve(address(bonds), amount);
        bonds.fundYieldPool(amount);
        vm.stopPrank();
    }

    // ─── createBond ─────────────────────────────────

    function test_createBond() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        ForgeBonds.Bond memory bond = bonds.getBond(bondId);
        assertEq(bond.creator, creator);
        assertEq(bond.faceValue, 1000 ether);
        assertEq(bond.remainingValue, 1000 ether);
        assertEq(bond.discountBps, 1000);
        assertEq(bond.aprBps, 200000); // snapshot from day 0 schedule

        // Token should be in bonds contract
        assertEq(token.balanceOf(address(bonds)), 1000 ether);

        // Should be in active bonds list
        uint256[] memory active = bonds.getActiveBonds();
        assertEq(active.length, 1);
        assertEq(active[0], 0);
    }

    // ─── APR Schedule ───────────────────────────────

    function test_getCurrentAprBps_day0() public view {
        assertEq(bonds.getCurrentAprBps(), 200000); // 2000%
    }

    function test_getCurrentAprBps_day10() public {
        vm.warp(block.timestamp + 10 days);
        assertEq(bonds.getCurrentAprBps(), 100000); // 1000% (week 2)
    }

    function test_getCurrentAprBps_day20() public {
        vm.warp(block.timestamp + 20 days);
        assertEq(bonds.getCurrentAprBps(), 500); // base 5%
    }

    function test_bondAprIsImmutable() public {
        // Create bond at day 0 (2000% APR)
        uint256 bondId = _createBondViaEscrow(1000 ether);

        // Warp to day 20 (base rate is 5%)
        vm.warp(block.timestamp + 20 days);
        assertEq(bonds.getCurrentAprBps(), 500); // current is 5%

        // But the bond still has 2000% locked
        ForgeBonds.Bond memory bond = bonds.getBond(bondId);
        assertEq(bond.aprBps, 200000); // IMMUTABLE — still 2000%
    }

    // ─── buyBond ────────────────────────────────────

    function test_buyBond() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        uint256 buyerBalBefore = token.balanceOf(buyer);

        // Buyer buys full bond (10% discount means they pay 900 for 1000)
        vm.startPrank(buyer);
        token.approve(address(bonds), 1000 ether);
        bonds.buyBond(bondId, 1000 ether);
        vm.stopPrank();

        uint256 buyerBalAfter = token.balanceOf(buyer);
        // Buyer paid 900 (discounted) and received 1000 (face value)
        // Net gain of 100 ether
        assertEq(buyerBalAfter - buyerBalBefore, 100 ether);

        ForgeBonds.Bond memory bond = bonds.getBond(bondId);
        assertEq(bond.remainingValue, 0);

        // Should be removed from active bonds
        assertEq(bonds.getActiveBonds().length, 0);
    }

    function test_buyBond_partial() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        vm.startPrank(buyer);
        token.approve(address(bonds), 500 ether);
        bonds.buyBond(bondId, 500 ether);
        vm.stopPrank();

        ForgeBonds.Bond memory bond = bonds.getBond(bondId);
        assertEq(bond.remainingValue, 500 ether);

        // Still active
        assertEq(bonds.getActiveBonds().length, 1);
    }

    function test_buyBondFor_relay() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        vm.prank(buyer);
        token.approve(address(bonds), 1000 ether);

        vm.prank(owner);
        bonds.buyBondFor(bondId, 1000 ether, buyer);

        ForgeBonds.Bond memory bond = bonds.getBond(bondId);
        assertEq(bond.remainingValue, 0);
    }

    // ─── Lazy Yield ─────────────────────────────────

    function test_lazyYieldAccrual() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);
        _fundYieldPool(10_000 ether);

        // Warp 1 day
        vm.warp(block.timestamp + 1 days);

        // Check pending yield: 1000 * 200000 / 10000 * 1/365 ≈ 54.79 ether
        uint256 pending = bonds.pendingYield(bondId);
        assertTrue(pending > 54 ether && pending < 55 ether, "Pending yield should be ~54.79 ether");
    }

    function test_claimYield() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);
        _fundYieldPool(10_000 ether);

        vm.warp(block.timestamp + 1 days);

        uint256 balBefore = token.balanceOf(creator);

        vm.prank(creator);
        bonds.claimYield(bondId);

        uint256 balAfter = token.balanceOf(creator);
        uint256 claimed = balAfter - balBefore;

        assertTrue(claimed > 54 ether && claimed < 55 ether);
    }

    function test_claimYield_cappedByPool() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        // Fund pool with tiny amount
        _fundYieldPool(10 ether);

        vm.warp(block.timestamp + 1 days);

        uint256 balBefore = token.balanceOf(creator);
        vm.prank(creator);
        bonds.claimYield(bondId);
        uint256 claimed = token.balanceOf(creator) - balBefore;

        // Should be capped at pool (10 ether), not full yield (~54.79)
        assertEq(claimed, 10 ether);
    }

    function test_claimYieldFor_relay() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);
        _fundYieldPool(10_000 ether);

        vm.warp(block.timestamp + 1 days);

        uint256 balBefore = token.balanceOf(creator);
        vm.prank(owner);
        bonds.claimYieldFor(bondId, creator);
        uint256 claimed = token.balanceOf(creator) - balBefore;

        assertTrue(claimed > 54 ether);
    }

    // ─── expireBond ─────────────────────────────────

    function test_expireBond() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);
        _fundYieldPool(100_000 ether);

        // Warp past expiry (7 days)
        vm.warp(block.timestamp + 8 days);

        uint256 balBefore = token.balanceOf(creator);

        bonds.expireBond(bondId);

        uint256 balAfter = token.balanceOf(creator);
        uint256 returned = balAfter - balBefore;

        // Should get back remaining value + accrued yield
        assertTrue(returned > 1000 ether, "Should get remaining + yield");

        ForgeBonds.Bond memory bond = bonds.getBond(bondId);
        assertTrue(bond.expired);
        assertEq(bond.remainingValue, 0);

        // Removed from active
        assertEq(bonds.getActiveBonds().length, 0);
    }

    function test_expireBond_reverts_notExpired() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        vm.expectRevert(ForgeBonds.BondNotExpired.selector);
        bonds.expireBond(bondId);
    }

    function test_expireBond_revertsDoubleExpire() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);
        vm.warp(block.timestamp + 8 days);
        bonds.expireBond(bondId);

        vm.expectRevert(ForgeBonds.BondAlreadyExpired.selector);
        bonds.expireBond(bondId);
    }

    // ─── Yield caps at expiry ───────────────────────

    function test_yieldCapsAtExpiry() public {
        uint256 bondId = _createBondViaEscrow(1000 ether);

        // Warp way past expiry (30 days for 7-day bond)
        vm.warp(block.timestamp + 30 days);

        // Pending yield should cap at 7 days (expiry), not accrue for 30 days
        uint256 pendingAt30 = bonds.pendingYield(bondId);

        // Reset and check at exactly 7 days
        // Yield for 7 days at 2000%: 1000 * 200000 / 10000 * 7/365 = 383.56
        assertTrue(pendingAt30 > 383 ether && pendingAt30 < 384 ether, "Yield should cap at expiry");
    }

    // ─── fundYieldPool ──────────────────────────────

    function test_fundYieldPool() public {
        assertEq(bonds.yieldPool(), 0);

        _fundYieldPool(5000 ether);

        assertEq(bonds.yieldPool(), 5000 ether);
        assertEq(token.balanceOf(address(bonds)), 5000 ether);
    }
}
