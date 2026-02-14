#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');

async function main() {
  // Load environment variables
  require('dotenv').config();
  
  const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  // Connect to network
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log('Deploying contracts...');
  console.log('Signer:', signer.address);
  console.log('RPC URL:', RPC_URL);

  // Read compiled contract artifacts
  const artifactsDir = path.join(__dirname, '../broadcast/Deploy.s.sol/421614');
  
  if (!fs.existsSync(artifactsDir)) {
    console.error('Artifacts directory not found:', artifactsDir);
    console.log('Running forge build first...');
    const { execSync } = require('child_process');
    execSync('forge build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  }

  // Read run-latest.json which contains deployment information
  const runLatestPath = path.join(artifactsDir, 'run-latest.json');
  let deployedAddresses = {};
  
  if (fs.existsSync(runLatestPath)) {
    const runLatest = JSON.parse(fs.readFileSync(runLatestPath, 'utf8'));
    console.log('Found previous deployment info');
    console.log('Transactions:', runLatest.transactions?.length);
    
    // Extract deployed addresses from transactions
    runLatest.transactions?.forEach((tx, index) => {
      if (tx.contractAddress) {
        console.log(`Contract ${index}: ${tx.contractAddress}`);
        if (tx.contractName) {
          deployedAddresses[tx.contractName] = tx.contractAddress;
        }
      }
    });
  }

  // Read contract ABIs from artifacts
  const artifactFiles = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.json') && f !== 'run-latest.json');
  
  console.log('\nDeployed contracts:');
  console.log(JSON.stringify(deployedAddresses, null, 2));

  // Update frontend .env with deployed addresses
  const frontendEnvPath = path.join(__dirname, '../frontend/.env.local');
  let envContent = fs.readFileSync(frontendEnvPath, 'utf8');
  
  // Extract addresses from artifacts
  artifactFiles.forEach(file => {
    if (file.endsWith('.json')) {
      const contractName = file.replace('.json', '');
      const artifactPath = path.join(artifactsDir, file);
      try {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        if (artifact.address) {
          const envKey = `NEXT_PUBLIC_${contractName.toUpperCase()}_ADDRESS`;
          envContent = envContent.replace(
            new RegExp(`${envKey}=.*`),
            `${envKey}=${artifact.address}`
          );
          console.log(`Updated ${envKey}=${artifact.address}`);
        }
      } catch (e) {
        // Skip invalid JSON files
      }
    }
  });

  // Write updated env
  fs.writeFileSync(frontendEnvPath, envContent);
  console.log('\nUpdated frontend/.env.local');

  console.log('\nDeployment complete!');
  console.log('Deployed addresses have been saved to frontend/.env.local');
}

main().catch(console.error);
