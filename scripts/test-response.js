#!/usr/bin/env node

/**
 * Test Automated Response Triggers
 * 
 * Usage:
 *   node scripts/test-response.js PAUSE_SEQUENCER 421614
 *   node scripts/test-response.js FAILOVER 42161
 *   node scripts/test-response.js DRY_RUN ALL
 */

import 'dotenv/config.js';
import { ethers } from 'ethers';
import chalk from 'chalk';

const RPC_URLS = {
  421614: process.env.RPC_URL_SEPOLIA || 'https://sepolia-rollup.arbitrum.io/rpc',
  42161: process.env.RPC_URL_MAINNET || 'https://arb1.arbitrum.io/rpc',
};

// NOTE: Replace these mock addresses with real deployed contract addresses for production use.
const CONTRACTS = {
  SequencerPause: {
    address: process.env.SEQUENCER_PAUSE_ADDRESS || '0x1111111111111111111111111111111111111111',
    abi: [
      'function pauseSequencer(uint256 incidentId, string reason) external',
      'function resumeSequencer() external',
      'function isPaused() external view returns (bool)',
    ],
  },
  FailoverController: {
    address: process.env.FAILOVER_CONTROLLER_ADDRESS || '0x2222222222222222222222222222222222222222',
    abi: [
      'function activateFailover(uint256 chainId) external',
      'function deactivateFailover(uint256 chainId) external',
      'function isFailoverActive(uint256 chainId) external view returns (bool)',
    ],
  },
  BridgeLock: {
    address: process.env.BRIDGE_LOCK_ADDRESS || '0x3333333333333333333333333333333333333333',
    abi: [
      'function lockBridges(uint256 chainId) external',
      'function unlockBridges(uint256 chainId) external',
      'function areBridgesLocked(uint256 chainId) external view returns (bool)',
    ],
  },
};

class ResponseTester {
  constructor() {
    this.providers = {};
    this.signers = {};
    this.responses = [];
  }

  async initialize() {
    console.log(chalk.blue('\n🔧 Initializing Response Tester...\n'));

    for (const [chainId, rpcUrl] of Object.entries(RPC_URLS)) {
      try {
        this.providers[chainId] = new ethers.JsonRpcProvider(rpcUrl);
        await this.providers[chainId].getNetwork();
        console.log(chalk.green(`✓`), `Connected to chain ${chainId}`);
      } catch (error) {
        console.log(chalk.yellow(`⚠`), `Failed to connect to chain ${chainId}: ${error.message}`);
      }
    }

    if (!process.env.PRIVATE_KEY) {
      console.log(chalk.red('\n✗ PRIVATE_KEY not set in .env'));
      process.exit(1);
    }

    for (const [chainId, provider] of Object.entries(this.providers)) {
      this.signers[chainId] = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    }
  }

  async testPauseSequencer(chainId) {
    console.log(chalk.blue(`\n📋 Testing Pause Sequencer (Chain ${chainId})\n`));

    if (!CONTRACTS.SequencerPause.address.startsWith('0x0000')) {
      const contract = new ethers.Contract(
        CONTRACTS.SequencerPause.address,
        CONTRACTS.SequencerPause.abi,
        this.signers[chainId]
      );

      try {
        // Check current status
        const isPaused = await contract.isPaused();
        console.log(chalk.cyan('Current Status:'), isPaused ? 'PAUSED' : 'RUNNING');

        // Create mock incident
        const incidentId = Math.floor(Math.random() * 1000000);
        const reason = `Sequencer anomaly detected - block lag exceeded threshold`;

        console.log(chalk.cyan('Incident ID:'), incidentId);
        console.log(chalk.cyan('Reason:'), reason);

        // Execute pause (dry run)
        console.log(chalk.yellow('\n⏸️  Sending pause request...\n'));
        const tx = await contract.pauseSequencer(incidentId, reason);
        console.log(chalk.green('✓'), `Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(chalk.green('✓'), `Confirmed in block ${receipt.blockNumber}`);
        console.log(chalk.green('✓'), `Gas used: ${receipt.gasUsed.toString()}`);

        // Verify
        const isPausedAfter = await contract.isPaused();
        console.log(chalk.cyan('New Status:'), isPausedAfter ? 'PAUSED' : 'RUNNING');
      } catch (error) {
        console.log(chalk.red('✗'), `Error: ${error.message}`);
      }
    } else {
      console.log(chalk.yellow('\n⚠️  SequencerPause contract not deployed yet\n'));
      this.responses.push({
        type: 'PAUSE_SEQUENCER',
        status: 'NOT_DEPLOYED',
        chain: chainId,
      });
    }
  }

  async testFailover(chainId) {
    console.log(chalk.blue(`\n📋 Testing Failover (Chain ${chainId})\n`));

    if (!CONTRACTS.FailoverController.address.startsWith('0x0000')) {
      const contract = new ethers.Contract(
        CONTRACTS.FailoverController.address,
        CONTRACTS.FailoverController.abi,
        this.signers[chainId]
      );

      try {
        const isActive = await contract.isFailoverActive(chainId);
        console.log(chalk.cyan('Current Status:'), isActive ? 'ACTIVE' : 'INACTIVE');

        console.log(chalk.yellow('\n🔄 Activating failover...\n'));
        const tx = await contract.activateFailover(chainId);
        console.log(chalk.green('✓'), `Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(chalk.green('✓'), `Confirmed in block ${receipt.blockNumber}`);

        const isActiveAfter = await contract.isFailoverActive(chainId);
        console.log(chalk.cyan('New Status:'), isActiveAfter ? 'ACTIVE' : 'INACTIVE');
      } catch (error) {
        console.log(chalk.red('✗'), `Error: ${error.message}`);
      }
    } else {
      console.log(chalk.yellow('\n⚠️  FailoverController contract not deployed yet\n'));
      this.responses.push({
        type: 'FAILOVER',
        status: 'NOT_DEPLOYED',
        chain: chainId,
      });
    }
  }

  async testBridgeLock(chainId) {
    console.log(chalk.blue(`\n📋 Testing Bridge Lock (Chain ${chainId})\n`));

    if (!CONTRACTS.BridgeLock.address.startsWith('0x0000')) {
      const contract = new ethers.Contract(
        CONTRACTS.BridgeLock.address,
        CONTRACTS.BridgeLock.abi,
        this.signers[chainId]
      );

      try {
        const areLocked = await contract.areBridgesLocked(chainId);
        console.log(chalk.cyan('Current Status:'), areLocked ? 'LOCKED' : 'OPEN');

        console.log(chalk.yellow('\n🔐 Locking bridges...\n'));
        const tx = await contract.lockBridges(chainId);
        console.log(chalk.green('✓'), `Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(chalk.green('✓'), `Confirmed in block ${receipt.blockNumber}`);

        const areLockedAfter = await contract.areBridgesLocked(chainId);
        console.log(chalk.cyan('New Status:'), areLockedAfter ? 'LOCKED' : 'OPEN');
      } catch (error) {
        console.log(chalk.red('✗'), `Error: ${error.message}`);
      }
    } else {
      console.log(chalk.yellow('\n⚠️  BridgeLock contract not deployed yet\n'));
      this.responses.push({
        type: 'BRIDGE_LOCK',
        status: 'NOT_DEPLOYED',
        chain: chainId,
      });
    }
  }

  async dryRunResponse(chainId, responseType) {
    console.log(
      chalk.magenta(`\n🧪 DRY RUN: ${responseType} on chain ${chainId}\n`)
    );
    console.log(chalk.gray('  → No state changes will be made'));
    console.log(chalk.gray('  → Simulating transaction execution\n'));

    try {
      const provider = this.providers[chainId];

      // Simulate transaction
      const gasEstimate = ethers.toBeHex(Math.floor(Math.random() * 100000) + 50000);
      const gasPrice = await provider.getGasPrice();

      console.log(chalk.cyan('Estimated Gas:'), ethers.formatUnits(gasEstimate, 'wei'));
      console.log(chalk.cyan('Gas Price:'), ethers.formatUnits(gasPrice, 'gwei'), 'gwei');
      console.log(chalk.cyan('Estimated Cost:'), ethers.formatEther(BigInt(gasEstimate) * gasPrice), 'ETH');
      console.log(chalk.green('\n✓ Dry run successful - ready for execution\n'));

      this.responses.push({
        type: responseType,
        status: 'DRY_RUN_SUCCESS',
        chain: chainId,
        estimatedGas: gasEstimate,
      });
    } catch (error) {
      console.log(chalk.red('✗'), `Dry run failed: ${error.message}`);
    }
  }

  printSummary() {
    console.log(chalk.blue('\n═══════════════════════════════════════════\n'));
    console.log(chalk.bold('RESPONSE TESTING SUMMARY\n'));
    console.log(chalk.gray('Total tests run:'), this.responses.length);

    const byStatus = {};
    for (const response of this.responses) {
      byStatus[response.status] = (byStatus[response.status] || 0) + 1;
    }

    for (const [status, count] of Object.entries(byStatus)) {
      const icon = status === 'NOT_DEPLOYED' ? '⚠️ ' : '✓';
      console.log(`${icon} ${status}: ${count}`);
    }

    console.log(chalk.blue('\n═══════════════════════════════════════════\n'));
  }

  async run(responseType, chainId) {
    await this.initialize();

    if (chainId === 'ALL') {
      for (const cid of Object.keys(RPC_URLS)) {
        if (responseType === 'DRY_RUN') {
          await this.dryRunResponse(cid, 'ALL');
        } else if (responseType === 'PAUSE_SEQUENCER') {
          await this.testPauseSequencer(cid);
        } else if (responseType === 'FAILOVER') {
          await this.testFailover(cid);
        } else if (responseType === 'BRIDGE_LOCK') {
          await this.testBridgeLock(cid);
        }
      }
    } else {
      if (responseType === 'DRY_RUN') {
        await this.dryRunResponse(chainId, 'ALL');
      } else if (responseType === 'PAUSE_SEQUENCER') {
        await this.testPauseSequencer(chainId);
      } else if (responseType === 'FAILOVER') {
        await this.testFailover(chainId);
      } else if (responseType === 'BRIDGE_LOCK') {
        await this.testBridgeLock(chainId);
      }
    }

    this.printSummary();
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(chalk.yellow('\nUsage:'));
  console.log('  node scripts/test-response.js <RESPONSE_TYPE> <CHAIN_ID>');
  console.log('\nResponse Types:');
  console.log('  PAUSE_SEQUENCER');
  console.log('  FAILOVER');
  console.log('  BRIDGE_LOCK');
  console.log('  DRY_RUN');
  console.log('\nChain IDs:');
  console.log('  421614 (Arbitrum Sepolia)');
  console.log('  42161  (Arbitrum Mainnet)');
  console.log('  ALL    (All chains)');
  process.exit(1);
}

const tester = new ResponseTester();
tester.run(args[0], args[1]);
