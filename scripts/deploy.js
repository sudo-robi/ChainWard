#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const PK = process.env.PRIVATE_KEY;
  if (!PK) {
    console.error('Set PRIVATE_KEY in .env to deploy');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  // Read compiled artifacts from out/ (forge build)
  const outDir = path.join(__dirname, '..', 'out');
  const registryJson = JSON.parse(fs.readFileSync(path.join(outDir, 'OrbitRegistry.json')));
  const monitorJson = JSON.parse(fs.readFileSync(path.join(outDir, 'HealthMonitor.json')));

  const RegistryFactory = new ethers.ContractFactory(registryJson.abi, registryJson.bytecode, wallet);
  const MonitorFactory = new ethers.ContractFactory(monitorJson.abi, monitorJson.bytecode, wallet);

  console.log('Deploying OrbitRegistry...');
  const registry = await RegistryFactory.deploy();
  await registry.waitForDeployment();
  console.log('OrbitRegistry:', registry.target);

  console.log('Deploying HealthMonitor...');
  const monitor = await MonitorFactory.deploy(registry.target);
  await monitor.waitForDeployment();
  console.log('HealthMonitor:', monitor.target);

  // Set monitor in registry (requires a tx from deployer)
  const tx = await registry.setMonitorAddress(monitor.target);
  await tx.wait();
  console.log('Wired monitor -> registry');

  console.log('Done. Save addresses to .env or use them directly.');
  console.log('REGISTRY_ADDRESS=' + registry.target);
  console.log('MONITOR_ADDRESS=' + monitor.target);
}

main().catch((e) => { console.error(e); process.exit(1); });
