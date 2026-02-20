# ChainWard V3.0: 10-Minute Interactive Demo Script

This script is synchronized with the **10-Minute Technical Pitch**. Perform the actions while speaking the corresponding narrative sections.

| Time | Segment | Talk Summary | Interactive Action |
|:---:|:---|:---|:---|
| **0:00** | **The Hook** | Introduction to the infrastructure crisis and ChainWard's vision. | Open `https://chain-ward-man.vercel.app/`. Toggle **Dark Mode**. Point to the **Security Status** banner. |
| **1:30** | **The Problem** | Explain why current tools (SRE/Slack alerts) are too slow for DeFi. | Scroll through **Chain Health** (Block Time, Sequencer). Hover over **Incident History** badges. |
| **3:00** | **Architecture** | Walk through the tiers: Signal, Orchestration, and Execution. | Navigate to **Multi-Chain Dashboard**. Show the registry discovery. Open **Real-Time Analytics**. |
| **5:00** | **The Simulation**| Trigger a critical failure and watch the autonomous response loop. | Go to **Simulate Incident**. Select **P1**. Click `⚠ Simulate Block Lag`. Show the transaction confirmed in the **Live terminal log**. |
| **6:00** | **Autonomy Proof**| Demonstrate the transition from "Problem" to "Fix" on Arbiscan. | Verify the **⚡ AUTO-MITIGATED** badge. Click **Inspect (TX)** to show the atomic logs (11 steps). |
| **7:00** | **The Forensics**| Deep-dive into the incident timeline and atomic on-chain record. | Click **View Analysis** on the incident. Walk through the **Forensic Timeline** steps visually. |
| **8:00** | **Economic Layer**| Show how bonds and yield accrue for reliable node operators. | Go to **Operator Management**. **Connect Wallet**. Click **Admin: Inject Yield**, wait for feedback, then click **Claim**. |
| **9:00** | **Governance** | Tuning the system's sensitivity and the human-in-the-loop override. | Go to **Response & Governance**. Change a threshold. Click **Update Thresholds**. Click **Resolve Latest Incident**. |
| **9:45** | **Conclusion** | Final pitch on the "Self-Healing Network" and Autonomy Score. | Return to **Home Dashboard**. Highlight the "Security Autonomy" metric. Final wave/close. |

---

### 💡 Presentation Guide
- **Pace**: Don't rush the simulation. Let the terminal logs build tension before showing the success badge.
- **Deep Links**: When moving between tabs, explain *why* (e.g., "Now that we see the failure, let's look at the incentives that drive the fix").
- **Inspect**: If using Arbiscan, highlight the `IncidentResponseTriggered` event specifically.
