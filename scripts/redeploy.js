const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

async function main() {
    console.log('🚀 Redeploying Contracts with Current Wallet...');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log('Deployer:', wallet.address);

    const outDir = path.join(__dirname, '../out');

    // Load Artifacts
    const registryArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'OrbitRegistry.sol', 'OrbitRegistry.json')));
    const monitorArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'HealthMonitor.sol', 'HealthMonitor.json')));
    const incidentArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'IncidentManager.sol', 'IncidentManager.json')));

    // Deploy OrbitRegistry
    console.log('Deploying OrbitRegistry...');
    const RegistryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet);
    const registry = await RegistryFactory.deploy();
    await registry.waitForDeployment();
    const registryParams = await registry.getDeployedCode();
    const registryAddress = await registry.getAddress();
    console.log('✅ OrbitRegistry:', registryAddress);

    // Deploy HealthMonitor
    console.log('Deploying HealthMonitor...');
    const MonitorFactory = new ethers.ContractFactory(monitorArtifact.abi, monitorArtifact.bytecode, wallet);
    const monitor = await MonitorFactory.deploy(registryAddress);
    await monitor.waitForDeployment();
    const monitorAddress = await monitor.getAddress();
    console.log('✅ HealthMonitor:', monitorAddress);

    // Deploy IncidentManager
    console.log('Deploying IncidentManager...');
    const IncidentFactory = new ethers.ContractFactory(incidentArtifact.abi, incidentArtifact.bytecode, wallet);
    const incidentManager = await IncidentFactory.deploy();
    await incidentManager.waitForDeployment();
    const incidentAddress = await incidentManager.getAddress();
    console.log('✅ IncidentManager:', incidentAddress);

    // Wiring
    console.log('Wiring contracts...');
    // IncidentManager: setRegistry
    let tx = await incidentManager.setRegistry(registryAddress);
    await tx.wait();
    console.log('✓ IncidentManager.setRegistry(registry)');

    // IncidentManager: setReporterContract (Monitor)
    tx = await incidentManager.setReporterContract(monitorAddress);
    await tx.wait();
    console.log('✓ IncidentManager.setReporterContract(monitor)');

    // Authorize Deployer as Reporter (for simulation)
    tx = await incidentManager.setReporterAuthorization(wallet.address, true);
    await tx.wait();
    console.log('✓ IncidentManager.setReporterAuthorization(deployer)');

    console.log('\n--- NEW ADDRESSES ---');
    console.log(`REGISTRY_ADDRESS=${registryAddress}`);
    console.log(`MONITOR_ADDRESS=${monitorAddress}`);
    console.log(`INCIDENT_MANAGER_ADDRESS=${incidentAddress}`);
}

main().catch(console.error);
