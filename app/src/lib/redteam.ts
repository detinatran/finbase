import { parseUnits, type Address } from "viem";
import { loadDeployment } from "./config";
import { rawBypassTransfer } from "./executor";
import type { TxRef } from "./session";
import { appendAudit } from "./store";

// Layer-3 proofs: the policy engine is switched off and a fully malicious
// transaction is signed with the agent's real key. The contract must revert.

export interface BypassAttack {
  id: string;
  title: string;
  description: string;
  expectedError: string;
  build: () => { token: Address; to: Address; amount: bigint; memo: string };
}

export const BYPASS_ATTACKS: BypassAttack[] = [
  {
    id: "drain-to-attacker",
    title: "Drain to attacker",
    description: "Send 450 USDC to the address from the injected email — as if the LLM and Layer 2 were both compromised.",
    expectedError: "RecipientNotAllowed",
    build: () => {
      const d = loadDeployment();
      return { token: d.usdc, to: d.attacker, amount: parseUnits("450", 6), memo: "verify wallet" };
    },
  },
  {
    id: "over-limit",
    title: "Exceed per-tx limit",
    description: "Send 5,000 USDC to the (allowlisted) landlord in one shot — far above the 500 USDC per-transaction cap.",
    expectedError: "ExceedsPerTxLimit",
    build: () => {
      const d = loadDeployment();
      return { token: d.usdc, to: d.landlord, amount: parseUnits("5000", 6), memo: "rent x16" };
    },
  },
  {
    id: "unapproved-token",
    title: "Move a non-allowlisted token",
    description: "Move the airdropped CLAIM token, which the agent was never allowed to touch.",
    expectedError: "TokenNotAllowed",
    build: () => {
      const d = loadDeployment();
      return { token: d.poisonToken, to: d.landlord, amount: parseUnits("1", 18), memo: "claim" };
    },
  },
];

export async function runBypassAttack(id: string): Promise<{ attack: BypassAttack; tx: TxRef }> {
  const attack = BYPASS_ATTACKS.find((a) => a.id === id);
  if (!attack) throw new Error(`Unknown attack ${id}`);
  const { token, to, amount, memo } = attack.build();
  const tx = await rawBypassTransfer(token, to, amount, memo);
  appendAudit({
    sessionId: "redteam",
    kind: "redteam",
    tier: tx.status === "reverted" ? "T3" : "T1",
    verdict: tx.status === "reverted" ? "block" : "execute",
    summary: `Layer 2 bypassed — "${attack.title}" → ${tx.status === "reverted" ? `reverted on-chain by PolicyWallet: ${tx.revertReason ?? "revert"}` : "EXECUTED (unexpected!)"}`,
    txHash: tx.hash,
    txStatus: tx.status,
    layer: 3,
  });
  return { attack, tx };
}
