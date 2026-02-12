const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

const RegistryAbi = [
    'function owner() view returns (address)'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, RegistryAbi, provider);

    try {
        const owner = await registry.owner();
        console.log('Registry Owner:', owner);

        const currentWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        console.log('Current Wallet:', currentWallet.address);

        if (owner.toLowerCase() === currentWallet.address.toLowerCase()) {
            console.log('MATCH: Current wallet IS the owner.');
        } else {
            console.log('MISMATCH: Current wallet is NOT the owner.');
        }
    } catch (e) {
        console.error('Error fetching owner:', e.message);
    }
}

main();
