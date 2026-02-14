#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const PK = process.env.PRIVATE_KEY;
    if (!PK) {
        console.error('❌ Error: PRIVATE_KEY not found in .env');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);
    console.log(`🚀 Starting fix_all.js using deployer: ${wallet.address}`);

    const outDir = path.join(__dirname, '../out');

    // Load ABIs
    const registryJson = JSON.parse(fs.readFileSync(path.join(outDir, 'OrbitChainRegistry.sol', 'OrbitChainRegistry.json'), 'utf8'));
    const incidentsJson = JSON.parse(fs.readFileSync(path.join(outDir, 'IncidentManager.sol', 'IncidentManager.json'), 'utf8'));
    const reporterJson = JSON.parse(fs.readFileSync(path.join(outDir, 'HealthReporter.sol', 'HealthReporter.json'), 'utf8'));

    // 1. Deploy OrbitChainRegistry (Plural)
    console.log('\n📦 Deploying OrbitChainRegistry...');
    const RegistryFactory = new ethers.ContractFactory(registryJson.abi, registryJson.bytecode, wallet);
    const registry = await RegistryFactory.deploy();
    await registry.waitForDeployment();
    const registryAddr = await registry.getAddress();
    console.log(`✅ Registry: ${registryAddr}`);

    // 2. Deploy IncidentManager (Plural)
    console.log('\n📦 Deploying IncidentManager...');
    const IncidentsFactory = new ethers.ContractFactory(incidentsJson.abi, incidentsJson.bytecode, wallet);
    const incidents = await IncidentsFactory.deploy();
    await incidents.waitForDeployment();
    const incidentsAddr = await incidents.getAddress();
    console.log(`✅ IncidentManager: ${incidentsAddr}`);

    // 3. Deploy HealthReporter (Plural)
    console.log('\n📦 Deploying HealthReporter...');
    const ReporterFactory = new ethers.ContractFactory(reporterJson.abi, reporterJson.bytecode, wallet);
    const reporter = await ReporterFactory.deploy(registryAddr, incidentsAddr, wallet.address);
    await reporter.waitForDeployment();
    const reporterAddr = await reporter.getAddress();
    console.log(`✅ HealthReporter: ${reporterAddr}`);

    // 4. Initialize: Register Chain 421614
    console.log('\n⚙️  Registering Arbitrum Sepolia (421614) in registry...');
    const registerTx = await registry.registerChain(
        421614,
        wallet.address, // operator
        250, // expected block time (ms)
        60, // max block lag (blocks)
        "Arbitrum Sepolia"
    );
    await registerTx.wait();
    console.log('✅ Chain registered');

    // 5. Initialize: Authorize Reporter in IncidentManager
    console.log('⚙️  Authorizing reporter in IncidentManager...');
    const authTx = await incidents.setReporterAuthorization(reporterAddr, true);
    await authTx.wait();
    console.log('✅ Reporter authorized');

    // 6. Update config/contracts.json
    console.log('\n📝 Updating config/contracts.json...');
    const configPath = path.join(__dirname, '../config/contracts.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    config.arbitrumSepolia.contracts.OrbitChainRegistry = registryAddr;
    config.arbitrumSepolia.contracts.HealthMonitor = reporterAddr; // Plural reporter acts as monitor in config
    config.arbitrumSepolia.contracts.IncidentManager = incidentsAddr;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ config/contracts.json updated');

    console.log('\n✨ All operations completed! Next: run node config/sync-env.js');
}

main().catch(console.error);
