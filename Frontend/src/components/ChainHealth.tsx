"use client";
import React, { useMemo } from 'react';
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

  // Derived Metrics & Calculations (Relaxed for demo data survival)
  const signalAge = signalTime > 0 ? now - signalTime : null;
  const l1Age = l1BatchTime > 0 ? now - l1BatchTime : null;

  const sequencerStatus = useMemo(() => {
    if (isLoading && !signalTime) return { label: 'SYNCHRONIZING', color: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-500' };
    // Relaxed threshold: 30 days (2592000s) for demo persistence
    if (!signalTime || (signalAge && signalAge > 2592000)) return { label: 'STALE', color: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-500' };
    if (signalAge && signalAge > 1800) return { label: 'LAGGING', color: 'text-orange-400', bg: 'bg-orange-500/10', dot: 'bg-orange-500' };
    return { label: 'OPERATIONAL', color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' };
  }, [isLoading, signalTime, signalAge]);

  const bridgeStatus = useMemo(() => {
    if (isLoading && !l1BatchTime) return { label: 'INITIALIZING', color: 'text-blue-400' };
    // Relaxed threshold: 30 days
    if (!l1BatchTime || (l1Age && l1Age > 2592000)) return { label: 'DEGRADED', color: 'text-red-400' };
    return { label: 'STABLE', color: 'text-emerald-400' };
  }, [isLoading, l1BatchTime, l1Age]);

  const healthPercent = useMemo(() => {
    let score = 100;
    // Only subtract if it's REALLY old or missing
    if (!signalTime || (signalAge && signalAge > 2592000)) score -= 40;
    if (!l1BatchTime || (l1Age && l1Age > 2592000)) score -= 30;
    if (globalError) score -= 20;
    return Math.max(0, score);
  }, [signalTime, signalAge, l1BatchTime, l1Age, globalError]);

  return (
    <section className="p-1 bg-gradient-to-br from-card-border/50 to-transparent rounded-2xl shadow-2xl border border-card-border/40 overflow-hidden">
      <div className="bg-card/80 backdrop-blur-xl p-5 sm:p-7 rounded-[14px]">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary">Orbit</span> Chain Health
              {isRefreshing && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mt-1 opacity-60">Real-time Performance Monitoring</p>
          </div>
          <div className="flex flex-col items-end">
            <div className={`text-3xl font-black font-mono leading-none ${healthPercent > 90 ? 'text-emerald-500' : healthPercent > 60 ? 'text-orange-500' : 'text-red-500'}`}>
              {healthPercent}%
            </div>
            <div className="text-[9px] font-bold opacity-40 uppercase tracking-tighter mt-1">Global Integrity</div>
          </div>
        </div>

        {isLoading && !chainConfig ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-24 bg-background/50 rounded-xl border border-card-border/30"></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-16 bg-background/50 rounded-xl border border-card-border/30"></div>
              <div className="h-16 bg-background/50 rounded-xl border border-card-border/30"></div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Primary Health Indicator */}
            <div className={`p-4 rounded-xl border ${sequencerStatus.bg.replace('/10', '/5')} border-card-border/40 relative overflow-hidden group transition-all hover:bg-opacity-20`}>
              <div className="flex justify-between items-center relative z-10">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-3 h-3 rounded-full ${sequencerStatus.dot} shadow-[0_0_12px_rgba(0,0,0,0.3)] shadow-${sequencerStatus.dot.replace('bg-', '')}`}></div>
                    <div className={`absolute inset-0 w-3 h-3 rounded-full ${sequencerStatus.dot} animate-ping opacity-40`}></div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block">Sequencer Heartbeat</label>
                    <span className={`text-sm font-black font-mono transition-colors ${sequencerStatus.color}`}>
                      {sequencerStatus.label}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold">
                    {signalAge !== null ? `${signalAge}s ago` : '---'}
                  </div>
                  <div className="text-[9px] uppercase opacity-30 font-bold">Latency</div>
                </div>
              </div>
              {/* Micro-sparkline representation (visual only) */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/20 overflow-hidden">
                <div className={`h-full ${sequencerStatus.dot} transition-all duration-1000`} style={{ width: signalAge ? `${Math.max(5, 100 - (signalAge / 10))}%` : '0%' }}></div>
              </div>
            </div>

            {/* Secondary Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-background/20 p-4 rounded-xl border border-card-border/30 hover:border-primary/20 transition-all">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Bridge Consistency</label>
                <div className="flex items-end justify-between">
                  <div className={`text-sm font-black font-mono ${bridgeStatus.color}`}>{bridgeStatus.label}</div>
                  <div className="text-[10px] font-mono opacity-50">{l1Age ? `${Math.floor(l1Age / 60)}m` : '---'} depth</div>
                </div>
              </div>
              <div className="bg-background/20 p-4 rounded-xl border border-card-border/30 hover:border-primary/20 transition-all">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Block Frequency</label>
                <div className="flex items-end justify-between">
                  <div className="text-sm font-black font-mono text-foreground">
                    {chainConfig ? `${chainConfig.expectedBlockTime.toString()}s` : '---'}
                  </div>
                  <div className="text-[10px] font-mono opacity-50">L2 Target</div>
                </div>
              </div>
            </div>

            {/* Infrastructure Info */}
            <div className="flex justify-between items-center py-3 border-t border-card-border/40 text-[10px] font-bold uppercase tracking-widest opacity-40">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Batch #{l1BatchNum !== undefined && l1BatchNum !== null ? l1BatchNum : '---'}
                </div>
                <div className="hidden sm:flex items-center gap-1 border-l border-card-border/30 pl-3">
                  <span className="opacity-50">Throughput:</span>
                  <svg width="40" height="12" viewBox="0 0 40 12" className="opacity-80">
                    <path
                      d="M0 6 L10 6 L12 0 L15 12 L18 6 L40 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      className="text-primary animate-pulse"
                    />
                  </svg>
                </div>
              </div>
              <button
                onClick={refetch}
                disabled={isRefreshing}
                className="hover:opacity-100 transition-opacity active:scale-95 disabled:opacity-20 uppercase font-black"
              >
                {isRefreshing ? 'Syncing...' : 'Force Refresh'}
              </button>
            </div>
          </div>
        )}
        {globalError && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-mono text-red-400">
            ERR: {globalError}
          </div>
        )}
      </div>
    </section>
  );
};

export default ChainHealth;
