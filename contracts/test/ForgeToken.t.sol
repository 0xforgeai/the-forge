// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ForgeToken.sol";

contract ForgeTokenTest is Test {
    ForgeToken public token;
    address public owner = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);

    function setUp() public {
        vm.prank(owner);
        token = new ForgeToken(owner);
    }

    function test_InitialSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(owner), 1_000_000_000 ether);
    }

    function test_Name() public view {
        assertEq(token.name(), "The Forge");
        assertEq(token.symbol(), "FORGE");
    }

    function test_Transfer() public {
        vm.prank(owner);
        token.transfer(alice, 1000 ether);
        assertEq(token.balanceOf(alice), 1000 ether);
    }

    function test_Burn() public {
        vm.prank(owner);
        token.transfer(alice, 1000 ether);

        vm.prank(alice);
        token.burn(500 ether);

        assertEq(token.balanceOf(alice), 500 ether);
        assertEq(token.totalSupply(), 1_000_000_000 ether - 500 ether);
    }

    function test_MintReverts_ExceedsMaxSupply() public {
        // All 1B already minted, any mint should revert
        vm.prank(owner);
        vm.expectRevert();
        token.mint(alice, 1 ether);
    }

    function test_MintAfterBurn() public {
        // Burn some, but totalMinted stays at 1B so mint still reverts
        vm.prank(owner);
        token.burn(100 ether);

        vm.prank(owner);
        vm.expectRevert();
        token.mint(alice, 1 ether);
    }

    function test_OnlyOwnerCanMint() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 1 ether);
    }
}
