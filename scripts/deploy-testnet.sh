#!/bin/bash

# ChainWard Testnet Deployment Script
# Deploys all core contracts to Arbitrum Sepolia or Optimism Sepolia
# Usage: ./scripts/deploy-testnet.sh [arbitrum|optimism]

set -e

NETWORK=${1:-arbitrum}
ENV_FILE=".env.${NETWORK}"

# Validate network
if [[ ! "$NETWORK" =~ ^(arbitrum|optimism)$ ]]; then
    echo "❌ Invalid network: $NETWORK"
    echo "Usage: ./scripts/deploy-testnet.sh [arbitrum|optimism]"
    exit 1
fi

# Check environment file
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo "Please create $ENV_FILE with required configuration"
    exit 1
fi

# Load environment
source "$ENV_FILE"

echo "🚀 ChainWard Testnet Deployment"
echo "Network: $NETWORK"
echo "RPC URL: $RPC_URL"
echo "Deployer: $DEPLOYER_ADDRESS"
echo ""

# Validate required env vars
required_vars=(
    "RPC_URL"
    "DEPLOYER_ADDRESS"
    "ARBITRATOR_ADDRESS"
    "ETHERSCAN_API_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Missing required environment variable: $var"
        exit 1
    fi
done

echo "✅ All environment variables set"
echo ""

# Deploy using Foundry
echo "📦 Compiling contracts..."
forge build

echo ""
echo "🚀 Deploying ChainWard infrastructure..."
echo ""

# Deploy SignalTypes (library, no instance needed for script)
echo "1️⃣  SignalTypes (library)"
echo "   Already compiled as dependency"

# Deploy ResponderRegistry
echo ""
echo "2️⃣  Deploying ResponderRegistry..."
RESPONDER_ADDR=$(forge create src/ResponderRegistry.sol:ResponderRegistry \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args "$DEPLOYER_ADDRESS" \
    --verify \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    2>/dev/null | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$RESPONDER_ADDR" ]; then
    echo "❌ Failed to deploy ResponderRegistry"
    exit 1
fi
echo "   ✓ ResponderRegistry: $RESPONDER_ADDR"

# Deploy ChainTypeRegistry
echo ""
echo "3️⃣  Deploying ChainTypeRegistry..."
CHAIN_TYPE_ADDR=$(forge create src/ChainTypeRegistry.sol:ChainTypeRegistry \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args "$DEPLOYER_ADDRESS" \
    --verify \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    2>/dev/null | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$CHAIN_TYPE_ADDR" ]; then
    echo "❌ Failed to deploy ChainTypeRegistry"
    exit 1
fi
echo "   ✓ ChainTypeRegistry: $CHAIN_TYPE_ADDR"

# Deploy ValidatorRegistry
echo ""
echo "4️⃣  Deploying ValidatorRegistry..."
VALIDATOR_ADDR=$(forge create src/ValidatorRegistry.sol:ValidatorRegistry \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args \
    --verify \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    2>/dev/null | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$VALIDATOR_ADDR" ]; then
    echo "❌ Failed to deploy ValidatorRegistry"
    exit 1
fi
echo "   ✓ ValidatorRegistry: $VALIDATOR_ADDR"

# Deploy AdminController
echo ""
echo "5️⃣  Deploying AdminController..."
ADMIN_CTRL_ADDR=$(forge create src/AdminController.sol:AdminController \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args "$DEPLOYER_ADDRESS" \
    --verify \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    2>/dev/null | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$ADMIN_CTRL_ADDR" ]; then
    echo "❌ Failed to deploy AdminController"
    exit 1
fi
echo "   ✓ AdminController: $ADMIN_CTRL_ADDR"

# Deploy ValidatorRegistryV2 (hardened version with AccessControl)
echo ""
echo "6️⃣  Deploying ValidatorRegistryV2..."
VALIDATOR_V2_ADDR=$(forge create src/ValidatorRegistryV2.sol:ValidatorRegistryV2 \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args "$DEPLOYER_ADDRESS" "$ARBITRATOR_ADDRESS" \
    --verify \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    2>/dev/null | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$VALIDATOR_V2_ADDR" ]; then
    echo "❌ Failed to deploy ValidatorRegistryV2"
    exit 1
fi
echo "   ✓ ValidatorRegistryV2: $VALIDATOR_V2_ADDR"

# Deploy HealthMonitor
echo ""
echo "7️⃣  Deploying HealthMonitor..."
HEALTH_MON_ADDR=$(forge create src/HealthMonitor.sol:HealthMonitor \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args "$DEPLOYER_ADDRESS" \
    --verify \
    --etherscan-api-key "$ETHERSCAN_API_KEY" \
    2>/dev/null | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$HEALTH_MON_ADDR" ]; then
    echo "❌ Failed to deploy HealthMonitor"
    exit 1
fi
echo "   ✓ HealthMonitor: $HEALTH_MON_ADDR"

# Save deployment info
DEPLOYMENT_FILE="deployments/${NETWORK}-$(date +%s).json"
mkdir -p deployments

cat > "$DEPLOYMENT_FILE" << EOF
{
  "network": "$NETWORK",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$DEPLOYER_ADDRESS",
  "contracts": {
    "ResponderRegistry": "$RESPONDER_ADDR",
    "ChainTypeRegistry": "$CHAIN_TYPE_ADDR",
    "ValidatorRegistry": "$VALIDATOR_ADDR",
    "AdminController": "$ADMIN_CTRL_ADDR",
    "ValidatorRegistryV2": "$VALIDATOR_V2_ADDR",
    "HealthMonitor": "$HEALTH_MON_ADDR"
  },
  "verification": {
    "explorerBase": "$([ "$NETWORK" = "arbitrum" ] && echo "https://sepolia.arbiscan.io" || echo "https://sepolia-optimism.etherscan.io")",
    "status": "pending"
  }
}
EOF

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "📋 Deployment Summary"
echo "====================="
echo "Network:           $NETWORK"
echo "Deployer:          $DEPLOYER_ADDRESS"
echo "Arbitrator:        $ARBITRATOR_ADDRESS"
echo ""
echo "Deployed Contracts:"
echo "  ResponderRegistry:     $RESPONDER_ADDR"
echo "  ChainTypeRegistry:     $CHAIN_TYPE_ADDR"
echo "  ValidatorRegistry:     $VALIDATOR_ADDR"
echo "  AdminController:       $ADMIN_CTRL_ADDR"
echo "  ValidatorRegistryV2:   $VALIDATOR_V2_ADDR"
echo "  HealthMonitor:         $HEALTH_MON_ADDR"
echo ""
echo "📁 Deployment record saved to: $DEPLOYMENT_FILE"
echo ""

# Verify deployments
echo "🔍 Verifying deployments on Etherscan..."
echo ""
echo "Note: Contracts are being verified in background."
echo "Check Etherscan in ~1-2 minutes for verification status:"
echo ""
if [ "$NETWORK" = "arbitrum" ]; then
    echo "https://sepolia.arbiscan.io/address/$VALIDATOR_ADDR"
else
    echo "https://sepolia-optimism.etherscan.io/address/$VALIDATOR_ADDR"
fi
echo ""
echo "✨ Deployment script complete!"
echo ""
