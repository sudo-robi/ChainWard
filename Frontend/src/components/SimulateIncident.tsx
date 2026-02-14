
"use client";

import React, { useState, useEffect, useRef } from 'react';

const SimulateIncident = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [priority, setPriority] = useState(1);
  const [parentId, setParentId] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSimulate = async (type: string) => {
    if (isSimulating) return;
    setIsSimulating(true);
    setLogs([]);

    addLog(`Initializing simulation for ${type}...`);
    setTimeout(() => addLog("Connecting to Arbitrum Sepolia RPC..."), 500);
    setTimeout(() => addLog(`Settings: Priority P${priority}, Parent: ${parentId || 'None'}`), 1000);
    setTimeout(() => addLog("Signing transaction..."), 2000);

    try {
      const res = await fetch('/api/simulate-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          priority,
          parentId: parentId || 0
        })
      });

      const data = await res.json();

      if (res.ok) {
        addLog("Transaction confirmed on-chain!");
        const match = data.output?.match(/0x[a-fA-F0-9]{64}/);
        if (match) {
          addLog(`TX Hash: ${match[0]}`);
        }
        addLog(`Success: ${data.status}`);
      } else {
        addLog(`Error: ${data.error || 'Simulation failed'}`);
      }
    } catch (e: any) {
      addLog(`System Error: ${e.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <section className="p-6 bg-card rounded-xl shadow border border-card-border h-full flex flex-col">
      <h2 className="text-xl font-bold mb-4">Simulate Incident</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase opacity-60">Priority Level</label>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value={0}>P0 (Emergency)</option>
            <option value={1}>P1 (Critical)</option>
            <option value={2}>P2 (High)</option>
            <option value={3}>P3 (Medium)</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase opacity-60">Cluster with ID (Optional)</label>
          <input
            type="number"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            placeholder="e.g. 1234"
            className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        <button
          disabled={isSimulating}
          className={`font-medium px-4 py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${isSimulating ? 'bg-secondary/20 text-secondary' : 'bg-red-500/90 hover:bg-red-500 text-white hover:shadow-lg hover:shadow-red-500/20'}`}
          onClick={() => handleSimulate('BLOCK_LAG')}
        >
          {isSimulating ? <span className="animate-spin">⟳</span> : '⚠'} Simulate Block Lag
        </button>
        <button
          disabled={isSimulating}
          className={`font-medium px-4 py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${isSimulating ? 'bg-secondary/20 text-secondary' : 'bg-orange-500/90 hover:bg-orange-500 text-white hover:shadow-lg hover:shadow-orange-500/20'}`}
          onClick={() => handleSimulate('SEQUENCER_STALL')}
        >
          {isSimulating ? <span className="animate-spin">⟳</span> : '⚠'} Simulate Sequencer Stall
        </button>
      </div>

      <div className="flex-1 bg-black/80 rounded-lg border border-card-border p-3 font-mono text-xs overflow-y-auto min-h-[150px] shadow-inner">
        <div className="text-secondary mb-2 border-b border-white/10 pb-1 flex justify-between">
          <span>Live Execution Log</span>
          <span className="text-[10px] opacity-50 uppercase">Arbitrum Sepolia</span>
        </div>
        <div className="space-y-1">
          {logs.length === 0 &&<span className="text-secondary/30 italic">Ready to simulate...</span>}
          {logs.map((log, i) => (
            <div key={i} className={`${log.includes('Error') ? 'text-red-400' : log.includes('Success') || log.includes('Hash') ? 'text-green-400' : 'text-primary/80'}`}>
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </section>
  );
};

export default SimulateIncident;
