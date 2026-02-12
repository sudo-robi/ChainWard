#!/usr/bin/env node

/**
 * sync-response-config.js
 * Read a JSON config (exported from the frontend) and write a `.env.monitor` file
 * Usage:
 *   node scripts/sync-response-config.js /path/to/config.json
 * If no path provided, uses `./config/sample-response-config.json`
 */

const fs = require('fs');
const path = require('path');

function toEnvLine(key, value) {
  return `${key}=${String(value)}`;
}

function main() {
  const arg = process.argv[2];
  const configPath = arg || path.join(__dirname, 'config', 'sample-response-config.json');

  if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  const env = [];

  env.push(toEnvLine('RESPONSE_ENABLED', cfg.enabled === true));
  env.push(toEnvLine('RESPONSE_DRY_RUN', cfg.dryRun === true));

  // Actions: array to comma-separated
  if (Array.isArray(cfg.actions)) {
    env.push(toEnvLine('RESPONSE_ACTIONS', cfg.actions.join(',')));
  } else if (Array.isArray(cfg.selectedActions)) {
    env.push(toEnvLine('RESPONSE_ACTIONS', cfg.selectedActions.join(',')));
  }

  if (cfg.blockLagThreshold !== undefined) {
    env.push(toEnvLine('BLOCK_LAG_THRESHOLD', Number(cfg.blockLagThreshold)));
  }

  // Optional responder addresses
  if (cfg.sequencerPauseAddress) env.push(toEnvLine('SEQUENCER_PAUSE_ADDRESS', cfg.sequencerPauseAddress));
  if (cfg.failoverControllerAddress) env.push(toEnvLine('FAILOVER_CONTROLLER_ADDRESS', cfg.failoverControllerAddress));
  if (cfg.bridgeLockAddress) env.push(toEnvLine('BRIDGE_LOCK_ADDRESS', cfg.bridgeLockAddress));

  // Chain ID
  if (cfg.chainId) env.push(toEnvLine('CHAIN_ID', cfg.chainId));

  // Write to repository root
  const outPath = path.join(__dirname, '..', '.env.monitor');
  fs.writeFileSync(outPath, env.join('\n') + '\n', { encoding: 'utf8' });

  console.log('Wrote .env.monitor to', outPath);
  console.log('Contents:');
  console.log('--------------------------------');
  console.log(fs.readFileSync(outPath, 'utf8'));
}

if (require.main === module) main();
