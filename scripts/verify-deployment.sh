#!/bin/bash

# ChainWard Post-Deployment Verification Script
# Verifies that all deployed contracts are initialized correctly
# Usage: ./scripts/verify-deployment.sh [arbitrum|optimism] <deployment-json>

NETWORK=${1:-arbitrum}
DEPLOYMENT_FILE=${2}

if [ -z "$DEPLOYMENT_FILE" ]; then
    echo "❌ Usage: ./scripts/verify-deployment.sh [arbitrum|optimism] <deployment-json>"
    echo ""
    echo "Example:"
    echo "  ./scripts/verify-deployment.sh arbitrum deployments/arbitrum-1234567890.json"
    exit 1
fi

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "❌ Deployment file not found: $DEPLOYMENT_FILE"
    exit 1
fi

echo "🔍 ChainWard Deployment Verification"
echo "Network: $NETWORK"
echo "Deployment file: $DEPLOYMENT_FILE"
echo ""

# Parse deployment file
RESPONDER_ADDR=$(jq -r '.contracts.ResponderRegistry' "$DEPLOYMENT_FILE")
CHAIN_TYPE_ADDR=$(jq -r '.contracts.ChainTypeRegistry' "$DEPLOYMENT_FILE")
VALIDATOR_ADDR=$(jq -r '.contracts.ValidatorRegistry' "$DEPLOYMENT_FILE")
ADMIN_CTRL_ADDR=$(jq -r '.contracts.AdminController' "$DEPLOYMENT_FILE")
VALIDATOR_V2_ADDR=$(jq -r '.contracts.ValidatorRegistryV2' "$DEPLOYMENT_FILE")
HEALTH_MON_ADDR=$(jq -r '.contracts.HealthMonitor' "$DEPLOYMENT_FILE")

# Determine RPC URL
if [ "$NETWORK" = "arbitrum" ]; then
    RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
    EXPLORER="https://sepolia.arbiscan.io"
else
    RPC_URL="https://sepolia.optimism.io"
    EXPLORER="https://sepolia-optimism.etherscan.io"
fi

echo "📋 Verifying Contract Deployments"
echo "=================================="
echo ""

verify_contract() {
    local name=$1
    local addr=$2
    
    # Check if contract exists
    code=$(cast code "$addr" --rpc-url "$RPC_URL")
    
    if [ "$code" = "0x" ]; then
        echo "❌ $name: Not deployed or no code"
        return 1
    else
        echo "✅ $name: $addr"
        echo "   Explorer: $EXPLORER/address/$addr"
        return 0
    fi
}

all_ok=true

verify_contract "ResponderRegistry" "$RESPONDER_ADDR" || all_ok=false
verify_contract "ChainTypeRegistry" "$CHAIN_TYPE_ADDR" || all_ok=false
verify_contract "ValidatorRegistry" "$VALIDATOR_ADDR" || all_ok=false
verify_contract "AdminController" "$ADMIN_CTRL_ADDR" || all_ok=false
verify_contract "ValidatorRegistryV2" "$VALIDATOR_V2_ADDR" || all_ok=false
verify_contract "HealthMonitor" "$HEALTH_MON_ADDR" || all_ok=false

echo ""
echo "🔧 Verifying Contract Initialization"
echo "====================================="
echo ""

# Check ValidatorRegistry ownership
owner=$(cast call "$VALIDATOR_ADDR" "owner()" --rpc-url "$RPC_URL" 2>/dev/null | grep -oE "0x[a-fA-F0-9]{40}")
echo "✓ ValidatorRegistry owner: $owner"

# Check ArbitratorRegistry arbitrator
arbitrator=$(cast call "$VALIDATOR_ADDR" "arbitrator()" --rpc-url "$RPC_URL" 2>/dev/null | grep -oE "0x[a-fA-F0-9]{40}")
echo "✓ ValidatorRegistry arbitrator: $arbitrator"

# Check HealthMonitor owner
health_owner=$(cast call "$HEALTH_MON_ADDR" "owner()" --rpc-url "$RPC_URL" 2>/dev/null | grep -oE "0x[a-fA-F0-9]{40}")
echo "✓ HealthMonitor owner: $health_owner"

echo ""

if [ "$all_ok" = true ]; then
    echo "✨ All verifications passed!"
    echo ""
    echo "🎉 ChainWard is ready for testing!"
    echo ""
    echo "Next steps:"
    echo "1. Register chains in ChainTypeRegistry"
    echo "2. Add supported tokens to ValidatorRegistry"
    echo "3. Deploy responders &register with ResponderRegistry"
    echo "4. Initialize HealthMonitor with chains"
    echo ""
    exit 0
else
    echo "❌ Some verifications failed"
    echo ""
    echo "Troubleshooting:"
    echo "1. Verify RPC URL is correct: $RPC_URL"
    echo "2. Check explorer for contract code: $EXPLORER"
    echo "3. Wait a few blocks for indexing"
    echo ""
    exit 1
fi
