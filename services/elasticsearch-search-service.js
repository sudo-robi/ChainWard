/**
 * Elasticsearch Full-Text Search Service
 * Provides fast full-text search across incidents, reports, &evidence
 */

const { Client } = require('@elastic/elasticsearch');
const chalk = require('chalk');

class ElasticsearchSearchService {
  constructor(options = {}) {
    this.client = new Client({
      node: options.node || process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: options.auth || {
        username: process.env.ES_USER || 'elastic',
        password: process.env.ES_PASSWORD || 'changeme',
      },
      requestTimeout: options.requestTimeout || 30000,
      sniffOnStart: options.sniffOnStart !== false,
    });

    this.indices = {
      incidents: 'chainward-incidents',
      health_reports: 'chainward-health-reports',
      reporter_profiles: 'chainward-reporters',
      disputes: 'chainward-disputes',
      evidence: 'chainward-evidence',
    };

    this.stats = {
      indexed: 0,
      searched: 0,
      errors: 0,
    };
  }

  /**
   * Initialize Elasticsearch indices
   */
  async initialize() {
    try {
      console.log(chalk.blue('Initializing Elasticsearch indices...'));

      // Create indices with mappings
      await this.createIncidentsIndex();
      await this.createHealthReportsIndex();
      await this.createReporterIndex();
      await this.createDisputesIndex();
      await this.createEvidenceIndex();

      console.log(chalk.green('✓ Elasticsearch indices initialized'));
      return true;
    } catch (err) {
      console.error(chalk.red('Failed to initialize Elasticsearch:'), err.message);
      return false;
    }
  }

  /**
   * Create incidents index with mappings
   */
  async createIncidentsIndex() {
    const indexName = this.indices.incidents;

    try {
      await this.client.indices.delete({ index: indexName }).catch(() => {});

      await this.client.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 2,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                incident_analyzer: {
                  type: 'standard',
                  stopwords: '_english_',
                },
              },
            },
          },
          mappings: {
            properties: {
              incidentId: { type: 'keyword' },
              reporterAddress: { type: 'keyword' },
              chainId: { type: 'keyword' },
              chainName: { type: 'text', analyzer: 'incident_analyzer' },
              incidentType: { type: 'keyword' },
              severity: { type: 'integer' },
              timestamp: { type: 'date' },
              status: { type: 'keyword' },
              resolution: { type: 'text', analyzer: 'incident_analyzer' },
              detectionLatencyMs: { type: 'long' },
              evidence: { type: 'text', analyzer: 'incident_analyzer' },
              ipfsHash: { type: 'keyword' },
              location: { type: 'geo_point' },
              createdAt: { type: 'date' },
            },
          },
        },
      });

      console.log(chalk.green(`✓ Created index: ${indexName}`));
    } catch (err) {
      console.error(chalk.red(`Failed to create incidents index:`), err.message);
      throw err;
    }
  }

  /**
   * Create health reports index
   */
  async createHealthReportsIndex() {
    const indexName = this.indices.health_reports;

    try {
      await this.client.indices.delete({ index: indexName }).catch(() => {});

      await this.client.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 2,
            number_of_replicas: 1,
          },
          mappings: {
            properties: {
              reporterAddress: { type: 'keyword' },
              chainId: { type: 'keyword' },
              chainName: { type: 'keyword' },
              blockNumber: { type: 'long' },
              reportTimestamp: { type: 'date' },
              blockLagMs: { type: 'long' },
              sequencerLatencyMs: { type: 'long' },
              isAnomaly: { type: 'boolean' },
              anomalyType: { type: 'keyword' },
              anomalySeverity: { type: 'integer' },
              stateRoot: { type: 'keyword' },
              createdAt: { type: 'date' },
            },
          },
        },
      });

      console.log(chalk.green(`✓ Created index: ${indexName}`));
    } catch (err) {
      console.error(chalk.red(`Failed to create health reports index:`), err.message);
      throw err;
    }
  }

  /**
   * Create reporter profiles index
   */
  async createReporterIndex() {
    const indexName = this.indices.reporter_profiles;

    try {
      await this.client.indices.delete({ index: indexName }).catch(() => {});

      await this.client.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
          },
          mappings: {
            properties: {
              address: { type: 'keyword' },
              totalReports: { type: 'long' },
              accurateReports: { type: 'long' },
              falseReports: { type: 'long' },
              accuracyPercentage: { type: 'float' },
              totalRewardsEarned: { type: 'scaled_float', scaling_factor: 10000 },
              totalService Level Agreementshed: { type: 'scaled_float', scaling_factor: 10000 },
              reputationScore: { type: 'integer' },
              status: { type: 'keyword' },
              joinedAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });

      console.log(chalk.green(`✓ Created index: ${indexName}`));
    } catch (err) {
      console.error(chalk.red(`Failed to create reporter index:`), err.message);
      throw err;
    }
  }

  /**
   * Create disputes index
   */
  async createDisputesIndex() {
    const indexName = this.indices.disputes;

    try {
      await this.client.indices.delete({ index: indexName }).catch(() => {});

      await this.client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              disputeId: { type: 'keyword' },
              incidentId: { type: 'keyword' },
              reporterAddress: { type: 'keyword' },
              challengerAddress: { type: 'keyword' },
              status: { type: 'keyword' },
              outcome: { type: 'keyword' },
              filedAt: { type: 'date' },
              resolvedAt: { type: 'date' },
              evidence: { type: 'text' },
            },
          },
        },
      });

      console.log(chalk.green(`✓ Created index: ${indexName}`));
    } catch (err) {
      console.error(chalk.red(`Failed to create disputes index:`), err.message);
      throw err;
    }
  }

  /**
   * Create evidence index
   */
  async createEvidenceIndex() {
    const indexName = this.indices.evidence;

    try {
      await this.client.indices.delete({ index: indexName }).catch(() => {});

      await this.client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              incidentId: { type: 'keyword' },
              ipfsHash: { type: 'keyword' },
              fileType: { type: 'keyword' },
              fileName: { type: 'text' },
              description: { type: 'text', analyzer: 'standard' },
              submittedBy: { type: 'keyword' },
              fileSize: { type: 'long' },
              uploadedAt: { type: 'date' },
            },
          },
        },
      });

      console.log(chalk.green(`✓ Created index: ${indexName}`));
    } catch (err) {
      console.error(chalk.red(`Failed to create evidence index:`), err.message);
      throw err;
    }
  }

  /**
   * Index incident for full-text search
   */
  async indexIncident(incident) {
    try {
      await this.client.index({
        index: this.indices.incidents,
        id: incident.incidentId,
        body: {
          incidentId: incident.incidentId,
          reporterAddress: incident.reporterAddress,
          chainId: incident.chainId,
          chainName: incident.chainName,
          incidentType: incident.incidentType,
          severity: incident.severity,
          timestamp: incident.timestamp,
          status: incident.status,
          resolution: incident.resolution,
          detectionLatencyMs: incident.detectionLatencyMs,
          evidence: incident.evidence,
          ipfsHash: incident.ipfsHash,
          createdAt: new Date().toISOString(),
        },
      });

      this.stats.indexed++;
      return true;
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Failed to index incident:'), err.message);
      return false;
    }
  }

  /**
   * Search incidents
   */
  async searchIncidents(query, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        severity = null,
        chainId = null,
        status = null,
        dateRange = null,
      } = options;

      const filters = [];

      if (severity) {
        filters.push({ term: { severity } });
      }

      if (chainId) {
        filters.push({ term: { chainId } });
      }

      if (status) {
        filters.push({ term: { status } });
      }

      if (dateRange) {
        filters.push({
          range: {
            timestamp: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
        });
      }

      const searchBody = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: [
                    'chainName^3',
                    'incidentType^2',
                    'resolution',
                    'evidence',
                  ],
                },
              },
            ],
            filter: filters.length > 0 ? filters : undefined,
          },
        },
        from: offset,
        size: limit,
        sort: [{ timestamp: { order: 'desc' } }],
        highlight: {
          fields: {
            resolution: {},
            evidence: {},
          },
        },
      };

      const result = await this.client.search({
        index: this.indices.incidents,
        body: searchBody,
      });

      this.stats.searched++;

      return {
        total: result.hits.total.value,
        results: result.hits.hits.map((hit) => ({
          ...hit._source,
          highlight: hit.highlight,
        })),
      };
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Search failed:'), err.message);
      throw err;
    }
  }

  /**
   * Search reporters
   */
  async searchReporters(query, options = {}) {
    try {
      const { limit = 50, offset = 0, minReputation = 0, status = 'ACTIVE' } = options;

      const result = await this.client.search({
        index: this.indices.reporter_profiles,
        body: {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ['address', 'status'],
                    fuzziness: 'AUTO',
                  },
                },
              ],
              filter: [
                { term: { status } },
                { range: { reputationScore: { gte: minReputation } } },
              ],
            },
          },
          from: offset,
          size: limit,
          sort: [{ reputationScore: { order: 'desc' } }],
        },
      });

      return {
        total: result.hits.total.value,
        results: result.hits.hits.map((hit) => hit._source),
      };
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Reporter search failed:'), err.message);
      throw err;
    }
  }

  /**
   * Aggregated search (dashboard view)
   */
  async getSearchAggregations(query, options = {}) {
    try {
      const result = await this.client.search({
        index: this.indices.incidents,
        body: {
          query: {
            multi_match: {
              query,
              fields: ['chainName', 'incidentType', 'resolution'],
            },
          },
          size: 0,
          aggs: {
            by_severity: {
              terms: { field: 'severity', size: 10 },
            },
            by_chain: {
              terms: { field: 'chainName', size: 20 },
            },
            by_status: {
              terms: { field: 'status' },
            },
            by_type: {
              terms: { field: 'incidentType' },
            },
            timeline: {
              date_histogram: {
                field: 'timestamp',
                calendar_interval: 'day',
              },
            },
          },
        },
      });

      return result.aggregations;
    } catch (err) {
      this.stats.errors++;
      console.error(chalk.red('Aggregation search failed:'), err.message);
      throw err;
    }
  }

  /**
   * Delete incident from index
   */
  async deleteIncident(incidentId) {
    try {
      await this.client.delete({
        index: this.indices.incidents,
        id: incidentId,
      });
      return true;
    } catch (err) {
      console.error(chalk.red('Failed to delete incident from index:'), err.message);
      return false;
    }
  }

  /**
   * Get cluster health
   */
  async getClusterHealth() {
    try {
      return await this.client.cluster.health();
    } catch (err) {
      console.error(chalk.red('Failed to get cluster health:'), err.message);
      return null;
    }
  }

  /**
   * Get index stats
   */
  async getIndexStats() {
    try {
      const stats = await this.client.indices.stats();
      return stats;
    } catch (err) {
      console.error(chalk.red('Failed to get index stats:'), err.message);
      return null;
    }
  }

  /**
   * Get service stats
   */
  getStats() {
    return {
      ...this.stats,
      indices: this.indices,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Close Elasticsearch client
   */
  async close() {
    try {
      await this.client.close();
      console.log(chalk.green('Elasticsearch connection closed'));
    } catch (err) {
      console.error(chalk.red('Error closing Elasticsearch:'), err.message);
    }
  }
}

module.exports = ElasticsearchSearchService;
