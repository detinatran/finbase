# 🦮 Leash — an AI wallet agent that can't go rogue

> 2026 Shenzhen FinTechathon · International Track · **Topic F — Autonomous On-chain Wallet Agent**

Leash is an AI agent that manages a stablecoin wallet for international students: it pays rent and tuition, settles bills from the inbox, and runs recurring payments on its own. It is built so that **even a fooled or fully compromised AI cannot lose the user's money**:

| Layer | What | Guarantees |
|---|---|---|
| **L1** Least-privilege agent | 7 tools, untrusted data labelled | No approve / contract calls / unpause, by construction |
| **L2** Policy engine | Deterministic rules, **provenance tracking**, look-alike detection, structuring, pre-flight simulation | Every payment classified **T1 auto · T2 owner approval · T3 blocked** |
| **L3** `PolicyWallet` contract | Allowlist, per-tx and daily caps, recipient safety delay, asymmetric pause | Holds even if L1 and L2 are compromised (fuzz-tested) |

**Results:** 17/17 contract tests (incl. fuzzing) · 51/51 app tests · red-team: **30 attacks → 0 auto-executed**, 0 false positives · reverted on-chain bypass attempts in [`docs/EXECUTION_EVIDENCE.md`](docs/EXECUTION_EVIDENCE.md).

📄 [Technical documentation](docs/TECHNICAL.md) · 🛡 [Security self-assessment](docs/SECURITY_SELF_ASSESSMENT.md) · 🧨 [Red-team report](docs/REDTEAM_REPORT.md) · ⛓ [Execution evidence](docs/EXECUTION_EVIDENCE.md) · 🎤 [Pitch outline](docs/PITCH_DECK.md) · 🎬 [Demo script](docs/DEMO_VIDEO_SCRIPT.md)

---

## Quick start (local, no API key, ~2 minutes)

Requirements: Node 20+, [Foundry](https://book.getfoundry.sh/getting-started/installation) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

```bash
git clone <this repo> && cd finhackathon
git submodule update --init --recursive        # forge-std
cd app && npm install && cd ..
./scripts/dev.sh                               # anvil + deploy + web app
```

Open **http://localhost:3100** and try:

1. *"Pay all the bills in my inbox"*: 1 auto-paid, 2 escalated, 2 attacks blocked (look-alike address, prompt injection)
2. **Owner approvals → Approve & sign**
3. Toggle **☠️ Simulate compromised agent** and send anything: every malicious transfer is blocked
4. **Red team → Drain to attacker**: Layer 2 is skipped and the raw transaction is **reverted by the contract**

## Choosing the LLM

Set in `app/.env.local` (copy of `.env.example`):

| `LLM_PROVIDER` | Needs | Notes |
|---|---|---|
| `scripted` (default) | nothing | Deterministic, naive agent that falls for phishing on purpose; L2/L3 catch it |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude via the official SDK; default model `claude-opus-5-5`, adaptive thinking, server-side refusal fallback, strict tools |
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Any OpenAI-compatible API: Gemini (free tier), Ollama (local), OpenAI |

The **Simulate compromised agent** toggle always swaps the model for an adversarial script, so the security demo does not depend on any model being fooled.

## Deploy to Base Sepolia (real transaction hashes)

1. Create two **fresh testnet-only** keys: owner and agent (`cast wallet new`).
2. Get Base Sepolia ETH for the owner from a faucet (e.g. Coinbase CDP faucet, Alchemy, QuickNode, Superchain faucet). ~0.01 ETH is plenty.
3. Run:

```bash
export OWNER_PRIVATE_KEY=0x...      # funded testnet key
export OPERATOR_PRIVATE_KEY=0x...   # fresh key for the agent (gets 0.0001 ETH from the owner)
./scripts/deploy-base-sepolia.sh    # deploys, writes contracts/deployments/84532.json and app/.env.local
cd app && npm run evidence          # real T1/T2/T3 + reverted bypass txs → docs/EXECUTION_EVIDENCE.md
npm run dev                         # demo against the testnet, with Basescan links
```

## Tests

```bash
cd contracts && forge test           # 17 tests incl. 2 fuzz properties
cd app && npm test                   # policy engine + red-team scenarios (51 tests)
cd app && npm run redteam            # prints the table, writes docs/REDTEAM_REPORT.md
cd app && npm run evidence           # end-to-end on the configured chain
```

## Repository layout

```
contracts/
  src/PolicyWallet.sol        on-chain envelope (Layer 3)
  src/mocks/MockERC20.sol     test USDC + the "poison" airdrop token
  test/PolicyWallet.t.sol     unit + fuzz tests
  script/Deploy.s.sol         deploys the demo world, writes deployments/<chainId>.json
app/
  src/lib/policy/             engine.ts (tiers & checks) · provenance.ts · injection.ts   (Layer 2)
  src/lib/pipeline.ts         evaluate → simulate → execute/escalate/block → audit
  src/lib/agent/              tools (Layer 1), system prompt, providers (Claude / OpenAI-compatible / scripted / compromised)
  src/lib/executor.ts         the only code that signs transactions
  src/app/                    Next.js UI + API routes
  redteam/                    attack scenarios + report generator
  scripts/evidence.ts         on-chain evidence generator
docs/                         submission documents
scripts/                      dev.sh · deploy-base-sepolia.sh
```

## Security notes

- The demo keeps the **owner key on the server** so the Approve button works without a browser wallet. This is documented as KR-1 in the self-assessment. Use testnet keys only.
- `ALLOW_REDTEAM_BYPASS=true` enables the Layer-2 bypass buttons. Disable it outside demos.
- Never commit `app/.env.local` (it is gitignored).

## License

MIT
