
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { config as appConfig } from '../config';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBalance } from 'wagmi';
import { parseEther, formatEther } from 'viem';

const registryAddress = appConfig.registryAddress as `0x${string}`;
const rawChainId = appConfig.chainId;
const chainId = BigInt(rawChainId || 421614);

const RegistryAbi = [
  {
    name: 'getBond',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'chainId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'depositBond',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'chainId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdrawBond',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'chainId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const OperatorIncentives = () => {
  const { address, isConnected } = useAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Read Bond
  const { data: bondVal, refetch: refetchBond, isLoading: isLoadingBond } = useReadContract({
    address: registryAddress,
    abi: RegistryAbi,
    functionName: 'getBond',
    args: [chainId],
    query: {
      enabled: mounted
    }
  });

  // Read User Balance for context
  const { data: balanceData } = useBalance({
    address: address,
  });

  // Write Actions
  const { data: hash, isPending, writeContract, error: writeError, reset: resetWrite } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      refetchBond();
      setDepositAmount('');
      setWithdrawAmount('');
      setTimeout(() => resetWrite(), 5000);
    }
  }, [isConfirmed, refetchBond, resetWrite]);

  const handleDeposit = () => {
    if (!depositAmount) return;
    writeContract({
      address: registryAddress,
      abi: RegistryAbi,
      functionName: 'depositBond',
      args: [chainId],
      value: parseEther(depositAmount),
    });
  };

  const handleWithdraw = () => {
    if (!withdrawAmount) return;
    writeContract({
      address: registryAddress,
      abi: RegistryAbi,
      functionName: 'withdrawBond',
      args: [chainId, parseEther(withdrawAmount)],
    });
  };

  const bondDisplay = bondVal !== undefined ? `${formatEther(bondVal)} ETH` : '--- ETH';
  const status = bondVal !== undefined && Number(bondVal) > 0 ? 'Active' : 'Inactive';

  if (!mounted) return null;

  return (
    <section className="p-1 bg-gradient-to-br from-card-border/50 to-transparent rounded-2xl shadow-2xl border border-card-border/40 overflow-hidden">
      <div className="bg-card/80 backdrop-blur-xl p-5 sm:p-7 rounded-[14px]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2 uppercase">
              Operator Management
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mt-1 opacity-60">Staking & Incentive Liquidity</p>
          </div>
          {!isConnected ? (
            <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[10px] font-black tracking-tighter text-red-400 uppercase">Wallet Not Linked</span>
            </div>
          ) : (
            <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-black tracking-tighter text-emerald-400 uppercase">Connected</span>
            </div>
          )}
        </div>

        {isLoadingBond && bondVal === undefined ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-24 bg-background/50 rounded-xl border border-card-border/30"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Balanced Liquidity Overview */}
            <div className="bg-background/20 rounded-xl border border-card-border/30 overflow-hidden">
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-card-border/30">
                <div className="p-4">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">Status</label>
                  <span className={`text-sm font-black font-mono tracking-tight ${status === 'Active' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {status}
                  </span>
                </div>
                <div className="p-4">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">Staked Bond</label>
                  <span className="text-sm font-black font-mono tracking-tight text-foreground">
                    {bondDisplay}
                  </span>
                </div>
                <div className="p-4">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">Yield Accrued</label>
                  <span className="text-sm font-black font-mono tracking-tight text-emerald-400">
                    +1.42 ETH
                  </span>
                </div>
                <div className="p-4">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">Wallet Env</label>
                  <span className="text-[10px] font-black font-mono tracking-tighter text-secondary opacity-60">
                    {balanceData ? `${Number(balanceData.formatted).toFixed(4)} ${balanceData.symbol}` : '---'}
                  </span>
                </div>
              </div>
            </div>

            {/* Transaction Controls */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Increase Stake</label>
                  <span className="text-[9px] font-bold opacity-30">Max liquidity injection</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="flex-1 bg-background/40 border border-card-border/40 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10 transition-all placeholder:opacity-20"
                    placeholder="0.00 ETH"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    disabled={!isConnected || isPending || isConfirming}
                  />
                  <button
                    className="bg-primary hover:bg-primary/90 text-white font-black px-6 py-3 rounded-xl transition-all disabled:opacity-20 active:scale-95 text-xs uppercase tracking-widest"
                    onClick={handleDeposit}
                    disabled={!isConnected || isPending || isConfirming || !depositAmount}
                  >
                    Deposit
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Redeem Liquidity</label>
                  <span className="text-[9px] font-bold opacity-30">Subject to slashing window</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="flex-1 bg-background/40 border border-card-border/40 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-red-500/40 focus:ring-4 focus:ring-red-500/10 transition-all placeholder:opacity-20"
                    placeholder="0.00 ETH"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    disabled={!isConnected || isPending || isConfirming}
                  />
                  <button
                    className="bg-background border border-red-500/40 hover:bg-red-500/10 text-red-500 font-black px-6 py-3 rounded-xl transition-all disabled:opacity-20 active:scale-95 text-xs uppercase tracking-widest"
                    onClick={handleWithdraw}
                    disabled={!isConnected || isPending || isConfirming || !withdrawAmount}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            </div>

            {/* Operational Feedback */}
            {(isPending || isConfirming || isConfirmed || writeError || hash) && (
              <div className="pt-4 border-t border-card-border/20 space-y-3">
                {isPending && <div className="text-[10px] font-black text-primary animate-pulse uppercase tracking-[2px] text-center">Awaiting Signature Verification...</div>}
                {isConfirming && <div className="text-[10px] font-black text-secondary animate-pulse uppercase tracking-[2px] text-center">Submitting to Arbitrum Sepolia...</div>}
                {isConfirmed && <div className="text-[10px] font-black text-emerald-400 uppercase tracking-[2px] text-center">Liquidity Successfully Synchronized</div>}
                {writeError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-mono text-red-400 break-words">
                    ERR: {writeError.message.split('\n')[0]}
                  </div>
                )}

                {hash && (
                  <div className="flex items-center justify-between p-3 bg-background/40 rounded-xl border border-card-border/30">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase opacity-30 tracking-widest">Transaction Artifact</span>
                      <span className="text-[10px] font-mono opacity-60">{hash.slice(0, 20)}...{hash.slice(-10)}</span>
                    </div>
                    <a
                      href={`https://sepolia.arbiscan.io/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-black text-primary hover:text-white transition-colors flex items-center gap-1 uppercase tracking-tighter"
                    >
                      Inspect <span className="opacity-50">→</span>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default OperatorIncentives;
