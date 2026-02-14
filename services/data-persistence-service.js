/**
 * Unified Data Persistence Service
 * Orchestrates all persistence layers: Graph, PostgreSQL, Redis, IPFS, Elasticsearch
 */

const RedisCacheService = require('./redis-cache-service');
const PostgresAnalyticsService = require('./postgres-analytics-service');
const IPFSStorageService = require('./ipfs-storage-service');
const ElasticsearchSearchService = require('./elasticsearch-search-service');
const chalk = require('chalk');

class DataPersistenceService {
  constructor(options = {}) {
    this.redis = new RedisCacheService(options.redis || {});
    this.postgres = new PostgresAnalyticsService(options.postgres || {});
    this.ipfs = new IPFSStorageService(options.ipfs || {});
    this.elasticsearch = new ElasticsearchSearchService(options.elasticsearch || {});

    // Sync queue for pending operations
    this.syncQueue = [];
    this.syncInterval = null;
    this.syncBatchSize = 100;

    console.log(chalk.blue('Data Persistence Service initialized'));
  }

  /**
   * Initialize all persistence layers
   */
  async initialize() {
    console.log(chalk.blue('\n📊 Initializing Data Persistence Layers...\n'));

    try {
      // Initialize PostgreSQL schema
      console.log(chalk.cyan('1. PostgreSQL Schema...'));
      const pgOk = await this.postgres.initialize();
      if (!pgOk) throw new Error('PostgreSQL initialization failed');

      // Initialize Elasticsearch indices
      console.log(chalk.cyan('2. Elasticsearch Indices...'));
      const esOk = await this.elasticsearch.initialize();
      if (!esOk) throw new Error('Elasticsearch initialization failed');

      // Test Redis connection
      console.log(chalk.cyan('3. Redis Cache...'));
      await this.redis.set('health-check', { timestamp: Date.now() }, 60);
      const healthCheck = await this.redis.get('health-check');
      if (!healthCheck) throw new Error('Redis connection failed');

      // Test IPFS connection
      console.log(chalk.cyan('4. IPFS Storage...'));
      const ipfsStats = await this.ipfs.getNodeStats();
      if (!ipfsStats) throw new Error('IPFS connection failed');

      // Start sync service
      this.startSyncService();

      console.log(chalk.green('\n✓ All persistence layers initialized successfully\n'));
      return true;
    } catch (err) {
      console.error(chalk.red('✗ Persistence initialization failed:'), err.message);
      return false;
    }
  }

  /**
   * Store incident with all persistence layers
   */
  async storeIncident(incident, evidence = {}) {
    try {
      const operationId = `incident-${incident.incidentId}-${Date.now()}`;

      // 1. Store in PostgreSQL (primary source of truth)
      const pgResult = await this.postgres.storeIncident(incident);
      if (!pgResult.rows.length) throw new Error('PostgreSQL store failed');

      // 2. Cache in Redis
      await this.redis.cacheIncidentSummary(incident.incidentId, incident);
      await this.redis.invalidatePattern('incidents:latest:*');

      // 3. Upload evidence to IPFS
      let ipfsResult = null;
      if (Object.keys(evidence).length > 0) {
        ipfsResult = await this.ipfs.uploadIncidentEvidence(
          incident.incidentId,
          evidence
        );
        // Update incident with IPFS hash
        incident.ipfsEvidenceHash = ipfsResult.manifestHash;
      }

      // 4. Index in Elasticsearch
      await this.elasticsearch.indexIncident({
        ...incident,
        evidence: JSON.stringify(evidence),
        ipfsHash: ipfsResult?.manifestHash,
      });

      console.log(
        chalk.green(
          `✓ Incident ${incident.incidentId} stored across all layers (${operationId})`
        )
      );

      return {
        operationId,
        incidentId: incident.incidentId,
        postgresql: pgResult.rows[0],
        ipfs: ipfsResult,
      };
    } catch (err) {
      console.error(chalk.red('Failed to store incident:'), err.message);
      this.syncQueue.push({ type: 'incident', data: incident, evidence, retries: 0 });
      throw err;
    }
  }

  /**
   * Store health report
   */
  async storeHealthReport(report) {
    try {
      // 1. PostgreSQL
      const pgResult = await this.postgres.storeHealthReport(report);

      // 2. Redis (short TTL for recent reports)
      await this.redis.set(`health:${report.chainId}:${report.blockNumber}`, report, 30);

      // 3. Elasticsearch
      await this.elasticsearch.client.index({
        index: this.elasticsearch.indices.health_reports,
        body: report,
      });

      return pgResult;
    } catch (err) {
      console.error(chalk.red('Failed to store health report:'), err.message);
      this.syncQueue.push({ type: 'health_report', data: report, retries: 0 });
      throw err;
    }
  }

  /**
   * Record reward claim
   */
  async recordRewardClaim(claim) {
    try {
      // 1. PostgreSQL
      const pgResult = await this.postgres.recordRewardClaim(claim);

      // 2. Invalidate reporter cache
      await this.redis.invalidateReporter(claim.reporterAddress);

      // 3. Index in Elasticsearch
      await this.elasticsearch.client.index({
        index: 'chainward-rewards',
        body: claim,
      });

      return pgResult;
    } catch (err) {
      console.error(chalk.red('Failed to record reward claim:'), err.message);
      this.syncQueue.push({ type: 'reward_claim', data: claim, retries: 0 });
      throw err;
    }
  }

  /**
   * Record Service Level Agreementshing event
   */
  async recordService Level Agreementshing(Service Level Agreementsh) {
    try {
      // 1. PostgreSQL
      const pgResult = await this.postgres.recordService Level Agreementshing(Service Level Agreementsh);

      // 2. Invalidate caches
      await this.redis.invalidateReporter(Service Level Agreementsh.reporterAddress);
      await this.redis.invalidatePattern('leaderboard:*');
      await this.redis.invalidatePattern('global:metrics');

      return pgResult;
    } catch (err) {
      console.error(chalk.red('Failed to record Service Level Agreementshing:'), err.message);
      this.syncQueue.push({ type: 'Service Level Agreementshing', data: Service Level Agreementsh, retries: 0 });
      throw err;
    }
  }

  /**
   * Search across all data
   */
  async search(query, options = {}) {
    try {
      // Check cache first
      const cacheKey = `search:${query}:${JSON.stringify(options)}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute search
      const results = {
        incidents: await this.elasticsearch.searchIncidents(query, options),
        reporters: await this.elasticsearch.searchReporters(query, options),
      };

      // Cache results
      await this.redis.set(cacheKey, results, 60);

      return results;
    } catch (err) {
      console.error(chalk.red('Search failed:'), err.message);
      throw err;
    }
  }

  /**
   * Get comprehensive metrics
   */
  async getMetrics() {
    try {
      // 1. Try Redis cache
      const cached = await this.redis.get('global:metrics');
      if (cached) {
        return cached;
      }

      // 2. Build from PostgreSQL
      const pgMetrics = await this.postgres.getGlobalMetrics();
      const chainStats = await this.postgres.getChainStats();

      const metrics = {
        global: pgMetrics,
        chains: chainStats.rows,
        cacheStats: this.redis.getStats(),
        dbStats: this.postgres.getStats(),
        elasticsearchStats: this.elasticsearch.getStats(),
        ipfsStats: this.ipfs.getStats(),
        syncQueue: this.syncQueue.length,
        timestamp: new Date().toISOString(),
      };

      // 3. Cache for 5 minutes
      await this.redis.cacheGlobalMetrics(metrics);

      return metrics;
    } catch (err) {
      console.error(chalk.red('Failed to get metrics:'), err.message);
      return null;
    }
  }

  /**
   * Start background sync service
   */
  startSyncService() {
    this.syncInterval = setInterval(async () => {
      if (this.syncQueue.length === 0) return;

      const batch = this.syncQueue.splice(0, this.syncBatchSize);
      let successful = 0;

      for (const item of batch) {
        try {
          switch (item.type) {
            case 'incident':
              await this.storeIncident(item.data, item.evidence);
              successful++;
              break;
            case 'health_report':
              await this.storeHealthReport(item.data);
              successful++;
              break;
            case 'reward_claim':
              await this.recordRewardClaim(item.data);
              successful++;
              break;
            case 'Service Level Agreementshing':
              await this.recordService Level Agreementshing(item.data);
              successful++;
              break;
          }
        } catch (err) {
          // Retry logic
          if (item.retries < 3) {
            item.retries++;
            this.syncQueue.push(item);
          } else {
            console.error(chalk.red(`Failed to sync ${item.type} after 3 retries`));
          }
        }
      }

      if (successful > 0) {
        console.log(chalk.green(`✓ Synced ${successful}/${batch.length} items`));
      }
    }, 5000);
  }

  /**
   * Get service health
   */
  async getHealth() {
    const health = {
      redis: {
        status: 'unknown',
        lastCheck: null,
      },
      postgresql: {
        status: 'unknown',
        lastCheck: null,
      },
      ipfs: {
        status: 'unknown',
        lastCheck: null,
      },
      elasticsearch: {
        status: 'unknown',
        lastCheck: null,
      },
    };

    try {
      // Check Redis
      const redisCheck = await this.redis.get('health-check');
      health.redis.status = redisCheck ? 'healthy' : 'degraded';
      health.redis.lastCheck = new Date();

      // Check PostgreSQL
      const pgCheck = await this.postgres.executeQuery('SELECT 1');
      health.postgresql.status = pgCheck ? 'healthy' : 'degraded';
      health.postgresql.lastCheck = new Date();

      // Check Elasticsearch
      const esHealth = await this.elasticsearch.getClusterHealth();
      health.elasticsearch.status = esHealth?.status || 'unknown';
      health.elasticsearch.lastCheck = new Date();

      // Check IPFS
      const ipfsStats = await this.ipfs.getNodeStats();
      health.ipfs.status = ipfsStats ? 'healthy' : 'offline';
      health.ipfs.lastCheck = new Date();
    } catch (err) {
      console.error(chalk.red('Health check failed:'), err.message);
    }

    return health;
  }

  /**
   * Close all connections
   */
  async close() {
    console.log(chalk.blue('Closing Data Persistence Service...'));

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    await Promise.all([
      this.redis.close(),
      this.postgres.close(),
      this.elasticsearch.close(),
      this.ipfs.client.then((client) => client.stop?.()),
    ]);

    console.log(chalk.green('✓ Data Persistence Service closed'));
  }
}

module.exports = DataPersistenceService;
