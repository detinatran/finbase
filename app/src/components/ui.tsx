"use client";

import type { Check, Decision, Step, Tier, TxRef } from "./types";

export const short = (a: string, n = 6) => (a && a.length > 2 * n ? `${a.slice(0, n)}…${a.slice(-4)}` : a);

const TIER_STYLE: Record<Tier, string> = {
  T0: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  T1: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  T2: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  T3: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const TIER_LABEL: Record<Tier, string> = {
  T0: "T0 · read",
  T1: "T1 · auto-executed",
  T2: "T2 · owner approval",
  T3: "T3 · blocked",
};

export function TierBadge({ tier, label }: { tier: Tier; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIER_STYLE[tier]}`}>
      {label ?? TIER_LABEL[tier]}
    </span>
  );
}

export function TxLink({ tx }: { tx: TxRef }) {
  const cls = tx.status === "success" ? "text-emerald-300" : "text-rose-300";
  const body = (
    <>
      <span className="text-[var(--muted)]">{tx.label}:</span> <span className={`mono ${cls}`}>{short(tx.hash, 10)}</span>{" "}
      <span className={cls}>{tx.status === "success" ? "✓ success" : "✗ reverted"}</span>
      {tx.revertReason && <span className="ml-1 mono text-rose-300">· {tx.revertReason}</span>}
    </>
  );
  return tx.url ? (
    <a href={tx.url} target="_blank" rel="noreferrer" className="block text-xs hover:underline">
      {body} ↗
    </a>
  ) : (
    <div className="text-xs" title={tx.hash}>
      {body}
    </div>
  );
}

const ICON: Record<Check["status"], string> = { pass: "✓", warn: "!", fail: "✗" };
const ICON_CLS: Record<Check["status"], string> = {
  pass: "text-emerald-400",
  warn: "text-amber-400",
  fail: "text-rose-400",
};

export function Checks({ decision }: { decision: Decision }) {
  const flagged = decision.checks.filter((c) => c.status !== "pass");
  return (
    <details className="mt-2 group" open={decision.verdict !== "execute"}>
      <summary className="cursor-pointer text-[11px] text-[var(--muted)] select-none">
        Policy engine · {decision.checks.length} checks · {flagged.length} flagged
      </summary>
      <ul className="mt-1.5 space-y-1">
        {decision.checks.map((c) => (
          <li key={c.id} className="flex gap-2 text-xs leading-snug">
            <span className={`w-3 shrink-0 font-bold ${ICON_CLS[c.status]}`}>{ICON[c.status]}</span>
            <span>
              <span className="font-medium text-[var(--text)]">{c.label}</span>{" "}
              <span className="text-[var(--muted)]">— {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const TOOL_LABEL: Record<string, string> = {
  get_wallet_overview: "Read wallet",
  list_contacts: "List contacts",
  read_inbox: "Read inbox",
  get_recent_activity: "Read activity",
  propose_transfer: "Propose transfer",
  schedule_recurring_payment: "Schedule payment",
  pause_wallet: "Pause wallet",
};

export function StepCard({ step }: { step: Step }) {
  const d = step.decision;
  const border = !d
    ? "border-[var(--border)]"
    : d.verdict === "execute"
      ? "border-emerald-500/40"
      : d.verdict === "escalate"
        ? "border-amber-500/40"
        : "border-rose-500/50";
  const input = step.input as { amount?: string; token?: string; to?: string; resolvedTo?: string; reason?: string };
  return (
    <div className={`rounded-xl border ${border} bg-[var(--panel-2)] px-3 py-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--accent)]">⚙ {TOOL_LABEL[step.tool] ?? step.tool}</span>
        {d ? <TierBadge tier={d.tier} /> : <TierBadge tier="T0" />}
        {step.untrusted && (
          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11px] text-orange-300">untrusted data</span>
        )}
        {typeof step.requestId === "number" && step.requestId >= 0 && (
          <span className="text-[11px] text-amber-300">request #{step.requestId}</span>
        )}
      </div>
      {step.tool === "propose_transfer" && input.amount && (
        <div className="mt-1 text-sm">
          <span className="font-semibold">
            {input.amount} {input.token}
          </span>{" "}
          → <span className="mono text-xs">{input.to && input.to.startsWith("0x") ? short(input.to, 8) : input.to}</span>
          {input.reason && <span className="text-xs text-[var(--muted)]"> · “{input.reason}”</span>}
        </div>
      )}
      {!d && <div className="mt-1 text-xs text-[var(--muted)]">{step.summary}</div>}
      {step.injections && step.injections.length > 0 && (
        <div className="mt-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
          ⚠ Prompt-injection detected in {step.injections.map((i) => `${i.source} (${i.rules.join(", ")})`).join("; ")} — tainted; values from it cannot authorise payments.
        </div>
      )}
      {d && <Checks decision={d} />}
      {step.tx && (
        <div className="mt-1.5">
          <TxLink tx={step.tx} />
        </div>
      )}
    </div>
  );
}

export function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--muted)] uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
