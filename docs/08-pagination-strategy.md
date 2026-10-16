# Pagination Strategy

**Implements:** spec §6.7 (page density), §6.10 (responsive composition rules), §7.1 (fullscreen reading, single vs facing), §7.4 (digital pagination), §8.1 (shared tokens, different units), §9.1–§9.3 (fixed-page renderer, borders, print pagination), §10.5 (automated correction), §12.4 (conventional code does geometry), §15.3–§15.4 (acceptance)
**Deliverable covered:** D9 and D10 (per §16)
**Inherits:** `docs/00-README.md`, `docs/03-technical-architecture.md` (§5.1, §5.2, §5.3, §9, §10), `docs/04-project-data-schema.md` (§1, §5.1, §5.2, §6.1, §6.2, §7.2, §10), `docs/05-content-and-composition-model.md` (§2.1–2.2, §2.4, Part 3), `docs/07-lock-and-constraint-rules.md` (§2–§5), `docs/17-decisions-and-open-questions.md` (D-01, D-04, D-05, D-06, D-13, D-14, D-16)

---

## 1. Scope and the two-layer contract

### 1.1 What this document specifies

Two of §16's deliverables, in one document, as two halves:

| Half | §16 | Produces | Sections here |
|---|---|---|---|
| **A — Responsive digital pagination** | 9 | the `digital` layer of a `CompositionRevision` (screen pages at a viewport) | §3, §5, §6, §7, §8 |
| **B — Fixed print pagination** | 10 | the `print` layer of a `CompositionRevision` (fixed physical pages) | §4, §5, §6, §7, §8 |

Both halves share §2 (the measurement bridge) and §9–§10. Neither half decides *meaning*: beat order, intentional breaks and locks are inputs (`05` §2.2; `07` §3). Both are pure, network-free and AI-free (`D-04`; §12.4 "Conventional code must handle typography measurements, page geometry, rendering, booklet imposition"; `03` §1). This document owns the geometry; the solver internals are `07` §4, imposition arithmetic is `10-booklet-imposition-spec.md`, and rendering is `03` §5.3.

### 1.2 The layer contract (`05` §2.1)

The three composition layers of §6.10 are produced by two functions. The **logical** layer is not an output of pagination — it is the viewport- and paper-independent *input*. Digital and print are two different *outputs* of the same logical input.

| Layer | `05` §2.1 lifetime | Who produces it | Where it is stored |
|---|---|---|---|
| Logical | whole project; never viewport/paper-derived | author + `solve()` constraints (`07` §4) | `cmp_rev.logical` (`04` §5.1) |
| Digital | recomputed freely; count is a **range** | `paginateDigital` | `cmp_rev.digital` + reader runtime artifact |
| Print | frozen at approval (`D-05`) | `paginatePrint` | `cmp_rev.print` + PDF artifacts |

### 1.3 Exact input tuple and output type

```ts
// Engine D — src/digital  (03 §3: "measure(), paginateDigital(), renderStorybook()")
paginateDigital(input: DigitalInput): DigitalPagePlan        // or SolveFailure

// Engine E — src/print   (03 §3: "paginatePrint(), renderPages(), readingPdf(), bookletPdf()")
paginatePrint(input: PrintInput):    PrintPagePlan           // or SolveFailure

interface DigitalInput {
  msRev:  ManuscriptRevision;   // ms_   — prose + reading order (04 §4.2)
  cmpRev: CompositionRevision;  // cmp_  — logical layer + locks + templates (04 §5.1)
  dsgRev: DesignRevision;       // dsg_  — tokens, typography, lang/hyphenation (04 §6.1)
  viewport: Viewport;           // the target, per §7.4
  target: 'digital';
}

interface PrintInput {
  msRev:  ManuscriptRevision;
  cmpRev: CompositionRevision;
  dsgRev: DesignRevision;
  paper:  PaperSpec;            // preset or custom (§9.1)
  frozen: FrozenPlan | null;    // present iff cmpRev.approval_state = approved (D-05)
  target: 'print';
}

interface Viewport {            // all lengths _px_css; DPR is pinned, never an input to the plan
  width_px_css:  number;
  height_px_css: number;
  orientation:   'portrait' | 'landscape';
}

type PaperSpec =
  | 'half_letter'                      // US Letter folded  → trim 139.7 × 215.9 mm (§9.1)
  | 'a5'                               // A4 folded         → trim 148   × 210   mm (§9.1)
  | { width_mm: number; height_mm: number };   // custom (§9.1)

type SolveFailure = { conflict: LockConflict } | { finding: Finding };
```

Output types, exactly as the schema stores them (`04` §5.1):

```ts
interface DigitalPagePlan {                 // becomes cmp_rev.digital
  pages: DigitalPage[];                     // { page_id, template, spans[]:{block_id, from_line, to_line}, violations[] }
  measured_at: { viewport_px_css: string; pages: number; spread: boolean }[];
  page_count_range: [number, number];       // D-06 — never conflated with print.page_count
}
interface PrintPagePlan {                   // becomes cmp_rev.print
  paper: PaperSpec;
  pages: PrintPage[];                       // { page_id, kind, template, spans[], frozen, fit: PageFitReport }
  page_count: number;                       // ≡ 0 (mod 4) for saddle-stitch (04 §5.1 invariant)
  imposed: { sheets: number; spec_version: number };
}
```

**Totality rule.** Neither function throws for a *fit* problem: a fit problem is a `Finding` (`00` §4.5 "Failures are findings, not exceptions"), and a hard conflict returns `SolveFailure` with **no plan emitted** (`07` §4.4, §5.4). Neither function is permitted to return a partial or "closest possible" plan (`07` §5.4 rule 2).

**Function-purity rule.** Both are deterministic functions of their input tuple plus the environment (§7). Same triple + same viewport/paper + same engine + same Chromium build ⇒ byte-identical `PagePlan` (`07` §4.5; `D-04`).

---

## 2. The measurement bridge

This is the shared core both halves call (`03` §5.1 step 2, §5.2 step 3). Everything downstream — density (§6.7), page turns (§6.6), fit, overflow — is derived from the numbers this section produces. If the bridge is wrong, every plan is wrong in a way no plan-level test can see (`14-test-plan` §2).

### 2.1 The off-screen measurement container

One `Block` is laid out once, in a container whose **inner content width equals the render content box width exactly**.

| Property | Value | Why |
|---|---|---|
| Container element | `div.sbs-measure` inside the measurement document body | — |
| Position | `position:absolute; left:-100000px; top:0; width:<content box>` | off-screen, but a real layout context |
| Visibility | `visibility:hidden` | **retains layout.** `display:none` produces no line boxes; `content-visibility:hidden` skips layout of off-screen content — both silently measure zero |
| `overflow` | `visible` | a clipped container truncates the last line box's rect |
| `height` | `auto` (unconstrained) | the block must lay out in full and be allowed to overflow the page height; overflow is *reported*, not prevented (§6.10) |
| Stylesheet | the **compiled** theme stylesheet (`09-design-token-architecture.md`), byte-identical to what the renderer injects | any divergence is a geometry divergence |
| Inherited properties | must match render: `writing-mode`, `direction`, `text-rendering`, `font-feature-settings`, `font-kerning`, `letter-spacing`, `word-spacing`, `word-break`, `text-align`, `text-indent`, `hyphens`, `lang` | each changes line breaks |

**Why identical geometry is non-negotiable.** The container produces the plan; the render container produces the page. If the measurement container is even 1 px_css wider, a paragraph that measures 24 lines can render as 25, and the plan says it fits when it does not — the exact §15.4 failure ("No clipped or overlapping text") that `D-13` exists to prevent. The bridge therefore **constructs both containers from the same function** of `(dsg_rev, target)`, and `T-DIG-005` asserts the measurement container width equals the render content-box width.

Content-box width is computed as:

| Half | content box width `_px_css` | source |
|---|---|---|
| Digital | `viewport.width_px_css × dsg.layout.text_box_ratio` for a single page; for a spread, `(spreadWidth − gutter_px_css)/2` per leaf (§3.3) | §7.4; `04` §6.1 `text_box_ratio` — the **exact rational `96/139.7`**, never the 4-decimal `0.6872`, which gives `23222 q` where the geometry gives `23221 q` and breaks `09` §1.7's parity at the reference box (§9.6) |
| Print | `content_width_mm × (96/25.4)` after `§4.2` margin/border arithmetic | §9.1; `04` §6.1 `text_box_mm` |



Digital reads only `_px_css`/`_em` tokens; print reads `_mm`/`_pt` and converts once (§8.1 "physical units and pagination calculations may differ"; `04` §1).

### 2.2 Line boxes — offsets from `Range.getClientRects()`, the count from element height

For each block element `el`:

```ts
const range = document.createRange();
range.selectNodeContents(el);                       // the block's inline content
const rects = [...range.getClientRects()];          // one DOMRect per line *fragment* — a line holding an
                                                    //   inline element yields SEVERAL, never exactly one
const origin = measureContainer.getBoundingClientRect();
const lines = rects.map((r, i) => ({
  index:      i,
  top_q:      q(r.top - origin.top),                // see §2.3
  height_q:   q(r.height),
  baseline_q: q(r.bottom - origin.top),
}));
const height_q  = q(el.getBoundingClientRect().height);   // border-box height — the LINE COUNT's source:
                                                    //   lines_per_block = round(height_q ÷ line_height_q)
const replaced  = [...el.querySelectorAll('img,svg,object')].map(n => q(n.getBoundingClientRect().height));
```

Rules:

- **`getClientRects()` on a text `Range` returns one rect per line *fragment*, not one per line box.** A line containing an inline element (a `<span>`, `<em>`, a link, …) produces several rects, so the rect *count* **over-reports** the number of lines. The rects remain the only in-browser source of *per-line offsets* — each rect's `top`/`bottom` locates a fragment of a line — and those offsets are what §6.6/§6.7 need (`03` §5.1 step 2; `T-DIG-002`). Word counts cannot substitute (§6.7 "Do not use raw word count as the sole indicator").
- **The line count is the element height divided by the line pitch — never the rect count.** `lines_per_block = round(height_q ÷ line_height_q)`, where `height_q = q(el.getBoundingClientRect().height)` (the line above) and `line_height_q` is the compiled pitch (`09` §5.1; `1728 q` for the reference theme). That is the count the solver and the density classifier consume, and it is exactly the `height_q` the record already carries (§2.4). Counting rects **over-reports** the count. The probe's rect count was `25`, and the height method first gave `23` — but the `23` was measured in a **fallback** face, because the harness never actually loaded the design's font (§2.6). In the shipped face (`app/assets/fonts`, Lora) the height method gives **`25`** line boxes, and that is the value `words_per_line_measured` must equal. Both the instrument *and* the face are now asserted (§2.6.1); the defect is recorded in `fixtures/measure/README.md` and `05` §1.6 item 6.
- A block with no text content yields zero rects ⇒ `lines: []`, `height_q` from the element box. This is the correct measurement for `blank`/`page_number` blocks.
- Inline-replaced children (`img`, `svg`, `object`) contribute height that the text rects do not capture; they are summed separately (`T-DIG-006`).
- **Batch all writes, then all reads.** Appending blocks flushes layout; every `getClientRects()`/`getBoundingClientRect()` after a write forces a synchronous reflow. The bridge appends all blocks, then reads all rects in one pass (`03` §9 "The renderer never parallelises anything whose output ordering feeds a page number" — the same batching discipline applies to reads).

### 2.3 Quantisation to 1/64 px integers

Every value leaving the bridge is an integer in units of **1/64 `_px_css`** (`q(x) = Math.round(x * 64)`):

```
1 px_css = 64 quanta (q)          1 q = 1/64 px_css ≈ 0.015625 px_css
```

| Rule | Basis |
|---|---|
| No float leaves the bridge; the solver never sees a float | `07` §4.5 "All measurement values are quantised to 1/64 px integers before entering the solver" |
| Weights and penalties are integers, so cost comparison is exact | `07` §4.5 |
| Fractional leading is accumulated in the integer accumulator and consumed when it crosses a line | `07` §4.1 (this is how a text engine behaves) |
| Quantisation is the **last** step — geometry is computed in full precision, then rounded once | avoids double-rounding drift |
| Print measurement is *also* in `_px_css` inside Chromium; the exact rational `1 mm = 96/25.4 px_css` converts the mm container, then the same `q()` applies | §8.1 (one engine, two unit sets) |

1/64 is chosen because it is the largest binary denominator ≤ 1 that Chromium's own layout does not exceed in practice, and because `64 = 2⁶` makes the division exact in a fixed-point accumulator. `T-DIG-004` asserts every value entering the solver is such an integer.

### 2.4 Measurement record shape

Stored (not prose) as `project/.cache/measure/<hash>.json` (`03` §5.1, §6):

```ts
interface BlockMeasurement {
  block_id:          string;        // blk_
  text_hash:         string;        // sha256 of the measured text (04 §4.1) — the content part of the key
  style_fingerprint: string;        // sha256 of the resolved typography + template role + container geometry
  target:            Target;        // {kind:'viewport', w,h,orientation} | {kind:'paper', content_width_mm, content_height_mm}
  content_width_q:   number;        // 1/64 px_css — asserted equal to the render content box (§2.1)
  height_q:          number;        // block border-box height
  lines:             LineBox[];     // §2.2
  inline_replaced_q: number[];      // §2.2
  env: {                            // the reproducibility part of the key (§7)
    engine_version:    string;
    chromium_build:    string;
    fonts_hash:        string;      // sha256 over fonts/registry.json metrics_hash set actually used (D-09)
    hyphenation_hash:  string;      // sha256 over the hyphenation/ICU data used for dsgRev.lang (D-04, 17 Part C)
  };
}
interface LineBox { index: number; top_q: number; height_q: number; baseline_q: number }
```

### 2.5 Caching, and the cache-invalidation rule

`03` §5.1 states the cost-control key as `(revision triple, viewport)`. That key alone cannot deliver §12.5's "avoid regenerating complete books when only one paragraph changed": an `ms_rev` hash covers *all* blocks (`04` §1.1), so any one-paragraph edit changes the triple and would miss every entry. The bridge therefore uses a **two-tier cache** whose tier-1 key is exactly the documented key and whose tier-2 key is per-block:

```
tier 1 — revision index   project/.cache/measure/index/<h1>.json
  h1 = sha256(canonical_json({ schema:1, ms_rev, cmp_rev, dsg_rev, target, orientation,
                               dpr:1, engine_version, chromium_build, fonts_hash, hyphenation_hash }))
  body: { block_id -> tier2_hash }            // the plan's measurement set, one entry per block

tier 2 — block entry      project/.cache/measure/blocks/<h2>.json
  h2 = sha256(canonical_json({ schema:1, text_hash, style_fingerprint, target, dpr:1,
                               engine_version, chromium_build, fonts_hash, hyphenation_hash }))
  body: BlockMeasurement
```

- A tier-2 entry is **content-addressed and immutable**; a miss measures and writes; a hit never re-measures.
- `cmp_rev` is in the tier-1 key because template assignment changes a block's typography role and therefore its metrics (`04` §6.2 `typography_role`); this is why the documented triple is the correct tier-1 key.
- **Invalidation rule:** an entry is invalid when **any** component of its key changes. Invalid entries are *never mutated in place* — the new key is a new entry (additive cache; old entries age out). Because the environment components are in the key, a Chromium upgrade, a font-file change or a hyphenation-data change invalidates the whole cache *by construction* rather than by a purge step (`D-14`). A cache entry served for a different triple, viewport or engine — or a key that omits the engine version — is `OPS_MEASUREMENT_STALE` (critical, A·E·R), the code `11-validation-strategy.md` §2.5 registers for exactly this.
- **Disposability:** `.cache/` may be deleted at any time; deleting it and re-running reproduces identical hashes and bytes (`03` §6; `T-OPS-035`).
- **Cost control (§12.5):** editing one paragraph changes exactly one `text_hash`, so exactly one tier-2 entry misses; every unchanged block hits. A design change alters every block's `style_fingerprint`, so all miss — which is correct (`05` §2.7 "Typography size → all pages of the affected plan").

### 2.6 Guaranteeing fonts are settled before measuring

A measurement taken before webfonts settle reads the **fallback** font's metrics, produces a plausible but wrong line count, and — because the plan is cached and hashed — the wrong plan persists silently. This is the archetypal silent bug in the product. The bridge is required to close it four ways:

```ts
async function awaitFontsReady(dsgRev: DesignRevision, blocks: Block[]): Promise<void> {
  const wanted = new Set<string>();          // "<style> <weight> <sizePx>px \"<family>\"" from typography roles
  for (const b of blocks) for (const f of facesFor(b, dsgRev)) wanted.add(f.spec);

  for (const spec of wanted) {
    const face = await document.fonts.load(spec, SAMPLE_TEXT);   // forces the load, does not guess
    if (face.length === 0) throw new FontMetricsMismatch(spec);  // family absent → Chromium would silently fall back
  }
  await document.fonts.ready;                                   // all pending loads

  for (const f of document.fonts) if (f.status !== 'loaded' && wanted.has(f.family)) throw new FontSettleTimeout(f.family);

  assertMetricsHash(dsgRev, fontsRegistry());   // loaded file metrics_hash == the design's expectation (D-09)
  await layoutStable();                         // two consecutive identical probes, 2 rAF apart (T-DIG-003)
}
```

| Detection | Mechanism | Code raised | Severity · blocking |
|---|---|---|---|
| A webfont still loading | `document.fonts.ready` + per-face `document.fonts.load()` + a **two-pass layout-stability poll** (measure a probe, flush layout, wait 2 × rAF, measure again; require two identical results) | `OPS_MEASUREMENT_PRE_FONT_SETTLE` | critical (A·E·R) · **blocks the render** |
| A family is absent and Chromium silently substituted one | compare the loaded file's `metrics_hash` to `fonts/registry.json` before reading any rect (`D-09`) | `OPS_MEASUREMENT_STALE` | critical (A·E·R) · **blocks the render** |
| A family is *available* to `document.fonts.check()` but its glyphs are **not** the shipped face | assert the rendered face by comparing advance widths against a family that cannot exist (`§2.6.1`) | `OPS_MEASUREMENT_STALE` | critical (A·E·R) · **blocks the render** |
| Container geometry differs from the render box | assert `measureContainer.contentWidth === renderContentBox.width` before reading (`T-DIG-005`) | *(no finding code — a code defect)* | the measurement pass aborts; nothing is emitted |

Both font codes are raised **as findings and refuse the plan** (`00` §4.5; `07` §5.4 rule 2): a wrong-font plan is not emitted even as a candidate. `T-DIG-003` and `T-DIG-010` assert them. **This document introduces no finding code**: every code it names is already in the §2 registry of `11-validation-strategy.md`, which owns codes exclusively (`11` §1.2; an unregistered code is itself `OPS_REGISTRY_CODE_UNKNOWN`).

#### 2.6.1 Asserting the face, not trusting the font API

Settling the fonts (§2.6) is necessary and not sufficient, because **both** `document.fonts` APIs answer the wrong question:

| API | What it actually does | Why it does not prove the face |
|---|---|---|
| `document.fonts.check(spec)` | returns `true` if the family **can be matched** | it reports an **unavailable family as available**, so `check('18px "Lora"')` can be `true` while every glyph is a fallback |
| `document.fonts.load('18px "Lora, \'Iowan Old Style\', Georgia, serif"')` | parses the argument as a **font shorthand** | a whole quoted stack matches no face, so the promise resolves **immediately** and **nothing is fetched** — a `load()` that "succeeded" against a font that never arrived |

The bridge therefore **asserts the face it rendered in** before it reads a single rect:

```ts
// §2.6.1 — the face assertion. CANARY is a family name no system can have.
const CANARY = 'sbs-face-assertion-canary-does-not-exist';
const PROBE  = 'Hamburgefonstiv mmwwiill 0123456789';

function widthOf(family: string): number {
  const el = document.createElement('span');
  el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:18px "${family}"`;
  el.textContent = PROBE;
  measureContainer.appendChild(el);
  const w = q(el.getBoundingClientRect().width);   // §2.3
  el.remove();
  return w;
}

function assertFaceRendered(face: string): void {
  // The FIRST family of the stack is named explicitly — never the whole quoted stack.
  if (!document.fonts.check(`18px "${face}"`)) throw new FontMetricsMismatch(face);
  // Widths equal to an absent family's ⇒ both strings fell back to the same face.
  if (widthOf(face) === widthOf(CANARY)) throw new FontSubstituted(face);
}
```

Rules:

- **The first family of the stack is named explicitly**, never the whole quoted stack, or `load()` resolves without loading anything (the table above).
- **A width equality against an absent family is the assertion.** A resolved `load()` promise and a `true` `check()` are not evidence; two equal widths are evidence that both strings rendered in the same fallback.
- **The bridge and the emitter read the same font directory — `app/assets/fonts`.** A font resolved from a system path, a package manager or a network fetch is not the shipped face, so the line breaks the bridge measures cannot equal the line breaks the book ships (`09` §6, §6.1a).
- **`fonts_hash` (§2.4, the §2.5 key) is computed over that directory's files**, so a cache entry measured in a different face cannot be reused for this one.


---

## Part A — Responsive digital pagination

## 3. Digital pagination

### 3.1 Viewport model and the reference viewport set

```ts
interface Viewport { width_px_css: number; height_px_css: number; orientation: 'portrait'|'landscape' }
```

Pagination inputs (§7.4, exhaustive): viewport dimensions · page proportions · text measurements · font settings · border and padding geometry · paragraph boundaries · composition rules · story beat locks. The last two come from `cmp_rev`; the rest from `dsg_rev`; the text from `ms_rev`.

**Reference viewport set** (`03` §5.1 step 6; `T-DIG-020`):

| Viewport `_px_css` | Orientation | Spread? | Basis |
|---|---|---|---|
| 360 × 640 | portrait | no | §7.1 narrow → single page |
| 414 × 896 | portrait | no | idem |
| 768 × 1024 | portrait | no | width 768 < 1024 → single (`T-DIG-022`) |
| 1280 × 800 | landscape | **yes** | width ≥ 1024 **and** height ≥ 768 (`T-DIG-021`) |
| 1440 × 900 | landscape | **yes** | idem |

`measured_at[]` records every reference viewport with its page count and spread flag (`T-DIG-028`); `page_count_range` is `[min, max]` over the set (`T-DIG-027`, `D-06`).

### 3.2 The single vs facing-page decision

```
spread = width_px_css ≥ 1024 AND height_px_css ≥ 768 AND readableAsSpread()
```

`readableAsSpread()` is the §7.1 guard — "**Never force a two-page spread when it would compromise readability**". It refuses a spread when a leaf's text measure would fall below `readability_min_measure_px_css`, derived from the body typography (a minimum characters-per-line × mean advance, computed from the design's own metrics, not a magic number). The spread threshold is therefore a *necessary* condition, not a *sufficient* one; when the guard fires, the viewport presents single pages and the disclosure of `05` §2.1's "small display may not preserve the same page" applies.

### 3.3 Spread gutter geometry

For a spread at width `W_px_css`:

| Quantity | Value |
|---|---|
| `gutter_px_css` | the design's digital gutter token (`04` §6.1 `layout.gutter_mm` has a `_px_css` counterpart per §8.1) |
| leaf content width | `(W_px_css − gutter_px_css) / 2` |
| spine | the inner edge of each leaf; the gutter is centred on it |
| `spread_gutter_clear_px_css` | `gutter_px_css − 2 × border_inset_px_css`; if ≤ 0 the leaves' text boxes collide across the spine ⇒ `DIG_RESPONSIVE_LAYOUT_BROKEN` (major, A) — the viewport "selects the wrong single/spread mode", disclosed in the spread preview |

A spread plan is a plan of *facing pages*: page 2k is a verso, page 2k+1 a recto. `paginateDigital` produces the same break positions a single-page plan would, with per-page capacity doubled only in the sense that two leaves render at once — the plan's page sequence is identical, so a spread viewport and a single-page viewport of equal leaf width yield the same page count. This keeps `page_count_range` honest.

### 3.4 Device-pixel-ratio independence

- Measurement runs at **DPR = 1** for every viewport (`14-test-plan` §6.1; `D-01`, `D-04`).
- `Range.getClientRects()` returns **CSS pixels** by definition; the plan is expressed in `_px_css` and is therefore DPR-independent. A phone at DPR 3 and a monitor at DPR 1 with the same `width_px_css × height_px_css` produce the **identical** plan.
- DPR affects *rasterisation* (glyph crispness), never *layout*. It is excluded from the plan's input tuple; including it would make the plan non-reproducible across devices for no geometric reason. Where DPR must be pinned (screenshots, page rasters) it is recorded in the environment manifest (§7), not in the plan.

### 3.5 Orientation change

Orientation is a viewport swap `(W,H) → (H,W)` (`T-DIG-023`). Two cases:

1. **A swapped viewport already in the reference set** — the plan is looked up (or produced) for it; e.g. `1024 × 768` (landscape of the 768-class device) meets the spread threshold exactly and is a spread. No new plan class is introduced.
2. **A swapped viewport not in the reference set** (a phone rotated to `640 × 360`) — the *reader* handles it by local reflow between planned boundaries (§3.9); the project plan is **not** re-planned. A viewport outside the reference set is disclosed on the preview as `DIG_RESPONSIVE_LAYOUT_BROKEN` (major, A), never as a re-plan — the reader's fallback must keep the rendered page count inside `page_count_range` (`11` §2.3).

A rotation that introduces clipping, a wrong reading order or the wrong spread mode is `DIG_ORIENTATION_BREAKS` (major, A; `11` §2.3). In both cases §15.3's "Handles screen rotation appropriately" and §7.1's "accommodates portrait and landscape orientations" are satisfied without the reader making a layout decision the project did not approve (`03` §10).

### 3.6 The reflow algorithm and its relation to the solver

`paginateDigital` **decides no break positions of its own.** Its job is threefold, in the order of `03` §5.1:

| Step | `paginateDigital` does | Deterministic? |
|---|---|---|
| 1. Input assembly | read the triple; compute the content box for the viewport (§2.1) | yes |
| 2. Measurement pass | call `measure()` (§2) for every block at this viewport | yes |
| 3. Constraint assembly | from `cmp_rev` and the profile: beat order, `page_break_lock` positions, `content_lock` spans, `beat_lock` groups, `keep_together` groups, orphan/widow limits, spacing tolerance | yes |
| 4. Solve | call `solve()` (`07` §7) — a **single-source shortest path (DP) over break positions** | yes |
| 5. Emit | wrap the plan into `cmp_rev.digital` | yes |
| 6. Repeat | fold over the reference viewport set | yes |

**Candidates are deterministic; the plan is the solver's.** The candidate *nodes* — every `(block_index, line_offset)` break position with a measured line box — are a pure function of the measurement. The candidate *edges* — "page holds content from `(b1,l1)` up to but excluding `(b2,l2)`" — exist only when that content fits the box (hard fit; the edge is **absent, never penalised**, when it does not, per `07` §4.2). Which path is taken, and the tie-break (fewer pages → earlier first break → lexicographically smaller spans, `07` §4.2), is the solver's. `paginateDigital` is thus a *thin* assembly+emit shell around `solve()`; this is deliberate, because a second break-decision implementation is the way two plans for the same book drift apart.

The plan's cost terms are `07` §4.3's (`sparse_penalty`, `dense_penalty`, `orphan_penalty`, `widow_penalty`, `beat_split_penalty`, `keep_together_penalty`, `essential_break_penalty`, `preference_break_penalty`, `cliffhanger_penalty`, `template_mismatch_penalty`, `page_count_penalty`), weighted per publication profile (`D-15`). Hard constraints (`content_lock`, `print_page_lock`) never reach the digital solver as costs: `content_lock` is enforced in the proposal path (`D-11`) and merely asserted here (block `text_hash`es must match `ms_rev`), and `print_page_lock` is n/a on a viewport (`07` §3).

### 3.7 A viewport that cannot fit a single block — never clip

§6.10 is absolute: "**The renderer must never clip or hide text to preserve an impossible page layout**." When a block's measured height exceeds the page's available height:

| Behaviour | Detail |
|---|---|
| The plan is still emitted | `03` §5.1 step 5: "if a block cannot fit a page alone, the block overflows to its own page and is **reported** (never truncated)" — the span is never shortened, so nothing is dropped (`COMP_BLOCK_LOST` stays clear). `07` §4.2 gives that block a **single degenerate edge that owns its own page**, so the solver always has a `START → END` path: a fit problem never empties the graph, and `minimalConflict` (`07` §5.2) never returns ∅ for one |
| The page is reported | `DIG_PAGE_OVERFLOW` (critical, A·E·R): "measured content height > available height" (`11` §2.3) |
| **Its render is refused** | `R` = blocks a render: the affected page emits nothing, and approval is blocked (`07` §5.4 rule 2 — a refused render produces no artifact, never a partial one). No output can therefore ever contain a clipped glyph |
| The disclosure is the finding itself | §6.10's "the interface must disclose when a requested composition cannot be reproduced exactly on a particular viewport" is satisfied by the finding surfaced on the page, plus the reader's banner for a page whose render was refused |
| It is **not** classified as density | overflow is a hard fit failure, not a `too_sparse`/`balanced`/`dense` class (`05` §2.4; `T-CMP-052`) |
| `DIG_TEXT_CLIPPED` is the pixel proof | `DIG_PAGE_OVERFLOW` is a plan-level fact; `DIG_TEXT_CLIPPED` (critical) fires only if a rendered glyph box actually crosses the content box, measured on rendered pixels (`11` §3.3) |

The only automatic reliefs are §10.5 rungs 1–4 (§5); reader font scaling is a reader choice, not a fix (`07` §3 policy for soft locks on a phone).

### 3.8 Page numbering and progress for a count that varies by viewport

Because the digital count is viewport-derived it is a **range**, not a number (`D-06`; §3.3 of the spec: "Do not equate reading-page count with printable-page count"). Therefore:

| Surface | Shows |
|---|---|
| Reader "page N of M" | `N`/`M` for the **active viewport's** plan only; `M` is recomputed on reflow (§3.9) |
| Reader progress bar (§7.3) | `page_index / active_plan.page_count`, recomputed per viewport |
| Reader page numbers in the gutter (§7.3 "Optional page numbering") | the active plan's page index, or the `page_number` block's authored value where present (`04` §4.1 `type: page_number`) |
| Dashboard / Publication Center (`D-06`) | the range: `digital 9–18 pages (min 9 at the widest spread `1440×900`; max 18 at the narrowest single page `360×640`) · print 16 pages` — a range is `[min, max]` over the reference viewport set, so its endpoints are **viewport-determined, not positional** (`04` §5.1's `measured_at[]`) |

**Forbidden:** displaying `print.page_count` as the digital page count, or omitting the viewport qualifier (`D-06`). The label must name the reference viewport the number belongs to (`measured_at`, §3.1).

### 3.9 Reader-side runtime reflow contract (distinct from `03` §10)

`03` §10 sets the boundary — "the reader reflows *between* the planned page boundaries, it does not re-plan the book". This section specifies that behaviour, which is a **shipped, tested** property (`T-DIG-026`), not an implementation detail.

```ts
ReaderReflow(plan: DigitalPagePlan, viewport: Viewport, fontScale: number): DisplayPage[]
```

| Rule | Statement |
|---|---|
| Anchors | the plan's **essential breaks** (S2 `page_break_lock`, `essential: true`) and any forced structural boundary are **fixed page starts** the reader may never move |
| Freedom | only *between* two anchors may the reader merge or split display pages, and only within the run it is given |
| Text | never reordered, never altered, never dropped (the reader holds `ms_rev` text by block id) |
| Determinism | output depends only on `(plan, viewport, fontScale)`; two runs are identical |
| Triggers | `fontScale ∈ dsgRev.typography.scale_steps` (`04` §6.1 = `[0.85, 1.0, 1.15, 1.3]`), a viewport outside the reference set, or a rotation (§3.5) |
| Forbidden | re-planning the book · calling the solver · calling the pinned-Chromium measurement bridge · emitting a `cmp_rev` · emitting any `Finding` |
| Guarantee | the reader is a **display transform**, not a second layout authority. The approved pagination is the plan; the reader's output is never written back to the project |

Each declared scale step (§7.3) is exercised offline by Engine F; a step that causes clipping, overflow or an ignored override is `DIG_FONT_SCALING_BREAKS` (major, A), and the reader itself still emits nothing (§3.9). Why distinct from `03` §10: `03` §10 states the *architecture rule* (no client-side layout decisions); this section states the *observable contract* the reader must satisfy — the anchor set, the determinism, and the "no write-back" guarantee — which is what `T-DIG-026` asserts. The reader's anchor model is the mechanism that makes `03` §10 checkable rather than aspirational.

---

## Part B — Fixed print pagination

## 4. Print pagination

### 4.1 Paper and trim presets

| Preset | Sheet `_mm` | Fold | Trim (page) `_mm` | Basis |
|---|---|---|---|---|
| `half_letter` | 215.9 × 279.4 (US Letter, 8.5 × 11 in) | once, long edge | **139.7 × 215.9** | §9.1 "US Letter folded to half-letter"; `04` §5.1; `T-PRT-020` |
| `a5` | 210 × 297 (A4) | once, long edge | **148 × 210** | §9.1 "A4 folded to A5"; `T-PRT-021` |
| custom | supplied | — | `{width_mm, height_mm}` | §9.1 "Custom paper sizes"; `T-PRT-022` |

Q-04 asks whether a third size is in use; the answer affects only this table and imposes no code change (`D-15`). Booklet pages are **portrait** (§9.1); a landscape leaf is out of scope for V1. `D-16` is unaffected — padding to a multiple of four is a page-count operation, not a size operation.

### 4.2 Page boxes, margins, binding allowance, gutter, safe area

All geometry is `_mm`; all type is `_pt`; the one conversion is exact (`1 in = 25.4 mm = 96 px_css`, so `1 mm = 96/25.4 px_css` and `1 pt = 25.4/72 mm`).

```
MediaBox                    = trim_width_mm × trim_height_mm                       (T-PRT-062)
spine side (inner)          = left edge of a recto, right edge of a verso
DECLARED text_box_mm        = the symmetric typographic box (04 §6.1) — this IS the print measure
side_margin_mm              = (trim_width_mm  − text_box_width_mm ) / 2      derived, symmetric
head_foot_margin_mm         = (trim_height_mm − text_box_height_mm) / 2      derived, symmetric
text_box_shift_mm           = (gutter_mm + binding_allowance_mm) / 2         toward the OUTER edge
margin_outer_mm             = side_margin_mm − text_box_shift_mm             (18.35 mm half-letter)
spine_side_inset_mm         = side_margin_mm + text_box_shift_mm             (25.35 mm half-letter)
min_side_text_margin_mm     = min(margin_outer_mm, spine_side_inset_mm)      = min(18.35, 25.35) = 18.35 mm
                              the NEARER text edge to the trim — derived, never authored (09 §1.5 D-3);
                              this is the quantity C2 and the safe-area check bind
content_box (print)         = text_box_mm, SHIFTED text_box_shift_mm toward the outer edge:
                                width           = text_box_width_mm  (UNCHANGED — a shift moves,
                                                  it does not narrow; the measure stays 96.00 mm)
                                fore  text edge = side_margin_mm − text_box_shift_mm   (18.35)
                                spine text edge = side_margin_mm + text_box_shift_mm   (25.35)
                              (the gutter/binding clearances are physical, not typographic -- 10-… §1.3)
border_outer_edge inset     = border.offset_mm, measured inward from the TRIM edge           (04 §6.1)
border_thickness_mm         = border.thickness_pt × (25.4 / 72)                             (04 §6.1)
t_inner_mm                  = border.thickness_inner_pt × (25.4 / 72)   if style = double_rule, else 0
frame_band_inner_mm         = border.offset_mm + border_thickness_mm
                              + (t_inner_mm + border.gap_mm  if style = double_rule)
C1  border.offset_mm ≥ safe_area_mm                                    frame ink outside the unsafe zone
C2  frame_band_inner_mm + border.text_gap_min_mm ≤ min_side_text_margin_mm
                                                                        frame never enters the text box
C4  safe_area_mm + gutter_mm + binding_allowance_mm ≤ spine_side_inset_mm
                                    a FLOOR on the SPINE-side inset — never a position, never a width
```

| Concept | Definition | Source |
|---|---|---|
| inner margin | the spine-side margin; before the shift it equals the symmetric side margin, after it is `side_margin + 3.50 = 25.35 mm` | §9.1 "Fixed inner and outer margins" |
| outer margin | the fore-side margin, `side_margin − 3.50 = 18.35 mm` after the shift | §9.1; `09` §7.4 |
| `binding_allowance_mm` | extra spine-side inset the fold bulge consumes; combined with `gutter_mm` it **displaces** the content box `(gutter + binding)/2` toward the outer edge | §9.1 "Binding allowances"; `04` §6.1 `= 3`; `10-…` §1.3 |
| `gutter_mm` | spine-side clear space between the two facing text boxes across the fold; satisfied by the two facing boxes (`2 × 25.35 = 50.7 mm ≥ 4`) — used by the spread proof and the imposition spread check, not subtracted twice from a single leaf, and never a sheet-level gutter | `04` §6.1 `= 4`; §9.4 face-pairing; `10-…` §1.3, §6.2 |
| print-safe area `safe_area_mm` | no content and no border **ink** may fall closer than this to the trim edge | §9.2 "Remain inside the required print-safe area"; `04` §6.1 `= 6`; §10.4 |

**One C2, not two (reported and reconciled).** `09` §7.4's `C2` and this document's earlier `C2` were two predicates for one requirement. `09`'s added the inner rule, the inter-rule gap and `border.text_gap_min_mm`; this document's was `offset + thickness ≤ min(outer, spine)`, so a `double_rule` design — which is what the reference theme is — could satisfy one and fail the other, and `04` §6.1 lacked the `thickness_inner_pt` / `gap_mm` fields `09`'s could not be evaluated from at all. There is now **one** predicate, the `C2` above, and `09` §7.4's is the same expression; `04` §6.1 now carries the two fields it needs. The requirement is §9.2's "Avoid text and footer collisions".

**Why `C2` takes a `min` and `C4` does not.** `C2` binds the frame against the **nearer** of the two text edges, so it is a `min`. `C4` is not: `gutter_mm` and `binding_allowance_mm` are *spine-side* clearances, so the floor they impose falls on the **spine-side** inset alone — the fore edge is bound by `C1`, `C2` and the safe-area check, never by the gutter. An earlier revision wrote `C4` as `min(margin_outer_mm, spine_side_inset_mm)` while its prose said "a floor on the spine-side inset"; the prose was right and the formula was wrong, and the formula is corrected here. The registered check `PRINT_GUTTER_EXCEEDS_MARGIN` (`11` §2.4) is stated over `min_side_text_margin_mm`; that is the looser of the two readings and `11` should be re-pointed at `spine_side_inset_mm` (reported).

**`PRINT_GUTTER_INSUFFICIENT` is nearly unreachable, and G1 must know it (reported).** With the shift model the spine-side clear space across the fold is `trim − text_box_width + gutter + binding` (here `139.7 − 96 + 4 + 3 = 50.7 mm`), so the check `clear_space < gutter_mm` can only fire when `text_box_width_mm > trim_width_mm + binding_allowance_mm` — `> 142.7 mm` on half-letter, i.e. a text box wider than the sheet's half. It cannot fire for any sane design, which strains this set's `G1` rule ("every code in §2 has ≥ 1 fixture that fires it", `11` §5.1) for that one code. Either `11` registers a firing fixture built from a deliberately over-wide custom paper (`08` §4.1 permits custom sizes), or the code is retired; this document cannot decide it, and `09`/`16` own the fixtures while `11` owns the registry. Recorded here so it is not rediscovered as a missing test.

**Safe-area validator.** With the border frame as the outermost ink, the check is `min_side_text_margin_mm ≥ safe_area_mm` — `min(18.35, 25.35) = 18.35 ≥ 6` ✓ on the reference book — and the border frame's outer edge must sit inside the trim. A breach is `PRINT_SAFE_MARGIN_VIOLATED` (critical, A·E·R) — §9.2's "Remain visible after printing, cutting, or folding" is a physical-closure property and cannot be waived silently (`T-PRT-023`).

**Declaration vs derivation — resolved (the shift model, D-01).** `04` §6.1's `layout.text_box_mm` is the **declared measure**: the design declares a *symmetric* box, and the margins are derived from it (`margin_axis_mm = (trim_axis_mm − text_box_axis_mm) / 2`). The print content box is that box **displaced** `(gutter_mm + binding_allowance_mm)/2` toward the outer edge — the *measure does not change* (half-letter `96.00 mm`); only the position does (fore text edge `18.35 mm`, spine text edge `25.35 mm`). This is the model `09` §7.4 implements, and it keeps the print measure equal to the `96/139.7` text-box ratio the digital path already uses (`04` §6.1 `text_box_ratio`, the exact rational — `§9.2`/`§9.6`). The perimeter frame is positioned from the **trim** edge, so it lives in the margin and never consumes text height; `C1` and `C2` above are the only interaction between frame and text. Earlier drafts of this document derived the content box by *removing* `gutter + binding` from the spine side, giving an asymmetric `89.00 × 148.00 mm` box; that narrowed the measure by **7.9 %** and is superseded here, in `03` §5.2 step 3, and in `10` §6.5. The `13.00 mm` figure (`safe_area_mm + gutter_mm + binding_allowance_mm`) is constraint **C4 — a floor the *spine-side* inset must host (`13.00 ≤ 25.35`) — never a position and never a width.**

### 4.3 The border inset interaction (`04` §6.1 `layout.border`)

The perimeter frame is **not** a per-block or per-template property — it is one geometry from the design revision (`04` §6.2 invariant; §9.2 "Page templates may vary internally, but the perimeter frame must remain visually consistent"). Consequences the print plan enforces:

| Requirement | Mechanism | Code |
|---|---|---|
| Identical geometry on every page | computed once from `dsg_rev.layout.border`; `renderPages()` writes the same `@page` frame for every page (`T-PRT-033`) | `PRINT_BORDER_INCONSISTENT` (major, A) if any page's frame differs — measured on the **rendered, cropped** page, not on the token set (`11` §3.4) |
| No text/footer collision | `C2` places the frame's inner edge in the margin, strictly outside the declared text box, so text is inside the frame by construction (§9.2 "Avoid text and footer collisions") | `PRINT_PAGE_OVERFLOW` if a measured height exceeds the content box regardless |
| Inside the safe area | §4.2's safe-area check | `PRINT_BORDER_OUTSIDE_SAFE_AREA` (critical, A·E·R) |
| Survives fold/trim | the frame is inside the safe area, so cutting tolerance cannot remove it (§9.2) | `PRINT_BORDER_TRIM_DRIFT` (critical, A·E·R) — the check runs on the **post-trim** raster (`11` §3.4) |

The frame costs the text **nothing**, but its band is the band of a **`double_rule`** — which is the reference theme's style (`04` §6.1, `16` §1.1). It runs `8.000 … 10.0292 mm` from the trim edge inward:

```
outer rule   8.0000 →  8.2646 mm      border.offset_mm 8; 0.75 pt × 25.4/72 = 0.2646 mm
gap          8.2646 →  9.7646 mm      border.gap_mm 1.5
inner rule   9.7646 → 10.0292 mm      border.thickness_inner_pt 0.75 pt = 0.2646 mm
band         8.000 … 10.0292 mm       ≥ safe_area_mm 6 ✓  (2.00 mm of C1 slack: offset_mm 8.000 − safe_area_mm 6.000)
gap to text   18.35 − 10.0292 = 8.3208 → 8.32 mm   (shifted fore-edge text edge)
              21.85 − 10.0292 = 11.8208 → 11.82 mm (declared symmetric margin line)
C2            8 + 0.2646 + 0.2646 + 1.5 + 3 = 13.0292 ≤ min(18.35, 25.35) = 18.35 ✓
```

An earlier revision of this paragraph gave the band as `8.000 … 8.2646 mm` with a `10.085 mm` clearance — the arithmetic of a **`single_rule`** frame applied to a `double_rule` theme. (A still earlier draft wrote `8.75 mm` with `13.10 mm` — that added `0.75 pt` as though it were `0.75 mm`.) The corrected band is `8.000 … 10.0292 mm` and the clearance to text is `8.32 mm`; `16` §4.2, `09` §7.4 (whose `C2` is now evaluable from the `thickness_inner_pt` / `gap_mm` fields `04` §6.1 carries) and `10` §6.3/§6.5/§6.6/§7 now carry the same corrected figures. A design that pushes the frame inward past the margin is not silently accepted — `C2` fails and `PRINT_BORDER_TEXT_COLLISION` fires.

### 4.4 Measurement against the paper content box

`paginatePrint` calls the **same** `measure()` (§2), with the container sized to the paper content box: `content_width_mm × 96/25.4` and `content_height_mm × 96/25.4`. Everything else about the bridge — identical geometry, `getClientRects()`, 1/64 `_px_css` quantisation, font settling, caching — is unchanged (`03` §5.2 step 3 "Same measurement bridge"; `T-DIG-005` covers both targets). The design revision's `print` token set is read, never the digital set (§8.1; `04` §1).

### 4.5 Front/back-matter-first rule

§9.4 "Blank pages must be inserted deliberately" and `03` §5.2 step 2 require the fixed pages to be resolved in a fixed order so story numbering is stable:

```
page index 1 … f        front matter  (title, copyright, dedication, contents, …)   placed first, each frozen
page index f+1 … f+s    story pages   (solved by paginatePrint over ms_rev in beat order)
page index f+s+1 … f+s+b back matter   (memory verse, discussion, about, closing, deliberate blanks)  placed last
```

| Rule | Consequence |
|---|---|
| Front and back matter are **placed**, not solved — they are fully assigned pages with `frozen: true` | `T-PRT-024` |
| Story spans are solved **after** matter, over the remaining indices | story content never re-solves when only **back** matter changes |
| A **front**-matter change shifts all story indices as a block and is reported (`05` §2.7 "Front matter → print pages 1..k and the total page-count parity check") | story *content* assignment is unchanged; only the index base moves |
| A **back**-matter change never shifts story indices | back matter is strictly after the story |
| A **front**-matter change shifts story parity with it | story page `k_f+1` is a verso iff `k_f` is odd. Any reveal pinned to an even page (`05` §2.5's parity rule) must therefore be re-checked when the front matter changes — the pin is on the **print page index**, and the front-matter count is part of the plan |
| Every deliberate blank is a `kind: blank` page carrying `blank_intentional.reason` | else `COMP_BLANK_UNINTENDED` (major); `05` Part 3 #8 |

### 4.6 Padding to a multiple of four, restricted to front/back matter (D-16)

Saddle-stitch requires `page_count % 4 == 0` (`04` §5.1 invariant; §9.4; `05` Part 3 #6; `T-PRT-026`).

```
pad = (4 − (N mod 4)) mod 4          N = f + s + b
insert pad blank pages, in this preference order:
  1. at the back-matter boundary (after the last back-matter page)
  2. else at the front-matter/STORY boundary (after the last front-matter page, before the first
     story page) — never at index 1: a pad at index 1 lands on the booklet's FRONT COVER
     (sheet 1 front-right, 10-… §3.2) and contradicts §4.5's front-matter-first rule (10-… §2.3)
  never mid-story
```

| Rule | Code | Severity · blocking |
|---|---|---|
| Padding only at front/back matter | `COMP_IMPOSITION_PADDED_MIDSTORY` if a pad would land among story pages | major · non-blocking |
| The count is a multiple of four | `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | critical · blocking |
| Each pad is a deliberate, reasoned blank | `COMP_BLANK_UNINTENDED` | major · non-blocking |
| The manuscript is short (padding large) | `CONTENT_LENGTH_UNDER_TARGET` for the author (`D-16` (b)); text is **never** expanded to fill pages | **major** · non-blocking |

Severities in the table above are `11` §2.4's, because **`11-validation-strategy.md` owns the finding-code registry and its severities** (`00` §3.2, `11` §1.2). `CONTENT_LENGTH_UNDER_TARGET` is registered there as **major** with blocking flag `none` (non-blocking) — an earlier revision of this document said `minor`, which was wrong and is corrected here rather than in `11`.

`D-16` is binding: **mid-story padding is never permitted**, and prose is never expanded to fill pages (§1.3 "Content quality takes precedence over arbitrary word counts"). The page target now **governs**: `target_print_pages` is the constraint and `target_words` is derived from it at blueprint time (D-16 as amended, `05` §1.6) — so where the word budget and the page target disagree, the page target wins, and a plan that still misses it **after** the pad-to-four step raises `PRINT_PAGE_COUNT_OFF_TARGET` (major, A; `11` §2.4). The rule below is unchanged: the miss is reported, never repaired by padding mid-story.

### 4.7 The freeze / re-open rule (D-05)

| Phase | Behaviour |
|---|---|
| Before approval | print pagination is recomputed freely on any change to the triple (`05` §2.1) |
| At approval | the `PrintPagePlan` is **frozen** and recorded in `Approval.frozen.print_pages` (`04` §7.3; `T-PRT-027`) |
| After approval, a frozen page would overflow | **no reflow, no overwrite.** `PRINT_FROZEN_OVERFLOW` (critical, **blocking**); `project.stage → composition_stale` (`T-PRT-028`) |
| Render of a frozen-violating page | **refused**; nothing is emitted (`T-PRT-030`; `07` §5.4 rule 2) |
| Resolution | the author clicks `Re-open pagination`; this creates a **new** `cmp_rev` (an `act_` of kind `reopen_pagination`, `04` §5.4); the approved revision remains in history forever (`T-PRT-029`) |
| Frozen-page soft-lock conflict | `COMP_FROZEN_LOCK_CONFLICT` (critical, blocking), per `07` §3/§5.3 |
| A frozen page's assignment changed by any path other than `Re-open pagination` | `COMP_FROZEN_PAGE_REFLOWED` (critical, A·E·R) — the guard that makes `D-05` enforceable rather than merely intended |

The frozen plan is a **subset of constraints** fed back into `solve()` as `print_page_lock` hard constraints (`07` §4.4): edges that would move a locked block off its page, or place unlocked content onto it, are removed from the graph. If the remaining graph has no `START → END` path, the solve fails with `COMP_LOCK_CONFLICT_HARD`.

---

## 5. Fit-failure handling — the §10.5 ladder

§10.5's order is mandatory ("**The order should be**", made "must" per `00` §4.4). Rungs 1–4 and 8 are automatic; 5 is automatic detection with human resolution; 6–7 require an **approval** and are never automatic (`02` §4.1–§4.2, §9).

| Rung | §10.5 step | Action | Automatic? | Applies to | Failure code | Severity · blocking |
|---|---|---|---|---|---|---|
| 1 | 1 — fix layout geometry | recompute the content box from `dsg_rev` (margins, border inset, exact mm→px_css); re-assert the measurement container equals the render box | **yes** | both | `PRINT_SAFE_MARGIN_VIOLATED` · `PRINT_BORDER_OUTSIDE_SAFE_AREA` · `PRINT_BORDER_TEXT_COLLISION` (critical, A·E·R) · `COMP_SPACING_OUT_OF_BOUNDS` (major, none) | critical · A·E·R |
| 2 | 2 — recalculate pagination | re-run `solve()` on the reassembled constraints | **yes** | both | *(none on success)* | — |
| 3 | 3 — reflow unlocked text | move / split / merge blocks between pages, honouring H1/H2 | **yes** | both | `LOCK_UNSATISFIED` if a soft lock is passed | major · blocking iff S2 ∧ print |
| 4 | 4 — adjust spacing within approved limits | tighten/loosen leading inside the design's spacing tolerance band | **yes** (content-neutral, `05` §2.4) | both | `COMP_SPACING_OUT_OF_BOUNDS` if the band is exceeded | major · non-blocking |
| 5 | 5 — flag composition conflicts | detect an unsatisfiable set; present the minimal conflicting set (`07` §5.2) | auto-detect, **human resolves** | both | `COMP_LOCK_CONFLICT_HARD` · `COMP_FROZEN_LOCK_CONFLICT` | critical · **blocking** (no plan / render refused) |
| 5′ | 5 — an essential break cannot be honoured | report | auto | digital | `BREAK_UNSATISFIED` | major · **non-blocking** (`07` §3; §6.10 "preserved where feasible") |
| 5″ | 5 — an essential break cannot be honoured | report | auto | print | `BREAK_UNSATISFIED` | major · **blocking for approval** (§15.2; `07` §5.3) |
| 5‴ | 5 — a droppable preference break is passed | record | auto | both | `BREAK_DROPPED_PREFERENCE` | info · non-blocking |
| 6 | 6 — propose localized editorial revision | emit a `Proposal` to the Content Engine (expand/condense); the user applies it | **requires approval** (`D-11`; §6.7) | both | the naming `CONTENT_*` finding (e.g. `CONTENT_LENGTH_OVER_TARGET`) stays unresolved | **as that code's row in `11` §2.1 states it** — the registry owns severity and blocking, and this document does not restate them. `CONTENT_LENGTH_OVER_TARGET` is `minor · none` (non-blocking); an earlier revision of this cell claimed every rung-6 `CONTENT_*` finding "blocks approval while unresolved", which was not the registry's rule |
| 7 | 7 — obtain approval for content changes | user only; no code path from an AI response to a mutation | **user** | both | — | — |
| 8 | 8 — rerun all relevant validations | targeted revalidation of affected pages (`12.5`, `05` §2.7) | **yes** | both | *(re-asserts rung-5 codes)* | — |

Two scope-dependent divergences, both from `07` §3:

- **Digital** may stop at rung 5′ and *disclose* — a phone legitimately reflows and the break merges (§6.10 "a small mobile display may not have sufficient space"; "the interface must disclose"). Refusing to render a phone edition is the wrong product decision.
- **Frozen print** may not run rungs 1–4 at all for a frozen page — the physical object may already exist (`D-05`). It jumps straight to rung 5 with `COMP_FROZEN_LOCK_CONFLICT` / `PRINT_FROZEN_OVERFLOW` and refuses the render.

§10.5's closing rule — "A publication cannot receive a final approved status while unresolved critical rendering problems remain" — is enforced by the `blocking` derivation (`04` §7.2): any critical finding drives `project.stage → blocked` (`02` §3.4, T-22), and approval/export are refused (`§15.5`).

---

## 6. Over/under-filled page reporting

Every page of both plans carries a fit report (`03` §5.2 step 6; `T-PRT-031`). It is the unit of disclosure for density (§6.7), fit (§9.3) and locks (`07` §3).

```ts
interface PageFitReport {
  page_id:          string;                 // pg_
  scope:            'digital' | 'print';
  target:           Target;                 // the viewport or paper it was measured at
  available_height_q: number;               // 1/64 px_css — the content box height
  measured_height_q:  number;               // Σ placed line-box heights + extra_p (07 §4.1)
  used_lines:         number;               // integer line boxes placed
  available_lines:    number;               // floor(available_height_q / line_height_q) (07 §4.1)
  slack_q:            number;               // available_height_q − measured_height_q (≥ 0 unless overflow)
  used_capacity:      { n: number; d: number };   // EXACT rational measured/available — never a float
  fill_ratio:         { n: number; d: number };   // EXACT rational for §6.7 classification
  classification:     'too_sparse' | 'balanced' | 'dense' | 'overflowing';   // 05 §2.4, §6.7
  violations:         Violation[];          // { lock_id?, code, magnitude_lines?, break_position? }
}
```

### 6.1 Exact-rational classification (no floats) — the one density definition

**There is exactly one density definition, and its thresholds are the *resolved* band.** It is **height-based**, expressed as an exact rational in `q` (1/64 `_px_css`), so no float comparison is ever made (`05` §2.4 `fill_ratio = measured_height / available_height`; `04` §6.1 `resolved_density_band`):

```
fill_ratio = measured_height_q / available_height_q      (a DERIVED ratio — never compared as a float)

sparse  ⇔  measured_height_q × 10000 <  sparse_below × 10000 × available_height_q     [3500 here]
dense   ⇔  measured_height_q × 10000 >  dense_above  × 10000 × available_height_q     [7800 here]
otherwise balanced
overflow ⇔  measured_height_q  >  available_height_q     (a hard fit failure, NOT a class — 05 §2.4)
```

The thresholds are the cross-multiplied forms of `fill_ratio < sparse_below` and `fill_ratio > dense_above` (`3500 × available = 0.35 × 10000 × available`; `7800 × available = 0.78 × 10000 × available`), so the comparison is exact integer arithmetic over the same quantity. This is what makes `T-CMP-051` decidable: `0.78` is Balanced, `0.781` is Dense, `1.0` is Dense, `>1.0` is Overflow.

**Which band, and why it is one number.** `sparse_below` / `dense_above` are `04` §6.1's **`resolved_density_band`** — the theme's band and the project profile's band resolved against the `§6.7` defaults by `09` §4.3 — and **every consumer reads it**: this classifier, the solver's cost terms (`07` §4.3), `05` §2.4's worked check, and the `14` tests. The reference book resolves to **`0.35 / 0.78`** (theme `warm_parchment` `0.33`/`0.80`, profile `childrens_bible` / `early` `0.33`/`0.78`, defaults `0.35`/`0.88`). Three different numbers are in play and only one is this book's ceiling:

| Value | What it is | May a classifier use it? |
|---|---|---|
| `0.33` / `0.80` | the theme token `density_band`, projected into `layout.density_tolerance` (`04` §6.1) | no — `09` §1.5 D-1 makes it a projection, not the resolved band |
| `0.35` / `0.88` | the `§6.7` default token (`04` §6.1's old projection, `05` §2.4's initial values) | **no** — it is the outer *bound* the resolution narrows within |
| **`0.35` / `0.78`** | **`resolved_density_band`** — theme ∩ profile ∩ default, by `09` §4.3 | **yes — this one, and only this one** |

An earlier revision of this section hard-coded `8800`, i.e. the default, while `09` §4.3 resolved the reference book to `0.78`: the two documents then classified the same page differently, which is exactly the class of defect that makes a correct word budget fail its own solver (`REVIEW-RECONCILIATION` §8.2). The literals are written as `round(resolved_density_band.<threshold> × 10 000)` and are recomputed, never inherited.

**The former line-count form is deleted.** An earlier revision defined sparse/dense over `used_lines` (`used_lines × 10000 > 8800 × available_lines`). It is **not** equivalent to the height form, and this document's own worked example shows why: §9.4's page is `18 / 20 = 0.90` by lines and `31104 / 35800 = 0.8688` by height. At this book's resolved ceiling the two now *agree* on the class — both read **dense** (`311,040,000 > 279,240,000`) — but they agree for different reasons and would disagree again the moment the page's `extra_p` were non-zero or the ceiling were `0.88` (under which the line rule says dense and the height rule says balanced). Because the sparse/dense penalties feed the DP (`07` §4.3), the two definitions produce different plans; **the height form is authoritative**, and §9.4 is classified by it.

### 6.2 Surfacing to validation

| Report field | Feeds | Finding |
|---|---|---|
| `measured_height_q > available_height_q` | invariant 9 (`05` Part 3) | `DIG_PAGE_OVERFLOW` / `PRINT_PAGE_OVERFLOW` — critical · A·E·R (blocks the render; `04` §7.2 uses `PRINT_PAGE_OVERFLOW`) |
| `classification = too_sparse` or `dense` on a page that is not intentionally sparse (`opening`/`reflective`/`reveal`) | §6.7 | `COMP_DENSITY_OUT_OF_BAND` — minor · non-blocking |
| a density class derived from word/char count rather than measurement | §6.7 | `COMP_DENSITY_WITHOUT_MEASUREMENT` — major · A |
| `used_lines` ends/opens a block below the profile's `orphans`/`widows` | `07` §4.3 | `COMP_ORPHAN_WIDOW_VIOLATION` — minor · non-blocking |
| `violations[]` non-empty | invariant 11 (`05` Part 3) | `LOCK_UNSATISFIED` / `BREAK_UNSATISFIED` — per §5 |
| a rendered page crossing the box | invariant 10, re-derived from pixels (`14-test-plan` §6, `T-CMP-039`) | `DIG_TEXT_CLIPPED` / `PRINT_TEXT_CLIPPED` — critical · blocking |

The plans are **not** the only report surface: `T-CMP-039` re-derives no-clipping from rendered pixels, so a plan-level green with no render-level counterpart is a gap, not a pass (`14-test-plan` §2). The dashboard shows `used_capacity` per page; the Publication Center shows the aggregate sparse/dense distribution.

---

## 7. Determinism and reproducibility

### 7.1 What makes an output byte-identical

An output is byte-identical iff **every** component of this tuple is fixed (`D-04`, `D-10`, `D-14`; `T-OPS-030`/`031`, `T-PRT-065`):

| Component | Pinned by | Where recorded |
|---|---|---|
| revision triple `(ms_rev, cmp_rev, dsg_rev)` | content-addressed (`04` §1.1, `D-10`) | pointer values |
| target `(viewport | paper)` + orientation | this document §3.1 / §4.1 | `measured_at[]` / `print.paper` |
| engine version | release pin (`D-14`) | manifest |
| **Chromium build id** | `D-01` pinned Playwright Chromium | manifest |
| font files (`fonts_hash`) | `fonts/registry.json` `metrics_hash` (`D-09`) | manifest |
| theme token hash | `dsg_rev` token set | manifest |
| `lang` / hyphenation dictionary (`hyphenation_hash`) | part of `dsg_rev` (`D-04`, `17` Part C) | manifest |
| **DPR** | pinned to 1 for all measurement (§3.4) | manifest |
| imposition spec version | `imposition/spec.json` (`04` §8) | manifest |
| code path | no network, no AI in layout (`D-04`, `T-ARC-028`) | static import guard |
| serialisation | canonical JSON, sorted keys, explicit unit suffixes (`04` §1) | — |
| arithmetic | integer 1/64-px quantisation, integer weights (`07` §4.5) | — |

### 7.2 What breaks it, and how each is pinned or asserted

| Breaker | Effect | Pin / assertion | Code |
|---|---|---|---|
| **Font substitution** — a requested family is absent, Chromium silently falls back | different metrics → different line count → different pages | pre-read `metrics_hash` guard (§2.6); PDF embedding asserted (D-09; `T-PRT-063`) | `OPS_MEASUREMENT_STALE` · `PRINT_FONT_NOT_EMBEDDABLE` |
| Font files replaced under the same family name | same as above, undetected by name | `metrics_hash` in `fonts/registry.json` and in the manifest | `OPS_MEASUREMENT_STALE` |
| **Chromium version change** | line-breaking, hyphenation, sub-pixel rounding differ | pinned build id in the manifest; drift is a **failure, not a rebaseline** (`14-test-plan` §7) | `OPS_APPROVAL_ENVIRONMENT_MISMATCH` (critical, E) |
| **Locale / hyphenation dictionary change** | hyphenation points move → line breaks move | `lang`/`hyphenation` in `dsg_rev`; `hyphenation_hash` in the key; `T-ARC-006`, `T-DIG-009` | `OPS_APPROVAL_ENVIRONMENT_MISMATCH` |
| **Non-deterministic page numbering** (a parallel operation orders output) | two runs differ in page numbers | renderer never parallelises output feeding a page number (`03` §9) | `OPS_CONCURRENCY_ORDER_VIOLATION` (critical, A·E·R) |
| **DPR change** | would change raster, not layout | DPR pinned to 1 for measurement; excluded from the plan tuple (§3.4) | — |
| **System text scaling / `text-size-adjust` / mobile text autosizing** | font size scales → metrics change | measurement document sets `-webkit-text-size-adjust:100%`, `text-size-adjust:100%`, `font-size-adjust:none`; viewport meta fixed; asserted by `T-DIG-005` | *(no code — the assertion aborts the pass, §2.6)* |
| Browser zoom / forced-colors / reduced-contrast | affects raster, not the plan | reader-facing only; not in the plan tuple | — |
| Text normalisation drift | an edit that only changes whitespace must not change geometry | NFC + collapsed whitespace + trim (`04` §4.2) | — |

### 7.3 Environment manifest (`D-14`) and the drift policy

Every artifact carries the manifest (`04` §7.4): engine version, **Chromium build id**, font file hashes, theme token hash, imposition spec version, revision triple (`T-PRT-066`). An artifact whose manifest cannot be reproduced on the recorded environment is reported **`unreproducible`, not valid** — `OPS_ARTIFACT_UNREPRODUCIBLE` (major, A; `T-PRT-068`; `D-14`); a manifest missing a D-14 field is `OPS_MANIFEST_INCOMPLETE` (critical, A·E); an export whose environment differs is refused with `OPS_APPROVAL_ENVIRONMENT_MISMATCH` (critical, E) and `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (critical; `04` §10, `T-OPS-015`).

The determinism suite **fails loudly** on any drift — a new Chromium build, a changed font file, or a changed hyphenation/ICU data set is a *failure to investigate*, never a rebaseline (`14-test-plan` §7; `T-OPS-033`/`034`). Deleted `.cache/` reproduces identical hashes and bytes (`T-OPS-035`).

---

## 8. Performance budgets

Targets, not guarantees; they are **assumptions** calibrated by the Phase-1 benchmark (`13-incremental-roadmap.md` P1). Reference workload: the David & Goliath fixture — the **current** parameter set is 9 story pages / `1106 _words_` derived (140 balanced lines at the resolved `0.78` ceiling, less a 4-line reserve), landing on `M = 16` (`16` §1.2.1); the **pre-amendment** set (~1400 `_words_`, `M = 20` at the shift model) is kept only as §9.5's superseded arithmetic — 11 `beat_`, ~120 `blk_`, 5 digital reference viewports + 1 print plan (`14-test-plan` §4.3).

| Stage | Cold (empty `.cache/`) | Warm (all hits) | Basis |
|---|---|---|---|
| Measurement — digital (5 viewports × ~120 blocks) | ≤ 400 ms | ≤ 20 ms | one batched read pass per viewport; per-block entries cached (§2.5) |
| Measurement — print (1 paper, ~120 blocks) | ≤ 150 ms | ≤ 15 ms | same bridge (§4.4) |
| Solve — per plan | ≤ 5 ms | ≤ 5 ms | `07` §4.2: DP over ≤ 400 nodes × ≤ 200 lines is sub-ms; the solver is never the bottleneck |
| Solve — all 6 plans | ≤ 10 ms | ≤ 10 ms | idem |
| Render — HTML storybook (`renderStorybook`) | ≤ 300 ms | ≤ 300 ms | static, no build step (`D-19`; `03` §5.3) |
| Render — print page documents | ≤ 2 s per page (`R-PRT-101`) | ≤ 2 s per page | 2 browsers × 4 contexts, one page each (`03` §9) |
| PDF assembly (reading + booklet) | ≤ 1 s; 16-page reading PDF ≤ 30 s (`R-PRT-101`) | ≤ 1 s | deterministic order, single-threaded (`03` §9) |
| Reader time-to-interactive (local files, mid-range mobile) | ≤ 2 s (`R-DIG-101`) | ≤ 2 s | static, no build step (`D-19`; `03` §5.3) |
| **Whole pipeline, 16-page book** | **≤ 12 s** | **≤ 2 s** | sum, minus concurrency; within `R-PRT-101` |

Rules that keep the budget honest: no measurement is ever taken twice for the same key (§2.5); the solver is never re-run when its input hash is unchanged; the renderer never parallelises anything whose output ordering feeds a page number (`03` §9).

### 8.1 Incremental strategy for a one-paragraph change

A one-paragraph edit changes exactly one block's `text_hash` (`05` §1.3 — block ids are stable), so the whole `ms_rev` hash moves but the *geometry* of every other block is unchanged.

| Work | Re-run? | Detail |
|---|---|---|
| Re-measure | **only the edited block** | its tier-2 entry misses; every unchanged block hits (§2.5; `T-DIG-008`) |
| Re-solve | **only the affected suffix** | if the edited block's occupied line count is **unchanged**, the plan is byte-identical and the `cmp_rev` hash does not move — **no invalidation at all** (`02` §6.1). If the line count changed, re-solve from the last break position at or before the edited block; the DP's edges run forward only, so the prefix cannot be affected (`07` §4.2). The suffix re-solve re-applies the same tie-break (fewer pages → earlier break → lexicographic) and must equal a full solve, asserted by a property test against `T-OPS-030`'s plan hash (the assertion is internal and emits no finding code) |
| Re-render | **only the affected pages** | the affected page document(s) are rebuilt; unchanged page rasters are reused from `.cache/`. The **artifact is whole-or-nothing** — no partial export (`03` §10) — but the *work* is incremental |
| Re-validate | that block's page(s), digital + print | targeted revalidation (`12.5`; `05` §2.7) |
| Invalidate approvals | only the bound scopes | `apr_ → stale` with `stale_reason` naming the moved pointer (`04` §7.3) |

The load-bearing optimisation is the "unchanged occupancy ⇒ no invalidation" property (`02` §6.1). It is why typing a typo fix into one paragraph can cost nothing beyond one measurement.

---

## 9. Worked numeric example — a half-letter booklet at the shift model (§14's sixteen-page target)

Every number below is derived from the stated assumptions; assumptions are marked **[A]** (illustrative, not pinned by a contract) versus **[contract]** (pinned by a cited section). The geometry is the **shift model** (§4.2; `09` §7.4): the declared `96.00 × 148.00 mm` text box **is** the print measure, and the box is displaced `3.50 mm` toward the outer edge. Recomputing the **pre-amendment** fixture (~1400 `_words_`) at the shift model — the measure moves from the superseded `89.00 mm` to `96.00 mm`, a **7.9 % wider** line — changes the words-per-page and the story page count; both are shown in §9.5, and the re-parameterised fixture's own arithmetic (derived `1106 _words_` = 140 balanced lines at the resolved `0.78` ceiling, less a 4-line reserve → `M = 16`, no padding) is in §9.5 and `16` §1.2.1.

### 9.1 Paper, trim, margins

| Quantity | Value | Source |
|---|---|---|
| Sheet (US Letter) | 215.9 × 279.4 `_mm` | **[contract]** §9.1; `T-PRT-020` |
| Trim (half-letter, one fold) | **139.7 × 215.9 `_mm`** | **[contract]** §9.1; `04` §5.1 |
| side margin (symmetric, before the shift) | **21.85** | **derived** = (139.7 − 96)/2 from the declared `text_box_mm` (`04` §6.1) |
| head = foot margin | **33.95** | **derived** = (215.9 − 148)/2 from the declared `text_box_mm` |
| `gutter_mm` | 4 | **[contract]** `04` §6.1 default |
| `binding_allowance_mm` | 3 | **[contract]** `04` §6.1 default |
| `safe_area_mm` | 6 | **[contract]** `04` §6.1 default |
| `border.style` | `double_rule` | **[contract]** `04` §6.1 — the reference theme is a **double** rule |
| `border.offset_mm` | 8 | **[contract]** `04` §6.1 default |
| `border.thickness_pt` (outer) | 0.75 | **[contract]** `04` §6.1 default |
| `border.thickness_inner_pt` | 0.75 | **[contract]** `09` §7.1; `double_rule` only |
| `border.gap_mm` | 1.5 | **[contract]** `09` §7.1; `double_rule` only |
| `border.text_gap_min_mm` | 3 | **[contract]** `09` §7.1 — the `C2` clearance |

### 9.2 Page boxes and the resulting content box (shift model)

```
side_margin_mm        = (139.7 − 96)/2               = 21.85  mm   DERIVED from text_box_mm (04 §6.1)
head_foot_margin_mm   = (215.9 − 148)/2              = 33.95  mm   DERIVED (symmetric)
text_box_shift_mm     = (4 + 3)/2                    =  3.50  mm   = (gutter + binding)/2, toward the OUTER edge
fore  text edge       = 21.85 − 3.50                 = 18.35  mm   from the trim (a POSITION)
spine text edge       = 21.85 + 3.50                 = 25.35  mm   from the trim (a POSITION)
C4 floor (spine inset)= 6 + 4 + 3                    = 13.00  mm   ≤ 25.35 ✓  (a FLOOR on the SPINE side only)
border_thickness_mm   = 0.75 × (25.4/72)             = 0.2646 mm   (outer rule)
t_inner_mm            = 0.75 × (25.4/72)             = 0.2646 mm   (inner rule; double_rule only)
border band           = 8.000 … 8 + 0.2646 + 1.5 + 0.2646 = 8.000 … 10.0292 mm from trim
                        C1  8 ≥ 6 ✓
                        C2  10.0292 + 3 = 13.0292 ≤ min(18.35, 25.35) = 18.35 ✓

declared text box     = 96.00 × 148.00 mm   (the typographic frame, symmetric — this IS the measure)
print content box     = 96.00 × 148.00 mm   (SHIFTED 3.50 mm outward; width UNCHANGED — a shift moves, never narrows)

content_box_width_px  = 96.00 × 96/25.4              = 362.83 px_css   (= 23221/64; 09 §7.4)
content_box_height_px = 148.00 × 96/25.4             = 559.37 px_css   (= 35800/64)
available_height_q    = round(559.37 × 64)           = 35800 q
```

**One box, one measure.** The content box is the declared `96 × 148 mm` box **displaced** `3.50 mm` toward the outer edge; the measure stays `96.00 mm`, which is what keeps the print line equal to the `96/139.7` text-box ratio the digital path uses (`04` §6.1 `text_box_ratio`, the **exact rational** `96/139.7` — never the 4-decimal `0.6872`, which yields `23222 q` where the geometry yields `23221 q`; `09` §7.4 reports the same box). The `13.00 mm` spine figure is constraint **C4's floor**, not the spine text edge — the edge is `25.35 mm`. The superseded model *removed* `gutter + binding` from the spine side, giving an asymmetric `89.00 × 148.00 mm` box and a `336.38 px_css` measure; that is gone, and `03` §5.2 step 3 agrees.

Safe-area check: `C1` border outer edge `8 ≥ 6` ✓; `C2` inner edge + `text_gap_min_mm` = `10.0292 + 3 = 13.0292 ≤ min(18.35 fore, 25.35 spine) = 18.35` ✓; `C4` `13.00 ≤ 25.35` (the spine-side inset) ✓. The frame band is `8.000 … 10.0292 mm` because the reference theme is `double_rule` (§4.3).

### 9.3 Lines per page

Body type `13.5 pt`, `line_height 1.5` → leading `20.25 pt` **contract** `04` §6.1 `typography.body` (the pair is exact: `20.25 pt × 4/3 = 27 px_css`).

```
leading_mm      = 20.25 × (25.4/72)          = 7.1437 mm
leading_px_css  = 20.25 × (96/72)            = 27.00 px_css  (exact — 1 pt = 4/3 px_css)
line_height_q   = 27 × 64                    = 1728 q
available_lines = floor(559.37 / 27)         = floor(20.72) = 20 lines        (07 §4.1 capacity C_p)
```

20 usable lines; `20 × 1728 = 34560 q ≤ 35800 q`, and `21 × 1728 = 36288 q > 35800 q`, so **20 is exact**.

### 9.4 Block-to-page assignment arithmetic (print page index 5, the first story page; `f = 4` front-matter pages precede it)

Assume the solver places three blocks on this page **[A]**:

| Block | Lines | Height `q` |
|---|---|---|
| `blk_head` (heading) | 2 | 3456 |
| `blk_body1` (paragraph) | 9 | 15552 |
| `blk_body2` (paragraph) | 7 | 12096 |
| **used** | **18** | **31104** |

```
measured_height_q = 31104
slack_q           = 35800 − 31104 = 4696 q   (= 73.4 px_css ≈ 19.4 mm)
slack_lines       = floor(4696 / 1728) = 2 lines   (+ 1240 q unusable remainder < one line)
used_capacity     = 31104 / 35800 = 0.8688  (exact rational 31104/35800)
```

Classification (`§6.1`, exact integer cross-multiplication):

```
sparse?  31104 × 10000 = 311,040,000  vs  3500 × 35800 = 125,300,000    → NOT sparse
dense?   31104 × 10000 = 311,040,000  vs  7800 × 35800 = 279,240,000    → DENSE
⇒ 'dense'             (05 §2.4, §6.1) — 0.8688 exceeds this book's resolved 0.78 ceiling by 0.0888,
                        0.88 would have called it balanced: the resolved band is what decides
```

**Classified `dense`, and what that means for the plan.** A page at 18 of 20 lines is *inside* the box and *outside* the band, so it is a `dense` page, not an overflow: the DP pays `dense_penalty` 30 for it (`07` §4.3) and `16` A-12's fit report shows `used_capacity 0.8688` with `classification: dense`. That is the class `COMP_DENSITY_OUT_OF_BAND` (`08` §6.2) reports when the page is not intentionally sparse, and it is why the fixture's *budget* is derived at 16 lines and not at 20 (`05` §1.6 item 1) — a book written to fill pages like this one would make the solver leave the target. The ladder itself is unchanged: `blk_body3` needs 7 lines, so the page would hold 25 lines `= 25 × 1728 = 43200 q > 35800 q`. Per `07` §4.2 the edge `… → end-of-blk_body3` **does not exist**, so the solver must choose:

- **rung 4 (tighten spacing) is unavailable here**, and this is the interesting case. Fitting 25 lines requires `line_height_q ≤ floor(35800/25) = 1432 q`, i.e. leading `≤ 1432/64 = 22.375 px_css = 16.78 pt` — a **17 % reduction** from 20.25 pt. The design's `spacing_tolerance` is ±6 % (`04` §6.1), so the required squeeze is outside the band: attempting it would raise `COMP_SPACING_OUT_OF_BOUNDS`, and the ladder forbids leaving the band to make content fit. A tolerance that could be stretched to any value would make the tolerance meaningless.
- **rung 3 (reflow) is therefore the answer**: break before `blk_body3` (rung 2 also applies if no lock or `keep_together` is passed), and `blk_body3` opens **page 6** — this page *is* print page index 5, the first story page (`f = 4` front-matter pages precede it), so the next page is 6. (An earlier revision of this line said page 7, a leftover from when the example page was index 6.)

Had the same page instead overflowed by **two** lines (22 needed), rung 4 would be legal: fitting 22 lines needs `line_height_q ≤ floor(35800/22) = 1627 q = 1627/64 = 25.4219 px_css = 19.07 pt`, a **−5.85 %** squeeze from `20.25 pt` — inside the ±6 % band, which floors at `20.25 × 0.94 = 19.035 pt`, by `0.03 pt` — and the adjustment is recorded as an automatic geometry change that never touches prose (§10.5). (An earlier revision wrote `19.5 pt` at −3.7 %; that is wrong: `19.5 pt = 26 px_css = 1664 q`, and `floor(35800/1664) = 21` lines, so `19.5 pt` does **not** fit 22 lines. The conclusion survives; the number did not.)

### 9.5 Page-count arithmetic and D-16 padding

**The re-parameterised fixture's arithmetic — the set that ships.**

```
target_words = 9 × 16 × 7.9 − 31.6 = 1106.0 → 1106 _words_   (9 story pages × 16 balanced lines × 7.9 words/line,
                                                    less a 4-line reserve for the heading and the forced break)
front matter  f = 4   (title, copyright, dedication, contents)          indices 1–4
story pages   s = 9                                                      indices 5–13
back matter   b = 3   (memory verse, discussion, about/closing)         indices 14–16
N = 4 + 9 + 3 = 16       pad = (4 − 16 mod 4) mod 4 = 0
→ M = 16, 16 % 4 = 0 ✓    no padding at all; story indices 5–13
```

**Why nine and not twelve — the solver's own cost function, not a division.** `1106` words is `140` lines. Nine story pages hold `9 × 16 = 144` balanced lines, so the target plan costs **0**; eight would need `128 + 4d ≥ 140`, i.e. at least three dense pages (`90`); seven would need all seven at the 20-line capacity (`210`); ten or more pages pay `page_count_penalty` (`M = 20` → `20`). Ties resolve toward fewer pages (`07` §4.2), so the DP returns **nine** story pages and `M = 16`. The identical derivation at the `0.88` **default** band gives `9 × 18 × 7.9 − 31.6 = 1248` words (`158` lines, ten story pages needed to avoid four dense ones), which also plans to 16: the band changes the *number*, not the *verdict*, and the number is what the fixture's budget must be (`05` §1.6 item 1).

```
        1106 _words_  (140 lines)   ← the fixture's budget, at the resolved band 0.78
the DP's own tipping point          144 lines  = 1138 _words_   (one more line ⇒ s = 10, M = 20)
```

**The pre-amendment parameter set is kept only as history.** At the shift model `~1400 _words_` needs `ceil(1400/146) = 10` story pages (the `146` is gen-1's superseded capacity figure; `05` §1.6 item 6) (the superseded `89 mm` model needed 11), and the set gives `M = 20` under **either** box model:

```
front matter  f = 4                                                     indices 1–4
story pages   s = 10                                                    indices 5–14
back matter   b = 3                                                     indices 15–17
N = 4 + 10 + 3 = 17       pad = (4 − 17 mod 4) mod 4 = 3
→ 3 deliberate blanks at the BACK-matter boundary only (§4.6, D-16)
→ M = 20, 20 % 4 = 0 ✓    story indices stay 5–14  (front-matter-first rule, §4.5)
```

And a 12-story-page draft:

```
N = 4 + 12 + 3 = 19       pad = (4 − 19 mod 4) mod 4 = 1
→ 1 deliberate blank at the BACK-matter boundary  →  M = 20 ✓
```

Inserting that pad among story pages would raise `COMP_IMPOSITION_PADDED_MIDSTORY` (major, non-blocking); expanding prose to avoid it is forbidden (`D-16`).

**The defect, stated once.** The word budget and the page target disagreed whichever box model was used, because the budget was derived at 100 % fill while the solver refuses to fill a page past the density band — so the arithmetic could be exactly right and the model still impossible (`REVIEW-RECONCILIATION` §8.2). That is closed by deriving the budget at the **resolved ceiling minus a reserve** (`05` §1.6 item 1): `1106 _words_` → `M = 16` with no padding. The `146 _words_` figure above is a *capacity* figure (`20` lines at 100 % fill; now `20 × 7.9 = 158`), retained as history; the budget figure is `16 × 7.9 = 126.4 _words_` per story page. A second, independent correction applies this section too: the nine story pages are **not** all prose, so the budget must be derived from `lines_available_for_prose = 144 − 26 − 1 = 117` lines — `924 _words_`, not the `1106` — never from the total (`05` §1.6 item 7; `R-WIZ-017`), and that is why the build's own composition lands on **20** pages. Any residual miss is `PRINT_PAGE_COUNT_OFF_TARGET` (registered `major · A` in `11` §2.4), and it is deliberately **not** repaired here: padding mid-story and expanding prose are both forbidden (§4.6, `D-16`).

### 9.6 The same book, digitally (for contrast)

At `360 × 640` the content width is `360 × (96/139.7) = 247.39 px_css`, computed from the **exact rational** `04` §6.1 derives from `text_box_mm`/trim — not from the 4-decimal `0.6872`, which agrees to `0.005 px_css` at this width but is `23222 q` where the reference box is `23221 q`, and that one quantum is enough to break `09` §1.7's line-break parity where the parity is actually checked (§2.1). At `1280 × 800` a spread is used (§3.2): leaf width `= (1280 − gutter)/2`. The same **9**-story-page print book paginates to **9–18 digital pages** (D-06, `03` §5.1) — `18` at the narrowest single page (`360×640`) and `9` at the widest spread (`1440×900`), the two endpoints `04` §5.1's `measured_at[]` carries — reported as a range, never as "16 pages". (Earlier revisions of this sentence said "10-page" — the pre-amendment story count — and then `14–18`, which matches neither endpoint; the per-viewport counts give min `9` / max `18`, and `06` §8 now carries the `9–18` figure, following this document as `17` D-06 records (A-13, round 3).)

---

## 10. Traceability

Requirement identifiers are owned by `01-product-requirements.md` (`00` §3.1 — no other document may invent one); `01` allocates `R-DIG-001…017` / `R-DIG-101…103` and `R-PRT-001…018` / `R-PRT-101…102`, traced to test cases in `14-test-plan.md`. Every finding code named in this document is registered in §2 of `11-validation-strategy.md`, which owns the code registry (`11` §1.2); **this document introduces no code**.

| # | Strategy claim | Area | Spec | Decision |
|---|---|---|---|---|
| 1 | Digital and print are two outputs of one logical input; `paginateDigital`/`paginatePrint` are pure and total | DIG, PRT | §6.10, §7.4, §9.3 | `D-04`, `D-01` |
| 2 | A page never contains a clipped span; an unfittable block owns its own page and is reported | DIG, PRT | §6.10 | `D-13` |
| 3 | Measurement runs in one pinned Chromium; geometry is identical to the render container | DIG, PRT | §12.4, §7.4 | `D-01`, `D-14` |
| 4 | Per-line offsets come from `Range.getClientRects()` (per-fragment rects); the line **count** is element height ÷ line pitch, and density and page turns consume the measured line boxes (§2.2) | DIG | §6.6, §6.7 | — |
| 5 | All measurements quantise to 1/64 `_px_css` integers before the solver | DIG, PRT | §12.4 | `D-04` (`07` §4.5) |
| 6 | Two-tier measurement cache; content-addressed, additive, disposable | DIG, PRT | §12.5 | `D-03`, `D-10` |
| 7 | Fonts are proven settled and metric-matched before any read; unsettled ⇒ refuse | DIG, PRT | §1.3, §8.3 | `D-09`, `D-14` |
| 8 | Reference viewport set; spread ≥ 1024 × 768; readability guard may refuse a spread | DIG | §7.1, §7.4 | `D-06` |
| 9 | Spread gutter/spine geometry; single-page fallback | DIG | §7.1 | — |
| 10 | Plan is DPR-independent; DPR pinned to 1 and excluded from the plan tuple | DIG | §7.1, §7.4 | `D-01`, `D-04` |
| 11 | Orientation swap: reference-set lookup or reader-side reflow; never a re-plan | DIG | §7.1, §15.3 | — |
| 12 | Candidates are deterministic; the plan is produced by the `07` §4 solver, not by pagination | DIG, PRT | §6.2, §6.10 | `D-04` |
| 13 | Page numbering and progress use the active viewport's count; the range is disclosed | DIG | §7.3, §7.4 | `D-06` |
| 14 | Reader reflows only between planned boundaries; anchors fixed; no write-back | DIG | §6.10, §7.3, §15.3 | (`03` §10) |
| 15 | Paper/trim presets and custom sizes; portrait booklet pages | PRT | §9.1 | `Q-04` |
| 16 | mm page boxes, inner/outer margins, binding allowance, gutter, safe area | PRT | §9.1, §9.2 | — |
| 17 | Perimeter border geometry from the design revision; uniform across pages; no text collision | PRT | §9.2 | `D-13` |
| 18 | Measurement against the paper content box via the shared bridge | PRT | §9.1, §9.3 | `D-01` |
| 19 | Front/back-matter-first placement keeps story numbering stable | PRT | §9.4 | — |
| 20 | Pad to a multiple of four, front/back matter only | PRT | §9.4 | `D-16` |
| 21 | Frozen print plan is immutable; overflow re-opens pagination; renders refused | PRT | §6.10, §9.3, §15.2 | `D-05` |
| 22 | §10.5 ladder in order; rungs 1–4 + 8 automatic, 5 human-resolved, 6–7 approval-bound | DIG, PRT | §10.5, §6.7 | `D-11` |
| 23 | Scope-dependent violation policy (digital discloses, frozen print refuses) | DIG, PRT | §6.10, §6.9 | (`07` §3) |
| 24 | Per-page fit report: capacity, slack, exact-rational fill ratio, violations | DIG, PRT | §6.7, §9.3 | `D-06` |
| 25 | Outputs are byte-identical given the D-14 environment; drift fails loudly | DIG, PRT | §15.5 | `D-14`, `D-01` |
| 26 | `lang`/hyphenation are pagination inputs (geometry-bearing) | DIG, PRT | §3.2, §8.1 | `D-04` (`17` Part C) |
| 27 | Performance budgets and the one-paragraph incremental path | DIG, PRT | §12.5, §15.5 | `D-17` |
| 28 | The HTML book and the reading PDF derive from the same `ms_rev` | DIG, PRT | §1.2, §12.3 | `D-10` |

**Requirement coverage** (`01` IDs; second column is this document's section):

| Requirement | Here | Requirement | Here |
|---|---|---|---|
| `R-DIG-002` fullscreen reading | §3.2 | `R-PRT-001` deterministic physical measurements | §4.2, §7 |
| `R-DIG-003` facing vs single | §3.2 | `R-PRT-002` paper presets + custom | §4.1 |
| `R-DIG-004` never force a spread | §3.2 | `R-PRT-003` margins, binding allowance, page rules | §4.2 |
| `R-DIG-005` portrait + landscape | §3.5 | `R-PRT-004` identical border thickness within a style | §4.3 |
| `R-DIG-010` progress, optional numbering | §3.8 | `R-PRT-005` borders inside safe area; no text/footer collision | §4.2, §4.3 |
| `R-DIG-012` font scale within declared steps | §3.9 | `R-PRT-006` perimeter frame consistent across pages | §4.3 |
| `R-DIG-014` pagination inputs | §1.3, §3.1 | `R-PRT-007` measure fit + physical page count | §4.4, §6 |
| `R-DIG-015` reflow, never clip | §3.7 | `R-PRT-008` honour frozen assignments | §4.7 |
| `R-DIG-016` disclose the non-reproducible | §3.7, §5 | `R-PRT-009` detect, preserve locks, refuse frozen reflow | §4.7, §5 |
| `R-DIG-101` interactive ≤ 2 s | §8 | `R-PRT-010` never silently revise approved prose | §5 (rungs 6–7) |
| `R-DIG-103` body ≥ 16 px_css | §3.4, §5 (rung 1) | `R-PRT-011` total imposed count a multiple of four | §4.6 |
| *(03 §10 reader-reflow contract)* | §3.9 | `R-PRT-013` parity blanks at front/back only | §4.6 |
| | | `R-PRT-018` correct numbering; no unintended blank/missing page | §4.5, §6 |
| | | `R-PRT-101` perf (≤ 2 s/page; ≤ 30 s for a 16-page PDF) | §8 |
| | | `R-PRT-102` print body ≥ 12 pt | §9.3 |

---

## Appendix A — Contradictions and naming drift found (reported, not edited)

| # | Location | Issue | Resolution here |
|---|---|---|---|
| A-1 | ~~`03` §5.1 step 4 ("greedy first-fit with backtracking") vs `07` §4.2 (single-source shortest-path **DP**)~~ | **RESOLVED.** `07` §4 owns the solver and it is the DP alone — there is no fast path (`07` §4.2), so no "validated fast path" exists to reconcile either. `03` §5.1 step 4 has been rewritten to the DP with fitting as an absent edge. | No action outstanding. |
| A-2 | `03` §5.1 cost control ("cache keyed by `(revision triple, viewport)`") vs `12.5`/"one-paragraph change re-measures one block" (`T-DIG-008`) | A revision-level key cannot yield incremental re-measure, because an `ms_rev` hash covers all blocks. | Resolved by the two-tier cache (§2.5): tier-1 key is the documented key; tier-2 is per-block content-addressed. No doc edit required, but `03` §5.1's key should be annotated. |
| A-3 | ~~`03` §5.2 step 3 ("content box = trim − margins − border inset") vs `04` §6.1 (`layout.text_box_mm` declared directly)~~ | **RESOLVED (shift model).** `text_box_mm` is the declared, symmetric measure and **is** the print content box (shifted `(gutter + binding)/2` toward the outer edge, not derived); `03` §5.2 step 3 has been rewritten to §4.2, so "trim − margins − border inset" no longer appears there. The earlier derived-box reading is superseded. | No action outstanding. |
| A-4 | `07` §5.3 and `04` §10 use `BREAK_UNSATISFIED`; `17` Part C once writes `PAGE_BREAK_UNSATISFIED` | **Naming drift** on the same finding code. | Use `BREAK_UNSATISFIED`. `11` §9 already logs this as an alias defect; no action needed here. |
| A-5 | `04` §5.1 `CompositionRevision` example omits `created_by`, while `02` §4.3 requires that field on every revision | Pre-existing gap noted in `02` §4.3 itself. | Not this document's to fix; recorded so it is not re-discovered. |
| A-6 | `10-…` preamble says "`docs/08-pagination-strategy.md` does not yet exist" | Stale: this document now exists. | No contradiction arises: `10-…` §1.3's term definitions are followed here, and `10-…` §2.1's "`paginatePrint()` is the only component that inserts a page" matches §4.6. The preamble line should be removed. |
| A-7 | `01`'s area→document table maps the **PRT** area to `docs/10-booklet-imposition-spec.md`, but `10-…` itself defers §9.3 print pagination to `docs/08`, and `00` §2 gives this document deliverables 9 **and** 10 | One of the two mappings is wrong. | Split it: `R-PRT-001…013`, `R-PRT-018` (§9.1–§9.3, §10.4) are documented here; `R-PRT-014…017` (§9.4–§9.5 imposition) in `10-…`. Recommend `01`'s PRT row name both documents. |
| A-8 | ~~`10-…` §1.3 adds `gutter_mm + binding_allowance_mm` to the spine-side inner margin, while `11`'s `PRINT_GUTTER_INSUFFICIENT` is framed as "inner margin < `gutter_mm` + `binding_allowance_mm`" (inclusive, not additive)~~ | **RESOLVED (shift model).** Neither the additive nor the inclusive reading is the model: `gutter_mm + binding_allowance_mm` **displaces** the content box `(gutter + binding)/2` toward the outer edge and does **not** change the measure (§4.2). `10-…` §6.5 and `11` §2.4's `PRINT_GUTTER_INSUFFICIENT` are read through that — the check is the facing clear space (`2 × 25.35 = 50.7 mm ≥ gutter_mm`), not a reduced text-box width. | Follow §4.2 (the shift model). `11` §2.4's row now names the facing clear space explicitly (`clear_mm = trim_width_mm − text_box_width_mm + gutter_mm + binding_allowance_mm`) and is marked dormant for V1 (round 3; A-11). |
| A-9 | `T-DIG-024` says an oversized block "overflows to its own page and is **reported**, never truncated", while `11`'s `DIG_PAGE_OVERFLOW` is `critical · A·E·R` (blocks the render) | Is an oversized block a reporting event or a refusal? | Resolved as plan-emitted + render-refused (§3.7): nothing is truncated and nothing is clipped, but the page will not render and approval is blocked until the ladder runs. **Closed at the source:** `07` §4.2 now gives an oversized block a single degenerate edge that owns its own page, so the graph is never emptied by a fit problem and `minimalConflict` §5.2's precondition ("`solve` is unsatisfiable") is only ever reached for H1/H2 locks. If a non-blocking oversized-block event is intended, `T-DIG-024` and the `DIG_PAGE_OVERFLOW` row need a distinct code. |
| **A-10** | `docs/09` §7.4 (C2 and the worked band) | `docs/09` §7.4's `C2` needs `thickness_inner_pt` and `gap_mm`, which `docs/04` §6.1 did not carry, so it could not be evaluated; and its worked band is a **`single_rule`** band on the **`double_rule`** theme `warm_parchment`. With `09` §7.1's own values the band is `8.000 … 10.0292 mm` (`8 + 0.2646 + 1.5 + 0.2646`) and the clearance to text is `8.32 mm`, not `10.085`. | `docs/04` §6.1 now carries the fields, this document's §4.2 has **one** `C2`, and `docs/09` §7.4 has adopted the same figures (its `C2` now spells out `thickness_inner_pt` and `gap_mm`, and its band is `8.000 … 10.0292 mm`); §4.3, `10` §6.3/§6.6 and `16` §4.2 carry the corrected band. |
| **A-11** | `docs/11` §2.4 | `PRINT_GUTTER_INSUFFICIENT` can only fire for `text_box_width_mm > trim_width_mm + binding_allowance_mm` (`> 142.7 mm`), so it cannot fire for any sane design and strains `G1`. `PRINT_GUTTER_EXCEEDS_MARGIN` is stated over `min_side_text_margin_mm`, where §4.2's `C4` binds only the spine-side inset. | **Closed in `docs/11` §2.4** (round 3): `PRINT_GUTTER_INSUFFICIENT` now states the reducing condition and is marked **dormant for V1**, with the purpose-built synthetic firing fixture `G1` requires, and `PRINT_GUTTER_EXCEEDS_MARGIN` is stated over the **spine-side** inset (`spine_side_inset_mm`), exactly as §4.2's `C4` binds; `docs/09` §7.4's `C4` was aligned to the same reference. |
| **A-12** | `docs/10` §6.3 | Calls this document's §4.2 "the outlier" for measuring from the text box; the frame has been measured from the **trim** here, and in `09`/`10`, since review round 1. | **Corrected in `docs/10` §6.3** (round 3): `10` now states that `docs/08` §4.2 measures the frame from the **trim** edge too and that no document in the set measures it from the text-box edge; the old "outlier" sentence is marked superseded there. |
| **A-13** | `docs/06` vs this document's §3.8 | `06` shows the digital range as `14–18 pages`; the owner here says `9–18` for the same fixture. | **RESOLVED (round 3).** `docs/06` §8 now carries `9–18` for the same fixture, following this document (recorded here and in `docs/17` D-06). This document's own §9.6 carried the `14–18` figure as well and has been corrected (round 3) to `9–18` — the endpoints being `18` at the narrowest single page `360×640` and `9` at the widest spread `1440×900`, which is what `04` §5.1's `measured_at[]` carries. |
