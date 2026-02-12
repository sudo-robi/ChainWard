#!/usr/bin/env node
/**
 * Secure Report Script - Submits heartbeats with comprehensive validation
 * DO NOT store raw private keys - use MNEMONIC from secure secret manager
 */

require('dotenv').config();
const { ethers } = require('ethers');

// ============================================================================
// CONFIGURATION & VALIDATION
// ============================================================================

const ALLOWED_CHAINS = {
  '421614': 'Arbitrum Sepolia',
  '11155420': 'OP Sepolia',
  '42161': 'Arbitrum One',
  '10': 'Optimism Mainnet'
};

const MAX_GAS_PRICE_GWEI = {
  '421614': 5,      // Arbitrum Sepolia
  '11155420': 5,    // OP Sepolia
  '42161': 100,     // Arbitrum One
  '10': 100         // Optimism Mainnet
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

const validateContractAddress = async (address, provider, name) => {
  if (!address) {
    throw new Error(`${name} not set in environment`);
  }

  try {
    if (!ethers.isAddress(address)) {
      throw new Error(`${name}: Invalid address format`);
    }

    const checksummed = ethers.getAddress(address);
    const code = await provider.getCode(checksummed);
    
    if (code === '0x') {
      throw new Error(`${name}: No contract code at ${checksummed}`);
    }

    return checksummed;
  } catch (e) {
    console.error(`Address validation failed for ${name}:`, e.message);
    throw e;
  }
};

const validateChainId = (chainId) => {
  if (!ALLOWED_CHAINS[chainId]) {
    throw new Error(
      `Invalid CHAIN_ID: ${chainId}. Allowed: ${Object.keys(ALLOWED_CHAINS).join(', ')}`
    );
  }
  return chainId;
};

const validateGasPrice = async (provider, maxGweiOverride = null) => {
  const chainId = (await provider.getNetwork()).chainId.toString();
  const maxGwei = maxGweiOverride || MAX_GAS_PRICE_GWEI[chainId] || 100;

  const gasPrice = await provider.getGasPrice();
  const gasPriceGwei = parseFloat(ethers.formatUnits(gasPrice, 'gwei'));

  if (gasPriceGwei > maxGwei) {
    throw new Error(
      `Gas price ${gasPriceGwei.toFixed(2)} GWEI exceeds max ${maxGwei} GWEI. ` +
      `Possible RPC manipulation or network congestion.`
    );
  }

  console.log(`✓ Gas price: ${gasPriceGwei.toFixed(2)} GWEI`);
  return gasPrice;
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
    console.log(`✓ Wallet loaded: ${wallet.address}`);
    return wallet;
  } catch (e) {
    throw new Error(`Invalid MNEMONIC: ${e.message}`);
  }
};

// ============================================================================
// RATE LIMITING
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const withRateLimit = async (fn, delayMs = 1000) => {
  console.log(`⏳ Rate limiting (${delayMs}ms delay)...`);
  await sleep(delayMs);
  return fn();
};

// ============================================================================
// TRANSACTION VALIDATION
// ============================================================================

const submitHeartbeatWithValidation = async (monitor, chainId, timestamp, details, options = {}) => {
  console.log(`\n📤 Submitting heartbeat...`);
  console.log(`   Chain: ${ALLOWED_CHAINS[chainId]}`);
  console.log(`   Timestamp: ${new Date(timestamp).toISOString()}`);

  try {
    // Estimate gas first
    const gasEstimate = await monitor.submitHeartbeat.estimateGas(chainId, timestamp, details);
    console.log(`✓ Estimated gas: ${gasEstimate.toString()}`);

    // Submit with validation
    const tx = await monitor.submitHeartbeat(chainId, timestamp, details, {
      gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
      ...options
    });

    console.log(`✓ Transaction submitted: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait(2); // Wait 2 blocks

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed: ${tx.hash}`);
    }

    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    return receipt;
  } catch (e) {
    console.error(`❌ Transaction failed: ${e.message}`);
    throw e;
  }
};

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    console.log('🔐 ChainWard Secure Reporter\n');

    // Validate RPC
    const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
    if (!validateRpcUrl(RPC)) {
      throw new Error('Invalid RPC_URL - must be https or localhost http');
    }
    console.log(`✓ RPC URL valid: ${RPC}`);

    // Setup provider
    const provider = new ethers.JsonRpcProvider(RPC);

    // Verify network connectivity
    const network = await provider.getNetwork();
    console.log(`✓ Connected to network: ${network.name} (chainId: ${network.chainId})`);

    // Validate chain ID
    const envChainId = process.env.CHAIN_ID || network.chainId.toString();
    const chainId = validateChainId(envChainId);

    if (chainId !== network.chainId.toString()) {
      throw new Error(
        `CHAIN_ID mismatch: .env says ${chainId}, but RPC returns ${network.chainId}`
      );
    }

    // Create wallet securely
    const wallet = await createSecureWallet(provider);

    // Validate contracts exist
    const registryAddress = await validateContractAddress(
      process.env.REGISTRY_ADDRESS,
      provider,
      'REGISTRY_ADDRESS'
    );
    const monitorAddress = await validateContractAddress(
      process.env.MONITOR_ADDRESS,
      provider,
      'MONITOR_ADDRESS'
    );

    // Initialize contracts
    const RegistryAbi = [
      'function getOperator(uint256) view returns (address)',
      'function getHeartbeatThreshold(uint256) view returns (uint256)',
      'function getBond(uint256) view returns (uint256)'
    ];
    const MonitorAbi = [
      'function submitHeartbeat(uint256,uint256,uint256) returns (bool)'
    ];

    const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
    const monitor = new ethers.Contract(monitorAddress, MonitorAbi, wallet);

    // Validate account balance
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`✓ Account balance: ${balanceEth} ETH`);

    if (balance === 0n) {
      throw new Error('Insufficient balance to send transaction');
    }

    // Validate gas price
    await validateGasPrice(provider);

    // Submit heartbeat with rate limiting
    await withRateLimit(async () => {
      await submitHeartbeatWithValidation(
        monitor,
        chainId,
        Date.now(),
        0
      );
    }, 2000);

    console.log('\n✅ All systems ready. Heartbeat submitted successfully.\n');

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
