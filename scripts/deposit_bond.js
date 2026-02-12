const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    const RPC = process.env.RPC_URL;
    const PK = process.env.PRIVATE_KEY;
    const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
    const CHAIN_ID = Number(process.env.CHAIN_ID || '421614');

    if (!PK || !RPC || !REGISTRY_ADDRESS) {
        console.error('Missing env vars (PRIVATE_KEY, RPC_URL, or REGISTRY_ADDRESS)');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);

    console.log('Wallet:', wallet.address);
    console.log('Registry:', REGISTRY_ADDRESS);
    console.log('Chain ID:', CHAIN_ID);

    const abi = [
        'function depositBond(uint256 chainId) payable',
        'function getBond(uint256 chainId) view returns (uint256)'
    ];

    const registry = new ethers.Contract(REGISTRY_ADDRESS, abi, wallet);

    // Check current bond
    const currentBond = await registry.getBond(CHAIN_ID);
    console.log('Current bond:', ethers.formatEther(currentBond), 'ETH');

    if (currentBond > 0n) {
        console.log('✅ Bond already deposited');
        process.exit(0);
    }

    // Deposit a small bond (0.001 ETH for demo)
    const bondAmount = ethers.parseEther('0.001');
    console.log('Depositing bond:', ethers.formatEther(bondAmount), 'ETH');

    const tx = await registry.depositBond(CHAIN_ID, { value: bondAmount });
    console.log('Tx:', tx.hash);
    await tx.wait();
    console.log('✅ Bond deposited successfully');

    // Verify
    const newBond = await registry.getBond(CHAIN_ID);
    console.log('New bond:', ethers.formatEther(newBond), 'ETH');
}

main().catch(console.error);
