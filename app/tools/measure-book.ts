/**
 * Build the design's missing `measure_probe` fixture, then measure the real manuscript.
 *
 * `docs/05` §1.6 item 6 fixes the probe as "one fixed passage per (language, audience band),
 * version-controlled in the repository", `197 _words_` of WEB, and derives the whole length
 * model from `words_per_line_measured = 197 / 27 = 7.3`. The file it names —
 * `fixtures/measure/probe.en.early.txt` — was **never created**, so the constant that the
 * fixture's word budget rests on had never been reproduced by anything.
 *
 * This does two things:
 *   1. materialises the probe from WEB (real verses, exactly 197 words) and measures it;
 *   2. measures the actual manuscript in the same box, so the page question can be answered
 *      from a render rather than from an assumed 7.3.
 *
 *   npx tsx tools/measure-book.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openMeasureSession } from "../src/measure.js";
import { WARM_PARCHMENT as D, linesPerPage, balancedCeilingLines } from "../src/tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const repo = resolve(app, "..");
const PROBE_WORDS = 197;

const norm = (s: string) =>
  s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();

async function buildProbe(): Promise<string> {
  const url = "https://bible-api.com/1%20Samuel%2017:1-16?translation=web";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const j = (await r.json()) as { verses: { text: string }[] };
  const text = norm(j.verses.map((v) => v.text).join(" "));
  const words = text.split(" ").slice(0, PROBE_WORDS).join(" ");
  return words;
}

const book = (await import(`${repo}/content/david-and-goliath.json`, { with: { type: "json" } }).catch(() => null)) as
  | { default: Record<string, unknown> }
  | null;

async function main() {
  const probeText = await buildProbe();
  const probeWords = probeText.split(/\s+/).filter(Boolean).length;

  const dir = resolve(repo, "fixtures/measure");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "probe.en.early.txt"), probeText + "\n", "utf8");

  const session = await openMeasureSession({ widthPx: D.box.width_px_css, dsg: D, lang: "en" });
  console.log(`measure — ${session.identity.engine} / ${session.identity.chromium_build}`);
  console.log(`  box ${session.widthPx.toFixed(6)} px_css = ${session.widthQ} q   clean container: ${session.container.ok}`);
  console.log(`  probe fixture written: fixtures/measure/probe.en.early.txt (${probeWords} words, WEB 1 Samuel 17:1-16)`);

  const probe = await session.measureOne(probeText, { id: "probe", role: "prose" });
  const wpl = probeWords / probe.lines;
  console.log(`\n  THE PROBE — what every budget in the set is derived from`);
  console.log(`    probe words      ${probeWords}`);
  console.log(`    probe line boxes ${probe.lines}`);
  console.log(`    words / line     ${wpl.toFixed(6)}  ->  round(_,1) = ${wpl.toFixed(1)}`);
  console.log(`    the documents claim  7.3   (197 / 27 = 7.296296)`);
  console.log(`    delta            ${(wpl - 7.296296).toFixed(6)}`);

  const LPP = linesPerPage(D);
  const CEIL = balancedCeilingLines(D);
  console.log(`\n  DERIVED FROM IT`);
  console.log(`    balanced ceiling ${CEIL} lines/page   capacity ${LPP} lines/page`);
  console.log(`    words/page_measured = ${CEIL} x ${wpl.toFixed(1)} = ${(CEIL * Number(wpl.toFixed(1))).toFixed(1)}`);
  console.log(`    budget = 9 x ${CEIL} x ${wpl.toFixed(1)} - 29.2 = ${(9 * CEIL * Number(wpl.toFixed(1)) - 29.2).toFixed(1)}`);
  console.log(`    the documents' budget 1022 ( = 9 x 16 x 7.3 - 29.2 )`);

  if (book?.default) {
    const b = book.default as {
      beats: { id: string; blocks: { id: string; role: string; text: string }[] }[];
    };
    console.log(`\n  THE ACTUAL MANUSCRIPT, measured in the same box`);
    const specs: { id: string; text: string; role?: string }[] = [];
    for (const beat of b.beats) {
      for (const blk of beat.blocks) specs.push({ id: blk.id, text: blk.text, role: blk.role });
    }
    specs.push({ id: "h_sample", text: "David and the Giant", role: "heading" });
    const measured = await session.measure(specs);
    const byId = new Map(measured.map((m) => [m.id, m]));

    let storyLines = 0;
    let headingLines = 0;
    const byRole = new Map<string, number>();
    for (const beat of b.beats) {
      let lines = 0;
      let words = 0;
      for (const blk of beat.blocks) {
        const m = byId.get(blk.id);
        if (!m) continue;
        lines += m.lines;
        words += m.words;
        byRole.set(blk.role, (byRole.get(blk.role) ?? 0) + m.lines);
        if (blk.role === "heading") headingLines += m.lines;
        else storyLines += m.lines;
      }
      console.log(`    ${beat.id.padEnd(12)} ${String(lines).padStart(3)} lines  (${words} words, ${lines} line boxes)`);
    }
    const h = byId.get("h_sample")!;
    const proseOnly = (byRole.get("prose") ?? 0) + (byRole.get("heading") ?? 0);
    const scriptureLines = byRole.get("scripture") ?? 0;
    console.log(`\n    BY ROLE (what actually occupies lines on a page)`);
    for (const [role, n] of [...byRole.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`      ${role.padEnd(12)} ${String(n).padStart(3)} lines`);
    }
    console.log(`\n    story prose + headings ${proseOnly} lines`);
    console.log(`    quoted scripture       ${scriptureLines} lines (displayed as passages, not prose)`);
    console.log(`    a heading costs        ${h.lines} lines (22.5 pt)`);
    const perPage = CEIL;
    console.log(`\n    at the balanced ceiling (${perPage} lines/page) nine story pages hold ${perPage * 9} lines`);
    console.log(`    prose only      ${proseOnly} lines  =>  ${(proseOnly / perPage).toFixed(2)} pages  =>  ${Math.ceil(proseOnly / perPage)} pages`);
    console.log(`    prose + verses  ${proseOnly + scriptureLines} lines  =>  ${((proseOnly + scriptureLines) / perPage).toFixed(2)} pages  =>  ${Math.ceil((proseOnly + scriptureLines) / perPage)} pages`);
    console.log(`    at full capacity (${LPP} lines/page) they hold ${LPP * 9} lines`);

    // the density the solver would see for a 9-page split
    console.log(`\n    per-page fill if spread over 9 pages (resolved band ${D.layout.resolved_density_band.sparse_below}/${D.layout.resolved_density_band.dense_above}):`);
    console.log(`      prose only      ${(proseOnly / 9).toFixed(1)} lines/page = ${(proseOnly / 9 / LPP).toFixed(4)} fill`);
    console.log(`      prose + verses  ${((proseOnly + scriptureLines) / 9).toFixed(1)} lines/page = ${((proseOnly + scriptureLines) / 9 / LPP).toFixed(4)} fill`);
    console.log(`      the balanced ceiling is ${CEIL}/${LPP} = ${(CEIL / LPP).toFixed(4)} fill`);
  }

  await session.close();
}

await main();
