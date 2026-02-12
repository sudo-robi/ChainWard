const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log('Checking balance for:', wallet.address);
    try {
        const balance = await provider.getBalance(wallet.address);
        console.log('Balance:', ethers.formatEther(balance), 'ETH');

        if (balance > ethers.parseEther("0.01")) { // Check for at least 0.01 ETH
            console.log('SUFFICIENT FUNDS for deployment.');
        } else {
            console.log('INSUFFICIENT FUNDS. Need at least 0.01 ETH.');
        }
    } catch (e) {
        console.error('Error fetching balance:', e.message);
    }
}

main();
