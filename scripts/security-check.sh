#!/bin/bash

# ChainWard Security Pre-Deployment Checklist
# Run this before every deployment to testnet/mainnet

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  ChainWard Security Checklist"
echo "=========================================="
echo ""

PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}❌${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# ============================================================================
# Check 1: Git Security
# ============================================================================

echo "1️⃣  Git Security Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check .gitignore exists
if [ -f .gitignore ]; then
    pass ".gitignore exists"
else
    fail ".gitignore missing - will leak secrets!"
fi

# Check .env files are ignored
if git ls-files | grep -E "^\\.env" | grep -v "^\\.env\\.example"; then
    fail ".env files are tracked in git - remove with: git rm --cached .env*"
else
    pass "No .env files tracked in git"
fi

# Check for secrets in git history (sampling recent commits)
if git log --oneline -50 --all | grep -qi "private\|secret"; then
    fail "Found references to secrets in recent git history"
else
    pass "No recent secret references in git history"
fi

# Check for private keys in committed files
if git log -p --all -S "PRIVATE_KEY" 2>/dev/null | head -1 | grep -q "PRIVATE_KEY"; then
    fail "PRIVATE_KEY found in git history - rewrite or reset"
else
    pass "No PRIVATE_KEY in git history"
fi

echo ""

# ============================================================================
# Check 2: Environment Configuration
# ============================================================================

echo "2️⃣  Environment Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check .env.example exists
if [ -f .env.example ]; then
    pass ".env.example template exists"
else
    fail ".env.example template missing"
fi

# Check .env.local is in .gitignore
if grep -q "^.env" .gitignore 2>/dev/null; then
    pass ".env files in .gitignore"
else
    fail ".env not in .gitignore"
fi

# Check if .env exists but not committed
if [ -f .env ] &&! git ls-files | grep -q "^.env$"; then
    pass ".env file exists but not in git (good!)"
elif [ -f .env ]; then
    fail ".env file is committed to git"
elif [ ! -f .env ]; then
    warn ".env file not found - needed for deployment"
fi

echo ""

# ============================================================================
# Check 3: Dependency Security
# ============================================================================

echo "3️⃣  Dependency Management"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check package.json for exact versions
if grep -q '"ethers": "6.8.0"' package.json; then
    pass "Ethers version pinned (6.8.0)"
else
    if grep -q '"ethers": "\^' package.json; then
        fail "Ethers version not pinned - use exact version"
    fi
fi

# Check for caret/tilde versions (bad for security)
UNPINNED=$(grep -E "\"[^\"]+\": \"[\^~]" package.json | wc -l)
if [ "$UNPINNED" -gt 0 ]; then
    warn "Found $UNPINNED unpinned dependencies - consider pinning all versions"
else
    pass "All dependencies pinned to exact versions"
fi

# Check package-lock.json exists
if [ -f package-lock.json ]; then
    pass "package-lock.json exists for reproducible installs"
else
    warn "package-lock.json not found - run 'npm install' to create"
fi

# Check forge.toml dependencies
if grep -q 'tag = '"'"'v1.14.0'"'"'' forge.toml; then
    pass "forge-std pinned to v1.14.0"
else
    fail "forge-std not pinned to specific tag (currently using: $(grep 'forge-std' forge.toml))"
fi

echo ""

# ============================================================================
# Check 4: Smart Contract Build
# ============================================================================

echo "4️⃣  Smart Contract Compilation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check contracts compile
if forge build 2>&1 | grep -q "Finished in"; then
    pass "Contracts compile successfully"
else
    fail "Contracts don't compile - run 'forge build' to see errors"
fi

# Check for compilation warnings
WARNINGS_COUNT=$(forge build 2>&1 | grep -i "warning" | wc -l)
if [ "$WARNINGS_COUNT" -eq 0 ]; then
    pass "No compilation warnings"
else
    warn "Found $WARNINGS_COUNT compilation warnings"
fi

echo ""

# ============================================================================
# Check 5: Tests
# ============================================================================

echo "5️⃣  Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run tests &check results
TEST_OUTPUT=$(forge test 2>&1)

if echo "$TEST_OUTPUT" | grep -q "passed"; then
    PASSED_TESTS=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passed)' || echo "0")
    FAILED_TESTS=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= failed)' || echo "0")
    
    if [ "$FAILED_TESTS" -eq 0 ]; then
        pass "All $PASSED_TESTS tests passed"
    else
        fail "$FAILED_TESTS tests failed, $PASSED_TESTS passed"
    fi
else
    fail "Could not determine test results"
fi

echo ""

# ============================================================================
# Check 6: Code Quality
# ============================================================================

echo "6️⃣  Code Quality"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for hardcoded test addresses
if grep -r "0x[0-9a-f]\{40\}" src/ --include="*.sol" 2>/dev/null | grep -v "address(0)" | grep -v "type(" | grep -q .; then
    warn "Found hardcoded contract addresses in src/ - verify these are intentional"
else
    pass "No suspicious hardcoded addresses"
fi

# Check for private keys in JavaScript
if grep -r "PRIVATE_KEY\|privateKey\|0x[0-9a-f]\{64\}" scripts/ --include="*.js" 2>/dev/null | grep -v "node_modules" | grep -v "\.example" | grep -q .; then
    fail "Found potential private key references in scripts/"
else
    pass "No private key references in scripts"
fi

# Check for secure script variants
if [ -f "scripts/report-secure.js" ] && [ -f "scripts/deploy-secure.js" ]; then
    pass "Secure script variants present"
else
    warn "Secure script variants not found - use report-secure.js &deploy-secure.js"
fi

echo ""

# ============================================================================
# Check 7: Documentation
# ============================================================================

echo "7️⃣  Security Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check security docs exist
if [ -f "SECURITY_AUDIT.md" ]; then
    pass "SECURITY_AUDIT.md exists"
else
    fail "SECURITY_AUDIT.md missing"
fi

if [ -f "SECURITY_IMPLEMENTATION.md" ]; then
    pass "SECURITY_IMPLEMENTATION.md exists"
else
    warn "SECURITY_IMPLEMENTATION.md missing - run security audit"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo "=========================================="
echo "  Results"
echo "=========================================="
echo ""
echo -e "Passed:  ${GREEN}$PASSED${NC}"
echo -e "Failed:  ${RED}$FAILED${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed!${NC}"
    echo ""
    echo "You can proceed with deployment to:"
    echo "  • Testnet: npm run deploy"
    echo "  • Mainnet: review SECURITY_IMPLEMENTATION.md Phase 5"
    exit 0
else
    echo -e "${RED}❌ Fix the above issues before deployment${NC}"
    exit 1
fi
