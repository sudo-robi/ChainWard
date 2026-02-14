#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const PK = process.env.PRIVATE_KEY;
    if (!PK) {
        console.error('Set PRIVATE_KEY in .env');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);
    console.log('Deployer:', wallet.address);

    const outDir = path.join(__dirname, '..', 'out');
    const reporterPath = path.join(outDir, 'HealthReporter.sol', 'HealthReporter.json');
    if (!fs.existsSync(reporterPath)) {
        console.error('Artifact not found at', reporterPath);
        process.exit(1);
    }

    const reporterJson = JSON.parse(fs.readFileSync(reporterPath));

    const registryAddress = process.env.REGISTRY_ADDRESS;
    const incidentsAddress = process.env.INCIDENT_MANAGER_ADDRESS;
    const reporterAddress = wallet.address; // Deployer is also the reporter for now

    if (!registryAddress || !incidentsAddress) {
        console.error('REGISTRY_ADDRESS or INCIDENT_MANAGER_ADDRESS missing in .env');
        process.exit(1);
    }

    console.log('Deploying HealthReporter...');
    console.log('Registry:', registryAddress);
    console.log('IncidentManager:', incidentsAddress);
    console.log('Reporter Wallet:', reporterAddress);

    const Factory = new ethers.ContractFactory(reporterJson.abi, reporterJson.bytecode, wallet);
    const reporter = await Factory.deploy(registryAddress, incidentsAddress, reporterAddress);
    await reporter.waitForDeployment();
    const newMonitorAddress = await reporter.getAddress();
    console.log('✅ HealthReporter deployed to:', newMonitorAddress);

    // WIRING
    console.log('Authorizing HealthReporter in IncidentManager...');
    const IncidentManagerAbi = [
        "function setReporterAuthorization(address reporter, bool authorized) external",
        "function owner() view returns (address)"
    ];
    const incidentManager = new ethers.Contract(incidentsAddress, IncidentManagerAbi, wallet);

    try {
        const tx = await incidentManager.setReporterAuthorization(newMonitorAddress, true);
        console.log('Authorization tx sent:', tx.hash);
        await tx.wait();
        console.log('✅ HealthReporter authorized in IncidentManager');
    } catch (e) {
        console.error('❌ Failed to authorize in IncidentManager:', e.message);
        console.log('Wait, let me check the owner...');
        const owner = await incidentManager.owner();
        console.log('IncidentManager Owner:', owner);
        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.error('PANIC: You are not the owner of IncidentManager!');
        }
    }

    console.log('\nUPDATE .env &frontend/.env.local:');
    console.log(`MONITOR_ADDRESS=${newMonitorAddress}`);
}

main().catch(console.error);
