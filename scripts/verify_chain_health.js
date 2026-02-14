// Quick script to verify your RPC &contract addresses for Chain Health
// Usage: node scripts/verify_chain_health.js

const { ethers } = require('ethers');
require('dotenv').config();

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
const monitorAddress = process.env.NEXT_PUBLIC_MONITOR_ADDRESS;
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);

const RegistryAbi = [
  'function getHeartbeatThreshold(uint256) view returns (uint256)'
];
const MonitorAbi = [
  'function lastHeartbeat(uint256) view returns (uint256)',
  'function inIncident(uint256) view returns (bool)'
];

async function main() {
  if (!rpcUrl || !registryAddress || !monitorAddress || !chainId) {
    console.error('Missing .env values. Please check your .env file.');
    process.exit(1);
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
  const monitor = new ethers.Contract(monitorAddress, MonitorAbi, provider);
  try {
    const threshold = await registry.getHeartbeatThreshold(chainId);
    const incident = await monitor.inIncident(chainId);
    const last = await monitor.lastHeartbeat(chainId);
    console.log('Chain Health:');
    console.log('  Block Time Threshold:', threshold.toString() + 's');
    console.log('  Status:', incident ? 'Incident' : 'Healthy');
    console.log('  Sequencer:', last.gt(0) ? 'Online' : 'Offline');
  } catch (e) {
    console.error('Error reading contract data:', e.message);
  }
}

main();
