# Technical Architecture

**Implements:** spec §12 (Technical Architecture), §1.2, §1.3
**Inherits:** `17-decisions-and-open-questions.md` (D-01 … D-19)

---

## 1. The one architectural claim

> **Everything visual is produced by a deterministic function of four inputs; everything creative is produced by an AI call that returns data and changes nothing.**

```
                     ┌──────────────────────────────────────────────┐
   creative path     │  AI PROPOSALS  →  user applies  →  REVISION  │   (never automatic)
                     └──────────────────────────────────────────────┘
                                              │
                                              ▼
   deterministic     paginate( ms_rev , cmp_rev , dsg_rev , target )
   path                          │
                                 ├──► digital PagePlan ──► HTML storybook
                                 └──► print   PagePlan ──► pages ──► reading PDF
                                                                  └─► imposed booklet PDF
```

If a component needs the network to decide where a page break goes, it is in the wrong layer.

---

## 2. Determinism boundary (the most important table in this document)

| Concern | Owner | Deterministic? | Rationale |
|---|---|---|---|
| Ideation, premise, concept generation | Content Engine — AI | **No** (proposals only) | §4.1 |
| Blueprint drafting | Structure Engine — AI-assisted | **No** (proposal) | §4.2 |
| Prose generation / rewrite / condense / simplify | Content Engine — AI | **No** (proposal) | §5.1, §5.3 |
| Editorial review findings | Content Engine — AI | **No** (findings as data) | §5.2 |
| Scripture reference validation | Content Engine — AI + deterministic lookup | Mixed: the **citation check is deterministic** (does this reference resolve in the registry?), the interpretive judgement is AI | §4.3 |
| Beat identification | Structure Engine — AI proposes, user/rule confirms | Mixed | §6.2 step 2, §6.5 |
| Beat → page allocation (initial proposal) | Composition Engine — AI-scored search over deterministic candidates | **Candidates deterministic**, ranking heuristic | §6.2 steps 3–7 |
| Page-turn recommendation | Composition Engine — heuristic + AI rationale | Heuristic ranked; AI explains | §6.6 |
| Text density classification | Composition Engine — measurement | **Yes** | §6.7 |
| Digital pagination | Digital Engine — Chromium measurement | **Yes** | §7.4 |
| HTML rendering | Digital Engine | **Yes** | §7.1–7.3 |
| Print pagination | Print Engine — Chromium measurement | **Yes** | §9.3 |
| Border geometry, gutters, binding | Print Engine | **Yes** | §9.1, §9.2 |
| Booklet imposition order | Print Engine | **Yes** (arithmetic) | §9.4 |
| PDF generation | Print Engine (pinned Chromium) | **Yes** | §9.3 |
| Every validation check | Validation Engine | **Yes** | §10 |
| Approval, versioning, archives | Project Engine | **Yes** | §12.2 |

**Rule:** any AI result that will influence geometry must first be *materialised as a revision* (D-11). Nothing reads an AI response directly during a render.

---

## 3. Engines

The spec's seven engines (§12.1) map to seven modules. Each has one public interface, named after what it owns, and no module reaches into another's storage.

| Spec engine | Module | Owns | Public surface |
|---|---|---|---|
| A. Content Engine | `src/content` | Prose: ideation, drafting, edit proposals, review findings, scripture refs | `ideate()`, `draftSection()`, `review(depth)`, `proposeRewrite()` → `Proposal[]` |
| B. Story Structure Engine | `src/structure` | Blueprint, beats, ordering, structural metadata | `setBlueprint()`, `deriveBeats()`, `reorderBeats()` |
| C. Page Composition Engine | `src/composition` | Page/beat assignment, breaks, templates, locks, density, page-turn suggestions, approvals of composition | `compose()`, `move()`, `splitPage()`, `mergePages()`, `applyLock()`, `density()` |
| D. Digital Presentation Engine | `src/digital` | Viewport pagination, HTML storybook, reader runtime | `measure()`, `paginateDigital()`, `renderStorybook()` |
| E. Print Production Engine | `src/print` | Fixed-page layout, borders, fit, PDF, imposition, print guide | `paginatePrint()`, `renderPages()`, `readingPdf()`, `bookletPdf()`, `printGuide()` |
| F. Validation Engine | `src/validation` | All checks, severities, blocking decisions | `validate(scope)` → `ValidationReport` |
| G. Project Management Engine | `src/project` | State, revisions, approvals, artifacts, jobs, migrations | `open()`, `commit()`, `approve()`, `artifact()`, `migrate()` |

**Dependency direction is strictly one-way:**

```
core ← schema ← project ← {content, structure, composition, design}
                                    ↓
                          {digital, print, validation}
                                    ↓
                            server / cli / studio
```

`digital`, `print` and `validation` may not call `content` or `structure` for anything except reading a revision — they must not trigger AI, and they must not write prose.

---

## 4. Module tree

```
storybook-studio/
├── docs/                        this specification and its source
├── spec/                        JSON Schema documents (the data contract, D-03)
├── profiles/                    publication profiles and length presets (§2, D-15)
├── themes/                      the eight V1 themes, as token documents (§8.2)
├── fonts/registry.json          font licensing registry (D-09)
├── scripture/registry.json      public-domain translation registry (D-08)
├── src/
│   ├── core/                    ids, hashing, units, canonical json, errors, invariant checks
│   ├── schema/                  generated types + runtime validators from spec/
│   ├── project/                 Engine G
│   ├── content/                 Engine A
│   ├── structure/               Engine B
│   ├── composition/             Engine C
│   │   ├── solver/              constraint solver (07-lock-and-constraint-rules.md)
│   │   ├── density/             measurement-driven density classification
│   │   └── pagerun/             page-turn heuristics
│   ├── design/                  tokens, theme compilation, typography metrics
│   ├── digital/                 Engine D (measurement bridge + renderer + reader runtime)
│   │   ├── measure/             runs in Chromium: line boxes, block heights, overflow
│   │   └── reader/              the shipped reader runtime (no build step, no framework)
│   ├── print/                   Engine E
│   │   ├── layout/              fixed-page composition
│   │   ├── border/              perimeter frame geometry
│   │   ├── pdf/                 Chromium driver, page rasterisation, manifest
│   │   └── imposition/          saddle-stitch arithmetic + sheet preview
│   ├── validation/              Engine F (one file per validator family)
│   ├── providers/               AI adapters (D-02, Q-03)
│   ├── jobs/                    checkpointed job runner (D-17)
│   ├── server/                  Fastify API + static UI host
│   ├── cli/                     `sbx` headless entry points
│   └── studio/                  React workspace UI (§11.2)
├── fixtures/
│   └── david-and-goliath/       the reference project (§14, D-16, Q-06)
└── tests/
    ├── unit/  golden/  property/  visual/  integration/  acceptance/
```

---

## 5. The pagination pipeline

The core sequence, and the only place geometry is decided.

### 5.1 Digital (`paginateDigital`)

1. **Input assembly.** Load `ms_rev`, `cmp_rev`, `dsg_rev`; compute the design's content box for a given viewport (`spread` flag when width ≥ spread threshold, per §7.1).
2. **Measurement pass.** In Chromium: for each `Block`, lay out once in an off-screen container of exactly the content box width; collect (a) block height, (b) the y-offsets of every line box via `Range.getClientRects()`, (c) inline-replaced heights. Line offsets are what makes §6.6/§6.7 possible — density and page turns are decided from line boxes, not character counts (§6.7: "Do not use raw word count as the sole indicator").
3. **Constraint assembly.** From `cmp_rev`: beat order (immutable ordering), `page_break_lock` positions, `content_lock` spans, `beat_lock` groups, `keep_together` groups, orphan/widow limits from the profile, and the `essential` flag on each break.
4. **Solve.** A single-source shortest path over break positions — the dynamic programme of `07-lock-and-constraint-rules.md` §4.2: nodes are `(block, line_offset)`, an edge exists only where the intervening content **fits** the page box, and edge cost is the sum of the soft-constraint penalties incurred by ending a page there. Fitting is never a cost: a page that does not fit is an absent edge, so no plan can be produced by trading fit against intent. Soft constraints (beat split, keep-together, essential break, orphan/widow, density band, contrivance) are integer weights from the publication profile, and ties resolve by the documented rule (fewer pages, then earlier first break). There is no fast path: the DP is the only planner (`07-lock-and-constraint-rules.md` §4.2).
5. **Emit `DigitalPagePlan`.** Each page: page index, block spans `[blockId, fromLine, toLine]`, applied breaks, violations, and the viewport it was measured at. **A page never contains a clipped span**: if a block cannot fit a page alone, the block overflows to its own page and is reported (never truncated) — §6.10 "The renderer must never clip or hide text".
6. **Repeat per reference viewport.** The dashboard's `digital_pages` range (D-06) comes from paginating the reference viewport set (360×640, 414×896, 768×1024, 1280×800, 1440×900 — spread enabled ≥ 1024×768).

**Cost control (§12.5):** measurement is a pure function of `(revision triple, viewport)`; results are cached in `project/.cache/measure/<hash>.json`. Editing one paragraph re-measures that paragraph's blocks and everything downstream on the affected page(s) only.

### 5.2 Print (`paginatePrint`)

1. **Input assembly.** Paper spec (preset or custom), trim, margins, gutter/binding allowance, border spec, page templates, frozen plan if `cmp_rev` is approved (D-05).
2. **Front/back matter resolution.** Title, copyright, dedication, contents, closing, and any deliberate blanks are materialised as pages *before* story pages, so the story's page numbering is stable (§9.4 "Blank pages must be inserted deliberately").
3. **Measurement pass.** Same measurement bridge, against the print content box. The box model is the **shift model** (`08-pagination-strategy.md` §4.2, `09-design-token-architecture.md` §7.4–§7.5, `10-booklet-imposition-spec.md` §1.3): the design **declares** a symmetric `layout.text_box_mm` (`04-…` §6.1) and the margins are *derived from* it — side margin `= (trim_width_mm − text_box_width_mm)/2`, head = foot `= (trim_height_mm − text_box_height_mm)/2`. The print content box is that declared box **shifted `(gutter_mm + binding_allowance_mm)/2` toward the outer edge**, not narrowed: the measure is unchanged (half-letter text box `96.00 × 148.00 mm` ⇒ content box `96.00 mm` wide `= 362.83 px_css`), while the **fore** text edge sits `18.35 mm` and the **spine** text edge `25.35 mm` from the trim. `gutter_mm + binding_allowance_mm` is a *floor* on the spine-side clearance (constraint C4: `safe_area_mm + gutter_mm + binding_allowance_mm = 13.00 mm ≤ 25.35 mm`), never a position and never removed from the width. The perimeter frame is inset from the **trim** edge by `layout.border.offset_mm` on all four edges (half-letter band `8.000 … 10.0292 mm` = `8 mm` offset + `0.75 pt` outer rule `0.2646 mm` + `gap_mm 1.5` + `0.75 pt` inner rule `0.2646 mm`; the reference theme's style is `double_rule`), and two constraints keep frame and text apart — `C1 offset_mm ≥ safe_area_mm` and the unified `C2` of `09-design-token-architecture.md` §7.1 (`offset_mm + t_outer + t_inner + gap ≤ min_side_text_margin_mm − text_gap_min_mm`). **There is one box model:** the earlier model — an asymmetric `89.00 mm` box derived by *removing* `gutter + binding` from the spine side — is **superseded**; `03` no longer derives it, and `08` §4.2 and `09` §7.4 report the same `96 mm` measure. Physical units (mm) throughout; the design revision carries a `print` token set, not the digital one.
4. **Solve.** Respect any frozen page assignments; fill in beat order; a frozen page that cannot hold its assigned content is not reflowed — it raises `PRINT_FROZEN_OVERFLOW` (§D-05).
5. **Pad to a multiple of four** only at front/back matter boundaries (D-16), then freeze the total.
6. **Emit `PrintPagePlan`**, including a per-page fit report (used capacity %, slack, violations).

### 5.3 Rendering and export

- `renderPages()` renders each `PrintPage` as a fixed-size document (one page per HTML document, `@page` sized exactly) and drives Chromium `page.pdf({preferCSSPageSize: true})`.
- `readingPdf()` assembles pages in reading order.
- `bookletPdf()` reorders per the imposition arithmetic (`10-booklet-imposition-spec.md`) onto sheet-sized pages with 2-up placement, preserving duplex flip-edge rules. `10` §8.2 forbids re-rendering, so assembly **places already-rendered page content 2-up** — it never rasterises, re-typesets or re-measures a page. The placement library is **`pdf-lib`** (pure JS/TS, no native dependency); its exact version is pinned in the artifact manifest alongside the D-14 fields, because a different library version is a different byte stream.
- **Byte-identical assembly (metadata normalisation).** `T-OPS-004` and `T-PRT-001` assert byte identity, which a PDF's own metadata defeats unless it is normalised: `/CreationDate` and `/ModDate` are set to a **pinned epoch**, never "now", and the document `/ID` is **cleared** (or set to the artifact content hash). Without this, two runs of the same revision differ by a few bytes on the timestamp and `/ID` alone.
- Both PDFs record the manifest of D-14, extended with the `pdf-lib` version, so an artifact is reproducible only against a named assembler.

---

## 6. Project storage on disk

```
<project>/
├── project.json                 identity, config, profile, current revision pointers
├── manuscript/
│   ├── blocks.json              blocks by ID: {id, type, text_hash, ...}
│   └── revisions/<hash>.json    revision = block-id list + text per block + provenance
├── structure/
│   ├── blueprint.json
│   └── beats.json
├── composition/
│   ├── revisions/<hash>.json    pages → block id spans + rules; NO prose (D-10, §12.3)
│   ├── locks.json
│   └── history.json             ordered revision list + author action per revision
├── design/
│   ├── revisions/<hash>.json    token set + typography + lang/hyphenation (D-04)
│   └── templates/<id>.json
├── proposals/<id>.json          every AI proposal ever returned, applied or not (D-11)
├── validation/<hash>.json       reports, addressable by the revision triple they judged
├── approvals/<id>.json          revision triple + freeze records + manual proofs
├── artifacts/<id>/              exported files + manifest.json
├── archive/<apr_id>/            approved publication archive: artifacts + manifest + revisions.json index (12-… §7)
├── licenses.json                translation and font licences (D-08, D-09)
├── jobs/<id>.json               checkpointed job records (D-17)
└── .cache/                      disposable: measurements, summaries, provider calls
```

Everything outside `.cache/` is human-readable, diffable and committed-able. Everything inside `.cache/` is reproducible and may be deleted at any time.

---

## 7. AI provider layer

§12.4 requires configurable providers for seven task kinds. The interface is deliberately narrow:

```ts
interface Provider {
  id: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
```

`CompletionRequest` carries `task` (one of `ideate | draft | review | restructure | pageturn | rewrite | scripture_review`), a system prompt from the task's prompt template, the input payload, a **prompt hash**, and a `jsonSchema` for structured output. `CompletionResponse` carries text/JSON, token accounting, provider id, model id, and latency.

Consequences:

- **Per-task routing** (Q-03) is configuration: `providers/routing.json` maps task → provider+model, with an ordered fallback list. §12.5's "bounded retries" is implemented here, at the job layer.
- **Cache** keyed by `(prompt hash, input hash, provider, model)`. A cached call is not billed and is byte-identical on replay — this is what makes a failed job resumable (D-17) without re-spending.
- **Structured output only.** A proposal that does not validate against its schema is a failed call, retried up to the bound, then `abandoned`. Free text is never parsed with regex.
- **Provenance** is recorded on every proposal: provider, model, prompt hash, timestamp, and the input revision hashes. §15.5's "AI calls are focused and economical" is auditable from `proposals/` alone.

---

## 8. Job model (D-17)

```
queued → running → (checkpointed)* → { succeeded | failed | abandoned | cancelled }
```

- A job is a **plan of steps**; each step is atomic and idempotent, and its result is written before the next step starts.
- Rendering jobs are chunked per page, so a 200-page export that dies at page 187 resumes at 187.
- Jobs are persisted in `jobs/` and indexed in the disposable SQLite database for query. Server restart re-queues `running` jobs at their last checkpoint.
- The UI is job-driven: every long action returns a job id and the studio subscribes to progress. No request blocks for the length of a render.

---

## 9. Concurrency and cost

| Operation | Parallelism | Bound |
|---|---|---|
| Prose generation (independent sections) | provider-limited | 4 concurrent sections, ordered commit so beats stay coherent |
| Review passes | provider-limited | 6 concurrent blocks |
| Page rendering | Chromium contexts | 2 browsers × 4 contexts, one page each |
| PDF assembly | single-threaded | — (deterministic order matters) |

The renderer never parallelises anything whose output ordering feeds a page number.

---

## 10. What this architecture deliberately does not do

- **No incremental/patch updates to exported files.** An export is a whole artifact or nothing. Partial exports create files that look complete and are not.
- **No client-side layout decisions.** The browser that *measures* is the pinned, controlled Chromium, not the reader's device (§7.4's reflow is a documented, tested behaviour of the reader, not a second layout implementation — the reader reflows *between* the planned page boundaries, it does not re-plan the book).
- **No editor that mutates prose in place.** Prose changes are proposals applied to revisions (D-11).
- **No plugin system in V1.** §2's extensibility is satisfied by profiles, themes and templates as data (D-15); a plugin API is a V2 concern and a large one.

---

## 11. Traceability

| Requirement cluster | Where the architecture answers it |
|---|---|
| §1.2 three deliverables from one source | §1, §5, D-01, D-10 |
| §1.3 principles | §2 (determinism boundary), D-04, D-05, D-11, D-14 |
| §6.10 three-layer composition | `05-content-and-composition-model.md` §4, §5.1, §5.2 |
| §7.4 viewport pagination, never clip | §5.1 step 5 |
| §9.1–9.4 print + imposition | §5.2, §5.3 |
| §10 validation | §3 (Engine F), `11-validation-strategy.md` |
| §12.2/12.3 records, single source of truth | §6, D-10 |
| §12.4 model independence | §7 |
| §12.5 efficient processing | §5.1 cost control, §7 cache, §8, §9 |
| §15.5 operational quality | §6, §7, §8, D-14, D-17 |
