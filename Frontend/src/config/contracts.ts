// Contract addresses on Arbitrum Sepolia
export const CONTRACT_ADDRESSES = {
  HEALTH_MONITOR: process.env.NEXT_PUBLIC_HEALTH_MONITOR_ADDRESS || '0xcd04f7675B556Bd060bd465fC690d67568cAc6bb',
  HEALTH_REPORTER: process.env.NEXT_PUBLIC_HEALTH_REPORTER_ADDRESS || '0x2dB1352bc197A93330198175e69338Cf4B5fF115',
  REGISTRY: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '0x5dF982674c638D38d16cB9D1d6d07fC3d93BfBe4',
  INCIDENT_MANAGER: process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS || '0x926e9c2885B7a75BDe8baeBa8d9738Aa28aA4DdB',
};

export const CHAIN_CONFIG = {
  chainId: 421614,
  chainName: 'Arbitrum Sepolia',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
};

export const isAddressesReady = () => {
  return Object.values(CONTRACT_ADDRESSES).every(addr => addr && addr !== '');
};
