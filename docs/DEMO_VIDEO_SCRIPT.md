# Demo video script (≤ 5 minutes)

**Setup before recording**
- Run against **Base Sepolia** so transaction links open on Basescan (`scripts/deploy-base-sepolia.sh`, then `cd app && npm run dev`).
- Fresh deployment, so balances read 5,000 USDC and the daily budget is unused.
- Browser at 1440×900, zoom 110 %, dark mode. Basescan open in a second tab.
- Provider: Claude or Gemini looks best. Use `scripted` if there is no API key; the flow is identical.

| # | Time | Screen | Voice-over (English) |
|---|---|---|---|
| 1 | 0:00–0:25 | Title card → app home, the 3-layer strip | "This is Leash, an AI agent that manages a student's stablecoin wallet. It pays rent and tuition on its own. And it's built so that even if the AI is fooled, or completely hacked, it can't lose your money." |
| 2 | 0:25–0:55 | Click **"What's my balance…"** | "The agent sees 5,000 USDC, and its own limits: 500 per payment, 1,000 per day. Notice the airdropped token: its *name* is a prompt injection telling the AI to send everything to an attacker. The agent flags it and ignores it." |
| 3 | 0:55–2:00 | Click **"Pay all the bills in my inbox"**. Expand the step cards. | "Five emails. Rent to my landlord, a saved contact within limits: **T1, executed automatically**. Here's the transaction. Tuition of 2,000 is above the limit: **T2, sent to me for approval**. This one claims my landlord changed wallets. The address *looks* like the landlord's, same first and last characters: **address poisoning, blocked**. And this 'scholarship refund' hides an instruction to the AI. The policy engine traced the address back to that email: **prompt injection, blocked**. Nothing was sent." |
| 4 | 2:00–2:25 | Owner approvals panel → **Approve & sign** on tuition → open tx on Basescan | "As the owner, one click approves the tuition, and here it is on-chain." |
| 5 | 2:25–3:15 | Toggle **☠️ Simulate compromised agent** → send any message | "Now the worst case: we replace the AI with a malicious script that obeys every instruction it finds, and even tries to split payments to slip under the limits. Six malicious transfers attempted, six blocked. The model was fully compromised, and the money didn't move." |
| 6 | 3:15–4:15 | Red-team panel → **Drain to attacker** → open the reverted tx on Basescan → **Exceed per-tx limit** | "Let's go further and switch off our own policy engine. This button signs a raw transaction with the agent's real key and sends it straight to the blockchain. The smart contract reverts it: *RecipientNotAllowed*. Here's the failed transaction on Basescan. Same for 5,000 USDC in one go: *ExceedsPerTxLimit*. Three independent layers, and the last one is math." |
| 7 | 4:15–4:40 | Audit trail panel; quick scroll of `REDTEAM_REPORT.md` | "Every decision is logged with its reasons. Our red-team suite runs 30 attacks: zero auto-executed, zero false positives on normal payments." |
| 8 | 4:40–5:00 | Back to the 3-layer strip, "Funds lost to attacks: 0 USDC" | "Leash: autonomy, on a leash. The agent does the work; the contract keeps the money safe." |

**Recording tips**
- Record at 1080p with OBS or QuickTime, and add a voice-over afterwards if live narration is hard.
- Pre-warm the app once (first API call compiles routes in dev mode), or run `npm run build && npm start` for snappy responses.
- Keep each chain wait under ~3 s on screen. Cut dead time in editing.
