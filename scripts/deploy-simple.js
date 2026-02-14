#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ABI stubs for minimal deployment
const OrbitChainRegistryABI = [
  "constructor()",
  "function setMonitorAddress(address _monitor) external",
  "function registerChain(uint256 chainId, address operator, uint256 expectedBlockTime, uint256 maxBlockLag, string memory name) external",
  "function slashBond(uint256 chainId, uint256 amount, address payable recipient) external"
];

const IncidentManagerABI = [
  "constructor()",
  "function setReporterAuthorization(address _reporter, bool _authorized) external"
];

const HealthReporterABI = [
  "constructor(address registryAddress, address incidentManagerAddress, address reporterAddress)"
];

async function main() {
  const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const PK = process.env.PRIVATE_KEY;
  
  if (!PK) {
    console.error('Set PRIVATE_KEY in .env to deploy');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  
  console.log('Deploying from:', wallet.address);
  console.log('Network RPC:', RPC);
  
  // Get balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');

  if (balance < ethers.parseEther('0.01')) {
    console.error('Insufficient balance for deployment');
    process.exit(1);
  }

  // Since forge build is failing due to dependencies, we'll use hardcoded bytecode for minimal contracts
  // For a real deployment, you should fix the forge-std issue or use a different build system
  
  console.log('\n=== DEPLOYMENT INFO ===');
  console.log('To complete deployment:');
  console.log('1. Fix forge-std compilation errors');
  console.log('2. Run: forge build');
  console.log('3. Then use: node scripts/deploy.js');
  console.log('\nOR deploy using remix at:');
  console.log('https://remix.ethereum.org/');
}

main().catch((e) => { console.error(e); process.exit(1); });
