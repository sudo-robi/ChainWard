#!/bin/bash
set -e

RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
PK="573d875d95b272cdc6be8e0768238c6d84fab642e4feeb609fd91d9f6fdda5b5"
REPORTER="0x7a5e0237E45574727aA4352244B1f72559BbA229"

echo "Fetching current block info..."
BN=$(cast block-number --rpc-url $RPC_URL)
TS=$(cast block --field timestamp --rpc-url $RPC_URL)

echo "Current Block: $BN, Time: $TS"

echo "Submitting HEALTHY signal..."
cast send $REPORTER "submitHealthSignal(uint256,uint256,uint256,uint256,bool,uint256,uint256,bool,string)" \
  421614 $BN $TS 100 true 50 $TS true "Healthy test" \
  --rpc-url $RPC_URL --private-key $PK

echo "Waiting 35s to respect rate limit..."
sleep 35

echo "Submitting UNHEALTHY signal (Sequencer Stall)..."
# Simulate next block (approx +12s from previous, but we waited 35s so maybe +3 blocks)
BN=$((BN + 3))
TS=$((TS + 36))

cast send $REPORTER "submitHealthSignal(uint256,uint256,uint256,uint256,bool,uint256,uint256,bool,string)" \
  421614 $BN $TS 100 false 50 $TS true "Sequencer stalled test" \
  --rpc-url $RPC_URL --private-key $PK

echo "Simulation complete."
