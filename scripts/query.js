#!/usr/bin/env node
require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(RPC);

  const registryAddress = process.env.REGISTRY_ADDRESS;
  const monitorAddress = process.env.MONITOR_ADDRESS;
  if (!registryAddress || !monitorAddress) {
    console.error('Set REGISTRY_ADDRESS &MONITOR_ADDRESS in .env');
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

  const incidentManagerAddress = process.env.INCIDENT_MANAGER_ADDRESS;

  const IncidentAbi = [
    'event IncidentRaised(uint256 indexed incidentId, uint256 indexed chainId, uint8 indexed failureType, uint8 severity, string description, uint256 timestamp)',
    'event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp)'
  ];

  const incidentManager = new ethers.Contract(incidentManagerAddress, IncidentAbi, provider);

  // ... (keeping registry/monitor checks for other stats)

  console.log('Chain', chainId);
  // ... (keeping stats logs)

  console.log('\nIncident Timeline (from IncidentManager):');

  const raisedFilter = incidentManager.filters.IncidentRaised(null, chainId);
  const resolvedFilter = incidentManager.filters.IncidentResolved(null, chainId);

  const fromBlock = 0;
  const toBlock = 'latest';
  const raisedLogs = await provider.getLogs({ address: incidentManagerAddress, topics: raisedFilter.topics, fromBlock, toBlock });
  const resolvedLogs = await provider.getLogs({ address: incidentManagerAddress, topics: resolvedFilter.topics, fromBlock, toBlock });

  const iface = new ethers.Interface(IncidentAbi);
  const entries = [];

  for (const l of raisedLogs) {
    const ev = iface.parseLog(l);
    entries.push({ type: 'RAISE', ts: ev.args.timestamp.toString(), reason: ev.args.description, severity: ev.args.severity });
  }
  for (const l of resolvedLogs) {
    const ev = iface.parseLog(l);
    entries.push({ type: 'RESOLVE', ts: ev.args.timestamp.toString(), reason: ev.args.reason });
  }
  for (const l of clearedLogs) {
    const ev = iface.parseLog(l);
    entries.push({ type: 'CLEAR', ts: ev.args.clearedAt.toString() });
  }
  entries.sort((a, b) => Number(a.ts) - Number(b.ts));
  for (const e of entries) {
    if (e.type === 'RAISE') console.log(' - [RAISE] ts=', e.ts, 'reason=', e.reason, 'severity=', e.severity);
    else console.log(' - [RESOLVE] ts=', e.ts, 'reason=', e.reason);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
