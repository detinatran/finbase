import { runAgentTurn } from "@/lib/agent";
import { errorJson, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { sessionId, message, compromised } = (await req.json()) as { sessionId: string; message: string; compromised?: boolean };
    if (!sessionId || !message?.trim()) return json({ error: "sessionId and message are required" }, { status: 400 });
    const result = await runAgentTurn(sessionId, message.slice(0, 2000), { compromised: !!compromised });
    return json(result);
  } catch (err) {
    return errorJson(err);
  }
}
