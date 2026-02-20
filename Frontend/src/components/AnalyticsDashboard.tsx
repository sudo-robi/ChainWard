
"use client";

import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useChainWardData, IncidentData } from '../context/ChainWardDataProvider';
import { config } from '../config';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isZeroAddress = (address: string) => address.toLowerCase() === ZERO_ADDRESS;

interface AnalyticsDashboardProps {
    selectedChainId?: string | null;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ selectedChainId }) => {
    const { incidents: sharedIncidents, isLoading, error: globalError, lastUpdate, refetch, provider } = useChainWardData();

    // Derive all metrics from shared incident data (pure computation!)
    const metrics = useMemo(() => {
        if (sharedIncidents.length === 0) {
            return {
                mttr: '0m',
                uptime: '100%',
                incidentFrequency: 0,
                activeIncidents: 0,
                resolvedIncidents: 0,
                failureDistribution: {} as Record<string, number>,
            };
        }

        let totalResolutionTime = 0;
        let resolvedCount = 0;
        let activeCount = 0;
        const distribution: Record<string, number> = {};

        sharedIncidents.forEach(inc => {
            if (inc.resolved) {
                totalResolutionTime += (inc.resolvedAt - inc.timestamp);
                resolvedCount++;
            } else {
                activeCount++;
            }

            const type = inc.incidentType || 'Unknown';
            distribution[type] = (distribution[type] || 0) + 1;
        });

        const mttrMinutes = resolvedCount > 0 ? Math.floor((totalResolutionTime / resolvedCount) / 60) : 0;

        const autoRespondedCount = sharedIncidents.filter(inc => inc.autoResponded).length;
        const autonomyScore = sharedIncidents.length > 0 ? Math.round((autoRespondedCount / sharedIncidents.length) * 100) : 0;

        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 3600);
        const totalDowntime = sharedIncidents.reduce((acc, inc) => {
            if (inc.timestamp < thirtyDaysAgo) return acc;
            const end = inc.resolved ? inc.resolvedAt : Math.floor(Date.now() / 1000);
            return acc + (end - Math.max(inc.timestamp, thirtyDaysAgo));
        }, 0);
        const uptimePercent = Math.max(0, 100 - (totalDowntime / (30 * 24 * 3600) * 100)).toFixed(2);

        return {
            mttr: `${mttrMinutes}m`,
            uptime: `${uptimePercent}%`,
            incidentFrequency: sharedIncidents.length,
            activeIncidents: activeCount,
            resolvedIncidents: resolvedCount,
            failureDistribution: distribution,
            autonomyScore: `${autonomyScore}%`,
            autoRespondedCount
        };
    }, [sharedIncidents]);

    const exportCSV = async () => {
        try {
            if (!config.incidentManagerAddress || !config.rpcUrl) {
                alert('Analytics configuration missing.');
                return;
            }
            // Use shared incidents instead of re-fetching
            let csv = "ID,DetectedAt,ResolvedAt,Type,Severity,Description,Resolved\n";
            sharedIncidents.forEach((inc) => {
                csv += `${inc.id},${new Date(inc.timestamp * 1000).toISOString()},${inc.resolved ? new Date(inc.resolvedAt * 1000).toISOString() : 'N/A'},"${inc.incidentType}",${inc.severity},"${inc.description}",${inc.resolved}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', `chainward_incident_report_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            console.error('Export failed:', e);
            alert('Failed to export CSV');
        }
    };

    return (
        <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border col-span-1 md:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <h2 className="text-lg sm:text-xl font-bold">Real-Time Analytics Dashboard</h2>
                <div className="flex items-center gap-3">
                    {lastUpdate && (
                        <div className="text-xs text-secondary font-mono">
                            Updated: {lastUpdate.toLocaleTimeString()}
                        </div>
                    )}
                    <button
                        onClick={refetch}
                        disabled={isLoading}
                        className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-full transition-all font-semibold disabled:opacity-50 focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:outline-none"
                        aria-label="Refresh analytics data"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={exportCSV}
                        className="text-xs bg-secondary/10 hover:bg-secondary/20 px-3 py-1.5 rounded-full transition-all font-semibold focus:ring-2 focus:ring-secondary focus:ring-offset-1 focus:outline-none"
                        aria-label="Export analytics data to CSV"
                    >
                        Export
                    </button>
                </div>
            </div>

            {globalError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50/10 border-2 border-red-500/30" role="alert" aria-live="assertive">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">📊</span>
                        <div className="flex-1">
                            <div className="font-bold text-sm mb-1">Analytics Error</div>
                            <div className="text-sm opacity-90 mb-2">{globalError}</div>
                            <button
                                onClick={refetch}
                                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-colors font-semibold focus:ring-2 focus:ring-white/50 focus:outline-none"
                                aria-label="Retry loading analytics"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )
            }

            {
                isLoading && sharedIncidents.length === 0 ? (
                    <div className="space-y-6 animate-pulse">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                    <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-card-border pt-4 space-y-3">
                            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <div className="flex gap-4">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="flex-1 space-y-2">
                                        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                        <div className="h-2 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Mean Time To Resolution (Avg)</label>
                                <div className="text-xl sm:text-2xl font-mono text-primary">{metrics.mttr}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">30D Uptime</label>
                                <div className={`text-xl sm:text-2xl font-mono ${Number(metrics.uptime.replace('%', '')) > 99 ? 'text-green-500' : 'text-orange-500'}`}>{metrics.uptime}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Security Autonomy</label>
                                <div className="text-xl sm:text-2xl font-mono text-purple-500">{metrics.autonomyScore}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Active/Resolved</label>
                                <div className="text-xl sm:text-2xl font-mono">{metrics.activeIncidents} / {metrics.resolvedIncidents}</div>
                            </div>
                        </div>

                        <div className="border-t border-card-border pt-4">
                            <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-4 block">Failure Distribution</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                                {Object.entries(metrics.failureDistribution).map(([type, count]) => {
                                    const percentage = Math.round((count / metrics.incidentFrequency) * 100);
                                    const getColor = () => {
                                        if (type === 'SequencerStall' || type === 'BridgeStall') return 'bg-red-500';
                                        if (type === 'BlockLag') return 'bg-orange-500';
                                        if (type === 'MessageQueue') return 'bg-yellow-500';
                                        if (type === 'Cascading') return 'bg-purple-500';
                                        return 'bg-blue-500';
                                    };
                                    return (
                                        <div key={type} className="relative p-3 bg-background/50 rounded-lg border border-card-border hover:border-primary/30 transition-all group">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-xs font-bold opacity-80 truncate pr-2">{type}</div>
                                                <div className="text-lg font-mono font-bold text-primary">{count}</div>
                                            </div>
                                            <div className="h-2 bg-background rounded-full overflow-hidden mb-1.5">
                                                <div
                                                    className={`${getColor()} h-full transition-all duration-1000 ease-out group-hover:opacity-80`}
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="text-[10px] font-mono opacity-50">{percentage}% of total</div>
                                                <div className={`text-[9px] font-bold ${getColor().replace('bg-', 'text-')} opacity-70`}>
                                                    {percentage > 30 ? 'HIGH' : percentage > 15 ? 'MED' : 'LOW'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )
            }
        </section>
    );
};

export default AnalyticsDashboard;
