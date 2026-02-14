
const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const incidentManager = new ethers.Contract(process.env.INCIDENT_MANAGER_ADDRESS, [
        "function raiseIncident(uint256 chainId, uint8 failureType, uint8 severity, uint8 priority, uint256 lastHealthyBlock, uint256 lastHealthyTimestamp, string description, uint256 parentIncidentId) external returns (uint256)"
    ], wallet);

    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    console.log("🚀 Raising test incident (Nonce: " + nonce + ")...");
    const tx = await incidentManager.raiseIncident(
        421614,
        0, // SequencerStall
        1, // Critical
        0, // P0
        0,
        0,
        "TEST RE-SYNC INCIDENT " + Date.now(),
        0,
        { gasLimit: 500000, nonce: nonce }
    );
    console.log("Hash:", tx.hash);
    await tx.wait();
    console.log("✅ Incident raised!");
}

main().catch(console.error);
