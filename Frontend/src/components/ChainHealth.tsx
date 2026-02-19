
"use client";
import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';

const registryAddress = config.registryAddress;
const monitorAddress = config.monitorAddress;
const chainId = config.chainId;

const RegistryAbi = [
  "function chains(uint256) view returns (address operator, uint256 expectedBlockTime, uint256 maxBlockLag, bool isActive, string name)",
  "function getBond(uint256) view returns (uint256)"
];
const MonitorAbi = [
  "function lastSignalTime(uint256) view returns (uint256)",
  "function lastL1BatchNumber(uint256) view returns (uint256)",
  "function lastL1BatchTimestamp(uint256) view returns (uint256)"
];

const ChainHealth = () => {

  const [status, setStatus] = useState('Loading...');
  const [blockTime, setBlockTime] = useState('Loading...');
  const [l1Batch, setL1Batch] = useState('Loading...');
  const [bridge, setBridge] = useState('Loading...');
  const [sequencer, setSequencer] = useState('Loading...');
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'config' | 'network' | 'ratelimit' | 'unknown' | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    if (!registryAddress || !monitorAddress || !config.rpcUrl || !chainId) {
      setStatus('Not Configured');
      setBlockTime('N/A');
      setSequencer('Unknown');
      setError('Configuration missing: Please check your .env file &contract deployments.');
      setLoading(false);
      return;
    }
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
      const reporter = new ethers.Contract(monitorAddress, MonitorAbi, provider);

      const chainConfig = await registry.chains(chainId);
      setBlockTime(chainConfig.expectedBlockTime.toString() + 's');

      const last = await reporter.lastSignalTime(chainId);
      const l1BatchNum = await reporter.lastL1BatchNumber(chainId);
      const l1BatchTime = await reporter.lastL1BatchTimestamp(chainId);

      const now = Math.floor(Date.now() / 1000);
      setSequencer(Number(last) > 0 && (now - Number(last)) < 60 ? 'Online' : 'Stale');
      setL1Batch(`#${l1BatchNum}`);

      const bridgeHealthy = Number(l1BatchTime) > 0 && (now - Number(l1BatchTime)) < 3600; // 1 hour buffer for L1 posts
      setBridge(bridgeHealthy ? 'Operational' : 'Stalled');

      setStatus(Number(last) > 0 && (now - Number(last)) < 60 && bridgeHealthy ? 'Healthy' : 'Check System');
      setLastUpdate(new Date());
    } catch (e: any) {
      setStatus('Error');
      setBlockTime('Error');
      setSequencer('Error');
      // Categorize errors for better UI feedback
      let errorMsg = 'Unknown error occurred';
      let errType: 'config' | 'network' | 'ratelimit' | 'unknown' = 'unknown';

      if (e?.code === 'SERVER_ERROR' || e?.message?.includes('429') || e?.message?.includes('rate limit')) {
        errorMsg = 'RPC rate limit exceeded. The public endpoint is temporarily unavailable.';
        errType = 'ratelimit';
      } else if (e?.code === 'NETWORK_ERROR' || e?.message?.includes('ECONNREFUSED') || e?.message?.includes('fetch failed')) {
        errorMsg = 'Network connection failed. Please check your internet connection.';
        errType = 'network';
      } else if (e?.message?.includes('invalid address') || e?.message?.includes('missing provider')) {
        errorMsg = 'Contract configuration error. Please verify your deployment addresses.';
        errType = 'config';
      } else {
        errorMsg = `Unexpected error: ${e?.message || 'Unknown'}`.slice(0, 100);
        errType = 'unknown';
      }

      setError(errorMsg);
      setErrorType(errType);
      console.error("ChainHealth fetch error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 15 seconds
    const statusInterval = setInterval(fetchData, 15000);

    // Live indicator toggle every 2 seconds
    const liveInterval = setInterval(() => {
      setIsLive(prev => !prev);
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(liveInterval);
    };
  }, []);

  return (
    <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border">
      <h2 className="text-lg sm:text-xl font-bold mb-2">Chain Health</h2>
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="h-10 w-full sm:w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-3">
            <div className="flex flex-col sm:block">
              <span className="font-semibold text-sm">Status:</span> <span className={`${status === 'Healthy' ? 'text-success' : status === 'Incident' ? 'text-warning' : 'text-danger'} font-mono`}>{status}</span>
            </div>
            <div className="flex flex-col sm:block">
              <span className="font-semibold text-sm">Block Time:</span> <span className="font-mono">{blockTime}</span>
            </div>
            <div className="flex flex-col sm:block">
              <span className="font-semibold text-sm">Sequencer:</span> <span className="font-mono">{sequencer}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 text-sm opacity-80">
            <div className="flex flex-col sm:block">
              <span className="font-semibold">L1 Batch:</span> <span className="font-mono">{l1Batch}</span>
            </div>
            <div className="flex flex-col sm:block">
              <span className="font-semibold">Bridge:</span> <span className={`font-mono ${bridge === 'Operational' ? 'text-green-500' : 'text-red-500'}`}>{bridge}</span>
            </div>
          </div>
          <button
            className="mt-2 w-full sm:w-auto px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50 transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
            onClick={fetchData}
            disabled={loading}
            aria-label="Refresh chain health metrics"
          >
            Refresh
          </button>
        </>
      )}
      {error && (
        <div className="mt-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          {error}
        </div>
      )}
    </section>
  );
};

export default ChainHealth;
