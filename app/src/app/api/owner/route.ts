import { getAddress, isAddress } from "viem";
import { ownerAddRecipient, ownerUnpause } from "@/lib/executor";
import { errorJson, json } from "@/lib/http";
import { addContact, appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action: "unpause" | "addContact"; name?: string; address?: string; note?: string };
    if (body.action === "unpause") {
      const tx = await ownerUnpause();
      appendAudit({ sessionId: "owner", kind: "owner", summary: "Owner unpaused the wallet", txHash: tx.hash, txStatus: tx.status });
      return json({ tx });
    }
    if (body.action === "addContact") {
      if (!body.name?.trim() || !body.address || !isAddress(body.address, { strict: false })) {
        return json({ error: "name and a valid address are required" }, { status: 400 });
      }
      const address = getAddress(body.address);
      const tx = await ownerAddRecipient(address);
      addContact({ name: body.name.trim().slice(0, 40), address, note: body.note?.slice(0, 80) ?? "" });
      appendAudit({ sessionId: "owner", kind: "owner", summary: `Owner added contact ${body.name} (${address}) to the allowlist`, txHash: tx.hash, txStatus: tx.status });
      return json({ tx });
    }
    return json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return errorJson(err);
  }
}
