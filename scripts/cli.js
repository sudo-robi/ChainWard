#!/usr/bin/env node
require('dotenv').config();
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

  const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const PK = process.env.PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = PK ? new ethers.Wallet(PK, provider) : null;

  const registryAddress = process.env.REGISTRY_ADDRESS;
  const monitorAddress = process.env.MONITOR_ADDRESS;
  if (!registryAddress || !monitorAddress) {
    console.log(chalk.yellow('Warning: set REGISTRY_ADDRESS and MONITOR_ADDRESS in .env for full functionality'));
  }

  const RegistryAbi = [
    'function registerChain(uint256,address,string,uint256)',
    'function depositBond(uint256) payable',
    'function withdrawBond(uint256,uint256)',
    'function setChainMonitor(uint256,address)',
    'function getOperator(uint256) view returns (address)',
    'function getHeartbeatThreshold(uint256) view returns (uint256)',
    'function getBond(uint256) view returns (uint256)'
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
    const threshold = Number(process.argv[5]);
    console.log(chalk.blue('Registering chain'), chainId);
    const tx = await registry.registerChain(chainId, operator, 'ipfs://meta', threshold);
    console.log(chalk.gray('tx'), tx.hash);
    await tx.wait();
    console.log(chalk.green('registered'));
    return;
  }

  if (cmd === 'deposit') {
    if (!wallet) { console.error('PRIVATE_KEY required'); process.exit(1); }
    const chainId = Number(process.argv[3]);
    const amount = process.argv[4];
    const wei = ethers.parseEther(amount);
    const tx = await registry.connect(wallet).depositBond(chainId, { value: wei });
    console.log(chalk.gray('tx'), tx.hash);
    await tx.wait();
    console.log(chalk.green('deposited'));
    return;
  }

  if (cmd === 'withdraw') {
    if (!wallet) { console.error('PRIVATE_KEY required'); process.exit(1); }
    const chainId = Number(process.argv[3]);
    const amount = process.argv[4];
    const wei = ethers.parseEther(amount);
    const tx = await registry.connect(wallet).withdrawBond(chainId, wei);
    console.log(chalk.gray('tx'), tx.hash);
    await tx.wait();
    console.log(chalk.green('withdrawn'));
    return;
  }

  if (cmd === 'monitor-set') {
    if (!wallet) { console.error('PRIVATE_KEY required'); process.exit(1); }
    const chainId = Number(process.argv[3]);
    const mon = process.argv[4];
    const tx = await registry.connect(wallet).setChainMonitor(chainId, mon);
    console.log(chalk.gray('tx'), tx.hash);
    await tx.wait();
    console.log(chalk.green('monitor set'));
    return;
  }

  if (cmd === 'show') {
    const chainId = Number(process.argv[3] || '1');
    const op = await registry.getOperator(chainId);
    const thr = await registry.getHeartbeatThreshold(chainId);
    const bond = await registry.getBond(chainId);
    console.log(chalk.cyan('Chain'), chainId);
    console.log(' operator:', op);
    console.log(' threshold:', thr.toString());
    console.log(' bond (wei):', bond.toString());
    // print timeline using query script logic
    const q = require('./query');
    // call as a module if available; otherwise just return
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
