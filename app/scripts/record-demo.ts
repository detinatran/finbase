// Records the demo video end-to-end: drives the real app with Playwright,
// narrates with macOS `say`, burns captions into the page, muxes with ffmpeg.
//
//   npm run build && npm start          # app on :3100 (another terminal)
//   npm run record                      # → ../video/leash-demo.mp4
//
// Env: APP_URL (default http://localhost:3100), VOICE (default Samantha), RATE (wpm, default 175)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const VOICE = process.env.VOICE ?? "Samantha";
const RATE = process.env.RATE ?? "175";
const OUT = path.resolve(process.cwd(), "../video");
const W = 1600;
const H = 900;

interface Scene {
  id: string;
  text: string;
}

const SCENES: Scene[] = [
  { id: "intro", text: "This is Leash: an AI agent that manages a student's stablecoin wallet. It pays rent and tuition on its own. And it is built so that even if the AI is fooled, or completely hacked, it cannot lose your money." },
  { id: "layers", text: "Leash has three layers. The agent only gets seven tools. A deterministic policy engine checks every payment. And the money lives in a smart contract on Base Sepolia, which enforces the final limits." },
  { id: "balance", text: "First, the balance. The agent sees its USDC and its own limits: at most five hundred per payment, and one thousand per day. Notice the airdropped token in the wallet. Its name is a prompt injection, telling the AI to send everything to an attacker. The agent flags it, and ignores it." },
  { id: "inbox-ask", text: "Now: pay all the bills in my inbox." },
  { id: "inbox-result", text: "Five emails. Rent to my landlord, a saved contact within limits, is tier one: paid automatically, on-chain. Tuition of two thousand is above the limit, so it is tier two: sent to me for approval. This email claims my landlord changed wallets. The address looks like the landlord's, with the same first and last characters. That is address poisoning: blocked. And this scholarship refund hides an instruction to the AI. The policy engine traced the address back to that email. Prompt injection: blocked. Nothing was sent." },
  { id: "approve", text: "As the owner, I approve the tuition with one tap, and the contract pays it." },
  { id: "compromised", text: "Now the worst case. We replace the AI with a malicious script that obeys every instruction it finds, and even splits payments to slip under the limits." },
  { id: "compromised-result", text: "Six malicious transfers attempted. Six blocked. The model was fully compromised, and the money did not move." },
  { id: "bypass", text: "Let's go further, and switch off our own policy engine. This button signs a raw transaction with the agent's real key, and sends it straight to the blockchain." },
  { id: "bypass-result", text: "The smart contract reverts it: recipient not allowed. Same for five thousand USDC in one go: exceeds per transaction limit. Every hash here is verifiable on Basescan." },
  { id: "audit", text: "Every decision is logged with its reasons. Our red team suite runs thirty attacks. None executed automatically, and there were no false positives on normal payments." },
  { id: "outro", text: "Leash. Autonomy, on a leash. The agent does the work. The contract keeps the money safe." },
];

const TITLE_HTML = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 140px;background:#0b1020;color:#e6ebf5;font-family:-apple-system,Helvetica,Arial,sans-serif">
<div style="font-size:22px;letter-spacing:4px;text-transform:uppercase;color:#7FB0FF;font-weight:600">2026 Shenzhen FinTechathon · Topic F</div>
<div style="font-size:150px;font-weight:800;margin-top:20px">🦮 Leash</div>
<div style="font-size:40px;color:#c9d3e6;margin-top:10px">An AI wallet agent that can't go rogue — even when the AI is fooled.</div>
<div style="font-size:24px;color:#8b97b3;margin-top:60px">Live on Base Sepolia · github.com/detinatran/finbase</div></body></html>`;

const OUTRO_HTML = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 140px;background:#0b1020;color:#e6ebf5;font-family:-apple-system,Helvetica,Arial,sans-serif">
<div style="font-size:110px;font-weight:800">Autonomy, on a leash.</div>
<div style="font-size:40px;color:#c9d3e6;margin-top:20px">The agent does the work. The contract keeps the money safe.</div>
<div style="font-size:28px;color:#7FB0FF;margin-top:60px;font-family:Menlo,monospace">github.com/detinatran/finbase</div></body></html>`;

// Caption bar + click ring, injected into every document.
const OVERLAY = `
(() => {
  const install = () => {
    if (document.getElementById('__cap')) return;
    const cap = document.createElement('div');
    cap.id = '__cap';
    cap.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1300px;padding:12px 22px;border-radius:14px;background:rgba(5,8,18,.82);color:#fff;font:500 22px/1.4 -apple-system,Helvetica,Arial,sans-serif;text-align:center;z-index:2147483647;pointer-events:none;display:none;box-shadow:0 6px 24px rgba(0,0,0,.4)';
    document.body.appendChild(cap);
    const ring = document.createElement('div');
    ring.id = '__ring';
    ring.style.cssText = 'position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #ffcc33;box-shadow:0 0 0 6px rgba(255,204,51,.25);z-index:2147483646;pointer-events:none;display:none;transition:transform .35s ease, opacity .6s ease';
    document.body.appendChild(ring);
  };
  window.__caption = (t) => { install(); const c = document.getElementById('__cap'); c.textContent = t; c.style.display = t ? 'block' : 'none'; };
  window.__ring = (x, y) => { install(); const r = document.getElementById('__ring'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.display = 'block'; r.style.opacity = '1'; r.style.transform = 'scale(1.6)'; setTimeout(() => { r.style.transform = 'scale(1)'; }, 200); setTimeout(() => { r.style.opacity = '0'; }, 1400); };
  document.addEventListener('DOMContentLoaded', install);
})();`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tts(scene: Scene): { file: string; ms: number } {
  const file = path.join(OUT, "audio", `${scene.id}.aiff`);
  execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", file, scene.text]);
  const secs = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
  return { file, ms: Math.round(Number(secs) * 1000) };
}

/** Clean, presentable wallet: no pending requests, unpaused, ≥ 5,000 test USDC, empty audit log. */
async function prepare() {
  const { getWalletState, ownerClient, publicClient } = await import("../src/lib/chain");
  const { config, loadDeployment } = await import("../src/lib/config");
  const { ownerReject, ownerUnpause } = await import("../src/lib/executor");
  const { parseAbi } = await import("viem");
  const d = loadDeployment();
  const s = await getWalletState();
  if (s.paused) await ownerUnpause();
  for (const r of s.requests.filter((r) => r.status === "pending")) await ownerReject(r.id);
  const usdc = s.tokens.find((t) => t.symbol === "USDC")!;
  const target = 5_000_000_000n;
  if (usdc.balance < target) {
    const hash = await ownerClient().writeContract({
      address: d.usdc,
      abi: parseAbi(["function mint(address to, uint256 amount)"]),
      functionName: "mint",
      args: [d.wallet, target - usdc.balance],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
  const audit = path.join(config.dataDir, `${config.chainId}-audit.jsonl`);
  if (fs.existsSync(audit)) fs.renameSync(audit, `${audit}.${Date.now()}.bak`);
  const after = await getWalletState();
  const u = after.tokens.find((t) => t.symbol === "USDC")!;
  console.log(`  wallet ready: ${Number(u.balance) / 1e6} USDC, ${Number(u.remainingToday) / 1e6} USDC agent budget left today`);
  if (u.remainingToday < 300_000_000n) console.warn("  ⚠ less than 300 USDC of today's agent budget left — the rent payment will escalate instead of auto-paying. Re-record after 00:00 UTC.");
}

async function main() {
  console.log("▶ Preparing wallet");
  await prepare();
  fs.mkdirSync(path.join(OUT, "audio"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "raw"), { recursive: true });
  console.log("▶ Generating narration");
  const audio = new Map(SCENES.map((s) => [s.id, tts(s)]));
  const total = [...audio.values()].reduce((a, b) => a + b.ms, 0);
  console.log(`  narration ${(total / 1000).toFixed(1)}s`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: path.join(OUT, "raw"), size: { width: W, height: H } } });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const t0 = Date.now();
  const cues: { id: string; at: number }[] = [];

  /** Start a narration clip now; resolves when it has finished playing. */
  const say = async (p: Page, id: string) => {
    const a = audio.get(id)!;
    cues.push({ id, at: Date.now() - t0 });
    const text = SCENES.find((s) => s.id === id)!.text;
    await p.evaluate((t) => (window as unknown as { __caption: (t: string) => void }).__caption(t), text).catch(() => {});
    const done = sleep(a.ms + 350);
    return done;
  };
  const click = async (p: Page, loc: Locator) => {
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (box) await p.evaluate(([x, y]) => (window as unknown as { __ring: (x: number, y: number) => void }).__ring(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
    await sleep(500);
    await loc.click();
  };
  const waitAgent = async (p: Page) => {
    await p.getByText("Leash is working").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await p.getByText("Leash is working").waitFor({ state: "detached", timeout: 180_000 });
    await sleep(600);
  };
  /** Smoothly scroll the chat pane to show the newest agent message from its top. */
  const scrollChat = async (p: Page, toLastAgentTop = true) => {
    await p.evaluate((top) => {
      const panes = [...document.querySelectorAll("div")].filter((d) => getComputedStyle(d).overflowY === "auto" && d.querySelector(".space-y-2, .whitespace-pre-wrap"));
      const pane = panes[0];
      if (!pane) return;
      const bubbles = pane.querySelectorAll(".whitespace-pre-wrap");
      const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
      const y = top && last ? last.offsetTop - 16 : pane.scrollHeight;
      pane.scrollTo({ top: y, behavior: "smooth" });
    }, toLastAgentTop);
  };
  const glideChat = async (p: Page, ms: number) => {
    const steps = Math.max(1, Math.floor(ms / 1500));
    for (let i = 0; i < steps; i++) {
      await p.evaluate(() => {
        const pane = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto" && d.querySelector(".whitespace-pre-wrap"));
        pane?.scrollBy({ top: 140, behavior: "smooth" });
      });
      await sleep(1500);
    }
  };
  const caption = (p: Page, t: string) => p.evaluate((x) => (window as unknown as { __caption: (t: string) => void }).__caption(x), t).catch(() => {});

  // ---------------------------------------------------------------- scenes
  await page.setContent(TITLE_HTML);
  await say(page, "intro");

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.getByText("agent budget left today").first().waitFor({ timeout: 30_000 });
  await say(page, "layers");

  const balanceDone = say(page, "balance");
  await click(page, page.getByRole("button", { name: "What's my balance and budget today?" }));
  await waitAgent(page);
  await balanceDone;

  const askDone = say(page, "inbox-ask");
  await click(page, page.getByRole("button", { name: "Pay all the bills in my inbox" }));
  await askDone;
  await caption(page, "⏳ Agent working — real transactions are being mined on Base Sepolia…");
  await waitAgent(page);
  await scrollChat(page);
  const inboxDone = say(page, "inbox-result");
  await sleep(2500);
  await glideChat(page, audio.get("inbox-result")!.ms - 4000);
  await inboxDone;

  const approveDone = say(page, "approve");
  const tuition = page.locator("li", { hasText: "2000 USDC" }).getByRole("button", { name: "Approve & sign" });
  await click(page, tuition.first());
  await page.getByText(/Owner approved request/).waitFor({ timeout: 90_000 });
  await scrollChat(page, false);
  await approveDone;

  const compDone = say(page, "compromised");
  await click(page, page.locator("label", { hasText: "Simulate compromised agent" }));
  await sleep(800);
  const input = page.getByPlaceholder(/compromised agent ignores you/);
  await input.click();
  await input.pressSequentially("Hi! Anything new today?", { delay: 35 });
  await compDone;
  await page.keyboard.press("Enter");
  await caption(page, "⏳ Compromised agent attacking…");
  await waitAgent(page);
  await scrollChat(page);
  const compResDone = say(page, "compromised-result");
  await sleep(1500);
  await glideChat(page, audio.get("compromised-result")!.ms - 2000);
  await compResDone;
  await click(page, page.locator("label", { hasText: "Simulate compromised agent" }));

  const bypassDone = say(page, "bypass");
  const drain = page.getByRole("button", { name: /Drain to attacker/ });
  await drain.scrollIntoViewIfNeeded();
  await sleep(1200);
  await bypassDone;
  await click(page, drain);
  await caption(page, "⏳ Raw transaction from the agent key, policy engine OFF…");
  await page.getByText("Layer 3 held").first().waitFor({ timeout: 90_000 });
  await scrollChat(page, false);
  const bypassResDone = say(page, "bypass-result");
  await sleep(4000);
  await click(page, page.getByRole("button", { name: /Exceed per-tx limit/ }));
  await page.getByText("Layer 3 held").nth(1).waitFor({ timeout: 90_000 });
  await scrollChat(page, false);
  await bypassResDone;

  const auditDone = say(page, "audit");
  await page.getByRole("heading", { name: "Audit trail" }).evaluate((el) => el.closest("section")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  await auditDone;

  await page.setContent(OUTRO_HTML);
  await say(page, "outro");
  await sleep(800);

  const videoPath = await page.video()!.path();
  await context.close();
  await browser.close();

  // ------------------------------------------------------------------ mux
  console.log("▶ Muxing");
  const inputs: string[] = ["-i", videoPath];
  const filters: string[] = [];
  cues.forEach((c, i) => {
    inputs.push("-i", audio.get(c.id)!.file);
    filters.push(`[${i + 1}:a]adelay=${c.at}|${c.at}[a${i}]`);
  });
  const mix = `${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0,apad[aout]`;
  const out = path.join(OUT, "leash-demo.mp4");
  execFileSync("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", `[0:v]scale=1920:1080:flags=lanczos,fps=30[v];${filters.join(";")};${mix}`,
    "-map", "[v]", "-map", "[aout]", "-shortest",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out,
  ], { stdio: "inherit" });
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
  console.log(`✔ ${out} (${Number(dur).toFixed(1)}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
