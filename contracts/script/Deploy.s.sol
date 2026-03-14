// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ForgeToken.sol";
import "../src/ArenaVault.sol";
import "../src/ForgeArena.sol";

contract DeployForge is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy ForgeToken (1B supply minted to deployer)
        ForgeToken token = new ForgeToken(deployer);
        console.log("ForgeToken deployed at:", address(token));
        console.log("Total supply:", token.totalSupply());

        // 2. Deploy ArenaVault
        ArenaVault vault = new ArenaVault(address(token), deployer);
        console.log("ArenaVault deployed at:", address(vault));

        // 3. Deploy ForgeArena
        ForgeArena arena = new ForgeArena(address(token), address(vault), treasury, deployer);
        console.log("ForgeArena deployed at:", address(arena));

        // 4. Authorize ForgeArena as depositor on ArenaVault
        vault.setDepositor(address(arena), true);
        console.log("ForgeArena authorized as vault depositor");

        // 5. Transfer 50% (500M) to vault as treasury
        uint256 vaultTreasury = 500_000_000 ether;
        token.transfer(address(vault), vaultTreasury);
        console.log("Transferred 500M FORGE to vault");

        // 6. Approve vault to spend deployer's tokens (for yield deposits)
        token.approve(address(vault), type(uint256).max);
        console.log("Approved vault for yield deposits");

        // 7. Approve arena to spend deployer's tokens (optional, for admin ops)
        token.approve(address(arena), type(uint256).max);
        console.log("Approved arena for admin ops");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("ForgeToken:", address(token));
        console.log("ArenaVault:", address(vault));
        console.log("ForgeArena:", address(arena));
        console.log("Treasury:  ", treasury);
        console.log("Deployer:  ", deployer);
    }
}
