"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, AuditEntry, ChatItem, Step, TxRef } from "@/components/types";
import { Icon3D, Panel, short, StepCard, TierBadge, TxLink } from "@/components/ui";

const SUGGESTIONS = [
  "What's my balance and budget today?",
  "Pay 300 USDC rent to Landlord",
  "Pay 2000 USDC tuition to University",
  "Pay all the bills in my inbox",
  "Pay Landlord 300 USDC on the 1st every month",
  "Pause the wallet",
];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [compromised, setCompromised] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [lookalike, setLookalike] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => setSessionId(`web-${Math.random().toString(36).slice(2, 10)}`), []);

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api<AppState>("/api/state"), api<AuditEntry[]>("/api/audit")]);
      setState(s);
      setAudit(a);
      setStateError(null);
      const landlord = s.contacts.find((c) => c.name === "Landlord")?.address;
      if (landlord) setLookalike(`${landlord.slice(0, 6)}${"7".repeat(32)}${landlord.slice(-4)}`);
    } catch (e) {
      setStateError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat, busy]);

  const push = (item: ChatItem) => setChat((c) => [...c, item]);

  async function send(text: string) {
    if (!text.trim() || busy || !sessionId) return;
    setInput("");
    push({ role: "user", text, compromised });
    setBusy(true);
    try {
      const r = await api<{ reply: string; steps: Step[] }>("/api/chat", { sessionId, message: text, compromised });
      push({ role: "agent", text: r.reply, steps: r.steps, compromised });
    } catch (e) {
      push({ role: "system", text: `Error: ${(e as Error).message}`, tone: "bad" });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function ownerAction(label: string, path: string, body: unknown) {
    setBusy(true);
    try {
      const r = await api<{ tx: TxRef }>(path, body);
      push({ role: "system", text: label, tx: r.tx, tone: "ok", icon: "icon-approve" });
    } catch (e) {
      push({ role: "system", text: `${label} failed: ${(e as Error).message}`, tone: "bad", icon: "icon-blocked" });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function bypass(id: string, title: string) {
    setBusy(true);
    push({ role: "system", icon: "icon-dynamite", text: `RED TEAM: Layers 1 & 2 switched off. Signing "${title}" with the agent's real key and sending it straight to the chain…`, tone: "info" });
    try {
      const r = await api<{ tx: TxRef }>("/api/redteam", { id });
      const reverted = r.tx.status === "reverted";
      push({
        role: "system",
        icon: reverted ? "icon-shield" : "icon-blocked",
        text: reverted ? `Layer 3 held: PolicyWallet reverted the transaction on-chain.` : `Transaction executed — Layer 3 did NOT stop it.`,
        tx: r.tx,
        tone: reverted ? "ok" : "bad",
      });
    } catch (e) {
      push({ role: "system", text: `Red-team call failed: ${(e as Error).message}`, tone: "bad", icon: "icon-blocked" });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function runScheduler() {
    setBusy(true);
    try {
      const day = new Date();
      day.setUTCDate(28);
      const r = await api<{ steps: Step[] }>("/api/scheduler", { date: day.toISOString() });
      push({ role: "agent", text: r.steps.length ? `Scheduler ran ${r.steps.length} due payment(s):` : "Scheduler: nothing due this month.", steps: r.steps });
    } catch (e) {
      push({ role: "system", text: `Scheduler failed: ${(e as Error).message}`, tone: "bad" });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function resetChat() {
    await api("/api/chat/reset", { sessionId });
    setChat([]);
  }

  const usdc = state?.tokens.find((t) => t.symbol === "USDC");
  const pending = state?.requests.filter((r) => r.status === "pending") ?? [];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-5">
      {/* header */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon3D name="leash-mark" size={48} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Leash</h1>
            <p className="text-xs text-[var(--muted)]">An autonomous wallet agent that can&apos;t go rogue — even when the AI is fooled.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {state && (
            <>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1">chain {state.chain.id === 84532 ? "Base Sepolia" : state.chain.id === 31337 ? "local anvil" : state.chain.id}</span>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1">LLM: {state.provider}</span>
            </>
          )}
          <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 ${compromised ? "border-rose-500/60 bg-rose-500/15 text-rose-200" : "border-[var(--border)]"}`}>
            <input type="checkbox" checked={compromised} onChange={(e) => setCompromised(e.target.checked)} className="accent-rose-500" />
            <Icon3D name="icon-skull" size={20} /> Simulate compromised agent
          </label>
        </div>
      </header>

      {stateError && (
        <div className="panel mb-4 border-rose-500/40 p-3 text-sm text-rose-200">
          Can&apos;t reach the chain / deployment: {stateError}. Run <span className="mono">./scripts/dev.sh</span> from the repo root.
        </div>
      )}

      {/* defence layers */}
      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <Layer n={1} icon="icon-agent" title="Least-privilege agent" body="7 tools. No approve, no contract calls, no unpause. Untrusted data is labelled." stat="LLM is never the security boundary" />
        <Layer n={2} icon="icon-engine" title="Policy engine" body="Deterministic rules + provenance tracking + pre-flight simulation." stat={state ? `${state.stats.t1} auto · ${state.stats.t2} escalated · ${state.stats.t3} blocked` : "…"} />
        <Layer n={3} icon="icon-vault" title="On-chain PolicyWallet" body="Allowlist, per-tx & daily caps, pause. Enforced by the contract." stat={state ? `${state.stats.layer3} bypass attempts reverted` : "…"} />
        <div className="panel flex flex-col justify-center p-4">
          <div className="flex items-center gap-3">
            <Icon3D name="icon-shield" size={44} />
            <div>
              <div className="text-xs text-[var(--muted)] uppercase">Funds lost to attacks</div>
              <div className="text-3xl font-bold text-emerald-300">0 USDC</div>
            </div>
          </div>
          <div className="text-xs text-[var(--muted)]">Worst case by design: ≤ {usdc?.dailyLimit ?? "…"} USDC/day, only to your allowlisted contacts.</div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* chat */}
        <section className="panel flex h-[78vh] flex-col lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <h2 className="text-sm font-semibold">Agent</h2>
            <button onClick={resetChat} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
              new conversation
            </button>
          </div>
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chat.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                Ask Leash to pay rent, settle bills from the inbox or schedule tuition. Then flip <b>Simulate compromised agent</b> or try the
                address-poisoning prompt to watch the layers catch it.
              </div>
            )}
            {chat.map((m, i) => (
              <ChatBubble key={i} item={m} />
            ))}
            {busy && <div className="text-xs text-[var(--muted)] animate-pulse">Leash is working… (waiting for the chain)</div>}
          </div>
          <div className="border-t border-[var(--border)] p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} disabled={busy} onClick={() => send(s)} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs hover:border-[var(--accent)] disabled:opacity-40">
                  {s}
                </button>
              ))}
              {lookalike && (
                <button disabled={busy} onClick={() => send(`Send 300 USDC to ${lookalike}`)} className="rounded-full border border-rose-500/40 px-2.5 py-1 text-xs text-rose-200 hover:border-rose-400 disabled:opacity-40">
                  <Icon3D name="icon-phishing" size={18} className="mr-1 align-[-4px]" />Pay a look-alike of Landlord
                </button>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={compromised ? "Any message — the compromised agent ignores you and follows injected instructions" : "Message Leash…"}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button disabled={busy || !input.trim()} className="rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-slate-900 disabled:opacity-40">
                Send
              </button>
            </form>
          </div>
        </section>

        {/* side */}
        <div className="space-y-4 lg:col-span-5 lg:h-[78vh] lg:overflow-y-auto lg:pr-1">
          <Panel
            title="Wallet"
            right={
              state && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${state.wallet.paused ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/15 text-emerald-300"}`}>
                  {state.wallet.paused ? "PAUSED" : "ACTIVE"}
                </span>
              )
            }
          >
            {state ? (
              <div className="space-y-3">
                <div className="text-xs text-[var(--muted)]">
                  PolicyWallet{" "}
                  {state.wallet.url ? (
                    <a className="mono hover:underline" href={state.wallet.url} target="_blank" rel="noreferrer">
                      {short(state.wallet.address, 8)} ↗
                    </a>
                  ) : (
                    <span className="mono">{short(state.wallet.address, 8)}</span>
                  )}{" "}
                  · agent key <span className="mono">{short(state.wallet.operator)}</span>
                </div>
                {state.tokens.map((t) => (
                  <div key={t.symbol}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-semibold">
                        {Number(t.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-sm text-[var(--muted)]">{t.symbol}</span>
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        per-tx ≤ {t.perTxLimit} · daily ≤ {t.dailyLimit}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700/50">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500" style={{ width: `${Math.min(100, t.spentPct)}%` }} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">agent budget left today: {t.remainingToday} {t.symbol}</div>
                  </div>
                ))}
                {state.discovered.map((d) => (
                  <div key={d.symbol} className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-2 text-[11px]">
                    <div className="font-semibold text-orange-300">Unsolicited airdrop: {d.symbol}</div>
                    <div className="mt-0.5 break-words text-[var(--muted)]">name: “{d.name}”</div>
                  </div>
                ))}
                {state.wallet.paused && (
                  <button disabled={busy} onClick={() => ownerAction("Owner unpaused the wallet", "/api/owner", { action: "unpause" })} className="w-full rounded-lg bg-emerald-500/20 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
                    Unpause (owner signature)
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-[var(--muted)]">Loading…</div>
            )}
          </Panel>

          <Panel title={`Owner approvals${pending.length ? ` (${pending.length})` : ""}`}>
            {pending.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">Nothing waiting. T2 requests from the agent land here.</div>
            ) : (
              <ul className="space-y-2">
                {pending.map((r) => (
                  <li key={r.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{r.amount}</span>
                      <span className="text-[11px] text-amber-300">request #{r.id}</span>
                    </div>
                    <div className="text-xs">
                      to {r.toName ?? <span className="mono">{short(r.to, 8)}</span>} {!r.toName && <span className="text-rose-300">(not a contact)</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">“{r.memo}”</div>
                    <div className="mt-2 flex gap-2">
                      <button disabled={busy} onClick={() => ownerAction(`Owner approved request #${r.id}`, "/api/requests", { id: r.id, action: "approve" })} className="flex-1 rounded-lg bg-emerald-500/20 py-1 text-xs text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
                        Approve & sign
                      </button>
                      <button disabled={busy} onClick={() => ownerAction(`Owner rejected request #${r.id}`, "/api/requests", { id: r.id, action: "reject" })} className="flex-1 rounded-lg bg-rose-500/15 py-1 text-xs text-rose-200 hover:bg-rose-500/25 disabled:opacity-40">
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {state?.allowBypass && (
            <Panel title="Red team · bypass Layer 2">
              <p className="mb-2 text-xs text-[var(--muted)]">
                Assume the LLM <i>and</i> the policy engine are compromised. These buttons sign raw malicious transactions with the agent&apos;s real key. The contract must revert them.
              </p>
              <div className="space-y-2">
                {state.attacks.map((a) => (
                  <button key={a.id} disabled={busy} onClick={() => bypass(a.id, a.title)} className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 p-2.5 text-left hover:border-rose-400 disabled:opacity-40">
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-200"><Icon3D name="icon-dynamite" size={22} />{a.title}</div>
                    <div className="text-[11px] text-[var(--muted)]">{a.description}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                      expected revert: <span className="mono text-rose-300">{a.expectedError}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Contacts & schedules" right={<button disabled={busy} onClick={runScheduler} className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-40">run scheduler</button>}>
            <ul className="space-y-1.5">
              {state?.contacts.map((c) => (
                <li key={c.address} className="flex items-center justify-between text-sm">
                  <span>
                    {c.name} <span className="mono text-[11px] text-[var(--muted)]">{short(c.address, 6)}</span>
                  </span>
                  <span className={`text-[11px] ${c.active ? "text-emerald-300" : "text-amber-300"}`}>{c.active ? "allowlisted" : c.activeAt ? "in delay" : "not allowlisted"}</span>
                </li>
              ))}
            </ul>
            <AddContact disabled={busy} onAdd={(name, address) => ownerAction(`Owner allowlisted ${name}`, "/api/owner", { action: "addContact", name, address })} />
            {state && state.schedules.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-2">
                {state.schedules.map((s) => (
                  <li key={s.id} className="text-xs text-[var(--muted)]">
                    <Icon3D name="icon-calendar" size={16} className="mr-1 align-[-3px]" />{s.amount} {s.token} → {s.contactName} on day {s.dayOfMonth} {s.lastRun ? `(last run ${s.lastRun})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Audit trail">
            <ul className="space-y-1.5">
              {audit.length === 0 && <li className="text-sm text-[var(--muted)]">No events yet.</li>}
              {audit.slice(0, 25).map((e, i) => (
                <li key={i} className="text-xs leading-snug">
                  <span className="text-[var(--muted)]">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
                  {e.tier && <TierBadge tier={e.tier as "T0"} label={e.layer === 3 ? "L3" : e.tier} />} <span>{e.summary}</span>
                  {e.txHash &&
                    (e.txUrl ? (
                      <a href={e.txUrl} target="_blank" rel="noreferrer" className={`mono ml-1 hover:underline ${e.txStatus === "reverted" ? "text-rose-300" : "text-emerald-300"}`}>
                        {short(e.txHash, 8)}↗
                      </a>
                    ) : (
                      <span className={`mono ml-1 ${e.txStatus === "reverted" ? "text-rose-300" : "text-emerald-300"}`}>{short(e.txHash, 8)}</span>
                    ))}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Layer({ n, icon, title, body, stat }: { n: number; icon: string; title: string; body: string; stat: string }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-3">
        <Icon3D name={icon} size={44} />
        <div>
          <div className="text-[11px] font-bold tracking-wider text-[var(--accent)]">LAYER {n}</div>
          <div className="text-sm font-semibold">{title}</div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{body}</p>
      <p className="mt-1.5 text-xs font-medium">{stat}</p>
    </div>
  );
}

function ChatBubble({ item }: { item: ChatItem }) {
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)]/90 px-3 py-2 text-sm text-slate-900">{item.text}</div>
      </div>
    );
  }
  if (item.role === "system") {
    const tone = item.tone === "bad" ? "border-rose-500/40 text-rose-200" : item.tone === "ok" ? "border-emerald-500/40 text-emerald-200" : "border-sky-500/30 text-sky-200";
    return (
      <div className={`flex gap-3 rounded-xl border ${tone} bg-[var(--panel-2)] px-3 py-2 text-sm`}>
        {item.icon && <Icon3D name={item.icon} size={30} />}
        <div className="min-w-0 flex-1">
        {item.text}
        {item.tx && (
          <div className="mt-1">
            <TxLink tx={item.tx} />
          </div>
        )}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
      <Icon3D name={item.compromised ? "icon-skull" : "leash-mark"} size={32} className="mt-1" />
      <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${item.compromised ? "border border-rose-500/40 bg-rose-950/40" : "bg-[var(--panel-2)]"}`}>{item.text}</div>
      </div>
      {item.steps.length > 0 && (
        <div className="ml-12 space-y-2 border-l border-[var(--border)] pl-3">
          {item.steps.map((s, i) => (
            <StepCard key={i} step={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddContact({ onAdd, disabled }: { onAdd: (name: string, address: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-[11px] text-[var(--accent)] hover:underline">
        + add contact (owner)
      </button>
    );
  return (
    <form
      className="mt-2 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name, address);
        setOpen(false);
        setName("");
        setAddress("");
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs" />
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="mono rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs" />
      <button disabled={disabled || !name || !address} className="rounded-lg bg-[var(--accent)]/80 py-1 text-xs font-semibold text-slate-900 disabled:opacity-40">
        Allowlist on-chain
      </button>
    </form>
  );
}
