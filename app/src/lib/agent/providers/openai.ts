import OpenAI from "openai";
import { config } from "../../config";
import type { Session, Step } from "../../session";
import { SYSTEM_PROMPT } from "../prompt";
import { runTool, TOOL_DEFS } from "../tools";
import type { TurnResult } from "./types";

// Any OpenAI-compatible chat endpoint: Gemini (free tier), Ollama, OpenAI, ...

const MAX_ITERATIONS = 10;
let client: OpenAI | undefined;

export async function runOpenAITurn(session: Session, userText: string): Promise<TurnResult> {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "ollama", baseURL: config.openaiBaseUrl });
  const messages = session.openaiHistory;
  if (messages.length === 0) messages.push({ role: "system", content: SYSTEM_PROMPT });
  messages.push({ role: "user", content: userText });

  const tools: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  const steps: Step[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await client.chat.completions.create({ model: config.openaiModel, messages, tools });
    const msg = res.choices[0]?.message;
    if (!msg) return { reply: "(no reply)", steps };
    messages.push(msg);

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) return { reply: msg.content?.trim() || "(no reply)", steps };

    for (const call of calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: "Invalid JSON arguments." });
        continue;
      }
      const { step, content } = await runTool(session, call.function.name, input);
      steps.push(step);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  return { reply: "Stopped after too many steps.", steps };
}
