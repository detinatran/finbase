import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type { Decision, RecentTransfer } from "./policy/engine";
import { ProvenanceTracker } from "./policy/provenance";

export interface TxRef {
  hash: string;
  url: string | null;
  status: "success" | "reverted";
  label: string;
  revertReason?: string;
}

/** One agent tool call, as shown in the UI and the audit trail. */
export interface Step {
  tool: string;
  input: unknown;
  ok: boolean;
  summary: string;
  decision?: Decision;
  tx?: TxRef;
  requestId?: number;
  untrusted?: boolean;
  injections?: { source: string; rules: string[] }[];
}

export interface Session {
  id: string;
  provenance: ProvenanceTracker;
  recentTransfers: RecentTransfer[];
  anthropicHistory: Anthropic.Beta.BetaMessageParam[];
  openaiHistory: OpenAI.Chat.ChatCompletionMessageParam[];
}

const g = globalThis as unknown as { __leashSessions?: Map<string, Session> };
const sessions = (g.__leashSessions ??= new Map());

export function newSession(id: string): Session {
  return {
    id,
    provenance: new ProvenanceTracker(),
    recentTransfers: [],
    anthropicHistory: [],
    openaiHistory: [],
  };
}

export function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = newSession(id);
    sessions.set(id, s);
  }
  return s;
}

export function resetSession(id: string) {
  sessions.delete(id);
}
