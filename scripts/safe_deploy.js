#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    console.log('🚀 SAFE DEPLOYMENT starting...');
    const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const PK = process.env.PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);
    console.log('Deployer:', wallet.address);

    let nonce = await provider.getTransactionCount(wallet.address, 'pending');
    console.log('Starting Nonce:', nonce);

    const outDir = path.join(__dirname, '..', 'out');
    const registryArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'OrbitChainRegistry.sol', 'OrbitChainRegistry.json')));
    const reporterArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'HealthReporter.sol', 'HealthReporter.json')));
    const incidentArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'IncidentManager.sol', 'IncidentManager.json')));

    // 1. Deploy Registry
    console.log(`[${nonce}] Deploying Registry...`);
    const RegistryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet);
    const registry = await RegistryFactory.deploy({ nonce: nonce++ });
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log('✅ Registry:', registryAddress);

    // 2. Deploy IncidentManager
    console.log(`[${nonce}] Deploying IncidentManager...`);
    const IncidentFactory = new ethers.ContractFactory(incidentArtifact.abi, incidentArtifact.bytecode, wallet);
    const incidentManager = await IncidentFactory.deploy({ nonce: nonce++ });
    await incidentManager.waitForDeployment();
    const incidentAddress = await incidentManager.getAddress();
    console.log('✅ IncidentManager:', incidentAddress);

    // 3. Deploy HealthReporter
    console.log(`[${nonce}] Deploying HealthReporter...`);
    const ReporterFactory = new ethers.ContractFactory(reporterArtifact.abi, reporterArtifact.bytecode, wallet);
    const reporter = await ReporterFactory.deploy(registryAddress, incidentAddress, wallet.address, { nonce: nonce++ });
    await reporter.waitForDeployment();
    const reporterAddress = await reporter.getAddress();
    console.log('✅ HealthReporter:', reporterAddress);

    // 4. Wiring: setRegistry
    console.log(`[${nonce}] Wiring IncidentManager.setRegistry...`);
    let tx = await incidentManager.setRegistry(registryAddress, { nonce: nonce++ });
    await tx.wait();

    // 5. Wiring: authorize reporter
    console.log(`[${nonce}] Wiring IncidentManager.authorizeReporter...`);
    tx = await incidentManager.setReporterAuthorization(reporterAddress, true, { nonce: nonce++ });
    await tx.wait();

    // 6. Register Chain 421614
    console.log(`[${nonce}] Registering Chain 421614...`);
    tx = await registry.registerChain(421614, wallet.address, 13, 120, "Arbitrum Sepolia", { nonce: nonce++ });
    await tx.wait();

    console.log('\n--- DEPLOYMENT SUCCESS ---');
    console.log(`REGISTRY_ADDRESS=${registryAddress}`);
    console.log(`MONITOR_ADDRESS=${reporterAddress}`);
    console.log(`INCIDENT_MANAGER_ADDRESS=${incidentAddress}`);
}

main().catch(console.error);
