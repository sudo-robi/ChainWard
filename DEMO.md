# ChainWard Demo Script

## Goal
Show end-to-end monitoring, incident workflow, and recovery actions.

## Pre-Demo Checklist
- Frontend running: `npm -C Frontend run dev`
- RPC configured in `Frontend/.env.local`
- `NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS` set
- Optional: wallet connected for write actions

## Demo Flow (10–12 min)

### 1) Product overview (1 min)
- What ChainWard is: multi-chain incident command center for Orbit chains.
- Value: detect → validate → respond fast with on-chain auditability.

### 2) Dashboard tour (2 min)
- Open `/` dashboard.
- Highlight:
  - **Chain Health**: status, block time, sequencer, L1 batch.
  - **Audit Trail**: incident list and filtering.
  - **Incident Lifecycle**: stages of detection to response.

### 3) Fleet status (1–2 min)
- Show **Multi‑Chain Dashboard**.
- Explain how registry + monitor contracts power chain discovery.
- If no chains: show fallback + explain registration flow.

### 4) Analytics (1–2 min)
- Open **Real‑Time Analytics**.
- Explain MTTR, uptime, incident frequency, distribution.
- Click **Refresh** and **Export** (CSV) to show data pipeline.

### 5) Response actions (2–3 min)
- Go to **Response and Governance**.
- Walk through actions: Pause Sequencer, Trigger Failover, Resolve.
- If wallet connected: show transaction flow (no need to execute).

### 6) Simulate Incident (2 min)
- Use **Simulate Incident**.
- Trigger “Block Lag” or “Sequencer Stall”.
- Show updates in Audit Trail / Lifecycle (if backend wired).

### 7) Close (1 min)
- Recap: fast detection, coordinated response, on‑chain accountability.
- Transition to pitch (ROI + differentiation).

## Contingencies
- If RPC rate‑limited: explain throttling and switch to private RPC.
- If analytics missing: check `NEXT_PUBLIC_INCIDENT_MANAGER_ADDRESS`.
- If no data: emphasize demo mode and walk through UI.

## One‑liner to close
“ChainWard turns incident response into a measurable, auditable, on‑chain workflow—so operators react faster and regulators trust the record.”
