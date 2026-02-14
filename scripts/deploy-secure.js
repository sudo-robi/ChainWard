#!/usr/bin/env node
/**
 * Secure Deployment Script - Deploy contracts with validation
 * DO NOT store raw private keys - use MNEMONIC
 */

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALLOWED_CHAINS = {
  '421614': { name: 'Arbitrum Sepolia', maxGasGwei: 5 },
  '11155420': { name: 'OP Sepolia', maxGasGwei: 5 },
  '42161': { name: 'Arbitrum One', maxGasGwei: 100 },
  '10': { name: 'Optimism Mainnet', maxGasGwei: 100 }
};

const validateRpcUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:') return true;
    if (urlObj.protocol === 'http:' && 
        (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

// ============================================================================
// WALLET CREATION (SECURE)
// ============================================================================

const createSecureWallet = async (provider) => {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      'MNEMONIC not set in .env. Never use raw PRIVATE_KEY in environment variables.'
    );
  }

  try {
    const hdNode = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/0"
    );
    const wallet = hdNode.connect(provider);
    console.log(`✓ Deployer wallet: ${wallet.address}`);
    return wallet;
  } catch (e) {
    throw new Error(`Invalid MNEMONIC: ${e.message}`);
  }
};

// ============================================================================
// DEPLOYMENT WITH VALIDATION
// ============================================================================

const deployContract = async (factory, contractName, ...args) => {
  console.log(`\n📦 Deploying ${contractName}...`);
  
  try {
    // Estimate gas
    const deployTx = factory.getDeployTransaction(...args);
    const gasEstimate = await factory.runner.provider.estimateGas(deployTx);
    console.log(`✓ Estimated gas: ${gasEstimate.toString()}`);

    // Deploy with gas buffer
    const contract = await factory.deploy(...args, {
      gasLimit: (gasEstimate * 120n) / 100n // 20% buffer
    });

    console.log(`✓ Deploy tx: ${contract.deploymentTransaction().hash}`);

    // Wait for deployment
    const deployed = await contract.waitForDeployment();
    const address = await deployed.getAddress();

    console.log(`✅ ${contractName} deployed to ${address}`);

    // Verify code exists
    const code = await factory.runner.provider.getCode(address);
    if (code === '0x') {
      throw new Error(`No bytecode found at ${address}`);
    }

    return deployed;
  } catch (e) {
    console.error(`❌ Deployment failed: ${e.message}`);
    throw e;
  }
};

const validateDeployment = async (contract, name, provider) => {
  const address = await contract.getAddress();
  const code = await provider.getCode(address);

  if (code === '0x') {
    throw new Error(`${name}: No contract code at ${address}`);
  }

  console.log(`✓ ${name} verified at ${address}`);
  return address;
};

// ============================================================================
// SAFE CONFIGURATION
// ============================================================================

const configureRegistry = async (registry, monitor, arbitrator = null, wallet = null) => {
  console.log('\n⚙️  Configuring registry...');

  // Don't set hardcoded test addresses
  if (arbitrator && arbitrator !== ethers.ZeroAddress) {
    console.log(`✓ Arbitrator: ${arbitrator}`);
    // Only if really needed && via multisig:
    // const tx = await registry.setArbitrator(arbitrator);
    // await tx.wait();
  }

  console.log(`✓ Monitor: ${await monitor.getAddress()}`);
};

// ============================================================================
// MAIN DEPLOYMENT
// ============================================================================

async function main() {
  try {
    console.log('🚀 ChainWard Secure Deployment\n');

    // Validate RPC
    const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
    if (!validateRpcUrl(RPC)) {
      throw new Error('Invalid RPC_URL - must be https or localhost http');
    }
    console.log(`✓ RPC: ${RPC}`);

    // Connect
    const provider = new ethers.JsonRpcProvider(RPC);
    const network = await provider.getNetwork();
    console.log(`✓ Network: ${network.name} (${network.chainId})`);

    // Validate network is allowed
    if (!ALLOWED_CHAINS[network.chainId.toString()]) {
      throw new Error(
        `Deployment to chainId ${network.chainId} not allowed. ` +
        `Allowed: ${Object.keys(ALLOWED_CHAINS).join(', ')}`
      );
    }

    // Create wallet
    const wallet = await createSecureWallet(provider);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`✓ Balance: ${balanceEth} ETH`);

    if (balance === 0n) {
      throw new Error('Insufficient balance to deploy');
    }

    // Read compiled contracts
    const outDir = path.join(__dirname, '..', 'out');
    
    if (!fs.existsSync(outDir)) {
      throw new Error(
        `Compiled contracts not found at ${outDir}. ` +
        `Run 'forge build' first.`
      );
    }

    console.log(`✓ Using compiled contracts from: ${outDir}`);

    // Load ABIs
    const registryJson = JSON.parse(
      fs.readFileSync(path.join(outDir, 'OrbitRegistry.sol', 'OrbitRegistry.json'), 'utf8')
    );
    const monitorJson = JSON.parse(
      fs.readFileSync(path.join(outDir, 'HealthMonitor.sol', 'HealthMonitor.json'), 'utf8')
    );

    // Create factories
    const RegistryFactory = new ethers.ContractFactory(
      registryJson.abi,
      registryJson.bytecode,
      wallet
    );
    const MonitorFactory = new ethers.ContractFactory(
      monitorJson.abi,
      monitorJson.bytecode,
      wallet
    );

    // Deploy contracts
    const registry = await deployContract(RegistryFactory, 'OrbitRegistry');
    const registryAddress = await validateDeployment(registry, 'OrbitRegistry', provider);

    const monitor = await deployContract(
      MonitorFactory,
      'HealthMonitor',
      registryAddress
    );
    const monitorAddress = await validateDeployment(monitor, 'HealthMonitor', provider);

    // Wire registry -> monitor (only if truly needed)
    console.log(`\n✓ Registry: ${registryAddress}`);
    console.log(`✓ Monitor: ${monitorAddress}`);

    // IMPORTANT: Don't set hardcoded test addresses
    console.log('\n⚠️  SECURITY NOTE:');
    console.log('  - Do NOT use hardcoded test addresses in production');
    console.log('  - Use multisig to set arbitrator address');
    console.log('  - Use AccessControl for role-based governance');
    console.log('  - Enable 2-day timelock for parameter changes');

    // Save deployment info
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      network: network.name,
      chainId: network.chainId,
      deployer: wallet.address,
      contracts: {
        registry: registryAddress,
        monitor: monitorAddress
      }
    };

    const outputPath = path.join(__dirname, '..', `.deployment.${network.chainId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n✓ Deployment info saved to: ${outputPath}`);

    console.log('\n✅ Deployment completed successfully!\n');
    console.log('Next steps:');
    console.log('1. Update .env with contract addresses');
    console.log('2. Set up multisig governance');
    console.log('3. Configure parameter via timelock');
    console.log('4. Run security audit');

  } catch (e) {
    console.error('\n❌ Error:', e.message);
    if (process.env.DEBUG) {
      console.error(e.stack);
    }
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
