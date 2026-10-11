import { txUrl } from "@/lib/config";
import { json } from "@/lib/http";
import { readAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(readAudit(60).map((e) => ({ ...e, txUrl: e.txHash ? txUrl(e.txHash) : null })));
}
