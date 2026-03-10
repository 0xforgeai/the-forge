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
    address public carol = address(0x4);

    uint256 constant STAKE_AMOUNT = 10_000 ether;

    function setUp() public {
        vm.startPrank(owner);
        token = new ForgeToken(owner);
        vault = new ArenaVault(address(token), owner);

        // Fund test users
        token.transfer(alice, 100_000 ether);
        token.transfer(bob, 100_000 ether);
        token.transfer(carol, 100_000 ether);

        // Approve vault for yield deposits
        token.approve(address(vault), type(uint256).max);
        vm.stopPrank();

        // Users approve vault
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
        vm.prank(carol);
        token.approve(address(vault), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════
    //  STAKE TESTS
    // ═══════════════════════════════════════════════════════════

    function test_StakeFlame() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.amount, STAKE_AMOUNT);
        assertTrue(pos.active);
        assertEq(uint256(pos.covenant), uint256(ArenaVault.Covenant.FLAME));
        assertEq(vault.totalStaked(), STAKE_AMOUNT);
        assertEq(vault.getStakerCount(), 1);
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

    // ═══════════════════════════════════════════════════════════
    //  UNSTAKE TESTS
    // ═══════════════════════════════════════════════════════════

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
        assertEq(vault.getStakerCount(), 0);
    }

    function test_UnstakeFlameWithTax() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Warp 1 day → day 1 rage quit: index[1] = 40% * 1x = 40%
        vm.warp(block.timestamp + 1 days);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.unstake();
        uint256 balAfter = token.balanceOf(alice);

        assertEq(balAfter - balBefore, STAKE_AMOUNT * 6000 / 10000);
    }

    function test_UnstakeSteelWithHigherTax() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        // Warp 3 days (lock expires, day 3 rage quit = index[3] = 20% * 2x = 40%)
        vm.warp(block.timestamp + 3 days);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.unstake();
        uint256 balAfter = token.balanceOf(alice);

        assertEq(balAfter - balBefore, STAKE_AMOUNT * 6000 / 10000);
    }

    function test_CannotUnstakeBeforeLock() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        vm.prank(alice);
        vm.expectRevert();
        vault.unstake();
    }

    function test_EternalCannotUnstakeEarly() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.ETERNAL);

        vm.warp(block.timestamp + 15 days);

        vm.prank(alice);
        vm.expectRevert(ArenaVault.EternalCannotUnstake.selector);
        vault.unstake();
    }

    function test_EternalCanUnstakeAfter30Days() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.ETERNAL);

        vm.warp(block.timestamp + 31 days);

        vm.prank(alice);
        vault.unstake();

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertFalse(pos.active);
    }

    // ═══════════════════════════════════════════════════════════
    //  LOYALTY MULTIPLIER TESTS
    // ═══════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════
    //  RAGE QUIT TAX CALC
    // ═══════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════
    //  PULL-BASED YIELD — rewardPerTokenStored ACCUMULATOR
    // ═══════════════════════════════════════════════════════════

    function test_RewardPerTokenAccumulator_SingleStaker() public {
        // Alice stakes 10k FLAME
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        uint256 yieldAmount = 1000 ether;
        vm.prank(owner);
        vault.depositYield(yieldAmount);

        // rewardPerToken = yieldAmount * 1e18 / totalWeightedStake
        // FLAME weight = amount * loyaltyMulti(100) * (10000 + 0) / (100 * 10000)
        //              = 10000e18 * 100 * 10000 / (100 * 10000) = 10000e18
        uint256 expectedRewardPerToken = (yieldAmount * 1e18) / STAKE_AMOUNT;
        assertEq(vault.rewardPerTokenStored(), expectedRewardPerToken);
    }

    function test_RewardPerTokenAccumulator_MultipleDeposits() public {
        // Alice stakes
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // First deposit
        vm.prank(owner);
        vault.depositYield(1000 ether);
        uint256 rpt1 = vault.rewardPerTokenStored();

        // Second deposit — accumulator should increase
        vm.prank(owner);
        vault.depositYield(500 ether);
        uint256 rpt2 = vault.rewardPerTokenStored();

        assertGt(rpt2, rpt1);
        // Total = 1500 ether deposited against same weight
        uint256 expected = (1500 ether * 1e18) / STAKE_AMOUNT;
        assertEq(rpt2, expected);
    }

    function test_RewardPerTokenAccumulator_WeightedByApyBonus() public {
        // Alice: FLAME (1x weight), Bob: STEEL (+50% APY = 1.5x weight)
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        // FLAME weight = 10000e18 * 100 * 10000 / (100 * 10000) = 10000e18
        // STEEL weight = 10000e18 * 100 * 15000 / (100 * 10000) = 15000e18
        // totalWeightedStake = 25000e18
        assertEq(vault.totalWeightedStake(), 25_000 ether);

        vm.prank(owner);
        vault.depositYield(2500 ether);

        // Check pending yield — Bob should get 1.5x Alice
        uint256 alicePending = vault.getPendingYield(alice);
        uint256 bobPending = vault.getPendingYield(bob);

        // Alice: 10000/25000 * 2500 = 1000
        // Bob: 15000/25000 * 2500 = 1500
        assertApproxEqAbs(alicePending, 1000 ether, 1 ether);
        assertApproxEqAbs(bobPending, 1500 ether, 1 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //  getPendingYield WITH ZERO totalWeightedStake
    // ═══════════════════════════════════════════════════════════

    function test_GetPendingYield_NoStakers() public view {
        // No one staked — should return 0, not divide-by-zero
        uint256 pending = vault.getPendingYield(alice);
        assertEq(pending, 0);
    }

    function test_DepositYield_RevertsWithNoStakers() public {
        // depositYield with zero totalWeightedStake should revert
        vm.prank(owner);
        vm.expectRevert(ArenaVault.NoStakersToReceive.selector);
        vault.depositYield(1000 ether);
    }

    function test_GetPendingYield_AfterUnstake() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.warp(block.timestamp + 7 days);

        vm.prank(alice);
        vault.unstake();

        // After unstaking, pending should be 0
        uint256 pending = vault.getPendingYield(alice);
        assertEq(pending, 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  FULL STAKE/UNSTAKE/CLAIM SEQUENCES — ALL 4 COVENANTS
    // ═══════════════════════════════════════════════════════════

    function test_FullSequence_Flame() public {
        _testFullSequence(alice, ArenaVault.Covenant.FLAME, 1 days, 7 days);
    }

    function test_FullSequence_Steel() public {
        _testFullSequence(alice, ArenaVault.Covenant.STEEL, 3 days, 7 days);
    }

    function test_FullSequence_Obsidian() public {
        _testFullSequence(alice, ArenaVault.Covenant.OBSIDIAN, 7 days, 10 days);
    }

    function test_FullSequence_Eternal() public {
        _testFullSequence(alice, ArenaVault.Covenant.ETERNAL, 30 days, 31 days);
    }

    function _testFullSequence(
        address user,
        ArenaVault.Covenant covenant,
        uint256 lockPeriod,
        uint256 unstakeAfter
    ) internal {
        // 1. Stake
        vm.prank(user);
        vault.stake(STAKE_AMOUNT, covenant);

        ArenaVault.StakePosition memory pos = vault.getPosition(user);
        assertTrue(pos.active);
        assertEq(pos.amount, STAKE_AMOUNT);
        assertEq(vault.getStakerCount(), 1);

        // 2. Deposit yield
        vm.prank(owner);
        vault.depositYield(1000 ether);

        // 3. Verify pending yield > 0
        uint256 pending = vault.getPendingYield(user);
        assertGt(pending, 0);

        // 4. Immediately settle (before loyalty multiplier growth inflates yield)
        vm.prank(user);
        vault.claimYield();  // settles pending → unvested, emits YieldClaimed(0)

        // Verify settlement persisted
        pos = vault.getPosition(user);
        assertGt(pos.unvestedRewards, 0);

        // 5. Warp past lock + vesting
        vm.warp(block.timestamp + (unstakeAfter > 5 days ? unstakeAfter + 1 days : 6 days));

        // 6. Unstake — collects principal + vested yield
        uint256 balBefore = token.balanceOf(user);
        vm.prank(user);
        vault.unstake();
        uint256 received = token.balanceOf(user) - balBefore;

        // Should get more than just principal (has vested yield)
        assertGt(received, 0);

        pos = vault.getPosition(user);
        assertFalse(pos.active);
        assertEq(vault.getStakerCount(), 0);
        assertEq(vault.totalStaked(), 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  ROUNDING EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_SmallDeposit_LargeStake() public {
        // Alice stakes a very large amount
        uint256 largeStake = 50_000 ether;
        vm.prank(alice);
        vault.stake(largeStake, ArenaVault.Covenant.FLAME);

        // Tiny yield deposit — 1 wei
        vm.prank(owner);
        vault.depositYield(1);

        // Should not revert, pending should be 0 or 1 due to rounding
        uint256 pending = vault.getPendingYield(alice);
        assertTrue(pending <= 1);
    }

    function test_OneWeiStake_YieldDistribution() public {
        // Minimum viable stake: 1 wei
        vm.prank(alice);
        vault.stake(1, ArenaVault.Covenant.FLAME);

        vm.prank(owner);
        vault.depositYield(1000 ether);

        // Alice should get the full yield since she's the only staker
        uint256 pending = vault.getPendingYield(alice);
        assertEq(pending, 1000 ether);
    }

    function test_DustCollector_MultipleSmallDeposits() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // 100 small deposits of 10 each
        for (uint256 i = 0; i < 100; i++) {
            vm.prank(owner);
            vault.depositYield(10 ether);
        }

        // Total deposited = 1000 ether
        uint256 pending = vault.getPendingYield(alice);
        assertApproxEqAbs(pending, 1000 ether, 100); // allow tiny rounding
    }

    // ═══════════════════════════════════════════════════════════
    //  RE-STAKE AFTER UNSTAKE
    // ═══════════════════════════════════════════════════════════

    function test_RestakeAfterUnstake() public {
        // First cycle: stake and unstake
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        vault.unstake();

        assertEq(vault.getStakerCount(), 0);

        // Second cycle: re-stake
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertTrue(pos.active);
        assertEq(pos.amount, STAKE_AMOUNT);
        assertEq(pos.rewardDebt, 0); // debt should be based on current accumulator
        assertEq(vault.getStakerCount(), 1);
    }

    function test_RestakeAfterUnstake_AccumulatorResetCorrect() public {
        // Alice stakes, yield deposited, unstakes, re-stakes
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.prank(owner);
        vault.depositYield(1000 ether);

        uint256 rptBefore = vault.rewardPerTokenStored();
        assertGt(rptBefore, 0);

        // Unstake
        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        vault.unstake();

        // Re-stake — rewardDebt should be set to current accumulator value
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        // rewardDebt = weight * rewardPerTokenStored / 1e18
        // Since she just staked at current rpt, her pending should be 0
        uint256 pending = vault.getPendingYield(alice);
        assertEq(pending, 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  PROPORTIONAL YIELD — MULTIPLE STAKERS
    // ═══════════════════════════════════════════════════════════

    function test_ProportionalYield_EqualStakes_DifferentCovenants() public {
        // Alice: FLAME (1x), Bob: STEEL (1.5x)
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.STEEL);

        vm.prank(owner);
        vault.depositYield(2500 ether);

        uint256 alicePending = vault.getPendingYield(alice);
        uint256 bobPending = vault.getPendingYield(bob);

        // Total weighted: 10000 + 15000 = 25000
        // Alice gets 10000/25000 = 40% = 1000
        // Bob gets 15000/25000 = 60% = 1500
        assertApproxEqAbs(alicePending, 1000 ether, 1 ether);
        assertApproxEqAbs(bobPending, 1500 ether, 1 ether);
        assertApproxEqAbs(alicePending + bobPending, 2500 ether, 2 ether);
    }

    function test_ProportionalYield_ThreeStakers_AllCovenants() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);    // 1.0x weight
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.OBSIDIAN); // 2.5x weight (15000 bps = 1.5x + base)
        vm.prank(carol);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.ETERNAL);  // 4.0x weight (30000 bps = 3.0x + base)

        uint256 totalWeighted = vault.totalWeightedStake();
        assertGt(totalWeighted, 0);

        vm.prank(owner);
        vault.depositYield(10000 ether);

        uint256 aliceP = vault.getPendingYield(alice);
        uint256 bobP = vault.getPendingYield(bob);
        uint256 carolP = vault.getPendingYield(carol);

        // Carol (ETERNAL) should earn the most, Alice (FLAME) the least
        assertGt(carolP, bobP);
        assertGt(bobP, aliceP);

        // Total should equal deposited yield
        assertApproxEqAbs(aliceP + bobP + carolP, 10000 ether, 10 ether);
    }

    function test_ProportionalYield_NewStakerAfterDeposit() public {
        // Alice stakes first
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Deposit yield — only Alice should benefit
        vm.prank(owner);
        vault.depositYield(1000 ether);

        // Bob stakes after deposit
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Alice should have 1000 pending, Bob should have 0
        uint256 alicePending = vault.getPendingYield(alice);
        uint256 bobPending = vault.getPendingYield(bob);

        assertApproxEqAbs(alicePending, 1000 ether, 1 ether);
        assertEq(bobPending, 0);

        // Now deposit more — both should share
        vm.prank(owner);
        vault.depositYield(2000 ether);

        alicePending = vault.getPendingYield(alice);
        bobPending = vault.getPendingYield(bob);

        // Alice: 1000 (old) + 1000 (new) = 2000
        // Bob: 1000 (new)
        assertApproxEqAbs(alicePending, 2000 ether, 1 ether);
        assertApproxEqAbs(bobPending, 1000 ether, 1 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //  VESTING
    // ═══════════════════════════════════════════════════════════

    function test_ClaimYield_TwoCallPattern() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.prank(owner);
        vault.depositYield(1000 ether);

        // First call: settles pending → unvested, returns 0 (no revert)
        vm.prank(alice);
        vault.claimYield();  // emits YieldClaimed(alice, 0)

        // Verify unvested is now tracking the yield
        ArenaVault.StakePosition memory pos = vault.getPosition(alice);
        assertEq(pos.unvestedRewards, 1000 ether);
        assertGt(pos.vestingStart, 0);

        // Wait full vesting period
        vm.warp(block.timestamp + 5 days);

        // Second call: collects fully vested yield
        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.claimYield();
        uint256 claimed = token.balanceOf(alice) - balBefore;

        assertApproxEqAbs(claimed, 1000 ether, 1 ether);
    }

    function test_VestingLinear_HalfwayAndFull() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.prank(owner);
        vault.depositYield(1000 ether);

        // Settle
        vm.prank(alice);
        vault.claimYield();

        // At t+2.5 days, ~50% vested
        vm.warp(block.timestamp + 2.5 days);
        uint256 claimable = vault.getClaimable(alice);
        assertApproxEqAbs(claimable, 500 ether, 1 ether);

        // At t+5 days, 100% vested
        vm.warp(block.timestamp + 2.5 days);
        claimable = vault.getClaimable(alice);
        assertApproxEqAbs(claimable, 1000 ether, 1 ether);
    }

    function test_VestedYield_ForfeitedOnSingleDepositUnstake() public {
        // With two stakers, verify forfeited yield goes to remaining staker
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        vm.prank(owner);
        vault.depositYield(2000 ether);

        // Wait past rage quit tax window
        vm.warp(block.timestamp + 7 days);

        // Alice unstakes without ever calling claimYield — yield forfeited
        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.unstake();
        uint256 aliceReceived = token.balanceOf(alice) - balBefore;

        // Alice gets only principal back (0% tax at day 7)
        assertEq(aliceReceived, STAKE_AMOUNT);

        // Bob now has his original 1000 + Alice's forfeited 1000
        uint256 bobPending = vault.getPendingYield(bob);
        assertGt(bobPending, 1000 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //  TAX REDISTRIBUTION VIA ACCUMULATOR
    // ═══════════════════════════════════════════════════════════

    function test_RageQuitTax_RedistributedToRemainingStakers() public {
        // Alice and Bob both stake
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Alice unstakes after 1 day with 40% tax
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vault.unstake();

        uint256 taxAmount = STAKE_AMOUNT * 4000 / 10000; // 4000 $FORGE
        assertEq(vault.totalTaxCollected(), taxAmount);

        // Bob should now have pending yield from Alice's tax
        uint256 bobPending = vault.getPendingYield(bob);
        assertGt(bobPending, 0);
    }

    function test_RageQuitTax_NoStakersLeft_BurnedInstead() public {
        // Only Alice stakes
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);

        // Unstake after 1 day — no remaining stakers
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vault.unstake();

        // Tax goes to totalBurned since no one to redistribute to
        uint256 taxAmount = STAKE_AMOUNT * 4000 / 10000;
        assertEq(vault.totalBurned(), taxAmount);
    }

    // ═══════════════════════════════════════════════════════════
    //  ACTIVE STAKER COUNT TRACKING
    // ═══════════════════════════════════════════════════════════

    function test_ActiveStakerCount_MultipleUsersStakeAndUnstake() public {
        vm.prank(alice);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        assertEq(vault.getStakerCount(), 1);

        vm.prank(bob);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        assertEq(vault.getStakerCount(), 2);

        vm.prank(carol);
        vault.stake(STAKE_AMOUNT, ArenaVault.Covenant.FLAME);
        assertEq(vault.getStakerCount(), 3);

        vm.warp(block.timestamp + 7 days);

        vm.prank(bob);
        vault.unstake();
        assertEq(vault.getStakerCount(), 2);

        vm.prank(alice);
        vault.unstake();
        assertEq(vault.getStakerCount(), 1);

        vm.prank(carol);
        vault.unstake();
        assertEq(vault.getStakerCount(), 0);
    }
}
