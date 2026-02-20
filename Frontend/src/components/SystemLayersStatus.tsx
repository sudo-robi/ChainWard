"use client";

import React from 'react';
import { ethers } from 'ethers';
import { useChainWardData } from '../context/ChainWardDataProvider';

const SystemLayersStatus = () => {
  const { chainConfig, lastSignalTime: signalTime, lastL1BatchTimestamp: l1Time, isLoading } = useChainWardData();

  // Derive all statuses from shared data (pure computation — no async!)
  const now = Math.floor(Date.now() / 1000);

  const governance = !chainConfig ? (isLoading ? 'Loading...' : 'Not Configured')
    : chainConfig.operator && chainConfig.operator !== ethers.ZeroAddress ? 'Active' : 'Not Set';

  const validation = !chainConfig ? (isLoading ? 'Loading...' : 'Not Configured')
    : chainConfig.maxBlockLag > BigInt(0) ? 'Configured' : 'Not Configured';

  const detection = isLoading ? 'Loading...'
    : signalTime > 0 && (now - signalTime) < 1800 ? 'Active' : 'Stale';

  const bridge = isLoading ? 'Loading...'
    : l1Time > 0 && (now - l1Time) < 14400 ? 'Connective' : 'Stalled';

  const incidentHistory = isLoading ? 'Loading...' : 'Healthy';

  const response = !chainConfig ? (isLoading ? 'Loading...' : 'Not Configured')
    : chainConfig.isActive ? 'Active' : 'Inactive';

  const statusColor = (status: string) => {
    if (status === 'Active' || status === 'Configured' || status === 'Healthy' || status === 'Ready' || status === 'Connective') return 'text-success';
    if (status === 'Incident') return 'text-danger';
    if (status === 'Inactive' || status === 'Not Set' || status === 'Not Configured' || status === 'Not Ready') return 'text-warning';
    return 'text-secondary';
  };

  const layers = [governance, detection, validation, bridge, incidentHistory, response];
  const healthyCount = layers.filter(l =>
    l === 'Active' || l === 'Configured' || l === 'Healthy' || l === 'Ready' || l === 'Connective'
  ).length;
  const healthPercent = Math.round((healthyCount / layers.length) * 100);

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
