"use client";

import React, { useState, useEffect } from 'react';
import { useRole } from '../context/RoleContext';
import { ethers } from 'ethers';
import { config } from '../config';

// Add type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

const ResponsePanel = () => {
  const [actionStatus, setActionStatus] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const { role, setRole } = useRole();

  const registryAddress = config.registryAddress;
  const chainId = config.chainId;

  const IncidentAbi = [
    "event IncidentRaised(uint256 indexed incidentId, uint256 indexed chainId, uint8 indexed failureType, uint8 severity, uint8 priority, string description, uint256 timestamp)",
    "event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp, uint256 resolvedAt)",
    "function resolveIncident(uint256)",
    "function nextIncidentId() view returns (uint256)",
    "function incidents(uint256) view returns (uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed)"
  ];

  const RegistryAbi = [
    "event ChainUpdated(uint256 indexed chainId, uint256 expectedBlockTime, uint256 maxBlockLag)"
  ];



  useEffect(() => {
    if (!registryAddress || !config.incidentManagerAddress) return;

    let incidents: ethers.Contract | null = null;
    let registry: ethers.Contract | null = null;
    let provider: ethers.Provider | null = null;

    try {
      provider = new ethers.JsonRpcProvider(config.rpcUrl);
      incidents = new ethers.Contract(config.incidentManagerAddress, IncidentAbi, provider);
      registry = new ethers.Contract(registryAddress, RegistryAbi, provider);

      if (incidents) {
        incidents.on('IncidentRaised', (incidentId, chainId, type, severity, description) => {
          setActionStatus(`Incident raised for chain ${chainId}: ${description}`);
        });
        incidents.on('IncidentResolved', (incidentId, chainId, reason) => {
          setActionStatus(`Incident resolved for chain ${chainId}: ${reason}`);
        });
      }
      if (registry) {
        registry.on('ChainUpdated', (chainId, expected, maxLag) => {
          setActionStatus(`Chain ${chainId} configuration updated.`);
        });
      }
    } catch (e) { console.error(e); }

    return () => {
      if (incidents) incidents.removeAllListeners();
      if (registry) registry.removeAllListeners();
    };
  }, [registryAddress]);

  const handleAction = async (action: string) => {
    setTxError(null);
    setTxHash(null);
    setTxLoading(false);
    setActionStatus('');

    setTxLoading(true);
    setActionStatus('Processing ' + action + ' (server-side)...');

    try {
      const response = await fetch('/api/operator-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server-side action failed');
      }

      if (data.txHash) {
        setTxHash(data.txHash);
        setActionStatus('Action completed successfully!');
        setTxLoading(false);

        // Notify other components via custom event
        window.dispatchEvent(new CustomEvent('chainward-refresh', { detail: data }));
      } else {
        setActionStatus('Action performed: ' + (data.status || 'Success'));
        setTxLoading(false);
      }
    } catch (e: any) {
      setTxLoading(false);
      setTxError(e.message || String(e));
      setActionStatus('Error: ' + (e.message || e));
    }
  };

  return (
    <section className="p-6 bg-card rounded-xl shadow border border-card-border">
      <h2 className="text-xl font-bold mb-4">Response and Governance</h2>
      <div className="mb-4 flex gap-3 items-center bg-card-border/30 p-3 rounded-lg">
        <span className="font-semibold text-sm text-secondary">Active Role:</span>
        <select
          className="bg-background border border-card-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors flex-1"
          value={role}
          onChange={e => setRole(e.target.value as any)}
        >
          <option value="admin">Administrator</option>
          <option value="operator">Node Operator</option>
          <option value="viewer">Public Viewer</option>
        </select>
      </div>
      <div className="flex flex-col gap-3">
        {(role === 'viewer') && (
          <div className="mb-2 p-2 bg-yellow-100 text-yellow-800 rounded text-sm border border-yellow-300">
            Action buttons are disabled for Public Viewer role. Switch to "Administrator" or "Node Operator" to enable actions.
          </div>
        )}
        <button className="bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Pause Sequencer')} disabled={role !== 'admin'}>
          <span>Pause Sequencer</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button className="bg-warning/10 text-warning border border-warning/30 hover:bg-warning hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Trigger Failover')} disabled={role !== 'admin'}>
          <span>Trigger Failover</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button className="bg-success/10 text-success border border-success/30 hover:bg-success hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Resolve Latest incident')} disabled={role === 'viewer'}>
          <span>Resolve Latest Incident</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button className="bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500 hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Validate Incident')} disabled={role === 'viewer'}>
          <span>Validate Incident (Step 3)</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button className="bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Broadcast Incident Alert')} disabled={role === 'viewer'}>
          <span>Broadcast Incident Alert</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button className="bg-secondary/10 hover:bg-secondary/20 text-secondary-foreground px-4 py-2 rounded-lg transition-colors text-sm" onClick={() => handleAction('Update Thresholds')} disabled={role === 'viewer'}>Update Config</button>
          <button className="bg-secondary/10 hover:bg-secondary/20 text-secondary-foreground px-4 py-2 rounded-lg transition-colors text-sm" onClick={() => handleAction('Manage Roles')} disabled={role === 'viewer'}>Manage Roles</button>
        </div>
        {txLoading && (
          <div className="mt-2 text-sm text-blue-400 font-mono flex items-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></span>
            Processing transaction...
          </div>
        )}
        {txHash && (
          <div className="mt-2 text-xs text-blue-300 font-mono">
            Tx Hash: <a href={`https://explorer.chain/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">{txHash}</a>
          </div>
        )}
        {actionStatus && <div className="mt-2 text-sm text-secondary font-mono">{actionStatus}</div>}
        {txError && (
          <div className="mt-2 text-sm text-red-400 font-mono">Error: {txError}</div>
        )}
      </div>
    </section>
  );
};

export default ResponsePanel;
