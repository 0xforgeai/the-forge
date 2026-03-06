// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ForgeToken.sol";
import "../src/ArenaVault.sol";

contract ArenaVaultTest is Test {
    ForgeToken public token;
    ArenaVault public vault;
    address public owner = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);

    uint256 constant STAKE_AMOUNT = 10_000 ether;

    function setUp() public {
        vm.startPrank(owner);
        token = new ForgeToken(owner);
        vault = new ArenaVault(address(token), owner);

        // Fund alice and bob
        token.transfer(alice, 100_000 ether);
        token.transfer(bob, 100_000 ether);

        // Approve vault for yield deposits
        token.approve(address(vault), type(uint256).max);
        vm.stopPrank();

        // Alice and Bob approve vault
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    // ─── Stake Tests ────────────────────────────────────────

    function test_StakeFlame() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.amount, STAKE_AMOUNT);
        assertTrue(pos.active);
        assertEq(uint256(pos.covenant), uint256(ArenaVault.Covenant.FLAME));
        assertEq(vault.totalStaked(), STAKE_AMOUNT);
        assertEq(vault.stakerCount(), 1);
    }

    function test_StakeSteel() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.amount, STAKE_AMOUNT);
        assertEq(pos.lockExpiresAt, block.timestamp + 3 days);
    }

    function test_StakeObsidian() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.OBSIDIAN);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.lockExpiresAt, block.timestamp + 7 days);
    }

    function test_StakeEternal() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.ETERNAL);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.lockExpiresAt, block.timestamp + 30 days);
    }

    function test_CannotDoubleStake() public {
        vm.startPrank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.expectRevert(ArenaVault.AlreadyStaked.selector);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        vm.stopPrank();
    }

    function test_CannotStakeZero() public {
        vm.prank(alice);
        vm.expectRevert(ArenaVault.InsufficientAmount.selector);
        vault.stake(0, ArenaVault.Covenant.FLAME);
    }

    // ─── Unstake Tests ──────────────────────────────────────

    function test_UnstakeFlameAfterLock() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Warp past lock (1 day) + enough for 0% tax (6+ days)
        vm.warp(block.timestamp + 7 days);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.unstake();
        uint256 balAfter = token.balanceOf(alice);

        // After 7 days, rage quit tax = 0% for Flame (1x multi)
        assertEq(balAfter - balBefore, STAKE_AMOUNT);
        assertEq(vault.totalStaked(), 0);
        assertEq(vault.stakerCount(), 0);
    }

    function test_UnstakeFlameWithTax() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Warp 1 day (lock expires but still day 1 rage quit = 50% * 1x = 50%)
        vm.warp(block.timestamp + 1 days);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.unstake();
        uint256 balAfter = token.balanceOf(alice);

        // Day 1 tax = index[1] = 40% * 1x = 40% → return 60%
        assertEq(balAfter - balBefore, STAKE_AMOUNT * 6000 / 10000);
    }

    function test_UnstakeSteelWithHigherTax() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        // Warp 3 days (lock expires, day 3 rage quit = 30% * 2x = 60%)
        vm.warp(block.timestamp + 3 days);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.unstake();
        uint256 balAfter = token.balanceOf(alice);

        // Day 3 tax = index[3] = 20% * 2x = 40% → return 60%
        assertEq(balAfter - balBefore, STAKE_AMOUNT * 6000 / 10000);
    }

    function test_CannotUnstakeBeforeLock() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        // Try unstake immediately (lock = 3 days)
        vm.prank(alice);
        vm.expectRevert();
        vault.unstake();
    }

    function test_EternalCannotUnstakeEarly() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.ETERNAL);

        // Try after 15 days (lock = 30 days)
        vm.warp(block.timestamp + 15 days);

        vm.prank(alice);
        vm.expectRevert(ArenaVault.EternalCannotUnstake.selector);
        vault.unstake();
    }

    function test_EternalCanUnstakeAfter30Days() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.ETERNAL);

        // Warp past 30 days
        vm.warp(block.timestamp + 31 days);

        vm.prank(alice);
        vault.unstake();

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertFalse(pos.active);
    }

    // ─── Loyalty Multiplier ─────────────────────────────────

    function test_LoyaltyDay0() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        assertEq(vault.getLoyaltyMultiplier(alice), 100); // 1.0x
    }

    function test_LoyaltyDay3() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.warp(block.timestamp + 3 days);
        assertEq(vault.getLoyaltyMultiplier(alice), 200); // 2.0x
    }

    function test_LoyaltyDay6Plus() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.warp(block.timestamp + 10 days);
        assertEq(vault.getLoyaltyMultiplier(alice), 300); // 3.0x max
    }

    // ─── Rage Quit Tax Calc ─────────────────────────────────

    function test_RageQuitCostDay0() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        (uint256 tax, uint256 ret) = vault.getRageQuitCost(alice);
        // Day 0: index[0] = 50% * 1x = 50%
        assertEq(tax, STAKE_AMOUNT / 2);
        assertEq(ret, STAKE_AMOUNT / 2);
    }

    function test_RageQuitCostSteelDay3() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        vm.warp(block.timestamp + 3 days);
        (uint256 tax, uint256 ret) = vault.getRageQuitCost(alice);
        // Day 3: index[3] = 20% * 2x = 40%
        assertEq(tax, STAKE_AMOUNT * 4000 / 10000);
        assertEq(ret, STAKE_AMOUNT * 6000 / 10000);
    }

    // ─── Yield Distribution ─────────────────────────────────

    function test_DepositAndDistributeYield() public {
        // Alice stakes
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Owner deposits yield
        vm.prank(owner);
        vault.depositYield(1000 ether);

        assertEq(vault.yieldPool(), 1000 ether);

        // Distribute
        vm.prank(owner);
        vault.distributeYield();

        // Alice should have unvested rewards
        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.totalEarned, 1000 ether);
        assertEq(vault.yieldPool(), 0);
    }

    function test_YieldDistributionProRata() public {
        // Alice: 10k FLAME, Bob: 10k STEEL (higher weight)
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        // Deposit yield
        vm.prank(owner);
        vault.depositYield(1000 ether);

        vm.prank(owner);
        vault.distributeYield();

        ArenaVault.StakePosition memory posA = vault.getPosition(alice);
        ArenaVault.StakePosition memory posB = vault.getPosition(bob);

        // Bob should earn more (Steel has +50% APY bonus = 1.5x weight)
        assertGt(posB.totalEarned, posA.totalEarned);
    }

    // ─── Vesting ────────────────────────────────────────────

    function test_VestingLinear() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Deposit and distribute yield
        vm.prank(owner);
        vault.depositYield(1000 ether);
        vm.prank(owner);
        vault.distributeYield();

        // At t+0, nothing should be claimable (just distributed)
        uint256 claimable = vault.getClaimable(alice);
        assertEq(claimable, 0);

        // At t+2.5 days, ~50% should be vested
        vm.warp(block.timestamp + 2.5 days);
        claimable = vault.getClaimable(alice);
        assertApproxEqAbs(claimable, 500 ether, 1 ether);

        // At t+5 days, 100% vested
        vm.warp(block.timestamp + 2.5 days);
        claimable = vault.getClaimable(alice);
        assertApproxEqAbs(claimable, 1000 ether, 1 ether);
    }

    function test_ClaimVestedYield() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.prank(owner);
        vault.depositYield(1000 ether);
        vm.prank(owner);
        vault.distributeYield();

        // Wait full vesting period
        vm.warp(block.timestamp + 5 days);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.claimYield();
        uint256 balAfter = token.balanceOf(alice);

        assertApproxEqAbs(balAfter - balBefore, 1000 ether, 1 ether);
    }

    // ─── Tax Redistribution ─────────────────────────────────

    function test_RageQuitTaxGoesToYieldPool() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Unstake after 1 day (50% tax)
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vault.unstake();

        // 40% of 10k = 4k should be in yield pool (day 1 = index[1] = 40% * 1x)
        assertEq(vault.yieldPool(), STAKE_AMOUNT * 4000 / 10000);
        assertEq(vault.totalTaxCollected(), STAKE_AMOUNT * 4000 / 10000);
    }
}
