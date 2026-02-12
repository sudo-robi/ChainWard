#!/usr/bin/env node

/**
 * Reporter Rewards & Incentives System
 * 
 * Usage:
 *   node scripts/reporter-rewards.js check-balance
 *   node scripts/reporter-rewards.js claim-rewards
 *   node scripts/reporter-rewards.js check-reputation
 *   node scripts/reporter-rewards.js stake-bond 100
 *   node scripts/reporter-rewards.js unstake-bond
 *   node scripts/reporter-rewards.js leaderboard top=10
 */

import 'dotenv/config.js';
import { ethers } from 'ethers';
import chalk from 'chalk';
import fs from 'fs';

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const REWARDS_FILE = '/home/robi/Desktop/ChainWard/.rewards-data.json';

class ReporterRewards {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.reporters = this.loadReporters();
    this.rewardPool = 10000; // Total tokens available
  }

  loadReporters() {
    try {
      if (fs.existsSync(REWARDS_FILE)) {
        return JSON.parse(fs.readFileSync(REWARDS_FILE, 'utf-8'));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not load rewards data'));
    }
    return {};
  }

  saveReporters() {
    fs.writeFileSync(REWARDS_FILE, JSON.stringify(this.reporters, null, 2));
  }

  getReporter(address) {
    if (!this.reporters[address]) {
      this.reporters[address] = {
        address,
        balance: 0,
        earned: 0,
        pendingRewards: 0,
        totalReports: 0,
        correctReports: 0,
        falseReports: 0,
        reputation: 0,
        bond: 0,
        bondLocked: false,
        joinedAt: Math.floor(Date.now() / 1000),
        lastClaimAt: 0,
      };
    }
    return this.reporters[address];
  }

  calculateAccuracyMultiplier(reporter) {
    const totalReports = reporter.totalReports || 1;
    const correctReports = reporter.correctReports || 0;
    const accuracy = correctReports / totalReports;

    if (accuracy >= 0.95) return 1.5; // 95%+ accuracy
    if (accuracy >= 0.8) return 1.2; // 80%+ accuracy
    if (accuracy >= 0.7) return 1.0; // 70%+ accuracy
    return 0.5; // Below 70% - penalty
  }

  calculateReward(baseAmount = 10) {
    // Formula: Base * AccuracyMultiplier * TimeBonus
    const accuracyMultiplier = 1.2; // Demo value
    const timeBonus = 1.0; // Full bonus if reported on time
    const reward = Math.floor(baseAmount * accuracyMultiplier * timeBonus);
    return Math.min(reward, 50); // Cap at 50 tokens
  }

  async checkBalance(userAddress) {
    console.log(chalk.blue('\n💰 Checking Reward Balance\n'));

    const reporter = this.getReporter(userAddress);

    console.log(chalk.cyan('Address:'), userAddress);
    console.log(chalk.cyan('Earned Balance:'), reporter.earned, 'tokens');
    console.log(chalk.cyan('Pending Rewards:'), reporter.pendingRewards, 'tokens');
    console.log(chalk.cyan('Staked Bond:'), reporter.bond, 'tokens');
    console.log();

    const nextClaimTime = reporter.lastClaimAt + 3600; // 1 hour cooldown
    const canClaim = Math.floor(Date.now() / 1000) > nextClaimTime;
    console.log(chalk.cyan('Can Claim:'), canClaim ? chalk.green('YES') : chalk.yellow('NO (wait ' + (nextClaimTime - Math.floor(Date.now() / 1000)) + 's)'));
    console.log();
  }

  async claimRewards(userAddress) {
    console.log(chalk.blue('\n🎁 Claiming Rewards\n'));

    const reporter = this.getReporter(userAddress);

    if (reporter.pendingRewards === 0) {
      console.log(chalk.yellow('⚠️  No pending rewards'));
      console.log();
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const nextClaimTime = reporter.lastClaimAt + 3600; // 1 hour cooldown

    if (now < nextClaimTime) {
      const waitTime = nextClaimTime - now;
      console.log(chalk.red('✗'), `Must wait ${waitTime} seconds before claiming again`);
      console.log();
      return;
    }

    const claimAmount = reporter.pendingRewards;
    reporter.earned += claimAmount;
    reporter.pendingRewards = 0;
    reporter.lastClaimAt = now;

    this.saveReporters();

    console.log(chalk.green('✓'), `Claimed ${claimAmount} tokens`);
    console.log(chalk.cyan('New Balance:'), reporter.earned, 'tokens');
    console.log();
  }

  async checkReputation(userAddress) {
    console.log(chalk.blue('\n⭐ Reporter Reputation\n'));

    const reporter = this.getReporter(userAddress);

    const totalReports = reporter.totalReports || 0;
    const correctReports = reporter.correctReports || 0;
    const falseReports = reporter.falseReports || 0;
    const accuracy = totalReports > 0 ? ((correctReports / totalReports) * 100).toFixed(1) : 0;

    console.log(chalk.cyan('Address:'), userAddress);
    console.log(chalk.cyan('Reputation Score:'), reporter.reputation);
    console.log();

    console.log(chalk.bold('Report Statistics:'));
    console.log(chalk.cyan('  Total Reports:'), totalReports);
    console.log(chalk.cyan('  Correct:'), correctReports, chalk.gray(`(${accuracy}%)`));
    console.log(chalk.cyan('  False:'), falseReports);
    console.log();

    const multiplier = this.calculateAccuracyMultiplier(reporter);
    console.log(chalk.bold('Reward Multiplier:'), chalk.green(multiplier.toFixed(2) + 'x'));
    console.log();

    // Tier system
    let tier = 'NOVICE';
    if (reporter.reputation >= 500) tier = 'EXPERT';
    else if (reporter.reputation >= 250) tier = 'ADVANCED';
    else if (reporter.reputation >= 100) tier = 'INTERMEDIATE';

    console.log(chalk.cyan('Tier:'), tier);
    console.log(chalk.cyan('Member Since:'), new Date(reporter.joinedAt * 1000).toLocaleDateString());
    console.log();
  }

  async stakeBond(userAddress, amount) {
    console.log(chalk.blue(`\n🔐 Staking Bond (${amount} tokens)\n`));

    const reporter = this.getReporter(userAddress);

    if (reporter.bondLocked) {
      console.log(chalk.yellow('⚠️  Bond already staked'));
      console.log(chalk.cyan('Current Bond:'), reporter.bond, 'tokens');
      console.log();
      return;
    }

    if (amount < 100) {
      console.log(chalk.red('✗'), 'Minimum bond is 100 tokens');
      console.log();
      return;
    }

    if (reporter.earned < amount) {
      console.log(chalk.red('✗'), `Insufficient balance. Have ${reporter.earned}, need ${amount}`);
      console.log();
      return;
    }

    reporter.earned -= amount;
    reporter.bond = amount;
    reporter.bondLocked = true;

    this.saveReporters();

    console.log(chalk.green('✓'), `Staked ${amount} tokens`);
    console.log(chalk.cyan('Bond Locked Until:'), 'Next 7 days');
    console.log(chalk.cyan('Reporting Enabled:'), chalk.green('YES'));
    console.log();
  }

  async unstakeBond(userAddress) {
    console.log(chalk.blue('\n🔓 Unstaking Bond\n'));

    const reporter = this.getReporter(userAddress);

    if (reporter.bond === 0) {
      console.log(chalk.yellow('⚠️  No bond currently staked'));
      console.log();
      return;
    }

    const bondAmount = reporter.bond;
    reporter.earned += bondAmount;
    reporter.bond = 0;
    reporter.bondLocked = false;

    this.saveReporters();

    console.log(chalk.green('✓'), `Unstaked ${bondAmount} tokens`);
    console.log(chalk.cyan('New Balance:'), reporter.earned, 'tokens');
    console.log(chalk.cyan('Reporting Enabled:'), chalk.yellow('NO (must stake bond to report)'));
    console.log();
  }

  async leaderboard(limit = 10) {
    console.log(chalk.blue(`\n🏆 Top ${limit} Reporters\n`));

    const sorted = Object.values(this.reporters)
      .sort((a, b) => (b.correctReports || 0) - (a.correctReports || 0))
      .slice(0, limit);

    if (sorted.length === 0) {
      console.log(chalk.gray('No reporters yet'));
      console.log();
      return;
    }

    console.log(
      chalk.bold(
        'Rank'.padEnd(6) +
        'Address'.padEnd(45) +
        'Reports'.padEnd(10) +
        'Accuracy'.padEnd(12) +
        'Earned'
      )
    );
    console.log(chalk.gray('─'.repeat(100)));

    sorted.forEach((reporter, index) => {
      const totalReports = reporter.totalReports || 0;
      const correctReports = reporter.correctReports || 0;
      const accuracy = totalReports > 0 ? ((correctReports / totalReports) * 100).toFixed(1) : 0;
      const address = reporter.address.slice(0, 10) + '...' + reporter.address.slice(-8);

      console.log(
        chalk.cyan(`${index + 1}.`.padEnd(6)) +
        address.padEnd(45) +
        String(totalReports).padEnd(10) +
        `${accuracy}%`.padEnd(12) +
        `${reporter.earned} tokens`
      );
    });

    console.log();
  }

  async simulateReports(userAddress, count = 5) {
    console.log(chalk.blue(`\n📊 Simulating ${count} Reports\n`));

    const reporter = this.getReporter(userAddress);

    for (let i = 0; i < count; i++) {
      const isCorrect = Math.random() > 0.15; // 85% accuracy by default
      const reward = this.calculateReward();

      reporter.totalReports++;
      if (isCorrect) {
        reporter.correctReports++;
        reporter.pendingRewards += reward;
        console.log(chalk.green(`✓ Report ${i + 1}: Correct (+${reward} tokens)`));
      } else {
        reporter.falseReports++;
        console.log(chalk.red(`✗ Report ${i + 1}: False (-${Math.floor(reward / 2)} tokens penalty)`));
      }
    }

    // Update reputation
    const accuracy = reporter.correctReports / reporter.totalReports;
    reporter.reputation = Math.floor(accuracy * 500);

    this.saveReporters();

    console.log();
    console.log(chalk.cyan('New Pending Rewards:'), reporter.pendingRewards, 'tokens');
    console.log(chalk.cyan('Accuracy:'), ((reporter.correctReports / reporter.totalReports) * 100).toFixed(1) + '%');
    console.log();
  }

  async run(command, ...args) {
    const userAddress = process.env.PUBLIC_KEY || '0x' + Math.random().toString(16).slice(2);

    switch (command) {
      case 'check-balance':
        await this.checkBalance(userAddress);
        break;
      case 'claim-rewards':
        await this.claimRewards(userAddress);
        break;
      case 'check-reputation':
        await this.checkReputation(userAddress);
        break;
      case 'stake-bond':
        await this.stakeBond(userAddress, parseInt(args[0]) || 100);
        break;
      case 'unstake-bond':
        await this.unstakeBond(userAddress);
        break;
      case 'leaderboard':
        const topCount = args[0] ? parseInt(args[0].split('=')[1]) : 10;
        await this.leaderboard(topCount);
        break;
      case 'simulate-reports':
        await this.simulateReports(userAddress, parseInt(args[0]) || 5);
        break;
      default:
        this.printUsage();
    }
  }

  printUsage() {
    console.log(chalk.yellow('\nUsage:'));
    console.log('  node scripts/reporter-rewards.js <command> [args]');
    console.log('\nCommands:');
    console.log('  check-balance          View your rewards balance');
    console.log('  claim-rewards          Claim pending rewards');
    console.log('  check-reputation       View your reputation score');
    console.log('  stake-bond <amount>    Stake tokens as bond (min 100)');
    console.log('  unstake-bond           Unstake your bond');
    console.log('  leaderboard [top=10]   View top reporters');
    console.log('  simulate-reports [n]   Simulate n reports (demo)');
    console.log();
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  const rewards = new ReporterRewards();
  rewards.printUsage();
  process.exit(1);
}

const rewards = new ReporterRewards();
rewards.run(...args);
