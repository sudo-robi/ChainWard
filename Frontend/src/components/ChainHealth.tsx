"use client";
import React from 'react';
import { useChainWardData } from '../context/ChainWardDataProvider';

const ChainHealth = () => {
  const {
    chainConfig,
    lastSignalTime: signalTime,
    lastL1BatchTimestamp: l1BatchTime,
    lastL1BatchNumber: l1BatchNum,
    isLoading,
    isRefreshing,
    error: globalError,
    refetch,
  } = useChainWardData();

  const now = Math.floor(Date.now() / 1000);

  const blockTime = chainConfig ? `${chainConfig.expectedBlockTime.toString()}s` : (isLoading ? 'Loading...' : 'N/A');
  const sequencer = isLoading ? 'Loading...'
    : signalTime > 0 && (now - signalTime) < 1800 ? 'Online' : 'Stale';
  const l1Batch = isLoading ? 'Loading...' : `#${l1BatchNum}`;
  const bridgeHealthy = l1BatchTime > 0 && (now - l1BatchTime) < 14400;
  const bridge = isLoading ? 'Loading...' : (bridgeHealthy ? 'Operational' : 'Stalled');
  const status: string = isLoading ? 'Loading...'
    : (signalTime > 0 && (now - signalTime) < 1800 && bridgeHealthy ? 'Healthy' : 'Check System');

  return (
    <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border">
      <h2 className="text-lg sm:text-xl font-bold mb-2">Chain Health</h2>
      {isLoading && !chainConfig ? (
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
            onClick={refetch}
            disabled={isRefreshing}
            aria-label="Refresh chain health metrics"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </>
      )}
      {globalError && (
        <div className="mt-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          {globalError}
        </div>
      )}
    </section>
  );
};

export default ChainHealth;
