# Design Token Architecture

**Implements:** spec §8 in full (§8.1 centralized design tokens, §8.2 the eight themes, §8.3 typography), §6.7 (density from actual font metrics), §6.8 (layout presets inherit global tokens), §6.9 (`design_lock`), §9.1–§9.2 (fixed-page renderer, consistent borders, print-safe area, binding), §7.3 (reader controls: font size, theme), §12.4 (conventional code handles typography measurement), §3.2 (`lang`); §16 item 11
**Deliverable covered:** D11 (per §16)
**Inherits:** `00-README.md` §3–§4 · `03-technical-architecture.md` §2 (determinism boundary), §4 (`src/design`, `themes/`, `fonts/registry.json`), §5 (pipeline) · `04-project-data-schema.md` §1 (unit suffixes), §6.1 (`DesignRevision`), §6.2 (`PageTemplate`), §8 (registries) · `05-content-and-composition-model.md` §2.4 (density), §2.7 (approval invalidation) · `07-lock-and-constraint-rules.md` §2 (`design_lock` precedence P), §4 (solver, 1/64 quantisation), §5.3 · `13-incremental-roadmap.md` §3.5 (Phase 5 exit criteria) · `17-decisions-and-open-questions.md` D-01, D-04, D-09, D-10, D-13, D-14, D-19, Q-02, Q-04, Part C

---

## 0. The claim this document converts into a mechanism

> **A design revision is a set of constants. Four consumers receive those constants; none of them computes one. The only place a unit is converted is the compiler, and it converts with two constants — which are asserted, not assumed.**

§1.3 requires "Digital and print editions should share visual identity without requiring identical physical pagination", and §8.1 requires that "Both HTML and PDF renderers must consume the same approved design specification", while allowing that "physical units and pagination calculations may differ appropriately between outputs". §1.2 requires all three deliverables to derive from "one approved manuscript and a shared design specification". The gap between those sentences and a working system is entirely made of units. This document closes it by fixing:

1. which quantity is *identity* (viewport-independent, must be identical everywhere) and which is *composition* (viewport-dependent, deliberately allowed to differ, D-06);
2. the two conversion constants, and the values that are **not** convertible at all;
3. a token document whose values are constants, and a compiler that emits them to four consumers;
4. the validators that make each of the above a failure rather than an intention.

---

## 1. The dual-unit problem

### 1.1 Statement of the problem

The same book must exist twice (§1.2):

| Edition | Coordinate system | Behaviour |
|---|---|---|
| Interactive HTML storybook | CSS pixels, viewport-relative, reflowable (§7.1, §7.4) | page count is a **range** over reference viewports (D-06) |
| Reading PDF / booklet PDF | millimetres and points, fixed paper, frozen at approval (§9.1, §9.3, D-05) | page count is a **single integer** (D-06) |

`04-project-data-schema.md` §1 already states the schema rule — "A design revision carries both sets; a renderer reads only its own (§8.1)". What it does not state, and what this section fixes, is **how the two sets stay in agreement**. Without a rule, three failure modes appear, each of which is expensive and late:

| Failure mode | Mechanism | Detected by |
|---|---|---|
| **Drift** | the pt value is edited and the px_css value is not (or they were set from different roundings) | `DESIGN_UNIT_PAIR_MISMATCH` (§1.3) |
| **False equivalence** | a physical quantity (safe area, gutter, binding allowance) is "converted" into CSS and treated as the same thing | `DESIGN_PHYSICAL_VALUE_IN_DIGITAL` (§1.6) |
| **Viewport leakage** | a digital geometry value is derived from the live viewport, so the "identity" changes with the window | `DESIGN_IDENTITY_FROM_VIEWPORT` (§1.7) |

### 1.2 The one fact that makes the bridge exact

The CSS reference pixel is defined against the inch, not against a device: **1 in = 96 px_css exactly** (CSS Values and Units). Therefore

```
1 pt    = 1/72 in            = 96/72  px_css = 4/3 px_css  = 1.333333… px_css
1 mm    = 1/25.4 in          = 96/25.4 px_css = 3.7795275590551185 px_css
1 mm    = 72/25.4 pt         = 2.8346456692913385 pt
```

Chromium honours this exactly when `page.pdf({preferCSSPageSize: true})` renders a page whose `@page size` is declared in `mm` or `in` (`03-technical-architecture.md` §5.3): the PDFMediaBox is in points and the CSS-px-to-pt mapping is exactly 0.75 on the printed page. **There is therefore no rounding, no DPI dependency and no browser-version dependence in the pt↔px_css bridge itself.** Any observed drift is a defect in the token set or in a stylesheet, not in the units.

Consequence: the ratio is **paper-independent**. It cannot differ per paper preset, and a token set that declares a different ratio for A5 than for half-letter is a schema error (`DESIGN_UNIT_PAIR_MISMATCH`). What *does* vary per paper preset is the **reference page box** — the px_css size at which a digital page is declared to represent the physical page (§1.4).

### 1.3 Conversion rule R1 — identity-bearing pairs (exact)

Every identity-bearing token is authored as a pair and the pair must satisfy R1 to zero tolerance:

| Rule | Ratio | Applies to | Tolerance | Check |
|---|---|---|---|---|
| **R1** | `size_px_css = size_pt × 4/3` | type sizes, rule thickness, letter spacing, drop-cap size, ornament size, indent, page-number type size | **0** | `DESIGN_UNIT_PAIR_MISMATCH` (critical) |

To remove every rounding question, `src/core/units` exposes one function and the compiler is the only caller:

```ts
// src/core/units
const PX_PER_PT = 4n / 3n;            // exact rational
const PX64_PER_PT: bigint = 256n / 3n;

quantise64(pxCss: Rational): Px64      // round to nearest 1/64 px — the solver's quantum (07 §4.5)
ptToPx64(pt: Rational): Px64           // pt × 256/3, rounded once
px64ToPt(px64: Px64): Rational         // exact inverse of the pair, for the R1 check
```

The V1 authored ladder is chosen so that the pair is exact *and* lands on a whole 1/64 px — i.e. pt values on a **0.75 pt grid** produce whole-pixel values:

| pt | px_css | 1/64 (`/64`) | pt | px_css | 1/64 (`/64`) |
|---|---|---|---|---|---|
| 9 | 12 | 768 | 21 | 28 | 1792 |
| 10.5 | 14 | 896 | 22.5 | 30 | 1920 |
| 12 | 16 | 1024 | 24 | 32 | 2048 |
| 13.5 | 18 | 1152 | 25.5 | 34 | 2176 |
| 14.25 | 19 | 1216 | 27 | 36 | 2304 |
| 15 | 20 | 1280 | 30 | 40 | 2560 |
| 16.5 | 22 | 1408 | 31.5 | 42 | 2688 |
| 17.25 | 23 | 1472 | 33 | 44 | 2816 |
| 18 | 24 | 1536 | 36 | 48 | 3072 |
| 19.5 | 26 | 1664 | 39 | 52 | 3328 |

**Rounding is still required and is still exact-by-construction.** Values not on the 0.75 pt grid are permitted (a 0.5 pt hairline = 2/3 px_css), but then R1 is checked *on the rational value* and the 1/64 quantisation is applied once, its error recorded in the compiled token set:

```
0.5 pt → 2/3 px_css (exact) → quantised 43/64 = 0.671875 px_css  (error +0.0052 px_css)
```

**Rule:** R1 is checked before quantisation; quantisation error is never allowed to break R1. A pair that fails R1 by any amount is a `DESIGN_UNIT_PAIR_MISMATCH` critical finding, and the design revision is not usable for composition (so the failure surfaces at `dsg_rev` creation, not at print time).

### 1.4 Per paper preset — the constants that do vary

`layout.paper` selects the paper (§9.1: half-letter, A5, custom; Q-04 default ships both presets). For each preset the compiled token set carries a **reference page box**: the px_css box at which a digital page is declared to represent one physical page.

| Preset | Trim (`_mm`) | Trim (`_px_css`, exact) | Trim at 96 dpi | Reference page box `page.ref_box_px_css` | Deviation of ref box from trim |
|---|---|---|---|---|---|
| `half_letter` | 139.7 × 215.9 | 528.0000 × 816.0000 | 5.5 × 8.5 in exactly (US Letter folded) | **528 × 816** (single) · 1056 × 816 (spread) | 0.000 px (0.0000 %) |
| `a5` | 148 × 210 | 559.3701 × 793.7008 | 5.83 × 8.27 in | **559.375 × 793.6875** (single) · 1118.75 × 793.6875 (spread) | +0.005 / −0.013 px (≤ 0.0009 %) |
| custom | `layout.paper_fit[].paper` | computed | — | `page.ref_box_px_css` is **required** for a custom paper; no default is inferred | validator-checked ≤ 0.5 px |

Two facts fall out, and both are load-bearing:

- **half-letter is exact.** 5.5 in × 96 = 528 px_css and 8.5 in × 96 = 816 px_css, so the half-letter reference box needs no rounding at all. This is the paper the §14 reference book uses, so the parity invariant of §1.7 can be proved to the last 1/64 px on it.
- **A5 needs one quantisation.** Its ref box is stated as a whole 1/64 px value so that every downstream geometry value inherits the same quantum; `ref_box_tolerance_px_css = 0.5` bounds the deviation.

`page.ref_box_tolerance_px_css` is a token, not a constant in code, so R2 (below) is checked against a declared bound.

Conversion factors actually used per preset, for the avoidance of arithmetic in any consumer:

| Preset | `mm → pt` (R2) | `mm → px_css` at the ref box (R3) | `pt → px_css` (R1) |
|---|---|---|---|
| all presets | × 2.8346456693 | × 3.7795275591 | × 4/3 |
| all presets | (paper-independent) | (paper-independent **at the ref box**, because the ref box is the trim at 96 dpi — §1.4) | (paper-independent; cannot vary — §1.2) |

> **Divergence from the commissioning wording, stated rather than silently reconciled.** This document was asked for "a stated px_css↔pt ratio **per paper preset**". There is no defensible per-preset pt↔px_css ratio, and inventing one would be the defect this section exists to prevent: 1 pt ≡ 4/3 px_css is fixed by the CSS reference pixel and by `preferCSSPageSize` (D-01), so a per-preset variation could only encode a rounding error. The requirement is answered by giving the invariant ratio in table form above **and** the per-preset constants that genuinely differ — the reference page box and the resulting `mm → px_css` factor. If a per-preset ratio is wanted for a reason not visible in the spec, the place to put it is `page.ref_box_px_css`, which is per-preset already.

### 1.5 Which values are derived from which

The derivation graph is a DAG with exactly one level of derivation. **Nothing is derived across a unit boundary except by R1, R2 or R3.**

| Level | Token path (example) | Source | Derived how | Recomputable? |
|---|---|---|---|---|
| **A0 authored (print)** | `type.body.size_pt`, `type.heading.size_pt`, `type.display.size_pt` | author | — | — |
| **A0 authored (digital)** | `type.body.size_px_css`, … | author | — | — (independently authored, then *checked* against A0-print by R1) |
| **A0 authored (physical)** | `layout.paper.*_mm`, `layout.safe_area_mm`, `layout.gutter_mm`, `layout.binding_allowance_mm`, `layout.text_box_mm.*`, `layout.border.*` | author | — | — |
| **A0 authored (surface)** | `colour.*`, `page.background`, `motion.*`, `page.numbering.*` | author | — | — |
| **A1 derived, same unit** | `type.*.line_height` → `type.*.line_pitch_px64`, `type.*.line_pitch_pt` | A0 | `round(size_px_css × line_height × 64)`; `size_pt × line_height` | yes, one formula, one rounding |
| **A1 derived, metric-dependent** | `type.*.ascent_px_css`, `.descent_px_css`, `.line_gap_px_css`, `.content_area_px_css`, `.first_baseline_offset_px_css` | the **font file** + A0 size | read from the OpenType tables, scaled by `size/upem`, quantised (§5.1) | yes, per font hash |
| **A1 derived, cross-unit** | `layout.*_px_css` (from `_mm`), `layout.border.thickness_px_css` (from `_pt`) | A0 physical | R2 → R3, then one quantisation | yes |
| **A1 derived, ratio** | `layout.text_box_ratio` = `text_box_mm.width / paper.width_mm` | A0 | division; **derived; consumed only as the digital content-width factor; never an input to a derived value** | yes |
| **A2 derived, reader scale** | `type.*.size_px_css` at scale step *s* | A1 × `reader_overrides.scale_steps[]` | `quantise64(size_px_css × s)` | yes, at render time, per step |
| **A2 derived, fit** | `page.inset_px_css` at a live page box | A0 ratio × live box width | `ratio_projection` (§1.7) | at render time |

Rules that follow, and are asserted:

| # | Rule | Finding |
|---|---|---|
| D-1 | `typography` and `layout` blocks in a `DesignRevision` (`04` §6.1) are a **projection** of the token set, never a second source. Every field must equal its token path. | `DESIGN_TOKEN_BLOCK_DIVERGENCE` (critical) |
| D-2 | `layout.text_box_ratio` is derived, not authored. Authoring it reintroduces a second number that can disagree with the geometry. | `DESIGN_DERIVED_TOKEN_AUTHORED` (major) |
| D-3 | No A1 value may be authored directly. `line_pitch_px64`, `first_baseline_offset_px_css`, every `*_px_css` projection of an `_mm` field: authored values are rejected at schema level. | `DESIGN_DERIVED_TOKEN_AUTHORED` (major) |
| D-4 | A metric-dependent A1 value is invalidated by any change to the font file (`metrics_hash`, D-09) even if the token set is byte-identical. | `DESIGN_FONT_METRICS_DRIFT` (critical) |

### 1.6 What is **not** convertible

These have no digital equivalent. There is no fact of the matter about what 6 mm "is" on a screen, so any code path that converts one is a defect.

| Value | Why not convertible | Consumers permitted to read it |
|---|---|---|
| `layout.paper.*_mm` (trim) | the paper's size is a physical fact; a screen has no paper | print sheet only |
| `layout.safe_area_mm` | the distance from the trim edge that survives cutting/folding (§9.2) | print sheet, print validator |
| `layout.gutter_mm`, `layout.binding_allowance_mm` | spine compensation for a bound object (§9.1) | print sheet, imposition (`10-booklet-imposition-spec.md`) |
| `layout.border.min_visible_mm` | whether a rule survives the production process (§9.2) | design validator, print sheet |
| `motion.*` (durations) | paper does not move; a motion token read by the print compiler is a defect | reader only (and `print_safe: false`, §2.4) |
| sheet/fold arithmetic, duplex flip edge (§9.4) | imposition is arithmetic on printed sheets | imposition module only |
| any DPI-dependent quantity (rasterisation, `page_png` resolution) | output of a rasteriser, not a design decision | print/pdf only |

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_PHYSICAL_VALUE_IN_DIGITAL` | critical | a physical `_mm` field reaches the reader stylesheet, the measurement container, or the compiled JS token object as a *value* (as opposed to the reference page box, which is `_px_css` and is itself a token) |
| `DESIGN_MOTION_TOKEN_IN_PRINT` | major | the paged-media compiler consumes a `motion.*` token |

### 1.7 Identity vs composition, and the parity invariant

Two coordinate behaviours must be separated, or the model collapses:

| Class | Definition | Examples | Viewport-dependent? |
|---|---|---|---|
| **Identity** | a constant that makes the digital book recognisably the same book as the printed one | type size `_px_css`, line height, family, colour, rule **style**, rule thickness, page proportion, background | **Never** |
| **Composition** | the arrangement of content in the available box | page box size, frame inset in px, padding, measure, line breaks, page count | Yes — by design (§6.10, §7.4, D-06) |
| **Ratio (the bridge between them)** | a declared proportion that survives every viewport | `frame_inset_mm / paper_width_mm`, page aspect, text-box-to-page ratio | Never |

**R4 — ratio projection.** Digital geometry is projected from the physical geometry by proportion against the page box, never by unit conversion against the viewport:

```
ratio_projection(value_mm, paper_mm) = value_mm / paper_mm
page.inset_px_css(box)               = quantise64( ratio_projection(border.offset_mm, paper.w_mm) × box.w_px_css )
```

At the reference box this is *identical* to R3, which is the consistency proof:

```
8 mm on half_letter:  ratio = 8 / 139.7 = 0.057266…
                      at 528 px_css box → 30.23438 px_css (1935/64)
                      R3 direct        → 30.23622 px_css → quantised 30.23438 px_css  ✓
```

**The parity invariant.** Because (a) the reference page box is the trim at 96 dpi, (b) the text box is a ratio-projected physical measure, and (c) type sizes satisfy R1, the digital plan measured at the reference box and the print plan must produce **identical line-break positions and identical lines-per-page**. Worked check on `warm_parchment` / half-letter:

| Quantity | Print | Digital at ref box |
|---|---|---|
| measure | `96 mm` = 272.1260 pt | `96 mm × 3.7795275591` = 362.82812 px_css (23221/64) |
| body size | 13.5 pt | 18.00000 px_css (1152/64) |
| mean line length — **assumed** at a 0.5 em advance (root cause; see the note below) | 40.315 chars | 40.314 chars |
| mean line length — **measured** at the body face's 0.440 em advance | 45.83 chars | 45.83 chars |
| line pitch | 20.25 pt | 27.00000 px_css (1728/64) |

**The mean character-advance figure is an *assumption*, and it is the root cause of a constant that was wrong three times elsewhere in this set.** The `40.3 chars` row above is computed from a nominal **0.5 em mean advance** — `362.8346 px_css ÷ (0.5 × 18 px_css) = 40.315` — not from a measurement. The reference theme's body face at `18 px_css` has a mean advance of **0.440 em = 7.918 px_css** (`362.8346 ÷ 7.918 ≈ 45.83` characters per line); that is the advance the build's `measure_probe` reflects — `197 _words_` over **`25`** line boxes, not the `27` the assumption implied. (An earlier `23` came from the right instrument — element height ÷ line pitch — run in the **wrong face**, because the harness never loaded the design's font; the rendered face is now **asserted** by comparing widths against an absent family, `08` §2.6. An even earlier `25` came from counting fragment rects instead of line boxes. The four generations are in `05` §1.6 item 6.) A length model that divides a character count by the *assumed* advance therefore lands on the wrong line count. **Rule, and it is binding here:** a character-advance figure is a property of one concrete face at one concrete size and must be **measured on that face**, never assumed; a figure divided by an assumed advance is not a measurement. **And the face is one directory, in the face the product ships.** An advance — and every metric derived from it, including `words_per_line_measured` — must be measured **in the face the product ships**, and `app/assets/fonts` is the single source for that face (Lora and Cinzel, both SIL OFL 1.1; §6.1). A measurement taken in any other face — including a fallback Chromium substituted silently — is a measurement of another book, and `document.fonts.check()` will not reveal it, because it reports an unavailable family as available while `document.fonts.load()` given a whole quoted stack resolves without loading anything (§6.1a).

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_PARITY_LINEBREAK_DRIFT` | major | the digital plan at the reference box breaks a line differently from the print plan for the same block, same `dsg_rev`, same Chromium build |
| `DESIGN_IDENTITY_FROM_VIEWPORT` | critical | a token marked `role: identity` in the compiled set has a value that depends on the live viewport rather than the reference box |
| `DESIGN_PAGE_ASPECT_DRIFT` | major | `page.ref_box_px_css` aspect differs from the trim aspect by more than `page.ref_box_tolerance_px_css` |

**Why parity matters and why it is not parity of page counts.** Line breaks and lines-per-page are identical at the reference box; the *page count* still differs because the reader may be at 360 × 640, where the page box shrinks and the same line pitch produces fewer lines per page (§6.10 "Digital page counts may change when typography or viewport dimensions change"). The invariant that makes "the same book" mechanical is therefore *line-break parity at the reference box*, not page-count equality — and D-06 exists precisely so the two counts are never confused.

### 1.8 Numeric contradiction in `04-project-data-schema.md` §6.1 — reported, not edited

`04` §6.1's example `typography` block pairs `size_pt: 13` with `size_px_css: 18`. Under R1 that pair is wrong by 3.9 %: `13 pt × 4/3 = 17.3333 px_css`, and `18 px_css` corresponds to **13.5 pt**. The heading (`22 → 30`) and display (`30 → 42`) pairs show the same −0.5 pt offset. `04` §6.1 is a binding contract for *field names*; its example values are illustration and are corrected here, in favour of the px values (which are the round numbers, and which keep the line-height relationships exact):

| Path | `04` §6.1 example | Corrected pair (R1-exact) | Line pitch `_px_css` (1/64) |
|---|---|---|---|
| `type.body.size_pt` / `_px_css` | 13 / 18 | **13.5 / 18** | 18 × 1.5 = 27.00000 (1728/64) |
| `type.heading.*` | 22 / 30 | **22.5 / 30** | 30 × 1.15 = 34.50000 (2208/64) |
| `type.display.*` | 30 / 42 | **31.5 / 42** | 42 × 1.15 = 48.29688 (3091/64) |

Also reported, and since **resolved**: `04` §6.1's `layout.text_box_ratio` was `0.68` against `text_box_mm.width: 96` on a 139.7 mm page. `04` §6.1 now carries the field as the **exact rational** `96/139.7` (`{"n_mm": 96, "d_mm": 139.7}`), marked derived — **not** the 4-decimal `0.6872`, which is one quantum off (`528 × 0.6872 = 362.8416 px_css → 23222 q` where the geometry gives `23221 q`, and one quantum is enough to move a line break at the reference box, §1.7) — and the unit pairs in `typography` were corrected to satisfy `px_css = pt × 4/3` exactly (13.5/18, 22.5/30, 31.5/42). The discrepancy cannot recur because the value is no longer authored.

---

## 2. Token document format

### 2.1 The document

A **theme** is a named token document: `themes/<name>.json` (`03` §4, `04` §8). A **design revision** embeds a token set plus the revisions and reader policy that are specific to one project (`04` §6.1). The theme's job is to be the *starting* token set; the design revision's is to be the frozen, hashed one (D-10).

```jsonc
// themes/warm_parchment.json  — the reference theme (§14 "Warm paper appearance")
{
  "theme_id": "warm_parchment",
  "display_name": "Warm Parchment",
  "tokens_version": 1,
  "spec": { "spec_ref": "§8.2", "phase": 5, "illustrations_required": false },   // §8.2 "All themes should function without illustrations"

  "colour":  { /* §2.3 */ },
  "type":    { /* §2.3 + §4.1 + §5 */ },
  "space":   { /* §2.3 */ },
  "rule":    { /* §2.3 + §7 */ },
  "motion":  { /* §2.3 */ },
  "layout":  { /* §2.3 + §7.4 */ },
  "page":    { /* §2.3 */ },

  "meta": { /* dotted path → TokenMeta, §2.4 */ },
  "fonts": [ "Lora", "Cinzel" ],                    // registry keys; licence enforced by D-09
  "audience": { "age_range": [6, 10], "proficiency": "early" },
  "density_band": { "band": "early", "sparse_below": 0.33, "dense_above": 0.80 }   // §4.3
}
```

The `design/revisions/<hash>.json` document (`04` §6.1) carries the same token blocks under `tokens`, plus `theme`, `typography`, `layout`, `lang`, `hyphenation`, `reader_overrides`, and two additive fields this document requires:

| Added field | Path | Why it is needed |
|---|---|---|
| Active paper | `tokens.layout.paper` | the paper a geometry block was authored for; `04` §6.1 has one `text_box_mm`, so the active paper must be declared or the geometry is ambiguous |
| Paper fit overrides | `tokens.layout.paper_fit[]` | Q-04 ships two presets; each is a complete geometry block, selected by `paper`, never scaled into the other (§8.1 "may differ appropriately") |

**Rule:** switching paper selects a *different geometry block*, which is a different `dsg_rev`, never a render-time scale factor. A paper with no `paper_fit` block is `DESIGN_PAPER_UNSUPPORTED` (critical) — the print path never improvises a text box (§9.1 "deterministic physical page measurements").

### 2.2 Naming convention

Dotted paths, lowercase, snake_case segments, **unit suffix always** (`00` §4.4). A path is simultaneously: the JSON key path, the lock target (§2.5), the CSS custom-property name source (§3.5), and the key in the `meta` map. One grammar, four uses.

```
<category>.<group>.<item>[_<modifier>]_(pt|px_css|mm|em|lines|ms|ratio|pct)
```

| Example path | Meaning | Notes |
|---|---|---|
| `colour.rule` | perimeter rule colour | no unit — a colour is dimensionless |
| `colour.ink.body` | body text colour | |
| `type.body.size_pt` | body size, print | pair with the next path (R1) |
| `type.body.size_px_css` | body size, digital reference | |
| `type.body.line_height` | unitless multiplier | never `normal` (§5.1) |
| `layout.border.offset_mm` | frame inset from the trim edge | name fixed by `04` §6.1 |
| `layout.border.thickness_pt` | outer rule thickness | name fixed by `04` §6.1 |
| `space.block_gap_em` | inter-block gap | relative, so it scales with the reader step |
| `space.paragraph_indent_em` | first-line indent | |
| `rule.section_divider.thickness_pt` | interior divider | distinct from the perimeter (`layout.border.*`) |
| `motion.transition_fade_ms` | reader transition duration | `print_safe: false` |
| `page.background.colour` | page background | |
| `page.ref_box_px_css` | reference page box (§1.4) | per paper preset |

**Enum-valued tokens** are lowercase snake_case strings in a closed set (`04` §1): `layout.border.style ∈ {none, single_rule, double_rule, ribbon}`, `layout.border.corner ∈ {square, mitered, ornament}`.

**Naming conflict, resolved in favour of the schema.** This document was commissioned with the example path `layout.border.inset`. `04` §6.1 names the field `layout.border.offset_mm` and `04` is binding, so `offset_mm` is canonical here and `inset` appears only as prose. Likewise `type.body.size` is never a path: a bare dimension is a schema error (`04` §1) so the path always carries its unit.

### 2.3 Categories

Seven categories. Each has a stated **authoritative consumer** (§3.3) and a stated geometry effect (which drives propagation, §8.2).

| Category | Contains | Geometry-affecting? | Typical consumers |
|---|---|---|---|
| `colour` | `ink.*`, `rule`, `accent`, `background.*`, `link`, plus the reader colour variants (§4.4) | **no** | reader, print sheet, JS |
| `type` | per role (`body`, `heading`, `display`, `caption`, `page_number`, `scripture`, `quotation`): `family`, `size_pt`, `size_px_css`, `line_height`, `letter_spacing_em`, `hyphenate`, `weight`, `small_caps`; plus `minimum_readable_pt`, `orphans`, `widows`, `scale_steps`, `measure_cpl_band` | **yes** | all four |
| `space` | `block_gap_em`, `heading_space_before_em`, `paragraph_indent_em`, `page_padding_*` | **yes** | all four |
| `rule` | `section_divider.*`, `ornament.*`, `drop_cap.*`, `head_rule.*` | **yes** (reserves space) | all four |
| `motion` | `transition_*_ms`, `transition_style` (§7.2 enum) | no | reader, JS |
| `layout` | `paper`, `paper_fit[]`, `text_box_mm`, `text_box_ratio`, `border{}`, `safe_area_mm`, `gutter_mm`, `binding_allowance_mm`, `spacing_tolerance{}`, `density_tolerance{}` | **yes** | all four |
| `page` | `ref_box_px_css`, `background`, `numbering{}`, `head_rule`, `proportion` | **yes** (proportion) | all four |

`layout.border` is the perimeter frame (§7) and is the one geometry token that every `PageTemplate` inherits; `rule` is everything drawn *inside* the text area.

**Naming gap — RESOLVED (round 3).** `05-content-and-composition-model.md` §2.4 and §2.7 refer to `spacing_tolerance` "in the design revision" as the bound on the only content-neutral automatic edit. `04` §6.1's `layout` block now **does** define the field — `layout.spacing_tolerance = {"min": -0.06, "max": 0.06}`, a fraction of line height (reconciliation R-5) — and this document follows the schema, which is binding for field names (§10 item 5): the token is `layout.spacing_tolerance`, not `space.spacing_tolerance`, and the earlier reading of it here as a ratio of the base gap (`±0.15`) is **superseded**. `08` §9.4's worked example uses the same `±6 %` figure against `04` §6.1, so that the tolerance actually binds. The finding is `COMP_SPACING_OUT_OF_BOUNDS` (`05` Part 3 invariant 13, `07` §5.3).

### 2.4 Token metadata

Metadata sits **beside** the values, in a parallel `meta` map keyed by dotted path, not wrapped around them — wrapping would break `04` §6.1's literal form (`"size_pt": 13`) and the CSS emission in §3.5.

```jsonc
"meta": {
  "type.body.size_pt": {
    "unit":       "pt",              // required; must agree with the path suffix (04 §1)
    "role":       "identity",        // identity | composition | surface | advisory
    "lock_default": true,            // §2.5 — materialised as a design_lock on project creation
    "print_safe": true,              // §7.4 — false means the print sheet must refuse it
    "consumers":  ["print_sheet", "js"],
    "derived_from": null,
    "changes_geometry": true,        // §8.2 propagation
    "since": "1.0.0"
  },
  "layout.border.thickness_pt": {
    "unit": "pt", "role": "identity", "lock_default": true, "print_safe": true,
    "consumers": ["print_sheet", "measure_container", "js"],
    "derived_from": null, "changes_geometry": true, "since": "1.0.0"
  },
  "motion.transition_fade_ms": {
    "unit": "ms", "role": "surface", "lock_default": false, "print_safe": false,
    "consumers": ["reader_css", "js"], "derived_from": null, "changes_geometry": false, "since": "1.0.0"
  }
}
```

| Field | Domain | Rule | Finding when violated |
|---|---|---|---|
| `unit` | `pt \| px_css \| mm \| em \| ms \| ratio \| pct \| nil` | must match the path suffix; `nil` only for colours and enums | `DESIGN_TOKEN_UNIT_UNSUFFIXED` (critical) |
| `role` | `identity \| composition \| surface \| advisory` | `identity` may never derive from the viewport (§1.7) | `DESIGN_IDENTITY_FROM_VIEWPORT` (critical) |
| `lock_default` | bool | `true` ⇒ a `design_lock` is materialised at project creation with `reason: "token default: identity-bearing"` (§2.5) | — |
| `print_safe` | bool | `false` ⇒ any print consumer that reads it emits `DESIGN_PRINT_TOKEN_UNSAFE` (major, blocking for print approval) | `DESIGN_PRINT_TOKEN_UNSAFE` |
| `consumers` | subset of the four (§3.2) | the compiler emits the token to exactly this set — no more, no less | `DESIGN_TOKEN_CONSUMER_UNDECLARED` (major) |
| `derived_from` | path or null | non-null ⇒ the value must equal the derived expression (rules D-1…D-3) | `DESIGN_DERIVED_TOKEN_AUTHORED` (major) |
| `changes_geometry` | bool | drives the propagation matrix (§8.2) and the measurement-cache key (§8.4) | — |
| `since` | semver | a token added in a later version; a design revision referencing a token newer than the engine supports refuses to open (`04` §9 rule 5 pattern) | `DESIGN_TOKEN_VERSION_UNSUPPORTED` (critical) |

`print_safe` is not decorative. The rule-thickness ladder demonstrates it:

| Token value `layout.border.thickness_pt` | mm | px_css (1/64) | `print_safe` | Reason |
|---|---|---|---|---|
| 0.375 | 0.13229 | 0.50000 (32/64) | **false** | below `min_visible_mm` (0.18 mm) — a RIP may drop the rule, and §9.2 requires the frame to "remain visible after printing, cutting, or folding under the selected production settings" |
| 0.5625 | 0.19844 | 0.75000 (48/64) | true | survives laser and offset production |
| 0.75 | 0.26458 | 1.00000 (64/64) | true | the reference theme's frame (`04` §6.1) |
| 1.5 | 0.52917 | 2.00000 (128/64) | true | |
| 2.25 | 0.79375 | 3.00000 (192/64) | true | |

### 2.5 `design_lock` targeting token paths

`07-lock-and-constraint-rules.md` §2 defines `design_lock` as precedence class **P** with scope shape `token_paths[]`, protecting "a design decision against automatic change", violated by "an automatic design mutation (theme switch, spacing adjustment, auto-fit)". The scope is exactly the path grammar of §2.2.

| Scope value | Matches | Notes |
|---|---|---|
| `type.body.size_pt` | that path only | |
| `type.body.*` | every descendant of `type.body` | `*` = exactly one segment |
| `type.**` | every path under `type` | `**` = one or more segments |
| `layout.border.**` | the whole perimeter frame | the recommended default lock, because §9.2's consistency is a global property |
| `colour*` | — | **invalid**: a lock target is a full path segment, never a prefix substring | `DESIGN_LOCK_PATH_INVALID` (critical at lock creation) |

Semantics, all asserting `07` §2's central sentence ("the lock exists to stop the machine, not the author"):

| Rule | Behaviour | Cite |
|---|---|---|
| User edits always pass | a token change made by the author is never blocked; `reason` is required on the lock and on the action | `07` §2 |
| Automatic operations are refused | theme switch, auto-fit spacing, "improve layout", automatic paper selection, automatic fallback substitution: any that would change a locked path raises `DESIGN_LOCK_VIOLATED` (critical, blocking) and the operation creates **no** revision | `07` §5.3 |
| Adding a token under a locked ancestor is locked | prevents the escape hatch of "introduce a second token for the same decision" | this document (extension) |
| A locked path missing from the current token set | `DESIGN_LOCK_PATH_UNRESOLVED` (major) — a lock pointing at a removed token is never silently ignored | mirrors `04` §3's dangling-pointer rule |
| A lock may not be released by any automatic process | `07` §5.4 rule 1, restated for design locks | `07` §5.4 |
| Default locks are materialised, not implied | `lock_default: true` produces a real `lck_` row with a `reason`; an implication in code is invisible to the author | `04` §5.3 ("Every lock carries a human `reason`") |
| Precedence overrides require a reason | `precedence` may be changed only with a non-empty `reason` | `07` §2 |

---

## 3. Token compilation into four consumers

### 3.1 The compiler

One module (`src/design`, `03` §4: "tokens, theme compilation, typography metrics"), one deterministic function:

```ts
compileDesignRevision(input: {
  dsgRev: DesignRevision;             // the frozen token set (D-10)
  theme: ThemeDocument;               // themes/<name>.json
  registry: FontRegistry;             // fonts/registry.json (D-09)
  paper: PaperPreset;                 // layout.paper
  viewportClass: "ref" | ViewportSpec;// "ref" = page.ref_box_px_css
  chromiumBuild: string;              // D-14
}): CompiledTokens
```

`CompiledTokens` is the single authority for every value any consumer receives. It is content-addressed (`theme_token_hash`, recorded in every artifact manifest per D-14) and cached under `project/.cache/compile/<hash>.json` (`03` §6: `.cache/` is disposable and reproducible).

```ts
interface CompiledTokens {
  paths: Record<TokenPath, CompiledValue>;   // one entry per token path, unit-quantised
  px64:  Record<TokenPath, Px64>;            // the solver's integer view (07 §4.5)
  meta:  Record<TokenPath, TokenMeta>;       // §2.4
  fontMetrics: Record<FamilyKey, FontMetrics>;
  metricsHash: string;                       // §8.4
  divergences: Finding[];                    // anything that failed a rule in §1–§2
}
```

### 3.2 The four consumers

| # | Consumer | Module | Reads | Never sees |
|---|---|---|---|---|
| **a** | **reader CSS custom properties** — the shipped HTML storybook's `:root` block | `src/digital/reader/` | `_px_css`, `em`, colours, `ms`, projected geometry | `_pt`, `_mm` (except through the ref-box projection, which is already `_px_css`), sheet arithmetic |
| **b** | **paged-media stylesheet** — `@page` size, margins, the perimeter frame, print type | `src/print/layout/`, `src/print/border/` | `_pt`, `_mm`, `_px_css`, colours, `_lines` | `motion.*`, reader scale steps |
| **c** | **measurement container** — the off-screen box the pagination bridge lays each block out in (`03` §5.1 step 2) | `src/digital/measure/` | the exact content-box width and every property that affects line breaking | colours (they affect no measurement), `motion.*`, paper geometry |
| **d** | **JS-side values** — what the solver, density classifier and validators read | `src/composition/`, `src/validation/` | `CompiledTokens.px64` and `paths` | nothing is hidden from (d); (d) is the compiler's output |

### 3.3 Which consumer is authoritative for what

| Token category | Authoritative source of the *value* | Why | The other consumers are |
|---|---|---|---|
| `colour` | **(d)** the compiled token | a colour is a single constant; the reader theme variants are colour-only projections (§4.4) | generated from (d); may not invent or adjust a colour |
| `type.*.size_pt`, `.size_px_css`, `.line_height`, `.minimum_readable_pt`, `.scale_steps`, `.orphans`, `.widows` | **(d)** | the pair and its derived pitch are checked by R1 and rule D-1 | (a)(b)(c) receive the value verbatim |
| `type.*` metric-derived (`ascent`, `descent`, `line_gap`, `content_area`, `first_baseline_offset`) | **(c)** the measurement container, as *measured* | font metrics come from the font file through Chromium's layout, and the bridge is the only thing that has laid the text out (`03` §5.1) | (d) holds the compiled expectation; validation compares the two; a mismatch is `DESIGN_FONT_METRICS_DRIFT` (critical) |
| `space.*`, `rule.*` | **(d)** | geometry that reserves space | all four receive it; (c) must use the same values or the plan is measured against a box no renderer uses |
| `motion.*` | **(d)** | reader-only | (a) and the JS reader runtime only; (b)(c) must never read it (§1.6) |
| `layout.border.*`, `layout.safe_area_mm`, `gutter_mm`, `binding_allowance_mm`, `text_box_mm`, `paper*_mm` | **(d)** for the authored value; **(b)** for the rendered result | the *token* is authoritative; what the page actually shows is the print sheet's output, and §9.2's guarantees are about the rendered page | validation compares (b)'s rasterised geometry against (d)'s expectation |
| `layout.text_box_ratio`, `page.ref_box_px_css` derived positions | **(d)**, computed | derived values have no second author (rule D-2) | — |
| `page.*`, `layout.paper` | **(d)** | — | all four |
| any **measured** quantity (line boxes, block heights, used lines, fill ratio) | **(c)** | measurement is the ground truth for §6.7 density and §6.10 fit | (d) receives it; the solver consumes it; no validator may recompute it by a different method |

The rule that makes this a mechanism rather than a diagram:

> **No consumer may compute a value the others do not receive.** A consumer either receives a compiled value or it receives a *measured* value from (c). It may compose values (sum, `calc()`, multiplication by a declared scale step) but it may not derive a token: no unit conversion, no default when a token is absent, no clamping, no fallback constant in code.

| Prohibited | Finding |
|---|---|
| a unit conversion in the reader, the print sheet, the measurement container or the solver | `DESIGN_UNIT_CONVERSION_IN_CONSUMER` (critical) |
| a hard-coded fallback when a token path is missing | `DESIGN_TOKEN_MISSING_AT_CONSUMER` (critical) |
| a `calc()` in the reader that changes an `identity` token's value rather than composing it | `DESIGN_TOKEN_COMPUTED_IN_CONSUMER` (major) |
| the measurement container applying a padding, margin or border the renderers do not apply | `DESIGN_MEASURE_BOX_DIVERGENCE` (critical) — this is the failure that makes §6.7 density a lie |

### 3.4 Compilation is deterministic and version-pinned

| Property | Rule | Cite |
|---|---|---|
| Deterministic | same `(dsg_rev, theme, registry, paper, chromiumBuild)` ⇒ byte-identical `CompiledTokens`; asserted by a golden test that hashes the result | D-04, D-14, `00` §4.3 |
| Pinned | `CompiledTokens.metricsHash` and `theme_token_hash` are recorded in every artifact manifest; a manifest whose hashes cannot be reproduced is `unreproducible`, not valid | D-14 |
| Cached | `.cache/compile/` is disposable; deleting it changes nothing but time | `03` §6 |
| Chromium-dependent by design | font metrics and line breaking come from the pinned Chromium (D-01); a Chromium build change recompiles and re-measures | D-01, `13` §8 R1 |

### 3.5 CSS custom-property naming (mechanical, lossless)

The property name is a total function of the path, so a test can round-trip it both ways:

```
path  type.body.size_px_css        →  --sb-type-body-size-px-css
path  layout.border.thickness_pt   →  --sb-layout-border-thickness-pt
path  colour.rule                  →  --sb-colour-rule
```

Rules:

- dots → dashes, underscores → dashes, prefixed `--sb-`; the **unit suffix is retained** in the name, so `…-size-pt` and `…-size-px-css` are distinct properties and neither can be confused for the other.
- the reader stylesheet carries only `_px_css`/`em`/`nil`/`ms` properties; the paged-media stylesheet carries `_pt`/`_mm`/`_px_css`. A property present in both sheets must be unit-consistent with its path: `DESIGN_CSS_PROPERTY_UNIT_MISMATCH` (major).
- `em`-valued token groups (e.g. `space.*`) are emitted as unitless custom properties and applied with `em` at the point of use, so they scale with the reader's font step without a second token existing per step.
- reader colour variants (§4.4) are emitted as a scoped block (`[data-sb-reader-theme="sepia"]`), never as a second `--sb-*` name, so a reader variant cannot shadow a token path.

### 3.6 Tests that prove §3

| Test | Asserts | Phase |
|---|---|---|
| `T-DSN-*` compile agreement | for every token path, every consumer that declares it in `meta.consumers` receives a value that normalises to the same quantity; consumers that do not declare it receive nothing | 5 |
| `T-DSN-*` no-conversion | static analysis + a runtime assertion: no consumer module imports `src/core/units` | 5 |
| `T-DSN-*` measure-box agreement | the measurement container's used content box equals the print plan's and the reader's for the ref box | 1 (bridge), re-run in 5 |
| `T-DSN-*` parity | §1.7's line-break parity on the fixture at the half-letter ref box | 5 |
| `T-DSN-*` reader-variant metric identity | every reader colour variant block shares every non-colour property byte-for-byte (§4.4) | 5 |

---

## 4. The eight V1 themes (§8.2)

### 4.1 The themes

All eight are text-only and must work without illustrations (§8.2). Every family below is in `fonts/registry.json` with a licence entry (D-09); every pair satisfies R1; all sizes are whole 1/64 `_px_css`. Geometry is stated for `half_letter` (Q-04 default also ships `a5` as a `layout.paper_fit[]` block).

| # | Theme | Audience (§3.2 profile) | Font pairing — family (licence) | body `_pt`/`_px_css` | heading `_pt`/`_px_css` | display `_pt`/`_px_css` | line height body / head / disp (pitch px_css) | border style | background treatment | accent | density band `sparse_below`/`dense_above` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Classic Children's Storybook** | ages 6–10, `early`; bedtime/adventure/fable (§2.1) | **Andika** (SIL OFL 1.1, literacy-designed) · **Nunito** (SIL OFL 1.1) · **Baloo 2** (SIL OFL 1.1) | 15 / 20 | 21 / 28 | 30 / 40 | 1.5 / 1.25 / 1.15 → 30.00000, 35.00000, 46.00000 | `single_rule`, 1.5 pt (0.5292 mm), `offset_mm` 9, `corner: ornament` | flat warm cream `#FFF9EE`, no texture, no grain (grain prints muddy and burns toner) | `#C2542B` | `early` 0.33 / 0.78 |
| 2 | **Gentle Bedtime** | ages 3–7, `emerging` (§2.1 bedtime) | **Nunito** (SIL OFL 1.1) · **Quicksand** (SIL OFL 1.1) · **Fredoka** (SIL OFL 1.1) | 15 / 20 | 18 / 24 | 27 / 36 | 1.6 / 1.25 / 1.2 → 32.00000, 30.00000, 43.20312 | `single_rule`, 0.75 pt (0.2646 mm), `offset_mm` 11, `corner: square` | flat dusk lavender `#F3F0F8`; dark variant `#1E1B26` for low light | `#6B5CA5` | `emerging` 0.30 / 0.72 |
| 3 | **Biblical Heritage** | ages 8–12 and general adult (§2.2) | **EB Garamond** (SIL OFL 1.1) · **Cinzel** (SIL OFL 1.1, display only — inscriptional capitals are unreadable at body length) | 13.5 / 18 | 21 / 28 | 31.5 / 42 | 1.55 / 1.2 / 1.15 → 27.90625, 33.59375, 48.29688 | `double_rule`, outer 1.5 pt / inner 0.5625 pt, `gap_mm` 2, `offset_mm` 8, `corner: square` | flat parchment `#FBF7EF`, no image (V1) | `#7A1F1F` | `developing` 0.35 / 0.85 |
| 4 | **Inspirational Elegance** | adults (§2.3) | **Lora** (SIL OFL 1.1) · **Cormorant Garamond** (SIL OFL 1.1) | 13.5 / 18 | 22.5 / 30 | 33 / 44 | 1.6 / 1.2 / 1.15 → 28.79688, 36.00000, 50.59375 | `single_rule`, 0.5625 pt (0.1984 mm), `offset_mm` 12, `corner: square` | flat near-white `#FCFCFA` | `#2F5D62` | `fluent` 0.38 / 0.90 |
| 5 | **Warm Parchment** (reference theme for §14) | ages 6–10, `early` (§14 "Warm paper appearance") | **Lora** (SIL OFL 1.1) · **Cinzel** (SIL OFL 1.1) | 13.5 / 18 | 22.5 / 30 | 31.5 / 42 | 1.5 / 1.15 / 1.15 → 27.00000, 34.50000, 48.29688 | `double_rule`, 0.75 pt, `offset_mm` 8, `colour #8a6f47`, `corner: square` (verbatim `04` §6.1) | flat parchment `#F6EDDA` (no image; V1 is text-only, §8.2, §13) | `#9C5A2E` | `early` 0.33 / 0.80 |
| 6 | **Minimalist Literary** | adults (§2.3, §2.4 short prose) | **Literata** (SIL OFL 1.1) · **Inter** (SIL OFL 1.1, display/labels) | 13.5 / 18 | 19.5 / 26 | 25.5 / 34 | 1.6 / 1.3 / 1.25 → 28.79688, 33.79688, 42.50000 | `single_rule`, 0.5625 pt, `offset_mm` 14, `corner: square` | pure white `#FFFFFF`, no texture, no rule fill | `#7A2E2E` | `fluent` 0.38 / 0.90 |
| 7 | **Traditional Reader** | adults, book-length reading of a short work | **Libre Baskerville** (SIL OFL 1.1) · **Playfair Display** (SIL OFL 1.1) | 12 / 16 | 18 / 24 | 27 / 36 | 1.5 / 1.2 / 1.15 → 24.00000, 28.79688, 41.40625 | perimeter `style: none` **as the approved spec** (recorded with reason, §7.2) + `rule.head_rule` 0.5625 pt `#2B2B2B` | flat book paper `#FDFCF8` | `#7C2D2D` | `fluent` 0.38 / 0.92 |
| 8 | **Educational Booklet** | learners 9–14 and adult literacy (§2.4 mini guides, workbooks) | **Atkinson Hyperlegible** (SIL OFL 1.1, Braille Institute — designed for low-vision legibility) · **Source Sans 3** (SIL OFL 1.1) | 14.25 / 19 | 21 / 28 | 30 / 40 | 1.55 / 1.25 / 1.15 → 29.45312, 35.00000, 46.00000 | `single_rule`, 1.5 pt, `offset_mm` 9, `corner: square` + `rule.section_divider` 0.5625 pt `#1F5FA8` | pure white `#FFFFFF` (maximum contrast for photocopied handouts) | `#1F5FA8` | `developing` 0.35 / 0.82 |

Every licence above is SIL Open Font License 1.1, which permits embedding, subsetting and redistribution **provided the licence notice travels with the font** — encoded as `subset_web: true`, `embed_pdf: true`, `modification_permitted: true`, `distributable: true` in each registry entry (§6.1). A theme whose licence is not an open licence is permitted only under the `private` rule of §6.6.

### 4.2 Reader scale ladders and the readable floor, per theme

`reader_overrides.scale_steps` is per theme, because §8.3's readable minimum binds the ladder: **a step whose product falls below `minimum_readable_pt` is not offered** (§5.2). Theme 7's body is exactly at the floor, so its ladder cannot go down at all.

| Theme | `minimum_readable_pt` | declared `scale_steps` | effective ladder | effect at each step (`_px_css` / pitch px_css / mean cpl) |
|---|---|---|---|---|
| 1 Classic Children's | 14 | `[1.0, 1.15, 1.3, 1.5]` | all four (children need *bigger*, never smaller) | 20 / 30.00000 / 34.8 · 23 / 34.50000 / 30.2 · 26 / 39.00000 / 26.7 · 30 / 45.00000 / 23.2 |
| 2 Gentle Bedtime | 14 | `[1.0, 1.15, 1.3]` | all three | 20 / 32.00000 / 33.3 · 23 / 36.79688 / 29.0 · 26 / 41.59375 / 25.6 |
| 3 Biblical Heritage | 12 | `[0.85, 1.0, 1.15, 1.3]` | `[1.0, 1.15, 1.3]` — 0.85 × 13.5 = 11.475 pt < 12 pt floor, **dropped** | 18 / 27.90625 / 40.3 · 20.70312 / 32.07812 / 35.1 · 23.40625 / 36.26562 / 31.0 |
| 4 Inspirational Elegance | 12 | `[0.85, 1.0, 1.15, 1.3]` | `[1.0, 1.15, 1.3]` | 18 / 28.79688 / 38.6 · 20.70312 / 33.12500 / 33.6 · 23.40625 / 37.43750 / 29.7 |
| 5 Warm Parchment | 12 | `[0.85, 1.0, 1.15, 1.3]` | `[1.0, 1.15, 1.3]` | 18 / 27.00000 / 40.3 · 20.70312 / 31.04688 / 35.1 · 23.40625 / 35.09375 / 31.0 |
| 6 Minimalist Literary | 12 | `[0.85, 1.0, 1.15, 1.3]` | `[1.0, 1.15, 1.3]` | 18 / 28.79688 / 42.0 · 20.70312 / 33.12500 / 36.5 · 23.40625 / 37.43750 / 32.3 |
| 7 Traditional Reader | 12 | `[0.85, 1.0, 1.15, 1.3]` | `[1.0, 1.15, 1.3]` (body is *at* the floor) | 16 / 24.00000 / 46.3 · 18.40625 / 27.59375 / 40.3 · 20.79688 / 31.20312 / 35.6 |
| 8 Educational Booklet | 14 | `[1.0, 1.15, 1.3]` | all three | 19 / 29.45312 / 37.4 · 21.84375 / 33.87500 / 32.5 · 24.70312 / 38.28125 / 28.8 |

Each theme also declares a **soft** comfort band `type.measure_cpl_band` (§8.3 lists "line length" among the factors to consider, not as a floor):

| Theme | mean cpl at scale 1.0 (print measure) | declared band | note |
|---|---|---|---|
| 1 | 34.8 | 28–40 | at step 1.5 the live cpl falls to 23.2 — below the band, **reported to the author**, not blocked (the hard bound is the readable floor) |
| 2 | 33.3 | 26–38 | |
| 3 | 40.3 | 35–50 | |
| 4 | 38.6 | 36–52 | |
| 5 | **45.8 measured** (40.3 nominal) | **32–52** | reference book: comfortable for a read-aloud adult and a 6-year-old following along. **The band was re-anchored from a measurement on 2026-10-15**: the nominal `40.3` and the old upper bound `45` were both computed at the assumed `0.5 em` advance, and the real advance is `0.440 em` (≈`45.8` cpl), which the old band excluded. A comfort band derived from an assumption is not a comfort band. |
| 6 | 42.0 | 40–58 | |
| 7 | 46.3 | 42–60 | |
| 8 | 37.4 | 34–46 | |

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_MEASURE_OUT_OF_BAND` | info | the *measured* mean line length leaves `type.measure_cpl_band` (measured cpl from `(c)`, never estimated from character counts — §6.7 "Do not use raw word count as the sole indicator") |

> **The `mean cpl` column above is a *nominal* figure, not a measurement.** It is computed at the `0.5 em` mean-advance assumption of §1.7 — the assumption that was the root cause of the wrong `words_per_line_measured` constant elsewhere in the set. At the measured `0.440 em` advance of the reference theme's own body face, the same column is ≈ `13.6 %` higher (theme 5's nominal `40.3` → ≈ `45.8`, which would sit *outside* its declared `28–45` band). The bands are therefore **advisory** and must be re-set against the *measured* cpl before they can bind; the classifier itself already reads `(c)`'s measured value, so no plan depends on the nominal number. Reported for the author/`11` to ratify (§10).

### 4.3 Density band: how the theme's band and the audience's band resolve

`layout.density_tolerance` carries `sparse_below` / `dense_above` (`04` §6.1); it is the **declared** token and only an *input* to the resolution below — it is **not** what the density classifier reads. The classifier consumes the **resolved** band (`04` §6.1 `resolved_density_band`; `05` §2.4, `07` §4.3 cost terms), never the declared `layout.density_tolerance` and never the §6.7 default. Three sources can supply a band: the theme (§4.1), the publication profile (`04` §3.1 `reading_proficiency`, `age_range`; D-15 profiles are data), and the §6.7 defaults (`05` §2.4: 0.35 / 0.88).

**Resolution rule — the narrower band wins, and the narrower band is reported:**

```
effective.sparse_below = max(theme.sparse_below, profile.sparse_below, 0.35)
effective.dense_above  = min(theme.dense_above,  profile.dense_above,  0.88)
```

Worked on the reference book: theme `warm_parchment` 0.33 / 0.80, profile `childrens` × ages 6–10 (`early`) 0.33 / 0.78, defaults 0.35 / 0.88 ⇒ **effective 0.35 / 0.78**. The `0.35` agrees with `04` §6.1's example and `05` §2.4's initial value, so the reference theme's declared pair differs from the `04` example only in the ceiling, which is the intent.

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_DENSITY_BAND_INVERTED` | critical | `sparse_below ≥ dense_above` after resolution |
| `DESIGN_DENSITY_BAND_WIDENED` | info | a theme declares a band wider than the profile's; the band is narrowed and the theme is reported as advisory |

### 4.4 Reader colour variants are colour-only projections

§7.3 permits "Theme selection where allowed" and `04` §6.1 fixes the shape: `reader_overrides.theme: ["light","sepia","dark"]`. A reader variant is a **colour-only projection** of the same token set. If a variant changed a metric, the reader's reflow would differ from the plan for a reason the author never approved, which would break D-06's disclosure.

```
∀ variant v ∈ reader_overrides.theme:
   tokens_without_colour(compile(v)) ≡ tokens_without_colour(compile(light))   // byte-for-byte
```

Illustration (`warm_parchment`):

| Path | `light` | `sepia` | `dark` |
|---|---|---|---|
| `colour.ink.body` | `#3A2E1F` | `#33281B` | `#E8E1D4` |
| `page.background.colour` | `#F6EDDA` | `#F0E3C8` | `#171512` |
| `colour.rule` | `#8a6f47` | `#8a6f47` | `#8a7a5c` |
| `colour.accent` | `#9C5A2E` | `#9C5A2E` | `#C08A55` |
| contrast ratio body-on-background | ≥ 7:1 | ≥ 7:1 | ≥ 7:1 |

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_READER_THEME_METRIC_DRIFT` | critical | a reader colour variant differs from `light` in any non-colour property |
| `DESIGN_CONTRAST_BELOW_MINIMUM` | major | `colour.ink.*` on its background falls below `colour.min_contrast_ratio` (default 7:1 for body — §8.3 "contrast"; §10.3 "Readable typography") |

---

## 5. Typography rules the layout engine depends on (§8.3)

### 5.1 Font metrics, and why leading is an integer count of 1/64 px

Metrics come from the font file, through the pinned Chromium's layout, into `(c)` and then into `(d)`:

| Metric | Source | Used for |
|---|---|---|
| `units_per_em` | `head.unitsPerEm` | scaling every other metric (typically 1000 for CFF, 2048 for TrueType) |
| `ascent_em`, `descent_em` | the metric table recorded in `metrics_source` (`hhea` \| `os2_typo` \| `os2_win`) | the content area, and therefore where the baseline sits |
| `line_gap_em` | same table's `lineGap` | the *default* leading a browser adds; **never used as a token** (§5.1 rule below) |
| `cap_height_em`, `x_height_em` | `OS/2.sCapHeight`, `OS/2.sxHeight` | drop caps and display alignment |
| `metrics_hash` | `sha256` over the file and the chosen table | D-09, D-14 reproducibility |

```
content_area_px_css        = (ascent_em + descent_em) × size_px_css
line_pitch_px_css          = line_height × size_px_css
half_leading_px_css        = (line_pitch_px_css − content_area_px_css) / 2
first_baseline_offset_px_css
                           = ascent_em × size_px_css + half_leading_px_css
```

Worked example — **metric values are illustrative; the registry's `metrics_hash` is the source of truth (D-04, D-09), and nothing in the code hard-codes a font's tables**: `ascent_em = 1.006`, `descent_em = 0.256`, `line_gap_em = 0`, `size_px_css = 18`, `line_height = 1.5`:

```
content_area = (1.006 + 0.256) × 18 = 22.716 px_css
line_pitch   = 1.5 × 18             = 27.000 px_css  → 1728/64
half_leading = (27.000 − 22.716)/2  =  2.142 px_css
first_baseline_offset               = 1.006 × 18 + 2.142 = 20.250 px_css → 1296/64 exactly
```

**Rule T-1:** `line_height` is an authored unitless multiplier or an explicit length; it is **never** `normal`. `line-height: normal` is a function of the font file, which would make the design's leading a property of the font rather than of the token set — so a family substitution would silently re-paginate the book. A `line_height` of `normal` (or an absent value resolved by the browser) is `DESIGN_LINE_HEIGHT_IMPLICIT` (critical).

**Rule T-2 (why 1/64 px, and why it must be a whole number of them).** `07-lock-and-constraint-rules.md` §4.5 already requires it — "All measurement values are quantised to 1/64 px integers before entering the solver" — and §4.1 explains the mechanism: a block's occupancy on a page is "the integer count of line boxes placed there (fractional leading is accumulated in 1/64-px integers and consumed when it crosses a line, which is exactly how a text engine behaves)". Four consequences make the rule non-negotiable:

| # | Reason | Failure if violated |
|---|---|---|
| 1 | **Representability.** Chromium's `LayoutUnit` *is* 1/64 px, so a whole-1/64 pitch is exactly the value the renderer used. A pitch that is not expressible in 1/64 was rounded by the renderer, and the solver would be reasoning about a value that does not exist. | solver and renderer disagree on the last line of a page |
| 2 | **Integer capacity.** `C_p = floor(available_height / line_pitch)` (`07` §4.1) must be an exact integer division. With a non-integral pitch the `floor` result depends on the order of accumulation of the fractional parts. | two runs produce two plans |
| 3 | **Order independence.** The DP of `07` §4.2 accumulates fractional leading across a page. Integer 1/64 arithmetic is associative; floating-point leading is not. | tie-break rule (`07` §4.2) cannot be satisfied |
| 4 | **Golden hashes.** D-14/R1 (`13` §8) demand that the same triple + viewport + engine + Chromium build hash to the identical plan; a non-exact quantum makes that a coincidence rather than a property. | the canary test is unreliable, so drift is discovered in print |

`CompiledTokens.px64` therefore stores the pitch as an integer count (`27 px_css → 1728`), and the solver never sees a float. One function (`quantise64`) and one rounding rule exist in the codebase.

### 5.2 The readable minimum, at print and at every reader scale step

`typography.minimum_readable_pt` (`04` §6.1) implements §8.3's "Preserve readable minimum sizes". It is a **hard** floor and applies in three places:

| Place | Rule | Finding |
|---|---|---|
| Print, body and every prose role | `type.<role>.size_pt ≥ minimum_readable_pt` for `role ∈ {body, heading, display, scripture, quotation}` | `DESIGN_BODY_BELOW_MINIMUM` (critical) |
| Print, furniture | `type.page_number.size_pt`, `type.caption.size_pt` ≥ `type.furniture_min_pt` (default 8 pt) **and** a furniture token may never carry prose (`role: furniture`) | `DESIGN_FURNITURE_BELOW_MINIMUM`, `DESIGN_PROSE_IN_FURNITURE_ROLE` (major) |
| Digital, at **every** scale step *s* | `size_px_css × s ≥ minimum_readable_pt × 4/3` (R1) | `DESIGN_SCALE_STEP_BELOW_MINIMUM` (critical) |
| Digital, measured | the *measured* glyph size in the reader at the smallest live page box equals the compiled size (no reader may shrink type to fit a box) | `DESIGN_READER_TYPE_SHRUNK` (critical) |

The floor is why the effective ladders in §4.2 differ from the declared ones, and why `scale_steps` is per theme rather than a global constant. It is also why a theme cannot simply expose a "fit more on the page" step: shrinking type is not a layout option.

### 5.3 Orphan and widow minimums

| Token | `04` §6.1 | Floor | Solver weight | Notes |
|---|---|---|---|---|
| `type.orphans` | 2 | **2** (hard schema floor — 1 defeats the purpose) | `orphan_penalty` 200 | a page may not *end* with fewer than this many lines of a block |
| `type.widows` | 2 | **2** | `widow_penalty` 200 | a page may not *begin* with fewer than this many lines of a continued block |

| Rules | Detail |
|---|---|
| Both are **penalties**, not locks | `07` §4.3: an essential break (3000) and a `keep_together` group (800) and a `beat_split` (500) all outweigh an orphan/widow violation (200), while `page_count_penalty` (5) does not. A plan may therefore violate one — and when it does, the violation is attached to the page (`05` §2.6), never silently accepted. |
| Emerging-reader themes raise the floor | themes 1, 2 and 8 declare `orphans: 3, widows: 3`: for a reader who needs a finger to track the line, two orphaned lines read as a broken page |
| Counted in **measured line boxes** | the count comes from `(c)`, so hyphenation, a `keep_together_lock` or a drop cap changes it (§5.4) |
| A floor below 2 is rejected at `dsg_rev` creation | `DESIGN_ORPHAN_WIDOW_BELOW_FLOOR` (major) |

### 5.4 Hyphenation and language

`lang` and `hyphenation` live in the design revision and are therefore part of the pagination input — `04` §3.1 records `language` as "**part of the design revision and therefore of the pagination input** (D-04, Part C)", and `17` Part C lists the reason: "Language affects hyphenation, which changes line breaks, which changes page fit".

| Rule | Behaviour | Finding |
|---|---|---|
| Per-role flag | `type.<role>.hyphenate` (`04` §6.1: `body.hyphenate: true`). Body and scripture may hyphenate; **heading and display never** (a hyphen in a 42 px_css title is a visible defect) | `DESIGN_HYPHENATION_IN_DISPLAY` (major) |
| Dictionary required | `hyphens: auto` only hyphenates where Chromium has a dictionary for `lang`. No dictionary ⇒ no hyphenation, and the line breaks differ from the plan | `DESIGN_HYPHENATION_DICTIONARY_MISSING` (major) — never substituted with a different language's dictionary |
| Print always may hyphenate justified text | justified text without hyphenation produces rivers and fails §15.4's "Readable typography" | `DESIGN_JUSTIFICATION_WITHOUT_HYPHENATION` (major) |
| `lang` is a pagination input | a change to `lang` or `hyphenation` is a **metric** change (§8.2), so it re-measures every block | — |
| Scripture blocks | a scripture block's `lang` may differ from the book's (a quoted translation); the per-block `lang` is part of the block's measurement key | `DESIGN_BLOCK_LANG_MISSING` (info) |
| Unbreakable tokens | a word wider than the measure cannot overflow silently. Digital: the reader may insert a break (`overflow-wrap`) and reports it. Print: the page refuses | `PRINT_UNBREAKABLE_OVERFLOW` (critical, §10.4 "No text overflow"), `DIG_UNBREAKABLE_WRAP_APPLIED` (info) |

### 5.5 What the reader may override, and what it may never override

`04` §6.1 `reader_overrides` is the **whole** of the reader's authority — `{font_scale, theme[], line_height}`. §7.3's reader controls list ("Font size adjustment", "Theme selection where allowed") are implemented as exactly this, and nothing else.

| §7.3 control | May the reader change it? | Bounds | Why |
|---|---|---|---|
| Previous/next page, jump to start/end, TOC, progress, resume, fullscreen, page numbering display | yes — navigation, not typography | — | §7.3, §7.1 |
| **Font size adjustment** | **yes** | only the theme's effective ladder (§4.2), floored at `minimum_readable_pt`; the reader reflows locally and may add pages inside a planned boundary (§7.4 "reflow it rather than clipping it") | §7.3, §8.3, §10.3 "Proper behavior with font scaling" |
| **Theme selection** | **yes**, from `reader_overrides.theme[]` | colour-only, metric-identical (§4.4) | §7.3 "where allowed" |
| Reduced motion | yes | must disable animation without disabling navigation | §7.2, §10.3 |
| Single/two-page mode | yes | per §7.1's readability threshold; never a spread that compromises readability | §7.1 |
| Font **family**, `line_height`, `letter_spacing`, `orphans`, `widows`, justification, hyphenation, `lang` | **no** | `reader_overrides.line_height: false` (`04` §6.1) is the explicit statement of this rule | changing any of them re-measures the book, so the reader would be *re-planning* rather than reflowing (`03` §10) |
| **Page boundaries** (the planned breaks), borders/frame geometry, page proportion, background outside the colour variants | **no** | it may reflow *between* planned boundaries only | `03` §10 "the reader reflows *between* the planned page boundaries, it does not re-plan the book" |
| Anything that would change the approved composition for other readers | **no** | the reader's overrides are local to its session and are never written back | §6.10, §11.3 "must not silently change locked or approved material" |

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_READER_OVERRIDE_UNAUTHORISED` | critical | the reader runtime applies a change outside `reader_overrides` |
| `DIG_READER_REPLANNED` | critical | a reader page boundary does not correspond to a planned boundary, except as a permitted local overflow (§7.4) |
| `DIG_SCALE_LADDER_TRUNCATED` | info | the reader requests a step the ladder does not offer (§4.2) |

### 5.6 The scaling model

| Level | What scales | When | Determinism |
|---|---|---|---|
| **L0 compiled** | every identity token, at the reference page box | at compile time, per `dsg_rev` | golden-hashed (D-14) |
| **L1 page fit** | page box, frame inset, padding, measure — by R4 ratio projection against the live box | per viewport, per render | deterministic per `(dsg_rev, paper, viewport, chromiumBuild)` |
| **L2 reader font step** | `type.*.size_px_css` and (through `em` tokens) `space.*` | on the reader's request, from the theme's effective ladder | deterministic per `(dsg_rev, scaleStep)` |
| **L3 reader reflow** | page boundaries inside a planned boundary only | when L2 or L1 makes a planned page's content not fit | deterministic; disclosed (§6.10 "The interface must disclose when a requested composition cannot be reproduced exactly") |

Only L0 is identity. L1–L3 are composition, and every one of them is disclosed by D-06's two-page-count rule rather than hidden. **Type size is never derived from L1:** if type scaled with the page box, a phone would render 6 pt text and the readable minimum would be unfalsifiable.

---

## 6. Font licensing and delivery (D-09)

**`app/assets/fonts` is the single source of the shipped face, for the bridge and the emitter alike.** The measurement bridge (§6.1a; `08` §2) and the emitter (the HTML book and the two PDFs) must read the **same** font directory. A font file that is not under `app/assets/fonts` is not the face the product renders, so a line count measured with anything else is a line count of a different book — which is exactly the failure that made `words_per_line_measured` wrong a third time (`05` §1.6 item 6). For the reference theme `warm_parchment` that directory carries **Lora** (body and heading) and **Cinzel** (display, inscriptional capitals only), both SIL Open Font License 1.1, embedded as base64 `woff2` subsets in the exported HTML book (§6.2, §6.6). Every advance, cpl, line count and `words_per_line_measured` figure is a property of those files and of no other face.

### 6.1 Registry entry shape (`fonts/registry.json`, `04` §8)

D-09 fixes the core fields — "family, files, `license`, `embed_pdf` (bool), `subset_web` (bool), `language_coverage`, `metrics_hash`" — and adds the two rules: a font with `embed_pdf: false` cannot be selected for a print design; a font without a licence entry cannot be selected at all. This document extends the entry with the fields that make those rules checkable rather than declarative.

```jsonc
{
  "family": "Lora",
  "registry_key": "lora",
  "designer": "Cyreal",
  "license": {
    "kind": "spdx",                    // spdx | public_domain | proprietary | unknown
    "spdx": "OFL-1.1",
    "name": "SIL Open Font License 1.1",
    "url": "https://scripts.sil.org/OFL",
    "source": "fonts.google.com/specimen/Lora",
    "notice_required": true,           // OFL §1 requires the notice to travel with the font
    "modification_permitted": true,    // OFL §2 permits modification — subsetting IS modification
    "redistribution_permitted": true
  },
  "files": [
    { "style": "regular", "weight": 400, "format": "woff2", "path": "fonts/lora/lora-400.woff2",
      "sha256": "…", "bytes": 0, "subset": false },
    { "style": "regular", "weight": 400, "format": "ttf",   "path": "fonts/lora/lora-400.ttf",
      "sha256": "…", "bytes": 0, "subset": false }
  ],
  "embed_pdf": true,                  // D-09: false ⇒ not selectable for a print design
  "subset_web": true,                 // requires license.modification_permitted
  "distributable": true,              // may travel inside an exported HTML book (§6.6)
  "language_coverage": ["en", "en-us", "fr", "de"],
  "metric_compatible_with": null,     // §6.5 — a metric-compatible substitute, if one exists
  "metrics_source": "hhea",           // §5.1 — which table defines ascent/descent/lineGap
  "units_per_em": 1000,
  "metrics_hash": "sha256:…",         // D-09; drives DESIGN_FONT_METRICS_DRIFT
  "role_permitted": ["body", "heading", "display", "caption", "page_number"]
}
```

| Field | Enforced by | Consequence of absence |
|---|---|---|
| `license.kind` | `DESIGN_FONT_UNLICENSED` (critical, `04` §10) | the family is not selectable at all |
| `license.notice_required` | the export manifest must contain the notice | `OPS_LICENSE_MISSING` (`04` §8) |
| `license.modification_permitted` | subsetting is refused when false | `DESIGN_FONT_SUBSET_NOT_PERMITTED` |
| `embed_pdf` | `PRINT_FONT_NOT_EMBEDDABLE` (critical) | a print design cannot select it |
| `distributable` | `DESIGN_FONT_NOT_DISTRIBUTABLE` (critical) | an HTML export cannot inline it |
| `metrics_source` + `units_per_em` + `metrics_hash` | `DESIGN_FONT_METRICS_DRIFT` (critical) | measurement cannot be reproduced (D-14) |
| `language_coverage` | `DESIGN_FONT_LANG_UNCOVERED` (major) | a missing glyph is found at render time instead of design time (§10.4 "No missing glyphs") |

### 6.1a The shipped face must be asserted, not assumed

This is the rule that the third wrong value of `words_per_line_measured` earned, and it is binding on the measurement bridge (`08` §2.6 states the mechanism):

1. **A measurement must assert the face it rendered in.** Compare the width of a probe string set in the working face against the same string set in a family that **cannot exist**; if the two widths are equal, Chromium substituted and the measurement is discarded. Do not trust `document.fonts.check()` — it reports an **unavailable family as available**. Do not trust `document.fonts.load()` with a whole quoted stack (`"Lora, 'Iowan Old Style', Georgia, serif"`) — it matches no face, resolves immediately and loads nothing; the first family of the stack must be named explicitly.

2. **The bridge and the emitter read the same font directory.** `app/assets/fonts` is that directory. Fonts resolved from a system path, a package manager or a network fetch are not the shipped face, so line breaks measured with them cannot match the lines the book ships (§6.2, §6.6).

3. **The figure is then a property of that directory.** `words_per_line_measured`, and every advance and cpl figure, is measured on the files under `app/assets/fonts` and on no other face. `T-WIZ-017` pins the probe hash; the rendered-face assertion is what makes the hash mean the right thing.

### 6.2 Embedding requirements per output

| Output | Requirement | Mechanism | Finding |
|---|---|---|---|
| **HTML storybook** (`html_storybook`, D-19 standalone, §15.3 "Works in modern desktop and mobile browsers") | every family must be **inlined** as a `woff2` subset; **no network font fetch is permitted** — the artifact must work from `file://` with no network | `@font-face` with an inline or sibling-file `woff2`; `font-display: block` (a swap would change metrics mid-read) | `OPS_NETWORK_FONT_REFERENCE` (critical), `DESIGN_FONT_NOT_DISTRIBUTABLE` |
| **Reading PDF** (`reading_pdf`, §9.1) | every family used on a page must be **embedded and subset** in the PDF, with the licence notice in the manifest | Chromium's PDF writer; the print renderer asserts embedding before declaring the PDF valid (D-09 consequence, `13` §3.6 test) | `PRINT_FONT_NOT_EMBEDDABLE` (critical) |
| **Booklet PDF** (`booklet_pdf`, §9.4) | same as reading PDF, plus `PRINT_IMPOSITION_SPEC_MISMATCH` gating (`10-`) | imposition reorders pages; fonts are already embedded per page | as above |
| **`page_png` / `proof_sheet`** (visual proof) | rasterised, so no embedding; but the *rasteriser* must have the same font files | manifest carries `fonts_hash` | `DESIGN_FONT_METRICS_DRIFT` |
| **Reader at runtime** | the reader may not fetch a font, and may not substitute a family for a missing glyph without reporting | §6.5 fallback chain | `DIG_FONT_FALLBACK_APPLIED` |

**The invariant that ties embedding to approval:** every artifact manifest records `fonts_hash` (`04` §7.3 `Approval.environment.fonts_hash`). An artifact whose embedded font files do not hash to the approved value is `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (critical) territory, not a cosmetic difference — the same text with a different font has a different page count.

### 6.3 What is refused when licence metadata is missing

Refusal, never a warning — D-09: "a font without a licence entry cannot be selected at all", and D-08's posture for the parallel case of scripture is explicitly "the import is **refused**, not warned about".

| Condition | Finding | Severity | Blocking |
|---|---|---|---|
| family used by a token but absent from the registry | `DESIGN_FONT_UNREGISTERED` | critical | yes |
| entry present, `license` absent or `kind: unknown` | `DESIGN_FONT_UNLICENSED` | critical (`04` §10) | yes, for print |
| `embed_pdf: false` and the design is print-bound | `PRINT_FONT_NOT_EMBEDDABLE` | critical | yes (`13` §3.6) |
| `license.modification_permitted: false` and a web subset is required | `DESIGN_FONT_SUBSET_NOT_PERMITTED` | major | yes for HTML export |
| `distributable: false` and the output is `html_storybook` | `DESIGN_FONT_NOT_DISTRIBUTABLE` | critical | yes |
| file listed but missing, or `sha256` mismatch | `DESIGN_FONT_FILE_MISSING` | critical | yes |
| `metrics_hash` differs from the recorded value | `DESIGN_FONT_METRICS_DRIFT` | critical | yes (D-14) |
| `notice_required` and the notice is absent from the export manifest | `OPS_LICENSE_MISSING` | major | yes for export |

### 6.4 Subsetting policy, and what it does to file size

| Policy | Value | Reason |
|---|---|---|
| **Format** | `woff2` for HTML (Brotli-compressed, universally supported by §15.3's "modern desktop and mobile browsers"); the original `ttf`/`otf` for PDF embedding | one source of truth per format |
| **Glyph set** | the union of (i) a declared **typographic base set** — ASCII printable, the C1 punctuation the product uses, the typographic marks the themes use (`“ ” ‘ ’ – — … · † ‡ § ¶`), digits and the numbering separator — and (ii) **every character actually present** in the `ms_rev` being exported | (i) makes the common case byte-stable across projects; (ii) guarantees no missing glyphs |
| **Styles subset** | one file per (family, weight, style, `unicode-range` script group) actually used | a theme that uses regular + bold does not ship italic |
| **`unicode-range`** | declared per script group in the reader stylesheet | lets a browser skip a script it does not need |
| **Determinism** | subsetting is a pure function of `(font sha256, glyph policy, ms_rev glyph set, subsetter version)`; the result's `sha256` and `bytes` go into the manifest (`04` §7.4) | D-14: "approved publications are reproducible" |
| **Consequence for approval** | a subset that depends on the manuscript's character set changes `fonts_hash` when the text changes. That is **not** an extra invalidation: any new `ms_rev` already invalidates the manuscript and preview scopes (`05` §2.7). What it does require is that `fonts_hash` be computed over the *embedded* files, not the source files, or reproducibility is lost | D-14, `04` §7.3 |
| **No size claim is made here** | the manifest's `bytes` field is the fact, per artifact, per revision | `04` §7.4; a number invented in a specification document would be stale the day it was written |

The mechanism, stated without a fabricated measurement: a full Latin family in 4 styles is hundreds of KB per style; a subset covering a declared base set plus a short story's actual characters in the 2–3 styles a theme uses is a small fraction of one style's full file — the exact ratio is recorded per artifact, and `T-OPS-*` asserts that the reader artifact's total payload fits the project's declared offline budget.

### 6.5 Fallback chain, and the metric rule

A family may be declared absent for a project (a font not installed on the build host, a licence not obtained, a stripped-down build). The chain is **declared in the token**, never resolved by the browser's default stack alone:

```
type.<role>.family            primary registry key
type.<role>.fallback[]        ordered registry keys, each optionally metric_compatible_with the primary
type.<role>.system_fallback   a named stack from a closed set ("serif_book", "sans_legible", "serif_transitional")
```

**The metric rule (this is the whole of §6.5):**

| Case | Behaviour | Finding |
|---|---|---|
| `metrics_hash(fallback) == metrics_hash(primary)`, or `fallback.metric_compatible_with == primary` | permitted; **the line breaks are unchanged**, so the plan stands and no re-measure is needed | none (an `info` record in the manifest, so a reviewer can see the substitution) |
| metrics differ, **digital** scope | the substitution is allowed to render, is recorded, and the page count is re-derived and re-reported (D-06) — the reader reflows and discloses | `DIG_FONT_FALLBACK_METRIC_DRIFT` (major, non-blocking) |
| metrics differ, **print** scope | the render is **refused**. Not reflowed, not approximated — the same posture D-05 takes for a frozen page that will not hold its content | `PRINT_FONT_FALLBACK_METRIC_DRIFT` (critical, blocking) |
| no fallback available and no glyph coverage | the reader renders with the system stack and shows an explicit banner; the print path refuses | `DESIGN_FONT_LANG_UNCOVERED` (major), print: `PRINT_MISSING_GLYPH` (critical, §10.4 "No missing glyphs") |

**Why metric-compatible substitutions are the only silent ones.** Substituting a font with different ascent, descent, x-height or advance widths changes every line break in the book; `Gelasio` for `Georgia`, `Liberation Serif` for `Times New Roman` and `Carlito` for `Calibri` are the classic metric-compatible pairs, and each is recorded in the registry as `metric_compatible_with` — a *declared* compatibility, verified once by comparing `metrics_hash` and a fixture paragraph's line breaks, never assumed from the name.

`D-09`'s rule is therefore restated in this document's terms:

> A fallback that changes metrics is a **validation finding** — and in the print scope a refusal — **never a silent substitution**.

### 6.6 Q-02, and the private-font rule

Q-02 ("Is Storybook Studio a product you ship or sell, or a personal studio tool?") is unresolved, with the recommended default "personal studio tool for V1; keep the codebase publishable (no secrets, licence-clean assets) so the decision stays open". It changes the licensing strategy in exactly one way, and this document states it rather than leaving it implicit:

| Q-02 outcome | Consequence for tokens |
|---|---|
| **Studio tool, personal** (recommended default) | a *bundled* theme must still use open-licence families, because the HTML book is distributed to readers (§1.2 "distributable"); a font the author holds only a *desktop* licence for may be used in a **private** design revision whose exports are not distributed |
| **Shipped product** | every bundled theme's every font must satisfy `license.kind ∈ {spdx, public_domain}`, `distributable: true`, `redistribution_permitted: true`. A `private` design revision is permitted, but its artifacts are marked `distribution_scope: personal_only` and are refused for any export that inlines a non-distributable font |

| Finding | Severity | Fires when |
|---|---|---|
| `DESIGN_FONT_PRIVATE_ON_DISTRIBUTED_EXPORT` | critical | a design revision flagged private (or referencing a non-distributable font) is exported as a distributable artifact |
| `OPS_BUNDLED_THEME_LICENCE_UNPUBLISHABLE` | major | a bundled theme references a font that would prevent the codebase being published (Q-02's stated constraint) |

---

## 7. Borders and page decoration as tokens

### 7.1 The perimeter frame is one token group

§9.2 lists seven obligations for borders and §8.1 lists three categories ("border styles", "border thickness", "border offsets"). They are one group:

```jsonc
"layout": {
  "border": {
    "style":             "double_rule",   // none | single_rule | double_rule | ribbon
    "thickness_pt":      0.75,            // OUTER rule (04 §6.1)
    "thickness_px_css":  1,               // R1 pair
    "thickness_inner_pt": 0.75,           // double_rule only; absent for single
    "gap_mm":            1.5,             // between outer and inner rule (double_rule only)
    "offset_mm":         8,               // trim edge → OUTER edge of the outer rule (04 §6.1)
    "colour":            "#8a6f47",       // (04 §6.1)
    "corner":            "square",        // square | mitered | ornament
    "corner_ornament":   null,            // rule.ornament.<key> when corner = ornament
    "text_gap_min_mm":   3,               // frame → nearest text edge, minimum
    "min_visible_mm":    0.18             // print visibility floor (§2.4)
  }
}
```

| §9.2 obligation | How the token set discharges it |
|---|---|
| "Use consistent geometry" | one `layout.border` per `dsg_rev`; every template resolves its frame from it (§7.2) |
| "Have identical thickness within a selected style" | `thickness_pt` is a single value (plus `thickness_inner_pt` for the one style that has two rules, whose *ratio* is fixed by the token: inner = outer unless stated) |
| "Remain inside the required print-safe area" | constraint C1 below, `PRINT_BORDER_OUTSIDE_SAFE_AREA` |
| "Align consistently across pages" | the frame is measured from the **trim edge** and is therefore identical on both pages of a spread, while the *text box* moves for binding (§7.4) — see the note below |
| "Avoid text and footer collisions" | constraint C2 below, `PRINT_BORDER_TEXT_COLLISION` |
| "Respect binding requirements" | the text box — not the frame — carries the `(gutter_mm + binding_allowance_mm)/2 = 3.50 mm` shift toward the outer edge (measure unchanged) |
| "Remain visible after printing, cutting, or folding" | `min_visible_mm` floor + `print_safe` metadata (§2.4), `PRINT_BORDER_BELOW_VISIBLE_MINIMUM` |

**The asymmetry is the design, and it is the only reading that satisfies both clauses.** §9.2 demands the frame "align consistently across pages" *and* "respect binding requirements". A frame that moved with the binding allowance would be visibly off-centre relative to the page when a spread is opened; a text box that did not move would crowd the spine. So: **the frame is symmetric about the trim (measured from the trim edge); the text box is offset toward the outer edge.**

### 7.2 Why the frame is token-driven, so template variety cannot break consistency

§6.8's closing line and §9.2's second-to-last line are the same requirement: "Layouts must inherit global design tokens so page borders and essential typography remain consistent" / "Page templates may vary internally, but the perimeter frame must remain visually consistent". `04` §6.2 makes it structural:

| Mechanism | Detail |
|---|---|
| Templates have **no geometry fields** | `PageTemplate` is `{id, name, kind_compatibility[], regions[]}` with `regions[] = {slot, blocks_allowed[], vertical_align, max_lines, typography_role, border_slot}`. There is nowhere to put a thickness, an offset or a colour. |
| Every template declares `border_slot: "perimeter"` | the `04` §6.2 invariant, tested in Phase 5 (`13` §3.5: "every template declares `border_slot: \"perimeter\"` unless an explicit cover exception — so variety cannot break §9.2 consistency"). |
| A template exception must be explicit and recorded | §9.2: "Cover-specific exceptions, if ever supported, require explicit author selection." Encoded as `cover_exception: {reason, approved_by, at}` on the template; absent it, any other `border_slot` value is `DESIGN_TEMPLATE_BORDER_DRIFT` (critical). |
| `style: none` is a *spec*, not an omission | Theme 7 (Traditional Reader) uses it. It is a legal approved border specification provided it is (i) declared, (ii) carries a `reason`, and (iii) is applied to **every** page, so §9.2's consistency still holds. A single page with `none` in a theme with a rule is `DESIGN_TEMPLATE_BORDER_DRIFT`. |
| Cross-template verification | the proof-sheet validator renders every one of the ten §6.8 presets with one `dsg_rev` and compares the rasterised frame geometry page-to-page within `layout.border.geometry_tolerance_px = 1` (`13` §3.6 test: "border geometry identical across pages within one style") |

### 7.3 Corner, ornament and interior decoration tokens

§8.1 lists "decorative accents" and "section dividers" alongside borders; §6.8 mentions "decorative framing" for the title page and "a consistent border where required" for the blank page.

| Token | Purpose | Constraint |
|---|---|---|
| `layout.border.corner` | `square` (mitered join), `mitered` (long-over-short corners for a ruled frame), `ornament` (frame interrupted by a corner device) | — |
| `layout.border.corner_ornament` | a key into `rule.ornament.*` | must be **vector or glyph-based**, never an image: V1 is text-only and §8.2 requires all themes to work without illustrations. Artwork is V2 (§13 V2) and must not be required by a V1 theme — `13` §8 risk R5 keeps illustration out of V1 entirely |
| `rule.ornament.<key>` | `size_px_css` / `size_pt` (R1 pair), `colour`, `anchor` (`corner_tl` \| `corner_tr` \| `corner_bl` \| `corner_br` \| `head_center` \| `foot_center`), `space_before_em`, `space_after_em` | the ornament's space reservation is **geometry-affecting**, so it enters the measurement container (this is `05` §2.4's `visual_factor`: "decorative elements inside the text box") |
| `rule.section_divider.*` | `thickness_pt`, `thickness_px_css`, `width_pct`, `colour`, `space_before_em`, `space_after_em` | same reservation rule |
| `rule.head_rule.*` | the non-perimeter rule some themes use (theme 7) | must be inside the safe area, same constraints as the frame |
| `rule.drop_cap.*` | `lines` (3–5), `size_pt`/`size_px_css` (derived from `lines × line_pitch`, so it is an A1 derived token), `family`, `colour` | a drop cap changes the first line's available width, so it **must** be modelled in the measurement container or the first page of every chapter is measured wrong: `DESIGN_DROP_CAP_NOT_MEASURED` (critical) |
| `page.numbering.*` | `enabled`, `position`, `size_pt`/`size_px_css`, `colour`, `format`, `skip_kinds[]` | a footer is furniture: `type.page_number` role, not a prose role (§5.2); §9.2 "Avoid text and footer collisions" |

### 7.4 The print-safe-area relationship, in millimetres

Every value below is a physical quantity (§1.6). The arithmetic is stated once, asserted by validators, and never performed by a consumer.

| Quantity | Token | Value (reference theme, half-letter) | In `_px_css` (ref box) |
|---|---|---|---|
| trim | `layout.paper` | 139.7 × 215.9 | 528 × 816 (exact) |
| print-safe area | `layout.safe_area_mm` | 6 | 22.67188 (1451/64) |
| gutter | `layout.gutter_mm` | 4 | 15.12500 (968/64) |
| binding allowance | `layout.binding_allowance_mm` | 3 | 11.34375 (726/64) |
| text box | `layout.text_box_mm` | 96 × 148 | 362.82812 (23221/64) × 559.37500 (35800/64) |
| frame offset | `layout.border.offset_mm` | 8 | 30.23438 (1935/64) |
| frame thickness | `layout.border.thickness_pt` | 0.75 pt = 0.26458 | 1.00000 (64/64) |

Derived placements:

```
side margin (symmetric box)  = (139.7 − 96) / 2         = 21.85 mm
text-box shift toward outer  = (gutter 4 + binding 3)/2 =  3.50 mm
outer text edge              = 21.85 − 3.50            = 18.35 mm
spine text edge              = 21.85 + 3.50            = 25.35 mm
frame band (double_rule)     =  8.000 … 10.0292 mm     (offset 8 + outer 0.75 pt (0.2646) + gap 1.5 + inner 0.75 pt (0.2646);
                                                       the reference theme's style is double_rule, §4.1 / 04 §6.1)
gap, frame → nearest text    = 18.35 − 10.0292         =  8.32 mm   ✓   (≥ border.text_gap_min_mm 3, C2, with 5.32 mm to spare)
C4 floor (spine-side inset)  = 6 + 4 + 3               = 13.00 mm    — a FLOOR on the spine-side inset, never a
                                                                       position: the spine text edge is 25.35 mm,
                                                                       and C4 holds (13.00 ≤ 25.35) ✓
```

**Constraints, each a validator:**

| # | Constraint | Why | Finding |
|---|---|---|---|
| C1 | `border.offset_mm ≥ layout.safe_area_mm` | §9.2 "Remain inside the required print-safe area": anything outside survives trimming only by luck | `PRINT_BORDER_OUTSIDE_SAFE_AREA` (critical) |
| C2 | `border.offset_mm + t_outer_mm + (t_inner_mm + border.gap_mm if border.style = double_rule) ≤ min_side_text_margin_mm − border.text_gap_min_mm`, with `t_outer_mm = border.thickness_pt × 25.4/72` and `t_inner_mm = border.thickness_inner_pt × 25.4/72` — every field is `04` §6.1's, which now carries `thickness_pt`, `thickness_inner_pt`, `gap_mm` and `text_gap_min_mm`; reference theme `10.0292 + 3 = 13.0292 ≤ min(18.35, 25.35) = 18.35` ✓ | §9.2 "Avoid text and footer collisions"; `04` §6.1 | `PRINT_BORDER_TEXT_COLLISION` (critical) |
| C3 | `border.thickness_pt × 25.4/72 ≥ border.min_visible_mm` | §9.2 "Remain visible after printing, cutting, or folding" | `PRINT_BORDER_BELOW_VISIBLE_MINIMUM` (critical, and `print_safe: false` in metadata) |
| C4 | `layout.safe_area_mm + layout.gutter_mm + layout.binding_allowance_mm ≤ spine_side_inset_mm` — a **spine-side** floor only (`6 + 4 + 3 = 13.00 ≤ 25.35` ✓). The fore edge is bound by C1, C2 and the safe-area check, never by the gutter, so C4 is not a `min(...)` over the two insets (an earlier revision used `min_side_text_margin_mm`; `08` §4.2) | §9.1 "Fixed inner and outer margins … Binding allowances"; `08` §4.2 | `PRINT_GUTTER_EXCEEDS_MARGIN` (critical) |
| C5 | the spine-side clearances are discharged by the two **facing text boxes**, not by a sheet-level gutter: `10` §6.2 adds **no** gutter between panels, and the clear space across the fold is `2 × 25.35 = 50.7 mm ≥ gutter_mm` (`10` §6.5) | `gutter_mm` is a leaf-level token satisfied by the shift — never an offset imposed on an imposed sheet | `PRINT_GUTTER_INSUFFICIENT` (major — a facing clear space below `gutter_mm`); `PRINT_IMPOSITION_GUTTER_MISMATCH` (`11` §2.4, major) if a plan nevertheless *assumes* a sheet-level gutter offset |
| C6 | a corner ornament's bounding box fits inside the frame corner region at the declared `size_pt` | §6.8 "decorative framing" | `PRINT_ORNAMENT_CLIPS_FRAME` (major) |
| C7 | the frame is identical on every page of a `dsg_rev` | §9.2 "Align consistently across pages" | `PRINT_BORDER_GEOMETRY_MISMATCH` (critical) |

### 7.5 The digital projection of the frame

The digital reader draws the same frame, projected by R4 (§1.7) so that its **ratio to the page** is preserved at every viewport:

```
--sb-layout-border-offset-px-css   : calc( var(--sb-page-ratio-border-offset) * var(--sb-page-box-width) )
--sb-page-ratio-border-offset      : 0.057266          /* derived: 8 / 139.7, compiled */
--sb-page-box-width                : <live box width in px_css>
```

At the reference box this evaluates to 30.23438 px_css, identical to R3 (§1.7). On a 360 × 640 phone the page box is ≈ 328 × 507 px_css and the frame inset becomes ≈ 18.79 px_css — the page shrinks and its furniture shrinks with it, while the **type size does not** (§5.6 L1 vs L2). This is the one behaviour that makes the phone edition and the A5 print edition recognisably the same book without pretending a phone has a 6 mm margin.

Digital-only requirements that are *not* print requirements:

| Rule | Detail | Finding |
|---|---|---|
| the frame must never overlap the page controls | §10.3 "No off-screen navigation" | `DIG_FRAME_CONTROL_COLLISION` (major) |
| a rule below 0.5 px_css must be widened to 0.5 px_css for digital rendering (never dropped) | sub-pixel borders antialias inconsistently | `DIG_RULE_WIDENED` (info) |
| at a viewport too small to hold the frame plus a readable measure, the reader drops the frame and reports | §7.1 "Never force a two-page spread when it would compromise readability" | `DIG_FRAME_DROPPED_SMALL_VIEWPORT` (major, disclosed) |

---

## 8. Token versioning and change propagation

### 8.1 A token change produces a new design revision, always

```
dsg_rev_new = sha256(canonical_json(design_revision_content_new))          // D-10
design/revisions/<dsg_rev_new>.json = { parent: dsg_rev_old, reason: "token:layout.border.colour", … }
```

| Rule | Detail | Cite |
|---|---|---|
| any token change ⇒ a new `dsg_rev` | the revision is content-addressed, so no change can be represented without a new hash | D-10, `04` §1.1 |
| the change carries a `reason` naming the token path | mirrors `Lock.reason` and `ManuscriptRevision.reason`; an unattributed design change is unreviewable | `04` §3/§5.3 convention |
| the theme document is a *source*, not a state | editing `themes/warm_parchment.json` does not retroactively change any project; a project's `dsg_rev` is frozen | `03` §6, D-10 |
| a theme switch is an automatic operation, and is refused on a locked path | §2.5, `07` §2/§5.3, `DESIGN_LOCK_VIOLATED` (critical) | `07` |

### 8.2 What a token change invalidates

`05-content-and-composition-model.md` §2.7 fixes the approval scopes and the invalidation triggers; this document states *which token class* triggers which. `changes_geometry` in each token's metadata (§2.4) is the discriminator.

| Token class | `changes_geometry` | re-measure (`03` §5.1) | re-solve | re-render | approval scopes going `stale` (`05` §2.7) |
|---|---|---|---|---|---|
| **metric**: `type.*.family`, `.size_pt`, `.size_px_css`, `.line_height`, `.letter_spacing_em`, `.hyphenate`, `.orphans`, `.widows`; `lang`; `hyphenation` | yes | **every block** | digital + print | all | `dsg_rev` ("any token change"), digital reading composition, fixed print composition, final previews |
| **geometry**: `layout.border.*`, `safe_area_mm`, `gutter_mm`, `binding_allowance_mm`, `text_box_mm`, `paper_fit[]`, `page.proportion` | yes | print (text box and margins) and any digital value projected from them | print (and digital if proportion changed) | print + proof sheets | as above, plus `R-` composition re-solve |
| **space/rule**: `space.*`, `rule.*` (reservations) | yes | affected blocks | both | all | as metric |
| **surface**: `colour.*`, `page.background.*`, `page.numbering.*` (style/position) | no | none | none | all (colour-only re-render) | `dsg_rev`, final previews — plans remain valid |
| **motion**: `motion.*` | no | none | none | HTML only | `dsg_rev`, final previews |
| **paper**: `layout.paper` | **yes, and it cannot be applied to an existing composition** | all | both | all | all composition scopes. `cmp_rev.print.paper` (`04` §5.1) is part of the composition, so a paper change requires a new `dsg_rev` **and** a new `cmp_rev`, and a `Re-open pagination` if the print plan is frozen (D-05) — the paper is never rescaled into |

**Frozen print pages are never reflowed** (D-05). A metric or geometry change while the plan is frozen produces:

| Finding | Severity | Behaviour | Cite |
|---|---|---|---|
| `PRINT_FROZEN_OVERFLOW` | critical | the affected pages are named; **no reflow, no overwrite**; the project moves to `composition_stale` | D-05, `05` §2.7 |
| `COMP_FROZEN_LOCK_CONFLICT` | critical | a frozen page that can no longer satisfy a soft lock refuses to render | `07` §5.3 |
| `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` | critical | an export citing a `stale` approval is refused | `04` §7.3 |

The one-click `Re-open pagination` creates a **new** `cmp_rev` with `parent` pointing at the frozen one; the approved revision remains in history forever (D-05).

### 8.3 A token change never edits a composition revision in place

This is the rule that makes change propagation safe, and it is already implied by the schema — stated here so no implementation can "simplify" it away:

| Fact | Consequence |
|---|---|
| `CompositionRevision` is immutable and pins `dsg_rev` (`04` §5.1: `"dsg_rev": "dsg_77e0..."`; `04` §1.2: revisions are "Immutable snapshot, content-addressed… No, ever") | after a token change, every existing `cmp_rev` references a *previous* design by hash. Nothing in them is wrong; they are historically accurate |
| `CompositionRevision.scope` records `print \| digital \| both` (`04` §5.1) | a surface-only change re-renders the same `cmp_rev`; a metric change requires a **new** one for the affected scope |
| the project pointer moves (`04` §3 `pointers.design_revision`) | the dashboard shows one current triple; old triples remain openable and exportable if they carry an `approved` approval (§15.5 "Exported files match the approved revision") |
| composition history is append-only (`04` §5.4: `restore_revision` is an `Action`, never a deletion) | a design change is reversible by restoring the previous revision triple, because every revision is still on disk |
| no automatic process may edit a `cmp_rev` to accommodate a design change | `07` §5.4 rule 2: "No renderer may fall back to a 'closest possible' plan after a conflict" |

**The propagation pipeline, in order** (this order is the §10.5 correction ladder applied to a design change):

```
token edit → dsg_rev_new (validators: R1, meta, locks, print-safe, C1–C7)
           → recompile tokens (metricsHash changes iff a metric token changed)
           → re-measure affected blocks (cache keyed by metricsHash, §8.4)
           → re-solve affected scopes (07 §4) → cmp_rev_new (parent = cmp_rev_old)
           → if any critical violation: emit findings, emit NO revision (05 §2.6)
           → re-render artifacts → approvals set stale with a named reason (05 §2.7)
           → targeted revalidation of affected pages only (§12.5)
```

### 8.4 The metrics hash, and targeted revalidation (§12.5)

`03` §5.1 keys the measurement cache by "the revision triple", which is correct but coarse: it would re-measure the entire book for a colour change. Two hashes fix that, and both are recorded in the manifest (D-14):

```
dsg_rev          = sha256(canonical_json(design_revision_content))
dsg_metrics_hash = sha256(canonical_json(compiled tokens with meta.changes_geometry == true))
theme_token_hash = sha256(canonical_json(compiled tokens))
```

| Change | `dsg_rev` | `dsg_metrics_hash` | measurement cache | re-solve | cite |
|---|---|---|---|---|---|
| colour | new | **unchanged** | **fully reused** | none | §12.5 "Avoid regenerating complete books when only one page, paragraph, or design parameter has changed" |
| motion | new | unchanged | reused | none | |
| type size | new | changed | re-measured | yes | |
| border offset | new | changed | print geometry re-measured | print | |
| paper | new | changed | re-measured | both, new `cmp_rev` | D-13, Q-04 |

The rule, stated plainly: **reuse is keyed by what the measurement actually depends on, and what it depends on is the metric-bearing subset of the compiled tokens, not the revision hash.** A pipeline keyed by `dsg_rev` alone is correct but wasteful; a pipeline keyed by a hand-maintained field is wrong. `changes_geometry` is compiled metadata, so it cannot fall out of step with the token set.

---

## 9. Traceability

`R-<AREA>-<nnn>` identifiers are owned by `01-product-requirements.md` (`00` §3.1: "No other document may invent a requirement ID"). `13` §7's convention is therefore followed: **area granularity only** (`R-DSN-*`), with the registry winning on any conflict.

| # | Claim in this document | Requirement area / id | Spec | Decision | Phase (`13` §2–3) |
|---|---|---|---|---|---|
| T-01 | The pt↔px_css bridge is exact and paper-independent; R1 is enforced at zero tolerance | `R-DSN-*` (token units) · `R-ARC-*` (`src/core/units`) | §8.1 | D-01, D-04 | 1 (`units`), 5 (enforcement) |
| T-02 | A design revision carries an authored pair per identity token, checked against R1 | `R-DSN-*` · `R-ARC-*` (schema) | §8.1, §8.3 | D-10 | 1, 5 |
| T-03 | Physical quantities (`safe_area_mm`, `gutter_mm`, `binding_allowance_mm`, trim) are not convertible and never reach a digital consumer | `R-DSN-*` · `R-PRT-*` | §9.1, §8.1 | D-01 | 5, 6 |
| T-04 | Digital geometry is projected by ratio; identity tokens never depend on the viewport | `R-DSN-*` · `R-DIG-*` | §7.1, §7.4, §6.10 | D-06 | 3, 5 |
| T-05 | Line-break parity between the digital ref box and print is a tested invariant | `R-DSN-*` · `R-QAS-*` | §1.2, §8.1, §15.5 | D-01, D-14 | 5, 6 |
| T-06 | The token document format, seven categories, dotted-path naming, per-token metadata | `R-DSN-*` · `R-ARC-*` (schema, `spec/`) | §8.1, §12.2 | D-03, D-10 | 1, 5 |
| T-07 | `design_lock` targets token paths, with glob semantics and default locks | `R-DSN-*` · `R-CMP-*` | §6.9 | D-07 | 4c, 5 |
| T-08 | Four consumers, one compiler, no consumer performs a conversion or holds a fallback constant | `R-DSN-*` · `R-ARC-*` (module boundaries) | §8.1, §12.3, §12.4 | D-01, D-04, D-14 | 1 (compiler), 5 (full) |
| T-09 | The measurement container is authoritative for measured metrics; validation compares it to the compiled expectation | `R-DSN-*` · `R-QAS-*` | §6.7, §12.4 | D-04 | 1B, 5, 8 |
| T-10 | CSS custom-property naming is a mechanical, bijective function of the token path | `R-DSN-*` · `R-UXS-*` | §8.1 | — | 5 |
| T-11 | All eight §8.2 themes exist as token documents and render without illustrations | `R-DSN-*` | §8.2, §13 | D-09, D-15 | 5 |
| T-12 | Eight themes' audience fit, font pairing, licence, sizes in both units, line height, border, background, accent, density band | `R-DSN-*` · `R-WIZ-*` (audience) | §3.2, §8.2, §8.3 | D-15, Q-02 | 5 |
| T-13 | Density band resolution: theme ∩ profile ∩ §6.7 defaults, narrower wins | `R-DSN-*` · `R-CMP-*` | §6.7 | D-15, D-16 | 2, 5 |
| T-14 | Reader colour variants are colour-only: byte-identical on every non-colour token | `R-DSN-*` · `R-DIG-*` | §7.3 | D-04 | 5 |
| T-15 | Ten §6.8 presets each declare `border_slot: "perimeter"`, so variety cannot break §9.2 | `R-DSN-*` · `R-CMP-*` | §6.8, §9.2 | — | 2 (declares), 5 (materialises) |
| T-16 | Font metrics: ascent/descent/line-gap read from the file; `line-height: normal` forbidden | `R-DSN-*` · `R-ARC-*` (bridge) | §8.3, §12.4 | D-01, D-04 | 1B, 5 |
| T-17 | Leading is resolved to a whole 1/64 px and is the solver's line unit | `R-CMP-*` · `R-QAS-*` | §6.7, §12.4 | D-04 | 2, 5 |
| T-18 | `minimum_readable_pt` enforced at print and at every reader scale step | `R-DSN-*` · `R-QAS-*` | §8.3, §10.3 | — | 5, 8 |
| T-19 | Orphan/widow minimums, floored at 2, as solver penalties | `R-DSN-*` · `R-CMP-*` | §6.7 (line spacing), §10.2 | D-07 | 2, 5 |
| T-20 | Hyphenation and `lang` are design tokens and therefore pagination inputs; dictionary required | `R-DSN-*` · `R-CMP-*` · `R-DIG-*` | §3.2, §6.7, §7.4 | D-04, Part C | 5 |
| T-21 | Reader authority is exactly `reader_overrides`: font scale within the ladder, colour theme, motion, page mode — and nothing that re-measures | `R-DIG-*` · `R-DSN-*` | §7.3, §7.2, §10.3 | D-04, D-06 | 3, 5 |
| T-22 | The scaling model: L0 identity is the compiled set only; type never scales with the page box | `R-DSN-*` · `R-DIG-*` | §7.3, §7.4, §8.1 | D-06 | 3, 5 |
| T-23 | `fonts/registry.json` entry shape, with licence, embed/subset/distribute flags and `metrics_hash` | `R-DSN-*` · `R-OPS-*` (licences) | §8.3 | D-09, D-14 | 5, 6 |
| T-24 | Embedding per output: woff2 inline for HTML (offline, no network fetch); embedded subset for PDF | `R-DSN-*` · `R-PUB-*` · `R-OPS-*` | §1.2, §7.1, §9.1, §15.3 | D-09, D-19 | 3, 6 |
| T-25 | Refusal matrix: unregistered, unlicensed, non-embeddable, non-distributable, non-subsettable | `R-DSN-*` · `R-OPS-*` | §8.3 | D-09 | 5, 6 |
| T-26 | Subsetting policy and its determinism; `fonts_hash` computed over embedded files | `R-DSN-*` · `R-OPS-*` | §12.5, §15.5 | D-09, D-14 | 3, 6 |
| T-27 | A metric-changing fallback is a finding (major digital / critical print), never a silent substitution | `R-DSN-*` · `R-QAS-*` | §8.3, §10.4 | D-09 | 5, 6 |
| T-28 | Q-02's effect on licensing strategy: the private-font rule and the publishability constraint | `R-OPS-*` · `R-DSN-*` | §8.3 | D-09, Q-02 | 5, 6 |
| T-29 | Perimeter frame geometry as one token group, satisfying all seven §9.2 obligations | `R-PRT-*` · `R-DSN-*` | §9.2, §8.1 | — | 5, 6 |
| T-30 | The frame is symmetric about the trim; the text box absorbs the binding allowance | `R-PRT-*` | §9.1, §9.2 | — | 6 |
| T-31 | Corner/ornament/divider/drop-cap tokens, and the rule that a drop cap must be measured | `R-DSN-*` · `R-CMP-*` | §6.8, §8.1 | — | 5 |
| T-32 | Print-safe-area constraints C1–C7 as validators | `R-PRT-*` · `R-QAS-*` | §9.2, §10.4 | D-14 | 6, 8 |
| T-33 | The digital projection of the frame, and its digital-only requirements | `R-DIG-*` · `R-DSN-*` | §7.1, §10.3 | — | 3, 5 |
| T-34 | A token change creates a new `dsg_rev` with a reason, never a mutation | `R-DSN-*` · `R-ARC-*` | §12.2, §12.5 | D-10 | 1, 5 |
| T-35 | Invalidation matrix per token class; `changes_geometry` drives targeted revalidation | `R-DSN-*` · `R-CMP-*` | §6.11, §12.5 | D-13 | 4d, 5 |
| T-36 | Frozen print pages are never reflowed on a token change; `Re-open pagination` creates a new revision | `R-PRT-*` · `R-CMP-*` | §6.10, §9.3, §15.2 | D-05 | 4d, 6 |
| T-37 | A token change never edits a `cmp_rev` in place; history is append-only | `R-ARC-*` · `R-CMP-*` | §12.2, §12.5, §15.2 | D-05, D-10 | 2, 5 |
| T-38 | `dsg_rev` / `dsg_metrics_hash` / `theme_token_hash` and the measurement-cache rule | `R-ARC-*` · `R-OPS-*` | §12.5, §15.5 | D-14 | 1B, 5 |
| T-39 | Every artifact manifest records the theme token hash and font hashes (reproducibility) | `R-OPS-*` · `R-PUB-*` | §15.5 | D-14 | 3, 6, 7 |

**Phase summary.** Phase 5 (§17 "Shared Design System") carries T-01…T-38's *enforcement*; Phase 1 builds the compiler, the unit module and the bridge those rules stand on (`13` §3.1: `src/design` "token compilation + typography metrics only, D-13"); Phase 3 consumes the reader projection; Phase 6 consumes the print projection and borders; Phase 8 verifies. This matches Phase 5's own exit criteria (`13` §3.5), in which four of the five are claims of this document: all eight themes as token documents, every §6.8 preset as a `tpl_`, no font selectable without a licence entry, a theme switch that re-paginates and *reports* a lock conflict rather than resolving it, and the readable minimum enforced.

---

## 10. Contradictions, gaps and dependencies reported (not edited)

| # | Item | Where | This document's position |
|---|---|---|---|
| 1 | `size_pt` / `size_px_css` pairs in the §6.1 example violate the exact 4/3 ratio (13 / 18, 22 / 30, 30 / 42) | `04-project-data-schema.md` §6.1 | §1.8: corrected to 13.5 / 18, 22.5 / 30, 31.5 / 42. **RESOLVED (round 3)** — `04` §6.1's `typography` example now carries `13.5 / 18`, `22.5 / 30`, `31.5 / 42`, so the three pairs satisfy `px_css = pt × 4/3` exactly; the rule is binding either way |
| 2 | ~~`layout.text_box_ratio: 0.68`~~ — **RESOLVED.** `04` §6.1 now carries the field as the derived **exact rational** `96/139.7` — never the 4-decimal `0.6872`, which is `23222 q` where the geometry gives `23221 q`, one quantum off — and it marks the field derived; the `typography` unit pairs were corrected to `px_css = pt × 4/3` exactly. | `04` §6.1 | closed |
| 3 | `spacing_tolerance` is named as a design-revision field by `05` but is absent from `04` §6.1's `layout` | `05` §2.4, §2.7 vs `04` §6.1 | **RESOLVED (round 3).** `04` §6.1 now carries `layout.spacing_tolerance = {"min": -0.06, "max": 0.06}` (a fraction of line height), and §2.3 above lists it under `layout` — so `05` §2.4 and `COMP_SPACING_OUT_OF_BOUNDS` are checkable, and this document's earlier `space.spacing_tolerance` (±0.15) reading is superseded |
| 4 | The commissioning brief asked for "a stated px_css↔pt ratio per paper preset" | task wording | §1.4: the ratio is paper-invariant by construction; the per-preset constants are stated instead. Inventing a per-preset ratio would encode a rounding error |
| 5 | The brief's example token path `layout.border.inset` disagrees with `04` §6.1's `layout.border.offset_mm` | task wording vs `04` §6.1 | §2.2: the schema wins (`04` is binding) |
| 6 | `docs/08-pagination-strategy.md` — **RESOLVED.** This row was written while `08` did not yet exist. `08` now exists, and its §2 (measurement bridge) and §1.5 (derivation rule D-2) agree with §3.2 (c) and §1.7 here: `04` §6.1 stays the declared authority for the text box, `08` owns the measurement container, and `derived` values are computed in exactly one place. |
| 7 | `docs/01-product-requirements.md` — **RESOLVED.** `01` now exists with 221 requirements including the `R-DSN-*` set; §9's traceability table is stated at area granularity and the `R-DSN` numerals in `01` are authoritative on any conflict. |
| 8 | ~~`04` §6.1 has no declared paper~~ — **RESOLVED.** `04` §6.1 now declares `layout.paper` and `paper_fit[]`, with switching paper defined as a new `dsg_rev` and never a rescale. | `04` §5.1, §6.1 | closed |
| 9 | Q-02 is unresolved and it is the only external input this document depends on | `17` Part B | §6.6: both outcomes are specified; the recommended default (personal tool, licence-clean assets) is assumed for the bundled themes in §4.1 |
| 10 | The eight themes' font pairings are this document's choice, not the spec's | spec §8.2 names themes only | §4.1: every family is SIL OFL 1.1 with `embed_pdf`/`subset_web`/`distributable` all true, so D-09's and Q-02's constraints hold under either outcome; a reviewer may substitute any family that satisfies §2.4's `print_safe` and §6.3's refusal matrix |
