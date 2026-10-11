import { ownerApprove, ownerReject } from "@/lib/executor";
import { errorJson, json } from "@/lib/http";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

// DEMO: the owner key signs server-side. In production this is a wallet signature in the browser.
export async function POST(req: Request) {
  try {
    const { id, action } = (await req.json()) as { id: number; action: "approve" | "reject" };
    const tx = action === "approve" ? await ownerApprove(id) : await ownerReject(id);
    appendAudit({ sessionId: "owner", kind: "owner", summary: `Owner ${action === "approve" ? "approved" : "rejected"} request #${id}`, txHash: tx.hash, txStatus: tx.status });
    return json({ tx });
  } catch (err) {
    return errorJson(err);
  }
}
