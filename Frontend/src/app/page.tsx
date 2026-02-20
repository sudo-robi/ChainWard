
"use client";

import React, { useState } from 'react';
import IncidentLifecycle from '../components/IncidentLifecycle';
import WalletConnect from '../components/WalletConnect';
// ... existing imports ...
import SystemLayersStatus from '../components/SystemLayersStatus';
import SimulateIncident from '../components/SimulateIncident';
import ChainHealth from '../components/ChainHealth';
import IncidentHistory from '../components/IncidentHistory';
import ForensicTimeline from '../components/ForensicTimeline';
import OperatorIncentives from '../components/OperatorIncentives';
import ResponsePanel from '../components/ResponsePanel';
import MultiChainDashboard from '../components/MultiChainDashboard';
import AlertSentry from '../components/AlertSentry';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import ThemeToggle from '../components/ThemeToggle';

export default function Home() {
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4 sm:p-6 md:p-8">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      <AlertSentry />
      <KeyboardShortcuts />
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 md:top-8 md:right-8 z-50 flex items-center gap-3">
        <ThemeToggle />
        <WalletConnect />
      </div>
      <header>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 sm:mb-8 text-center pr-32 sm:pr-0">Orbit Incident Commmand Center</h1>
      </header>
      <nav className="max-w-7xl mx-auto mb-6 flex flex-wrap gap-3 justify-between items-center" aria-label="Chain filter controls">
        <div className="flex items-center gap-4">
          {selectedChainId && (
            <button
              onClick={() => setSelectedChainId(null)}
              className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20 hover:bg-primary hover:text-white transition-all font-bold uppercase tracking-wider focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
              aria-label={`Clear chain ${selectedChainId} filter`}
            >
              Clear Focus: Chain #{selectedChainId} ✕
            </button>
          )}
        </div>
      </nav>
      <main id="main-content" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MultiChainDashboard selectedChainId={selectedChainId} onSelectChain={setSelectedChainId} />
        <AnalyticsDashboard selectedChainId={selectedChainId} />
        <SystemLayersStatus />
        <IncidentLifecycle />
        <ChainHealth />
        <IncidentHistory selectedChainId={selectedChainId} />
        <ForensicTimeline />
        <OperatorIncentives />
        <ResponsePanel />
        <SimulateIncident />
      </main>
    </div>
  );
}
