#!/usr/bin/env node

/**
 * Governance Voting System
 * 
 * Usage:
 *   node scripts/governance.js create-proposal "Pause Sequencer" "Incident on chain 421614" 7
 *   node scripts/governance.js list-proposals
 *   node scripts/governance.js vote 1 FOR 1000
 *   node scripts/governance.js vote 1 AGAINST 500
 *   node scripts/governance.js get-proposal 1
 *   node scripts/governance.js check-voting-power
 */

require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = process.env.CHAIN_ID || '421614';

// Mock governance data storage (replace with contract calls)
const GOVERNANCE_FILE = path.join(__dirname, '..', '.governance-data.json');

class GovernanceVoting {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.proposals = this.loadProposals();
  }

  loadProposals() {
    try {
      if (fs.existsSync(GOVERNANCE_FILE)) {
        return JSON.parse(fs.readFileSync(GOVERNANCE_FILE, 'utf-8'));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not load governance data'));
    }
    return {};
  }

  saveProposals() {
    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(this.proposals, null, 2));
  }

  generateProposalId() {
    return Math.max(0, ...Object.keys(this.proposals).map(Number)) + 1;
  }

  async createProposal(title, description, votingPeriod = 7) {
    console.log(chalk.blue('\n📋 Creating Governance Proposal\n'));

    const proposalId = this.generateProposalId();
    const now = Math.floor(Date.now() / 1000);
    const votingEndTime = now + votingPeriod * 24 * 60 * 60;

    const proposal = {
      id: proposalId,
      title,
      description,
      creator: '0x' + 'creator_address', // Would be from signer
      createdAt: now,
      votingStartTime: now,
      votingEndTime,
      votingPeriodDays: votingPeriod,
      status: 'ACTIVE',
      votes: {
        FOR: 0,
        AGAINST: 0,
        ABSTAIN: 0,
      },
      voters: {},
      quorum: 51, // 51% for normal votes, 66% for emergency
      passed: false,
      executed: false,
    };

    this.proposals[proposalId] = proposal;
    this.saveProposals();

    console.log(chalk.green('✓'), `Proposal #${proposalId} created`);
    console.log(chalk.cyan('  Title:'), title);
    console.log(chalk.cyan('  Voting Period:'), votingPeriod, 'days');
    console.log(chalk.cyan('  Voting Ends:'), new Date(votingEndTime * 1000).toISOString());
    console.log(chalk.cyan('  Quorum Required:'), proposal.quorum + '%');
    console.log(chalk.cyan('  Status:'), chalk.green(proposal.status));
    console.log();

    return proposalId;
  }

  async castVote(proposalId, vote, amount) {
    console.log(chalk.blue(`\n🗳️  Casting Vote on Proposal #${proposalId}\n`));

    if (!this.proposals[proposalId]) {
      console.log(chalk.red('✗'), 'Proposal not found');
      return;
    }

    const proposal = this.proposals[proposalId];

    if (proposal.status !== 'ACTIVE') {
      console.log(chalk.red('✗'), `Proposal is ${proposal.status}, voting closed`);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > proposal.votingEndTime) {
      proposal.status = 'ENDED';
      console.log(chalk.red('✗'), 'Voting period has ended');
      return;
    }

    // Simulate vote
    const voterAddress = '0x' + Math.random().toString(16).slice(2);

    if (proposal.voters[voterAddress]) {
      console.log(chalk.yellow('⚠️'), 'You have already voted on this proposal');
      return;
    }

    proposal.votes[vote] += amount;
    proposal.voters[voterAddress] = { vote, amount, timestamp: now };

    const totalVotes = Object.values(proposal.votes).reduce((a, b) => a + b, 0);

    console.log(chalk.green('✓'), `Vote recorded: ${vote} with ${amount} tokens`);
    console.log(chalk.cyan('  Vote Power:'), amount, 'tokens');
    console.log(chalk.cyan('  Total Votes:'), totalVotes);
    console.log(chalk.cyan('  FOR:'), proposal.votes.FOR);
    console.log(chalk.cyan('  AGAINST:'), proposal.votes.AGAINST);
    console.log(chalk.cyan('  ABSTAIN:'), proposal.votes.ABSTAIN);

    const forPercent = totalVotes > 0 ? ((proposal.votes.FOR / totalVotes) * 100).toFixed(1) : 0;
    console.log(chalk.cyan('  FOR %:'), forPercent + '%');

    if (forPercent >= proposal.quorum) {
      console.log(chalk.green('\n✓ QUORUM REACHED - Proposal will pass\n'));
      proposal.status = 'QUORUM_REACHED';
    }

    this.saveProposals();
    console.log();
  }

  async listProposals() {
    console.log(chalk.blue('\n📋 Active Governance Proposals\n'));

    const proposals = Object.values(this.proposals);
    if (proposals.length === 0) {
      console.log(chalk.gray('  No proposals found'));
      console.log();
      return;
    }

    for (const proposal of proposals) {
      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = proposal.votingEndTime - now;
      const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60));

      const status =
        proposal.status === 'ACTIVE'
          ? chalk.yellow(proposal.status)
          : proposal.status === 'QUORUM_REACHED'
            ? chalk.green(proposal.status)
            : chalk.gray(proposal.status);

      console.log(chalk.bold(`#${proposal.id} - ${proposal.title}`));
      console.log(chalk.gray(`   ${proposal.description}`));
      console.log(`  Status: ${status}`);
      console.log(`  Time Remaining: ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`);

      const totalVotes = Object.values(proposal.votes).reduce((a, b) => a + b, 0);
      if (totalVotes > 0) {
        const forPercent = ((proposal.votes.FOR / totalVotes) * 100).toFixed(1);
        console.log(`  Votes: FOR ${proposal.votes.FOR} (${forPercent}%) | AGAINST ${proposal.votes.AGAINST}`);
      } else {
        console.log(`  Votes: None yet`);
      }
      console.log();
    }
  }

  async getProposal(proposalId) {
    console.log(chalk.blue(`\n📋 Proposal Details #${proposalId}\n`));

    const proposal = this.proposals[proposalId];
    if (!proposal) {
      console.log(chalk.red('✗'), 'Proposal not found');
      return;
    }

    console.log(chalk.bold(proposal.title));
    console.log(chalk.gray(proposal.description));
    console.log();

    console.log(chalk.cyan('Creator:'), proposal.creator);
    console.log(chalk.cyan('Status:'), chalk.green(proposal.status));
    console.log(chalk.cyan('Created:'), new Date(proposal.createdAt * 1000).toISOString());
    console.log(chalk.cyan('Voting Ends:'), new Date(proposal.votingEndTime * 1000).toISOString());
    console.log();

    const totalVotes = Object.values(proposal.votes).reduce((a, b) => a + b, 0);
    console.log(chalk.bold('Vote Results:'));
    console.log(chalk.cyan('  Total Votes:'), totalVotes, 'tokens');
    console.log(chalk.cyan('  FOR:'), proposal.votes.FOR);
    console.log(chalk.cyan('  AGAINST:'), proposal.votes.AGAINST);
    console.log(chalk.cyan('  ABSTAIN:'), proposal.votes.ABSTAIN);

    if (totalVotes > 0) {
      const forPercent = ((proposal.votes.FOR / totalVotes) * 100).toFixed(1);
      const againstPercent = ((proposal.votes.AGAINST / totalVotes) * 100).toFixed(1);
      console.log(chalk.cyan('  FOR %:'), forPercent + '%');
      console.log(chalk.cyan('  AGAINST %:'), againstPercent + '%');
    }

    console.log();
    console.log(chalk.cyan('Quorum Required:'), proposal.quorum + '%');
    console.log(chalk.cyan('Voters:'), Object.keys(proposal.voters).length);
    console.log();
  }

  async checkVotingPower() {
    console.log(chalk.blue('\n💰 Voting Power Information\n'));

    try {
      const balance = await this.provider.getBalance(process.env.PUBLIC_KEY || '0x0');
      console.log(chalk.cyan('ETH Balance:'), ethers.formatEther(balance), 'ETH');
      console.log(chalk.cyan('Governance Tokens:'), '1000', 'tokens (demo)');
      console.log(chalk.cyan('Voting Power:'), '100%');
      console.log();
    } catch (error) {
      console.log(chalk.yellow('⚠️'), 'Could not fetch voting power:', error.message);
    }
  }

  async run(command, ...args) {
    switch (command) {
      case 'create-proposal':
        await this.createProposal(args[0], args[1], parseInt(args[2]) || 7);
        break;
      case 'list-proposals':
        await this.listProposals();
        break;
      case 'get-proposal':
        await this.getProposal(parseInt(args[0]));
        break;
      case 'vote':
        await this.castVote(parseInt(args[0]), args[1], parseInt(args[2]));
        break;
      case 'check-voting-power':
        await this.checkVotingPower();
        break;
      default:
        console.log(chalk.red('Unknown command:'), command);
        this.printUsage();
    }
  }

  printUsage() {
    console.log(chalk.yellow('\nUsage:'));
    console.log('  node scripts/governance.js <command> [args]');
    console.log('\nCommands:');
    console.log('  create-proposal <title> <description> [voting_days]');
    console.log('  list-proposals');
    console.log('  get-proposal <id>');
    console.log('  vote <proposal_id> <FOR|AGAINST|ABSTAIN> <amount>');
    console.log('  check-voting-power');
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  const governance = new GovernanceVoting();
  governance.printUsage();
  process.exit(1);
}

const governance = new GovernanceVoting();
governance.run(...args);
