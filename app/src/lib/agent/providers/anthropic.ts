import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";
import type { Session, Step } from "../../session";
import { SYSTEM_PROMPT } from "../prompt";
import { runTool, TOOL_DEFS } from "../tools";
import type { TurnResult } from "./types";

const MAX_ITERATIONS = 10;
// Server-side refusal fallback is supported on these models (not on Haiku).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

let client: Anthropic | undefined;

export async function runAnthropicTurn(session: Session, userText: string): Promise<TurnResult> {
  client ??= new Anthropic();
  const model = config.anthropicModel;
  const messages = session.anthropicHistory;
  messages.push({ role: "user", content: userText });

  const tools: Anthropic.Beta.BetaTool[] = TOOL_DEFS.map((t) => ({ ...t, strict: true }));
  const steps: Step[] = [];
  const useFallback = FALLBACK_MODELS.has(model);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools,
      messages,
      output_config: { effort: "medium" },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    // Append the full content (incl. thinking blocks) unchanged — required to keep the conversation valid.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return { reply: "The model declined this request.", steps };
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text || "(no reply)", steps };
    }

    // Tools run sequentially on purpose: payments must not race each other.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const { step, content } = await runTool(session, tu.name, (tu.input ?? {}) as Record<string, unknown>);
      steps.push(step);
      results.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: !step.ok && step.summary.startsWith("Error") });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Stopped after too many steps.", steps };
}
