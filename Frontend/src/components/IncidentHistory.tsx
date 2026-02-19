
"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';
import IncidentManagementActions from './IncidentManagementActions';

const monitorAddress = config.incidentManagerAddress;
const chainId = config.chainId;

const MonitorAbi = [
  "event IncidentReported(uint256 indexed incidentId, address indexed reporter, string incidentType, uint256 severity, uint256 timestamp)",
  "event IncidentResolved(uint256 indexed incidentId, uint256 timestamp)",
  "function getIncident(uint256 incidentId) view returns (tuple(uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed))",
  "function nextIncidentId() view returns (uint256)"
];

function getPriority(priority: number) {
  switch (priority) {
    case 0: return { label: 'P0', color: 'text-red-500 bg-red-100', bg: 'bg-red-500' };
    case 1: return { label: 'P1', color: 'text-orange-500 bg-orange-100', bg: 'bg-orange-500' };
    case 2: return { label: 'P2', color: 'text-yellow-600 bg-yellow-100', bg: 'bg-yellow-600' };
    case 3: return { label: 'P3', color: 'text-blue-500 bg-blue-100', bg: 'bg-blue-500' };
    default: return { label: 'N/A', color: 'text-gray-500 bg-gray-100', bg: 'bg-gray-500' };
  }
}

interface IncidentHistoryProps {
  selectedChainId?: string | null;
}

const IncidentHistory: React.FC<IncidentHistoryProps> = ({ selectedChainId }) => {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | '0' | '1' | '2' | '3'>('all');
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchIncidents = async () => {
    if (!monitorAddress) {
      setError('Incident Manager address not configured.');
      setIncidents([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const monitor = new ethers.Contract(monitorAddress, MonitorAbi, provider);
    try {
      // Use nextIncidentId to know how many incidents exist
      const nextId = await monitor.nextIncidentId();
      const count = Number(nextId);

      if (count === 0) {
        setIncidents([]);
        setLastUpdate(new Date());
        return;
      }

      // Fetch all incidents by ID (1-based)
      const ids = Array.from({ length: count }, (_, i) => i + 1);
      const BATCH_SIZE = 5;
      const allIncidentsRaw: any[] = [];

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batchIds.map(id => monitor.getIncident(id).catch(() => null))
        );
        allIncidentsRaw.push(...batchResults);
        if (i + BATCH_SIZE < ids.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const detailedIncidents = allIncidentsRaw
        .filter(inc => inc !== null && Number(inc.id) > 0)
        .map(incData => ({
          id: incData.id.toString(),
          chainId: String(config.chainId),
          reason: incData.description || incData.incidentType,
          triggeredAt: new Date(Number(incData.timestamp) * 1000).toLocaleString(),
          resolvedAt: Number(incData.resolvedAt) > 0 ? new Date(Number(incData.resolvedAt) * 1000).toLocaleString() : null,
          priority: Number(incData.severity), // Map severity to priority display
          parentId: "0",
          rca: '',
          resolved: incData.resolved,
          comments: [],
          sla: Number(incData.resolvedAt) > 0
            ? `${Math.floor((Number(incData.resolvedAt) - Number(incData.timestamp)) / 60)}m`
            : `${Math.floor((Date.now() / 1000 - Number(incData.timestamp)) / 60)}m (Active)`
        }));

      setIncidents(detailedIncidents.reverse());
      setLastUpdate(new Date());
    } catch (e: any) {
      console.error("Incident history fetch error:", e);
      const errorMsg = e?.message?.includes('429') || e?.message?.includes('rate limit')
        ? 'Rate limited by RPC provider. Wait a moment &retry.'
        : e?.message?.includes('block range') || e?.message?.includes('query returned')
          ? 'Block range too large. Try filtering by chain ID.'
          : e?.message?.includes('NETWORK') || e?.message?.includes('fetch failed')
            ? 'Network connection failed.'
            : `Error fetching incidents: ${e?.message?.slice(0, 50) || 'Unknown error'}`;
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    const saved = localStorage.getItem('incident-bookmarks');
    if (saved) setBookmarks(JSON.parse(saved));

    // Auto-refresh every 20 seconds if enabled
    const interval = autoRefresh ? setInterval(fetchIncidents, 20000) : null;

    const handleRefresh = (e: any) => {
      fetchIncidents();
    };

    window.addEventListener('chainward-refresh', handleRefresh);
    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener('chainward-refresh', handleRefresh);
    };
  }, [selectedChainId, autoRefresh]);

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newBookmarks = bookmarks.includes(id)
      ? bookmarks.filter(b => b !== id)
      : [...bookmarks, id];
    setBookmarks(newBookmarks);
    localStorage.setItem('incident-bookmarks', JSON.stringify(newBookmarks));
  };

  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = inc.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.id.includes(searchQuery) ||
      (inc.chainId && inc.chainId.toString().includes(searchQuery));
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? !inc.resolved : inc.resolved);
    const matchesPriority = priorityFilter === 'all' || inc.priority.toString() === priorityFilter;
    const matchesChain = !selectedChainId || inc.chainId.toString() === selectedChainId;

    return matchesSearch && matchesStatus && matchesPriority && matchesChain;
  });

  return (
    <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border overflow-hidden col-span-1 md:col-span-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-bold">Comprehensive Audit Trail</h2>
          {lastUpdate && (
            <div className="text-xs text-secondary font-mono hidden lg:block">
              {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-3 py-1.5 rounded-full transition-all font-semibold flex items-center gap-1.5 focus:ring-2 focus:ring-offset-1 focus:outline-none ${autoRefresh ? 'bg-green-500/20 text-green-500 focus:ring-green-500' : 'bg-gray-500/20 text-gray-500 focus:ring-gray-500'
              }`}
            aria-label={`Auto-refresh is ${autoRefresh ? 'enabled' : 'disabled'}. Click to ${autoRefresh ? 'pause' : 'enable'}`}
            aria-pressed={autoRefresh}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <input
            type="text"
            placeholder="Search Description or ID..."
            className="flex-1 min-w-[180px] text-xs sm:text-sm p-2 bg-background border border-card-border rounded outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Search incidents by description or ID"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="text-xs p-2 bg-background border border-card-border rounded outline-none"
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="resolved">Resolved Only</option>
          </select>
          <select
            className="text-xs p-2 bg-background border border-card-border rounded outline-none"
            value={priorityFilter}
            onChange={(e: any) => setPriorityFilter(e.target.value)}
          >
            <option value="all">Priority: All</option>
            <option value="0">Priority: P0</option>
            <option value="1">Priority: P1</option>
            <option value="2">Priority: P2</option>
            <option value="3">Priority: P3</option>
          </select>
          <button
            onClick={fetchIncidents}
            disabled={isLoading}
            aria-label="Refresh Audit Trail"
            className="p-2 bg-primary text-white rounded disabled:opacity-50"
          >
            {isLoading ? '...' : '🔄'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50/10 border-2 border-red-500/30" role="alert" aria-live="assertive">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <div className="font-bold text-sm mb-1">Incident History Error</div>
              <div className="text-sm opacity-90 mb-2">{error}</div>
              <button
                onClick={() => {
                  setError(null);
                  fetchIncidents();
                }}
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-colors font-semibold focus:ring-2 focus:ring-white/50 focus:outline-none"
                aria-label="Retry loading incident history"
              >
                Retry Load
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-3 rounded-lg border border-card-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="w-24 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
                <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
              <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.length === 0 ? (
            <p className="text-secondary-foreground italic text-sm text-center py-8">No incidents match your criteria.</p>
          ) : (
            filteredIncidents.map((incident) => {
              const prio = getPriority(incident.priority);
              const isExpanded = expandedId === incident.id;
              const isBookmarked = bookmarks.includes(incident.id);
              return (
                <article
                  key={incident.id}
                  className={`p-3 rounded-lg border bg-opacity-50 transition-all ${incident.resolved ? 'bg-green-50/10 border-green-500/20' : 'bg-red-50/10 border-red-500/20'}`}
                  aria-label={`Incident ${incident.id}: ${incident.reason}, Priority ${prio.label}, Status: ${incident.resolved ? 'Resolved' : 'Active'}`}
                >
                  <div
                    className="flex items-center justify-between mb-1 cursor-pointer select-none group"
                    onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : incident.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isExpanded}
                    aria-controls={`incident-details-${incident.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => toggleBookmark(incident.id, e)}
                        className={`text-sm transition-opacity focus:outline-none focus:ring-2 focus:ring-yellow-500 rounded ${isBookmarked ? 'text-yellow-500' : 'opacity-20 group-hover:opacity-100'}`}
                        aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                        aria-pressed={isBookmarked}
                      >
                        ★
                      </button>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${prio.color}`}>
                        {prio.label}
                      </span>
                      <span className="font-bold text-sm">#{incident.id}</span>
                      <span className="text-sm line-clamp-1">{incident.reason}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${incident.resolved ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                        {incident.resolved ? 'Resolved' : 'Active'}
                      </span>
                      <span className={`text-[10px] opacity-40 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-secondary-foreground border-t border-card-border pt-2 mt-2">
                    <div><span className="opacity-60">Chain:</span> {incident.chainId}</div>
                    <div><span className="opacity-60">Detected:</span> {incident.triggeredAt}</div>
                    {incident.resolvedAt && <div><span className="opacity-60">Resolved:</span> {incident.resolvedAt}</div>}
                    {incident.parentId !== "0" && (
                      <div className="text-blue-400 font-semibold px-1 rounded bg-blue-400/5">Cluster: #{incident.parentId}</div>
                    )}
                    {incident.rca && (
                      <div className="text-purple-400 font-semibold px-1 rounded bg-purple-400/5">RCA: {incident.rca}</div>
                    )}
                  </div>

                  {isExpanded && (
                    <div
                      id={`incident-details-${incident.id}`}
                      className="mt-3 pt-3 border-t border-dashed border-card-border space-y-4"
                      role="region"
                      aria-label={`Incident ${incident.id} management actions`}
                    >
                      <IncidentManagementActions
                        incidentId={incident.id}
                        onActionComplete={fetchIncidents}
                      />
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};

export default IncidentHistory;
