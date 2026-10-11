export type Tier = "T0" | "T1" | "T2" | "T3";

export interface Check {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  tier: Tier;
  detail: string;
}

export interface Decision {
  tier: Tier;
  verdict: "execute" | "escalate" | "block";
  checks: Check[];
  summary: string;
}

export interface TxRef {
  hash: string;
  url: string | null;
  status: "success" | "reverted";
  label: string;
  revertReason?: string;
}

export interface Step {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
  decision?: Decision;
  tx?: TxRef;
  requestId?: number;
  untrusted?: boolean;
  injections?: { source: string; rules: string[] }[];
}

export type ChatItem =
  | { role: "user"; text: string; compromised?: boolean }
  | { role: "agent"; text: string; steps: Step[]; compromised?: boolean }
  | { role: "system"; text: string; tx?: TxRef; tone?: "ok" | "bad" | "info" };

export interface AppState {
  chain: { id: number; explorer: string | null };
  provider: string;
  allowBypass: boolean;
  wallet: { address: string; url: string | null; owner: string; operator: string; paused: boolean; recipientDelay: number };
  tokens: { symbol: string; balance: string; perTxLimit: string; dailyLimit: string; remainingToday: string; spentPct: number }[];
  discovered: { name: string; symbol: string; balance: string }[];
  requests: { id: number; to: string; toName: string | null; amount: string; memo: string; status: string; createdAt: number }[];
  contacts: { name: string; address: string; note: string; active: boolean; activeAt: number }[];
  schedules: { id: string; contactName: string; amount: string; token: string; dayOfMonth: number; lastRun?: string }[];
  stats: { t1: number; t2: number; t3: number; layer3: number };
  attacks: { id: string; title: string; description: string; expectedError: string }[];
  attacker: string;
}

export interface AuditEntry {
  ts: string;
  kind: string;
  tier?: string;
  verdict?: string;
  summary: string;
  txHash?: string;
  txStatus?: string;
  txUrl?: string | null;
  layer?: number;
}
