/**
 * PostgreSQL Analytics Service
 * Provides long-term storage, complex queries, &analytics
 */

const { Pool } = require('pg');
const chalk = require('chalk');

class PostgresAnalyticsService {
  constructor(options = {}) {
    this.pool = new Pool({
      user: options.user || process.env.DB_USER || 'postgres',
      host: options.host || process.env.DB_HOST || 'localhost',
      database: options.database || process.env.DB_NAME || 'chainward',
      password: options.password || process.env.DB_PASSWORD,
      port: options.port || process.env.DB_PORT || 5432,
      max: options.max || 20,
      idleTimeoutMillis: options.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: options.connectionTimeoutMillis || 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err);
    });

    this.queryStats = {
      total: 0,
      successful: 0,
      failed: 0,
      totalDuration: 0,
    };
  }

  /**
   * Initialize database schema
   */
  async initialize() {
    try {
      console.log(chalk.blue('Initializing PostgreSQL schema...'));
      const fs = require('fs');
      const schema = fs.readFileSync('./db/schema.sql', 'utf8');
      
      // Split by semicolon &execute each statement
      const statements = schema.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await this.pool.query(statement);
        }
      }
      
      console.log(chalk.green('✓ PostgreSQL schema initialized'));
      return true;
    } catch (err) {
      console.error(chalk.red('✗ Failed to initialize schema:'), err.message);
      return false;
    }
  }

  /**
   * Store incident
   */
  async storeIncident(incident) {
    const query = `
      INSERT INTO incidents (
        incident_id, reporter_address, chain_id, chain_name, incident_type,
        severity, timestamp, block_number, transaction_hash, status,
        detection_latency_ms, ipfs_evidence_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (incident_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `;

    const values = [
      incident.incidentId,
      incident.reporterAddress,
      incident.chainId,
      incident.chainName,
      incident.incidentType,
      incident.severity,
      incident.timestamp,
      incident.blockNumber,
      incident.transactionHash,
      incident.status,
      incident.detectionLatencyMs,
      incident.ipfsEvidenceHash || null,
    ];

    return this.executeQuery(query, values);
  }

  /**
   * Store health report
   */
  async storeHealthReport(report) {
    const query = `
      INSERT INTO health_reports (
        reporter_address, chain_id, chain_name, block_number, block_time,
        report_timestamp, block_lag_ms, sequencer_latency_ms, state_root,
        transaction_hash, is_anomaly, anomaly_type, anomaly_severity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id;
    `;

    const values = [
      report.reporterAddress,
      report.chainId,
      report.chainName,
      report.blockNumber,
      report.blockTime,
      report.reportTimestamp,
      report.blockLagMs,
      report.sequencerLatencyMs,
      report.stateRoot,
      report.transactionHash,
      report.isAnomaly,
      report.anomalyType || null,
      report.anomalySeverity || null,
    ];

    return this.executeQuery(query, values);
  }

  /**
   * Record reward claim
   */
  async recordRewardClaim(claim) {
    const query = `
      INSERT INTO reward_claims (
        reporter_address, amount, claim_type, incident_id,
        claim_timestamp, block_number, transaction_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `;

    const values = [
      claim.reporterAddress,
      claim.amount,
      claim.claimType,
      claim.incidentId || null,
      claim.claimTimestamp,
      claim.blockNumber,
      claim.transactionHash,
    ];

    return this.executeQuery(query, values);
  }

  /**
   * Record Service Level Agreementshing event
   */
  async recordService Level Agreementshing(Service Level Agreementsh) {
    const query = `
      INSERT INTO Service Level Agreementshing_events (
        reporter_address, Service Level Agreementsh_amount, reason, incident_id,
        timestamp, block_number, transaction_hash,
        funds_to_rewards, funds_to_insurance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `;

    const values = [
      Service Level Agreementsh.reporterAddress,
      Service Level Agreementsh.Service Level AgreementshAmount,
      Service Level Agreementsh.reason,
      Service Level Agreementsh.incidentId || null,
      Service Level Agreementsh.timestamp,
      Service Level Agreementsh.blockNumber,
      Service Level Agreementsh.transactionHash,
      Service Level Agreementsh.fundsToRewards,
      Service Level Agreementsh.fundsToInsurance,
    ];

    return this.executeQuery(query, values);
  }

  /**
   * Get reporter statistics
   */
  async getReporterStats(address) {
    const query = `
      SELECT * FROM reporter_stats
      WHERE reporter_address = $1
    `;

    const result = await this.executeQuery(query, [address.toLowerCase()]);
    return result.rows[0] || null;
  }

  /**
   * Get incident details with all related data
   */
  async getIncidentDetails(incidentId) {
    const query = `
      SELECT 
        i.*,
        json_agg(json_build_object(
          'id', ie.id,
          'eventType', ie.event_type,
          'timestamp', ie.timestamp,
          'data', ie.event_data
        )) FILTER (WHERE ie.id IS NOT NULL) as events,
        json_agg(DISTINCT json_build_object(
          'submittedBy', ia.submitted_by,
          'ipfsHash', ia.ipfs_hash,
          'fileType', ia.file_type,
          'description', ia.description
        )) FILTER (WHERE ia.id IS NOT NULL) as attachments
      FROM incidents i
      LEFT JOIN incident_events ie ON i.id = ie.incident_id
      LEFT JOIN incident_attachments ia ON i.id = ia.incident_id
      WHERE i.incident_id = $1
      GROUP BY i.id
    `;

    const result = await this.executeQuery(query, [incidentId]);
    return result.rows[0] || null;
  }

  /**
   * Get recent incidents with pagination
   */
  async getRecentIncidents(limit = 20, offset = 0, chainId = null) {
    let query = `
      SELECT 
        id, incident_id, reporter_address, chain_id, chain_name,
        incident_type, severity, timestamp, status, detection_latency_ms,
        resolved_at, created_at
      FROM incidents
    `;

    const params = [];

    if (chainId) {
      query += ` WHERE chain_id = $${params.length + 1}`;
      params.push(chainId);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    return this.executeQuery(query, params);
  }

  /**
   * Get incidents by reporter
   */
  async getIncidentsByReporter(reporterAddress, limit = 20, offset = 0) {
    const query = `
      SELECT 
        id, incident_id, chain_id, chain_name, incident_type, severity,
        timestamp, status, detection_latency_ms, created_at
      FROM incidents
      WHERE reporter_address = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    return this.executeQuery(query, [reporterAddress.toLowerCase(), limit, offset]);
  }

  /**
   * Get chain statistics
   */
  async getChainStats(chainId = null) {
    let query = `
      SELECT 
        chain_id,
        chain_name,
        COUNT(*) as total_incidents,
        SUM(CASE WHEN severity >= 4 THEN 1 ELSE 0 END) as high_severity_incidents,
        AVG(CASE WHEN resolved_at IS NOT NULL THEN (resolved_at - timestamp) ELSE NULL END) as avg_resolution_time,
        AVG(detection_latency_ms) as avg_detection_latency,
        COUNT(DISTINCT reporter_address) as active_reporters,
        MAX(timestamp) as last_incident_time
      FROM incidents
    `;

    const params = [];

    if (chainId) {
      query += ` WHERE chain_id = $1`;
      params.push(chainId);
    }

    query += ` GROUP BY chain_id, chain_name ORDER BY total_incidents DESC`;

    return this.executeQuery(query, params);
  }

  /**
   * Get global metrics
   */
  async getGlobalMetrics() {
    const query = `
      SELECT 
        COUNT(*) as total_incidents,
        (SELECT COUNT(*) FROM health_reports) as total_reports,
        COUNT(DISTINCT reporter_address) as total_reporters,
        COALESCE(SUM(CASE WHEN severity >= 4 THEN 1 ELSE 0 END), 0) as high_severity_incidents,
        AVG(CASE WHEN resolved_at IS NOT NULL THEN (resolved_at - timestamp) ELSE NULL END) as avg_resolution_time,
        COUNT(DISTINCT chain_id) as unique_chains,
        COALESCE((SELECT SUM(amount) FROM reward_claims), 0) as total_rewards_distributed,
        COALESCE((SELECT SUM(Service Level Agreementsh_amount) FROM Service Level Agreementshing_events), 0) as total_Service Level Agreementshed
      FROM incidents
    `;

    const result = await this.executeQuery(query, []);
    return result.rows[0] || null;
  }

  /**
   * Get reporter leaderboard
   */
  async getReporterLeaderboard(limit = 100, offset = 0) {
    const query = `
      SELECT 
        reporter_address,
        total_reports,
        accurate_reports,
        false_reports,
        accuracy_percentage,
        total_rewards_earned,
        reputation_score,
        status
      FROM reporter_stats
      WHERE status = 'ACTIVE'
      ORDER BY reputation_score DESC, accuracy_percentage DESC
      LIMIT $1 OFFSET $2
    `;

    return this.executeQuery(query, [limit, offset]);
  }

  /**
   * Get daily statistics
   */
  async getDailyStats(date = null) {
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }

    const query = `
      SELECT * FROM daily_stats
      WHERE stat_date = $1
    `;

    const result = await this.executeQuery(query, [date]);
    return result.rows[0] || null;
  }

  /**
   * Get dispute information
   */
  async getDispute(disputeId) {
    const query = `
      SELECT 
        d.*,
        json_agg(json_build_object(
          'validator', vv.validator_address,
          'vote', vv.vote_direction,
          'timestamp', vv.vote_timestamp,
          'reward', vv.reward_received
        )) FILTER (WHERE vv.id IS NOT NULL) as votes
      FROM disputes d
      LEFT JOIN validator_votes vv ON d.dispute_id = vv.dispute_id
      WHERE d.dispute_id = $1
      GROUP BY d.id
    `;

    const result = await this.executeQuery(query, [disputeId]);
    return result.rows[0] || null;
  }

  /**
   * Search incidents (basic text search)
   */
  async searchIncidents(query, limit = 20, offset = 0) {
    const searchQuery = `
      SELECT 
        id, incident_id, reporter_address, chain_id, chain_name,
        incident_type, severity, timestamp, status, created_at
      FROM incidents
      WHERE 
        incident_type ILIKE $1 OR
        chain_name ILIKE $1 OR
        resolution ILIKE $1 OR
        CAST(severity AS TEXT) = $2
      ORDER BY timestamp DESC
      LIMIT $3 OFFSET $4
    `;

    const params = [`%${query}%`, query, limit, offset];
    return this.executeQuery(searchQuery, params);
  }

  /**
   * Execute query with stats tracking
   */
  async executeQuery(queryString, params = []) {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(queryString, params);
      const duration = Date.now() - startTime;

      this.queryStats.total++;
      this.queryStats.successful++;
      this.queryStats.totalDuration += duration;

      if (duration > 1000) {
        console.warn(chalk.yellow(`Slow query (${duration}ms):`), queryString.substring(0, 50));
      }

      return result;
    } catch (err) {
      this.queryStats.total++;
      this.queryStats.failed++;
      console.error(chalk.red('Database query error:'), err.message);
      throw err;
    }
  }

  /**
   * Get query performance stats
   */
  getStats() {
    const avgDuration = this.queryStats.successful > 0
      ? (this.queryStats.totalDuration / this.queryStats.successful).toFixed(2)
      : 0;

    return {
      ...this.queryStats,
      avgDuration: `${avgDuration}ms`,
      successRate: this.queryStats.total > 0
        ? `${((this.queryStats.successful / this.queryStats.total) * 100).toFixed(2)}%`
        : 'N/A',
    };
  }

  /**
   * Close connection pool
   */
  async close() {
    try {
      await this.pool.end();
      console.log(chalk.green('PostgreSQL connection pool closed'));
    } catch (err) {
      console.error(chalk.red('Error closing PostgreSQL pool:'), err);
    }
  }
}

module.exports = PostgresAnalyticsService;
