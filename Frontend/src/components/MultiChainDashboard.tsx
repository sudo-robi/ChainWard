"use client";

import React, { useState, useEffect } from 'react';
import { useChainWardData } from '../context/ChainWardDataProvider';

interface MultiChainDashboardProps {
    selectedChainId: string | null;
    onSelectChain: (id: string | null) => void;
}

const MultiChainDashboard: React.FC<MultiChainDashboardProps> = ({ selectedChainId, onSelectChain }) => {
    const { chainList: chains, isLoading, error: globalError, lastUpdate, refetch } = useChainWardData();
    const [refreshCountdown, setRefreshCountdown] = useState(15);

    useEffect(() => {
        const countdownInterval = setInterval(() => {
            setRefreshCountdown(prev => {
                if (prev <= 1) return 15;
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, []);

    // Reset countdown when data updates
    useEffect(() => {
        setRefreshCountdown(15);
    }, [lastUpdate]);

    const toggleFocus = (id: string) => {
        if (selectedChainId === id) {
            onSelectChain(null);
        } else {
            onSelectChain(id);
        }
    };

    return (
        <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border overflow-hidden col-span-1 md:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h2 className="text-lg sm:text-xl font-bold">
                    Network Fleet Status
                    {selectedChainId && <span className="text-primary ml-2 uppercase text-[10px] sm:text-xs tracking-widest block sm:inline mt-1 sm:mt-0">[Focused on #{selectedChainId}]</span>}
                </h2>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="font-bold opacity-50 hidden sm:inline">Live</span>
                        <span className="font-mono opacity-40">({refreshCountdown}s)</span>
                    </div>
                    {lastUpdate && (
                        <div className="text-xs text-secondary font-mono hidden md:block">
                            {lastUpdate.toLocaleTimeString()}
                        </div>
                    )}
                </div>
            </div>

            {globalError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50/10 border border-red-500/30" role="alert" aria-live="polite">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🌐</span>
                        <div className="flex-1 text-sm">
                            <strong>Fleet Status Error:</strong> {globalError}
                        </div>
                        <button
                            onClick={refetch}
                            className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded font-semibold focus:ring-2 focus:ring-white/50 focus:outline-none"
                            aria-label="Retry loading chain fleet status"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {isLoading && chains.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="p-3 bg-background border border-card-border rounded-lg">
                            <div className="flex justify-between items-start mb-2">
                                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            </div>
                            <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                            <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {chains.length === 0 ? (
                        <div className="col-span-full py-8 text-center text-sm opacity-40">No chains registered yet. Register a chain to populate fleet status.</div>
                    ) : (
                        chains.map(chain => {
                            const isSelected = selectedChainId === chain.id;
                            return (
                                <div
                                    key={chain.id}
                                    onClick={() => toggleFocus(chain.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleFocus(chain.id);
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-pressed={isSelected}
                                    aria-label={`${chain.name}, Chain ${chain.id}, Status: ${chain.status}, Last seen: ${chain.lastSeen}. ${isSelected ? 'Currently focused' : 'Click to focus'}`}
                                    className={`relative p-4 bg-background/40 rounded-lg border cursor-pointer transition-all overflow-hidden ${isSelected
                                        ? 'border-primary ring-2 ring-primary/50 shadow-lg shadow-primary/10'
                                        : 'border-card-border hover:border-primary/30 hover:shadow-md'
                                        } flex flex-col gap-2 group focus:ring-2 focus:ring-primary focus:outline-none`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="text-xs font-bold opacity-60 uppercase tracking-wide">Chain #{chain.id}</div>
                                        <div className={`relative px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-1 ${chain.status === 'Healthy' ? 'bg-green-500/20 text-green-500' :
                                                chain.status === 'Incident' ? 'bg-red-500/20 text-red-500' :
                                                    'bg-gray-500/20 text-gray-500'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${chain.status === 'Healthy' ? 'bg-green-500 animate-pulse' :
                                                    chain.status === 'Incident' ? 'bg-red-500 animate-pulse' :
                                                        'bg-gray-500'
                                                }`}></span>
                                            {chain.status}
                                        </div>
                                    </div>
                                    <div className="text-base font-bold truncate mb-2">{chain.name}</div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="opacity-50">Last Signal</span>
                                            <span className="font-mono text-[11px]">{chain.lastSeen}</span>
                                        </div>
                                        <div className="h-1 bg-background rounded-full overflow-hidden">
                                            <div className={`h-full transition-all ${chain.status === 'Healthy' ? 'bg-green-500' :
                                                    chain.status === 'Incident' ? 'bg-red-500 animate-pulse' :
                                                        'bg-gray-500'
                                                }`} style={{ width: chain.status === 'Healthy' ? '100%' : chain.status === 'Incident' ? '30%' : '0%' }}></div>
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none animate-pulse"></div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </section>
    );
};

export default React.memo(MultiChainDashboard);
