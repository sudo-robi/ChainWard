#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const PK = process.env.PRIVATE_KEY;
  if (!PK) {
    console.error('Set PRIVATE_KEY in .env to run auto reporter');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  const monitorAddress = process.env.MONITOR_ADDRESS;
  const chainId = Number(process.env.CHAIN_ID || '1');
  if (!monitorAddress) {
    console.error('Set MONITOR_ADDRESS in .env');
    process.exit(1);
  }

  const MonitorAbi = [
    'function submitHeartbeat(uint256,uint256,uint256)'
  ];

  const monitor = new ethers.Contract(monitorAddress, MonitorAbi, wallet);

  let seq = 1;
  const intervalSec = Number(process.env.INTERVAL || '5');
  console.log('Starting auto-reporter, submitting a heartbeat every', intervalSec, 's');

  setInterval(async () => {
    try {
      const tx = await monitor.submitHeartbeat(chainId, seq, seq + 1000);
      console.log('submitted heartbeat', seq, 'tx', tx.hash);
      await tx.wait();
      seq++;
    } catch (e) {
      console.error('error sending heartbeat', e.message || e);
    }
  }, intervalSec * 1000);
}

main().catch((e) => { console.error(e); process.exit(1); });
