"use client";
import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';

const monitorAddress = config.incidentManagerAddress;

const MonitorAbi = [
  "function nextIncidentId() view returns (uint256)",
  "function incidents(uint256) view returns (uint256 id, string incidentType, uint256 timestamp, address reporter, uint256 severity, string description, bool resolved, uint256 resolvedAt, uint256 validations, uint256 disputes, bool slashed)",
  "event IncidentReported(uint256 indexed incidentId, address indexed reporter, string incidentType, uint256 severity, uint256 timestamp)"
];

const stages = [
  { label: 'Detection', key: 'detected' },
  { label: 'Validation', key: 'validated' },
  { label: 'On-chain Record', key: 'recorded' },
  { label: 'Automated Response', key: 'responded' }
];

const IncidentLifecycle = () => {
  const [currentStage, setCurrentStage] = useState(0);
  const [lastIncident, setLastIncident] = useState<any>(null);

  useEffect(() => {
    async function fetchLifecycle() {
      if (!monitorAddress) return;
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const monitor = new ethers.Contract(monitorAddress, MonitorAbi, provider);
      try {
        const nextId = await monitor.nextIncidentId();
        const count = Number(nextId);

        if (count === 0) {
          setCurrentStage(0);
          setLastIncident(null);
          return;
        }

        // Fetch latest incident
        const latestId = count; // 1-based index, last one is count
        const incident = await monitor.incidents(latestId);

        // Construct incident object for display
        // Note: Contract struct returns array-like or object depending on ethers version/config
        // We'll trust the ABI decoding usually gives an object with keys if names are in ABI
        const incidentData = {
          id: incident.id,
          incidentType: incident.incidentType,
          timestamp: incident.timestamp,
          description: incident.description,
          severity: incident.severity,
          resolved: incident.resolved,
          validations: incident.validations
        };

        setLastIncident(incidentData);

        // Determine Stage
        // 0 (Detection): Always active if we found an incident
        let stage = 0;

        // 1 (Validation): If validations > 0
        if (Number(incident.validations) > 0) {
          stage = 1;
        }

        // 2 (On-chain Record): If it's validated, it's recorded. 
        // We can treat this as "Confirmed" or same as validation in this simple model.
        // Let's say if validations >= 1, it's recorded.
        if (Number(incident.validations) > 0) {
          stage = 2;
        }

        // 3 (Automated Response): If resolved
        if (incident.resolved) {
          stage = 3;
        }

        setCurrentStage(stage);

      } catch (e) {
        console.error("Lifecycle fetch error:", e);
        setCurrentStage(0);
        setLastIncident(null);
      }
    }
    fetchLifecycle();

    // Set up listener for updates
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const monitor = new ethers.Contract(monitorAddress!, MonitorAbi, provider);
    const onReported = () => fetchLifecycle();

    // We can just poll or re-fetch on generic block updates for simplicity given it's a dashboard
    // But let's add the specific listener if possible
    monitor.on('IncidentReported', onReported);

    return () => {
      monitor.removeAllListeners('IncidentReported');
    };
  }, []);

  return (
    <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border">
      <h2 className="text-lg sm:text-xl font-bold mb-4">Incident Lifecycle</h2>

      <div className="relative">
        {/* Progress bar */}
        <div className="absolute top-5 left-6 right-6 h-0.5 bg-background">
          <div
            className="h-full bg-primary transition-all duration-1000"
            style={{ width: `${(currentStage / (stages.length - 1)) * 100}%` }}
          ></div>
        </div>

        {/* Stages */}
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stages.map((stage, idx) => {
            const isComplete = idx <= currentStage;
            const isCurrent = idx === currentStage;
            return (
              <div key={stage.key} className="flex flex-col items-center text-center">
                <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${isComplete
                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/30'
                    : 'bg-background text-secondary border-card-border'
                  } ${isCurrent ? 'animate-pulse scale-110' : ''}`}>
                  {isComplete ? '✓' : idx + 1}
                </div>
                <div className={`mt-2 text-xs font-semibold ${isComplete ? 'text-foreground' : 'text-secondary'}`}>
                  {stage.label}
                </div>
                {isCurrent && lastIncident && (
                  <div className="mt-1 px-2 py-0.5 bg-primary/20 text-primary rounded-full text-[10px] font-bold">
                    Active
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {lastIncident && (
        <div className="mt-6 p-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎯</span>
            <div className="text-xs font-bold uppercase opacity-60">Latest Incident</div>
          </div>
          <div className="text-sm font-medium mb-2">{lastIncident.description}</div>
          <div className="flex gap-3 text-xs text-secondary">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${Number(lastIncident.severity) === 2 ? 'bg-red-500' :
                  Number(lastIncident.severity) === 1 ? 'bg-orange-500' :
                    'bg-yellow-500'
                }`}></span>
              {Number(lastIncident.severity) === 2 ? 'Critical' : Number(lastIncident.severity) === 1 ? 'High' : 'Medium'}
            </span>
            <span>•</span>
            <span className="font-mono">{new Date(Number(lastIncident.timestamp) * 1000).toLocaleTimeString()}</span>
            <span>•</span>
            <span className="font-mono">{lastIncident.incidentType}</span>
          </div>
        </div>
      )}
    </section>
  );
};

export default IncidentLifecycle;
