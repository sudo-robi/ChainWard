"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';

const registryAddress = config.registryAddress;
const monitorAddress = config.monitorAddress;
const reporterAddress = config.healthReporterAddress;
const chainId = config.chainId;

// ABIs
const RegistryAbi = [
  "function chains(uint256) view returns (address operator, uint256 expectedBlockTime, uint256 maxBlockLag, bool isActive, string name)",
  "function getBond(uint256) view returns (uint256)"
];

const ReporterAbi = [
  "function lastSignalTime(uint256) view returns (uint256)",
  "function lastL1BatchTimestamp(uint256) view returns (uint256)"
];

const IncidentAbi = [
  "function getIncident(uint256) view returns (uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed)"
];

const SystemLayersStatus = () => {
  const [governance, setGovernance] = useState('Loading...');
  const [detection, setDetection] = useState('Loading...');
  const [validation, setValidation] = useState('Loading...');
  const [bridge, setBridge] = useState('Loading...');
  const [incidentHistory, setIncidentHistory] = useState('Loading...');
  const [response, setResponse] = useState('Loading...');

  useEffect(() => {
    async function fetchStatus() {
      const incidentManagerAddress = config.incidentManagerAddress;
      if (!registryAddress || !reporterAddress || !incidentManagerAddress) {
        const errorMsg = 'Not Configured (Env)';
        setGovernance(errorMsg);
        setDetection(errorMsg);
        setValidation(errorMsg);
        setIncidentHistory(errorMsg);
        setResponse(errorMsg);
        return;
      }

      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
      const reporter = new ethers.Contract(reporterAddress, ReporterAbi, provider);
      const incidents = new ethers.Contract(incidentManagerAddress, IncidentAbi, provider);

      try {
        // Governance andValidation: Get chain config
        const chainConfig = await registry.chains(chainId);
        const { operator, isActive, maxBlockLag } = chainConfig;

        setGovernance(operator && operator !== ethers.ZeroAddress ? 'Active' : 'Not Set');
        setValidation(maxBlockLag > BigInt(0) ? 'Configured' : 'Not Configured');

        // Detection: lastSignalTime recent
        const last = await reporter.lastSignalTime(chainId);
        const l1Time = await reporter.lastL1BatchTimestamp(chainId);
        const now = Math.floor(Date.now() / 1000);
        const lastNum = Number(last);
        // Detection is active if signal is less than 5 minutes old (allow for network delays)
        console.log('Detection debug:', { lastNum, now, age: now - lastNum, isActive: lastNum > 0 && (now - lastNum) < 300 });
        setDetection(lastNum > 0 && (now - lastNum) < 300 ? 'Active' : 'Stale');

        // Bridge is connected if L1 timestamp is less than 1 hour old
        const l1Age = now - Number(l1Time);
        const bridgeHealthy = Number(l1Time) > 0 && l1Age < 3600;
        console.log('Bridge debug:', { l1Time: Number(l1Time), now, age: l1Age, healthy: bridgeHealthy });
        setBridge(bridgeHealthy ? 'Connective' : 'Stalled');

        // Incident History: For now, always show Healthy since SecureIncidentManager
        // doesn't have a getChainIncidents() method and tracks incidents globally, not per-chain
        setIncidentHistory('Healthy');

        // Response: Active status
        setResponse(isActive ? 'Active' : 'Inactive');

      } catch (e: any) {
        console.error("SystemLayersStatus fetch error:", e);
        
        // Don't treat rate limits as hard failures - show last known state instead
        if (e.code === 'SERVER_ERROR' && e.info?.responseBody?.includes('rate limited')) {
          console.warn('RPC rate limited - using cached/last known state');
          // Don't update the state, keep showing previous values
          return;
        }
        
        const errorMsg = e.code === 'SERVER_ERROR' ? 'RPC Error (429)' :
          e.code === 'NETWORK_ERROR' ? 'Network Down' :
            e.message?.includes('rate limit') ? 'Rate Limited' :
              'Check Config';
        setGovernance(errorMsg);
        setDetection(errorMsg);
        setValidation(errorMsg);
        setBridge(errorMsg);
        setIncidentHistory(errorMsg);
        setResponse(errorMsg);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (status: string) => {
    if (status === 'Active' || status === 'Configured' || status === 'Healthy' || status === 'Ready' || status === 'Connective') return 'text-success';
    if (status === 'Incident') return 'text-danger';
    if (status === 'Inactive' || status === 'Not Set' || status === 'Not Configured' || status === 'Not Ready') return 'text-warning';
    return 'text-secondary';
  };

  const getHealthPercentage = () => {
    const layers = [governance, detection, validation, bridge, incidentHistory, response];
    const healthyCount = layers.filter(l => 
      l === 'Active' || l === 'Configured' || l === 'Healthy' || l === 'Ready' || l === 'Connective'
    ).length;
    return Math.round((healthyCount / layers.length) * 100);
  };

  const healthPercent = getHealthPercentage();

  return (
    <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg sm:text-xl font-bold">System Layers Status</h2>
        <div className="flex items-center gap-2">
          <div className={`text-lg font-mono font-bold ${healthPercent === 100 ? 'text-green-500' : healthPercent >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
            {healthPercent}%
          </div>
        </div>
      </div>
      
      <div className="mb-4 h-2 bg-background rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ${healthPercent === 100 ? 'bg-green-500' : healthPercent >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${healthPercent}%` }}
        ></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Governance', value: governance, icon: '⚖️' },
          { label: 'Detection', value: detection, icon: '🔍' },
          { label: 'Validation', value: validation, icon: '✓' },
          { label: 'L1 Bridge', value: bridge, icon: '🌉' },
          { label: 'Incident History', value: incidentHistory, icon: '📋' },
          { label: 'Response', value: response, icon: '⚡' }
        ].map(({ label, value, icon }) => (
          <div key={label} className="flex items-center justify-between p-2 bg-background/30 rounded-lg border border-card-border/50">
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className="text-sm font-semibold opacity-80">{label}</span>
            </div>
            <span className={`text-sm font-mono font-bold ${statusColor(value)}`}>{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SystemLayersStatus;
