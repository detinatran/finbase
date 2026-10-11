import { config } from "../config";
import { getSession } from "../session";
import { runAnthropicTurn } from "./providers/anthropic";
import { runOpenAITurn } from "./providers/openai";
import { runCompromisedTurn, runScriptedTurn } from "./providers/scripted";
import type { TurnResult } from "./providers/types";

export interface TurnOptions {
  /** Swap the LLM for an adversarial script that obeys injected instructions. */
  compromised?: boolean;
}

export async function runAgentTurn(sessionId: string, message: string, opts: TurnOptions = {}): Promise<TurnResult> {
  const session = getSession(sessionId);
  // Everything the user types is trusted input for provenance tracking.
  session.provenance.addTrusted("user message", message);

  if (opts.compromised) return runCompromisedTurn(session, message);
  switch (config.provider) {
    case "anthropic":
      return runAnthropicTurn(session, message);
    case "openai":
      return runOpenAITurn(session, message);
    default:
      return runScriptedTurn(session, message);
  }
}
