/**
 * Redis Caching Service
 * Provides distributed caching for RPC responses, query results, &metrics
 */

const redis = require('redis');
const crypto = require('crypto');

class RedisCacheService {
  constructor(options = {}) {
    this.client = redis.createClient({
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || process.env.REDIS_PORT || 6379,
      password: options.password || process.env.REDIS_PASSWORD,
      db: options.db || 0,
      retryStrategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
      this.handleCircuitBreaker('error');
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failures = 0;
    });

    // Circuit breaker for cache failures
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      successCount: 0,
      lastFailureTime: null,
      threshold: 5,
      timeout: 30000, // 30 seconds
    };

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };

    // TTL constants
    this.TTL = {
      RPC_RESPONSE: 60,
      REPORTER_STATS: 300,
      INCIDENT_SUMMARY: 60,
      CHAIN_METRICS: 300,
      REWARD_POOL: 120,
      HEALTH_STATUS: 30,
      LEADERBOARD: 600,
      RECENT_DATA: 30,
    };
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (this.circuitBreaker.state === 'open') {
      this.stats.misses++;
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value) {
        this.stats.hits++;
        if (this.circuitBreaker.state === 'half-open') {
          this.circuitBreaker.successCount++;
          if (this.circuitBreaker.successCount >= 3) {
            this.circuitBreaker.state = 'closed';
            this.circuitBreaker.failures = 0;
          }
        }
        return JSON.parse(value);
      }
      this.stats.misses++;
      return null;
    } catch (err) {
      this.stats.errors++;
      this.handleCircuitBreaker('error');
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key, value, ttl = null) {
    if (this.circuitBreaker.state === 'open') {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      this.stats.sets++;
      return true;
    } catch (err) {
      this.stats.errors++;
      this.handleCircuitBreaker('error');
      return false;
    }
  }

  /**
   * Cache RPC call with automatic key generation
   */
  async cacheRPC(method, params, result, ttl = this.TTL.RPC_RESPONSE) {
    const key = this.buildRpcKey(method, params);
    return this.set(key, result, ttl);
  }

  /**
   * Get cached RPC result
   */
  async getCachedRPC(method, params) {
    const key = this.buildRpcKey(method, params);
    return this.get(key);
  }

  /**
   * Build cache key for RPC call
   */
  buildRpcKey(method, params) {
    const paramsStr = JSON.stringify(params || {}, Object.keys(params || {}).sort());
    const hash = crypto.createHash('md5').update(paramsStr).digest('hex');
    return `rpc:${method}:${hash}`;
  }

  /**
   * Cache reporter stats
   */
  async cacheReporterStats(address, stats) {
    const key = `reporter_stats:${address.toLowerCase()}`;
    return this.set(key, stats, this.TTL.REPORTER_STATS);
  }

  /**
   * Get cached reporter stats
   */
  async getCachedReporterStats(address) {
    const key = `reporter_stats:${address.toLowerCase()}`;
    return this.get(key);
  }

  /**
   * Cache incident summary
   */
  async cacheIncidentSummary(incidentId, summary) {
    const key = `incident_summary:${incidentId}`;
    return this.set(key, summary, this.TTL.INCIDENT_SUMMARY);
  }

  /**
   * Get cached incident summary
   */
  async getCachedIncidentSummary(incidentId) {
    const key = `incident_summary:${incidentId}`;
    return this.get(key);
  }

  /**
   * Cache chain metrics
   */
  async cacheChainMetrics(chainId, metrics) {
    const key = `chain:metrics:${chainId}`;
    return this.set(key, metrics, this.TTL.CHAIN_METRICS);
  }

  /**
   * Get cached chain metrics
   */
  async getCachedChainMetrics(chainId) {
    const key = `chain:metrics:${chainId}`;
    return this.get(key);
  }

  /**
   * Cache global metrics
   */
  async cacheGlobalMetrics(metrics) {
    const key = 'global:metrics';
    return this.set(key, metrics, this.TTL.CHAIN_METRICS);
  }

  /**
   * Get cached global metrics
   */
  async getCachedGlobalMetrics() {
    const key = 'global:metrics';
    return this.get(key);
  }

  /**
   * Cache leaderboard
   */
  async cacheLeaderboard(type, page, data) {
    const key = `leaderboard:${type}:page:${page}`;
    return this.set(key, data, this.TTL.LEADERBOARD);
  }

  /**
   * Get cached leaderboard
   */
  async getCachedLeaderboard(type, page) {
    const key = `leaderboard:${type}:page:${page}`;
    return this.get(key);
  }

  /**
   * Invalidate cache pattern
   */
  async invalidatePattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        this.stats.deletes += keys.length;
      }
      return keys.length;
    } catch (err) {
      this.stats.errors++;
      console.error('Error invalidating pattern:', err);
      return 0;
    }
  }

  /**
   * Invalidate incident-related caches
   */
  async invalidateIncident(incidentId, chainId) {
    const patterns = [
      `incident_summary:${incidentId}`,
      `incidents:latest:*`,
      `incidents:chain:${chainId}:*`,
      `chain:metrics:${chainId}`,
      `global:metrics`,
      `dashboard:stats`,
      `search:incidents:*`,
    ];

    for (const pattern of patterns) {
      await this.invalidatePattern(pattern);
    }
  }

  /**
   * Invalidate reporter-related caches
   */
  async invalidateReporter(address) {
    const lowerAddr = address.toLowerCase();
    const patterns = [
      `reporter_stats:${lowerAddr}`,
      `reporter:${lowerAddr}`,
      `leaderboard:reporters:*`,
      `search:incidents:*`,
    ];

    for (const pattern of patterns) {
      await this.invalidatePattern(pattern);
    }
  }

  /**
   * Handle circuit breaker state transitions
   */
  handleCircuitBreaker(event) {
    if (event === 'error') {
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailureTime = Date.now();

      if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
        this.circuitBreaker.state = 'open';
        console.warn('Redis circuit breaker OPEN - caching disabled');

        // Auto-recovery after timeout
        setTimeout(() => {
          this.circuitBreaker.state = 'half-open';
          this.circuitBreaker.successCount = 0;
          console.warn('Redis circuit breaker HALF-OPEN - testing recovery');
        }, this.circuitBreaker.timeout);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      circuitBreaker: this.circuitBreaker,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Warm cache on startup
   */
  async warmCache(warmupData) {
    console.log('Warming Redis cache...');
    let count = 0;

    for (const [key, value, ttl] of warmupData) {
      if (await this.set(key, value, ttl)) {
        count++;
      }
    }

    console.log(`Warmed ${count} cache entries`);
    return count;
  }

  /**
   * Clear all caches
   */
  async flush() {
    try {
      await this.client.flushdb();
      this.stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
      };
      return true;
    } catch (err) {
      console.error('Error flushing cache:', err);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    try {
      await this.client.quit();
      console.log('Redis connection closed');
    } catch (err) {
      console.error('Error closing Redis connection:', err);
    }
  }
}

module.exports = RedisCacheService;
