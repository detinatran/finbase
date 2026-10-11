import { config } from "@/lib/config";
import { errorJson, json } from "@/lib/http";
import { runBypassAttack } from "@/lib/redteam";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!config.allowBypass) return json({ error: "Red-team bypass is disabled (ALLOW_REDTEAM_BYPASS)" }, { status: 403 });
  try {
    const { id } = (await req.json()) as { id: string };
    return json(await runBypassAttack(id));
  } catch (err) {
    return errorJson(err);
  }
}
