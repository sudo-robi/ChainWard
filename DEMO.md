# ChainWard V3.0: Autonomous Incident Command Demo

## 🎯 Goal
Demonstrate how ChainWard detects, validates, and **automatically repairs** an Orbit chain failure while managing operator economic incentives—all in one atomic workflow.

---

## 🏗️ Pre-Demo Setup
1. **Frontend**: Launch at `http://localhost:3000`
2. **Wallet**: Connect MetaMask to **Arbitrum Sepolia**.
3. **Contracts**: Ensure `V3.0 stack` is synchronized via `node config/sync-env.js`.

---

## 🎭 The Demo Flow (8–10 Minutes)

### 1) The Command Center Overview (1 min)
*   **Show**: The Dashboard Home.
*   **Explain**: This is the "Safety Control Room". We monitor block times, sequencer health, and permanent audit trails.
*   **Action**: Click the **Theme Toggle** 🌙/☀️ to show UI polish and Accessibility.

### 2) Economic Health: The Bond Layer (2 min)
*   **Navigate**: **Operator Management** tab.
*   **Show**: The "Safety Deposit" system.
*   **Action (Button Tour)**:
    *   `Connect Wallet`: Log in via MetaMask.
    *   `Deposit`: Stake 0.01 ETH to become an "Active" reporter.
    *   `Admin: Inject Yield`: Show how the system rewards reliable operators over time.
    *   `Claim`: Click the green "Claim" badge on **Yield Accrued** to withdraw earnings.
    *   *Value*: We align financial success with network reliability.

### 3) Triggering the Autonomous Loop (3 min)
*   **Navigate**: **Simulate Incident** panel.
*   **Action**: 
    1. Select **Priority P1 (Critical)**.
    2. Click `⚠ Simulate Block Lag`.
*   **Watch**: The "Live Execution Log" terminal. Observe the transaction being signed and confirmed.
*   **Observe**: The `Audit Trail` automatically updates with a new incident.
*   **Highlight**: The **⚡ AUTO-MITIGATED** badge appearing next to the incident!

### 4) Deep-Dive: Forensic Analysis (1.5 min)
*   **Action**: Click `View Analysis` on the new incident in the **Incident History**.
*   **Show**: The **Forensic Timeline**.
*   **Explain**: This isn't just a log; it's an on-chain receipt of every millisecond of the failure and recovery.
*   **Observe**: The sequence: *Detection -> Trigger -> Execution -> Success*.

### 5) Governance & Overrides (1.5 min)
*   **Navigate**: **Response & Governance** panel.
*   **Action (Button Tour)**:
    *   `Update Thresholds`: Show how we can change safety limits (e.g., max block lag) on the fly without updating code.
    *   `Validate Incident`: Show how a human validator can verify the automated response.
    *   `Resolve Latest Incident`: Perform the final manual "All Clear" to close the case.
*   **Advanced Actions**: Point out `Pause Sequencer` and `Trigger Failover`—the "Nuclear Options" available to admins.

### 6) Closing (1 min)
*   **Navigate**: **Analytics Dashboard**.
*   **Show**: The "Autonomy Score" and "Security Metrics".
*   **Action**: Click `Refresh Metrics` and `Export CSV`.
*   **Final Pitch**: ChainWard doesn't just watch your network; it protects it automatically, earns you money for being reliable, and proves everything on-chain.

---

## ⚡ The "Wow" Moments
- **The Atomic Log**: Showing 11 logs produced in a single transaction path.
- **The Green Badge**: Seeing "⚡ AUTO-MITIGATED" appear without clicking anything.
- **The Claimable Yield**: Withdrawing real (testnet) ETH rewards for uptime.
