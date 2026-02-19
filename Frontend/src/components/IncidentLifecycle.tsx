"use client";
import React, { useMemo } from 'react';
import { useChainWardData } from '../context/ChainWardDataProvider';

const stages = [
  { label: 'Detection', key: 'detected' },
  { label: 'Validation', key: 'validated' },
  { label: 'On-chain Record', key: 'recorded' },
  { label: 'Automated Response', key: 'responded' }
];

const IncidentLifecycle = () => {
  const { incidents, isLoading } = useChainWardData();

  // Derive lifecycle stage from shared incident data
  const { currentStage, lastIncident } = useMemo(() => {
    if (incidents.length === 0) {
      return { currentStage: 0, lastIncident: null };
    }

    // Get the most recent incident (highest ID)
    const sorted = [...incidents].sort((a, b) => Number(b.id) - Number(a.id));
    const latest = sorted[0];

    let stage = 0; // Detection: always active if we found an incident

    if (latest.validations > 0) {
      stage = 2; // Validated + On-chain Record
    }

    if (latest.resolved) {
      stage = 3; // Full lifecycle complete
    }

    return { currentStage: stage, lastIncident: latest };
  }, [incidents]);

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
              <span className={`w-2 h-2 rounded-full ${lastIncident.severity === 2 ? 'bg-red-500' :
                lastIncident.severity === 1 ? 'bg-orange-500' :
                  'bg-yellow-500'
                }`}></span>
              {lastIncident.severity === 2 ? 'Critical' : lastIncident.severity === 1 ? 'High' : 'Medium'}
            </span>
            <span>•</span>
            <span className="font-mono">{new Date(lastIncident.timestamp * 1000).toLocaleTimeString()}</span>
            <span>•</span>
            <span className="font-mono">{lastIncident.incidentType}</span>
          </div>
        </div>
      )}
    </section>
  );
};

export default IncidentLifecycle;
