#!/usr/bin/env node

/**
 * Set the reporter address on HealthReporter
 * Usage: node scripts/set-reporter.js <newReporterAddress>
 */

const ethers = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const INCIDENT_MANAGER_ADDRESS = process.env.INCIDENT_MANAGER_ADDRESS;
const HEALTH_REPORTER_ADDRESS = process.env.MONITOR_ADDRESS;

const INCIDENT_MANAGER_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_healthReporter", "type": "address" },
            { "internalType": "address", "name": "_newReporter", "type": "address" }
        ],
        "name": "updateReporter",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: node scripts/set-reporter.js <newReporterAddress>');
        console.log('');
        console.log('Example:');
        console.log('  node scripts/set-reporter.js 0xEB509499bC91EcdB05dE285FB1D880dceb82688E');
        console.log('');
        console.log('Environment variables required:');
        console.log('  RPC_URL - Arbitrum Sepolia RPC endpoint');
        console.log('  PRIVATE_KEY - Owner private key');
        process.exit(1);
    }

    const [newReporter] = args;

    if (!ethers.isAddress(newReporter)) {
        console.error('Error: Invalid reporter address');
        process.exit(1);
    }

    if (!process.env.RPC_URL || !process.env.PRIVATE_KEY) {
        console.error('Error: RPC_URL &PRIVATE_KEY environment variables required');
        process.exit(1);
    }

    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const incidents = new ethers.Contract(INCIDENT_MANAGER_ADDRESS, INCIDENT_MANAGER_ABI, signer);

        console.log('🔧 Setting health reporter...');
        console.log('');
        console.log('Configuration:');
        console.log(`  IncidentManager: ${INCIDENT_MANAGER_ADDRESS}`);
        console.log(`  HealthReporter: ${HEALTH_REPORTER_ADDRESS}`);
        console.log(`  New Reporter: ${newReporter}`);
        console.log('');

        console.log('⏳ Submitting transaction...');
        const tx = await incidents.updateReporter(HEALTH_REPORTER_ADDRESS, newReporter);

        console.log(`⏳ Transaction hash: ${tx.hash}`);
        const receipt = await tx.wait();

        console.log('');
        console.log('✅ Reporter updated successfully!');
        console.log(`  Block: ${receipt.blockNumber}`);
        console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
        console.log('');
        console.log('You can now submit health signals with address:', newReporter);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
