"""
PostgreSQL Analytics Schema for ChainWard Data Persistence
Provides long-term storage, complex queries, &analytics capabilities
"""

-- Incidents Table
CREATE TABLE incidents (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT UNIQUE NOT NULL,
  reporter_address VARCHAR(42) NOT NULL,
  chain_id BIGINT NOT NULL,
  chain_name VARCHAR(100) NOT NULL,
  incident_type VARCHAR(50) NOT NULL, -- BLOCK_LAG, SEQUENCER_STALL, STATE_ROOT_CHANGED
  severity INT NOT NULL, -- 1-5 scale
  timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REPORTED', -- REPORTED, ESCALATED, RESOLVED
  resolution VARCHAR(500),
  detection_latency_ms BIGINT NOT NULL,
  resolved_at BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ipfs_evidence_hash VARCHAR(100),
  INDEX idx_reporter (reporter_address),
  INDEX idx_chain (chain_id),
  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_severity (severity),
  INDEX idx_status (status)
);

-- Incident Events (Audit Trail)
CREATE TABLE incident_events (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id),
  event_type VARCHAR(50) NOT NULL, -- SUBMITTED, ESCALATED, RESOLVED, DISPUTED, APPEALED
  event_data JSON NOT NULL,
  timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_incident (incident_id),
  INDEX idx_event_type (event_type),
  INDEX idx_timestamp (timestamp DESC)
);

-- Health Reports (Raw Monitoring Data)
CREATE TABLE health_reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_address VARCHAR(42) NOT NULL,
  chain_id BIGINT NOT NULL,
  chain_name VARCHAR(100) NOT NULL,
  block_number BIGINT NOT NULL,
  block_time BIGINT NOT NULL,
  report_timestamp BIGINT NOT NULL,
  block_lag_ms BIGINT,
  sequencer_latency_ms BIGINT,
  state_root VARCHAR(66),
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  is_anomaly BOOLEAN DEFAULT FALSE,
  anomaly_type VARCHAR(50),
  anomaly_severity INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reporter (reporter_address),
  INDEX idx_chain (chain_id),
  INDEX idx_is_anomaly (is_anomaly),
  INDEX idx_report_timestamp (report_timestamp DESC),
  INDEX idx_chain_block (chain_id, block_number)
);

-- Reporter Statistics
CREATE TABLE reporter_stats (
  id BIGSERIAL PRIMARY KEY,
  reporter_address VARCHAR(42) UNIQUE NOT NULL,
  total_reports BIGINT DEFAULT 0,
  accurate_reports BIGINT DEFAULT 0,
  false_reports BIGINT DEFAULT 0,
  accuracy_percentage DECIMAL(5,2) DEFAULT 0.00,
  total_rewards_earned DECIMAL(30,18) DEFAULT 0,
  total_Service Level Agreementshed DECIMAL(30,18) DEFAULT 0,
  last_report_time BIGINT,
  joined_at BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, BANNED
  reputation_score INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reputation (reputation_score DESC),
  INDEX idx_accuracy (accuracy_percentage DESC)
);

-- Reward Claims andDistribution
CREATE TABLE reward_claims (
  id BIGSERIAL PRIMARY KEY,
  reporter_address VARCHAR(42) NOT NULL,
  amount DECIMAL(30,18) NOT NULL,
  claim_type VARCHAR(50) NOT NULL, -- ACCURATE_REPORT, SEVERITY_BONUS, MULTI_CHAIN, FAST_RESPONSE
  incident_id BIGINT REFERENCES incidents(id),
  claim_timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reporter (reporter_address),
  INDEX idx_claim_type (claim_type),
  INDEX idx_claimed (claimed),
  INDEX idx_claim_timestamp (claim_timestamp DESC)
);

-- Service Level Agreementshing Events
CREATE TABLE Service Level Agreementshing_events (
  id BIGSERIAL PRIMARY KEY,
  reporter_address VARCHAR(42) NOT NULL,
  Service Level Agreementsh_amount DECIMAL(30,18) NOT NULL,
  reason VARCHAR(200) NOT NULL, -- FALSE_REPORT, MALICIOUS_EVIDENCE, APPEAL_LOST
  incident_id BIGINT REFERENCES incidents(id),
  timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  funds_to_rewards DECIMAL(30,18),
  funds_to_insurance DECIMAL(30,18),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reporter (reporter_address),
  INDEX idx_timestamp (timestamp DESC)
);

-- Dispute Records
CREATE TABLE disputes (
  id BIGSERIAL PRIMARY KEY,
  dispute_id BIGINT UNIQUE NOT NULL,
  incident_id BIGINT NOT NULL REFERENCES incidents(id),
  challenger_address VARCHAR(42) NOT NULL,
  reporter_address VARCHAR(42) NOT NULL,
  status VARCHAR(20) NOT NULL, -- PENDING, EVIDENCE_PHASE, VOTING, RESOLVED, APPEALED
  outcome VARCHAR(30), -- REPORTER_CORRECT, REPORTER_INCORRECT, INCONCLUSIVE
  filed_at BIGINT NOT NULL,
  resolved_at BIGINT,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_incident (incident_id),
  INDEX idx_reporter (reporter_address),
  INDEX idx_challenger (challenger_address),
  INDEX idx_status (status),
  INDEX idx_filed_at (filed_at DESC)
);

-- Validator Participation
CREATE TABLE validator_votes (
  id BIGSERIAL PRIMARY KEY,
  dispute_id BIGINT NOT NULL REFERENCES disputes(dispute_id),
  validator_address VARCHAR(42) NOT NULL,
  vote_direction INT NOT NULL, -- 1=Reporter Correct, 0=Reporter Incorrect
  vote_timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  reward_received DECIMAL(30,18) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dispute (dispute_id),
  INDEX idx_validator (validator_address),
  INDEX idx_vote_timestamp (vote_timestamp DESC)
);

-- Chain Metrics
CREATE TABLE chain_metrics (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  chain_name VARCHAR(100) NOT NULL,
  total_incidents BIGINT DEFAULT 0,
  high_severity_incidents BIGINT DEFAULT 0,
  avg_resolution_time_seconds BIGINT,
  avg_detection_latency_ms BIGINT,
  active_reporters BIGINT DEFAULT 0,
  last_incident_time BIGINT,
  total_rewards_distributed DECIMAL(30,18) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chain_id),
  INDEX idx_chain (chain_id)
);

-- Daily Aggregated Statistics
CREATE TABLE daily_stats (
  id BIGSERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  incidents_reported BIGINT DEFAULT 0,
  reports_submitted BIGINT DEFAULT 0,
  accurate_reports BIGINT DEFAULT 0,
  false_reports BIGINT DEFAULT 0,
  rewards_distributed DECIMAL(30,18) DEFAULT 0,
  total_Service Level Agreementshed DECIMAL(30,18) DEFAULT 0,
  active_reporters BIGINT DEFAULT 0,
  unique_chains BIGINT DEFAULT 0,
  avg_incident_severity DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (stat_date DESC)
);

-- Global System Metrics
CREATE TABLE global_metrics (
  id BIGSERIAL PRIMARY KEY,
  total_incidents BIGINT DEFAULT 0,
  total_reports BIGINT DEFAULT 0,
  total_reporters BIGINT DEFAULT 0,
  total_validators BIGINT DEFAULT 0,
  total_rewards_distributed DECIMAL(30,18) DEFAULT 0,
  total_Service Level Agreementshed DECIMAL(30,18) DEFAULT 0,
  total_chains_covered BIGINT DEFAULT 0,
  system_uptime_percentage DECIMAL(5,2),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_updated (last_updated DESC)
);

-- Incident Attachments Metadata
CREATE TABLE incident_attachments (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id),
  submitted_by VARCHAR(42) NOT NULL,
  ipfs_hash VARCHAR(100) NOT NULL,
  file_type VARCHAR(50) NOT NULL, -- logs, screenshot, video, other
  description VARCHAR(500),
  file_size_bytes BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_incident (incident_id),
  INDEX idx_ipfs_hash (ipfs_hash),
  INDEX idx_submitted_by (submitted_by)
);

-- Responder Actions
CREATE TABLE responder_actions (
  id BIGSERIAL PRIMARY KEY,
  responder_address VARCHAR(42) NOT NULL,
  incident_id BIGINT NOT NULL REFERENCES incidents(id),
  action_type VARCHAR(100) NOT NULL, -- pause_sequencer, trigger_failover, notify_validators
  action_status VARCHAR(20) NOT NULL, -- TRIGGERED, EXECUTING, EXECUTED, FAILED
  timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(66) UNIQUE NOT NULL,
  result_message VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_responder (responder_address),
  INDEX idx_incident (incident_id),
  INDEX idx_action_type (action_type),
  INDEX idx_timestamp (timestamp DESC)
);

-- Search Index Triggers (for sync with Elasticsearch)
CREATE TABLE search_sync_queue (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL, -- incident, health_report, reporter, dispute
  entity_id BIGINT NOT NULL,
  operation VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
  synced BOOLEAN DEFAULT FALSE,
  sync_attempts INT DEFAULT 0,
  last_sync_attempt TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_synced (synced),
  INDEX idx_created_at (created_at DESC)
);

-- Create indexes on frequently searched columns
CREATE INDEX idx_incidents_reporter_chain ON incidents(reporter_address, chain_id);
CREATE INDEX idx_incidents_severity_timestamp ON incidents(severity DESC, timestamp DESC);
CREATE INDEX idx_incidents_status_timestamp ON incidents(status, timestamp DESC);
CREATE INDEX idx_health_reports_anomaly ON health_reports(is_anomaly, report_timestamp DESC);
CREATE INDEX idx_reporter_stats_reputation ON reporter_stats(reputation_score DESC, joined_at DESC);
CREATE INDEX idx_reward_claims_reporter_type ON reward_claims(reporter_address, claim_type);
CREATE INDEX idx_disputes_status_filed ON disputes(status, filed_at DESC);
