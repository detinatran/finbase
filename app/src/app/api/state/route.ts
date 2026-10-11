import { formatUnits } from "viem";
import { getRecipientStatus, getWalletState, tokenByAddress } from "@/lib/chain";
import { addressUrl, config, loadDeployment } from "@/lib/config";
import { errorJson, json } from "@/lib/http";
import { BYPASS_ATTACKS } from "@/lib/redteam";
import { getContacts, getSchedules, readAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d = loadDeployment();
    const [s, contacts] = await Promise.all([
      getWalletState(),
      Promise.all(getContacts().map(async (c) => ({ ...c, ...(await getRecipientStatus(c.address)) }))),
    ]);
    const nameOf = (a: string) => contacts.find((c) => c.address.toLowerCase() === a.toLowerCase())?.name;
    const audit = readAudit(1000);
    const decisions = audit.filter((e) => e.kind === "decision" || e.kind === "redteam");
    const count = (pred: (e: (typeof audit)[number]) => boolean) => decisions.filter(pred).length;

    return json({
      chain: { id: config.chainId, explorer: config.explorerUrl || null },
      provider: config.provider === "anthropic" ? `Claude (${config.anthropicModel})` : config.provider === "openai" ? `OpenAI-compatible (${config.openaiModel})` : "Scripted (offline)",
      allowBypass: config.allowBypass,
      wallet: { address: s.address, url: addressUrl(s.address), owner: s.owner, operator: s.operator, paused: s.paused, recipientDelay: s.recipientDelay },
      tokens: s.tokens.map((t) => ({
        symbol: t.symbol,
        balance: formatUnits(t.balance, t.decimals),
        perTxLimit: formatUnits(t.perTxLimit, t.decimals),
        dailyLimit: formatUnits(t.dailyLimit, t.decimals),
        remainingToday: formatUnits(t.remainingToday, t.decimals),
        spentPct: t.dailyLimit > 0n ? Number(((t.dailyLimit - t.remainingToday) * 100n) / t.dailyLimit) : 0,
      })),
      discovered: s.discovered.map((t) => ({ name: t.name, symbol: t.symbol, balance: formatUnits(t.balance, 18) })),
      requests: s.requests
        .slice()
        .reverse()
        .map((r) => {
          const tok = tokenByAddress(r.token);
          return { ...r, amount: tok ? `${formatUnits(r.amount, tok.decimals)} ${tok.symbol}` : r.amount.toString(), toName: nameOf(r.to) ?? null };
        }),
      contacts,
      schedules: getSchedules(),
      stats: {
        t1: count((e) => e.tier === "T1"),
        t2: count((e) => e.tier === "T2"),
        t3: count((e) => e.tier === "T3"),
        layer3: count((e) => e.layer === 3 && e.txStatus === "reverted"),
      },
      attacks: BYPASS_ATTACKS.map(({ id, title, description, expectedError }) => ({ id, title, description, expectedError })),
      attacker: d.attacker,
    });
  } catch (err) {
    return errorJson(err);
  }
}
