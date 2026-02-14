#!/bin/bash
# Setup script for Data Persistence andIndexing System

set -e

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║     ChainWard Data Persistence andIndexing Setup                   ║"
echo "╚════════════════════════════════════════════════════════════════════╝"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
    if ! comm&-v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 is installed${NC}"
    return 0
}

echo -e "\n${YELLOW}Checking prerequisites...${NC}\n"

# Check Node.js
check_comm&"node" || { echo "Please install Node.js"; exit 1; }
check_comm&"npm" || { echo "Please install npm"; exit 1; }

# Docker for optional local services
echo ""
if comm&-v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker is installed (optional services available)${NC}"
else
    echo -e "${YELLOW}⚠ Docker not found - use cloud services for persistence layers${NC}"
fi

# Install Node dependencies
echo -e "\n${YELLOW}Installing Node.js dependencies...${NC}\n"

# Add persistence layer dependencies to package.json
npm install --save redis pg @elastic/elasticsearch ipfs-http-client chalk dotenv

# Create necessary directories
echo -e "\n${YELLOW}Creating directories...${NC}\n"

mkdir -p db
mkdir -p services
mkdir -p config
mkdir -p scripts
mkdir -p ipfs-metadata

echo -e "${GREEN}✓ Directories created${NC}"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}Creating .env file...${NC}\n"
    cat > .env << 'EOF'
# PostgreSQL
DB_USER=postgres
DB_PASSWORD=changeme
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chainward

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
ES_USER=elastic
ES_PASSWORD=changeme

# IPFS
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_PROTOCOL=http
IPFS_GATEWAY=https://ipfs.io/ipfs
IPFS_PINATA_API_KEY=
IPFS_PINATA_SECRET=

# Graph Protocol
GRAPH_NODE_URL=https://api.thegraph.com/deploy
GRAPH_GITHUB_TOKEN=

# RPC
RPC_URL=http://localhost:8545

# Service Configuration
LOG_LEVEL=info
CACHE_TTL_DEFAULT=300
SYNC_BATCH_SIZE=100
EOF
    echo -e "${GREEN}✓ .env file created (update with your values)${NC}"
fi

# Docker Compose setup
if comm&-v docker &> /dev/null; then
    echo -e "\n${YELLOW}Creating docker-compose.yml for local development...${NC}\n"
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: chainward-postgres
    environment:
      POSTGRES_DB: chainward
      POSTGRES_PASSWORD: changeme
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: chainward-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
    container_name: chainward-elasticsearch
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
EOF
    echo -e "${GREEN}✓ docker-compose.yml created${NC}"

    echo -e "\n${YELLOW}To start services:${NC}"
    echo "  docker-compose up -d"
    echo ""
fi

# Verify Node dependencies
echo -e "\n${YELLOW}Verifying Node.js dependencies...${NC}\n"

cat > /tmp/verify-deps.js << 'EOF'
const deps = [
    'redis',
    'pg',
    '@elastic/elasticsearch',
    'ipfs-http-client',
    'chalk',
    'dotenv'
];

let missing = [];
for (const dep of deps) {
    try {
        require(dep);
        console.log(`✓ ${dep}`);
    } catch {
        console.log(`✗ ${dep}`);
        missing.push(dep);
    }
}

if (missing.length > 0) {
    console.log(`\nMissing: ${missing.join(', ')}`);
    process.exit(1);
}
EOF

node /tmp/verify-deps.js || {
    echo -e "\n${YELLOW}Installing missing dependencies...${NC}\n"
    npm install
}

# Create test file
echo -e "\n${YELLOW}Creating verification script...${NC}\n"

cat > scripts/verify-persistence.js << 'EOF'
/**
 * Verify Data Persistence Setup
 */

const chalk = require('chalk');
const redis = require('redis');
const { Pool } = require('pg');

async function main() {
    console.log(chalk.blue('\n🔍 Verifying Data Persistence Setup...\n'));

    // Test Redis
    console.log(chalk.cyan('Testing Redis...'));
    try {
        const redisClient = redis.createClient({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
        });
        
        await redisClient.connect();
        await redisClient.ping();
        await redisClient.disconnect();
        
        console.log(chalk.green('✓ Redis connection successful\n'));
    } catch (err) {
        console.log(chalk.red('✗ Redis connection failed:'), err.message, '\n');
    }

    // Test PostgreSQL
    console.log(chalk.cyan('Testing PostgreSQL...'));
    try {
        const pool = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'chainward',
            password: process.env.DB_PASSWORD || 'changeme',
            port: process.env.DB_PORT || 5432,
        });

        const result = await pool.query('SELECT 1');
        await pool.end();
        
        console.log(chalk.green('✓ PostgreSQL connection successful\n'));
    } catch (err) {
        console.log(chalk.red('✗ PostgreSQL connection failed:'), err.message, '\n');
    }

    // Test Elasticsearch
    console.log(chalk.cyan('Testing Elasticsearch...'));
    try {
        const { Client } = require('@elastic/elasticsearch');
        const client = new Client({
            node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
        });

        const health = await client.cluster.health();
        await client.close();
        
        console.log(chalk.green(`✓ Elasticsearch healthy (${health.status})\n`));
    } catch (err) {
        console.log(chalk.red('✗ Elasticsearch connection failed:'), err.message, '\n');
    }

    console.log(chalk.blue('Verification complete!\n'));
}

main().catch(err => {
    console.error(chalk.red('Error:'), err);
    process.exit(1);
});
EOF

echo -e "${GREEN}✓ Verification script created${NC}"

# Summary
echo -e "\n${GREEN}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}Next steps:${NC}\n"
echo "1. Update .env with your configuration:"
echo "   - Database credentials"
echo "   - IPFS/Pinata API keys"
echo "   - Elasticsearch endpoint"
echo ""
echo "2. Start local services (if using Docker):"
echo "   docker-compose up -d"
echo ""
echo "3. Verify connection:"
echo "   node scripts/verify-persistence.js"
echo ""
echo "4. Review documentation:"
echo "   - DATA_PERSISTENCE_GUIDE.md (comprehensive guide)"
echo "   - DATA_PERSISTENCE_DELIVERY_SUMMARY.md (status andchecklist)"
echo ""
echo "5. Initialize database schema:"
echo "   psql -U postgres -d chainward -f db/schema.sql"
echo ""
echo "6. Deploy Graph subgraph:"
echo "   npm run subgraph:deploy"
echo ""
echo -e "${GREEN}Documentation available in:${NC}"
echo "  - DATA_PERSISTENCE_GUIDE.md"
echo "  - DATA_PERSISTENCE_DELIVERY_SUMMARY.md"
echo ""
