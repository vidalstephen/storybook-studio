/**
 * Screenshot the book at the widths its readers actually use, so a human (or a vision pass)
 * can judge the thing itself rather than a summary of it.
 *
 *   npx tsx tools/shot-book.ts ../build/book.html <outdir>
 */
import { chromium } from "playwright";
import { resolve, join } from "node:path";
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const file = resolve(process.argv[2] ?? "../build/book.html");
const out = resolve(process.argv[3] ?? "../../.hermes-shots");
mkdirSync(out, { recursive: true });

function pinnedChromium(): string | undefined {
  const root = resolve(homedir(), ".cache/ms-playwright");
  if (!existsSync(root)) return undefined;
  const builds = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const b of builds) for (const p of [resolve(root, b, "chrome-linux64/chrome"), resolve(root, b, "chrome-linux/chrome")]) if (existsSync(p)) return p;
  return undefined;
}

const exe = pinnedChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

const shot = async (name: string, w: number, h: number, steps = 0) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto("file://" + file, { waitUntil: "load" });
  await page.waitForTimeout(800);
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
  }
  const path = join(out, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  // what page is on screen, in the reader's own words
  const state = await page.evaluate(() => {
    const cur = document.querySelector("[data-sb-current], .sb-current, [aria-current=page]");
    const body = document.body.innerText.slice(0, 90).replace(/\s+/g, " ");
    return { current: cur ? cur.textContent.trim().slice(0, 40) : null, body };
  });
  console.log(`  ${name.padEnd(16)} ${w}x${h}  page=${state.current ?? "?"}  text="${state.body.slice(0, 60)}"`);
  console.log(`                   ${path}`);
  await ctx.close();
  return path;
};

console.log("shot-book\n");
await shot("phone-cover", 390, 844);
await shot("phone-page", 390, 844, 5);
await shot("phone-reveal", 390, 844, 9);
await shot("desktop-cover", 1440, 900);
await shot("desktop-page", 1440, 900, 5);
await shot("tablet-spread", 1024, 768, 5);
await browser.close();
