import fs from "node:fs";
import path from "node:path";
import type { Address, Hex } from "viem";

// Outside Next.js (tsx scripts) we load .env.local ourselves.
if (!process.env.NEXT_RUNTIME) {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch {
    // no .env.local — fall back to the process environment
  }
}

export interface Deployment {
  chainId: number;
  deployBlock: number;
  wallet: Address;
  usdc: Address;
  poisonToken: Address;
  owner: Address;
  operator: Address;
  landlord: Address;
  university: Address;
  attacker: Address;
}

export type LlmProvider = "scripted" | "anthropic" | "openai";

export const config = {
  chainId: Number(process.env.CHAIN_ID ?? 31337),
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
  explorerUrl: (process.env.EXPLORER_URL ?? "").replace(/\/$/, ""),
  operatorKey: process.env.OPERATOR_PRIVATE_KEY as Hex | undefined,
  ownerKey: process.env.OWNER_PRIVATE_KEY as Hex | undefined,
  provider: (process.env.LLM_PROVIDER ?? "scripted") as LlmProvider,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  openaiModel: process.env.OPENAI_MODEL ?? "gemini-2.5-flash",
  openaiBaseUrl: process.env.OPENAI_BASE_URL,
  allowBypass: process.env.ALLOW_REDTEAM_BYPASS === "true",
  dataDir: path.resolve(process.cwd(), "data"),
};

export function deploymentPath(): string {
  return (
    process.env.DEPLOYMENT_FILE ??
    path.resolve(process.cwd(), "../contracts/deployments", `${config.chainId}.json`)
  );
}

let cached: Deployment | undefined;
export function loadDeployment(): Deployment {
  if (cached) return cached;
  const file = deploymentPath();
  if (!fs.existsSync(file)) {
    throw new Error(
      `No deployment found at ${file}. Run ./scripts/dev.sh (local) or the Base Sepolia deploy first.`,
    );
  }
  cached = JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
  return cached;
}

export function txUrl(hash: string): string | null {
  return config.explorerUrl ? `${config.explorerUrl}/tx/${hash}` : null;
}

export function addressUrl(address: string): string | null {
  return config.explorerUrl ? `${config.explorerUrl}/address/${address}` : null;
}
