// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ForgeToken.sol";
import "../src/ArenaVault.sol";
import "../src/ForgeArena.sol";
import "../src/VictoryEscrow.sol";
import "../src/ForgeBonds.sol";

/**
 * @title DeployAll — Full Forge Ecosystem Deployment
 *
 * Two-phase deployment:
 *   Phase 1: Deploy all contracts with address(0) as token (run now)
 *   Phase 2: Call setForgeToken() on all 4 contracts once token launches
 *
 * Usage:
 *   # Phase 1 — Deploy (no token needed)
 *   forge script script/DeployAll.s.sol:DeployAll \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY -vvvv
 *
 *   # Phase 2 — Set token (after launch)
 *   forge script script/DeployAll.s.sol:SetToken \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast -vvvv
 *
 * Required env vars (Phase 1):
 *   PRIVATE_KEY           — Deployer private key
 *   TREASURY              — Treasury address (defaults to deployer)
 *   INSTANT_BURN_BPS      — VictoryEscrow burn on instant claims (default: 500 = 5%)
 *   BASE_APR_BPS          — ForgeBonds base APR (default: 1000 = 10%)
 *
 * Required env vars (Phase 2, in addition to PRIVATE_KEY):
 *   FORGE_TOKEN_ADDRESS   — The launched token address
 *   ARENA_VAULT_ADDRESS   — From Phase 1 output
 *   VICTORY_ESCROW_ADDRESS — From Phase 1 output
 *   FORGE_BONDS_ADDRESS   — From Phase 1 output
 *   FORGE_ARENA_ADDRESS   — From Phase 1 output
 */
contract DeployAll is Script {
    function run() external {
        // ─── Config ──────────────────────────────────────
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);

        // Token address: use if available, otherwise deploy with address(0)
        address tokenAddr = vm.envOr("FORGE_TOKEN_ADDRESS", address(0));

        uint16 instantBurnBps = uint16(vm.envOr("INSTANT_BURN_BPS", uint256(500)));
        uint32 baseAprBps     = uint32(vm.envOr("BASE_APR_BPS", uint256(1000)));

        console.log("");
        console.log("=== Forge Ecosystem Deployment ===");
        console.log("Deployer:        ", deployer);
        console.log("Treasury:        ", treasury);
        console.log("ForgeToken:      ", tokenAddr == address(0) ? "NOT SET (Phase 1)" : "");
        if (tokenAddr != address(0)) console.log("ForgeToken:      ", tokenAddr);
        console.log("Instant Burn:    ", instantBurnBps, "bps");
        console.log("Base APR:        ", baseAprBps, "bps");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ─── 1. Deploy ArenaVault ────────────────────────
        ArenaVault vault = new ArenaVault(tokenAddr, deployer);
        console.log("[1/4] ArenaVault:      ", address(vault));

        // ─── 2. Deploy VictoryEscrow ─────────────────────
        VictoryEscrow escrow = new VictoryEscrow(tokenAddr, deployer, instantBurnBps);
        console.log("[2/4] VictoryEscrow:   ", address(escrow));

        // ─── 3. Deploy ForgeBonds ────────────────────────
        ForgeBonds bonds = new ForgeBonds(tokenAddr, block.timestamp, baseAprBps, deployer);
        console.log("[3/4] ForgeBonds:      ", address(bonds));

        // ─── 4. Deploy ForgeArena ────────────────────────
        ForgeArena arena = new ForgeArena(tokenAddr, address(vault), treasury, deployer);
        console.log("[4/4] ForgeArena:      ", address(arena));

        // ─── 5. Wire contracts ───────────────────────────
        console.log("");
        console.log("=== Wiring Contracts ===");

        arena.setArenaVault(address(vault));
        console.log("[wire] arena.setArenaVault     ->", address(vault));

        arena.setVictoryEscrow(address(escrow));
        console.log("[wire] arena.setVictoryEscrow  ->", address(escrow));

        escrow.setForgeBonds(address(bonds));
        console.log("[wire] escrow.setForgeBonds    ->", address(bonds));

        vault.setDepositor(address(arena), true);
        console.log("[wire] vault.setDepositor(arena)  -> true");

        vault.setDepositor(address(escrow), true);
        console.log("[wire] vault.setDepositor(escrow) -> true");

        vm.stopBroadcast();

        // ─── Summary ─────────────────────────────────────
        console.log("");
        console.log("========================================");
        console.log("  DEPLOYMENT COMPLETE");
        if (tokenAddr == address(0)) {
            console.log("  TOKEN NOT SET -- Run Phase 2 after launch");
        }
        console.log("========================================");
        console.log("  ArenaVault:      ", address(vault));
        console.log("  VictoryEscrow:   ", address(escrow));
        console.log("  ForgeBonds:      ", address(bonds));
        console.log("  ForgeArena:      ", address(arena));
        console.log("  Treasury:        ", treasury);
        console.log("  Deployer:        ", deployer);
        console.log("========================================");
        console.log("");
        console.log("  Save these env vars for Phase 2:");
        console.log("  ARENA_VAULT_ADDRESS=", address(vault));
        console.log("  VICTORY_ESCROW_ADDRESS=", address(escrow));
        console.log("  FORGE_BONDS_ADDRESS=", address(bonds));
        console.log("  FORGE_ARENA_ADDRESS=", address(arena));
        console.log("========================================");
    }
}

/**
 * @title SetToken — Phase 2: Set token address on all deployed contracts
 *
 * Run this AFTER the token launches and you have all contract addresses from Phase 1.
 * This calls setForgeToken() once on each contract — it can never be called again.
 */
contract SetToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddr = vm.envAddress("FORGE_TOKEN_ADDRESS");
        address vaultAddr = vm.envAddress("ARENA_VAULT_ADDRESS");
        address escrowAddr = vm.envAddress("VICTORY_ESCROW_ADDRESS");
        address bondsAddr = vm.envAddress("FORGE_BONDS_ADDRESS");
        address arenaAddr = vm.envAddress("FORGE_ARENA_ADDRESS");

        console.log("");
        console.log("=== Phase 2: Setting ForgeToken ===");
        console.log("Token:           ", tokenAddr);
        console.log("ArenaVault:      ", vaultAddr);
        console.log("VictoryEscrow:   ", escrowAddr);
        console.log("ForgeBonds:      ", bondsAddr);
        console.log("ForgeArena:      ", arenaAddr);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        ArenaVault(vaultAddr).setForgeToken(tokenAddr);
        console.log("[set] ArenaVault.setForgeToken     -> done");

        VictoryEscrow(escrowAddr).setForgeToken(tokenAddr);
        console.log("[set] VictoryEscrow.setForgeToken  -> done");

        ForgeBonds(bondsAddr).setForgeToken(tokenAddr);
        console.log("[set] ForgeBonds.setForgeToken     -> done");

        ForgeArena(arenaAddr).setForgeToken(tokenAddr);
        console.log("[set] ForgeArena.setForgeToken     -> done");

        // Set approvals for deployer
        ForgeToken token = ForgeToken(tokenAddr);
        token.approve(vaultAddr, type(uint256).max);
        token.approve(arenaAddr, type(uint256).max);
        token.approve(escrowAddr, type(uint256).max);
        console.log("[approve] All contracts approved");

        vm.stopBroadcast();

        console.log("");
        console.log("========================================");
        console.log("  TOKEN SET ON ALL CONTRACTS");
        console.log("  Contracts are now fully operational");
        console.log("========================================");
    }
}
