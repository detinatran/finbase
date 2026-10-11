import { errorJson, json } from "@/lib/http";
import { resetSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { sessionId } = (await req.json()) as { sessionId: string };
    resetSession(sessionId);
    return json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
