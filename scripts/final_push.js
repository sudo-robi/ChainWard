#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    console.log('🚀 FINAL PUSH: Starting robust deployment...');
    const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const PK = process.env.PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);

    async function deploy(name, factory, args = [], options = {}) {
        let attempts = 0;
        while (attempts < 5) {
            try {
                const nonce = await provider.getTransactionCount(wallet.address, 'pending');
                console.log(`Deploying ${name} (Nonce: ${nonce})...`);
                const instance = await factory.deploy(...args, { ...options, nonce: nonce });
                await instance.waitForDeployment();
                const addr = await instance.getAddress();
                console.log(`✅ ${name} deployed at: ${addr}`);
                return instance;
            } catch (e) {
                console.error(`❌ ${name} failed: ${e.message}`);
                attempts++;
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        throw new Error(`Failed to deploy ${name} after 5 attempts`);
    }

    const outDir = path.join(__dirname, '..', 'out');
    const registryArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'OrbitChainRegistry.sol', 'OrbitChainRegistry.json')));
    const reporterArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'HealthReporter.sol', 'HealthReporter.json')));
    const incidentArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'IncidentManager.sol', 'IncidentManager.json')));

    const registry = await deploy('Registry', new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet));
    const incidentManager = await deploy('IncidentManager', new ethers.ContractFactory(incidentArtifact.abi, incidentArtifact.bytecode, wallet));

    const registryAddr = await registry.getAddress();
    const incidentAddr = await incidentManager.getAddress();

    const reporter = await deploy('HealthReporter', new ethers.ContractFactory(reporterArtifact.abi, reporterArtifact.bytecode, wallet), [registryAddr, incidentAddr, wallet.address]);
    const reporterAddr = await reporter.getAddress();

    // Wiring
    console.log('Wiring IncidentManager...');
    const tx1 = await incidentManager.setRegistry(registryAddr);
    await tx1.wait();
    console.log('✓ registry set');

    const tx2 = await incidentManager.setReporterAuthorization(reporterAddr, true);
    await tx2.wait();
    console.log('✓ reporter authorized');

    console.log('Registering chain in Registry...');
    const tx3 = await registry.registerChain(421614, wallet.address, 13, 120, "Arbitrum Sepolia");
    await tx3.wait();
    console.log('✓ chain registered');

    console.log('\n--- FINAL ADDRESSES ---');
    console.log(`REGISTRY_ADDRESS=${registryAddr}`);
    console.log(`MONITOR_ADDRESS=${reporterAddr}`);
    console.log(`INCIDENT_MANAGER_ADDRESS=${incidentAddr}`);
}

main().catch(console.error);
