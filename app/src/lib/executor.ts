import { BaseError, ContractFunctionRevertedError, parseEventLogs, type Address, type Hash } from "viem";
import { operatorClient, ownerClient, publicClient, walletAbi } from "./chain";
import { loadDeployment, txUrl } from "./config";
import type { TxRef } from "./session";

// The only code that signs transactions. The operator key can do exactly what
// the PolicyWallet lets an operator do — nothing more.

const MEMO_MAX = 140;
const cleanMemo = (m: string) => m.replace(/[\r\n]+/g, " ").slice(0, MEMO_MAX);

async function confirm(hash: Hash, label: string): Promise<TxRef & { logs: unknown[] }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, url: txUrl(hash), status: receipt.status, label, logs: receipt.logs };
}

/** Human-readable revert reason, e.g. "RecipientNotAllowed(0x...)". */
export function revertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      const args = (revert.data.args ?? []).map((a) => String(a)).join(", ");
      return `${revert.data.errorName}(${args})`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Layer 2.5: dry-run the exact call the operator would send. */
export async function simulateExecute(token: Address, to: Address, amount: bigint, memo: string, blockNumber?: bigint) {
  const d = loadDeployment();
  try {
    await publicClient.simulateContract({
      address: d.wallet,
      abi: walletAbi,
      functionName: "executeTransfer",
      args: [token, to, amount, cleanMemo(memo)],
      account: operatorClient().account,
      blockNumber,
    });
    return { ok: true as const };
  } catch (err) {
    const isRevert = err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError;
    return { ok: false as const, reason: revertReason(err), isRevert };
  }
}

export async function executeTransfer(token: Address, to: Address, amount: bigint, memo: string): Promise<TxRef> {
  const d = loadDeployment();
  const hash = await operatorClient().writeContract({
    address: d.wallet,
    abi: walletAbi,
    functionName: "executeTransfer",
    args: [token, to, amount, cleanMemo(memo)],
  });
  const { logs: _logs, ...tx } = await confirm(hash, "executeTransfer (T1)");
  return tx;
}

export async function requestTransfer(token: Address, to: Address, amount: bigint, memo: string) {
  const d = loadDeployment();
  const hash = await operatorClient().writeContract({
    address: d.wallet,
    abi: walletAbi,
    functionName: "requestTransfer",
    args: [token, to, amount, cleanMemo(memo)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [ev] = parseEventLogs({ abi: walletAbi, eventName: "TransferRequested", logs: receipt.logs });
  const tx: TxRef = { hash, url: txUrl(hash), status: receipt.status, label: "requestTransfer (T2)" };
  return { tx, requestId: ev ? Number(ev.args.id) : -1 };
}

export async function operatorPause(): Promise<TxRef> {
  const d = loadDeployment();
  const hash = await operatorClient().writeContract({ address: d.wallet, abi: walletAbi, functionName: "pause" });
  const { logs: _l, ...tx } = await confirm(hash, "pause (by agent)");
  return tx;
}

/**
 * RED-TEAM ONLY. Sends executeTransfer straight to the chain, skipping the
 * policy engine and the simulation, with a fixed gas limit so the node does
 * not refuse to broadcast a reverting call. Produces a reverted tx hash as
 * evidence that the contract alone stops the attack.
 */
export async function rawBypassTransfer(token: Address, to: Address, amount: bigint, memo: string): Promise<TxRef> {
  const d = loadDeployment();
  const hash = await operatorClient().writeContract({
    address: d.wallet,
    abi: walletAbi,
    functionName: "executeTransfer",
    args: [token, to, amount, cleanMemo(memo)],
    gas: 250_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const tx: TxRef = { hash, url: txUrl(hash), status: receipt.status, label: "raw executeTransfer (Layer 2 bypassed)" };
  if (receipt.status === "success") return tx;
  // Replay the same call to decode why it reverted: first at the block it was mined in, then at
  // latest (public RPCs behind a load balancer may not know a just-mined block yet).
  for (const blockNumber of [receipt.blockNumber, undefined, undefined]) {
    const sim = await simulateExecute(token, to, amount, memo, blockNumber);
    if (!sim.ok && sim.isRevert) return { ...tx, revertReason: sim.reason };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { ...tx, revertReason: "reverted" };
}

// ------------------------------------------------------------ owner (demo)

async function ownerWrite(
  functionName: "approveRequest" | "rejectRequest" | "unpause" | "addRecipient",
  args: readonly unknown[],
  label: string,
): Promise<TxRef> {
  const d = loadDeployment();
  const hash = await ownerClient().writeContract({
    address: d.wallet,
    abi: walletAbi,
    functionName,
    args,
  } as Parameters<ReturnType<typeof ownerClient>["writeContract"]>[0]);
  const { logs: _l, ...tx } = await confirm(hash, label);
  return tx;
}

export const ownerApprove = (id: number) => ownerWrite("approveRequest", [BigInt(id)], `approveRequest #${id} (owner)`);
export const ownerReject = (id: number) => ownerWrite("rejectRequest", [BigInt(id)], `rejectRequest #${id} (owner)`);
export const ownerUnpause = () => ownerWrite("unpause", [], "unpause (owner)");
export const ownerAddRecipient = (a: Address) => ownerWrite("addRecipient", [a], "addRecipient (owner)");
