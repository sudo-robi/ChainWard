
"use client";

import React, { useState, useEffect } from 'react';
import { config as appConfig } from '../config';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';

const registryAddress = appConfig.registryAddress as `0x${string}`;
const chainId = BigInt(appConfig.chainId);

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
  const { isConnected } = useAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Read Bond
  const { data: bondVal, refetch: refetchBond } = useReadContract({
    address: registryAddress,
    abi: RegistryAbi,
    functionName: 'getBond',
    args: [chainId],
  });

  // Write Actions
  const { data: hash, isPending, writeContract, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      refetchBond();
    }
  }, [isConfirmed, refetchBond]);

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

  const bondDisplay = bondVal ? `${formatEther(bondVal)} ETH` : '0 ETH';
  const status = bondVal && Number(bondVal) > 0 ? 'Active' : 'Inactive';

  return (
    <section className="p-4 sm:p-6 bg-card rounded-xl shadow border border-card-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
        <h2 className="text-lg sm:text-xl font-bold font-heading">Operator/Reporter Incentives</h2>
        {mounted &&!isConnected &&<span className="text-xs text-danger font-mono">Wallet not connected</span>}
      </div>

      {!bondVal && mounted ? (
        <div className="space-y-4 animate-pulse">
          <div className="bg-card-border/30 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-card-border/30 rounded-lg p-4 mb-6">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <li className="flex flex-col">
            <span className="text-xs sm:text-sm text-secondary">Bond Status</span>
            <span className={`font-mono text-base sm:text-lg ${status === 'Active' ? 'text-success' : 'text-danger'}`}>{status}</span>
          </li>
          <li className="flex flex-col">
            <span className="text-xs sm:text-sm text-secondary">Bond Amount</span>
            <span className="font-mono text-base sm:text-lg">{bondDisplay}</span>
          </li>
          <li className="flex flex-col">
            <span className="text-xs sm:text-sm text-secondary">Pending Rewards</span>
            <span className="font-mono text-base sm:text-lg text-success">10 ETH</span>
          </li>
          <li className="flex flex-col">
            <span className="text-xs sm:text-sm text-secondary">Applied Penalties</span>
            <span className="font-mono text-base sm:text-lg text-danger">0</span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold opacity-60 uppercase tracking-wide block lg:hidden">Deposit Bond</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              className="flex-1 bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
              placeholder="Amount (ETH)"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              disabled={isPending || isConfirming}
              aria-label="Deposit amount in ETH"
            />
            {mounted ? (
              <button
                className="bg-success hover:bg-success/90 text-zinc-900 font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-50 w-full sm:w-auto focus:ring-2 focus:ring-success focus:ring-offset-2 focus:outline-none"
                onClick={handleDeposit}
                disabled={!isConnected || isPending || isConfirming}
                aria-label="Deposit bond"
              >
                Deposit
              </button>
            ) : (
              <button
                className="bg-success hover:bg-success/90 text-zinc-900 font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-50 w-full sm:w-auto focus:ring-2 focus:ring-success focus:ring-offset-2 focus:outline-none"
                disabled
                aria-label="Deposit bond"
              >
                Deposit
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold opacity-60 uppercase tracking-wide block lg:hidden">Withdraw Bond</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              className="flex-1 bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
              placeholder="Amount (ETH)"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              disabled={isPending || isConfirming}
              aria-label="Withdraw amount in ETH"
            />
            {mounted ? (
              <button
                className="bg-danger hover:bg-danger/90 text-white font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-50 w-full sm:w-auto focus:ring-2 focus:ring-danger focus:ring-offset-2 focus:outline-none"
                onClick={handleWithdraw}
                disabled={!isConnected || isPending || isConfirming}
                aria-label="Withdraw bond"
              >
                Withdraw
              </button>
            ) : (
              <button
                className="bg-danger hover:bg-danger/90 text-white font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-50 w-full sm:w-auto focus:ring-2 focus:ring-danger focus:ring-offset-2 focus:outline-none"
                disabled
                aria-label="Withdraw bond"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>

      {isPending &&<div className="mt-4 text-sm text-primary animate-pulse font-mono">Confirm in MetaMask...</div>}
      {isConfirming &&<div className="mt-4 text-sm text-secondary animate-pulse font-mono">Transaction pending...</div>}
      {isConfirmed &&<div className="mt-4 text-sm text-success font-mono">Transaction confirmed!</div>}
      {writeError &&<div className="mt-4 text-sm text-danger font-mono">Error: {writeError.message.split('\n')[0]}</div>}

      {hash &&(
        <div className="mt-4 p-3 bg-black/50 rounded-lg border border-card-border flex justify-between items-center">
          <span className="text-xs text-secondary font-mono">Tx Hash: {hash.slice(0, 10)}...{hash.slice(-8)}</span>
          <a
            href={`https://sepolia.arbiscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline font-mono"
          >
            View on Explorer →
          </a>
        </div>
      )}
      </>
      )}
    </section>
  );
};

export default OperatorIncentives;
