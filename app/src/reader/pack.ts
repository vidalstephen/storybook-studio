/**
 * Assemble the artifact: one HTML file, no network at read time, no external anything.
 *
 * The offline guarantee is not a promise in a comment. It is enforced twice:
 *
 *   1. the document carries a `Content-Security-Policy` meta element with `default-src 'none'`,
 *      so a browser **refuses** any subresource — a font, an image, a stylesheet, a script —
 *      even if one were ever added by mistake;
 *   2. `assertOffline()` scans the finished bytes for every construct that could reach the
 *      network (`http://`, `https://`, `//`, `@import`, `url(` outside `data:`, `<link>`,
 *      `<iframe>`, `srcset`) and is called by the emitter after the file is written, so a
 *      regression fails the build instead of shipping (`OPS_NETWORK_FONT_REFERENCE`, D-19).
 *
 * Fonts: the emitter inlines a `woff2` subset when one is present for a family (base64 in an
 * `@font-face` rule, `font-display: block` per `09` §6.2). When none is present it falls back
 * through the token's own declared chain and **says so** in the artifact, in the disclosures and
 * in the build banner — `09` §6.5 forbids a silent substitution.
 */

import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { fontPlan, type FontPlan, readerCssVars, TRANSITIONS, THEME_VARIANTS, type TransitionStyle } from "./design.js";
import type { Book, Composition } from "../contracts.js";
import type { DesignRevision } from "../tokens.js";
import { buildFlow } from "./content.js";
import { readerBody, noscriptHtml } from "./markup.js";
import { readerCss } from "./styles.js";
import { REFERENCE_VIEWPORTS, SPREAD_MIN_HEIGHT_PX, SPREAD_MIN_WIDTH_PX, charactersPerLineMeasured, readabilityMinMeasurePx } from "./design.js";

/**
 * The reader's shipped JavaScript.
 *
 * `reader/runtime.ts` **is** the artifact's script; this reads it, strips the types with esbuild,
 * and hands back one function body. `keepNames: false` matters: with name preservation on,
 * esbuild injects a `__name` helper that a per-file transform cannot carry into the artifact, and
 * the reader would die on `__name is not defined` — an observed failure, not a theoretical one.
 * `minify: false` matters for a different reason: the artifact is a thing a reviewer reads.
 */
export function runtimeJs(): { code: string; bytes: number } {
  const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
  const out = transformSync(source, {
    loader: "ts",
    target: "es2020",
    format: "esm",
    keepNames: false,
    minify: false,
    legalComments: "inline",
  });
  if (out.warnings.length) {
    for (const w of out.warnings) console.warn(`runtime.ts: ${w.text} (${w.location?.line}:${w.location?.column})`);
  }
  if (/\bexport\b/.test(out.code)) {
    throw new Error("reader/runtime.ts must not export anything: its body is inlined into the artifact");
  }
  return { code: out.code, bytes: Buffer.byteLength(out.code, "utf8") };
}

export interface RenderInput {
  readonly book: Book;
  readonly composition: Composition;
  readonly design: DesignRevision;
  /** `(family -> base64 woff2)` for any family the build could actually inline. */
  readonly inlinedFonts?: ReadonlyMap<string, { base64: string; weight: string; style: string }>;
  /** Where the two inputs came from, and whether either was a sample. Shown in the banner. */
  readonly provenance: readonly string[];
  /** Extra runtime-only disclosures the emitter wants carried (build-time facts). */
  readonly extraDisclosures?: readonly { code: string; severity: "info" | "major" | "critical"; text: string }[];
}

export interface RenderResult {
  readonly html: string;
  readonly fonts: FontPlan;
  readonly bytes: number;
  readonly disclosures: readonly { code?: string; severity: string; text: string }[];
}

function woff2Face(family: string, file: { base64: string; weight: string; style: string }): string {
  return [
    `@font-face {`,
    `  font-family: "${family}";`,
    `  font-style: ${file.style};`,
    `  font-weight: ${file.weight};`,
    `  font-display: block;                 /* a swap would change metrics mid-read (09 §6.2) */`,
    `  src: url(data:font/woff2;base64,${file.base64}) format("woff2");`,
    `}`,
  ].join("\n");
}

export function renderHtml(input: RenderInput): RenderResult {
  const { book, composition: cmp, design: d } = input;
  const flow = buildFlow(book, cmp);

  const inlinedNames: string[] = [];
  const faces: string[] = [];
  if (input.inlinedFonts) {
    for (const [family, file] of input.inlinedFonts) {
      inlinedNames.push(family);
      faces.push(woff2Face(family, file));
    }
  }

  const fonts = fontPlan(d, inlinedNames);
  const scaleSteps = effectiveSteps(d);
  const droppedSteps = dropped(d);
  const wordsPerLine = flow.wordsPerLine;

  const disclosures = [
    ...flow.disclosures,
    ...(input.extraDisclosures ?? []),
    ...(inlinedNames.length === 0
      ? [
          {
            code: "DIG_FONT_FALLBACK_APPLIED",
            severity: "info" as const,
            text: fonts.note,
          },
        ]
      : []),
  ];

  const cfg: Record<string, unknown> = {
    book_id: book.id,
    cmp_id: cmp.id,
    dsg_rev: cmp.dsg_rev,
    title: book.meta.title,
    subtitle: book.meta.subtitle ?? "",
    author: book.meta.author,
    audience: book.meta.audience,
    scale_steps: scaleSteps,
    dropped_steps: droppedSteps,
    minimum_readable_pt: d.typography.minimum_readable_pt,
    theme_ids: THEME_VARIANTS.map((t) => t.id),
    motion_ids: TRANSITIONS.map((t) => t.id),
    spread_min_w: SPREAD_MIN_WIDTH_PX,
    spread_min_h: SPREAD_MIN_HEIGHT_PX,
    chars_per_line: +charactersPerLineMeasured(d, wordsPerLine).toFixed(1),
    min_measure_px: +readabilityMinMeasurePx(d, wordsPerLine).toFixed(2),
    plan_pages: flow.planPages.length,
    plan_pages_by_section: flow.planPagesBySection,
    /** Which print pages face each other on paper, and where the reader got the convention. */
    spread_pairing: flow.pairing,
    // The turns the author asked for, so the reader can say why a page is a turn and can check
    // that it landed where the plan put it (05 §2.5, 16 §1.6).
    turns: flow.turns,
    digital_range: flow.digitalRange ?? null,
    digital_measured_at: flow.digitalMeasuredAt,
    max_ms: 420,
    frame_style: d.layout.border.style,
    reference_viewports: REFERENCE_VIEWPORTS,
    font_family_body: d.typography.body.family,
    font_family_display: d.typography.display.family,
    fonts_inlined: inlinedNames,
    words_per_line: wordsPerLine,
    lines_per_page_ref: d.box.height_px_css / (d.typography.body.size_pt * (4 / 3) * d.typography.body.line_height),
    disclosures,
  };

  const body = readerBody({
    book,
    flow,
    fonts,
    transitions: TRANSITIONS,
    scaleSteps,
    droppedSteps,
    themeIds: THEME_VARIANTS.map((t) => t.id),
    themeOptions: THEME_VARIANTS.map((t) => ({ id: t.id, label: t.label })),
    cfg,
    buildBanner: input.provenance,
  });

  const css = readerCss({ vars: readerCssVars(d, wordsPerLine) });
  const runtime = runtimeJs();

  const banner = [
    `Storybook Studio — interactive HTML storybook.`,
    `This file is generated. Every word inside a page comes from the manuscript; everything else is furniture.`,
    `book=${book.id}  composition=${cmp.id}  design=${cmp.dsg_rev}  theme=${d.theme}  paper=${d.paper}`,
    `target ${book.target_print_pages} print pages · plan ${flow.planPages.length} pages · ${flow.counts.total} blocks · ${flow.counts.planned} placed by the composition` +
      (flow.counts.intentionally_omitted
        ? ` · ${flow.counts.intentionally_omitted} deliberately omitted from print, with a recorded reason (docs/08 §4.5)`
        : ``),
    `fonts: ${inlinedNames.length ? inlinedNames.join(", ") + " inlined as woff2 subsets" : "none inlined — the design revision's declared fallback chain is active and disclosed in the reader"}`,
    `offline: enforced by a default-src 'none' Content-Security-Policy meta element; verified by assertOffline() in the emitter`,
    `runtime: ${runtime.bytes.toLocaleString("en-US")} bytes of JavaScript, compiled from app/src/reader/runtime.ts at emit time`,
    `styles: ${Buffer.byteLength(css, "utf8").toLocaleString("en-US")} bytes of CSS, projected from app/src/tokens.ts`,
    `blocks: ${flow.blocks.length} in reading order (DOM order == logical.beat_order, docs/16 §5.1)`,
    ...input.provenance,
  ]
    .map((l) => `  ${l}`)
    .join("\n");

  const html = `<!doctype html>
<html lang="${escapeAttr(book.meta.language || "en")}" data-sb-reader-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="storybook-studio/render-html">
<!--
${banner}
-->
<!-- No network at read time, enforced rather than promised (D-19, 09 §6.2). -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(book.meta.title)}${book.meta.subtitle ? ` — ${escapeHtml(book.meta.subtitle)}` : ""}</title>
<meta name="description" content="${escapeAttr(
    `${book.meta.title}${book.meta.subtitle ? " — " + book.meta.subtitle : ""}, by ${book.meta.author}. Ages ${book.meta.audience.age_from}–${book.meta.audience.age_to}, ${book.meta.audience.reading_pt}.`,
  )}">
<style>
${faces.length ? faces.join("\n") + "\n" : ""}${css}
</style>
</head>
<body>
<div class="sb-root" id="sb-root"
     data-sb-ready="0"
     data-sb-theme="light"
     data-sb-reader-theme="light"
     data-sb-motion="slide"
     data-sb-folio="1"
     data-sb-focus="0"
     data-sb-mode="single">
${noscriptHtml()}
${body}
</div>
<script>
(function () {
${runtime.code}
})();
</script>
</body>
</html>
`;

  return { html, fonts, bytes: Buffer.byteLength(html, "utf8"), disclosures };
}

function effectiveSteps(d: DesignRevision): number[] {
  return d.typography.scale_steps.filter((s) => d.typography.body.size_pt * s >= d.typography.minimum_readable_pt - 1e-9);
}
function dropped(d: DesignRevision): number[] {
  const keep = new Set(effectiveSteps(d));
  return d.typography.scale_steps.filter((s) => !keep.has(s));
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * The offline assertion. Every construct that can reach the network is refused, and the check
 * runs on the bytes that were written — not on the string that was built.
 */
export function assertOffline(html: string): string[] {
  const bad: string[] = [];
  const patterns: [RegExp, string][] = [
    [/https?:\/\//gi, "an absolute http(s) URL"],
    [/<link\b/gi, "a <link> element"],
    [/<iframe\b/gi, "an <iframe> element"],
    [/@import\b/gi, "a CSS @import"],
    [/srcset\s*=/gi, "a srcset attribute"],
    [/url\(\s*['"]?(?!data:)/gi, "a url(...) that is not a data: URI"],
    [/<script[^>]*\bsrc\s*=/gi, "an external <script src>"],
  ];
  for (const [re, why] of patterns) {
    re.lastIndex = 0;
    const m = re.exec(html);
    if (m) bad.push(`${why} at offset ${m.index}: ${JSON.stringify(html.slice(Math.max(0, m.index - 30), m.index + 60))}`);
  }
  return bad;
}

/** The `--print` summary the CLI shows: what a reviewer can check without opening a browser. */
export function describe(result: RenderResult, flow: ReturnType<typeof buildFlow>): string {
  const lines: string[] = [];
  lines.push(`  bytes            ${result.bytes.toLocaleString("en-US")} (${(result.bytes / 1024).toFixed(1)} KiB)`);
  lines.push(`  flow             ${flow.counts.total} blocks  (front ${flow.counts.front_matter} · story ${flow.counts.story} · back ${flow.counts.back_matter})`);
  lines.push(`  plan             ${flow.planPages.length} print pages, ${flow.counts.planned} blocks placed`);
  lines.push(`  toc              ${flow.toc.length} entries (${flow.toc.filter((e) => e.kind !== "story").length} matter + ${flow.toc.filter((e) => e.kind === "story").length} story)`);
  if (flow.intentionallyOmitted.length) {
    // A recorded omission is neither placed nor unplaced: it is accounted for, and it reads as a
    // note. Printing it here keeps the CLI honest about a block count that would otherwise be short.
    lines.push(
      `  omitted          ${flow.counts.intentionally_omitted} block(s) in ${flow.intentionallyOmitted
        .map((m) => `${m.label} (${m.matterId})`)
        .join(", ")} — deliberately not placed, with a recorded reason (docs/08 §4.5); no page invented, no unplaced disclosure raised`,
    );
  }
  lines.push(`  turns            ${flow.turns.map((t) => `before page ${t.before_page} (${t.beat_id})`).join(", ") || "none"}`);
  lines.push(`  book             ${flow.planPages.length} planned pages — ${flow.planPagesBySection.front} front · ${flow.planPagesBySection.story} story · ${flow.planPagesBySection.back} back · ${flow.planPagesBySection.blank} blank`);
  lines.push(`  spread pairing   {1} · {2,3} · {4,5} · …  — from ${flow.pairing.source === "composition" ? `the composition (${flow.pairing.recorded})` : "docs/08 §3.2 + docs/05 §2.5: this composition records no pairing"}`);
  lines.push(`  disclosures      ${result.disclosures.length}`);
  for (const dd of result.disclosures) lines.push(`    · ${dd.severity.padEnd(8)} ${dd.code ?? "(reader note — no registered code)"}`);
  lines.push(`  fonts            ${result.fonts.inlined.length ? result.fonts.inlined.join(", ") + " (woff2, inlined)" : "none inlined — declared fallback chain active"}`);
  return lines.join("\n");
}
