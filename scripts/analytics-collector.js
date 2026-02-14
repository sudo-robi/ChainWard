#!/usr/bin/env node

/**
 * Simple analytics collector stub
 * - Reads monitor logs (if provided) or listens to events via provider
 * - Writes lightweight JSON metrics to `data/analytics.json`
 * Usage:
 *   node scripts/analytics-collector.js
 */

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
require('dotenv').config();

const outDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'analytics.json');

// Optionally listen for contract events &log them
async function collectAndListen() {
  const rpc = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
  const provider = new ethers.JsonRpcProvider(rpc);
  const block = await provider.getBlock('latest');

  const metrics = {
    timestamp: Math.floor(Date.now() / 1000),
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    stateRoot: block.stateRoot || null
  };

  let arr = [];
  if (fs.existsSync(outFile)) {
    try { arr = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch(e) { arr = []; }
  }
  arr.push(metrics);
  fs.writeFileSync(outFile, JSON.stringify(arr.slice(-1000), null, 2));
  console.log('Collected metrics:', metrics);

  // Listen for contract events if addresses &ABIs are provided
  const monitorAddress = process.env.MONITOR_ADDRESS;
  const monitorAbi = process.env.MONITOR_ABI ? JSON.parse(process.env.MONITOR_ABI) : null;
  if (monitorAddress && monitorAbi) {
    const monitor = new ethers.Contract(monitorAddress, monitorAbi, provider);
    monitor.on('HealthReport', (chainId, statusCode, details, timestamp) => {
      const event = {
        type: 'HealthReport',
        chainId: chainId.toString(),
        statusCode: statusCode.toString(),
        details,
        timestamp: timestamp.toString(),
        eventTimestamp: Math.floor(Date.now() / 1000)
      };
      let arr = [];
      if (fs.existsSync(outFile)) {
        try { arr = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch(e) { arr = []; }
      }
      arr.push(event);
      fs.writeFileSync(outFile, JSON.stringify(arr.slice(-1000), null, 2));
      console.log('Logged HealthReport event:', event);
    });
    monitor.on('IncidentRaised', (chainId, lastHeartbeat, triggeredAt, reason) => {
      const event = {
        type: 'IncidentRaised',
        chainId: chainId.toString(),
        lastHeartbeat: lastHeartbeat.toString(),
        triggeredAt: triggeredAt.toString(),
        reason,
        eventTimestamp: Math.floor(Date.now() / 1000)
      };
      let arr = [];
      if (fs.existsSync(outFile)) {
        try { arr = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch(e) { arr = []; }
      }
      arr.push(event);
      fs.writeFileSync(outFile, JSON.stringify(arr.slice(-1000), null, 2));
      console.log('Logged IncidentRaised event:', event);
    });
    monitor.on('IncidentCleared', (chainId, clearedAt) => {
      const event = {
        type: 'IncidentCleared',
        chainId: chainId.toString(),
        clearedAt: clearedAt.toString(),
        eventTimestamp: Math.floor(Date.now() / 1000)
      };
      let arr = [];
      if (fs.existsSync(outFile)) {
        try { arr = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch(e) { arr = []; }
      }
      arr.push(event);
      fs.writeFileSync(outFile, JSON.stringify(arr.slice(-1000), null, 2));
      console.log('Logged IncidentCleared event:', event);
    });
    console.log('Listening for contract events...');
    // Keep process alive
    process.stdin.resume();
  }
}

collectAndListen().catch(err => { console.error(err); process.exit(1); });
