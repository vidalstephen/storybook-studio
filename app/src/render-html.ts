/**
 * The interactive HTML storybook emitter.
 *
 *     npx tsx src/render-html.ts                       # content + build if present, else the sample
 *     npx tsx src/render-html.ts --fixture            # force the bundled sample pair
 *     npx tsx src/render-html.ts --defects            # the sample with an unresolved reference,
 *                                                     #   so the disclosure path is exercised
 *     npx tsx src/render-html.ts --book <b> --composition <c> --out <o>
 *
 * It writes **one** self-contained file: no network at read time, everything inline, opens from
 * `file://`. It then asserts that property on the bytes it wrote, and fails loudly if it does not
 * hold. The design revision is compiled into `--sb-*` custom properties by `reader/design.ts`;
 * nothing here invents a value.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { WARM_PARCHMENT as DESIGN, formatChecks, linesPerPage, balancedCeilingLines } from "./tokens.js";
import type { Book, Composition } from "./contracts.js";
import { assertOffline, describe as describeResult, renderHtml } from "./reader/pack.js";
import { effectiveScaleSteps, droppedScaleSteps, frameChecks, projectLeaf, readabilityMinMeasurePx } from "./reader/design.js";
import { buildFlow } from "./reader/content.js";
import { SAMPLE_BOOK, SAMPLE_COMPOSITION, SAMPLE_COMPOSITION_WITH_DEFECTS } from "./reader/fixture.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const REPO = path.resolve(APP, "..");

interface Args {
  readonly book: string;
  readonly composition: string;
  readonly out: string;
  readonly fixture: boolean;
  readonly defects: boolean;
  readonly quiet: boolean;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string, dflt: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    book: get("--book", path.join(REPO, "content", "david-and-goliath.json")),
    composition: get("--composition", path.join(REPO, "build", "composition.json")),
    out: get("--out", path.join(REPO, "build", "book.html")),
    fixture: argv.includes("--fixture"),
    defects: argv.includes("--defects"),
    quiet: argv.includes("--quiet"),
    json: argv.includes("--json"),
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** Any `woff2` in `app/assets/fonts` or `app/fonts` whose name matches a token family, inlined. */
function collectFonts(families: readonly string[]): { map: Map<string, { base64: string; weight: string; style: string }>; dirs: string[] } {
  const map = new Map<string, { base64: string; weight: string; style: string }>();
  const dirs = [path.join(APP, "assets", "fonts"), path.join(APP, "fonts")].filter((d) => existsSync(d));
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".woff2")) continue;
      const family = families.find((fam) => f.toLowerCase().startsWith(fam.toLowerCase()));
      if (!family || map.has(family)) continue;
      const style = /italic|oblique/i.test(f) ? "italic" : "normal";
      const weight = /bold/i.test(f) ? "700" : "400";
      map.set(family, { base64: readFileSync(path.join(dir, f)).toString("base64"), weight, style });
    }
  }
  return { map, dirs };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const provenance: string[] = [];
  let book: Book;
  let cmp: Composition;

  // `--defects` renders the bundled sample *with* its deliberate resolution failure, so the
  // disclosure path is exercised on demand rather than assumed (`--fixture` renders the clean one).
  const haveReal = !args.fixture && !args.defects && existsSync(args.book) && existsSync(args.composition);
  if (haveReal) {
    book = readJson<Book>(args.book);
    cmp = readJson<Composition>(args.composition);
    provenance.push(`  manuscript: ${path.relative(REPO, args.book)}`);
    provenance.push(`  composition: ${path.relative(REPO, args.composition)}`);
  } else {
    book = SAMPLE_BOOK;
    cmp = args.defects ? SAMPLE_COMPOSITION_WITH_DEFECTS : SAMPLE_COMPOSITION;
    provenance.push(
      `  SAMPLE DATA — ${path.relative(REPO, args.book)} or ${path.relative(REPO, args.composition)} is not on disk,`,
      `  so this artifact was rendered from src/reader/fixture.ts (a small contract-conforming pair).`,
      `  Re-run this emitter once the real pair exists and this file is replaced.`,
    );
    if (args.defects) provenance.push(`  --defects: the sample carries an unresolved composition reference on purpose.`);
  }

  const families = [DESIGN.typography.body.family.split(",")[0].trim(), DESIGN.typography.display.family.split(",")[0].trim()];
  const { map: inlinedFonts, dirs } = collectFonts(families);

  const result = renderHtml({ book, composition: cmp, design: DESIGN, inlinedFonts, provenance });
  const flow = buildFlow(book, cmp);

  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, result.html, "utf8");

  // --- the assertions a reviewer can re-run without a browser ---------------------------------
  const written = readFileSync(args.out, "utf8");
  const offline = assertOffline(written);
  const checks = frameChecks(DESIGN);
  const bad = checks.filter((c) => !c.ok);
  const L = projectLeaf(DESIGN);
  const scaleSteps = effectiveScaleSteps(DESIGN);
  const dropped = droppedScaleSteps(DESIGN);

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          out: path.relative(REPO, args.out),
          bytes: Buffer.byteLength(written, "utf8"),
          book_id: book.id,
          composition_id: cmp.id,
          sample: !haveReal,
          defects: args.defects,
          offline,
          frame_checks: checks,
          effective_scale_steps: scaleSteps,
          dropped_scale_steps: dropped,
          plan_pages: flow.planPages.length,
          blocks: flow.counts,
          toc: flow.toc.length,
          disclosures: result.disclosures,
          words_per_page: {
            lines_per_page: linesPerPage(DESIGN),
            balanced_ceiling_lines: balancedCeilingLines(DESIGN),
            words_per_line: flow.wordsPerLine,
            min_measure_px: +readabilityMinMeasurePx(DESIGN, flow.wordsPerLine).toFixed(2),
          },
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(offline.length === 0 && bad.length === 0 ? 0 : 1);
  }

  if (!args.quiet) {
    const rel = path.relative(REPO, args.out);
    console.log(`Storybook Studio — interactive HTML storybook`);
    console.log(`  out              ${rel}`);
    console.log(describeResult(result, flow));
    console.log(`  design           ${DESIGN.id} theme ${DESIGN.theme} paper ${DESIGN.paper}`);
    console.log(`  leaf             ${L.refWidth.toFixed(2)} x ${L.refHeight.toFixed(2)} px_css at the reference box = 139.7 x 215.9 mm trim`);
    console.log(`  measure          ${(L.measure * 100).toFixed(4)}% of the leaf (96 / 139.7, the exact rational)`);
    console.log(`  frame            ${DESIGN.layout.border.style}, offset ${(L.frame.offset * 100).toFixed(4)}% of the leaf (8 / 139.7)`);
    console.log(`  frame checks     ${checks.length - bad.length}/${checks.length} agree with the documents`);
    for (const b of bad) console.log(`    FAIL ${b.label}: ${b.got} vs ${b.want}`);
    console.log(`  scale ladder     ${scaleSteps.map((s) => (s * 100).toFixed(0) + "%").join(", ")}` +
      (dropped.length ? `   (dropped below minimum_readable_pt ${DESIGN.typography.minimum_readable_pt} pt: ${dropped.map((s) => (s * 100).toFixed(0) + "%").join(", ")})` : ""));
    console.log(`  fonts            ${inlinedFonts.size ? [...inlinedFonts.keys()].join(", ") : `none found in ${dirs.length ? dirs.map((d) => path.relative(REPO, d)).join(", ") : "app/assets/fonts"} — the declared fallback chain is used and disclosed`}`);
    console.log("");
    console.log(`  offline          ${offline.length === 0 ? "clean — no URL, link, iframe, import, srcset or src outside data: in the written bytes" : "VIOLATED"}`);
    for (const o of offline) console.log(`    FAIL ${o}`);
    console.log("");
    console.log(`  open it:         file://${args.out}`);
    console.log("");
    console.log(formatChecks(checks).split("\n").filter((l) => l.includes("frame") || l.includes("border") || l.includes("band") || l.includes("C1") || l.includes("C2") || l.includes("C3")).join("\n"));
  }

  process.exit(offline.length === 0 && bad.length === 0 ? 0 : 1);
}

main();
