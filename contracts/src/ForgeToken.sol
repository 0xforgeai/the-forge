// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ForgeToken
 * @notice $FORGE — ERC-20 token for The Forge AI gladiator arena.
 *         1B total supply. Burnable. Owner can mint for treasury emissions.
 */
contract ForgeToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether; // 1B tokens
    uint256 public totalMinted;

    error ExceedsMaxSupply(uint256 requested, uint256 remaining);

    constructor(address _initialOwner)
        ERC20("The Forge", "FORGE")
        Ownable(_initialOwner)
    {
        // Mint initial supply to deployer/owner
        _mint(_initialOwner, MAX_SUPPLY);
        totalMinted = MAX_SUPPLY;
    }

    /**
     * @notice Mint new tokens (only owner, for treasury emissions).
     *         Reverts if total minted would exceed MAX_SUPPLY.
     *         In practice, this is not needed if full supply is minted at deploy.
     *         Kept for future flexibility (e.g., bridging scenarios).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        if (totalMinted + amount > MAX_SUPPLY) {
            revert ExceedsMaxSupply(amount, MAX_SUPPLY - totalMinted);
        }
        totalMinted += amount;
        _mint(to, amount);
    }
}
