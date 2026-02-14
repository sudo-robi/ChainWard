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
    const registryArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'OrbitChainRegistry.sol', 'OrbitChainRegistry.json')));
    const reporterArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'HealthReporter.sol', 'HealthReporter.json')));
    const incidentArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'IncidentManager.sol', 'IncidentManager.json')));

    // Deploy OrbitChainRegistry
    console.log('Deploying OrbitChainRegistry...');
    const RegistryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet);
    const registry = await RegistryFactory.deploy();
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log('✅ OrbitChainRegistry:', registryAddress);

    // Deploy IncidentManager
    console.log('Deploying IncidentManager...');
    const IncidentFactory = new ethers.ContractFactory(incidentArtifact.abi, incidentArtifact.bytecode, wallet);
    const incidentManager = await IncidentFactory.deploy();
    await incidentManager.waitForDeployment();
    const incidentAddress = await incidentManager.getAddress();
    console.log('✅ IncidentManager:', incidentAddress);

    // Deploy HealthReporter
    console.log('Deploying HealthReporter...');
    const ReporterFactory = new ethers.ContractFactory(reporterArtifact.abi, reporterArtifact.bytecode, wallet);
    const reporter = await ReporterFactory.deploy(registryAddress, incidentAddress, wallet.address);
    await reporter.waitForDeployment();
    const reporterAddress = await reporter.getAddress();
    console.log('✅ HealthReporter:', reporterAddress);

    // Wiring
    console.log('Wiring contracts...');
    // IncidentManager: setRegistry
    let tx = await incidentManager.setRegistry(registryAddress);
    await tx.wait();
    console.log('✓ IncidentManager.setRegistry(registry)');

    // IncidentManager: setReporterAuthorization (HealthReporter)
    tx = await incidentManager.setReporterAuthorization(reporterAddress, true);
    await tx.wait();
    console.log('✓ IncidentManager.setReporterAuthorization(reporter)');

    // Register active chain in Registry
    console.log('Registering chain 421614 in Registry...');
    tx = await registry.registerChain(
        421614,
        wallet.address,
        13, // expectedBlockTime
        120, // maxBlockLag
        "Arbitrum Sepolia"
    );
    await tx.wait();
    console.log('✓ Registered chain 421614');

    console.log('\n--- NEW ADDRESSES ---');
    console.log(`REGISTRY_ADDRESS=${registryAddress}`);
    console.log(`MONITOR_ADDRESS=${reporterAddress}`);
    console.log(`INCIDENT_MANAGER_ADDRESS=${incidentAddress}`);
}

main().catch(console.error);
