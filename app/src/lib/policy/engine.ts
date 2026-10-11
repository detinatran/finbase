import { formatUnits } from "viem";
import type { OriginResult } from "./provenance";

// Layer 2: deterministic policy engine. No LLM in here — plain rules that a
// reviewer can read in five minutes. Its output is a permission tier:
//   T0  read-only                      → always allowed
//   T1  inside the autonomous envelope → agent executes on its own
//   T2  outside the envelope           → escalated to the owner for approval
//   T3  dangerous / clearly malicious  → blocked, never reaches the chain

export type Tier = "T0" | "T1" | "T2" | "T3";
export type Verdict = "execute" | "escalate" | "block";

export interface Check {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  tier: Tier; // minimum tier this check forces
  detail: string;
}

export interface Decision {
  tier: Tier;
  verdict: Verdict;
  checks: Check[];
  summary: string;
}

export interface EngineToken {
  symbol: string;
  decimals: number;
  balance: bigint;
  enabled: boolean;
  perTxLimit: bigint;
  dailyLimit: bigint;
  remainingToday: bigint;
}

export interface RecentTransfer {
  to: string;
  token: string;
  amountUnits: bigint;
  ts: number;
}

export interface EvalContext {
  paused: boolean;
  token?: EngineToken;
  recipient: { address: string; activeAt: number; active: boolean };
  contacts: { name: string; address: string }[];
  origin: OriginResult;
  blocklist: string[];
  recentTransfers: RecentTransfer[];
  now: number; // ms
  /** Anything above perTxLimit × this is blocked outright rather than escalated. */
  hardCapMultiplier?: number;
}

export type Proposal =
  | { kind: "transfer"; tokenSymbol: string; to: string; amountUnits: bigint; memo: string }
  | { kind: "approve"; token: string; spender: string; amount: string }
  | { kind: "contract_call"; target: string; value: string; data: string };

const RANK: Record<Tier, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
const VERDICT: Record<Tier, Verdict> = { T0: "execute", T1: "execute", T2: "escalate", T3: "block" };
const STRUCTURING_WINDOW_MS = 30 * 60 * 1000;

export function maxTier(tiers: Tier[]): Tier {
  return tiers.reduce<Tier>((a, b) => (RANK[b] > RANK[a] ? b : a), "T1");
}

/** First 4 and last 4 hex chars match a contact, but the address is different. */
export function findLookalike(to: string, contacts: { name: string; address: string }[]) {
  const t = to.toLowerCase().replace(/^0x/, "");
  return contacts.find((c) => {
    const h = c.address.toLowerCase().replace(/^0x/, "");
    return h !== t && h.slice(0, 4) === t.slice(0, 4) && h.slice(-4) === t.slice(-4);
  });
}

export function evaluate(p: Proposal, ctx: EvalContext): Decision {
  if (p.kind !== "transfer") {
    const what = p.kind === "approve" ? "token approvals" : "arbitrary contract calls";
    return finish([
      {
        id: "capability",
        label: "Operator capability",
        status: "fail",
        tier: "T3",
        detail: `The agent role has no permission for ${what}. The PolicyWallet contract exposes no such function to the operator; only the owner can do this from their own wallet.`,
      },
    ]);
  }

  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const tok = ctx.token;
  const fmt = (v: bigint) => (tok ? `${formatUnits(v, tok.decimals)} ${tok.symbol}` : v.toString());
  const to = p.to.toLowerCase();
  const contact = ctx.contacts.find((c) => c.address.toLowerCase() === to);

  // 1. kill switch
  add(
    ctx.paused
      ? { id: "paused", label: "Emergency pause", status: "fail", tier: "T3", detail: "Wallet is paused. Only the owner can unpause." }
      : { id: "paused", label: "Emergency pause", status: "pass", tier: "T1", detail: "Wallet is active." },
  );

  // 2. token
  if (!tok || !tok.enabled || tok.symbol.toLowerCase() !== p.tokenSymbol.trim().toLowerCase()) {
    add({ id: "token", label: "Token allowlist", status: "fail", tier: "T3", detail: `${p.tokenSymbol} is not an enabled asset for the agent.` });
  } else {
    add({ id: "token", label: "Token allowlist", status: "pass", tier: "T1", detail: `${tok.symbol} is enabled.` });
  }

  // 3. amount sanity
  if (p.amountUnits <= 0n) {
    add({ id: "amount", label: "Amount", status: "fail", tier: "T3", detail: "Amount must be positive." });
  } else if (tok && p.amountUnits > tok.balance) {
    add({ id: "amount", label: "Amount", status: "fail", tier: "T3", detail: `Amount ${fmt(p.amountUnits)} exceeds balance ${fmt(tok.balance)}.` });
  } else {
    add({ id: "amount", label: "Amount", status: "pass", tier: "T1", detail: `${fmt(p.amountUnits)} is covered by the balance.` });
  }

  // 4. known-bad addresses
  if (ctx.blocklist.some((b) => b.toLowerCase() === to)) {
    add({ id: "blocklist", label: "Scam blocklist", status: "fail", tier: "T3", detail: "Recipient is on the scam/sanctions blocklist." });
  } else {
    add({ id: "blocklist", label: "Scam blocklist", status: "pass", tier: "T1", detail: "Recipient is not blocklisted." });
  }

  // 5. address poisoning
  const look = findLookalike(p.to, ctx.contacts);
  if (look) {
    add({
      id: "lookalike",
      label: "Address poisoning",
      status: "fail",
      tier: "T3",
      detail: `Recipient looks like contact "${look.name}" (${look.address}) — same first/last characters, different address. Classic address-poisoning attack.`,
    });
  } else {
    add({ id: "lookalike", label: "Address poisoning", status: "pass", tier: "T1", detail: "No look-alike of a saved contact." });
  }

  // 6. provenance — where did this address come from?
  const o = ctx.origin;
  if (o.origin === "contact") {
    add({ id: "provenance", label: "Recipient provenance", status: "pass", tier: "T1", detail: `Saved contact "${contact?.name ?? "contact"}".` });
  } else if (o.origin === "user") {
    add({ id: "provenance", label: "Recipient provenance", status: "pass", tier: "T1", detail: "Address was typed by the user in this conversation." });
  } else if (o.origin === "untrusted" && o.injectedSource) {
    add({
      id: "provenance",
      label: "Recipient provenance",
      status: "fail",
      tier: "T3",
      detail: `Address only appears in external content that contains a prompt-injection attempt (${o.sources.join(", ")}). Instructions from data are never followed.`,
    });
  } else if (o.origin === "untrusted") {
    add({
      id: "provenance",
      label: "Recipient provenance",
      status: "warn",
      tier: "T2",
      detail: `Address comes from external content (${o.sources.join(", ")}), not from the user or contacts. Owner must confirm.`,
    });
  } else {
    add({
      id: "provenance",
      label: "Recipient provenance",
      status: "warn",
      tier: "T2",
      detail: "Address appears nowhere the user or contacts provided — possibly hallucinated. Owner must confirm.",
    });
  }

  // 7. on-chain allowlist (mirrors the contract)
  const r = ctx.recipient;
  if (r.active) {
    add({ id: "allowlist", label: "On-chain allowlist", status: "pass", tier: "T1", detail: "Recipient is allowlisted and active on-chain." });
  } else if (r.activeAt > 0) {
    add({ id: "allowlist", label: "On-chain allowlist", status: "warn", tier: "T2", detail: `Recipient allowlisted but in its safety delay until ${new Date(r.activeAt * 1000).toISOString()}.` });
  } else {
    add({ id: "allowlist", label: "On-chain allowlist", status: "warn", tier: "T2", detail: "New recipient — not on the wallet's allowlist. Needs owner approval." });
  }

  // 8/9. limits (mirror the contract) + hard cap
  if (tok) {
    const hardCap = tok.perTxLimit * BigInt(ctx.hardCapMultiplier ?? 10);
    if (hardCap > 0n && p.amountUnits > hardCap) {
      add({ id: "per-tx", label: "Per-transaction limit", status: "fail", tier: "T3", detail: `${fmt(p.amountUnits)} is above the hard cap ${fmt(hardCap)}. Owner must move this from their own wallet.` });
    } else if (p.amountUnits > tok.perTxLimit) {
      add({ id: "per-tx", label: "Per-transaction limit", status: "warn", tier: "T2", detail: `${fmt(p.amountUnits)} is above the agent's per-tx limit ${fmt(tok.perTxLimit)}.` });
    } else {
      add({ id: "per-tx", label: "Per-transaction limit", status: "pass", tier: "T1", detail: `Within per-tx limit ${fmt(tok.perTxLimit)}.` });
    }
    if (p.amountUnits > tok.remainingToday) {
      add({ id: "daily", label: "Daily limit", status: "warn", tier: "T2", detail: `Only ${fmt(tok.remainingToday)} left of today's ${fmt(tok.dailyLimit)} budget.` });
    } else {
      add({ id: "daily", label: "Daily limit", status: "pass", tier: "T1", detail: `${fmt(tok.remainingToday)} left today.` });
    }

    // 10. unusually large share of the balance
    if (tok.balance > 0n && p.amountUnits * 2n >= tok.balance) {
      add({ id: "balance-share", label: "Balance share", status: "warn", tier: "T2", detail: "Moves 50% or more of the balance in one go." });
    }

    // 11. structuring — splitting a big payment into small ones
    const recent = ctx.recentTransfers.filter(
      (t) => t.to.toLowerCase() === to && t.token === tok.symbol && ctx.now - t.ts < STRUCTURING_WINDOW_MS,
    );
    const sum = recent.reduce((s, t) => s + t.amountUnits, 0n) + p.amountUnits;
    if (recent.length >= 2 && sum > tok.perTxLimit) {
      add({ id: "structuring", label: "Split-payment pattern", status: "warn", tier: "T2", detail: `${recent.length + 1} payments to the same recipient in 30 min total ${fmt(sum)} — above the per-tx limit.` });
    }
  }

  return finish(checks);
}

function finish(checks: Check[]): Decision {
  const tier = maxTier(checks.map((c) => c.tier));
  const verdict = VERDICT[tier];
  const reasons = checks.filter((c) => c.tier === tier && c.status !== "pass").map((c) => c.detail);
  const summary =
    verdict === "execute"
      ? "All checks passed — inside the autonomous envelope."
      : `${verdict === "block" ? "Blocked" : "Needs owner approval"}: ${reasons.join(" ")}`;
  return { tier, verdict, checks, summary };
}
