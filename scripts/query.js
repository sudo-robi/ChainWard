#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(RPC);

  const registryAddress = process.env.REGISTRY_ADDRESS;
  const monitorAddress = process.env.MONITOR_ADDRESS;
  if (!registryAddress || !monitorAddress) {
    console.error('Set REGISTRY_ADDRESS and MONITOR_ADDRESS in .env');
    process.exit(1);
  }

  const RegistryAbi = [
    'function getOperator(uint256) view returns (address)',
    'function getHeartbeatThreshold(uint256) view returns (uint256)',
    'function getBond(uint256) view returns (uint256)'
  ];
  const MonitorAbi = [
    'function lastHeartbeat(uint256) view returns (uint256)',
    'function inIncident(uint256) view returns (bool)',
    'event IncidentRaised(uint256 indexed chainId, uint256 lastHeartbeat, uint256 triggeredAt, string reason)',
    'event IncidentCleared(uint256 indexed chainId, uint256 clearedAt)'
  ];

  const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
  const monitor = new ethers.Contract(monitorAddress, MonitorAbi, provider);

  const chainId = Number(process.env.CHAIN_ID || '1');
  const operator = await registry.getOperator(chainId);
  const threshold = await registry.getHeartbeatThreshold(chainId);
  const bond = await registry.getBond(chainId);
  const last = await monitor.lastHeartbeat(chainId);
  const incident = await monitor.inIncident(chainId);

  console.log('Chain', chainId);
  console.log(' - operator:', operator);
  console.log(' - heartbeatThreshold (s):', threshold.toString());
  console.log(' - bond (wei):', bond.toString());
  console.log(' - lastHeartbeat (unix):', last.toString());
  console.log(' - inIncident:', incident);

  // fetch incident timeline from events
  const raisedFilter = monitor.filters.IncidentRaised(chainId);
  const clearedFilter = monitor.filters.IncidentCleared(chainId);
  const fromBlock = 0;
  const toBlock = 'latest';
  const raisedLogs = await provider.getLogs({ address: monitorAddress, topics: raisedFilter.topics, fromBlock, toBlock });
  const clearedLogs = await provider.getLogs({ address: monitorAddress, topics: clearedFilter.topics, fromBlock, toBlock });

  if (raisedLogs.length === 0 && clearedLogs.length === 0) {
    console.log('No incidents recorded');
    return;
  }

  console.log('\nIncident Timeline:');
  // decode and merge events by block/time for simple timeline
  const iface = new ethers.Interface(MonitorAbi);
  const entries = [];
  for (const l of raisedLogs) {
    const ev = iface.parseLog(l);
    entries.push({ type: 'RAISE', ts: ev.args.triggeredAt.toString(), reason: ev.args.reason });
  }
  for (const l of clearedLogs) {
    const ev = iface.parseLog(l);
    entries.push({ type: 'CLEAR', ts: ev.args.clearedAt.toString() });
  }
  entries.sort((a,b) => Number(a.ts) - Number(b.ts));
  for (const e of entries) {
    if (e.type === 'RAISE') console.log(' - [RAISE] ts=', e.ts, 'reason=', e.reason);
    else console.log(' - [CLEAR] ts=', e.ts);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
