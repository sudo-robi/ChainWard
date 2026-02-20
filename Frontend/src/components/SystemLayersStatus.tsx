"use client";

import React from 'react';
import { ethers } from 'ethers';
import { useChainWardData } from '../context/ChainWardDataProvider';

const SystemLayersStatus = () => {
  const { chainConfig, lastSignalTime: signalTime, lastL1BatchTimestamp: l1Time, isLoading } = useChainWardData();

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

  const getStatusStyle = (status: string) => {
    const success = ['Active', 'Configured', 'Healthy', 'Ready', 'Connective'];
    const warning = ['Inactive', 'Not Set', 'Not Configured', 'Not Ready', 'Stale', 'Stalled'];
    const danger = ['Incident', 'Degraded'];

    if (success.includes(status)) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    if (danger.includes(status)) return { color: 'text-red-400', bg: 'bg-red-500/10' };
    if (warning.includes(status)) return { color: 'text-orange-400', bg: 'bg-orange-500/10' };
    return { color: 'text-secondary', bg: 'bg-background/20' };
  };

  const layers = [
    { label: 'Governance', value: governance, icon: '⚖️' },
    { label: 'Detection', value: detection, icon: '🔍' },
    { label: 'Validation', value: validation, icon: '✓' },
    { label: 'L1 Bridge', value: bridge, icon: '🌉' },
    { label: 'Incident History', value: incidentHistory, icon: '📋' },
    { label: 'Response', value: response, icon: '⚡' }
  ];

  const healthyCount = layers.filter(l =>
    ['Active', 'Configured', 'Healthy', 'Ready', 'Connective'].includes(l.value)
  ).length;
  const healthPercent = Math.round((healthyCount / layers.length) * 100);

  return (
    <section className="p-1 bg-gradient-to-br from-card-border/50 to-transparent rounded-2xl shadow-2xl border border-card-border/40 overflow-hidden">
      <div className="bg-card/80 backdrop-blur-xl p-5 sm:p-7 rounded-[14px]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-foreground uppercase">System Layers</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mt-1 opacity-60">Architectural Integrity</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-2xl font-black font-mono ${healthPercent === 100 ? 'text-emerald-500' : healthPercent >= 70 ? 'text-orange-500' : 'text-red-500'}`}>
              {healthPercent}%
            </div>
          </div>
        </div>

        <div className="mb-8 relative h-1.5 bg-background/40 rounded-full overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out ${healthPercent === 100 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : healthPercent >= 70 ? 'bg-orange-500' : 'bg-red-500'
              }`}
            style={{ width: `${healthPercent}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {layers.map(({ label, value, icon }) => {
            const style = getStatusStyle(value);
            return (
              <div key={label} className="group relative flex items-center justify-between p-3 bg-background/20 rounded-xl border border-card-border/30 hover:border-primary/20 transition-all">
                <div className="flex items-center gap-3">
                  <div className="text-xl group-hover:scale-110 transition-transform">{icon}</div>
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">{label}</div>
                    <div className={`text-xs font-black font-mono ${style.color}`}>{value}</div>
                  </div>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full ${style.color.replace('text-', 'bg-')} opacity-40`}></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SystemLayersStatus;
