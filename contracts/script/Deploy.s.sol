// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ForgeToken.sol";
import "../src/ArenaVault.sol";

contract DeployForge is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy ForgeToken (1B supply minted to deployer)
        ForgeToken token = new ForgeToken(deployer);
        console.log("ForgeToken deployed at:", address(token));
        console.log("Total supply:", token.totalSupply());

        // 2. Deploy ArenaVault
        ArenaVault vault = new ArenaVault(address(token), deployer);
        console.log("ArenaVault deployed at:", address(vault));

        // 3. Transfer 40% (400M) to vault as treasury
        uint256 treasuryAmount = 400_000_000 ether;
        token.transfer(address(vault), treasuryAmount);
        console.log("Transferred 400M FORGE to vault");

        // 4. Approve vault to spend deployer's tokens (for yield deposits)
        token.approve(address(vault), type(uint256).max);
        console.log("Approved vault for yield deposits");

        vm.stopBroadcast();
    }
}
