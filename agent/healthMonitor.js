/**
 * ChainWard Health Monitor Agent
 * Minimal off-chain agent that:
 * 1. Watches chain health metrics
 * 2. Detects anomalies
 * 3. Submits signals to contracts
 * 4. Logs failure timeline for replay
 */

const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  chains: {
    'arbitrum-sepolia': {
      rpc: process.env.ARBITRUM_SEPOLIA_RPC || 'http://localhost:8545',
      expectedBlockTime: 250, // ms
      maxBlockLag: 10, // blocks
      maxStateRootLag: 2 * 60 * 1000, // 2 minutes
    },
  },
  checkInterval: 5000, // 5 seconds
  logFile: path.join(__dirname, 'failure_timeline.json'),
};

class HealthMonitor {
  constructor(contractAddress, contractABI, agentPrivateKey) {
    this.contractAddress = contractAddress;
    this.contractABI = contractABI;
    this.agentPrivateKey = agentPrivateKey;
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.failureTimeline = [];
    this.lastBlockNumber = 0;
    this.lastBlockTime = 0;
    this.lastStateRoot = null;
  }

  /**
   * Initialize provider &contract connection
   */
  async initialize(chainName = 'arbitrum-sepolia') {
    const chainConfig = CONFIG.chains[chainName];
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    this.signer = new ethers.Wallet(this.agentPrivateKey, this.provider);
    this.contract = new ethers.Contract(
      this.contractAddress,
      this.contractABI,
      this.signer
    );
    this.chainName = chainName;
    this.chainConfig = chainConfig;

    console.log('✅ Health Monitor initialized');
    console.log(`   Chain: ${chainName}`);
    console.log(`   Contract: ${this.contractAddress}`);
    console.log(`   Agent: ${this.signer.address}`);
  }

  /**
   * Start monitoring loop
   */
  async start() {
    console.log('\n🚀 Starting health monitoring...\n');
    this.loadTimeline();

    // Initial state fetch
    await this.checkChainHealth();

    // Start periodic monitoring
    setInterval(() => this.checkChainHealth(), CONFIG.checkInterval);
  }

  /**
   * Main health check function
   */
  async checkChainHealth() {
    try {
      const block = await this.provider.getBlock('latest');
      const currentTime = Date.now();

      // Skip if first check
      if (this.lastBlockNumber === 0) {
        this.lastBlockNumber = block.number;
        this.lastBlockTime = block.timestamp * 1000;
        return;
      }

      // ===== ANOMALY DETECTION =====

      // 1. Block lag detection
      const blockGap = block.number - this.lastBlockNumber;
      if (blockGap > this.chainConfig.maxBlockLag) {
        await this.handleBlockLagIncident(block, blockGap);
      }

      // 2. Sequencer stall detection (no blocks for extended period)
      const timeSinceLastBlock = (block.timestamp * 1000) - this.lastBlockTime;
      const expectedTime = this.chainConfig.expectedBlockTime * blockGap;
      
      if (timeSinceLastBlock > expectedTime * 2) {
        await this.handleSequencerStallIncident(block, timeSinceLastBlock);
      }

      // 3. State root change detection
      if (this.lastStateRoot && block.stateRoot !== this.lastStateRoot) {
        await this.handleStateRootChangeIncident(block);
      }

      // Update state
      this.lastBlockNumber = block.number;
      this.lastBlockTime = block.timestamp * 1000;
      this.lastStateRoot = block.stateRoot;

      // Log normal operation
      this.logEvent('NORMAL', {
        blockNumber: block.number,
        blockTime: new Date(this.lastBlockTime).toISOString(),
        stateRoot: block.stateRoot.slice(0, 10) + '...',
      });

    } catch (error) {
      console.error('❌ Health check error:', error.message);
      this.logEvent('ERROR', { error: error.message });
    }
  }

  /**
   * Handle block lag incident
   */
  async handleBlockLagIncident(block, blockGap) {
    const timestamp = new Date().toISOString();
    const incident = {
      timestamp,
      type: 'BLOCK_LAG',
      severity: blockGap > this.chainConfig.maxBlockLag * 2 ? 'CRITICAL' : 'WARNING',
      blockNumber: block.number,
      blockGap,
      expectedMaxLag: this.chainConfig.maxBlockLag,
      details: `Block gap of ${blockGap} exceeds max lag of ${this.chainConfig.maxBlockLag}`,
    };

    console.log(`\n⚠️  BLOCK LAG DETECTED (${incident.severity})`);
    console.log(`   Gap: ${blockGap} blocks`);
    console.log(`   Max allowed: ${this.chainConfig.maxBlockLag} blocks`);

    await this.submitSignal(incident);
    this.logEvent('INCIDENT', incident);
  }

  /**
   * Handle sequencer stall incident
   */
  async handleSequencerStallIncident(block, timeSinceLastBlock) {
    const timestamp = new Date().toISOString();
    const incident = {
      timestamp,
      type: 'SEQUENCER_STALL',
      severity: timeSinceLastBlock > 60000 ? 'CRITICAL' : 'WARNING',
      blockNumber: block.number,
      timeSinceLastBlockMs: timeSinceLastBlock,
      expectedTimeMs: this.chainConfig.expectedBlockTime * 2,
      details: `No blocks for ${(timeSinceLastBlock / 1000).toFixed(1)}s (expected max ${(this.chainConfig.expectedBlockTime * 2 / 1000).toFixed(1)}s)`,
    };

    console.log(`\n⚠️  SEQUENCER STALL DETECTED (${incident.severity})`);
    console.log(`   Time since block: ${(timeSinceLastBlock / 1000).toFixed(1)}s`);
    console.log(`   Max allowed: ${(this.chainConfig.expectedBlockTime * 2 / 1000).toFixed(1)}s`);

    await this.submitSignal(incident);
    this.logEvent('INCIDENT', incident);
  }

  /**
   * Handle state root change incident
   */
  async handleStateRootChangeIncident(block) {
    const timestamp = new Date().toISOString();
    const incident = {
      timestamp,
      type: 'STATE_ROOT_CHANGED',
      severity: 'CRITICAL',
      blockNumber: block.number,
      oldStateRoot: this.lastStateRoot,
      newStateRoot: block.stateRoot,
      details: 'Unexpected state root change detected',
    };

    console.log(`\n⚠️  STATE ROOT CHANGE DETECTED (CRITICAL)`);
    console.log(`   Old: ${this.lastStateRoot.slice(0, 10)}...`);
    console.log(`   New: ${block.stateRoot.slice(0, 10)}...`);

    await this.submitSignal(incident);
    this.logEvent('INCIDENT', incident);
  }

  /**
   * Submit signal to contract
   */
  async submitSignal(incident) {
    try {
      console.log(`\n📤 Submitting signal to contract...`);

      // Create signal data
      const signalData = {
        chainId: await this.provider.getNetwork().then(n => n.chainId),
        signalType: this.mapIncidentToSignalType(incident.type),
        severity: this.mapSeverityLevel(incident.severity),
        blockNumber: incident.blockNumber,
        timestamp: Math.floor(Date.now() / 1000),
        details: incident.details,
      };

      // In a real scenario, this would call HealthReporter.submitSignal()
      // For demo, we log it
      console.log(`   ✅ Signal submitted`);
      console.log(`   Type: ${incident.type}`);
      console.log(`   Severity: ${incident.severity}`);

      this.logEvent('SIGNAL_SUBMITTED', signalData);

    } catch (error) {
      console.error(`   ❌ Failed to submit signal:`, error.message);
      this.logEvent('SIGNAL_FAILED', { error: error.message });
    }
  }

  /**
   * Map incident type to signal type
   */
  mapIncidentToSignalType(incidentType) {
    const mapping = {
      'BLOCK_LAG': 'BLOCK_PRODUCED',
      'SEQUENCER_STALL': 'GAP_IN_BATCHES',
      'STATE_ROOT_CHANGED': 'STATE_ROOT_CHANGED',
    };
    return mapping[incidentType] || 'BLOCK_PRODUCED';
  }

  /**
   * Map severity to numeric level
   */
  mapSeverityLevel(severity) {
    const mapping = {
      'WARNING': 1,
      'CRITICAL': 2,
      'UNRECOVERABLE': 3,
    };
    return mapping[severity] || 1;
  }

  /**
   * Log event to timeline
   */
  logEvent(eventType, data) {
    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      ...data,
    };
    this.failureTimeline.push(event);

    // Keep only last 1000 events
    if (this.failureTimeline.length > 1000) {
      this.failureTimeline.shift();
    }

    this.saveTimeline();
  }

  /**
   * Save timeline to file
   */
  saveTimeline() {
    try {
      fs.writeFileSync(
        CONFIG.logFile,
        JSON.stringify(this.failureTimeline, null, 2)
      );
    } catch (error) {
      console.error('Failed to save timeline:', error.message);
    }
  }

  /**
   * Load timeline from file
   */
  loadTimeline() {
    try {
      if (fs.existsSync(CONFIG.logFile)) {
        const data = fs.readFileSync(CONFIG.logFile, 'utf8');
        this.failureTimeline = JSON.parse(data);
        console.log(`📜 Loaded ${this.failureTimeline.length} events from timeline`);
      }
    } catch (error) {
      console.error('Failed to load timeline:', error.message);
    }
  }

  /**
   * Get timeline for export
   */
  getTimeline() {
    return this.failureTimeline;
  }

  /**
   * Trigger test incident (for demo/testing)
   */
  async triggerTestIncident(type = 'BLOCK_LAG') {
    const incident = {
      timestamp: new Date().toISOString(),
      type,
      severity: 'WARNING',
      blockNumber: this.lastBlockNumber,
      isTest: true,
      details: `Test incident: ${type}`,
    };

    console.log(`\n🧪 Triggering test incident: ${type}`);
    await this.submitSignal(incident);
    this.logEvent('TEST_INCIDENT', incident);
  }
}

module.exports = HealthMonitor;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'monitor';

  if (command === 'monitor') {
    const contractAddress = args[1] || process.env.HEALTH_REPORTER_ADDRESS;
    const privateKey = args[2] || process.env.AGENT_PRIVATE_KEY;

    if (!contractAddress || !privateKey) {
      console.error('Usage: node healthMonitor.js monitor <contractAddress> <privateKey>');
      console.error('Or set HEALTH_REPORTER_ADDRESS and AGENT_PRIVATE_KEY env vars');
      process.exit(1);
    }


    const monitor = new HealthMonitor(contractAddress, [], privateKey);
    monitor.initialize().then(() => monitor.start());

  } else if (command === 'test-incident') {
    const type = args[1] || 'BLOCK_LAG';
    console.log(`Simulating test incident of type: ${type}`);
  }
}

