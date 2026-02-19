"use client";

import React, { useState, useEffect } from 'react';
import { useRole } from '../context/RoleContext';
import { useAccount } from 'wagmi';
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

  const { address, isConnected } = useAccount();
  const reporterAddress = config.monitorAddress;
  const registryAddress = config.registryAddress;
  const chainId = config.chainId;

  // Get signer from window.ethereum
  const getSigner = async () => {
    if (typeof window !== 'undefined' && window.ethereum && isConnected) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      return await provider.getSigner();
    }
    return null;
  };

  // Actual ABIs from HealthMonitor &OrbitRegistry
  const ReporterAbi = [
    "function submitHealthSignal(uint256,uint256,uint256,uint256,bool,uint256,uint256,bool,string)",
    "function lastSignalTime(uint256) view returns (uint256)",
    "function lastBlockNumber(uint256) view returns (uint256)",
    "function reporter() view returns (address)"
  ];
  const RegistryAbi = [
    "function chains(uint256) view returns (address operator, uint256 expectedBlockTime, uint256 maxBlockLag, bool isActive, string name)",
    "function updateThresholds(uint256,uint256,uint256)",
    "function updateOperator(uint256,address)",
    "event ChainUpdated(uint256 indexed chainId, uint256 expectedBlockTime, uint256 maxBlockLag)"
  ];
  const IncidentAbi = [
    "event IncidentRaised(uint256 indexed incidentId, uint256 indexed chainId, uint8 indexed failureType, uint8 severity, uint8 priority, string description, uint256 timestamp)",
    "event IncidentResolved(uint256 indexed incidentId, uint256 indexed chainId, string reason, uint256 timestamp, uint256 resolvedAt)",
    "function resolveIncident(uint256)",
    "function nextIncidentId() view returns (uint256)",
    "function incidents(uint256) view returns (uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed)"
  ];



  useEffect(() => {
    if (!reporterAddress || !registryAddress || !config.incidentManagerAddress) return;

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
  }, [reporterAddress, registryAddress]);

  const handleAction = async (action: string) => {
    setTxError(null);
    setTxHash(null);
    setTxLoading(false);
    setActionStatus('');
    if (!isConnected) {
      setActionStatus('Connect wallet to perform actions.');
      return;
    }
    setTxLoading(true);
    setActionStatus('Processing ' + action + '...');
    try {
      const signer = await getSigner();
      if (!signer) {
        setTxLoading(false);
        setActionStatus('Unable to get wallet signer.');
        return;
      }
      let tx;
      const submitSignal = async (sequencerHealthy: boolean, bridgeHealthy: boolean, details: string) => {
        const reporter = new ethers.Contract(reporterAddress, ReporterAbi, signer);
        const provider = signer.provider;
        if (!provider) {
          throw new Error('Wallet provider unavailable');
        }
        const [block, lastBlock, signerAddress, configuredReporter] = await Promise.all([
          provider.getBlock('latest'),
          reporter.lastBlockNumber(chainId),
          signer.getAddress(),
          reporter.reporter()
        ]);
        if (!block) throw new Error("Latest block could not be fetched");
        if (signerAddress.toLowerCase() !== configuredReporter.toLowerCase()) {
          throw new Error(`Connected wallet is not the reporter. Expected ${configuredReporter}`);
        }

        const blockNumber = Math.max(Number(lastBlock) + 1, block.number);
        const blockTimestamp = block.timestamp;
        const sequencerNumber = blockNumber;
        const l1BatchNumber = blockNumber;
        const l1BatchTimestamp = blockTimestamp;
        return reporter.submitHealthSignal(
          chainId,
          blockNumber,
          blockTimestamp,
          sequencerNumber,
          sequencerHealthy,
          l1BatchNumber,
          l1BatchTimestamp,
          bridgeHealthy,
          details
        );
      };
      if (action === 'Pause Sequencer') {
        tx = await submitSignal(false, false, 'Manual Pause via Dashboard');
      } else if (action === 'Trigger Failover') {
        tx = await submitSignal(false, false, 'Manual Failover Triggered');
      } else if (action === 'Send Alert') {
        tx = await submitSignal(true, true, 'Dashboard Status Alert');
      } else if (action === 'Update Thresholds') {
        const reg = new ethers.Contract(registryAddress, RegistryAbi, signer);
        tx = await reg.updateThresholds(chainId, 10, 60);
      } else if (action === 'Manage Roles') {
        const reg = new ethers.Contract(registryAddress, RegistryAbi, signer);
        tx = await reg.updateOperator(chainId, address);
      } else if (action === 'Resolve Latest') {
        const incidentManagerAddress = config.incidentManagerAddress;
        const IncidentManagerAbi = [
          "function nextIncidentId() view returns (uint256)",
          "function resolveIncident(uint256 incidentId, string reason)"
        ];
        const incidentManager = new ethers.Contract(incidentManagerAddress, IncidentManagerAbi, signer);
        const nextId = await incidentManager.nextIncidentId();
        if (nextId <= BigInt(1)) {
          setTxLoading(false);
          setActionStatus('No incidents to resolve.');
          return;
        }
        const latestIncidentId = nextId - BigInt(1);
        tx = await incidentManager.resolveIncident(latestIncidentId, 'Resolved via Dashboard');
      } else {
        setTxLoading(false);
        setActionStatus('Action not implemented.');
        return;
      }
      // No explicit gas settings: ethers.js/MetaMask will estimate fees automatically
      if (tx) {
        setTxHash(tx.hash);
        setActionStatus('Transaction sent. Waiting for confirmation...');
        const receipt = await tx.wait();
        setTxLoading(false);
        setActionStatus('Action completed!');

        // Send transaction details to backend for visibility/logging
        try {
          await fetch('/api/tx-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              txHash: tx.hash,
              status: receipt.status,
              blockNumber: receipt.blockNumber,
              from: tx.from,
              to: tx.to,
              timestamp: Date.now()
            })
          });
        } catch (backendErr) {
          // Optionally show backend error
          setActionStatus('Action completed! (Backend event failed)');
        }
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
        <button className="bg-success/10 text-success border border-success/30 hover:bg-success hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Resolve Latest')} disabled={role === 'viewer'}>
          <span>Resolve Latest Incident</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
        <button className="bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-white px-4 py-2 rounded-lg transition-all font-medium text-left flex items-center justify-between group" onClick={() => handleAction('Send Alert')} disabled={role === 'viewer'}>
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
