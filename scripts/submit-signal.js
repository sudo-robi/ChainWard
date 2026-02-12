#!/usr/bin/env node

/**
 * Submit a health signal to the HealthReporter contract
 * Usage: node scripts/submit-signal.js <chainId> <blockNumber> <blockTimestamp>
 */

const ethers = require('ethers');
require('dotenv').config();

const HEALTH_REPORTER_ADDRESS = '0x4feF295fA8eB6b0A387d2a0Dd397827eF1815a8d';

const HEALTH_REPORTER_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "chainId", "type": "uint256" },
            { "internalType": "uint256", "name": "blockNumber", "type": "uint256" },
            { "internalType": "uint256", "name": "blockTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "sequencerNumber", "type": "uint256" },
            { "internalType": "bool", "name": "sequencerHealthy", "type": "bool" },
            { "internalType": "string", "name": "details", "type": "string" }
        ],
        "name": "submitHealthSignal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "name": "lastBlockNumber",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "name": "lastSignalTime",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
];

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log('Usage: node scripts/submit-signal.js <chainId> <blockNumber> <blockTimestamp>');
        console.log('');
        console.log('Example:');
        console.log('  node scripts/submit-signal.js 421614 12345 1707549600');
        console.log('');
        console.log('Environment variables required:');
        console.log('  RPC_URL - Arbitrum Sepolia RPC endpoint');
        console.log('  PRIVATE_KEY - Submitter private key');
        process.exit(1);
    }

    const [chainId, blockNumber, blockTimestamp] = args;

    if (!process.env.RPC_URL || !process.env.PRIVATE_KEY) {
        console.error('Error: RPC_URL and PRIVATE_KEY environment variables required');
        process.exit(1);
    }

    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const reporter = new ethers.Contract(HEALTH_REPORTER_ADDRESS, HEALTH_REPORTER_ABI, signer);

        console.log('📝 Submitting health signal...');
        console.log('');
        console.log('Configuration:');
        console.log(`  Chain ID: ${chainId}`);
        console.log(`  Block Number: ${blockNumber}`);
        console.log(`  Block Timestamp: ${blockTimestamp}`);
        console.log(`  Sequencer Number: 0`);
        console.log(`  Sequencer Healthy: true`);
        console.log(`  Reporter: ${HEALTH_REPORTER_ADDRESS}`);
        console.log('');

        console.log('⏳ Submitting transaction...');
        const tx = await reporter.submitHealthSignal(
            chainId,
            blockNumber,
            blockTimestamp,
            0, // sequencerNumber
            true, // sequencerHealthy
            'Health signal from dashboard initialization'
        );

        console.log(`⏳ Transaction hash: ${tx.hash}`);
        const receipt = await tx.wait();

        console.log('');
        console.log('✅ Health signal submitted successfully!');
        console.log(`  Block: ${receipt.blockNumber}`);
        console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
        console.log('');
        console.log('Your dashboard should now display:');
        console.log(`  ✓ Current Block: ${blockNumber}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
