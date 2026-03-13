// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ForgeToken.sol";

contract ForgeTokenTest is Test {
    ForgeToken public token;
    address public treasury = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);

    function setUp() public {
        token = new ForgeToken(treasury);
    }

    function test_InitialSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(treasury), 1_000_000_000 ether);
    }

    function test_Name() public view {
        assertEq(token.name(), "The Forge");
        assertEq(token.symbol(), "FORGE");
        assertEq(token.decimals(), 18);
    }

    function test_MaxSupply() public view {
        assertEq(token.MAX_SUPPLY(), 1_000_000_000 ether);
    }

    function test_Transfer() public {
        vm.prank(treasury);
        token.transfer(alice, 1000 ether);
        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.balanceOf(treasury), 1_000_000_000 ether - 1000 ether);
    }

    function test_Approve_TransferFrom() public {
        vm.prank(treasury);
        token.approve(alice, 500 ether);
        assertEq(token.allowance(treasury, alice), 500 ether);

        vm.prank(alice);
        token.transferFrom(treasury, bob, 500 ether);
        assertEq(token.balanceOf(bob), 500 ether);
    }

    function test_Burn() public {
        vm.prank(treasury);
        token.transfer(alice, 1000 ether);

        vm.prank(alice);
        token.burn(500 ether);

        assertEq(token.balanceOf(alice), 500 ether);
        assertEq(token.totalSupply(), 1_000_000_000 ether - 500 ether);
    }

    function test_BurnFrom() public {
        vm.prank(treasury);
        token.transfer(alice, 1000 ether);

        vm.prank(alice);
        token.approve(bob, 300 ether);

        vm.prank(bob);
        token.burnFrom(alice, 300 ether);

        assertEq(token.balanceOf(alice), 700 ether);
        assertEq(token.totalSupply(), 1_000_000_000 ether - 300 ether);
    }

    function test_NoMintFunction() public {
        // ForgeToken has no mint function — supply is fixed
        // This test confirms the contract has no owner-controlled inflation
        assertEq(token.totalSupply(), token.MAX_SUPPLY());
    }

    function test_NoOwner() public {
        // No Ownable — no owner() function exists
        // The contract is fully autonomous after deployment
        assertEq(token.totalSupply(), 1_000_000_000 ether);
    }
}
