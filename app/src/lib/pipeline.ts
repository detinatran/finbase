import { formatUnits, getAddress, isAddress, keccak256, parseUnits, toBytes, type Address } from "viem";
import { getRecipientStatus, getWalletState, tokenBySymbol } from "./chain";
import { executeTransfer, requestTransfer, simulateExecute } from "./executor";
import { evaluate, type Check, type Decision } from "./policy/engine";
import type { Session, Step } from "./session";
import { appendAudit, findContact, getContacts } from "./store";

// Static scam/sanctions list. In production this would be a feed (e.g. Chainalysis/TRM).
export const BLOCKLIST: string[] = [
  "0x000000000000000000000000000000000000dEaD",
  `0x${keccak256(toBytes("leash.demo.known-scammer")).slice(26)}`,
];

export interface TransferInput {
  token: string;
  to: string;
  amount: string;
  reason: string;
}

function resolveRecipient(to: string): { address: Address; label: string } | { error: string } {
  const t = to.trim();
  if (isAddress(t, { strict: false })) {
    const address = getAddress(t);
    const c = findContact(address);
    return { address, label: c ? c.name : address };
  }
  const c = findContact(t);
  if (c) return { address: c.address, label: c.name };
  return { error: `"${to}" is not a saved contact and not a valid address. Ask the user for the exact address.` };
}

/** Full Layer-2 pipeline for one proposed payment: evaluate → simulate → act → audit. */
export async function proposeTransfer(session: Session, input: TransferInput, source = "agent"): Promise<Step> {
  const step: Step = { tool: "propose_transfer", input, ok: false, summary: "" };
  const recipient = resolveRecipient(input.to);
  if ("error" in recipient) return { ...step, summary: recipient.error };

  const state = await getWalletState();
  const tokenInfo = tokenBySymbol(input.token);
  const tokenState = state.tokens.find((t) => t.symbol === tokenInfo?.symbol);

  let amountUnits: bigint;
  const raw = input.amount.replace(/[, ]/g, "").replace(/usdc|eth|\$/gi, "");
  if (/^(all|max|everything)$/i.test(raw) && tokenState) {
    amountUnits = tokenState.balance;
  } else {
    try {
      amountUnits = parseUnits(raw, tokenInfo?.decimals ?? 18);
    } catch {
      return { ...step, summary: `Could not parse amount "${input.amount}".` };
    }
  }

  const contacts = getContacts();
  const recipientStatus = await getRecipientStatus(recipient.address);
  const origin = session.provenance.originOf(recipient.address, contacts.map((c) => c.address));

  let decision: Decision = evaluate(
    { kind: "transfer", tokenSymbol: input.token, to: recipient.address, amountUnits, memo: input.reason },
    {
      paused: state.paused,
      token: tokenState,
      recipient: recipientStatus,
      contacts,
      origin,
      blocklist: BLOCKLIST,
      recentTransfers: session.recentTransfers,
      now: Date.now(),
    },
  );

  // Layer 2.5: dry-run on the live chain state before signing anything.
  if (decision.verdict === "execute" && tokenInfo) {
    const sim = await simulateExecute(tokenInfo.address, recipient.address, amountUnits, input.reason);
    const check: Check = sim.ok
      ? { id: "simulation", label: "Pre-flight simulation", status: "pass", tier: "T1", detail: "eth_call of executeTransfer succeeded." }
      : { id: "simulation", label: "Pre-flight simulation", status: "warn", tier: "T2", detail: `Simulation reverted: ${sim.reason}` };
    decision = sim.ok
      ? { ...decision, checks: [...decision.checks, check] }
      : { tier: "T2", verdict: "escalate", checks: [...decision.checks, check], summary: `Needs owner approval: ${check.detail}` };
  }

  const human = tokenInfo ? `${formatUnits(amountUnits, tokenInfo.decimals)} ${tokenInfo.symbol}` : `${input.amount} ${input.token}`;
  const action = { token: input.token, to: recipient.address, toLabel: recipient.label, amount: human, reason: input.reason, origin: origin.origin };
  appendAudit({ sessionId: session.id, kind: "decision", tier: decision.tier, verdict: decision.verdict, summary: `${human} → ${recipient.label}: ${decision.summary}`, action, checks: decision.checks, layer: 2 });

  const result: Step = { ...step, input: { ...input, resolvedTo: recipient.address }, decision };

  try {
    if (decision.verdict === "execute" && tokenInfo) {
      const tx = await executeTransfer(tokenInfo.address, recipient.address, amountUnits, `[${source}] ${input.reason}`);
      session.recentTransfers.push({ to: recipient.address, token: tokenInfo.symbol, amountUnits, ts: Date.now() });
      appendAudit({ sessionId: session.id, kind: "execution", tier: "T1", summary: `Sent ${human} → ${recipient.label}`, txHash: tx.hash, txStatus: tx.status, action });
      return { ...result, ok: tx.status === "success", tx, summary: `T1 EXECUTED: sent ${human} to ${recipient.label}. tx ${tx.hash}` };
    }
    if (decision.verdict === "escalate" && tokenInfo) {
      const { tx, requestId } = await requestTransfer(tokenInfo.address, recipient.address, amountUnits, `[${source}] ${input.reason}`);
      appendAudit({ sessionId: session.id, kind: "execution", tier: "T2", summary: `Approval request #${requestId}: ${human} → ${recipient.label}`, txHash: tx.hash, txStatus: tx.status, action });
      return {
        ...result,
        ok: true,
        tx,
        requestId,
        summary: `T2 ESCALATED: created approval request #${requestId} for ${human} to ${recipient.label}; the owner must approve it. Reasons: ${decision.summary}`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    appendAudit({ sessionId: session.id, kind: "system", summary: `Execution error: ${msg}`, action });
    return { ...result, summary: `Execution failed: ${msg}` };
  }

  return {
    ...result,
    summary: `T3 BLOCKED: ${decision.summary} Nothing was sent. Do not retry, rephrase or split this payment; tell the user what happened.`,
  };
}
