/**
 * probe-divergence.mts — the evidence for the words-per-line finding.
 *
 *   npx tsx tools/probe-divergence.mts
 *
 * `docs/05` §1.6 item 6 and `docs/16` §1.2 record `words_per_line_measured = 7.3`,
 * derived as `round(197 / 27, 1)` — the fixed probe passage spanning **27 line boxes**
 * at the reference page box. This tool measures the actual probe file through the same
 * pinned-Chromium bridge and reports how many line boxes it really occupies, then sweeps
 * the container width and the font size so the divergence can be attributed.
 *
 * The line count is taken from the element's border-box height divided by the line pitch
 * (`size_px_css x line_height`), which is the geometry the paginator packs with
 * (docs/08 §9.3, docs/07 §4.1). `Range.getClientRects().length` is ALSO printed, because
 * a line that wraps around an inline boundary comes back as more than one fragment rect
 * and the raw count therefore over-reports.
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

function exe(): string {
	const root = join(homedir(), ".cache", "ms-playwright");
	const builds = readdirSync(root)
		.filter((n) => /^chromium-\d+$/.test(n))
		.map((n) => ({ n, num: Number(n.split("-")[1]) }))
		.sort((a, b) => b.num - a.num);
	return join(root, builds[0].n, "chrome-linux64/chrome");
}

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
	pathResolve(here, "..", "..", "fixtures/measure/probe.en.early.txt"),
	pathResolve(here, "..", "fixtures/measure/probe.en.early.txt"),
	pathResolve(process.cwd(), "fixtures/measure/probe.en.early.txt"),
];
const file = candidates.find((c) => existsSync(c));
if (!file) {
	console.error("probe-divergence: fixtures/measure/probe.en.early.txt not found");
	process.exit(2);
}
const text = readFileSync(file, "utf8");
const words = text.trim().split(/\s+/).filter(Boolean).length;
const chars = text.length;

console.log(`probe file : ${file}`);
console.log(`             ${words} words, ${chars} characters, ${(chars - words) / words >= 0 ? (chars / words).toFixed(3) : "?"} chars/word incl. space`);

const FAMILY = "Lora, 'Iowan Old Style', Georgia, serif";
const REF_W = 96 * (96 / 25.4); // 362.8346... px_css = 23221 q

const b = await chromium.launch({ executablePath: exe() });
console.log(`engine     : playwright-chromium ${b.version()}\n`);

async function measure(widthPx: number, sizePx: number, family: string, lineHeight: number, hyphenate: boolean) {
	const ctx = await b.newContext({ deviceScaleFactor: 1, viewport: { width: 1280, height: 800 } });
	const p = await ctx.newPage();
	await p.setContent(`<!doctype html><html lang="en"><head><meta charset=utf-8><style>
html,body{margin:0;padding:0}
#m{position:absolute;left:-100000px;top:0;padding:0;margin:0;border:0;box-sizing:content-box;visibility:hidden}
#m p{margin:0;padding:0;border:0;text-align:left;text-indent:0}
</style></head><body><div id="m"><p id="q"></p></div></body></html>`);
	const r = await p.evaluate(
		({ w, s, f, lh, hy, t }) => {
			const m = document.getElementById("m") as HTMLElement;
			m.style.width = `${w}px`;
			const q = document.getElementById("q") as HTMLElement;
			q.style.fontFamily = f;
			q.style.fontSize = `${s}px`;
			q.style.lineHeight = String(lh);
			q.style.hyphens = hy ? "auto" : "manual";
			(q.style as unknown as Record<string, string>)["webkitHyphens"] = hy ? "auto" : "manual";
			q.textContent = t;
			void m.offsetHeight;
			const range = document.createRange();
			range.selectNodeContents(q);
			const rects = [...range.getClientRects()];
			const tops = new Set(rects.map((x) => Math.round(x.top * 64)));
			return {
				fragments: rects.length,
				distinctTops: tops.size,
				elementH: q.getBoundingClientRect().height,
				contentW: m.getBoundingClientRect().width,
				contentWq: Math.round(m.getBoundingClientRect().width * 64),
			};
		},
		{ w: widthPx, s: sizePx, f: family, lh: lineHeight, hy: hyphenate, t: text },
	);
	await ctx.close();
	const pitch = sizePx * lineHeight;
	const lines = Math.max(1, Math.round(r.elementH / pitch));
	return { ...r, pitch, lines };
}

console.log("A. the reference case — exactly what docs/05 §1.6 item 6 prescribes");
const ref = await measure(REF_W, 18, FAMILY, 1.5, true);
console.log(`   container            ${ref.contentW.toFixed(6)} px_css  (${ref.contentWq} q)  <- docs/08 §9.2 gives ${23221} q`);
console.log(`   line pitch           ${ref.pitch} px_css`);
console.log(`   element box height   ${ref.elementH} px_css`);
console.log(`   LINE BOXES           ${ref.lines}          <- the documents claim 27`);
console.log(`   (Range fragment rects ${ref.fragments}; distinct line tops ${ref.distinctTops})`);
console.log(`   words / line         ${(words / ref.lines).toFixed(6)}   <- the documents claim ${(197 / 27).toFixed(6)}`);
console.log(`   rounded               ${(Math.round((words / ref.lines) * 10) / 10).toFixed(1)}        <- the documents record 7.3`);
console.log(`   delta                ${(words / ref.lines - 7.3).toFixed(4)} words/line  (${(((words / ref.lines) / 7.3 - 1) * 100).toFixed(1)} %)`);
console.log(`   implied mean advance ${(ref.contentW / (chars / ref.lines)).toFixed(3)} px_css = ${(ref.contentW / (chars / ref.lines) / 18).toFixed(3)} em`);
console.log(`                        (docs/09 §1.7 assumes a 0.5 em mean advance = 40.315 chars/line)`);
console.log(
	`   actual mean line      ${(chars / ref.lines).toFixed(2)} chars/line  (docs/09 §1.7 says 40.315)`,
);

console.log("\nB. what the documents' 27 line boxes would require (same probe text)");
for (const w of [280, 300, 320, 336, 362.8346, 380, 400]) {
	const r = await measure(w, 18, FAMILY, 1.5, true);
	console.log(`   content width ${String(w).padEnd(10)} ${String(r.contentWq).padStart(6)} q  ->  ${String(r.lines).padStart(3)} line boxes  wpl ${(words / r.lines).toFixed(4)}`);
}

console.log("\nC. font size (what 27 boxes would need on a 362.83 px measure)");
for (const s of [18, 19, 20, 21, 22, 24]) {
	const r = await measure(REF_W, s, FAMILY, 1.5, true);
	console.log(`   body ${String(s).padEnd(4)} px_css  (${(s / (4 / 3)).toFixed(2)} pt)  ->  ${String(r.lines).padStart(3)} line boxes  wpl ${(words / r.lines).toFixed(4)}`);
}

console.log("\nD. family substitution (a missing webfont silently changes the metrics — docs/08 §7.2)");
for (const f of [FAMILY, "Georgia, serif", "'Times New Roman', serif", "serif", "sans-serif"]) {
	const r = await measure(REF_W, 18, f, 1.5, true);
	console.log(`   ${f.padEnd(38)} ->  ${String(r.lines).padStart(3)} line boxes  wpl ${(words / r.lines).toFixed(4)}`);
}

console.log("\nE. hyphens:auto vs manual (the design declares hyphenate: true — docs/04 §6.1)");
for (const hy of [true, false]) {
	const r = await measure(REF_W, 18, FAMILY, 1.5, hy);
	console.log(`   hyphens ${hy ? "auto  " : "manual"} ->  ${String(r.lines).padStart(3)} line boxes  wpl ${(words / r.lines).toFixed(4)}`);
}

await b.close();
