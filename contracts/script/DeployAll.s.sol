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
 * Deploys ArenaVault, VictoryEscrow, ForgeBonds, and ForgeArena
 * against an EXISTING ForgeToken (e.g., launched via Doppler).
 *
 * Usage:
 *   forge script script/DeployAll.s.sol:DeployAll \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvvv
 *
 * Required env vars:
 *   PRIVATE_KEY           — Deployer private key
 *   FORGE_TOKEN_ADDRESS   — Already-deployed ForgeToken address
 *   TREASURY              — Treasury address (defaults to deployer)
 *   INSTANT_BURN_BPS      — VictoryEscrow burn on instant claims (default: 500 = 5%)
 *   BASE_APR_BPS          — ForgeBonds base APR (default: 1000 = 10%)
 *   VAULT_SEED_AMOUNT     — Tokens to seed vault with (default: 0, set in wei)
 */
contract DeployAll is Script {
    function run() external {
        // ─── Config ──────────────────────────────────────
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);
        address tokenAddr = vm.envAddress("FORGE_TOKEN_ADDRESS");

        uint16 instantBurnBps = uint16(vm.envOr("INSTANT_BURN_BPS", uint256(500)));    // 5%
        uint32 baseAprBps     = uint32(vm.envOr("BASE_APR_BPS", uint256(1000)));       // 10%
        uint256 vaultSeed     = vm.envOr("VAULT_SEED_AMOUNT", uint256(0));

        console.log("");
        console.log("=== Forge Ecosystem Deployment ===");
        console.log("Deployer:        ", deployer);
        console.log("Treasury:        ", treasury);
        console.log("ForgeToken:      ", tokenAddr);
        console.log("Instant Burn:    ", instantBurnBps, "bps");
        console.log("Base APR:        ", baseAprBps, "bps");
        console.log("");

        ForgeToken token = ForgeToken(tokenAddr);

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

        // Arena knows about vault and escrow
        arena.setArenaVault(address(vault));
        console.log("[wire] arena.setArenaVault  ->", address(vault));

        arena.setVictoryEscrow(address(escrow));
        console.log("[wire] arena.setVictoryEscrow ->", address(escrow));

        // Escrow knows about bonds
        escrow.setForgeBonds(address(bonds));
        console.log("[wire] escrow.setForgeBonds ->", address(bonds));

        // Vault authorizes arena as depositor
        vault.setDepositor(address(arena), true);
        console.log("[wire] vault.setDepositor(arena) -> true");

        // Vault authorizes escrow as depositor (for yield routing)
        vault.setDepositor(address(escrow), true);
        console.log("[wire] vault.setDepositor(escrow) -> true");

        // ─── 6. Approvals ────────────────────────────────
        console.log("");
        console.log("=== Approvals ===");

        // Approve vault to spend deployer's tokens (for yield deposits)
        token.approve(address(vault), type(uint256).max);
        console.log("[approve] vault   -> max");

        // Approve arena to spend deployer's tokens (for admin ops)
        token.approve(address(arena), type(uint256).max);
        console.log("[approve] arena   -> max");

        // Approve escrow to spend deployer's tokens
        token.approve(address(escrow), type(uint256).max);
        console.log("[approve] escrow  -> max");

        // ─── 7. Optional: Seed vault ─────────────────────
        if (vaultSeed > 0) {
            token.transfer(address(vault), vaultSeed);
            console.log("[seed] Transferred", vaultSeed / 1 ether, "FORGE to vault");
        }

        vm.stopBroadcast();

        // ─── Summary ─────────────────────────────────────
        console.log("");
        console.log("========================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("  ForgeToken:      ", tokenAddr);
        console.log("  ArenaVault:      ", address(vault));
        console.log("  VictoryEscrow:   ", address(escrow));
        console.log("  ForgeBonds:      ", address(bonds));
        console.log("  ForgeArena:      ", address(arena));
        console.log("  Treasury:        ", treasury);
        console.log("  Deployer:        ", deployer);
        console.log("========================================");
        console.log("");
        console.log("  Next steps:");
        console.log("  1. Set env vars on Railway:");
        console.log("     FORGE_TOKEN_ADDRESS=", tokenAddr);
        console.log("     ARENA_VAULT_ADDRESS=", address(vault));
        console.log("     VICTORY_ESCROW_ADDRESS=", address(escrow));
        console.log("     FORGE_BONDS_ADDRESS=", address(bonds));
        console.log("     FORGE_ARENA_ADDRESS=", address(arena));
        console.log("  2. Run: npx prisma migrate dev");
        console.log("  3. Restart server");
        console.log("========================================");
    }
}
