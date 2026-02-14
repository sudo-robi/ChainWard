#!/usr/bin/env node
const ethers = require('ethers');
require('dotenv').config();

const MONITOR_ADDRESS = process.env.MONITOR_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const HealthReporterAbi = [
    "function submitHealthSignal(uint256 chainId, uint256 blockNumber, uint256 blockTimestamp, uint256 sequencerNumber, bool sequencerHealthy, string details, uint256 l1BatchNumber, uint256 l1BatchTimestamp, bool bridgeHealthy) external"
];

async function stressTest() {
    console.log('🔥 Starting ChainWard Chaos andStress Test');
    console.log('-----------------------------------------');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(MONITOR_ADDRESS, HealthReporterAbi, wallet);

    const CHAIN_ID = 421614;
    let blockNum = 1000;

    const sendSignal = async (isHealthy = true) => {
        try {
            const tx = await contract.submitHealthSignal(
                CHAIN_ID,
                blockNum++,
                Math.floor(Date.now() / 1000),
                blockNum,
                isHealthy,
                isHealthy ? "Operational" : "CHAOS_INJECTION",
                Math.floor(blockNum / 10),
                Math.floor(Date.now() / 1000),
                isHealthy
            );
            console.log(`[${isHealthy ? '🟢' : '🔴'}] Signal sent: ${tx.hash}`);
        } catch (e) {
            console.error('❌ Stress Signal Failed:', e.message);
        }
    };

    // Load Simulation: Send signals every 31s (to bypass rate limit)
    console.log('🚀 Initiating load: 1 signal/31s (Contract Rate Limit: 30s)');
    const interval = setInterval(() => sendSignal(true), 31000);

    // Chaos Monkey: Inject failure every 15 seconds
    const chaosInterval = setInterval(() => {
        console.log('🐒 Chaos Monkey injecting failure!');
        sendSignal(false);
    }, 15000);

    // Stop after 1 minute
    setTimeout(() => {
        clearInterval(interval);
        clearInterval(chaosInterval);
        console.log('\n✅ Stress test completed successfully.');
        process.exit(0);
    }, 60000);
}

if (!PRIVATE_KEY || !MONITOR_ADDRESS) {
    console.error('Missing ENV: PRIVATE_KEY or MONITOR_ADDRESS');
    process.exit(1);
}

stressTest();
