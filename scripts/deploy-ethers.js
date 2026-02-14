#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY not set in .env');
  process.exit(1);
}

async function getContractJson(name) {
  const paths = [
    path.join(__dirname, `../broadcast/SimpleDeployment.s.sol/421614/run-latest.json`),
    path.join(__dirname, `../out/${name}.sol/${name}.json`),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  
  throw new Error(`Could not find contract JSON for ${name}`);
}

async function main() {
  console.log('🚀 Starting contract deployment...');
  console.log('RPC URL:', RPC_URL);
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log('Deployer Address:', signer.address);
  
  const balance = await provider.getBalance(signer.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');

  // Build contract ABIs
  const abis = {};
  const contracts = ['OrbitChainRegistry', 'SecureIncidentManager', 'HealthMonitor', 'HealthReporter'];
  
  for (const contract of contracts) {
    try {
      const outDir = path.join(__dirname, '../out');
      const contractPath = path.join(outDir, `${contract}.sol/${contract}.json`);
      
      if (fs.existsSync(contractPath)) {
        const artifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        abis[contract] = artifact.abi;
        console.log(`✓ Loaded ${contract} ABI`);
      }
    } catch (e) {
      console.warn(`⚠ Could not load ${contract} ABI:`, e.message);
    }
  }

  // Deploy contracts in order
  const deployments = {};
  
  try {
    // 1. Deploy OrbitChainRegistry
    if (abis['OrbitChainRegistry']) {
      console.log('\n📦 Deploying OrbitChainRegistry...');
      const bytecode = path.join(__dirname, '../out/OrbitChainRegistry.sol/OrbitChainRegistry.json');
      if (fs.existsSync(bytecode)) {
        const artifact = JSON.parse(fs.readFileSync(bytecode, 'utf8'));
        const factory = new ethers.ContractFactory(abis['OrbitChainRegistry'], artifact.bytecode, signer);
        const contract = await factory.deploy();
        await contract.waitForDeployment();
        deployments.registry = await contract.getAddress();
        console.log('✓ OrbitChainRegistry deployed at:', deployments.registry);
      }
    }

    // 2. Deploy SecureIncidentManager
    if (abis['SecureIncidentManager']) {
      console.log('📦 Deploying SecureIncidentManager...');
      const bytecode = path.join(__dirname, '../out/SecureIncidentManager.sol/SecureIncidentManager.json');
      if (fs.existsSync(bytecode)) {
        const artifact = JSON.parse(fs.readFileSync(bytecode, 'utf8'));
        const factory = new ethers.ContractFactory(abis['SecureIncidentManager'], artifact.bytecode, signer);
        const contract = await factory.deploy();
        await contract.waitForDeployment();
        deployments.incidentManager = await contract.getAddress();
        console.log('✓ SecureIncidentManager deployed at:', deployments.incidentManager);
      }
    }

    // 3. Deploy HealthMonitor
    if (abis['HealthMonitor'] && deployments.registry) {
      console.log('📦 Deploying HealthMonitor...');
      const bytecode = path.join(__dirname, '../out/HealthMonitor.sol/HealthMonitor.json');
      if (fs.existsSync(bytecode)) {
        const artifact = JSON.parse(fs.readFileSync(bytecode, 'utf8'));
        const factory = new ethers.ContractFactory(abis['HealthMonitor'], artifact.bytecode, signer);
        const contract = await factory.deploy(deployments.registry);
        await contract.waitForDeployment();
        deployments.healthMonitor = await contract.getAddress();
        console.log('✓ HealthMonitor deployed at:', deployments.healthMonitor);
      }
    }

    // 4. Deploy HealthReporter
    if (abis['HealthReporter'] && deployments.registry && deployments.incidentManager) {
      console.log('📦 Deploying HealthReporter...');
      const bytecode = path.join(__dirname, '../out/HealthReporter.sol/HealthReporter.json');
      if (fs.existsSync(bytecode)) {
        const artifact = JSON.parse(fs.readFileSync(bytecode, 'utf8'));
        const factory = new ethers.ContractFactory(abis['HealthReporter'], artifact.bytecode, signer);
        const contract = await factory.deploy(deployments.registry, deployments.incidentManager, signer.address);
        await contract.waitForDeployment();
        deployments.healthReporter = await contract.getAddress();
        console.log('✓ HealthReporter deployed at:', deployments.healthReporter);
      }
    }

  } catch (e) {
    console.error('❌ Deployment error:', e.message);
    process.exit(1);
  }

  // Save deployment addresses
  const deploymentsFile = path.join(__dirname, '../deployments.json');
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
  console.log('\n✓ Deployments saved to:', deploymentsFile);

  // Update frontend .env
  const frontendEnvPath = path.join(__dirname, '../frontend/.env.local');
  let envContent = '';
  
  if (fs.existsSync(frontendEnvPath)) {
    envContent = fs.readFileSync(frontendEnvPath, 'utf8');
  }

  // Update or add environment variables
  const envVars = {
    NEXT_PUBLIC_HEALTH_MONITOR_ADDRESS: deployments.healthMonitor,
    NEXT_PUBLIC_HEALTH_REPORTER_ADDRESS: deployments.healthReporter,
    NEXT_PUBLIC_REGISTRY_ADDRESS: deployments.registry,
    NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS: deployments.incidentManager,
    NEXT_PUBLIC_RPC_URL: RPC_URL,
  };

  for (const [key, value] of Object.entries(envVars)) {
    if (value) {
      const regex = new RegExp(`${key}=.*`);
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }
  }

  fs.writeFileSync(frontendEnvPath, envContent);
  console.log('✓ Updated frontend/.env.local');

  console.log('\n✅ Deployment complete!');
  console.log('\nDeployed Addresses:');
  console.log(JSON.stringify(deployments, null, 2));
}

main().catch(console.error);
