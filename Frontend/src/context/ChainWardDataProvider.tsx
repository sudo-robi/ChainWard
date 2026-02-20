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
    "event IncidentValidated(uint256 indexed incidentId, address indexed validator, bool approved)",
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
    transactionHash?: string;
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

            // Clear errors once we have any successful response
            setError(null);

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

            // Release the loading lock early so UI can show config-based data
            if (!hasFetchedOnce.current) {
                setIsLoading(false);
                hasFetchedOnce.current = true;
            }

            // ── Phase 2: Fetch all incidents (batched, shared) ────────────────
            const nextId = Number(nextIdResult);
            setNextIncidentIdVal(nextId);

            if (nextId > 0) {
                // If nextId is very high (e.g. 10,000), only fetch the last 20 for dashboard performance
                const MAX_FETCH = 20;
                const startId = Math.max(1, nextId - MAX_FETCH + 1);
                const ids = Array.from({ length: nextId - startId + 1 }, (_, i) => startId + i);

                const BATCH_SIZE = 5;
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
                }
                setIncidents(allIncidents.sort((a, b) => Number(b.id) - Number(a.id)));
            } else {
                setIncidents([]);
            }

            // ... phase 3 & 4 ...
            // Final check on multi-chain fleet status
            const chainIds: bigint[] = chainIdsResult;
            if (chainIds.length > 0) {
                const chainDetails = await Promise.all(
                    chainIds.map(async (id: bigint) => {
                        try {
                            const [cfgData, signal, activeInc] = await Promise.all([
                                registry.chains(id).catch(() => null),
                                reporter.lastSignalTime(id).catch(() => BigInt(0)),
                                reporter.activeIncidentId(id).catch(() => BigInt(0)),
                            ]);

                            const now = Math.floor(Date.now() / 1000);
                            const signalNum = Number(signal);
                            const isOnline = signalNum > 0 && (now - signalNum) < 300;
                            const hasIncident = Number(activeInc) !== 0;

                            return {
                                id: id.toString(),
                                name: cfgData?.name || `Chain ${id}`,
                                status: (hasIncident ? 'Incident' : isOnline ? 'Healthy' : 'Stale') as ChainListItem['status'],
                                lastSeen: signalNum > 0 ? new Date(signalNum * 1000).toLocaleTimeString() : 'Never',
                            };
                        } catch (err) {
                            return null;
                        }
                    })
                );
                setChainList(chainDetails.filter(c => c !== null) as ChainListItem[]);
            }

            // Timeline fetch
            try {
                const latestBlock = await provider.getBlockNumber();
                const fromBlock = Math.max(0, latestBlock - 5000); // reduced range for performance

                const [raisedLogs, resolvedLogs] = await Promise.all([
                    incidentManager.queryFilter(incidentManager.filters.IncidentReported(), fromBlock, 'latest'),
                    incidentManager.queryFilter(incidentManager.filters.IncidentResolved(), fromBlock, 'latest'),
                ]);

                const raisedEvents = raisedLogs.map(log => ({
                    type: 'Reported',
                    data: log as ethers.EventLog,
                    timestamp: Number((log as ethers.EventLog).args.timestamp)
                }));
                const resolvedEvents = resolvedLogs.map(log => ({
                    type: 'Resolved',
                    data: log as ethers.EventLog,
                    timestamp: Number((log as ethers.EventLog).args.timestamp)
                }));

                const allEvents = [...raisedEvents, ...resolvedEvents]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map(ev => ({
                        type: ev.type as TimelineEvent['type'],
                        reason: ev.type === 'Reported' ? ev.data.args.incidentType : 'Incident Resolved',
                        time: new Date(ev.timestamp * 1000).toLocaleString(),
                        incidentId: ev.data.args.incidentId.toString(),
                        timestamp: ev.timestamp,
                        transactionHash: ev.data.transactionHash,
                    }));

                setTimelineEvents(allEvents);
            } catch (te) { }

            setLastUpdate(new Date());
        } catch (e: any) {
            console.error('ChainWardDataProvider fetch error:', e);
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
                setTimeout(fetchAllData, 1000);
            });
            incidentManager.on('IncidentValidated', () => {
                setTimeout(fetchAllData, 1000);
            });
            incidentManager.on('IncidentResolved', () => {
                setTimeout(fetchAllData, 1000);
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
