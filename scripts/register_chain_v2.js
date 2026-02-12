const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

// New OrbitRegistry ABI
const RegistryAbi = [
    'function registerChain(uint256, address, string, uint256) external'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, RegistryAbi, wallet);

    console.log('Registering chain 421614 on', REGISTRY_ADDRESS);
    console.log('Operator:', wallet.address);

    try {
        const tx = await registry.registerChain(
            421614,
            wallet.address,
            "https://arbitrum.io",
            300 // 5 minutes heartbeat threshold
        );
        console.log('Tx:', tx.hash);
        await tx.wait();
        console.log('Chain registered successfully!');
    } catch (e) {
        console.error('Registration failed:', e.message);
    }
}

main();
