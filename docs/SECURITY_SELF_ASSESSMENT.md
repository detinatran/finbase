# Security Self-Assessment

Project: **Leash** — Autonomous On-chain Wallet Agent (Topic F)  
Authors: Tran Anh Duong, Pham Sy Toan  
Scope: `contracts/` (PolicyWallet), `app/src/lib/` (agent, policy engine, executor), the demo web app.

## 1. Security goals

1. **No loss beyond the envelope.** Even with a fully compromised model *and* a compromised off-chain policy engine, the agent's key can move at most `dailyLimit` per day per token, only to allowlisted recipients, only in enabled tokens.
2. **No unattended loss to attackers.** A payment to a recipient that the user did not provide (a phished, poisoned, injected or hallucinated address) is never executed without the owner's signature.
3. **Human stays in control.** The owner can approve, reject, pause, unpause, re-key the operator and withdraw at any time. The agent can stop itself but cannot restart itself.
4. **Explainability and auditability.** Every decision records which checks passed or failed, and every state change emits an on-chain event.

## 2. Permission-tier implementation

| Tier | Who decides | Enforced in | Example | On-chain effect |
|---|---|---|---|---|
| **T0** read | — | tool layer | balance, contacts, inbox, activity | none |
| **T1** autonomous | policy engine → contract | `engine.ts` (all checks pass) **and** `PolicyWallet._checkEnvelope` | 300 USDC rent → saved contact | `executeTransfer` by operator |
| **T2** owner approval | owner | `engine.ts` (escalation) → `requestTransfer` → `approveRequest` (onlyOwner) | 2,000 USDC tuition, new merchant | request stored; funds move only on owner signature |
| **T3** blocked | policy engine | `engine.ts`; and for capability attacks, the contract itself (no such function for the operator) | injected payee, look-alike address, token approvals | none (logged) |

**Capability matrix (enforced by the contract, not by the prompt):**

| Function | owner | operator (agent) | anyone |
|---|:-:|:-:|:-:|
| `executeTransfer` (inside envelope) | — | ✅ | — |
| `requestTransfer` | — | ✅ | — |
| `approveRequest` / `rejectRequest` | ✅ | ❌ | ❌ |
| `pause` | ✅ | ✅ | ❌ |
| `unpause` | ✅ | ❌ | ❌ |
| `addRecipient` / `removeRecipient` / `setTokenPolicy` / `setRecipientDelay` | ✅ | ❌ | ❌ |
| `setOperator` / `transferOwnership` | ✅ | ❌ | ❌ |
| `ownerExecute` (arbitrary call, incl. token approvals) | ✅ | ❌ | ❌ |

Each ❌ for the operator is covered by `test_revert_operatorCannotChangePolicy`, `test_revert_operatorCannotApproveItsOwnRequest`, `test_agentCanPauseButNotUnpause` and `test_revert_strangerCannotPause`.

## 3. Threat model

| # | Threat | Vector | Mitigations (layer) | Residual risk |
|---|---|---|---|---|
| T-1 | Prompt injection via data | email/invoice text, ERC-20 `name()`, memos | untrusted labelling (L1); provenance rule blocks injected payees (L2); allowlist (L3) | Low — worst case is an owner prompt for a clean-looking address |
| T-2 | Model hallucinates a payee or amount | LLM error | provenance `unknown` → T2 (L2); allowlist (L3); amount > balance → T3 | Low |
| T-3 | Address poisoning | dust from a vanity look-alike address | look-alike detector → T3 even when typed by the user (L2); allowlist (L3) | Low |
| T-4 | Limit evasion by splitting | many small payments | structuring check (L2); daily cap (L3) | Low — bounded by the daily cap |
| T-5 | Fully jailbroken or malicious agent | model compromise, malicious model update | L3 envelope; fuzz-tested bound on outflow; the agent cannot approve its own requests | **Bounded**: ≤ dailyLimit/day, only to allowlisted contacts |
| T-6 | Operator key theft | server compromise | same bound as T-5; owner can `pause` and `setOperator` to rotate | Bounded as above until the owner reacts |
| T-7 | Malicious allowlist change | phished owner session | `recipientDelay` safety window; owner can `removeRecipient` within it | Medium if delay = 0 (demo setting) |
| T-8 | Approval phishing / unlimited allowance | "approve this staking contract" | no approve or arbitrary-call capability for the operator (L1 + L3); engine T3 (L2) | None for the agent path |
| T-9 | Owner fatigue (spam of T2 requests) | attacker floods requests via injection | T3 for injected payees; requests show "not a contact" in red | Medium — UX mitigation only |
| T-10 | Re-entrancy via malicious token or recipient | callback during transfer | `nonReentrant`; checks-effects-interactions (spent updated before transfer) | Low |
| T-11 | Race between check and execution | state changes between L2 and the transaction | pre-flight `eth_call` simulation; L3 re-checks atomically | None (L3 is atomic) |
| T-12 | Demo owner key held server-side | demo convenience | documented; testnet keys only | **Known risk, demo only** (KR-1) |

## 4. Known-risk list

| ID | Risk | Severity | Status / plan |
|---|---|---|---|
| KR-1 | Owner private key is stored in the server `.env.local` so the demo "Approve" button can sign. Anyone with server access could approve requests. | High (demo) / N/A (prod) | Demo only, testnet keys. Production: owner signs in a browser wallet or passkey smart account; the server never sees the key. |
| KR-2 | `recipientDelay` is 0 in the demo so new contacts are usable instantly. | Medium | Set to 24 h in production (`setRecipientDelay`). Contract and tests already support it. |
| KR-3 | The injection detector is regex-based and English-centric; it misses some attacks (see red-team PI-08, Vietnamese). | Medium | Safe by construction: misses degrade to T2 via provenance, never to auto-execute. Roadmap: classifier model, multilingual rules. |
| KR-4 | Provenance is session-scoped and string-based. An address split or encoded across untrusted text (e.g., spelled out in words) is classified `unknown` rather than `untrusted`. | Low | `unknown` also escalates to T2, so there is no auto-execute path. |
| KR-5 | The look-alike heuristic only compares 4+4 hex chars. A poisoning address matching 3+5 chars would pass L2. | Low | Still blocked by the L3 allowlist (not allowlisted → T2). Roadmap: edit-distance scoring. |
| KR-6 | Operator key is a hot key on the server. | Medium | Exposure bounded by the L3 envelope (T-6). Roadmap: KMS/HSM, ERC-4337 session keys with expiry. |
| KR-7 | T2 request spam could cause approval fatigue. | Medium | Injected payees are T3, not T2. Roadmap: rate-limit `requestTransfer` on-chain. |
| KR-8 | Static scam blocklist. | Low | Roadmap: live threat-intelligence feed. |
| KR-9 | LLM provider outage or refusal. | Low | Claude server-side refusal fallback; provider can be swapped by config; scripted mode for offline use. Funds are never at risk from an outage. |
| KR-10 | Contract not externally audited. | Medium | Small surface (~300 lines incl. comments, no dependencies), 17 tests including fuzzing. An audit is needed before mainnet. |
| KR-11 | Mock USDC on testnet is mintable by anyone. | N/A | Testnet demo asset only. Production uses real USDC (non-mintable). |

## 5. Evidence

- `contracts/test/PolicyWallet.t.sol` — 17 tests, including 2 fuzz properties (512 runs each).
- `docs/REDTEAM_REPORT.md` — 30 attack scenarios, 0 auto-executed; 6 benign controls, 0 false positives.
- `docs/EXECUTION_EVIDENCE.md` — real transactions for T1/T2/T3 and reverted on-chain Layer-2-bypass attacks (`RecipientNotAllowed`, `ExceedsPerTxLimit`, `TokenNotAllowed`, `WalletPaused`).
- Audit log in the app UI and in `app/data/<chain>-audit.jsonl`.

## 6. Compliance notes

- The agent only moves **stablecoins to allowlisted, known counterparties**. It has no trading, speculation or DeFi capability, which matches payment use cases and keeps it clear of investment-advice and trading regulation.
- The on-chain memo plus the audit log provide a per-payment purpose record, a building block for AML and travel-rule reporting.
- Human-in-the-loop for every non-routine payment (T2) satisfies "meaningful human control" expectations for automated financial decisions.
