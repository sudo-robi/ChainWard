const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const MONITOR_ADDRESS = process.env.MONITOR_ADDRESS;
const CHAIN_ID = 421614;

console.log('--- Configuration ---');
console.log('RPC:', RPC_URL);
console.log('Registry:', REGISTRY_ADDRESS);
console.log('Monitor:', MONITOR_ADDRESS);
console.log('Chain ID:', CHAIN_ID);

const RegistryAbi = [
    'function getBond(uint256) view returns (uint256)',
    'function getOperator(uint256) view returns (address)',
    'function getHeartbeatThreshold(uint256) view returns (uint256)'
];

const MonitorAbi = [
    'function lastHeartbeat(uint256) view returns (uint256)',
    'function inIncident(uint256) view returns (bool)'
];

async function main() {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        console.log('\n--- Testing Connection ---');
        const net = await provider.getNetwork();
        console.log('Connected to network:', net.name, 'chainId:', net.chainId.toString());

        console.log('\n--- Testing Registry Read ---');
        const registry = new ethers.Contract(REGISTRY_ADDRESS, RegistryAbi, provider);

        try {
            const operator = await registry.getOperator(CHAIN_ID);
            console.log('getOperator:', operator);
        } catch (e) {
            console.error('getOperator FAILED:', e.message);
        }

        try {
            const bond = await registry.getBond(CHAIN_ID);
            console.log('getBond:', ethers.formatEther(bond));
        } catch (e) {
            console.error('getBond FAILED:', e.message);
        }

        console.log('\n--- Testing Monitor Read ---');
        const monitor = new ethers.Contract(MONITOR_ADDRESS, MonitorAbi, provider);

        try {
            const last = await monitor.lastHeartbeat(CHAIN_ID);
            console.log('lastHeartbeat:', last.toString());
        } catch (e) {
            console.error('lastHeartbeat FAILED:', e.message);
        }

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
    }
}

main();
