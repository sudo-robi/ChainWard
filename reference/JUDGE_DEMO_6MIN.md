0:00 — 0:20 (20s) — Opening: Set the scene
------------------------------------------------
- Show: App header &subtitle (top-left).
- Say (short): "Hello — this is ChainWard, a minimal on-chain incident reporting tool focused on proof &access control." 
- Show: Network dropdown &gear (`Settings`) briefly.
- Say: "In 6 minutes I'll prove this is real Web3: MetaMask must appear, you sign a transaction, &we show a verified on-chain incident ID."

0:20 — 0:50 (30s) — STATE A: Wallet Disconnected → Connect
---------------------------------------------------------
- Show: `Connect Wallet` (top-right or demo area).
- Click: `Connect Wallet`.
- Show: MetaMask popup requesting connection.
- Say: "I'll connect my wallet — MetaMask appears, proving a real wallet interaction." 
- Action: Accept connect prompt in MetaMask.
- Expected: UI shows your account badge.

1:20 — 1:50 (30s) — STATE C: Permission Denied (show on-chain access control)
----------------------------------------------------------------------------
- Switch MetaMask to a non-reporter account.
- Show: Disabled button labeled `Reporter Access Required` &helper text.
- Say: "This address is blocked — reporting is gated by an on-chain REPORTER role. Access control is enforced on the contract, not in the UI." 
- Optional: Click the disabled button to show nothing happens.

1:50 — 2:20 (30s) — Prepare for authorized flow (switch to demo reporter)
------------------------------------------------------------------------
- Switch MetaMask to DEMO REPORTER: `0xB7cB63B75ffD4ce00C6B7B85e1C59501A338Da3a`.
- Show: Green `Arbitrum Sepolia` badge &active red `Report Sequencer Delay` button.
- Say: "Now I'm using the authorized reporter wallet — the report button is active." 

2:20 — 4:20 (2:00) — STATE D: Authorized Reporter Flow (core demo, allow 2 minutes)
----------------------------------------------------------------------------------
- Explain briefly (5s): "I'll file a sequencer delay incident now — watch MetaMask &the pending state."
- Click: `Report Sequencer Delay` (red button).
- Show: Incident modal with fields: `Type` (SEQUENCER_DELAY), `Severity`, `Description`.
- Fill or narrate the values (do this quickly):
  - Type: `SEQUENCER_DELAY`
  - Severity: `3` (click to set)
  - Description: `Demo: sequencer pause observed at T` (short text)
- Say as you click submit (before MetaMask shows): "Submitting — MetaMask will ask to sign this transaction." 
- Click: `Report Incident` in modal.
- Show: MetaMask transaction popup (signature + gas). This is critical.
- Say (as popup appears): "MetaMask: sign the on-chain write — this is the real proof step." 
- Confirm transaction in MetaMask.
- Show: UI immediately switches to `Transaction pending` (spinner or pending text).
- Say: "Transaction pending — we wait for mining, then parse the emitted event to extract the incident ID." 
- Wait for mining (watch the UI). When mined the dashboard will display `✓ Incident Recorded #N` &an Arbiscan link.
- When the dashboard shows the incident ID, click `View on Arbiscan →`.
- Show: Arbiscan transaction page &the `IncidentReported` event. Point out the indexed `incidentId` &`reporter` fields.
- Say: "Here is the on-chain proof: the `IncidentReported` event is emitted &indexed — anyone can query &verify." 

Timing note: mining may take 20–90 seconds depending on testnet. You reserved 2 minutes for this step; if the tx mines quickly, proceed earlier to the next section.

4:20 — 4:50 (30s) — Verify incident persists andIncident History
---------------------------------------------------------------
- Click: `Incident History` (or `Incident Log`) tab.
- Show: Recorded incident appears with ID, type, severity, &Arbiscan link.
- Say: "The incident persists on-chain — refresh to prove it's not local state." 
- (Optional) Refresh page quickly &show the incident still present.

4:50 — 5:20 (30s) — Security andContract Discipline (show code + ABI)
-------------------------------------------------------------------
- Show: `Settings` (gear) briefly, then open the local `contracts/IncidentManager.sol` in your editor OR open the contract source on Arbiscan.
- Point to: `onlyRole(REPORTER_ROLE)` on the `reportIncident` function &the `IncidentReported` event definition.
- Say: "We used OpenZeppelin `AccessControl` to enforce reporter role — minimal &audit-friendly." 
- Show: frontend `config.js` where the deployed `IncidentManager` address &ABI live (briefly).

5:20 — 5:40 (20s) — Problems this solves (speak confidently)
------------------------------------------------------------
- While showing the app, say these short bullets (one-line each):
  - "Records incidents immutably on-chain — no tampering."
  - "Ties incidents to reporter addresses — accountable reporting."
  - "Judge-verifiable proof via event logs &Arbiscan."
  - "Minimal UX: MetaMask, pending, &verified ID — no admin ceremony."

5:40 — 6:00 (20s) — Close andInvite checks
-----------------------------------------
- Show: the incident list &Arbiscan tab one more time.
- Say: "That's ChainWard end-to-end: connect, verify network, confirm permission, sign a real on-chain write, &prove it on Arbiscan."
- Ask: "Would you like to see the contract source on Arbiscan, the raw logs, or run the flow again with different details?"
