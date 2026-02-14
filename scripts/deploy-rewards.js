#!/usr/bin/env node

/**
 * Deploy ReporterRewards &BondManager
 * Usage:
 *   npx hardhat run scripts/deploy-rewards.js --network sepolia
 */

const hre = require('hardhat');

async function main() {
  await hre.run('compile');

  const ReporterRewards = await hre.ethers.getContractFactory('ReporterRewards');
  const rr = await ReporterRewards.deploy();
  await rr.deployed();
  console.log('ReporterRewards deployed to', rr.address);

  const BondManager = await hre.ethers.getContractFactory('BondManager');
  const bm = await BondManager.deploy();
  await bm.deployed();
  console.log('BondManager deployed to', bm.address);
}

main().catch(err => { console.error(err); process.exit(1); });
