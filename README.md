<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo/leash-lockup-dark.svg">
    <img src="brand/logo/leash-lockup.svg" alt="Leash" width="360">
  </picture>
</p>

<p align="center"><b>An AI wallet agent that can't go rogue — even when the AI is fooled.</b><br>
  <sub>by <b>Tran Anh Duong</b> &amp; <b>Pham Sy Toan</b></sub></p>

<p align="center">
  2026 Shenzhen FinTechathon · International Track · <b>Topic F — Autonomous On-chain Wallet Agent</b><br>
  Live on <a href="https://sepolia.basescan.org/address/0x639AC0da94BC57E374d3d774b536a706fD7af198">Base Sepolia</a> ·
  <a href="docs/TECHNICAL.md">Technical doc</a> ·
  <a href="docs/SECURITY_SELF_ASSESSMENT.md">Security self-assessment</a> ·
  <a href="docs/EXECUTION_EVIDENCE.md">On-chain evidence</a>
</p>

<p align="center">
  <a href="docs/media/leash-demo.mp4"><img src="docs/media/demo.gif" alt="Leash demo: paying bills, blocking a phishing payment and a prompt injection, and the contract reverting a raw malicious transaction" width="860"></a><br>
  <sub>▶ <a href="docs/media/leash-demo.mp4">Full demo video (3 min, with narration)</a></sub>
</p>

---

## Why

AI agents are starting to hold keys and move money. A language model can be **talked into anything by the data it reads** (prompt injection), it **hallucinates**, and it **cannot be formally verified**. Most "AI wallets" are a model, a private key and *"please be careful"* in the prompt: one poisoned email drains them.

Leash manages a stablecoin wallet for **international students** — rent, tuition, bills, recurring payments — and is built on one rule:

> **The LLM is never the security boundary.**

## How it works

<table>
  <tr>
    <td width="96" align="center"><img src="app/public/brand/icon-agent.png" width="72" alt=""></td>
    <td><b>Layer 1 · Least-privilege agent</b><br>Seven tools. No approve, no arbitrary contract calls, no unpause — by construction. Everything from the outside world is labelled untrusted.</td>
  </tr>
  <tr>
    <td align="center"><img src="app/public/brand/icon-engine.png" width="72" alt=""></td>
    <td><b>Layer 2 · Deterministic policy engine</b><br>No LLM inside. <b>Provenance tracking</b> (where did this address first appear?), look-alike detection, limits, split-payment detection and a pre-flight simulation classify every payment as <b>T1 auto · T2 owner approval · T3 blocked</b>.</td>
  </tr>
  <tr>
    <td align="center"><img src="app/public/brand/icon-vault.png" width="72" alt=""></td>
    <td><b>Layer 3 · <code>PolicyWallet</code> contract</b><br>Funds live in a contract. The agent's key can only move enabled tokens to allowlisted recipients within per-tx and daily caps. It holds even if Layers 1 and 2 are fully compromised — fuzz-tested.</td>
  </tr>
</table>

| | Tier | Example | On-chain |
|---|---|---|---|
| <img src="app/public/brand/icon-eye.png" width="36" alt=""> | **T0** read | balance, contacts, inbox | — |
| <img src="app/public/brand/icon-check.png" width="36" alt=""> | **T1** auto | 300 USDC rent to a saved contact | `executeTransfer` |
| <img src="app/public/brand/icon-approve.png" width="36" alt=""> | **T2** owner approval | 2,000 USDC tuition, a new merchant | `requestTransfer` → owner `approveRequest` |
| <img src="app/public/brand/icon-blocked.png" width="36" alt=""> | **T3** blocked | injected payee, look-alike address, token approval | never sent |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/media/shot-home.png" alt="Dashboard: three defence layers, wallet, owner approvals and red-team panel"><br><sub><b>Dashboard</b> — the three layers, the wallet and its limits, and an airdropped token whose <i>name</i> is a prompt injection.</sub></td>
    <td width="50%"><img src="docs/media/shot-inbox.png" alt="Policy engine checks on proposed payments"><br><sub><b>"Pay all the bills in my inbox"</b> — every proposal shows the checks that decided its tier.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/media/shot-redteam.png" alt="Raw malicious transactions reverted by the contract"><br><sub><b>Red team</b> — policy engine switched off, raw transactions from the agent key: reverted on-chain with typed errors.</sub></td>
    <td><img src="docs/media/shot-audit.png" alt="Audit trail" width="60%"><br><sub><b>Audit trail</b> — every decision, its reasons and its transaction hash.</sub></td>
  </tr>
</table>

## Proof

<table>
  <tr>
    <td width="55%"><img src="docs/media/proof-blockscout-revert.png" alt="Blockscout: executeTransfer failed with revert reason RecipientNotAllowed"><br><sub><b>On-chain, unedited.</b> Policy engine off, raw transaction from the agent key → <code>RecipientNotAllowed(attacker)</code> on the Base Sepolia explorer.</sub></td>
    <td width="45%"><img src="docs/media/proof-airdrop-token.png" alt="Unsolicited airdrop token whose name is a prompt injection"><br><sub><b>The attack is real too.</b> A token airdropped into the wallet; its on-chain name orders the AI to send everything to an attacker.</sub><br><br><img src="docs/media/proof-blockscout-rent.png" alt="Blockscout: successful executeTransfer for rent"><br><sub>Rent payment (T1) executed by the agent — success.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/media/proof-forge-test.png" alt="forge test output: 17 passed"></td>
    <td><img src="docs/media/proof-redteam.png" alt="npm run redteam output: 0 of 30 attacks auto-executed"></td>
  </tr>
</table>

## Results

| What | Result |
|---|---|
| Contract tests (`forge test`) | **17/17**, incl. 2 fuzz properties: a compromised agent never exceeds the daily cap |
| App tests (`npm test`) | **51/51** |
| Red-team suite ([report](docs/REDTEAM_REPORT.md)) | **30 attacks → 0 auto-executed** (21 blocked, 9 escalated) · 0 false positives on 6 normal payments |
| On-chain evidence ([Base Sepolia](docs/EXECUTION_EVIDENCE.md)) | T1/T2/T3 flows + 4 Layer-2 bypass attempts reverted: `RecipientNotAllowed`, `ExceedsPerTxLimit`, `TokenNotAllowed`, `WalletPaused` |

## Quick start (local, no API key, ~2 minutes)

Requirements: Node 20+, [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
git clone https://github.com/detinatran/finbase && cd finbase
git submodule update --init --recursive        # forge-std
cd app && npm install && cd ..
./scripts/dev.sh                               # anvil + deploy + web app
```

Open **http://localhost:3100** and try:

1. *"Pay all the bills in my inbox"* — 1 paid automatically, 2 sent to the owner, 2 attacks blocked
2. **Owner approvals → Approve & sign**
3. Toggle **Simulate compromised agent** and send anything — every malicious transfer is blocked
4. **Red team → Drain to attacker** — Layer 2 is skipped and the raw transaction is **reverted by the contract**

### Choosing the LLM

In `app/.env.local` (copy of `.env.example`):

| `LLM_PROVIDER` | Needs | Notes |
|---|---|---|
| `scripted` (default) | nothing | Deterministic, deliberately naive agent — falls for phishing so Layers 2/3 can be shown catching it |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude via the official SDK (default `claude-opus-5-5`), strict tool schemas, refusal fallback |
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Any OpenAI-compatible API: Gemini, Ollama, OpenAI |

The **Simulate compromised agent** toggle always swaps the model for an adversarial script, so the security demo never depends on a model being fooled.

### Deploy to Base Sepolia

```bash
# keys in the environment or in a gitignored .env.testnet (OWNER_PRIVATE_KEY, OPERATOR_PRIVATE_KEY)
./scripts/deploy-base-sepolia.sh    # deploys, writes contracts/deployments/84532.json and app/.env.local
cd app && npm run evidence          # real T1/T2/T3 + reverted bypass txs → docs/EXECUTION_EVIDENCE.md
npm run dev                         # demo UI against the testnet
```

Testnet ETH: Coinbase Developer Platform → Onchain Tools → Faucet (Base Sepolia). Deploying costs ~0.00005 ETH.

### Tests & tooling

```bash
cd contracts && forge test     # contract unit + fuzz tests
cd app && npm test             # policy engine + red-team scenarios
cd app && npm run redteam      # writes docs/REDTEAM_REPORT.md
cd app && npm run evidence     # on-chain evidence on the configured chain
cd app && npm run record       # re-records docs-ready demo video + screenshots (app must be running)
```

## Repository layout

```
contracts/   PolicyWallet.sol (Layer 3), mocks, Foundry tests, deploy script
app/         Next.js UI + API · src/lib/policy (Layer 2) · src/lib/agent (Layer 1) · redteam/ · scripts/
docs/        technical doc, security self-assessment, red-team report, evidence, pitch, media
brand/       logo (SVG) and the 3D icon family
scripts/     dev.sh · deploy-base-sepolia.sh
```

## Security notes

- The demo keeps the **owner key on the server** so the Approve button works without a browser wallet (known risk KR-1). Testnet keys only.
- `ALLOW_REDTEAM_BYPASS=true` enables the Layer-2 bypass buttons — disable outside demos.
- Never commit `app/.env.local` or `.env.testnet` (both gitignored).

## Team

- **Tran Anh Duong** ([@detinatran](https://github.com/detinatran))
- **Pham Sy Toan**

## Credits

3D icons and illustrations generated with Codex CLI image generation; logo hand-drawn as SVG. Demo narration: [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0), run locally.

## License

[MIT](LICENSE) © 2026 Tran Anh Duong, Pham Sy Toan
