# ChainWard Demo Startup

This script automatically starts both the heartbeat reporter and the Next.js dev server.

## Usage

From the `frontend` directory:
```bash
npm run demo
```

Or from the root directory:
```bash
./scripts/start-demo.sh
```

## What it does

1. Starts the heartbeat reporter in the background (submits heartbeats every 5 seconds)
2. Starts the Next.js dev server
3. When you stop the dev server (Ctrl+C), it automatically stops the heartbeat reporter

## Logs

Heartbeat reporter logs are written to `/tmp/chainward-heartbeat.log`

To view logs:
```bash
tail -f /tmp/chainward-heartbeat.log
```
