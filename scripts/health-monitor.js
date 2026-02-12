#!/usr/bin/env node

/**
 * ChainWard Health Monitor Agent
 * Continuously monitors Arbitrum Sepolia for health anomalies
 * Detects: Block Lag, Sequencer Stall, State Root Changes
 * Submits signals to HealthReporter contract
 */

const ethers = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// If a .env.monitor file exists in the project root, load it to override env settings
const monitorEnvPath = path.join(__dirname, '..', '.env.monitor');
if (fs.existsSync(monitorEnvPath)) {
    require('dotenv').config({ path: monitorEnvPath });
}

const HEALTH_REPORTER_ADDRESS = '0x4feF295fA8eB6b0A387d2a0Dd397827eF1815a8d';
const CHAIN_ID = process.env.CHAIN_ID ? BigInt(process.env.CHAIN_ID) : 421614n;

const HEALTH_REPORTER_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "chainId", "type": "uint256" },
            { "internalType": "uint256", "name": "blockNumber", "type": "uint256" },
            { "internalType": "uint256", "name": "blockTimestamp", "type": "uint256" },
            { "internalType": "uint256", "name": "sequencerNumber", "type": "uint256" },
            { "internalType": "bool", "name": "sequencerHealthy", "type": "bool" },
            { "internalType": "string", "name": "details", "type": "string" }
        ],
        "name": "submitHealthSignal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

class HealthMonitor {
    constructor(rpcUrl, privateKey) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.signer = new ethers.Wallet(privateKey, this.provider);
        this.reporter = new ethers.Contract(HEALTH_REPORTER_ADDRESS, HEALTH_REPORTER_ABI, this.signer);

        this.lastBlock = null;
        this.lastBlockTime = null;
        this.blockLagThreshold = Number(process.env.BLOCK_LAG_THRESHOLD) || 60; // seconds
        this.checkInterval = 5000; // 5 seconds
        // Response integration config
        this.responseEnabled = (process.env.RESPONSE_ENABLED || 'false') === 'true';
        // comma separated actions, e.g. "PAUSE_SEQUENCER,FAILOVER,BRIDGE_LOCK"
        this.responseActions = (process.env.RESPONSE_ACTIONS || '').split(',').map(s => s.trim()).filter(Boolean);
        this.dryRun = (process.env.RESPONSE_DRY_RUN || 'true') === 'true';
        this.responders = {}; // contracts will be initialized lazily
        // State root verification
        this.l1Rpc = process.env.L1_RPC || null; // optional L1 provider for state-root checks
        this.l1Provider = this.l1Rpc ? new ethers.JsonRpcProvider(this.l1Rpc) : null;
        this.stateRootCheckInterval = Number(process.env.STATE_ROOT_CHECK_INTERVAL) || 12; // checks
        this._stateRootCounter = 0;
    }

    // Minimal responder ABIs (adjust when deploying real contracts)
    responderABIs() {
        return {
            SequencerPause: [
                'function pauseSequencer(uint256 incidentId, string reason) external',
                'function resumeSequencer() external',
                'function isPaused() external view returns (bool)'
            ],
            FailoverController: [
                'function activateFailover(uint256 chainId) external',
                'function deactivateFailover(uint256 chainId) external',
                'function isFailoverActive(uint256 chainId) external view returns (bool)'
            ],
            BridgeLock: [
                'function lockBridges(uint256 chainId) external',
                'function unlockBridges(uint256 chainId) external',
                'function areBridgesLocked(uint256 chainId) external view returns (bool)'
            ]
        };
    }

    // Initialize responder contract instances using env addresses (placeholders if not set)
    initResponders() {
        const addrs = {
            SequencerPause: process.env.SEQUENCER_PAUSE_ADDRESS || '0x0000000000000000000000000000000000000000',
            FailoverController: process.env.FAILOVER_CONTROLLER_ADDRESS || '0x0000000000000000000000000000000000000000',
            BridgeLock: process.env.BRIDGE_LOCK_ADDRESS || '0x0000000000000000000000000000000000000000'
        };

        const abis = this.responderABIs();

        for (const [name, addr] of Object.entries(addrs)) {
            try {
                if (addr && !addr.startsWith('0x0000')) {
                    this.responders[name] = new ethers.Contract(addr, abis[name], this.signer);
                }
            } catch (e) {
                console.warn(`⚠ Failed to init responder ${name}: ${e.message}`);
            }
        }
    }

    // Execute configured responses for a detected failure
    async executeResponses(failureType, incidentId, details, chainId, blockNumber) {
        if (!this.responseEnabled) return;
        if (!this.responders || Object.keys(this.responders).length === 0) this.initResponders();

        console.log(`🔁 Executing responses for ${failureType} (dryRun=${this.dryRun})`);

        for (const action of this.responseActions) {
            try {
                if (action === 'PAUSE_SEQUENCER' && this.responders.SequencerPause) {
                    const contract = this.responders.SequencerPause;
                    if (this.dryRun) {
                        console.log(`  · [DRY] Would call SequencerPause.pauseSequencer(${incidentId}, "${details}")`);
                        try {
                            const gas = await contract.estimateGas.pauseSequencer(incidentId, details, { from: this.signer.address });
                            console.log(`    estimatedGas: ${gas.toString()}`);
                        } catch (e) {
                            console.log('    estimateGas failed:', e.message);
                        }
                    } else {
                        const tx = await contract.pauseSequencer(incidentId, details);
                        console.log(`  · Sent pauseSequencer tx: ${tx.hash}`);
                        const r = await tx.wait();
                        console.log(`    confirmed in block ${r.blockNumber}`);
                    }
                }

                if (action === 'FAILOVER' && this.responders.FailoverController) {
                    const contract = this.responders.FailoverController;
                    if (this.dryRun) {
                        console.log(`  · [DRY] Would call FailoverController.activateFailover(${chainId})`);
                        try {
                            const gas = await contract.estimateGas.activateFailover(chainId, { from: this.signer.address });
                            console.log(`    estimatedGas: ${gas.toString()}`);
                        } catch (e) {
                            console.log('    estimateGas failed:', e.message);
                        }
                    } else {
                        const tx = await contract.activateFailover(chainId);
                        console.log(`  · Sent activateFailover tx: ${tx.hash}`);
                        const r = await tx.wait();
                        console.log(`    confirmed in block ${r.blockNumber}`);
                    }
                }

                if (action === 'BRIDGE_LOCK' && this.responders.BridgeLock) {
                    const contract = this.responders.BridgeLock;
                    if (this.dryRun) {
                        console.log(`  · [DRY] Would call BridgeLock.lockBridges(${chainId})`);
                        try {
                            const gas = await contract.estimateGas.lockBridges(chainId, { from: this.signer.address });
                            console.log(`    estimatedGas: ${gas.toString()}`);
                        } catch (e) {
                            console.log('    estimateGas failed:', e.message);
                        }
                    } else {
                        const tx = await contract.lockBridges(chainId);
                        console.log(`  · Sent lockBridges tx: ${tx.hash}`);
                        const r = await tx.wait();
                        console.log(`    confirmed in block ${r.blockNumber}`);
                    }
                }

            } catch (err) {
                console.error(`  ✗ Response action ${action} failed: ${err.message}`);
            }
        }
    }

    // State root verification scaffold: compares L2 block.stateRoot to a reference if available
    // Note: Real verification requires proofs / L1 mapping—this is a best-effort scaffold.
    async checkStateRoot(l2BlockNumber) {
        if (!this.l1Provider) return { isAnomaly: false };

        try {
            const l2Block = await this.provider.getBlock(l2BlockNumber);
            // Many chains expose `stateRoot` in block object
            const l2StateRoot = l2Block && l2Block.stateRoot ? String(l2Block.stateRoot) : null;

            if (!l2StateRoot) return { isAnomaly: false };

            // Heuristic: if user provides an L1 block number to compare via env
            const compareL1At = process.env.L1_BLOCK_FOR_COMPARE ? Number(process.env.L1_BLOCK_FOR_COMPARE) : null;
            if (!compareL1At) {
                // No direct L1 comparison available; return healthy for now
                return { isAnomaly: false };
            }

            const l1Block = await this.l1Provider.getBlock(compareL1At);
            const l1StateRoot = l1Block && l1Block.stateRoot ? String(l1Block.stateRoot) : null;

            if (!l1StateRoot) return { isAnomaly: false };

            if (l1StateRoot !== l2StateRoot) {
                return { isAnomaly: true, details: `L2:${l2StateRoot} != L1:${l1StateRoot}` };
            }

            return { isAnomaly: false };
        } catch (e) {
            return { isAnomaly: false, details: `check failed: ${e.message}` };
        }
    }

    async start() {
        console.log('🚀 ChainWard Health Monitor Started');
        console.log(`   Chain ID: ${CHAIN_ID}`);
        console.log(`   Reporter: ${HEALTH_REPORTER_ADDRESS}`);
        console.log(`   Check Interval: ${this.checkInterval}ms`);
        console.log(`   Block Lag Threshold: ${this.blockLagThreshold}s`);
        console.log('');
        console.log('⏳ Monitoring for anomalies...\n');

        // Initial block fetch
        await this.checkHealth();

        // Continuous monitoring
        this.monitorInterval = setInterval(() => this.checkHealth(), this.checkInterval);
    }

    async checkHealth() {
        try {
            const block = await this.provider.getBlock('latest');
            const blockNumber = block.number;
            const blockTimestamp = block.timestamp;
            const now = Math.floor(Date.now() / 1000);

            // First run - just record baseline
            if (!this.lastBlock) {
                this.lastBlock = blockNumber;
                this.lastBlockTime = blockTimestamp;
                console.log(`✓ Baseline: Block #${blockNumber} at ${new Date(blockTimestamp * 1000).toISOString()}`);
                return;
            }

            const blocksSinceLastCheck = blockNumber - this.lastBlock;
            const timeSinceLastBlock = now - this.lastBlockTime;
            const expectedBlockTime = 0.25; // 250ms = 0.25s

            // Check for block lag
            if (timeSinceLastBlock > this.blockLagThreshold) {
                console.log(`⚠️  BLOCK LAG DETECTED`);
                console.log(`   Last block: #${this.lastBlock} (${timeSinceLastBlock}s ago)`);
                console.log(`   Current block: #${blockNumber}`);
                const incidentId = Date.now();
                const details = 'Blocks not produced within expected threshold';
                await this.submitSignal(blockNumber, blockTimestamp, true, 'BLOCK_LAG', details);
                // Trigger automated responses (dry run by default)
                await this.executeResponses('BLOCK_LAG', incidentId, details, CHAIN_ID, blockNumber);
            }

            // Check for sequencer stall (no blocks produced)
            else if (blocksSinceLastCheck === 0) {
                console.log(`⚠️  SEQUENCER STALL DETECTED`);
                console.log(`   No new blocks in ${timeSinceLastBlock}s`);
                console.log(`   Block #${blockNumber} from ${(timeSinceLastBlock / 60).toFixed(1)}m ago`);
                const incidentId = Date.now();
                const details = 'No new blocks produced';
                await this.submitSignal(blockNumber, blockTimestamp, false, 'SEQUENCER_STALL', details);
                // Trigger automated responses (dry run by default)
                await this.executeResponses('SEQUENCER_STALL', incidentId, details, CHAIN_ID, blockNumber);
            }

            // Normal operation
            else {
                const avgBlockTime = timeSinceLastBlock / blocksSinceLastCheck;
                process.stdout.write(`✓ Block #${blockNumber} | ${blocksSinceLastCheck} blocks in ${timeSinceLastBlock}s | Avg: ${avgBlockTime.toFixed(3)}s/block\r`);
            }

            // Periodic state-root verification (scaffold)
            this._stateRootCounter++;
            if (this._stateRootCounter >= this.stateRootCheckInterval) {
                this._stateRootCounter = 0;
                try {
                    const sr = await this.checkStateRoot(blockNumber);
                    if (sr && sr.isAnomaly) {
                        const details = `State root mismatch detected: ${sr.details}`;
                        console.log('\n⚠️  STATE ROOT ANOMALY:', details);
                        const incidentId = Date.now();
                        await this.submitSignal(blockNumber, blockTimestamp, false, 'STATE_ROOT_CHANGED', details);
                        await this.executeResponses('STATE_ROOT_CHANGED', incidentId, details, CHAIN_ID, blockNumber);
                    }
                } catch (e) {
                    console.warn('State root check failed:', e.message);
                }
            }

            this.lastBlock = blockNumber;
            this.lastBlockTime = blockTimestamp;

        } catch (error) {
            console.error('❌ Monitor error:', error.message);
        }
    }

    async submitSignal(blockNumber, blockTimestamp, sequencerHealthy, failureType, description) {
        try {
            console.log(`📤 Submitting signal: ${failureType}`);
            console.log(`   Block: #${blockNumber}`);
            console.log(`   Timestamp: ${new Date(blockTimestamp * 1000).toISOString()}`);
            console.log(`   Details: ${description}`);

            const tx = await this.reporter.submitHealthSignal(
                CHAIN_ID,
                blockNumber,
                blockTimestamp,
                0, // sequencerNumber
                sequencerHealthy,
                description
            );

            console.log(`   TX Hash: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`✅ Signal submitted (Block: ${receipt.blockNumber})\n`);

        } catch (error) {
            console.error(`❌ Failed to submit signal: ${error.message}\n`);
        }
    }

    stop() {
        clearInterval(this.monitorInterval);
        console.log('\n🛑 Monitor stopped');
    }
}

// Main
async function main() {
    const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
        console.error('Error: PRIVATE_KEY environment variable required');
        process.exit(1);
    }

    const monitor = new HealthMonitor(rpcUrl, privateKey);

    process.on('SIGINT', () => {
        monitor.stop();
        process.exit(0);
    });

    await monitor.start();
}

main().catch(console.error);
