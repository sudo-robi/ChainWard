
"use client";

import React, { useState } from 'react';
import { useChainWardData, TimelineEvent } from '../context/ChainWardDataProvider';

const ForensicTimeline = () => {
  const { timelineEvents: timeline } = useChainWardData();

  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayIdx, setReplayIdx] = useState(-1);

  function getSeverity(reason?: string) {
    if (!reason) return { level: 'Low', color: 'bg-secondary' };
    if (reason.toLowerCase().includes('stall')) return { level: 'Critical', color: 'bg-danger' };
    if (reason.toLowerCase().includes('block lag')) return { level: 'High', color: 'bg-warning' };
    if (reason.toLowerCase().includes('state root')) return { level: 'Medium', color: 'bg-primary' };
    return { level: 'Low', color: 'bg-secondary' };
  }

  const handleReplay = () => {
    if (!timeline.length) return;
    setReplaying(true);
    setReplayIdx(0);
  };

  // Animate replay
  React.useEffect(() => {
    if (replaying && replayIdx >= 0 && replayIdx < timeline.length) {
      const timeout = setTimeout(() => {
        setReplayIdx(replayIdx + 1);
      }, 1200);
      if (replayIdx === timeline.length - 1) {
        setTimeout(() => {
          setReplaying(false);
          setReplayIdx(-1);
        }, 1400);
      }
      return () => clearTimeout(timeout);
    }
  }, [replaying, replayIdx, timeline.length]);

  return (
    <section className="p-6 bg-card rounded-xl shadow border border-card-border">
      <h2 className="text-xl font-bold mb-4">Forensic Timeline</h2>
      <div className="flex justify-between items-center mb-6">
        <button
          className={`font-medium px-4 py-2 rounded-lg transition-all shadow-lg ${timeline.length === 0 ? 'bg-secondary/50 cursor-not-allowed opacity-50' : 'bg-primary hover:bg-primary/90 shadow-primary/20 text-white'}`}
          onClick={handleReplay}
          disabled={replaying || timeline.length === 0}
        >
          {replaying ? 'Replaying...' : timeline.length === 0 ? 'No Events to Replay' : 'Replay Timeline'}
        </button>
        <div className="text-sm text-secondary">
          {timeline.length} event{timeline.length !== 1 ? 's' : ''} recorded
        </div>
      </div>
      <div className="space-y-2">
        {timeline.length === 0 ? (
          <div className="text-secondary italic text-center py-8">No timeline events recorded yet.</div>
        ) : (
          timeline.map((event, idx) => {
            const severity = getSeverity(event.reason);
            const isActive = replaying && idx === replayIdx;
            const eventIcon = event.type === 'Reported' ? '🚨' : event.type === 'Resolved' ? '✅' : '📝';
            return (
              <div
                key={idx}
                className={`relative border-l-4 pl-4 py-3 cursor-pointer transition-all rounded-r-lg hover:bg-card/50 flex items-start gap-3 ${isActive ? 'bg-warning/10 border-warning shadow-md' :
                  event.type === 'Reported' ? 'border-red-500/30 hover:border-red-500/50' :
                    'border-green-500/30 hover:border-green-500/50'
                  }`}
                onClick={() => setSelected(event)}
              >
                <div className="flex flex-col items-center gap-1 pt-1">
                  <div className={`w-3 h-3 rounded-full ${severity.color} ring-2 ring-white/10 ${isActive ? 'animate-ping' : ''}`}></div>
                  {idx < timeline.length - 1 && (
                    <div className="w-0.5 h-full bg-gradient-to-b from-card-border to-transparent"></div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-lg">{eventIcon}</span>
                    <span className="font-mono text-xs text-secondary">{event.time}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severity.level === 'Critical' ? 'bg-red-500/20 text-red-500' :
                      severity.level === 'High' ? 'bg-orange-500/20 text-orange-500' :
                        severity.level === 'Medium' ? 'bg-yellow-500/20 text-yellow-500' :
                          'bg-blue-500/20 text-blue-500'
                      }`}>{severity.level}</span>
                    {isActive && (
                      <span className="px-2 py-0.5 bg-warning text-white text-xs rounded-full animate-pulse">Live</span>
                    )}
                  </div>
                  <div className="text-sm font-medium mb-1">{event.type === 'Reported' ? event.reason || 'Incident Detected' : 'Incident Cleared'}</div>
                  {event.incidentId && (
                    <div className="text-xs font-mono opacity-50">ID: #{event.incidentId}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {replaying && replayIdx >= 0 && replayIdx < timeline.length && (
        <div className="mt-6 p-4 bg-card/50 border border-warning/50 rounded-lg backdrop-blur-sm">
          <div className="text-warning font-bold mb-2">Replay Step {replayIdx + 1}/{timeline.length}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-secondary">Type:</div><div>{timeline[replayIdx].type}</div>
            <div className="text-secondary">Time:</div><div>{timeline[replayIdx].time}</div>
            {timeline[replayIdx].reason && <><div className="text-secondary">Reason:</div><div>{timeline[replayIdx].reason}</div></>}
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card p-6 rounded-2xl shadow-2xl w-full max-w-md border border-card-border">
            <h3 className="text-xl font-bold mb-4 text-primary">Post-Mortem Analysis</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-card-border pb-2">
                <span className="text-secondary">Event Type</span>
                <span className="font-medium">{selected.type}</span>
              </div>
              <div className="flex justify-between border-b border-card-border pb-2">
                <span className="text-secondary">Timestamp</span>
                <span className="font-mono">{selected.time}</span>
              </div>
              {selected.reason && (
                <div className="flex justify-between border-b border-card-border pb-2">
                  <span className="text-secondary">Reason</span>
                  <span className="font-medium text-danger">{selected.reason}</span>
                </div>
              )}
              {selected.incidentId && (
                <div className="flex justify-between border-b border-card-border pb-2">
                  <span className="text-secondary">Incident ID</span>
                  <span className="font-mono">{selected.incidentId}</span>
                </div>
              )}
              {selected.reporter && (
                <div className="flex justify-between border-b border-card-border pb-2">
                  <span className="text-secondary">Reporter</span>
                  <span className="font-mono text-xs">{selected.reporter.slice(0, 6)}...{selected.reporter.slice(-4)}</span>
                </div>
              )}
              {selected.description && (
                <div className="pt-2">
                  <span className="text-secondary block mb-1">Description</span>
                  <p className="text-secondary-foreground bg-secondary/10 p-2 rounded">{selected.description}</p>
                </div>
              )}
            </div>
            <button className="mt-6 w-full bg-secondary hover:bg-secondary/80 text-white py-2 rounded-lg transition-colors" onClick={() => setSelected(null)}>Close Analysis</button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ForensicTimeline;
