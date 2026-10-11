import { errorJson, json } from "@/lib/http";
import { runDueSchedules } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { date } = (await req.json().catch(() => ({}))) as { date?: string };
    const steps = await runDueSchedules(date ? new Date(date) : new Date());
    return json({ steps });
  } catch (err) {
    return errorJson(err);
  }
}
