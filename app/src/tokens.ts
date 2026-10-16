/**
 * The design revision (`dsg_rev`) for the reference book — "Warm Parchment".
 *
 * Every value here is traceable to a line of the specification set. The point of
 * this file is that the build has ONE source for the geometry, and that the
 * specification's own arithmetic is executed rather than described: `selfCheck()`
 * re-derives the derived quantities and fails loudly if the docs and the code
 * disagree. If this file and `04` §6.1 ever diverge, the build is wrong, not the doc.
 *
 *   docs/04-project-data-schema.md  §6.1   the token block this mirrors
 *   docs/09-design-token-architecture.md §7  borders; §4.1-4.3 density resolution
 *   docs/08-pagination-strategy.md   §4.2   the box model, §3.3 the ratio
 *   docs/10-booklet-imposition-spec.md §1.3 half-letter fold geometry
 */

/** Millimetres per point; 1 pt = 25.4/72 mm = 0.352777... mm */
export const MM_PER_PT = 25.4 / 72;
/** 1 pt is exactly 4/3 px_css (09 §1.8). A mismatch is DESIGN_UNIT_PAIR_MISMATCH. */
export const PX_PER_PT = 4 / 3;
/** The quantiser: every css-px value is stored as an integer number of 1/64 px (09 §1.5). */
export const quantise64 = (px: number): number => Math.round(px * 64);

export type PaperId = "half_letter" | "a5" | "letter" | "a4";

export interface Paper {
  readonly id: PaperId;
  readonly width_mm: number;
  readonly height_mm: number;
  readonly note: string;
}

/** 10 §1.3: half-letter is US Letter folded once. A5 is A4 folded once. */
export const PAPER: Record<PaperId, Paper> = {
  half_letter: { id: "half_letter", width_mm: 139.7, height_mm: 215.9, note: "US Letter (215.9 x 279.4) folded once" },
  letter: { id: "letter", width_mm: 215.9, height_mm: 279.4, note: "US Letter, unfolded" },
  a5: { id: "a5", width_mm: 148, height_mm: 210, note: "A4 (210 x 297) folded once" },
  a4: { id: "a4", width_mm: 210, height_mm: 297, note: "A4, unfolded" },
};

export interface DesignRevision {
  readonly id: string;
  readonly theme: string;
  readonly paper: PaperId;
  readonly paper_fit: readonly PaperId[];
  readonly typography: {
    readonly body: { family: string; size_pt: number; line_height: number; hyphenate: boolean };
    readonly heading: { family: string; size_pt: number; line_height: number };
    readonly display: { family: string; size_pt: number };
    readonly minimum_readable_pt: number;
    readonly scale_steps: readonly number[];
    readonly orphans: number;
    readonly widows: number;
  };
  readonly layout: {
    readonly text_box_mm: { readonly width: number; readonly height: number };
    readonly border: {
      readonly style: "none" | "single_rule" | "double_rule" | "ribbon";
      readonly thickness_pt: number;
      readonly thickness_inner_pt: number;
      readonly gap_mm: number;
      readonly offset_mm: number;
      readonly colour: string;
      readonly text_gap_min_mm: number;
      readonly min_visible_mm: number;
    };
    readonly safe_area_mm: number;
    readonly gutter_mm: number;
    readonly binding_allowance_mm: number;
    readonly spacing_tolerance: { readonly min: number; readonly max: number };
    readonly density_tolerance: { readonly sparse_below: number; readonly dense_above: number };
    readonly resolved_density_band: { readonly sparse_below: number; readonly dense_above: number };
  };
  /** The text box the reader actually sees, in css px at 96 dpi, as 1/64-px quanta. */
  readonly box: {
    readonly width_px_css: number;
    readonly height_px_css: number;
    readonly width_q: number;
    readonly height_q: number;
  };
  /** Derived margins, measured from the trim edge. */
  readonly margin: { readonly side_mm: number; readonly head_mm: number; readonly foot_mm: number };
  /** The print text box is the declared box SHIFTED outward; its width never changes (08 §4.2). */
  readonly shift_mm: number;
  readonly text_edge: { readonly fore_mm: number; readonly spine_mm: number };
  readonly min_side_text_margin_mm: number;
  readonly border_band_mm: { readonly from: number; readonly to: number };
  readonly border_clearance_mm: number;
}

const BODY_PT = 13.5;
const HEADING_PT = 22.5;
const DISPLAY_PT = 31.5;
const LINE_HEIGHT = 1.5;

export const WARM_PARCHMENT: DesignRevision = (() => {
  const paper = PAPER.half_letter;
  const W = 96;    // declared text box, symmetric — 04 §6.1
  const H = 148;
  const safe = 6;
  const gutter = 4;      // 09 §1.5: 2 * G_side = 4
  const binding = 3;

  const side_mm = (paper.width_mm - W) / 2;      // 21.85
  const head_mm = (paper.height_mm - H) / 2;     // 33.95
  const shift_mm = (gutter + binding) / 2;       // 3.50 — symmetric clearances move the box, they do not shrink it
  const fore_mm = side_mm - shift_mm;            // 18.35
  const spine_mm = side_mm + shift_mm;           // 25.35

  const width_px_css = W * (96 / 25.4);          // 362.8346...
  const height_px_css = H * (96 / 25.4);
  const width_q = quantise64(width_px_css);     // 23221
  const height_q = quantise64(height_px_css);   // 35800

  const b = { style: "double_rule" as const, thickness_pt: 0.75, thickness_inner_pt: 0.75, gap_mm: 1.5, offset_mm: 8, colour: "#8a6f47", text_gap_min_mm: 3, min_visible_mm: 0.18 };
  const t_outer = b.thickness_pt * MM_PER_PT;
  const t_inner = b.thickness_inner_pt * MM_PER_PT;
  const band_to = b.offset_mm + t_outer + b.gap_mm + t_inner;   // 10.02917 mm

  return {
    id: "dsg_dg_v1",
    theme: "warm_parchment",
    paper: "half_letter",
    paper_fit: ["half_letter", "a5"],
    typography: {
      body: { family: "Lora, 'Iowan Old Style', Georgia, serif", size_pt: BODY_PT, line_height: LINE_HEIGHT, hyphenate: true },
      heading: { family: "Lora, 'Iowan Old Style', Georgia, serif", size_pt: HEADING_PT, line_height: 1.15 },
      display: { family: "Cinzel, 'Trajan Pro', 'Times New Roman', serif", size_pt: DISPLAY_PT },
      minimum_readable_pt: 12,
      scale_steps: [0.85, 1.0, 1.15, 1.3],
      orphans: 2,
      widows: 2,
    },
    layout: {
      text_box_mm: { width: W, height: H },
      border: b,
      safe_area_mm: safe,
      gutter_mm: gutter,
      binding_allowance_mm: binding,
      spacing_tolerance: { min: -0.06, max: 0.06 },
      density_tolerance: { sparse_below: 0.33, dense_above: 0.80 },
      resolved_density_band: { sparse_below: 0.35, dense_above: 0.78 },
    },
    box: { width_px_css, height_px_css, width_q, height_q },
    margin: { side_mm, head_mm, foot_mm: head_mm },
    shift_mm,
    text_edge: { fore_mm, spine_mm },
    min_side_text_margin_mm: Math.min(fore_mm, spine_mm),
    border_band_mm: { from: b.offset_mm, to: band_to },
    border_clearance_mm: fore_mm - band_to,
  };
})();

/** The line box, in 1/64 px. Body 13.5 pt × 1.5 leading = 20.25 pt = 27 px_css = 1728 q. */
export function lineHeightQ(d: DesignRevision): number {
  return quantise64(d.typography.body.size_pt * d.typography.body.line_height * PX_PER_PT);
}

export function linesPerPage(d: DesignRevision): number {
  return Math.floor(d.box.height_q / lineHeightQ(d));
}

/** The balanced ceiling: how many lines a page may hold before it counts as dense (09 §4.3). */
export function balancedCeilingLines(d: DesignRevision): number {
  const band = d.layout.resolved_density_band.dense_above;
  return Math.floor((d.box.height_q * band) / lineHeightQ(d));
}

export interface SelfCheck {
  readonly label: string;
  readonly got: number;
  readonly want: number;
  readonly ok: boolean;
  readonly tolerance?: number;
}

/**
 * Execute the specification's arithmetic and compare with the numbers the documents
 * state. Any `ok: false` means the build and the design disagree — stop.
 */
export function selfCheck(d: DesignRevision, probe?: { words: number; lineBoxes: number }): SelfCheck[] {
  const c = (label: string, got: number, want: number, tolerance = 1e-9): SelfCheck =>
    ({ label, got, want, ok: Math.abs(got - want) <= tolerance, tolerance });

  const out: SelfCheck[] = [];
  out.push(c("side margin_mm = (139.7-96)/2", d.margin.side_mm, 21.85, 1e-9));
  out.push(c("head margin_mm = (215.9-148)/2", d.margin.head_mm, 33.95, 1e-9));
  out.push(c("shift_mm = (gutter 4 + binding 3)/2", d.shift_mm, 3.5, 1e-9));
  out.push(c("fore text edge_mm = 21.85 - 3.5", d.text_edge.fore_mm, 18.35, 1e-9));
  out.push(c("spine text edge_mm = 21.85 + 3.5", d.text_edge.spine_mm, 25.35, 1e-9));
  out.push(c("min_side_text_margin_mm = min(18.35, 25.35)", d.min_side_text_margin_mm, 18.35, 1e-9));
  out.push(c("safe+gutter+binding = 6+4+3 (C4 floor, spine side)", d.layout.safe_area_mm + d.layout.gutter_mm + d.layout.binding_allowance_mm, 13.0, 1e-9));
  out.push(c("box width_q = 96 x 96/25.4 x 64", d.box.width_q, 23221, 0));
  out.push(c("box height_q = 148 x 96/25.4 x 64", d.box.height_q, 35800, 0));
  out.push(c("line height_q = 13.5 x 1.5 x 4/3 x 64", lineHeightQ(d), 1728, 0));
  out.push(c("lines per page = floor(35800/1728)", linesPerPage(d), 20, 0));
  out.push(c("balanced ceiling lines = floor(0.78 x 35800/1728)", balancedCeilingLines(d), 16, 0));
  // The double-rule band: 8 + 0.26458 + 1.5 + 0.26458 = 10.02917 mm
  out.push(c("border band to_mm (double_rule)", d.border_band_mm.to, 10.0292, 5e-5));
  out.push(c("border clearance_mm = 18.35 - 10.0292", d.border_clearance_mm, 8.32, 5e-3));
  // C1: the frame must start at or outside the safe area. 8.000 - 6.000 = 2.00 mm of slack.
  out.push(c("C1 slack_mm = offset 8 - safe_area 6", d.layout.border.offset_mm - d.layout.safe_area_mm, 2.0, 1e-9));
  // C2 (unified): offset + t_outer + t_inner + gap + text_gap_min <= min_side_text_margin
  // i.e. the frame and the clearance it demands must both fit inside the nearer text edge.
  out.push(c("C2 slack_mm = 18.35 - 3 - 10.0292 (must be >= 0)", d.min_side_text_margin_mm - d.layout.border.text_gap_min_mm - d.border_band_mm.to, 5.3208, 1e-3));
  // C3: the outer rule must survive the press
  out.push(c("C3 thickness >= min_visible", d.layout.border.thickness_pt * MM_PER_PT, 0.26458, 5e-5));

  if (probe) {
    const wpl = probe.words / probe.lineBoxes;
    out.push(c("words per line from the measure probe", wpl, 7.3, 0.05));
  }
  return out;
}

/** `wc`-style summary of a check run, for the CLI. */
export function formatChecks(checks: readonly SelfCheck[]): string {
  const bad = checks.filter((k) => !k.ok);
  const lines = checks.map((k) => {
    const mark = k.ok ? "ok  " : "FAIL";
    const tol = k.tolerance ? ` (tol ${k.tolerance})` : "";
    return `  ${mark} ${k.label} = ${+k.got.toFixed(6)}${tol}`;
  });
  return [...lines, "", bad.length === 0 ? `  ${checks.length}/${checks.length} agree with the design documents.` : `  ${bad.length} DISAGREE with the design documents.`].join("\n");
}
