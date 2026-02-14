#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const { spawn } = require('child_process');

// --- Helper: RPC Call via Curl with Retry ---
async function rpcCall(method, params = [], attempt = 0) {
  const MAX_RETRIES = 5;
  const INITIAL_BACKOFF = 1000;

  return new Promise((resolve, reject) => {
    const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: Date.now()
    });

    const command = 'curl';
    const args = [
      '-s',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-d', '@-',
      rpcUrl
    ];

    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => stdout += data.toString());
    child.stderr.on('data', (data) => stderr += data.toString());

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn curl: ${err.message}`));
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        if (attempt < MAX_RETRIES) {
          const wait = INITIAL_BACKOFF * Math.pow(2, attempt);
          console.warn(`Curl exit ${code}. Retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          return resolve(rpcCall(method, params, attempt + 1));
        }
        return reject(new Error(`Curl error (exit code ${code}): ${stderr}`));
      }

      try {
        const trimmed = stdout.trim();
        if (!trimmed) throw new Error('Empty response from curl');
        const json = JSON.parse(trimmed);

        if (json.error) {
          const isRateLimit = json.error.code === 429 || (json.error.message && json.error.message.includes('Too Many Requests'));
          if (isRateLimit && attempt < MAX_RETRIES) {
            const wait = INITIAL_BACKOFF * Math.pow(2, attempt) + Math.random() * 500;
            console.warn(`Rate limited (429). Attempt ${attempt + 1}. Retrying in ${Math.round(wait)}ms...`);
            await new Promise(r => setTimeout(r, wait));
            return resolve(rpcCall(method, params, attempt + 1));
          }
          return reject(new Error(JSON.stringify(json.error)));
        }
        resolve(json.result);
      } catch (e) {
        if (attempt < MAX_RETRIES) {
          const wait = INITIAL_BACKOFF * Math.pow(2, attempt);
          console.warn(`Parse error. Retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          return resolve(rpcCall(method, params, attempt + 1));
        }
        reject(new Error(`Parse error: ${e.message}. Raw output: ${stdout}`));
      }
    });

    child.stdin.write(body);
    child.stdin.end();
  });
}

// --- Nonce Management ---
let currentNonce = -1;

async function fetchNonce(address) {
  const nonceHex = await rpcCall('eth_getTransactionCount', [address, 'pending']);
  return parseInt(nonceHex, 16);
}

// --- Helper: Send Transaction ---
async function sendTx(to, data, wallet) {
  console.log(`Preparing tx to ${to}...`);

  // 1. Get Nonce (fetch if first time, or if we hit a nonce error)
  if (currentNonce === -1) {
    currentNonce = await fetchNonce(wallet.address);
  }
  const nonce = currentNonce;

  // 2. Get Gas Price (add 10% buffer)
  const gasPriceHex = await rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex) * 110n / 100n;

  // 3. Chain ID
  const chainId = Number(process.env.CHAIN_ID || '421614');

  const tx = {
    to: to,
    data: data,
    value: 0,
    gasLimit: 500000n, // Hardcoded gas limit for simplicity, or could estimate
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
    nonce: nonce,
    chainId: chainId
  };

  // 4. Sign
  const signedTx = await wallet.signTransaction(tx);

  // 5. Broadcast
  console.log(`Broadcasting tx with nonce ${nonce}...`);
  try {
    const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
    // Success! Increment our local nonce
    currentNonce++;
    return txHash;
  } catch (e) {
    const errStr = e.message || String(e);
    if (errStr.includes('nonce too low') || errStr.includes('already known')) {
      console.warn(`Nonce collision detected for ${nonce}. Refetching...`);
      currentNonce = await fetchNonce(wallet.address);
      // Recurse once to try again with fresh nonce
      return sendTx(to, data, wallet);
    }
    throw e;
  }
}

// --- Helper: Wait for Receipt ---
async function waitForReceipt(txHash) {
  console.log(`Waiting for receipt: ${txHash}`);
  let retries = 30;
  while (retries > 0) {
    await new Promise(r => setTimeout(r, 2000));
    const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
    if (receipt) {
      if (receipt.status === '0x1') return receipt;
      throw new Error(`Transaction failed: ${txHash}`);
    }
    retries--;
    process.stdout.write('.');
  }
  throw new Error(`Timeout waiting for receipt: ${txHash}`);
}

async function main() {
  const PK = process.env.PRIVATE_KEY;
  if (!PK) {
    console.error('Set PRIVATE_KEY in .env to run auto reporter');
    process.exit(1);
  }
  const wallet = new ethers.Wallet(PK); // Offline signer
  console.log(`Reporter: ${wallet.address}`);

  const incidentManagerAddress = process.env.INCIDENT_MANAGER_ADDRESS;
  const reporterAddress = process.env.HEALTH_REPORTER_ADDRESS || process.env.MONITOR_ADDRESS;
  const chainId = BigInt(process.env.CHAIN_ID || '1'); // For heartbeat payload

  // --- Simulation Mode ---
  const args = process.argv.slice(2);
  const simulateIdx = args.indexOf('--simulate');

  if (simulateIdx !== -1 && args[simulateIdx + 1]) {
    if (!incidentManagerAddress) {
      console.error('Set INCIDENT_MANAGER_ADDRESS in .env');
      process.exit(1);
    }
    const incidentType = args[simulateIdx + 1];
    console.log(`Simulating incident: ${incidentType}`);

    // Map types to FailureType (uint8) and IncidentSeverity (uint8)
    let failureType = 4; // Unknown
    let severity = 0;    // Warning
    if (incidentType === 'sequencer_stall') {
      failureType = 0;
      severity = 1; // Critical
    } else if (incidentType === 'block_lag') {
      failureType = 1;
      severity = 0; // Warning
    } else if (incidentType === 'state_root_changed') {
      failureType = 3; // OperatorError
      severity = 1; // Critical
    } else if (incidentType === 'bridge_stall') {
      failureType = 5; // BridgeStall
      severity = 1; // Critical
    }

    const IncidentInterface = new ethers.Interface([
      'function reportIncident(string incidentType, uint256 severity, string description) external returns (uint256)'
    ]);

    try {
      // Parse optional args: --priority <0-3> --parent <id>
      const prioIdx = args.indexOf('--priority');
      const priority = prioIdx !== -1 ? Number(args[prioIdx + 1]) : 1;
      const parentIdx = args.indexOf('--parent');
      const parentId = parentIdx !== -1 ? Number(args[parentIdx + 1]) : 0;

      // Get current block info for "last healthy" state
      const blockNumberHex = await rpcCall('eth_blockNumber');
      const blockNumber = BigInt(blockNumberHex);
      const block = await rpcCall('eth_getBlockByNumber', [blockNumberHex, false]);
      const timestamp = BigInt(block.timestamp);

      const severityScore = severity === 1 ? 2 : 1;
      const data = IncidentInterface.encodeFunctionData('reportIncident', [
        incidentType,
        severityScore,
        `Simulated ${incidentType}`
      ]);

      const txHash = await sendTx(incidentManagerAddress, data, wallet);
      console.log('Incident reported tx:', txHash);
      await waitForReceipt(txHash);
      console.log('Incident confirmed');
      process.exit(0);
    } catch (e) {
      console.error('Error reporting incident:', e.message || e);
      process.exit(1);
    }
  }

  // --- Heartbeat Mode ---
  if (!reporterAddress) {
    console.error('Set HEALTH_REPORTER_ADDRESS (or MONITOR_ADDRESS) in .env');
    process.exit(1);
  }

  const MonitorInterface = new ethers.Interface([
    'function submitHealthSignal(uint256,uint256,uint256,uint256,bool,uint256,uint256,bool,string)',
    'function lastBlockNumber(uint256) view returns (uint256)'
  ]);

  let seq = 1;
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const monitor = new ethers.Contract(reporterAddress, MonitorInterface, provider);
    const lastBlock = await monitor.lastBlockNumber(chainId);
    seq = Number(lastBlock) + 1;
    console.log(`Resuming from block sequencer #${seq}`);
  } catch (e) {
    console.warn("Could not fetch last block, starting from 1");
  }

  const intervalSec = 35; // Respect 30s rate limit in plural HealthReporter
  console.log('Starting auto-reporter, submitting a health signal every', intervalSec, 's');

  setInterval(async () => {
    try {
      console.log(`\nSubmitting health signal #${seq}...`);
      const now = Math.floor(Date.now() / 1000);

      // function submitHealthSignal(chainId, blockNumber, blockTimestamp, sequencerNumber, healthy, l1BatchNum, l1BatchTime, bridgeHealthy, details)
      const data = MonitorInterface.encodeFunctionData('submitHealthSignal', [
        chainId,
        seq, // blockNumber (synthetic)
        now, // blockTimestamp
        seq + 1000, // sequencerNumber (synthetic)
        true, // sequencerHealthy
        Math.floor(seq / 5) + 1, // l1BatchNumber (synthetic, lags behind L2)
        now - 30, // l1BatchTimestamp (synthetic)
        true, // bridgeHealthy
        `Heartbeat signal #${seq}`
      ]);

      const txHash = await sendTx(reporterAddress, data, wallet);
      console.log('Tx sent:', txHash);
      seq++;
    } catch (e) {
      console.error('Error sending health signal:', e.message || e);
    }
  }, intervalSec * 1000);
}

main().catch((e) => { console.error(e); process.exit(1); });
