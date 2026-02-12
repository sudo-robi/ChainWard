#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
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

  const incidentManagerAddress = process.env.INCIDENT_MANAGER_ADDRESS;
  const chainId = Number(process.env.CHAIN_ID || '1');

  // Check for simulation flags
  const args = process.argv.slice(2);
  const simulateIdx = args.indexOf('--simulate');

  if (simulateIdx !== -1 && args[simulateIdx + 1]) {
    const incidentType = args[simulateIdx + 1];

    if (!incidentManagerAddress) {
      console.error('Set INCIDENT_MANAGER_ADDRESS in .env');
      process.exit(1);
    }

    console.log(`Simulating incident: ${incidentType}`);

    const IncidentAbi = [
      'function reportIncident(string calldata incidentType) external returns (uint256)'
    ];

    const incidentManager = new ethers.Contract(incidentManagerAddress, IncidentAbi, wallet);

    try {
      console.log(`Reporting incident: ${incidentType}`);

      const tx = await incidentManager.reportIncident(incidentType);
      console.log('Incident reported tx:', tx.hash);
      await tx.wait();
      console.log('Incident confirmed');
      process.exit(0);
    } catch (e) {
      if (e.code === 'INSUFFICIENT_FUNDS') {
        console.error('Error: Insufficient funds in wallet to report incident.');
      } else if (e.message.includes('execution reverted')) {
        console.error('Error: Wallet does not have REPORTER_ROLE. Please use the authorized reporter wallet.');
      } else {
        console.error('Error reporting incident:', e.message || e);
      }
      process.exit(1);
    }
  }

  const monitorAddress = process.env.MONITOR_ADDRESS;
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
