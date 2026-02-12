#!/usr/bin/env node

/**
 * Deploy governance vault (simple) - For prototyping only
 * Usage:
 *   npx hardhat run scripts/deploy-governance.js --network sepolia
 */

const hre = require('hardhat');

async function main() {
  await hre.run('compile');

  const GovernanceVault = await hre.ethers.getContractFactory('GovernanceVault');
  const gv = await GovernanceVault.deploy();
  await gv.deployed();
  console.log('GovernanceVault deployed to', gv.address);
}

main().catch(err => { console.error(err); process.exit(1); });
