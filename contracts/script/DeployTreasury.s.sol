// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ForgeTreasury.sol";
import "../src/ForgeArena.sol";

/**
 * @title DeployTreasury — Deploy ForgeTreasury and wire to existing ForgeArena
 *
 * Usage:
 *   source .env && forge script script/DeployTreasury.s.sol:DeployTreasury \
 *     --rpc-url "$BASE_RPC_URL" --broadcast --verify \
 *     --etherscan-api-key "$BASESCAN_API_KEY" -vvvv
 */
contract DeployTreasury is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // 5M tokens/week initial emission cap
        uint256 weeklyEmissionCap = vm.envOr("WEEKLY_EMISSION_CAP", uint256(5_000_000 ether));

        // Existing ForgeArena
        address arenaAddr = address(0x22FFDf9E88cEFE2781b9Ebe17eabd4388Ab6cff4);
        address vaultAddr = address(0x77917FD54484552F7d2c8bace5270C40c3fc1380);

        console.log("");
        console.log("=== Deploying ForgeTreasury ===");
        console.log("Deployer:          ", deployer);
        console.log("Weekly Cap:        ", weeklyEmissionCap / 1 ether, "FORGE");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        ForgeTreasury treasury = new ForgeTreasury(deployer, weeklyEmissionCap);
        console.log("[1/2] ForgeTreasury:   ", address(treasury));

        // Wire ForgeArena treasury to this contract
        ForgeArena(arenaAddr).setTreasury(address(treasury));
        console.log("[2/2] ForgeArena.setTreasury -> ", address(treasury));

        vm.stopBroadcast();

        console.log("");
        console.log("========================================");
        console.log("  FORGE_TREASURY_ADDRESS=", address(treasury));
        console.log("  ArenaVault:  ", vaultAddr);
        console.log("  ForgeArena:  ", arenaAddr);
        console.log("========================================");
        console.log("  Phase 2: after token launch, run SetToken with:");
        console.log("  FORGE_TREASURY_ADDRESS added to .env");
        console.log("========================================");
    }
}
