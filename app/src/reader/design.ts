/**
 * The reader's projection of the design revision (`dsg_rev`).
 *
 * This module is the **only** place the HTML storybook turns `tokens.ts` into CSS. It does not
 * invent a number: every value is a ratio of a token, or a quantity `tokens.ts` already derived.
 *
 *   docs/09 §7.5   the digital projection of the frame — the frame scales *by ratio to the page*,
 *                  the type size does not (L1 vs L2, §5.6)
 *   docs/09 §3.5   the `--sb-*` custom-property naming: dots -> dashes, underscores -> dashes,
 *                  unit suffix retained; the reader sheet carries only `_px_css` / `em` / `nil` / `ms`
 *   docs/09 §4.4   reader colour variants are **colour-only** projections, emitted as a scoped
 *                  block (`[data-sb-reader-theme="sepia"]`), never as a second `--sb-*` name
 *   docs/09 §4.2   the effective scale ladder — a step whose product falls below
 *                  `minimum_readable_pt` is not offered
 *   docs/09 §6.5   the fallback chain, declared in the token, never resolved by the browser alone
 *   docs/08 §3.2   `spread = width >= 1024 AND height >= 768 AND readableAsSpread()`
 *   docs/16 §5.2   the identity values a reviewer reads back out of the running reader
 */

import { PX_PER_PT, type DesignRevision, type PaperId, PAPER } from "../tokens.js";

/** A ratio, expressed to the precision the documents state, and never used as a raw physical unit. */
export interface FrameProjection {
  /** `layout.border.offset_mm / paper.width_mm` — trim edge -> outer edge of the OUTER rule. */
  readonly offset: number;
  /** trim edge -> inner edge of the INNER rule (offset + outer thickness). */
  readonly innerOffset: number;
  /** trim edge -> outer edge of the INNER rule's outer edge + gap (the band's far edge). */
  readonly bandTo: number;
  /** outer rule thickness, as a ratio of the leaf width. `max(0.5px, ratio x width)` (§7.5). */
  readonly outerThickness: number;
  /** inner rule thickness, as a ratio of the leaf width. */
  readonly innerThickness: number;
  /** `layout.border.gap_mm / paper.width_mm` — the 1.5 mm clear gap between the two rules. */
  readonly gap: number;
  /** `min_side_text_margin_mm - bandTo` — the clear gap from frame to nearest text (8.32 mm ref). */
  readonly textClearance: number;
}

/** The leaf, as ratios. `inset_x`/`inset_y` are the symmetric declared margins (`04` §6.1). */
export interface LeafProjection {
  readonly aspect: number;          // width / height of the trim
  readonly insetX: number;          // margin.side_mm / paper.width_mm
  readonly insetY: number;          // margin.head_mm / paper.height_mm
  readonly measure: number;         // text_box_mm.width / paper.width_mm  — the EXACT rational
  /** The **trim** at 96 dpi — 528 x 816 px_css for half-letter (`09` §7.4's "reference box"). */
  readonly refWidth: number;
  readonly refHeight: number;
  /** The **text box** at 96 dpi — 362.8346 x 559.3750, `tokens.ts`'s `box` (`08` §4.2). */
  readonly refMeasure: number;
  readonly refMeasureHeight: number;
  readonly trimWidth: number;       // paper.width_mm
  readonly trimHeight: number;      // paper.height_mm
  readonly gutter: number;          // layout.gutter_mm / paper.width_mm
  readonly safeArea: number;        // layout.safe_area_mm / paper.width_mm
  readonly minVisible: number;      // layout.border.min_visible_mm / paper.width_mm
  readonly frame: FrameProjection;
}

/** The paper, from `tokens.ts`'s own table — the reader never converts a unit. */
export function paperOf(d: DesignRevision) {
  const p = PAPER[d.paper as PaperId];
  if (!p) throw new Error(`reader: unknown paper preset "${d.paper}"`);
  return p;
}

export function projectLeaf(d: DesignRevision): LeafProjection {
  const p = paperOf(d);
  const W = p.width_mm;
  const b = d.layout.border;
  const tOuterMm = b.thickness_pt * (25.4 / 72);
  const tInnerMm = b.thickness_inner_pt * (25.4 / 72);
  const double = b.style === "double_rule";
  return {
    aspect: W / p.height_mm,
    insetX: d.margin.side_mm / W,
    insetY: d.margin.head_mm / p.height_mm,
    measure: d.layout.text_box_mm.width / W,
    refWidth: W * (96 / 25.4),
    refHeight: p.height_mm * (96 / 25.4),
    refMeasure: d.box.width_px_css,
    refMeasureHeight: d.box.height_px_css,
    trimWidth: W,
    trimHeight: p.height_mm,
    gutter: d.layout.gutter_mm / W,
    safeArea: d.layout.safe_area_mm / W,
    minVisible: b.min_visible_mm / W,
    frame: {
      offset: b.offset_mm / W,
      innerOffset: (b.offset_mm + tOuterMm) / W,
      bandTo: (b.offset_mm + tOuterMm + (double ? b.gap_mm + tInnerMm : 0)) / W,
      outerThickness: tOuterMm / W,
      innerThickness: double ? tInnerMm / W : 0,
      gap: double ? b.gap_mm / W : 0,
      textClearance: (d.min_side_text_margin_mm - (b.offset_mm + tOuterMm + (double ? b.gap_mm + tInnerMm : 0))) / W,
    },
  };
}

/**
 * docs/09 §4.2 + §5.2: a scale step whose product falls below `minimum_readable_pt` is **not
 * offered**. On the reference revision `0.85 x 13.5 = 11.475 pt < 12 pt`, so the declared ladder
 * `[0.85, 1.0, 1.15, 1.3]` becomes the effective ladder `[1.0, 1.15, 1.3]`. Requesting a dropped
 * step is `DIG_SCALE_LADDER_TRUNCATED` (info) and the nearest offered step is used.
 */
export function effectiveScaleSteps(d: DesignRevision): number[] {
  const floor = d.typography.minimum_readable_pt;
  return d.typography.scale_steps.filter((s) => d.typography.body.size_pt * s >= floor - 1e-9);
}

/** Steps the token declares but the floor removes — reported, never silently offered. */
export function droppedScaleSteps(d: DesignRevision): number[] {
  const keep = new Set(effectiveScaleSteps(d));
  return d.typography.scale_steps.filter((s) => !keep.has(s));
}

/** Body type size in `px_css` at a scale step (`R1`: 1 pt === 4/3 px_css, so `size_px_css x s`). */
export function bodyPxAt(d: DesignRevision, step: number): number {
  return (d.typography.body.size_pt * PX_PER_PT) * step;
}

/** The line pitch in `px_css` at a scale step — never below the token's own leading. */
export function linePitchAt(d: DesignRevision, step: number): number {
  return bodyPxAt(d, step) * d.typography.body.line_height;
}

/**
 * `readableAsSpread()` — docs/08 §3.2's guard. The spread threshold (`>= 1024 x 768`) is a
 * *necessary* condition, not a sufficient one; this refuses a spread when a leaf's text measure
 * would fall below a readable characters-per-line minimum.
 *
 * The minimum is **derived from the design's own measured metrics**, not a magic number:
 * `words_per_line` is the composition's measured figure (`docs/05` §1.6 item 6), a word plus its
 * space is taken at 6.5 characters (the fixture's own mix averages this), and the declared floor
 * is 32 characters per line — the low end of the 32–45 cpl band the documents treat as readable
 * at this type size (`docs/10` §3.4 "45-75 cpl" applies to single-column print; a leaf of a
 * spread carries two columns, so the leaf floor is set at the lower end).
 */
export function charactersPerLineMeasured(d: DesignRevision, wordsPerLine: number): number {
  return wordsPerLine * 6.5;
}

export function readabilityMinMeasurePx(d: DesignRevision, wordsPerLine: number): number {
  const refMeasure = d.box.width_px_css;
  const charsRef = charactersPerLineMeasured(d, wordsPerLine);
  const advancePx = refMeasure / charsRef;
  return 32 * advancePx;
}

/** docs/08 §3.2 — the threshold pair. Both are the documents' numbers. */
export const SPREAD_MIN_WIDTH_PX = 1024;
export const SPREAD_MIN_HEIGHT_PX = 768;

/** The reference viewport set (`docs/08` §3.1) — the live count is disclosed against it. */
export const REFERENCE_VIEWPORTS: ReadonlyArray<{ viewport: string; spread: boolean }> = [
  { viewport: "360x640", spread: false },
  { viewport: "414x896", spread: false },
  { viewport: "768x1024", spread: false },
  { viewport: "1280x800", spread: true },
  { viewport: "1440x900", spread: true },
];

/**
 * The reader's `:root` block. Only `_px_css`, `em`, `nil` and `ms` quantities appear here
 * (docs/09 §3.5); every frame quantity is a ratio composed with the live leaf width, so the
 * identity tokens are never re-derived in the consumer (§7.5, `DESIGN_TOKEN_COMPUTED_IN_CONSUMER`).
 */
export function readerCssVars(d: DesignRevision, wordsPerLine: number): string {
  const L = projectLeaf(d);
  const F = L.frame;
  /**
   * `docs/09` §3.5: the unit suffix is retained in the *name*, and the reader sheet carries only
   * `_px_css` / `em` / `nil` / `ms` quantities. So the **value** carries its unit too — a bare
   * `--sb-type-body-size-px-css: 18` is a `<number>`, and `calc(18 * 1)` is not a length, so the
   * whole declaration would be dropped and the type would silently fall back to the browser's
   * 16 px. That is a silent substitution of the design's typography, which is exactly what §5.5
   * forbids, so every length below is emitted in px and the one duration in ms.
   */
  const px = (n: number) => `${+n.toFixed(6)}px`;
  const num = (n: number) => `${+n.toFixed(9)}`.replace(/\.?0+$/, "") || "0";
  return [
    `  /* --- identity: type (04 §6.1 / 09 §4.1) ----------------------------------- */`,
    `  --sb-type-body-family: ${d.typography.body.family};`,
    `  --sb-type-heading-family: ${d.typography.heading.family};`,
    `  --sb-type-display-family: ${d.typography.display.family};`,
    `  --sb-type-body-size-px-css: ${px(d.typography.body.size_pt * PX_PER_PT)};`,
    `  --sb-type-heading-size-px-css: ${px(d.typography.heading.size_pt * PX_PER_PT)};`,
    `  --sb-type-display-size-px-css: ${px(d.typography.display.size_pt * PX_PER_PT)};`,
    `  --sb-type-body-line-height: ${d.typography.body.line_height};`,
    `  --sb-type-heading-line-height: ${d.typography.heading.line_height};`,
    `  --sb-type-orphans: ${d.typography.orphans};`,
    `  --sb-type-widows: ${d.typography.widows};`,
    `  /* --- identity: page + frame (09 §7.1, §7.5) ------------------------------- */`,
    `  --sb-page-ratio-trim-width: ${num(L.aspect)};            /* leaf width / height */`,
    `  --sb-page-ratio-measure: ${num(L.measure)};              /* 96 / 139.7, the exact rational */`,
    `  --sb-page-ratio-inset-x: ${num(L.insetX)};               /* 21.85 / 139.7 */`,
    `  --sb-page-ratio-inset-y: ${num(L.insetY)};               /* 33.95 / 215.9 */`,
    `  --sb-page-ratio-gutter: ${num(L.gutter)};`,
    `  --sb-page-ratio-safe-area: ${num(L.safeArea)};`,
    `  --sb-page-ratio-border-offset: ${num(F.offset)};        /* 8 / 139.7 = 0.057266 */`,
    `  --sb-page-ratio-border-inner-offset: ${num(F.innerOffset)};`,
    `  --sb-page-ratio-border-band-to: ${num(F.bandTo)};       /* 10.0292 / 139.7, compiled */`,
    `  --sb-page-ratio-border-gap: ${num(F.gap)};`,
    `  --sb-page-ratio-border-outer-thickness: ${num(F.outerThickness)};`,
    `  --sb-page-ratio-border-inner-thickness: ${num(F.innerThickness)};`,
    `  --sb-layout-border-min-visible-px-css: ${px(Math.max(0.5, L.minVisible * L.refWidth))};`,
    `  --sb-layout-border-text-gap-min-px-css: ${px((d.layout.border.text_gap_min_mm / L.trimWidth) * L.refWidth)};`,
    `  /* --- the reference box, for the parity disclosure (09 §1.7, 16 §5.2 step 4) - */`,
    `  --sb-page-ref-box-width-px-css: ${px(L.refWidth)};`,
    `  --sb-page-ref-box-height-px-css: ${px(L.refHeight)};`,
    `  --sb-page-ref-measure-px-css: ${px(L.refMeasure)};`,
    `  --sb-page-ref-measure-height-px-css: ${px(L.refMeasureHeight)};`,
    `  --sb-page-ref-line-pitch-px-css: ${px(linePitchAt(d, 1))};`,
    `  --sb-layout-resolved-density-sparse-below: ${d.layout.resolved_density_band.sparse_below};`,
    `  --sb-layout-resolved-density-dense-above: ${d.layout.resolved_density_band.dense_above};`,
    `  --sb-type-words-per-line-measured: ${wordsPerLine};`,
    `  --sb-type-readability-min-measure-px-css: ${px(readabilityMinMeasurePx(d, wordsPerLine))};`,
    `  /* --- projection inputs the runtime sets on the live leaf ------------------- */`,
    `  --sb-leaf-width: 0px;`,
    `  --sb-leaf-height: 0px;`,
    `  /* --- surface: the light variant is the token default (09 §4.4) ---------- */`,
    `  --sb-page-background-colour: #F6EDDA;`,
    `  --sb-colour-ink-body: #3A2E1F;`,
    `  --sb-colour-ink-soft: #6f6453;              /* ink at 72% over the page, precomputed: the`,
    `                                                type colour is a constant, never a computed one */`,
    `  --sb-colour-rule: #8a6f47;`,
    `  --sb-colour-accent: #9C5A2E;`,
    `  --sb-colour-chrome-bg: #e0d6c4;`,
    `  --sb-colour-focus: #7A1F1F;`,
    `  /* --- motion: reader-only, geometry-neutral (09 §3.3, §8.2) --------------- */`,
    `  --sb-motion-duration-ms: ${MOTION.duration_ms}ms;`,
    `  --sb-motion-easing: ${MOTION.easing};`,
  ].join("\n");
}

/** `motion.*` is the reader's alone (`09` §3.3): it is geometry-neutral, so it never re-plans. */
export const MOTION = {
  duration_ms: 420,
  easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  /** how far a curled leaf lifts off the gutter before it has to be gone (`sb-curl-*`) */
  curl_deg: 16,
  /** where a folded leaf has turned over far enough to hide its own back (`sb-fold-*`) */
  fold_deg: 176,
  /** The transition may never block input beyond this (`docs/16` §5.1 "reduced motion"). */
  max_ms: 420,
} as const;

export type TransitionStyle = "curl" | "fold" | "slide" | "fade" | "instant";

/**
 * `docs/16` §1.1: `motion.transition_style ∈ {curl, fold, slide, fade, instant}`.
 *
 * The notes say what each one does to the *paper*, because that is the thing `11` §… measures
 * (`DIG_TRANSITION_INCORRECT` is raised for "the wrong direction/order"): every transition here is
 * direction-aware — forward the page being left turns away and uncovers the next, backward the
 * page being reached swings back in over the one already there — and every one of them is a
 * property of the leaf, hinged at the spine, never of the screen.
 */
export const TRANSITIONS: ReadonlyArray<{ id: TransitionStyle; label: string; note: string }> = [
  { id: "slide", label: "Slide", note: "Horizontal slide — the page being left travels aside and uncovers the next." },
  { id: "fade", label: "Fade", note: "Gentle cross-fade — no travel; the page on top dissolves." },
  { id: "curl", label: "Page curl", note: "A leaf lifting at the spine, shading as it goes." },
  { id: "fold", label: "Fold", note: "A leaf turning over on the gutter, and hidden once its back would show." },
  { id: "instant", label: "Instant", note: "No animation at all." },
];

/** `04` §6.1 `reader_overrides.theme`; `09` §4.4 gives one colour triple per variant. */
export interface ReaderThemeVariant {
  readonly id: "light" | "sepia" | "dark";
  readonly label: string;
  readonly background: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly rule: string;
  readonly accent: string;
  readonly chromeBg: string;
  readonly contrastNote: string;
}

export const THEME_VARIANTS: readonly ReaderThemeVariant[] = [
  { id: "light", label: "Light  ·  warm parchment", background: "#F6EDDA", ink: "#3A2E1F", inkSoft: "#6f6453", rule: "#8a6f47", accent: "#9C5A2E", chromeBg: "#e0d6c4", contrastNote: "body on background >= 7:1" },
  { id: "sepia", label: "Sepia  ·  deeper parchment", background: "#F0E3C8", ink: "#33281B", inkSoft: "#645948", rule: "#8a6f47", accent: "#9C5A2E", chromeBg: "#d6c9b0", contrastNote: "body on background >= 7:1" },
  { id: "dark", label: "Dark  ·  low light", background: "#171512", ink: "#E8E1D4", inkSoft: "#b2aca2", rule: "#8a7a5c", accent: "#C08A55", chromeBg: "#2b2926", contrastNote: "body on background >= 7:1" },
];

/**
 * The colour-only variant block. It is written to `[data-sb-reader-theme="<id>"]` and carries
 * **only colour** properties — a variant that moved a metric would break `09` §4.4's invariant
 * (`DESIGN_READER_THEME_METRIC_DRIFT`) and make the reader's reflow differ from the plan.
 */
export function themeVariantCss(): string {
  return THEME_VARIANTS.map((v) => {
    if (v.id === "light") return ""; // the `:root` block is the light variant
    return [
      `[data-sb-reader-theme="${v.id}"] {`,
      `  --sb-page-background-colour: ${v.background};`,
      `  --sb-colour-ink-body: ${v.ink};`,
      `  --sb-colour-ink-soft: ${v.inkSoft};`,
      `  --sb-colour-rule: ${v.rule};`,
      `  --sb-colour-accent: ${v.accent};`,
      `  --sb-colour-chrome-bg: ${v.chromeBg};`,
      `  --sb-colour-focus: ${v.accent};`,
      `}`,
    ].join("\n");
  })
    .filter(Boolean)
    .join("\n");
}

export interface FrameCheck {
  readonly label: string;
  readonly got: number;
  readonly want: number;
  readonly ok: boolean;
  readonly relation: "=" | ">=" | "<=";
}

/**
 * The frame's digital constraints, re-derived from the projection. C1–C3 are `09` §7.4's, stated
 * as the documents state them (C1 and C2 are inequalities and are checked as such); the last is
 * the one that matters to a phone: the band's far edge plus the declared frame-to-text minimum
 * must stay inside the text edge at every viewport, which is exactly C2 expressed in ratios, so
 * the frame can never touch a glyph or a control (`DIG_FRAME_CONTROL_COLLISION`).
 */
export function frameChecks(d: DesignRevision): FrameCheck[] {
  const L = projectLeaf(d);
  const F = L.frame;
  const gap = d.layout.border.text_gap_min_mm / L.trimWidth;
  const cmp = (
    label: string,
    got: number,
    want: number,
    relation: FrameCheck["relation"],
    tol = 1e-6,
  ): FrameCheck => {
    const ok =
      relation === "=" ? Math.abs(got - want) <= tol : relation === ">=" ? got >= want - tol : got <= want + tol;
    return { label, got, want, ok, relation };
  };
  const out: FrameCheck[] = [];
  out.push(cmp("C1  border offset >= safe area, in mm (8 >= 6)", +((F.offset - L.safeArea) * L.trimWidth).toFixed(4), 0, ">="));
  out.push(cmp("C2  frame band + text_gap_min <= nearer text edge, in mm (13.0292 <= 18.35)", +((F.bandTo + gap) * L.trimWidth).toFixed(4), +d.min_side_text_margin_mm.toFixed(4), "<=", 1e-3));
  out.push(cmp("C3  outer rule >= min_visible_mm (0.26458 >= 0.18)", +(F.outerThickness * L.trimWidth).toFixed(5), d.layout.border.min_visible_mm, ">=", 1e-4));
  out.push(cmp("border band = 8 + 0.75pt + gap + 0.75pt, in mm", +(F.bandTo * L.trimWidth).toFixed(4), 10.0292, "=", 5e-4));
  out.push(cmp("frame to nearest text, in mm (8.32)", +(F.textClearance * L.trimWidth).toFixed(4), 8.32, "=", 5e-3));
  out.push(cmp("outer rule at the reference box, px_css (0.75 pt -> 1.0)", +(F.outerThickness * L.refWidth).toFixed(4), 1.0, "=", 1e-3));
  out.push(cmp("measure ratio is the exact rational 96/139.7", +L.measure.toFixed(9), +(96 / 139.7).toFixed(9), "=", 1e-9));
  out.push(cmp("reference box is the trim at 96 dpi (528 x 816)", +L.refWidth.toFixed(4), 528, "=", 1e-6));
  out.push(cmp("text box at the reference box (362.8346 x 559.3750)", +L.refMeasure.toFixed(4), 362.8346, "=", 1e-4));
  return out;
}

/** `docs/09` §6.5 — the declared chain. The reader may not invent one, and shows a banner when it applies. */
export interface FontPlan {
  readonly body: string;
  readonly heading: string;
  readonly display: string;
  readonly inlined: readonly string[];
  readonly stack: string;
  readonly note: string;
}

/**
 * The declared stacks, verbatim from `tokens.ts`'s `family` strings (`Lora, 'Iowan Old Style',
 * Georgia, serif` and `Cinzel, 'Trajan Pro', 'Times New Roman', serif`). The last resort of each
 * is a real, universally present family of the same class — `Georgia` and `'Times New Roman'` —
 * so a build with no `woff2` available is legible rather than ugly, and says so (`09` §6.5,
 * "no fallback available and no glyph coverage": render with the system stack and show a banner).
 */
export function fontPlan(d: DesignRevision, inlined: readonly string[]): FontPlan {
  return {
    body: d.typography.body.family,
    heading: d.typography.heading.family,
    display: d.typography.display.family,
    inlined,
    stack: `${d.typography.body.family}`,
    note:
      inlined.length > 0
        ? `Inlined woff2 subsets: ${inlined.join(", ")}. No network fetch is performed at read time.`
        : "No woff2 could be inlined at build time, so the token's declared fallback chain is active " +
          "(Lora -> Iowan Old Style -> Georgia; Cinzel -> Trajan Pro -> Times New Roman). " +
          "Metrics differ from the primary family, so the reflow is shorter or longer than the plan; " +
          "docs/09 §6.5 allows the digital substitution provided it is recorded and the page count " +
          "is re-reported — DIG_FONT_FALLBACK_METRIC_DRIFT. The print plan is unaffected.",
  };
}
