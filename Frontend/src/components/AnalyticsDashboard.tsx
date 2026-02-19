
"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isZeroAddress = (address: string) => address.toLowerCase() === ZERO_ADDRESS;

const IncidentManagerAbi = [
    "function nextIncidentId() view returns (uint256)",
    "function incidents(uint256) view returns (uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed)"
];

interface AnalyticsDashboardProps {
    selectedChainId?: string | null;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ selectedChainId }) => {
    const [metrics, setMetrics] = useState({
        mttr: '0m',
        uptime: '100%',
        incidentFrequency: 0,
        activeIncidents: 0,
        resolvedIncidents: 0,
        failureDistribution: {} as Record<string, number>
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const calculateMetrics = async () => {
        if (!config.incidentManagerAddress || !config.rpcUrl) {
            setError('Analytics configuration missing. Please check deployment.');
            return;
        }
        setIsLoading(true);
        setError(null);
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        if (!ethers.isAddress(config.incidentManagerAddress) || isZeroAddress(config.incidentManagerAddress)) {
            setError('Analytics configuration missing: invalid incident manager address.');
            setIsLoading(false);
            return;
        }

        try {
            const code = await provider.getCode(config.incidentManagerAddress);
            if (code === '0x') {
                setError('Analytics contract not found on RPC. Check chain and address.');
                return;
            }

            const contract = new ethers.Contract(config.incidentManagerAddress, IncidentManagerAbi, provider);
            // SecureIncidentManager uses nextIncidentId counter (1-based)
            const nextId = await contract.nextIncidentId();
            const count = Number(nextId);

            // Loop from 1 to nextId to fetch all incidents
            const ids = Array.from({ length: count }, (_, i) => i + 1);

            const allIncidentsRaw = [];
            const BATCH_SIZE = 5;

            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const batchIds = ids.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(
                    batchIds.map(id => contract.incidents(id).catch(() => null))
                );
                allIncidentsRaw.push(...batchResults);
                // Small delay between batches to be nice to RPC
                if (i + BATCH_SIZE < ids.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Filter out nulls and apply chain filter if needed
            // Note: SecureIncidentManager doesn't utilize chainId in the struct currently, 
            // so we assume all incidents are relevant or we'd need another way to filter.
            // For now, we'll include all of them.
            const allIncidents = allIncidentsRaw.filter(inc => inc !== null);

            let totalResolutionTime = 0;
            let resolvedCount = 0;
            let activeCount = 0;
            const distribution: Record<string, number> = {};

            allIncidents.forEach(inc => {
                const detectedAt = Number(inc.timestamp);
                const resolvedAt = Number(inc.resolvedAt);

                if (inc.resolved) {
                    totalResolutionTime += (resolvedAt - detectedAt);
                    resolvedCount++;
                } else {
                    activeCount++;
                }

                // Map incidentType string to distribution key
                const type = inc.incidentType || 'Unknown';
                distribution[type] = (distribution[type] || 0) + 1;
            });

            const mttrMinutes = resolvedCount > 0 ? Math.floor((totalResolutionTime / resolvedCount) / 60) : 0;

            // Heuristic Uptime: Calculate over last 30 days
            const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 3600);
            const totalDowntime = allIncidents.reduce((acc, inc) => {
                const detectedAt = Number(inc.timestamp);
                if (detectedAt < thirtyDaysAgo) return acc;
                const end = inc.resolved ? Number(inc.resolvedAt) : Math.floor(Date.now() / 1000);
                return acc + (end - Math.max(detectedAt, thirtyDaysAgo));
            }, 0);
            const uptimePercent = Math.max(0, 100 - (totalDowntime / (30 * 24 * 3600) * 100)).toFixed(2);

            setMetrics({
                mttr: `${mttrMinutes}m`,
                uptime: `${uptimePercent}%`,
                incidentFrequency: allIncidents.length,
                activeIncidents: activeCount,
                resolvedIncidents: resolvedCount,
                failureDistribution: distribution
            });
            setLastUpdate(new Date());
        } catch (e: any) {
            console.error("Analytics fetch error:", e);
            setError(`Error loading analytics: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const exportCSV = async () => {
        try {
            if (!config.incidentManagerAddress || !config.rpcUrl) {
                alert('Analytics configuration missing.');
                return;
            }
            const provider = new ethers.JsonRpcProvider(config.rpcUrl);
            if (!ethers.isAddress(config.incidentManagerAddress) || isZeroAddress(config.incidentManagerAddress)) {
                alert('Invalid incident manager address.');
                return;
            }
            const code = await provider.getCode(config.incidentManagerAddress);
            if (code === '0x') {
                alert('Analytics contract not found on RPC.');
                return;
            }
            const contract = new ethers.Contract(config.incidentManagerAddress, IncidentManagerAbi, provider);
            const nextId = await contract.nextIncidentId();
            const count = Number(nextId);
            const ids = Array.from({ length: count }, (_, i) => i + 1);

            const allIncidents = await Promise.all(
                ids.map(id => contract.incidents(id).catch(() => null))
            );

            let csv = "ID,DetectedAt,ResolvedAt,Type,Severity,Description,Resolved\n";
            allIncidents.forEach((inc) => {
                if (!inc) return;
                csv += `${inc.id},${new Date(Number(inc.timestamp) * 1000).toISOString()},${inc.resolved ? new Date(Number(inc.resolvedAt) * 1000).toISOString() : 'N/A'},"${inc.incidentType}",${inc.severity},"${inc.description}",${inc.resolved}\n`;
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

    useEffect(() => {
        calculateMetrics();

        // Auto-refresh every 30 seconds
        const interval = setInterval(calculateMetrics, 30000);

        const handleRefresh = (e: any) => {
            if (process.env.NODE_ENV === 'development') {
                console.log('📊 AnalyticsDashboard: Refreshing on event', e.detail);
            }
            calculateMetrics();
        };

        window.addEventListener('chainward-refresh', handleRefresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('chainward-refresh', handleRefresh);
        };
    }, [selectedChainId]);

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
                        onClick={calculateMetrics}
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

            {error && (
                <div className="mb-4 p-4 rounded-lg bg-red-50/10 border-2 border-red-500/30" role="alert" aria-live="assertive">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">📊</span>
                        <div className="flex-1">
                            <div className="font-bold text-sm mb-1">Analytics Error</div>
                            <div className="text-sm opacity-90 mb-2">{error}</div>
                            <button
                                onClick={() => {
                                    setError(null);
                                    calculateMetrics();
                                }}
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
                isLoading ? (
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
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">MTTR (Avg)</label>
                                <div className="text-xl sm:text-2xl font-mono text-primary">{metrics.mttr}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">30D Uptime</label>
                                <div className={`text-xl sm:text-2xl font-mono ${Number(metrics.uptime.replace('%', '')) > 99 ? 'text-green-500' : 'text-orange-500'}`}>{metrics.uptime}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Total Incidents</label>
                                <div className="text-xl sm:text-2xl font-mono">{metrics.incidentFrequency}</div>
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
