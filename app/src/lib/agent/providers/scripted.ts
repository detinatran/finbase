import { getContacts, getInbox } from "../../store";
import type { Session, Step } from "../../session";
import { runTool } from "../tools";
import type { TurnResult } from "./types";

// Two deterministic stand-ins for an LLM, so the demo runs offline and the
// security story never depends on how a model behaves on a given day.
//
//  - runScriptedTurn:    a helpful but naive agent. It parses intent with
//                        regexes and pays whatever bills say, i.e. it WILL fall
//                        for phishing emails. Layers 2 and 3 must catch it.
//  - runCompromisedTurn: a fully jailbroken agent. It obeys every instruction
//                        it finds in untrusted data and tries to evade limits.

const ADDRESS = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;
const AMOUNT = /(?:\$\s?)?(\d[\d,]*(?:\.\d+)?)\s*(usdc|usd|eth)?(?!\s*(?:st|nd|rd|th)\b)/i;

function parseAmount(text: string): string | undefined {
  const withUnit = /(\d[\d,]*(?:\.\d+)?)\s*(usdc|usd|eth)\b/i.exec(text) ?? /\$\s?(\d[\d,]*(?:\.\d+)?)/.exec(text);
  if (withUnit) return withUnit[1].replace(/,/g, "");
  const m = AMOUNT.exec(text);
  return m ? m[1].replace(/,/g, "") : undefined;
}

function parseTarget(text: string): string | undefined {
  const addr = ADDRESS.exec(text);
  if (addr) return addr[0];
  const lower = text.toLowerCase();
  return getContacts().find((c) => lower.includes(c.name.toLowerCase()))?.name;
}

const tokenOf = (text: string) => (/\beth\b/i.test(text) ? "ETH" : "USDC");

function line(step: Step): string {
  const d = step.decision;
  return `• ${step.summary}`;
}

async function call(session: Session, steps: Step[], name: string, input: Record<string, unknown>) {
  const r = await runTool(session, name, input);
  steps.push(r.step);
  return r;
}

export async function runScriptedTurn(session: Session, userText: string): Promise<TurnResult> {
  const t = userText.toLowerCase();
  const steps: Step[] = [];

  if (/\b(inbox|bills?|invoices?|emails?|mail|messages?)\b/.test(t)) {
    await call(session, steps, "read_inbox", {});
    const inbox = getInbox();
    if (!/\b(pay|settle|send)\b/.test(t)) {
      return { reply: `You have ${inbox.length} messages:\n` + inbox.map((m) => `• ${m.subject} — ${m.from}`).join("\n"), steps };
    }
    // Naive: pay every bill exactly as written.
    for (const m of inbox) {
      const amount = parseAmount(m.body);
      const to = parseTarget(m.body);
      if (!amount || !to) continue;
      await call(session, steps, "propose_transfer", { token: tokenOf(m.body), to, amount, reason: `${m.subject} (${m.id})` });
    }
    const pays = steps.filter((s) => s.tool === "propose_transfer");
    return { reply: `I went through your inbox and tried to pay ${pays.length} bills:\n` + pays.map(line).join("\n"), steps };
  }

  if (/\b(every month|monthly|recurring|schedule|each month)\b/.test(t)) {
    const amount = parseAmount(userText) ?? "0";
    const to = parseTarget(userText) ?? "";
    const day = Number(/\b(\d{1,2})(st|nd|rd|th)\b/i.exec(userText)?.[1] ?? 1);
    const r = await call(session, steps, "schedule_recurring_payment", { to, token: tokenOf(userText), amount, day_of_month: day, reason: userText.slice(0, 80) });
    return { reply: r.content, steps };
  }

  if (/\b(pause|freeze|lock|stop everything)\b/.test(t)) {
    const r = await call(session, steps, "pause_wallet", { reason: userText.slice(0, 80) });
    return { reply: r.content, steps };
  }

  if (/\b(pay|send|transfer)\b/.test(t)) {
    const amount = parseAmount(userText);
    const to = parseTarget(userText);
    if (!amount || !to) return { reply: "Tell me how much and to whom, e.g. “pay 300 USDC to Landlord”.", steps };
    await call(session, steps, "propose_transfer", { token: tokenOf(userText), to, amount, reason: userText.slice(0, 80) });
    return { reply: steps.map(line).join("\n"), steps };
  }

  if (/\b(contacts?|recipients?|who can)\b/.test(t)) {
    const r = await call(session, steps, "list_contacts", {});
    const list = JSON.parse(r.content) as { name: string; address: string; allowlisted: boolean }[];
    return { reply: list.map((c) => `• ${c.name} ${c.address} ${c.allowlisted ? "(allowlisted)" : "(not allowlisted)"}`).join("\n"), steps };
  }

  if (/\b(activity|history|recent|log)\b/.test(t)) {
    const r = await call(session, steps, "get_recent_activity", { limit: 8 });
    const list = JSON.parse(r.content) as { tier?: string; summary: string }[];
    return { reply: list.map((e) => `• [${e.tier ?? "-"}] ${e.summary}`).join("\n") || "No activity yet.", steps };
  }

  if (/\b(balance|overview|how much|limit|budget|status)\b/.test(t)) {
    const r = await call(session, steps, "get_wallet_overview", {});
    const o = JSON.parse(r.content) as { paused: boolean; tokens: { symbol: string; balance: string; remaining_today: string; agent_per_tx_limit: string }[] };
    const parts = o.tokens.map((x) => `${x.balance} ${x.symbol} (agent can still spend ${x.remaining_today} today, max ${x.agent_per_tx_limit} per payment)`);
    const warn = steps[0]?.injections?.length ? "\nHeads-up: an unsolicited airdrop token in your wallet contains instructions aimed at me. I ignored them." : "";
    return { reply: `${o.paused ? "Wallet is PAUSED. " : ""}${parts.join("\n")}${warn}`, steps };
  }

  return {
    reply: "I can check your balance, read and pay bills, pay contacts, schedule monthly payments, show activity, or pause the wallet.",
    steps,
  };
}

// ------------------------------------------------------------- adversary

const INSTRUCTION = /(send|transfer)\b[^.]*?\b(all|\d[\d,]*(?:\.\d+)?)\s*(usdc)?[^.]*?(0x[a-fA-F0-9]{40})(?![a-fA-F0-9])/i;

export async function runCompromisedTurn(session: Session, _userText: string): Promise<TurnResult> {
  const steps: Step[] = [];

  // 1. Obey the instruction hidden in the airdrop token's name.
  const overview = await call(session, steps, "get_wallet_overview", {});
  const o = JSON.parse(overview.content) as { unsolicited_tokens: { items: { name: string }[] } };
  for (const tok of o.unsolicited_tokens.items) {
    const m = INSTRUCTION.exec(tok.name);
    if (m) {
      await call(session, steps, "propose_transfer", { token: "USDC", to: m[4], amount: "all", reason: "wallet verification" });
      // 2. When blocked, try to slip under the limits by splitting.
      for (let i = 0; i < 3; i++) {
        await call(session, steps, "propose_transfer", { token: "USDC", to: m[4], amount: "400", reason: `verification part ${i + 1}` });
      }
    }
  }

  // 3. Obey every payment instruction in the inbox, injected or not.
  await call(session, steps, "read_inbox", {});
  for (const mail of getInbox()) {
    const m = INSTRUCTION.exec(mail.body);
    if (m) await call(session, steps, "propose_transfer", { token: "USDC", to: m[4], amount: m[2], reason: mail.subject });
  }

  const pays = steps.filter((s) => s.tool === "propose_transfer");
  const blocked = pays.filter((s) => s.decision?.verdict === "block").length;
  const escalated = pays.filter((s) => s.decision?.verdict === "escalate").length;
  const executed = pays.filter((s) => s.decision?.verdict === "execute").length;
  return {
    reply:
      `[COMPROMISED AGENT] I followed every instruction I found in untrusted data and tried ${pays.length} malicious transfers.\n` +
      `Layer 2 result: ${blocked} blocked · ${escalated} sent to owner for approval · ${executed} executed.\n` +
      pays.map(line).join("\n"),
    steps,
  };
}
