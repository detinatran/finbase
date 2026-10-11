// Captures real proof screenshots for slides/README: Basescan pages of the
// deployed wallet and of transactions from docs/EXECUTION_EVIDENCE.md.
//   npx tsx scripts/capture-proof.ts <name>=<url> ...
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.resolve(process.cwd(), "../video/proof");
const targets = process.argv.slice(2).map((a) => {
  const i = a.indexOf("=");
  return { name: a.slice(0, i), url: a.slice(i + 1) };
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
for (const t of targets) {
  await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(9000);
  if (t.name.includes("revert")) {
    await page.getByText("Show revert reason").first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const title = await page.title();
  await page.screenshot({ path: path.join(OUT, `${t.name}.png`) });
  console.log(`${t.name}: "${title}"`);
}
await browser.close();
