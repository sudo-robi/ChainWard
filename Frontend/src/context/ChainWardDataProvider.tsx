"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';

// ─── ABIs (shared across all components) ─────────────────────────────────────

const RegistryAbi = [
    "function chains(uint256) view returns (address operator, uint256 expectedBlockTime, uint256 maxBlockLag, bool isActive, string name)",
    "function getBond(uint256) view returns (uint256)",
    "function getChainIds() view returns (uint256[])"
];

const ReporterAbi = [
    "function lastSignalTime(uint256) view returns (uint256)",
    "function lastL1BatchTimestamp(uint256) view returns (uint256)",
    "function lastL1BatchNumber(uint256) view returns (uint256)",
    "function activeIncidentId(uint256) view returns (uint256)"
];

const IncidentManagerAbi = [
    "function nextIncidentId() view returns (uint256)",
    "function incidents(uint256) view returns (uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed)",
    "function getIncident(uint256 incidentId) view returns (tuple(uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed))",
    "event IncidentReported(uint256 indexed incidentId, address indexed reporter, string incidentType, uint256 severity, uint256 timestamp)",
    "event IncidentResolved(uint256 indexed incidentId, uint256 timestamp)"
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChainConfig {
    operator: string;
    expectedBlockTime: bigint;
    maxBlockLag: bigint;
    isActive: boolean;
    name: string;
}

export interface IncidentData {
    id: string;
    incidentType: string;
    timestamp: number;
    reporter: string;
    severity: number;
    description: string;
    resolved: boolean;
    resolvedAt: number;
    validations: number;
    disputes: number;
    slashed: boolean;
}

export interface ChainListItem {
    id: string;
    name: string;
    status: 'Healthy' | 'Incident' | 'Stale' | 'Unregistered';
    lastSeen: string;
}

export interface TimelineEvent {
    type: string;
    time: string;
    reason?: string;
    incidentId?: string;
    reporter?: string;
    description?: string;
    timestamp: number;
}

export interface ChainWardContextData {
    // Shared provider
    provider: ethers.JsonRpcProvider | null;

    // Chain config data (from registry)
    chainConfig: ChainConfig | null;

    // Reporter/monitor signals
    lastSignalTime: number;
    lastL1BatchTimestamp: number;
    lastL1BatchNumber: number;

    // Incidents
    incidents: IncidentData[];
    nextIncidentId: number;

    // Multi-chain fleet
    chainList: ChainListItem[];

    // Timeline events
    timelineEvents: TimelineEvent[];

    // Loading / error states
    isLoading: boolean;
    isRefreshing: boolean;
    error: string | null;
    lastUpdate: Date | null;

    // Actions
    refetch: () => void;
}

const defaultContext: ChainWardContextData = {
    provider: null,
    chainConfig: null,
    lastSignalTime: 0,
    lastL1BatchTimestamp: 0,
    lastL1BatchNumber: 0,
    incidents: [],
    nextIncidentId: 0,
    chainList: [],
    timelineEvents: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdate: null,
    refetch: () => { },
};

const ChainWardContext = createContext<ChainWardContextData>(defaultContext);

export const useChainWardData = () => useContext(ChainWardContext);

// ─── Provider Component ──────────────────────────────────────────────────────

const POLL_INTERVAL = 15_000; // 15 seconds — unified for everything

export const ChainWardDataProvider = ({ children }: { children: ReactNode }) => {
    const [chainConfig, setChainConfig] = useState<ChainConfig | null>(null);
    const [lastSignalTime, setLastSignalTime] = useState(0);
    const [lastL1BatchTimestamp, setLastL1BatchTimestamp] = useState(0);
    const [lastL1BatchNumber, setLastL1BatchNumber] = useState(0);
    const [incidents, setIncidents] = useState<IncidentData[]>([]);
    const [nextIncidentIdVal, setNextIncidentIdVal] = useState(0);
    const [chainList, setChainList] = useState<ChainListItem[]>([]);
    const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    // Stable provider ref — created once
    const providerRef = useRef<ethers.JsonRpcProvider | null>(null);
    const hasFetchedOnce = useRef(false);

    const getProvider = useCallback(() => {
        if (!providerRef.current) {
            providerRef.current = new ethers.JsonRpcProvider(config.rpcUrl);
        }
        return providerRef.current;
    }, []);

    // ─── Core fetch: all data in one coordinated cycle ───────────────────────

    const fetchAllData = useCallback(async () => {
        const registryAddress = config.registryAddress;
        const monitorAddress = config.monitorAddress;
        const incidentManagerAddress = config.incidentManagerAddress;
        const chainId = config.chainId;

        if (!registryAddress || !monitorAddress || !incidentManagerAddress) {
            setError('Configuration missing: contract addresses not set.');
            setIsLoading(false);
            return;
        }

        // Show refreshing only after first successful load
        if (hasFetchedOnce.current) {
            setIsRefreshing(true);
        }

        try {
            const provider = getProvider();

            const registry = new ethers.Contract(registryAddress, RegistryAbi, provider);
            const reporter = new ethers.Contract(monitorAddress, ReporterAbi, provider);
            const incidentManager = new ethers.Contract(incidentManagerAddress, IncidentManagerAbi, provider);

            // ── Phase 1: Parallel fetch of all base data ──────────────────────
            const [
                chainConfigResult,
                signalTime,
                l1BatchTime,
                l1BatchNum,
                nextIdResult,
                chainIdsResult,
            ] = await Promise.all([
                registry.chains(chainId).catch(() => null),
                reporter.lastSignalTime(chainId).catch(() => BigInt(0)),
                reporter.lastL1BatchTimestamp(chainId).catch(() => BigInt(0)),
                reporter.lastL1BatchNumber(chainId).catch(() => BigInt(0)),
                incidentManager.nextIncidentId().catch(() => BigInt(0)),
                registry.getChainIds().catch(() => []),
            ]);

            // Update chain config
            if (chainConfigResult) {
                setChainConfig({
                    operator: chainConfigResult.operator,
                    expectedBlockTime: chainConfigResult.expectedBlockTime,
                    maxBlockLag: chainConfigResult.maxBlockLag,
                    isActive: chainConfigResult.isActive,
                    name: chainConfigResult.name,
                });
            }

            // Update signal times
            const signalTimeNum = Number(signalTime);
            const l1BatchTimeNum = Number(l1BatchTime);
            const l1BatchNumNum = Number(l1BatchNum);
            setLastSignalTime(signalTimeNum);
            setLastL1BatchTimestamp(l1BatchTimeNum);
            setLastL1BatchNumber(l1BatchNumNum);

            // ── Phase 2: Fetch all incidents (batched, shared) ────────────────
            const nextId = Number(nextIdResult);
            setNextIncidentIdVal(nextId);

            if (nextId > 0) {
                const ids = Array.from({ length: nextId }, (_, i) => i + 1);
                const BATCH_SIZE = 8; // Slightly bigger batches since we're the only caller now
                const allIncidents: IncidentData[] = [];

                for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                    const batchIds = ids.slice(i, i + BATCH_SIZE);
                    const batchResults = await Promise.all(
                        batchIds.map(id => incidentManager.getIncident(id).catch(() => null))
                    );
                    batchResults.forEach(inc => {
                        if (inc && Number(inc.id) > 0) {
                            allIncidents.push({
                                id: inc.id.toString(),
                                incidentType: inc.incidentType,
                                timestamp: Number(inc.timestamp),
                                reporter: inc.reporter,
                                severity: Number(inc.severity),
                                description: inc.description,
                                resolved: inc.resolved,
                                resolvedAt: Number(inc.resolvedAt),
                                validations: Number(inc.validations),
                                disputes: Number(inc.disputes),
                                slashed: inc.slashed,
                            });
                        }
                    });
                    // Small delay between batches to avoid rate limits
                    if (i + BATCH_SIZE < ids.length) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
                setIncidents(allIncidents);
            } else {
                setIncidents([]);
            }

            // ── Phase 3: Fetch multi-chain fleet status ───────────────────────
            const chainIds: bigint[] = chainIdsResult;
            if (chainIds.length > 0) {
                const chainDetails = await Promise.all(
                    chainIds.map(async (id: bigint) => {
                        const [cfgData, signal, activeInc] = await Promise.all([
                            registry.chains(id).catch(() => null),
                            reporter.lastSignalTime(id).catch(() => BigInt(0)),
                            reporter.activeIncidentId(id).catch(() => BigInt(0)),
                        ]);

                        const now = Math.floor(Date.now() / 1000);
                        const signalNum = Number(signal);
                        const isOnline = signalNum > 0 && (now - signalNum) < 120;
                        const hasIncident = Number(activeInc) !== 0;

                        return {
                            id: id.toString(),
                            name: cfgData?.name || `Chain ${id}`,
                            status: (hasIncident ? 'Incident' : isOnline ? 'Healthy' : 'Stale') as ChainListItem['status'],
                            lastSeen: signalNum > 0 ? new Date(signalNum * 1000).toLocaleTimeString() : 'Never',
                        };
                    })
                );
                setChainList(chainDetails);
            } else if (chainId) {
                // Fallback: show the default chain
                const fallbackConfig = await registry.chains(chainId).catch(() => null);
                setChainList([{
                    id: String(chainId),
                    name: fallbackConfig?.name || 'Arbitrum Sepolia',
                    status: fallbackConfig?.isActive ? 'Stale' : 'Unregistered',
                    lastSeen: 'Never',
                }]);
            }

            // ── Phase 4: Fetch timeline events ────────────────────────────────
            try {
                const latestBlock = await provider.getBlockNumber();
                const fromBlock = Math.max(0, latestBlock - 100000);

                const raisedFilter = incidentManager.filters.IncidentReported();
                const resolvedFilter = incidentManager.filters.IncidentResolved();

                const [raisedLogs, resolvedLogs] = await Promise.all([
                    incidentManager.queryFilter(raisedFilter, fromBlock, 'latest'),
                    incidentManager.queryFilter(resolvedFilter, fromBlock, 'latest'),
                ]);

                const events: TimelineEvent[] = [];

                raisedLogs.forEach(log => {
                    const eventLog = log as ethers.EventLog;
                    events.push({
                        type: 'Reported',
                        reason: eventLog.args.incidentType,
                        time: new Date(Number(eventLog.args.timestamp) * 1000).toLocaleString(),
                        incidentId: eventLog.args.incidentId.toString(),
                        reporter: eventLog.args.reporter,
                        description: eventLog.args.incidentType,
                        timestamp: Number(eventLog.args.timestamp),
                    });
                });

                resolvedLogs.forEach(log => {
                    const eventLog = log as ethers.EventLog;
                    events.push({
                        type: 'Resolved',
                        reason: 'Incident Resolved',
                        time: new Date(Number(eventLog.args.timestamp) * 1000).toLocaleString(),
                        incidentId: eventLog.args.incidentId.toString(),
                        description: 'Incident resolved on-chain',
                        timestamp: Number(eventLog.args.timestamp),
                    });
                });

                events.sort((a, b) => a.timestamp - b.timestamp);
                setTimelineEvents(events);
            } catch (timelineErr) {
                console.warn('Timeline events fetch failed (non-critical):', timelineErr);
                // Don't fail the whole load for timeline
            }

            // Done!
            setError(null);
            setLastUpdate(new Date());
            hasFetchedOnce.current = true;
        } catch (e: any) {
            console.error('ChainWardDataProvider fetch error:', e);

            // Don't overwrite good data with errors — keep stale data
            if (!hasFetchedOnce.current) {
                const errorMsg = e?.code === 'SERVER_ERROR' || e?.message?.includes('429')
                    ? 'RPC rate limited — retrying...'
                    : e?.code === 'NETWORK_ERROR'
                        ? 'Network connection failed'
                        : `Data fetch error: ${e?.message?.slice(0, 80) || 'Unknown'}`;
                setError(errorMsg);
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [getProvider]);

    // Manual refetch
    const refetch = useCallback(() => {
        fetchAllData();
    }, [fetchAllData]);

    // ─── Lifecycle: initial fetch + polling + event listener ────────────────

    useEffect(() => {
        fetchAllData();

        const interval = setInterval(fetchAllData, POLL_INTERVAL);

        // Listen for IncidentReported events for real-time updates
        let incidentManager: ethers.Contract | null = null;
        const incidentManagerAddress = config.incidentManagerAddress;
        if (incidentManagerAddress) {
            const provider = getProvider();
            incidentManager = new ethers.Contract(incidentManagerAddress, IncidentManagerAbi, provider);
            incidentManager.on('IncidentReported', () => {
                // Debounce: wait a bit then refetch
                setTimeout(fetchAllData, 2000);
            });
        }

        // Listen for manual refresh events from other components
        const handleRefresh = () => fetchAllData();
        window.addEventListener('chainward-refresh', handleRefresh);

        return () => {
            clearInterval(interval);
            if (incidentManager) {
                incidentManager.removeAllListeners('IncidentReported');
            }
            window.removeEventListener('chainward-refresh', handleRefresh);
        };
    }, [fetchAllData, getProvider]);

    const value: ChainWardContextData = {
        provider: providerRef.current,
        chainConfig,
        lastSignalTime,
        lastL1BatchTimestamp,
        lastL1BatchNumber,
        incidents,
        nextIncidentId: nextIncidentIdVal,
        chainList,
        timelineEvents,
        isLoading,
        isRefreshing,
        error,
        lastUpdate,
        refetch,
    };

    return (
        <ChainWardContext.Provider value={value}>
            {children}
        </ChainWardContext.Provider>
    );
};

export default ChainWardDataProvider;
