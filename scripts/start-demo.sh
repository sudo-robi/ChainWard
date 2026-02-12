#!/bin/bash

# Ensure bond is deposited for demo
echo "Checking bond status..."
cd "$(dirname "$0")/.."
node scripts/deposit_bond.js

# Start the heartbeat reporter in the background
echo "Starting heartbeat reporter..."
node scripts/auto_report.js > /tmp/chainward-heartbeat.log 2>&1 &
HEARTBEAT_PID=$!
echo "Heartbeat reporter started (PID: $HEARTBEAT_PID)"

# Start the Next.js dev server
echo "Starting Next.js dev server..."
cd frontend
npm run dev

# When dev server stops, kill the heartbeat reporter
kill $HEARTBEAT_PID 2>/dev/null
echo "Heartbeat reporter stopped"
