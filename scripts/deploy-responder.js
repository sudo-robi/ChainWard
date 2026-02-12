#!/usr/bin/env node

/**
 * Deploy responder contracts (SequencerPause, FailoverController, BridgeLock)
 * Usage:
 *  npx hardhat run scripts/deploy-responder.js --network sepolia
 */

const hre = require('hardhat');

async function main() {
  await hre.run('compile');

  const SequencerPause = await hre.ethers.getContractFactory('SequencerPause');
  const seq = await SequencerPause.deploy();
  await seq.deployed();
  console.log('SequencerPause deployed to', seq.address);

  const FailoverController = await hre.ethers.getContractFactory('FailoverController');
  const fo = await FailoverController.deploy();
  await fo.deployed();
  console.log('FailoverController deployed to', fo.address);

  const BridgeLock = await hre.ethers.getContractFactory('BridgeLock');
  const bl = await BridgeLock.deploy();
  await bl.deployed();
  console.log('BridgeLock deployed to', bl.address);

  console.log('\nSet environment variables or update .env.monitor with these addresses to enable responses.');
}

main().catch(err => { console.error(err); process.exit(1); });
