"""
Redis Caching Layer for ChainWard
Provides fast RPC response caching &query result caching
Reduces on-chain queries &improves dashboard responsiveness
"""

class RedisCache:
    """Distributed caching layer for RPC &query results"""
    
    # Key TTLs (seconds)
    TTL_RPC_RESPONSE = 60  # RPC responses cached for 1 minute
    TTL_REPORTER_STATS = 300  # Reporter stats cached for 5 minutes
    TTL_INCIDENT_SUMMARY = 60  # Incident summaries for 1 minute
    TTL_CHAIN_METRICS = 300  # Chain metrics for 5 minutes
    TTL_REWARD_POOL = 120  # Reward pool status for 2 minutes
    TTL_HEALTH_STATUS = 30  # Health status for 30 seconds (most dynamic)
    
    # Cache key patterns
    KEY_RPC_CALL = "rpc:{method}:{params_hash}"
    KEY_REPORTER = "reporter:{address}"
    KEY_REPORTER_STATS = "reporter_stats:{address}"
    KEY_INCIDENT = "incident:{incident_id}"
    KEY_INCIDENTS_BY_CHAIN = "incidents:chain:{chain_id}:page:{page}"
    KEY_INCIDENTS_LATEST = "incidents:latest:{count}"
    KEY_INCIDENT_SUMMARY = "incident_summary:{incident_id}"
    KEY_CHAIN_HEALTH = "chain:health:{chain_id}"
    KEY_CHAIN_METRICS = "chain:metrics:{chain_id}"
    KEY_GLOBAL_METRICS = "global:metrics"
    KEY_REWARD_POOL = "reward:pool:{contract_address}"
    KEY_DISPUTE = "dispute:{dispute_id}"
    KEY_SEARCH_INCIDENTS = "search:incidents:{query}:page:{page}"
    KEY_DASHBOARD_STATS = "dashboard:stats"
    KEY_REPORTER_LEADERBOARD = "leaderboard:reporters:page:{page}"
    KEY_CHAIN_LEADERBOARD = "leaderboard:chains"

    @staticmethod
    def build_rpc_key(method: str, params: dict) -> str:
        """Build cache key for RPC call with params hash"""
        import hashlib
        params_str = json.dumps(params, sort_keys=True)
        params_hash = hashlib.md5(params_str.encode()).hexdigest()
        return f"rpc:{method}:{params_hash}"

# RPC Response Caching Strategy
RPC_CACHE_STRATEGY = {
    # Expensive read-only calls to cache
    "eth_call": {
        "ttl": 60,
        "methods": [
            "getChainConfig",
            "getReporterStats",
            "getIncidentDetails",
            "getRewardPool",
            "getChainHealth",
        ]
    },
    
    # State queries that don't change frequently
    "eth_getLogs": {
        "ttl": 300,
        "cache_on": ["IncidentReported", "HealthReported"],
        "max_results": 1000
    },
    
    # Block-based queries (safe to cache per block)
    "eth_getBlockByNumber": {
        "ttl": 3600,  # 1 hour
        "cache_by_block_hash": True
    },
    
    # Account state (cache but invalidate on new block)
    "eth_getBalance": {
        "ttl": 15,  # 15 seconds (very short)
        "invalidate_on_new_block": True
    }
}

# Query Result Caching Strategy
QUERY_CACHE_STRATEGY = {
    "reporter_stats": {
        "ttl": 300,
        "invalidate_on": ["RewardClaimed", "Service Level AgreementshedFundsAdded"],
        "batch_size": 50
    },
    
    "incident_summary": {
        "ttl": 60,
        "invalidate_on": ["IncidentReported", "IncidentResolved", "IncidentEscalated"],
        "includes": ["events", "chains", "evidence", "disputes"]
    },
    
    "chain_metrics": {
        "ttl": 300,
        "invalidate_on": ["IncidentReported"],
        "aggregations": ["total_incidents", "high_severity", "avg_latency", "active_reporters"]
    },
    
    "global_metrics": {
        "ttl": 300,
        "invalidate_on": ["IncidentReported", "RewardClaimed", "Service Level AgreementshedFundsAdded"],
        "aggregations": ["all_chains"]
    },
    
    "reward_pool_status": {
        "ttl": 120,
        "invalidate_on": ["RewardClaimed", "Service Level AgreementshedFundsAdded", "PoolBalanceAdjusted"]
    },
    
    "leaderboard_reporters": {
        "ttl": 600,
        "top_n": 100,
        "sort_by": "reputation_score DESC",
        "includes": ["accuracy", "rewards_earned", "reports_count"]
    },
    
    "recent_incidents": {
        "ttl": 30,
        "count": 20,
        "order": "timestamp DESC",
        "includes": ["reporter", "severity", "status"]
    }
}

# Cache Invalidation Patterns
CACHE_INVALIDATION = {
    "on_incident_reported": [
        "incidents:latest:*",
        "incidents:chain:{chain_id}:*",
        "incident_summary:{incident_id}",
        "chain:metrics:{chain_id}",
        "chain:health:{chain_id}",
        "global:metrics",
        "dashboard:stats",
        "leaderboard:chains",
        "search:incidents:*"
    ],
    
    "on_incident_resolved": [
        "incident_summary:{incident_id}",
        "incidents:latest:*",
        "chain:metrics:{chain_id}",
        "global:metrics",
        "dashboard:stats"
    ],
    
    "on_reward_claimed": [
        "reporter_stats:{address}",
        "reporter:{address}",
        "reward:pool:{contract_address}",
        "leaderboard:reporters:*",
        "global:metrics",
        "dashboard:stats"
    ],
    
    "on_Service Level Agreementshed": [
        "reporter_stats:{address}",
        "reporter:{address}",
        "reward:pool:{contract_address}",
        "global:metrics",
        "leaderboard:reporters:*"
    ],
    
    "on_dispute_resolved": [
        "dispute:{dispute_id}",
        "incident_summary:{incident_id}",
        "reporter_stats:{address}",
        "leaderboard:reporters:*"
    ]
}

# Bloom Filter Strategy (for fast negative lookups)
BLOOM_FILTERS = {
    "active_reporters": {
        "false_positive_rate": 0.01,
        "refresh_interval": 3600,
        "purpose": "Fast check if address is active reporter"
    },
    
    "processed_incidents": {
        "false_positive_rate": 0.001,
        "refresh_interval": 86400,  # 24 hours
        "purpose": "Prevent duplicate processing"
    },
    
    "banned_reporters": {
        "false_positive_rate": 0.001,
        "refresh_interval": 3600,
        "purpose": "Fast rejection of banned addresses"
    }
}

# Circuit Breaker Configuration (for cache failure scenarios)
CIRCUIT_BREAKER = {
    "failure_threshold": 5,  # 5 consecutive failures
    "success_threshold": 3,  # 3 consecutive successes to recover
    "timeout": 30,  # 30 seconds open state
    "half_open_max_requests": 1,
    "metrics_window": 60  # Track failures over 60 seconds
}

# Cache Warming Strategy
CACHE_WARMING = {
    "on_startup": [
        "global:metrics",
        "leaderboard:reporters:page:1",
        "leaderboard:chains",
        "dashboard:stats"
    ],
    
    "on_new_block": [
        "chain:health:{chain_id}",
        "incidents:latest:20",
        "chain:metrics:{active_chain_ids}"
    ],
    
    "periodic_refresh": {
        "interval": 300,  # Every 5 minutes
        "cache_keys": [
            "global:metrics",
            "leaderboard:reporters:page:1",
            "leaderboard:reporters:page:2",
            "dashboard:stats"
        ]
    }
}

# Memory Management
MEMORY_CONFIG = {
    "max_memory_gb": 4,  # Redis max memory
    "eviction_policy": "allkeys-lru",  # Evict least recently used
    "memory_high_threshold_pct": 85,
    "memory_warning_threshold_pct": 75,
    
    # Per-namespace memory limits
    "namespace_limits": {
        "rpc_responses": "500mb",
        "query_results": "1gb",
        "search_index": "1gb",
        "stats_cache": "500mb",
        "temp_data": "500mb"
    }
}
