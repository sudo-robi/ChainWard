const ethers = require('ethers');

const REGISTRY_ADDR = '0x5dF982674c638D38d16cB9D1d6d07fC3d93BfBe4';
const CHAIN_ID = 421614;
const RPC = 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const RegistryAbi = [
  'function registerChain(uint256 chainId, address operator, uint256 expectedBlockTime, uint256 maxBlockLag, string name) external'
];

async function registerChain() {
  if (!PRIVATE_KEY) {
    console.error('PRIVATE_KEY env var not set');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const registry = new ethers.Contract(REGISTRY_ADDR, RegistryAbi, signer);

  console.log('Registering chain 421614 with operator:', signer.address);
  const tx = await registry.registerChain(
    421614,
    signer.address,
    12,
    100,
    'Arbitrum Sepolia'
  );
  console.log('Tx hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('Registered! Block:', receipt.blockNumber);
}

registerChain().catch(console.error);
