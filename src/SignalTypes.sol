// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SignalTypes
 * @dev Defines all possible health signals for chain monitoring.
 * These enable detection of different failure modes across Orbit, OP Stack, and other rollups.
 */
library SignalTypes {
    /**
     * @dev Comprehensive signal taxonomy for L2 chain health
     * 
     * Category 1: CORE LIVENESS (Is the chain producing blocks?)
     *   - BLOCK_PRODUCED: New L2 block created within expected time
     *   - STATE_ROOT_CHANGED: State progressing (vm.calldata applied)
     * 
     * Category 2: FINALITY (Are L2 txns becoming irreversible?)
     *   - BATCH_POSTED: Sequencer posted to L1
     *   - BATCH_CONFIRMED: Batch confirmed on L1 (can't be reverted)
     * 
     * Category 3: VALIDITY PROOF (Can we trust the state root?)
     *   - FRAUD_PROOF_SUBMITTED: Fraud proof entered for review
     *   - FRAUD_PROOF_ACCEPTED: Fraud proof accepted (state root is wrong!)
     * 
     * Category 4: BRIDGING & EXIT (Can users escape?)
     *   - MESSAGE_PASSING: Cross-chain messages flowing normally
     *   - WITHDRAWAL_PROCESSED: Users successfully exited to L1
     * 
     * Category 5: ANOMALIES & DEGRADATION (What went wrong?)
     *   - GAP_IN_BATCHES: No batch posted for >N time
     *   - STALE_STATE_ROOT: State root unchanged for >N time
     *   - TXN_CENSORSHIP: Public txns not included in blocks
     *   - MEV_DOMINANCE: Sequencer extracting abnormal MEV
     */
    enum SignalType {
        // Category 1: Core Liveness
        BLOCK_PRODUCED,           // uint8(0)
        STATE_ROOT_CHANGED,       // uint8(1)
        
        // Category 2: Finality
        BATCH_POSTED,             // uint8(2)
        BATCH_CONFIRMED,          // uint8(3)
        
        // Category 3: Validity Proof
        FRAUD_PROOF_SUBMITTED,    // uint8(4)
        FRAUD_PROOF_ACCEPTED,     // uint8(5)
        
        // Category 4: Bridging & Exit
        MESSAGE_PASSING,          // uint8(6)
        WITHDRAWAL_PROCESSED,     // uint8(7)
        
        // Category 5: Anomalies
        GAP_IN_BATCHES,           // uint8(8)
        STALE_STATE_ROOT,         // uint8(9)
        TXN_CENSORSHIP,           // uint8(10)
        MEV_DOMINANCE             // uint8(11)
    }

    /**
     * @dev Severity levels for incidents
     * Responders use this to decide action:
     *   WARNING: Log but don't act
     *   CRITICAL: Pause all operations immediately
     *   UNRECOVERABLE: Emergency shutdown protocol
     */
    enum Severity {
        WARNING,                  // uint8(0) - Degraded but functional
        CRITICAL,                 // uint8(1) - Broken, pause required
        UNRECOVERABLE             // uint8(2) - Chain fork/wipe, restart needed
    }

    /**
     * @dev Signal metadata
     */
    struct SignalMetadata {
        string name;              // "BLOCK_PRODUCED"
        string category;          // "CORE_LIVENESS"
        string description;       // Full text description
        bool requiresProof;       // Can be spoofed easily?
        uint256 defaultThreshold; // Typical threshold value
    }

    /**
     * @dev Get metadata for a signal type
     */
    function getMetadata(SignalType signal) 
        internal 
        pure 
        returns (SignalMetadata memory) 
    {
        if (signal == SignalType.BLOCK_PRODUCED) {
            return SignalMetadata({
                name: "BLOCK_PRODUCED",
                category: "CORE_LIVENESS",
                description: "New L2 block created within expected block time interval",
                requiresProof: false,
                defaultThreshold: 2 seconds // typically 2s for Arbitrum
            });
        }
        if (signal == SignalType.STATE_ROOT_CHANGED) {
            return SignalMetadata({
                name: "STATE_ROOT_CHANGED",
                category: "CORE_LIVENESS",
                description: "State root (root hash of all account balances) has progressed",
                requiresProof: true,
                defaultThreshold: 10 // seconds, should change every ~10s
            });
        }
        if (signal == SignalType.BATCH_POSTED) {
            return SignalMetadata({
                name: "BATCH_POSTED",
                category: "FINALITY",
                description: "Sequencer posted transaction batch to L1",
                requiresProof: true,
                defaultThreshold: 600 seconds // typically 10 minutes
            });
        }
        if (signal == SignalType.BATCH_CONFIRMED) {
            return SignalMetadata({
                name: "BATCH_CONFIRMED",
                category: "FINALITY",
                description: "L1 confirmed the batch (can't be reorged)",
                requiresProof: true,
                defaultThreshold: 3600 seconds // ~1 hour
            });
        }
        if (signal == SignalType.FRAUD_PROOF_SUBMITTED) {
            return SignalMetadata({
                name: "FRAUD_PROOF_SUBMITTED",
                category: "VALIDITY_PROOF",
                description: "Fraud proof submitted challenging state root",
                requiresProof: true,
                defaultThreshold: 1 // any submission is relevant
            });
        }
        if (signal == SignalType.FRAUD_PROOF_ACCEPTED) {
            return SignalMetadata({
                name: "FRAUD_PROOF_ACCEPTED",
                category: "VALIDITY_PROOF",
                description: "Fraud proof was accepted - state root is WRONG",
                requiresProof: true,
                defaultThreshold: 1 // critical immediately
            });
        }
        if (signal == SignalType.MESSAGE_PASSING) {
            return SignalMetadata({
                name: "MESSAGE_PASSING",
                category: "BRIDGING",
                description: "Cross-chain messages flowing (to/from other chains)",
                requiresProof: true,
                defaultThreshold: 300 seconds // should see messages every 5 min
            });
        }
        if (signal == SignalType.WITHDRAWAL_PROCESSED) {
            return SignalMetadata({
                name: "WITHDRAWAL_PROCESSED",
                category: "BRIDGING",
                description: "User successfully withdrew to L1",
                requiresProof: true,
                defaultThreshold: 600 seconds // someone withdraws every 10 min
            });
        }
        if (signal == SignalType.GAP_IN_BATCHES) {
            return SignalMetadata({
                name: "GAP_IN_BATCHES",
                category: "ANOMALY",
                description: "No transaction batch posted for longer than expected",
                requiresProof: true,
                defaultThreshold: 1200 seconds // >20 min is bad
            });
        }
        if (signal == SignalType.STALE_STATE_ROOT) {
            return SignalMetadata({
                name: "STALE_STATE_ROOT",
                category: "ANOMALY",
                description: "State root unchanged for too long (contracts can't execute)",
                requiresProof: true,
                defaultThreshold: 300 // seconds, ~5 minutes
            });
        }
        if (signal == SignalType.TXN_CENSORSHIP) {
            return SignalMetadata({
                name: "TXN_CENSORSHIP",
                category: "ANOMALY",
                description: "Public transactions not being included in blocks",
                requiresProof: true,
                defaultThreshold: 1 // any censorship is critical
            });
        }
        if (signal == SignalType.MEV_DOMINANCE) {
            return SignalMetadata({
                name: "MEV_DOMINANCE",
                category: "ANOMALY",
                description: "Sequencer extracting abnormal MEV (possible front-running)",
                requiresProof: true,
                defaultThreshold: 5000000 // in wei, adjustable
            });
        }
        
        revert("unknown signal type");
    }

    /**
     * @dev Human-readable name for signal
     */
    function name(SignalType signal) internal pure returns (string memory) {
        return getMetadata(signal).name;
    }

    /**
     * @dev Category grouping
     */
    function category(SignalType signal) internal pure returns (string memory) {
        return getMetadata(signal).category;
    }
}
