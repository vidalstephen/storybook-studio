/**
 * Verify the rendered book the way a reader experiences it: in a real browser, mobile first.
 *
 * Assertions, not impressions (docs/10 §... and the project's own §10.3 digital-rendering rules):
 *   - no horizontal overflow at any of the reference widths
 *   - no element wider than the viewport
 *   - no text clipped or hidden: every prose container's scrollHeight must fit its clientHeight
 *   - the page count the reader actually produces, versus the composition's claim
 *
 *   npx tsx tools/verify-reader.ts ../build/book.html
 */
import { chromium } from "playwright";
import { resolve } from "node:path";
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";

/** The browser the design pins (D-01) — the installed Playwright's own build may not be cached. */
function pinnedChromium(): string | undefined {
  const root = resolve(homedir(), ".cache/ms-playwright");
  if (!existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const b of builds) {
    for (const p of [resolve(root, b, "chrome-linux64/chrome"), resolve(root, b, "chrome-linux/chrome")]) {
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const file = resolve(process.argv[2] ?? "../build/book.html");
const WIDTHS = [360, 390, 768, 1024, 1440];

const exe = pinnedChromium();
console.log(`  browser: ${exe ?? "(playwright default)"}`);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto("file://" + file, { waitUntil: "load" });
await page.waitForTimeout(700);

console.log(`verify-reader — ${file}\n`);
let failures = 0;

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: w < 700 ? 640 : 900 });
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const over = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > de.clientWidth + 1 || b.right > de.clientWidth + 1;
      })
      .slice(0, 4)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} w=${Math.round(el.getBoundingClientRect().width)}`);

    // clipped text: a text container whose content is taller than the box it is allowed
    const clipped = [...document.querySelectorAll("p, li, blockquote, .sb-prose, [data-sb-text]")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.overflow === "visible") return false;
        return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      })
      .slice(0, 4)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} ${el.scrollHeight}>${el.clientHeight}`);

    const pages = document.querySelectorAll("[data-sb-page], .sb-page, section.page").length;
    // the reader exposes its own notion of a spread and of the visible print pages
    const spread = document.querySelectorAll("[data-sb-visible-pages], [data-sb-spread]").length;
    const vis = document.querySelector("[data-sb-visible-pages]");
    const visible = vis ? vis.getAttribute("data-sb-visible-pages") : null;
    const firstPage = document.querySelector("[data-sb-page], .sb-page");
    const prose = document.querySelector("p");
    const cs = prose ? getComputedStyle(prose) : null;
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      over,
      clipped,
      pages,
      spread,
      visible,
      fontSize: cs ? cs.fontSize : "?",
      lineHeight: cs ? cs.lineHeight : "?",
      family: cs ? cs.fontFamily.slice(0, 40) : "?",
    };
  });

  const ok = r.scrollW <= r.clientW + 1 && r.over.length === 0 && r.clipped.length === 0;
  if (!ok) failures++;
  console.log(`  ${String(w).padStart(4)}px  ${ok ? "ok  " : "FAIL"}  digital pages=${r.pages}  showing print pages=${r.visible ?? "?"}  hscroll=${r.scrollW > r.clientW + 1 ? "YES" : "no"}  clipped=${r.clipped.length}`);
  if (r.over.length) console.log(`         overflowing: ${r.over.join(", ")}`);
  if (r.clipped.length) console.log(`         clipped: ${r.clipped.join(", ")}`);
  if (w === 360) console.log(`         body type: ${r.fontSize}/${r.lineHeight}  ${r.family}`);
}

// does the reader advance, and how many pages does it think it has?
const nav = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button, [role=button]")].find((b) => /next|forward/i.test(b.getAttribute("aria-label") || b.textContent || ""));
  const before = document.querySelector("[data-sb-page].sb-current, .sb-page.current")?.getAttribute("data-sb-page") ?? "?";
  if (btn) btn.click();
  return { before, found: !!btn };
});
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const cur = document.querySelector("[data-sb-current], .sb-current, [aria-current=page]");
  const label = document.querySelector("[data-sb-progress], .sb-progress");
  return { current: cur ? (cur.getAttribute("data-sb-page") || cur.textContent.slice(0, 24)) : "?", progress: label ? label.textContent.trim().slice(0, 30) : "?" };
});
console.log(`\n  navigation: next button ${nav.found ? "found" : "NOT FOUND"} (was page ${nav.before}) -> now ${after.current}; progress label "${after.progress}"`);

await browser.close();
console.log(`\n  ${failures === 0 ? "PASS — no overflow, no clipped text at any reference width." : failures + " width(s) FAILED."}`);
process.exit(failures === 0 ? 0 : 1);
