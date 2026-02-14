# ChainWard v2 — System Architecture Diagram

## High-Level Five-Layer System

```
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 5: ECOSYSTEM RESPONDERS                                        │
│ (Bridges, Vaults, Insurance, Liquidation, Protocols)                │
│                                                                      │
│  Nomad Bridge ──┐                                                    │
│  Stargate ──────┼──► ResponderRegistry.notifyResponders()            │
│  Aave Vault ────┤                                                    │
│  Insurance Pool ┤                                                    │
│  Lido Operator──┘                                                    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                    onIncidentRaised(chainId, severity)
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 4: VALIDATOR REGISTRY (Economic Security)                     │
│                                                                      │
│  Reporter Bond: $10,000 ──┐                                          │
│                           ├──► Dispute Period: 7 days                │
│  Validator Challenge ─────┤                                          │
│                           ├──► Arbitration: 3 days                   │
│  Arbitrator Decision ─────┤                                          │
│                           └──► Service Level Agreementsh/Reward Logic                    │
│                                                                      │
│  Outcome: Reporter Service Level Agreementshed if false, rewarded if true                │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                   recordSignal(reporter, chainId, type)
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 3: CHAIN TYPE REGISTRY (Pluggable Validators)                 │
│                                                                      │
│  Arbitrum Orbit: OrbitValidator                                      │
│    ├─ Checks: sequencer heartbeat, block time                       │
│    ├─ Signals: BLOCK_PRODUCED, STATE_ROOT_CHANGED                   │
│    └─ Thresholds: 2s block time, 10s max lag                       │
│                                                                      │
│  Optimism OP Stack: OPStackValidator                                │
│    ├─ Checks: batch posting, state commitments                      │
│    ├─ Signals: BATCH_POSTED, BATCH_CONFIRMED                       │
│    └─ Thresholds: 30m batch interval, 2h finalization               │
│                                                                      │
│  StarkNet: StarkNetValidator (custom)                               │
│    └─ Extensible to any rollup type                                 │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                  validateSignal(chainId, type, data)
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 2: INCIDENT MANAGER (Permanent Records)                       │
│                                                                      │
│  struct Incident {                                                   │
│    chainId: 42161                                                    │
│    detectedAt: block.timestamp                                       │
│    failureType: SEQUENCER_STALL (enum)                              │
│    severity: CRITICAL (enum)                                         │
│    lastHealthyBlock: 12345                                           │
│    lastHealthyTimestamp: 1707433200                                 │
│    description: "Sequencer unhealthy for 5 minutes"                 │
│  }                                                                   │
│                                                                      │
│  ✅ Immutable on-chain records                                      │
│  ✅ Triggers all responders                                         │
│  ✅ Events for indexing                                             │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                raiseIncident(chainId, type, severity)
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 1: HEALTH REPORTER (Detection Logic)                          │
│                                                                      │
│  submitHealthSignal(chainId, blockNumber, timestamp, sequencerOk)   │
│    ├─ Input validation (block > 0, timestamp > 0)                   │
│    ├─ Block progression check (no reorgs)                           │
│    ├─ Rate limiting (30s minimum between signals)                   │
│    ├─ Threshold comparison                                          │
│    └─ Auto-detect: Block lag, Sequencer stall                      │
│                                                                      │
│  12 Signal Types Available:                                          │
│    BLOCK_PRODUCED, STATE_ROOT_CHANGED, BATCH_POSTED,               │
│    BATCH_CONFIRMED, FRAUD_PROOF_SUBMITTED/ACCEPTED,                │
│    MESSAGE_PASSING, WITHDRAWAL_PROCESSED,                           │
│    GAP_IN_BATCHES, STALE_STATE_ROOT, TXN_CENSORSHIP, MEV_DOMINANCE │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: From Failure to Automated Response

### Scenario: Moonbeam Chain Goes Down

```
T=0:00 ─ OFF-CHAIN
  └─ Sequencer crashes
     └─ No new blocks produced

T=1:00 ─ LAYER 1 (Detection)
  └─ Health reporter submits signal:
     {chainId: 1287, blockNumber: 5000, blockTimestamp: T, sequencerHealthy: false}
     └─ HealthReporter detects: STATE_ROOT_UNCHANGED for > 10 seconds
     └─ Triggers: raiseIncident(chainId=1287, failureType=STALL, severity=CRITICAL)

T=1:05 ─ LAYER 2 (Incident Recording)
  └─ IncidentManager.raiseIncident() called
     └─ Creates on-chain Incident record (immutable)
     └─ Emits event: IncidentRaised(chainId=1287, severity=CRITICAL)
     └─ Calls: responderRegistry.notifyResponders(1287, STALL, CRITICAL)

T=1:10 ─ LAYER 3 (Validation)
  └─ ValidatorRegistry validates signal
     └─ Reporter bond locked ($10,000 at risk)
     └─ 7-day dispute window opens
     └─ Anyone can challenge for $10,000 stake

T=1:15 ─ LAYER 5 (Automated Response)
  └─ ResponderRegistry calls all responders:
     
     Nomad Bridge.onIncidentRaised(1287, STALL, CRITICAL)
       └─ Returns: true (can respond)
       └─ AUTO-PAUSES withdrawals from Moonbeam ✅
     
     Aave Vault.onIncidentRaised(1287, STALL, CRITICAL)
       └─ Returns: true (can respond)
       └─ HALTS deposits from Moonbeam ✅
     
     Insurance Pool.onIncidentRaised(1287, STALL, CRITICAL)
       └─ Returns: true (can respond)
       └─ TRIGGERS emergency payout ✅

T=1:20 ─ RESULT
  ✅ Nomad Bridge: PAUSED (zero loss)
  ✅ Aave Vault: HALTED (user funds safe)
  ✅ Insurance: PAID (users compensated)
  ✅ On-chain proof: For arbitration, post-mortems, refunds

WITHOUT CHAINWARD:
  ❌ T=5:00: Bridge finally detects via Nomad monitors
  ❌ T=5:30: Bridge paused (too late)
  ❌ T=5:31: Attacker has stolen $190M
  ❌ No on-chain proof for insurance claims
```

---

## Economic Incentive Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ REPORTER (wants to earn money)                                  │
│                                                                 │
│ 1. Posts $10,000 bond (USDC)                                   │
│ 2. Submits 100 signals over 3 months                           │
│ 3. 95% are correct, 5% are false                              │
│                                                                 │
│ Revenue:                                                        │
│   - 95 correct: 5% reward = $475 per signal = $45,125         │
│   - 5 false: lose $2,500 each = -$12,500                      │
│   = Net: +$32,625 (326% ROI in 3 months!)                     │
│                                                                 │
│ Incentive: "Be accurate or lose money"                         │
└─────────────────────────────────────────────────────────────────┘
                        ▲
                        │ stakes bond
                        │
┌─────────────────────────────────────────────────────────────────┐
│ VALIDATOR (wants to catch liars)                                │
│                                                                 │
│ 1. Sees suspicious signal                                      │
│ 2. Stakes $10,000 to challenge                                │
│ 3. Arbitrator reviews data                                     │
│ 4. Validator wins (50% Service Level Agreementsh)                                 │
│                                                                 │
│ Payoff: $5,000 (50% of reporter's Service Level Agreementsh)                      │
│                                                                 │
│ Incentive: "Find liars &earn"                              │
└─────────────────────────────────────────────────────────────────┘
                        ▲
                        │ decides truth
                        │
┌─────────────────────────────────────────────────────────────────┐
│ ARBITRATOR (DAO or Oracle)                                      │
│                                                                 │
│ 1. Reviews disputed signal                                     │
│ 2. Checks on-chain data, timestamps, proofs                   │
│ 3. Votes: "True" or "False"                                   │
│ 4. Gets arbitration fee (from loser's bond)                   │
│                                                                 │
│ Incentive: "Be fair or lose voting power"                     │
│            (DAO governance token at stake)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Chain-Agnostic Validator Architecture

```
IChainValidator (Interface)
  │
  ├── validateSignal(chainId, signalType, data)
  ├── getDefaultThreshold(signalType)
  └── chainType()

  │
  ├─── OrbitValidator
  │    │
  │    ├─ Orbit-specific logic:
  │    │  └─ Checks sequencer heartbeat + block time
  │    │
  │    └─ Supports signals:
  │       BLOCK_PRODUCED (threshold: 2s)
  │       STATE_ROOT_CHANGED (threshold: 10s)
  │       TXN_CENSORSHIP (threshold: any)
  │
  ├─── OPStackValidator
  │    │
  │    ├─ OP Stack-specific logic:
  │    │  └─ Checks batch posting to Ethereum
  │    │
  │    └─ Supports signals:
  │       BATCH_POSTED (threshold: 30m)
  │       BATCH_CONFIRMED (threshold: 2h)
  │
  ├─── StarkNetValidator (custom)
  │    │
  │    ├─ StarkNet-specific logic
  │    │  └─ Checks state commitments
  │    │
  │    └─ Extensible pattern
  │
  └─── Your Custom Validator
       └─ Add any rollup type
          (just implement interface)
```

---

## SignalTypes Hierarchy

```
SignalTypes (12 types total)

├── CORE LIVENESS (Chain producing blocks?)
│   ├── BLOCK_PRODUCED
│   │   └─ Detection: New block within expected time
│   └── STATE_ROOT_CHANGED
│       └─ Detection: VM executing transactions
│
├── FINALITY (Can we trust the chain?)
│   ├── BATCH_POSTED
│   │   └─ Detection: Transactions on L1 (immutable)
│   └── BATCH_CONFIRMED
│       └─ Detection: L1 confirmed batch (finalized)
│
├── VALIDITY PROOF (Is the state correct?)
│   ├── FRAUD_PROOF_SUBMITTED
│   │   └─ Detection: Challenge started
│   └── FRAUD_PROOF_ACCEPTED
│       └─ Detection: STATE ROOT IS WRONG (critical!)
│
├── BRIDGING &EXIT (Can users escape?)
│   ├── MESSAGE_PASSING
│   │   └─ Detection: Cross-chain messages flowing
│   └── WITHDRAWAL_PROCESSED
│       └─ Detection: Users successfully exited
│
└── ANOMALIES (What's degraded?)
    ├── GAP_IN_BATCHES
    │   └─ Detection: Sequencer disappeared
    ├── STALE_STATE_ROOT
    │   └─ Detection: No contract execution
    ├── TXN_CENSORSHIP
    │   └─ Detection: Public txns hidden
    └── MEV_DOMINANCE
        └─ Detection: Abnormal MEV extraction
```

---

## Responder Action Matrix

```
Severity    Response Type              Action
────────    ─────────────────────────  ──────────────────────────
WARNING     Info only                  Log event, notify DAO

CRITICAL    Auto-pause bridges         Pause withdrawals from chain
            Auto-halt vaults           Stop deposits to chain
            Trigger insurance          Pay affected users
            Pause liquidation          Halt liquidation engine
            Alert operators            Send notifications

UNRECOVERABLE  Emergency shutdown      Full system halt on chain
               Chain wipe recovery     Activate recovery protocol
               DAO governance vote     Hard fork decision
```

---

## Security Layers

```
┌─────────────────────────────────────┐
│ INPUT VALIDATION (Prevent bad data) │
│ ✅ Block numbers must be > 0        │
│ ✅ Timestamps must be > 0           │
│ ✅ Details string must have content │
│ ✅ Chain must be registered         │
└─────────────────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│ BLOCK PROGRESSION (Detect reorgs)   │
│ ✅ Block number must increase       │
│ ✅ Timestamp cannot decrease        │
│ ✅ Prevents Sybil attacks           │
└─────────────────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│ RATE LIMITING (Prevent spam)        │
│ ✅ 30s minimum between signals      │
│ ✅ Per-chain rate limiting          │
│ ✅ Cooldown between incidents       │
└─────────────────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│ SIGNATURE VALIDATION (If using Oracle)
│ ✅ Verify reporter signed message   │
│ ✅ Check timestamp freshness        │
└─────────────────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│ RESPONDER ERROR HANDLING            │
│ ✅ Try-catch on all responder calls │
│ ✅ One responder failure ≠ all fail │
│ ✅ Track repeated failures          │
└─────────────────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│ ECONOMIC SECURITY (Service Level Agreementsh bonds)     │
│ ✅ False signals = lose money       │
│ ✅ 7-day dispute window             │
│ ✅ Arbitrator override              │
└─────────────────────────────────────┘
```

---

## Deployment Architecture

```
TESTNET PHASE (Week 1-2)
├── Deploy to Arbitrum Sepolia
├── Deploy to Optimism Sepolia  
├── Deploy to Base Sepolia
└── Test all layers locally

ALPHA PHASE (Week 3-4)
├── Deploy to Arbitrum One (testnet chain)
├── Integrate test bridge (pause manually)
├── Integrate test vault (pause manually)
└── Manual testing of entire flow

BETA PHASE (Month 2)
├── Security audit (Trail of Bits)
├── DAO setup for arbitration
├── Community reporter registration
└── Real bridge integration begins

MAINNET PHASE (Month 3+)
├── Deploy to Arbitrum One (main)
├── Real bridges go live
├── Mainnet reporters onboarded
└── Full economic model active
```

---

## Comparison: Without vs With ChainWard

```
Scenario: Orbit Chain Fails

WITHOUT CHAINWARD:
T=0:00   Chain fails
T=5:00   Off-chain monitoring detects
T=10:00  Manual alerts sent
T=15:00  Bridges manually paused
T=20:00  Users first learn of problem
Result:  $50M-$190M loss possible

WITH CHAINWARD:
T=0:00   Chain fails
T=1:00   On-chain signal submitted
T=1:10   Incident raised on-chain
T=1:15   Bridges auto-pause (zero loss!)
T=1:20   Insurance auto-pays (users compensated)
Result:  $0 loss, $0 cascade, users protected
```

---

**This architecture prevents $100M+ losses while creating a sustainable economic model for L2 reliability.**
