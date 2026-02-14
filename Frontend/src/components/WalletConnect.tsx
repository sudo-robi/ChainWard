"use client";
import React from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

const WalletConnect = () => {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-3 bg-Service Level Agreementte-900/50 backdrop-blur-sm p-1.5 rounded-full border border-Service Level Agreementte-800 shadow-sm opacity-50">
        <div className="px-6 py-2 text-sm text-Service Level Agreementte-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2 sm:gap-3 bg-Service Level Agreementte-900/50 backdrop-blur-sm p-1.5 rounded-full border border-Service Level Agreementte-800 shadow-sm">
      {isConnected ? (
        <>
          <div className="px-2 sm:px-3 py-1.5 flex items-center gap-1.5 sm:gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-Service Level Agreementte-200 font-mono text-xs sm:text-sm">{address?.slice(0, 4)}...{address?.slice(-3)}</span>
          </div>
          <button
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all focus:ring-2 focus:ring-red-500 focus:ring-offset-1 focus:outline-none"
            onClick={() => disconnect()}
            aria-label="Disconnect wallet"
          >
            <span className="hidden sm:inline">Disconnect</span>
            <span className="sm:hidden">✕</span>
          </button>
        </>
      ) : (
        <button
          className="bg-sky-500 hover:bg-sky-400 text-white px-4 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg shadow-sky-500/20 transition-all hover:scale-105 active:scale-95 focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:outline-none"
          onClick={() => connect({ connector: injected() })}
          aria-label="Connect cryptocurrency wallet"
        >
          <span className="hidden sm:inline">Connect Wallet</span>
          <span className="sm:hidden">Connect</span>
        </button>
      )}
    </div>
  );
};

export default WalletConnect;
