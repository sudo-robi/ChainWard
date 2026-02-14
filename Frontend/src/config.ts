// Configuration file that exposes environment variables
// All values come from .env - no hardcoded fallbacks

const USE_PROXY = typeof window !== 'undefined';
const PROXY_URL = typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : '';

if (typeof window !== 'undefined') {
    console.log('🔧 Config Debug - Environment Variables:', {
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
        monitorAddress: process.env.NEXT_PUBLIC_MONITOR_ADDRESS,
        chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
        registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
        incidentManagerAddress: process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS,
    });
}

export const config = {
    rpcUrl: USE_PROXY ? PROXY_URL : (process.env.NEXT_PUBLIC_RPC_URL!),
    monitorAddress: process.env.NEXT_PUBLIC_MONITOR_ADDRESS!,
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID!),
    registryAddress: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS!,
    incidentManagerAddress: process.env.NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS!,
} as const;

if (typeof window !== 'undefined') {
    console.log('✅ Final Config:', config);
    console.log('🌐 RPC URL (using proxy):', config.rpcUrl);
}
