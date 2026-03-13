// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title ForgeToken
 * @notice $FORGE — fixed-supply, burnable ERC-20 for The Forge arena.
 *         No owner. No mint. No pause. No fees. Pure ERC-20.
 *
 *         Blockaid-clean: no Ownable, no hidden admin functions,
 *         no transfer restrictions, no honeypot mechanics.
 *
 * Supply: 1,000,000,000 FORGE (1B)
 * Burns are deflationary — supply only goes down.
 */
contract ForgeToken is ERC20, ERC20Burnable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    constructor(address _treasury) ERC20("The Forge", "FORGE") {
        _mint(_treasury, MAX_SUPPLY);
    }
}
