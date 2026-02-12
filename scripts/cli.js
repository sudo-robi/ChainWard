#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const chalk = require('chalk');

function usage() {
  console.log(chalk.green('Usage: node scripts/cli.js <cmd> [args]'));
  console.log('Commands:');
  console.log('  register <chainId> <operator> <threshold>    - register chain (owner RPC key)');
  console.log('  deposit <chainId> <amountEth>               - deposit bond (operator key)');
  console.log('  withdraw <chainId> <amountEth>              - withdraw bond (operator key)');
  console.log('  monitor-set <chainId> <monitorAddress>      - set chain monitor (operator key)');
  console.log('  show <chainId>                              - show chain state and timeline');
  console.log('  heartbeat <chainId> <seq>                   - submit single heartbeat (operator key)');
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) return usage();

  const RPC = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const PK = process.env.PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = PK ? new ethers.Wallet(PK, provider) : null;

  const registryAddress = process.env.REGISTRY_ADDRESS || '0xaE5e3ED9f017c5d81E7F52aAF04ff11c4f6a1f1A';
  const monitorAddress = process.env.MONITOR_ADDRESS || '0xBF3882E40495D862c2C9A5928362a7707Df7da5D';
  if (!registryAddress || !monitorAddress) {
    console.log(chalk.yellow('Warning: set REGISTRY_ADDRESS and MONITOR_ADDRESS in .env for full functionality'));
  }

  const RegistryAbi = [
    'function registerChain(uint256,address,uint256,uint256,string)',
    'function depositBond(uint256) payable',
    'function withdrawBond(uint256,uint256)',
    'function setChainMonitor(uint256,address)',
    'function getChain(uint256) view returns (tuple(address operator, address pendingOperator, uint256 operatorTransferTime, uint256 expectedBlockTime, uint256 maxBlockLag, bool isActive, string name))'
  ];
  const MonitorAbi = [
    'function submitHeartbeat(uint256,uint256,uint256)'
  ];

  const registry = new ethers.Contract(registryAddress, RegistryAbi, wallet || provider);
  const monitor = new ethers.Contract(monitorAddress, MonitorAbi, wallet || provider);

  if (cmd === 'register') {
    if (!wallet) { console.error('PRIVATE_KEY required'); process.exit(1); }
    const chainId = Number(process.argv[3]);
    const operator = process.argv[4];
    const expectedBlockTime = Number(process.argv[5] || 12); // Default 12s
    const maxBlockLag = Number(process.argv[6] || 60);       // Default 60s
    const name = process.argv[7] || `Chain-${chainId}`;

    console.log(chalk.blue('Registering chain'), chainId);
    // registerChain(chainId, operator, expectedBlockTime, maxBlockLag, name)
    const tx = await registry.registerChain(chainId, operator, expectedBlockTime, maxBlockLag, name);
    console.log(chalk.gray('tx'), tx.hash);
    await tx.wait();
    console.log(chalk.green('registered'));
    return;
  }

  // ... (deposit/withdraw/monitor-set removed/commented if likely invalid too, checking deps) ...
  // Keeping deposit/withdraw/monitor-set for now but might fail if they don't exist. 
  // Checking contract... OrbitChainRegistry.sol DOES NOT have depositBond/withdrawBond/setChainMonitor!
  // It only has: initiateOwnerTransfer, acceptOwnerTransfer, cancelOwnerTransfer, registerChain, updateThresholds, deactivateChain, initiateOperatorTransfer...

  if (cmd === 'deposit' || cmd === 'withdraw' || cmd === 'monitor-set') {
    console.log(chalk.red('Command not supported by current Registry contract.'));
    return;
  }

  if (cmd === 'show') {
    const chainId = Number(process.argv[3] || '1');
    try {
      const chain = await registry.getChain(chainId);
      console.log(chalk.cyan('Chain'), chainId);
      console.log(' Name:', chain.name);
      console.log(' Operator:', chain.operator);
      console.log(' Active:', chain.isActive);
      console.log(' Expected Block Time:', chain.expectedBlockTime.toString());
      console.log(' Max Block Lag:', chain.maxBlockLag.toString());
    } catch (e) {
      console.log(chalk.red('Chain not found or error fetching:'), e.message);
    }
    return;
  }

  if (cmd === 'heartbeat') {
    if (!wallet) { console.error('PRIVATE_KEY required'); process.exit(1); }
    const chainId = Number(process.argv[3]);
    const seq = Number(process.argv[4] || Date.now());
    const tx = await monitor.connect(wallet).submitHeartbeat(chainId, seq, seq + 1000);
    console.log(chalk.gray('tx'), tx.hash);
    await tx.wait();
    console.log(chalk.green('heartbeat sent'));
    return;
  }

  usage();
}

main().catch((e) => { console.error(e); process.exit(1); });
