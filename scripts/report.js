#!/usr/bin/env node
// Minimal reporter: submits heartbeats &prints chain status
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const PK = process.env.PRIVATE_KEY;
  if (!PK) {
    console.error('Set PRIVATE_KEY in .env to submit heartbeats');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  const registryAddress = process.env.REGISTRY_ADDRESS;
  const monitorAddress = process.env.MONITOR_ADDRESS;
  if (!registryAddress || !monitorAddress) {
    console.error('Set REGISTRY_ADDRESS &MONITOR_ADDRESS in .env');
    process.exit(1);
  }

  const RegistryAbi = [
    'function getOperator(uint256) view returns (address)',
    'function getHeartbeatThreshold(uint256) view returns (uint256)',
    'function getBond(uint256) view returns (uint256)'
  ];
  const MonitorAbi = [
    'function submitHeartbeat(uint256,uint256,uint256)'
  ];

  const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
  const monitor = new ethers.Contract(monitorAddress, MonitorAbi, wallet);

  const chainId = Number(process.env.CHAIN_ID || '1');
  console.log('Submitting heartbeat for chain', chainId, 'from', wallet.address);
  const tx = await monitor.submitHeartbeat(chainId, Date.now(), 0);
  console.log('tx hash', tx.hash);
  await tx.wait();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
