#!/usr/bin/env node

/**
 * Initialize ChainWard contracts with chain configuration
 * Usage: node scripts/init.js <chainId> <operator> <blockTime> <maxLag> <chainName>
 */

const ethers = require('ethers');
require('dotenv').config();

const REGISTRY_ADDRESS = '0xf8f7EE86662e6eC391033EFcF4221057F723f9B1';

const REGISTRY_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "chainId", "type": "uint256" },
            { "internalType": "address", "name": "operator", "type": "address" },
            { "internalType": "uint256", "name": "expectedBlockTime", "type": "uint256" },
            { "internalType": "uint256", "name": "maxBlockLag", "type": "uint256" },
            { "internalType": "string", "name": "name", "type": "string" }
        ],
        "name": "registerChain",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "chainId", "type": "uint256" }],
        "name": "getChain",
        "outputs": [
            {
                "components": [
                    { "internalType": "address", "name": "operator", "type": "address" },
                    { "internalType": "address", "name": "pendingOperator", "type": "address" },
                    { "internalType": "uint256", "name": "operatorTransferTime", "type": "uint256" },
                    { "internalType": "uint256", "name": "expectedBlockTime", "type": "uint256" },
                    { "internalType": "uint256", "name": "maxBlockLag", "type": "uint256" },
                    { "internalType": "bool", "name": "isActive", "type": "bool" },
                    { "internalType": "string", "name": "name", "type": "string" }
                ],
                "internalType": "struct OrbitChainRegistry.ChainConfig",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 5) {
        console.log('Usage: node scripts/init.js <chainId> <operator> <blockTime> <maxLag> <chainName>');
        console.log('');
        console.log('Example:');
        console.log('  node scripts/init.js 421614 0x1234...5678 250 60 "Arbitrum Sepolia"');
        console.log('');
        console.log('Environment variables required:');
        console.log('  RPC_URL - Arbitrum Sepolia RPC endpoint');
        console.log('  PRIVATE_KEY - Deployer private key (must be owner)');
        process.exit(1);
    }

    const [chainId, operator, blockTime, maxLag, chainName] = args;
    
    if (!process.env.RPC_URL || !process.env.PRIVATE_KEY) {
        console.error('Error: RPC_URL &PRIVATE_KEY environment variables required');
        process.exit(1);
    }

    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);

        console.log('🔍 Initializing ChainWard...');
        console.log('');
        console.log('Configuration:');
        console.log(`  Chain ID: ${chainId}`);
        console.log(`  Operator: ${operator}`);
        console.log(`  Expected Block Time: ${blockTime} ms`);
        console.log(`  Max Block Lag: ${maxLag} blocks`);
        console.log(`  Chain Name: ${chainName}`);
        console.log(`  Registry: ${REGISTRY_ADDRESS}`);
        console.log('');

        // Check if chain already registered
        try {
            const existing = await registry.getChain(chainId);
            if (existing.isActive) {
                console.log('⚠️  Chain already registered!');
                console.log(`  Name: ${existing.name}`);
                console.log(`  Operator: ${existing.operator}`);
                console.log(`  Block Time: ${existing.expectedBlockTime} ms`);
                console.log(`  Max Lag: ${existing.maxBlockLag} blocks`);
                process.exit(0);
            }
        } catch (e) {
            // Chain not registered, proceed
        }

        console.log('📝 Submitting transaction...');
        const tx = await registry.registerChain(
            chainId,
            operator,
            blockTime,
            maxLag,
            chainName
        );
        
        console.log(`⏳ Transaction hash: ${tx.hash}`);
        const receipt = await tx.wait();
        
        console.log('');
        console.log('✅ Chain registered successfully!');
        console.log(`  Block: ${receipt.blockNumber}`);
        console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
        console.log('');
        console.log('Your dashboard should now display:');
        console.log(`  ✓ Chain Name: ${chainName}`);
        console.log(`  ✓ Expected Block Time: ${blockTime} ms`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
