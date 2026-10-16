# Incremental Development Roadmap

**Implements:** spec §17 (implementation priorities), §13 (V1 required features), §14 (vertical slice), §15 (acceptance criteria), §16 item 15
**Deliverable covered:** D15 (per §16)
**Inherits:** `17-decisions-and-open-questions.md` (D-01 · D-03 · D-04 · D-05 · D-06 · D-07 · D-09 · D-10 · D-11 · D-12 · D-13 · D-14 · D-15 · D-16 · D-17 · D-18 · D-19; Q-03 · Q-04 · Q-05 · Q-06 · Q-07), `03-technical-architecture.md` (§4 module tree, §5 pipeline, §8 job model), `04-project-data-schema.md` (§2 entity catalog, §7 process entities), `05-content-and-composition-model.md` (§1.2 blueprint gate, §2.3 initial pass), `07-lock-and-constraint-rules.md` (§4 solver, §5 conflict)

> **Registry ownership.** Test ids of the form `T-<AREA>-<nnn>` are owned by `14-test-plan.md` (§3.2 of `00-README.md`); the numerals in this file are placeholders and the registry wins on any conflict. Finding codes are owned by `11-validation-strategy.md`. Requirement ids `R-<AREA>-<nnn>` are owned by `01-product-requirements.md`; this file allocates them only at **area** granularity (`R-CMP-*`). No new identifier is minted here.

---

## 1. Sequencing principles

Five principles fix the order. Each is a constraint on the plan, not a preference.

| # | Principle | Consequence for the order | Authorised by |
|---|---|---|---|
| **P1** | The **revision model** and the **measurement bridge** exist before anything user-visible | Phase 1 runs as three workstreams — 1A spine, 1B bridge, 1C content/editor — and 1C may not open until 1A and 1B pass their exit criteria | D-03, D-04, D-10, D-13; `03` §1, §5.1 |
| **P2** | Every phase ends in **something Stephen can look at** | each phase names a concrete human-inspectable artifact (§3); "internal refactor complete" is not an artifact | §17 closing line; `00` §1 |
| **P3** | No phase leaves the project **unable to run its own tests** | the suite of `14-test-plan.md` is green at every phase boundary; a phase that breaks CI is not done | D-14; `00` §4.3 |
| **P4** | Geometry is decided **once**, by one authority, before any consumer of it exists | measurement (1B) precedes pagination (Phases 2–3), which precedes the reader (Phase 3) and the PDF path (Phases 6–7) | D-01, D-04; `03` §2, §10 |
| **P5** | Creative work is **inert until applied** | AI enters in Phase 1 and never reshapes the architecture again; every later phase consumes a revision, never an AI response | D-11; `03` §2 |

**Why P1 is first.** Every later phase reads the revision triple (`ms_rev`, `cmp_rev`, `dsg_rev`) and every later test hashes one (D-10). A feature built before that triple is the unit of identity would introduce a second identity scheme, and reconciling it later is a rewrite. Independently: density (§6.7 "actual font metrics"), fit (§6.10 "never clip"), the two page counts (D-06) and every print guarantee (§9.2, §15.4) are *measurements*. Building any of them before the bridge means building estimates that Phase 2 must then throw away — which is exactly the failure D-13 rejects ("composition against a nominal average text box guarantees a re-pagination surprise later"). The two are the only components in the system that nothing else can be written safely without.

**What P1 does *not* mean.** Phase 1 is not "no UI". It is: no *editor* until the spine and bridge are proven, because the editor's entire value is that what it shows survives save/reload (§15.2 "Manual composition changes survive project save and reload") and that what it measures is real.

---

## 2. Phase overview, size and critical path

Relative size is expressed as a multiple of **Phase 2 = 1.0** (the smallest complete phase). No calendar durations are given: `00` §5 excludes dates, and `17` D-16 makes the reference benchmark the only calibration.

| Phase | §17 intent (verbatim objective) | Rel. size | First artifact Stephen can look at | Depends on |
|---|---|---|---|---|
| **1** Content Foundation | "project configuration, story blueprints, manuscript editing, and basic content validation" | 3.0 | manuscript proof (read-through HTML) + Story Editor | — (root) |
| **2** Structured Composition | "story beats, logical page boundaries, composition metadata, and basic page allocation" | 1.0 | initial composition report + `cmp_rev` dump | 1 |
| **3** Interactive HTML Reader | "a functioning responsive storybook with page transitions and navigation" | 1.5 | the book, fullscreen, desktop + phone | 1, 2 |
| **4** Page Composition Editor | "visual page navigation, page splitting, content redistribution, composition rules, locks, and revision tracking" | **4.0** | the working editor | 1, 2, 3 |
| **5** Shared Design System | "typography templates, page borders, decorative elements, and responsive styling" | 1.5 | Design Studio + theme proofs | 1, 3 |
| **6** Print Renderer | "deterministic page layout, print previews, border validation, and standard PDF generation" | 2.5 | fixed-page proof + reading PDF | 2, 4, 5 |
| **7** Booklet Publishing | "booklet imposition, sheet previews, print instructions, and booklet PDF export" | 1.5 | imposed booklet PDF + sheet preview | 6 |
| **8** Automated Quality Assurance | "robust overflow detection, composition validation, layout correction, and publication audits" | 2.5 | Publication Center + validation report | 2–7 (grows from 1) |
| **9** End-to-End Validation | "produce, approve, export, print, fold, and inspect the first complete reference storybook" | 1.0 | the printed, folded booklet | all |

**Honesty about phase size.** Phase 4 is roughly four times Phase 2, because §17's sentence for it ("visual page navigation, page splitting, content redistribution, composition rules, locks, and revision tracking") is six features in one line and it is the only phase whose output is a *stateful interactive application* rather than a deterministic transform. It is split into 4a–4d (§3.4) with independent exit criteria. Phase 1 is nearly as large and is split into 1A–1C for the same reason. No other phase is split; Phases 2, 7 and 9 are single workstreams.

**Critical path.** `1 → 2 → 3 → 4 → 6 → 7 → 9`, with Phase 5 joined into the path between Phase 4 and Phase 6, and Phase 8 as a rolling workstream that is *present* from Phase 1 but only *closed* in Phase 8. Detail in §4.

---

## 3. Phase detail

Each phase states the same nine attributes. "Modules" cite `03` §4 paths; "Entities" cite `04` §2 names and id prefixes exactly; "Features" quote §13's V1 list; "Areas" cite `01` areas at `R-<AREA>-*` granularity; "Tests" cite `14-test-plan.md`; "Exit criteria" are checkable.

### 3.1 Phase 1 — Content Foundation

| Attribute | Content |
|---|---|
| **Objective (§17)** | Build project configuration, story blueprints, manuscript editing, and basic content validation. |
| **Modules created (`03` §4)** | `src/core/` (ids, hashing, units, canonical json, errors, invariants) · `src/schema/` + `spec/*.schema.json` · `src/project/` (Engine G: `open`/`commit`/`artifact`/`migrate`) · `src/jobs/` (D-17 runner) · `src/providers/` (D-02/Q-03 adapters) · `src/content/` (Engine A) · `src/structure/` (Engine B) · `src/digital/measure/` (**1B bridge**) · `src/design/` (token compilation + typography metrics only, D-13) · `src/cli/` (`sbx`) · `src/server/` (Fastify host) · `src/studio/` (Story Editor + Blueprint views, §11.2) · `profiles/` · `themes/` (default theme only) · `fonts/registry.json` · `scripture/registry.json` · `fixtures/david-and-goliath/` (begun) |
| **Entities / revisions (`04`)** | `Project` `prj_`, `ProjectConfig`, `BookMetadata`, `Block` `blk_`, `ManuscriptRevision` `ms_`, `StoryBlueprint`, `Beat` `beat_`, `SourceReference` `srcref_`, `Proposal` `prop_`, `Job` `job_`, `LicenseEntry`; a minimal `DesignRevision` `dsg_` created at project creation (D-13) and a content `ValidationReport` `val_` carrying `Finding` `find_` |
| **§13 V1 features closed** | *Creative Production* — all seven: Ideation · Audience and genre selection · Short-form story blueprint · Scripture-based storytelling · Structured generation · Editing and proofreading · Controlled rewriting. *Operational* — Project saving · Revision management · Error recovery |
| **Requirement areas** | `R-VSN-*` · `R-WIZ-*` · `R-IDE-*` · `R-GEN-*` · `R-ARC-*` (data, providers, jobs, measurement) · `R-OPS-*` (persistence, recovery) |
| **Human-inspectable artifacts** | (1) the project directory itself — diffable JSON (`03` §6); (2) `sbx manuscript proof` → a styled HTML read-through of the current `ms_rev`; (3) the `proposals/` directory as an audit of every AI call (applied or refused, D-11); (4) the blueprint document, human-readable |
| **Automated tests (`14`)** | `T-ARC-*`: project create/open round-trip, pointer resolution (`PROJECT_POINTER_DANGLING`), migration idempotence (`04` §9), canonical-json + hash golden (D-10). `T-ARC-*` measurement: bridge returns line boxes quantised to 1/64 px; golden hash of a fixture block's layout at the reference viewport set; **line counts under `media: 'print'` equal the line counts extracted from the proof PDF** (§3.1 spike). `T-IDE-*`: blueprint gate — drafting refused until `05` §1.2 minimums hold, **including the derived length budget** (`05` §1.6): `story_pages_target = target_print_pages − f − b`, `target_words = story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words` (the reserve is part of the formula — the fixture derives `9 × 16 × 7.9 − 31.6 = 1106 _words_`), `reading_minutes = round(words ÷ rate_words_per_minute(age_band), 1)` with drift → `MS_STATS_DRIFT`. `T-GEN-*`: proposal-apply creates a revision; proposal targeting a `content_lock` span refused at creation (`PROPOSAL_TARGETS_LOCKED_CONTENT`, `07` §E2). `T-WIZ-*`: each §3.3 length preset resolves to a governing `target_print_pages` (`T-WIZ-004`), and the target word budget is derived from it and the measured words-per-page (`T-WIZ-015`). `T-QAS-*`: `deriveBlocking` is the only writer of `blocking` (`T-QAS-007`), and the publication/export gate reads `effective_blocking = blocking ∧ ¬waived` from the `Approval` it is testing (`T-OPS-107`, `T-OPS-108`; an `E`-flagged code blocks export independently, `T-OPS-109`). `T-GEN-*`: scripture — `SCRIPTURE_UNSOURCED`, `SCRIPTURE_REF_UNRESOLVED`, `SCRIPTURE_TEXT_MISMATCH` (`05` §1.4). `T-OPS-*`: job resume from checkpoint (D-17) |
| **Exit criteria** | ☐ `sbx project create --profile …` then `sbx project open` reopens a byte-identical project. ☐ Re-running `commit()` on unchanged input returns the identical `ms_rev` hash. ☐ The measurement bridge lays out every fixture block and returns line-box offsets for all six reference viewports, all values integers in 1/64 px (`07` §4.5). ☐ **The print-media spike passes: screen/print line counts agree and both equal the PDF's extracted lines, 0 discrepancies (§3.1).** ☐ **A blueprint whose word budget is not derived from `target_print_pages` is refused drafting, and `stats.reading_minutes` recomputes to the published formula (`05` §1.6).** ☐ A proposal that would alter locked text fails **at creation**, creating no revision. ☐ A `biblical` project refuses an unlicensed translation (D-08). ☐ `ci` is green, including the golden hash tests. |
| **Dependencies** | none (root). Blocks on Stephen's ratification of D-01…D-19 |

**Workstream split inside Phase 1 (P1/P4 enforcement).**
- **1A Spine** — `core`, `schema`, `project`, `jobs`, `cli`. Exit: project round-trip + revision hashing proven.
- **1B Bridge** — `digital/measure`, minimal `design`. Exit: line-box measurement proven at all reference viewports. **1B may not be skipped or faked with estimates** (D-13).
- **1C Content + editor** — `content`, `structure`, `providers`, `server`, `studio`. Begins only after 1A and 1B pass. Exit: blueprint gate, manuscript editing, basic validation.
- `fixtures/david-and-goliath/` is drafted under 1C against Q-05's WEB translation (Q-06: fixture lives in-repo).

**Phase 1 spike — measurement must be taken under the print media type.** D-01 pins one Chromium for measurement and rendering, but **nothing in the set states which media type the measurement pass runs under**, and that is a hole rather than a detail: Chromium resolves `@media print` differently from `@media screen` (page-box sizing, UA font and box adjustments), the bridge measures once per block and every plan reuses that cache (`08` §2), so if the two disagree the **print** plan is being built on **screen** metrics while the PDF is produced from the print cascade. The spike is small and belongs in **1B**, before its exit criteria — the bridge's correctness is 1B's whole output, and R1/R2 below are the failure it prevents.

| Spike attribute | Content |
|---|---|
| **Question** | Do line counts measured under screen media equal line counts measured under print media, and do both equal the lines the generated PDF actually contains? |
| **Method** | lay out every fixture block (~120) at the print content box with `page.emulateMedia({media: 'print'})` and again with `media: 'screen'`; render one proof PDF and extract each page's line boxes; compare (a) screen vs print line counts per block, (b) measured line counts vs PDF line counts per page, over all 16 pages |
| **Exit criterion** | **exactly equal**, per block and per page, on both comparisons, on the pinned build — 0 discrepancies, recorded as a golden. If (a) fails, the bridge is defined to measure under **print** media and D-01 gains that clause; if (b) fails, the measurement container's box is wrong and 1B does not pass |
| **Cost if skipped** | every golden plan hash and every A-13/A-14 print acceptance row would be computed against a metric the PDF does not use — a defect that only surfaces at Phase 6 or later, when the whole print path depends on it (R1, R2) |
| **Where recorded** | 1B's exit; the result is a Phase-1 evidence item for the §5.2 review package, and a `manual`-layer entry in the "not tested" list only if the pinned build makes one of the comparisons impossible |

**`deriveBlocking` / `effective_blocking` are Phase 1 code, not Phase 8 code.** The amended approval rule (`11` §1.4; `12` §1.1) makes the approval gate read `effective_blocking = blocking ∧ ¬waived`, derived by one function, `deriveBlocking(code, severity, origin, project_state)` (`11` §1.3–§1.4 with the register's resolution). Because `Finding.blocking` and `Finding.waived` live on the `Finding` the **content** validators emit, that function and the `effective_blocking` derivation must exist when the first `Finding` is written — i.e. in **1C**, with `04` §7.2's shape. Phase 8 does not introduce it; Phase 8 closes the *coverage* of it (every registered code has a firing and a clean test). Building content validators before the blocking derivation would mean two write paths to `blocking`, which is the invariant `T-QAS-007` asserts against.

**The length model is Phase 1 code too.** The same reasoning holds for the derived budget: `target_words = story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words` is computed at blueprint time from the governing `target_print_pages`, a words-per-page figure **measured on the concrete design revision** and a stated reserve (the fixture: `9 × 16 × 7.9 − 31.6 = 1106 _words_`, at `words_per_line_measured = 7.9` from the version-controlled probe) (`05` §1.6; D-16 as amended). The blueprint gate refuses drafting without it, so the derivation and its reading-rate table land in **1C** with the rest of the blueprint, not in Phase 6 where the page count is finally rendered. `T-WIZ-015` is the Phase 1 verifier of the derivation; Phase 6 only *checks* the outcome — `PRINT_PAGE_COUNT_OFF_TARGET`, verified by `T-WIZ-016` and, on the fixture, by `T-PRT-106` (`13` §3.6's exit criterion) — it does not create the model. This is why `R-WIZ-015` carries phase 1 and `R-WIZ-016` carries phase 6 (`01` §5).

### 3.2 Phase 2 — Structured Composition

| Attribute | Content |
|---|---|
| **Objective (§17)** | Introduce story beats, logical page boundaries, composition metadata, and basic page allocation. |
| **Modules created / changed** | creates `src/composition/` with `solver/`, `density/`, `pagerun/` (Engine C); changes `src/project/` (persist `cmp_rev` + `locks.json` + `history.json`); changes `src/design/` (declare the `PageTemplate` registry shape, `04` §6.2); changes `src/structure/` (`deriveBeats` hardened per `05` §1.3); changes `src/cli/` |
| **Entities / revisions (`04`)** | `CompositionRevision` `cmp_` (logical + initial digital spans) · `Lock` `lck_` · `Action` `act_` · `Page` `pg_` (revision-scoped) · first composition `ValidationReport` |
| **§13 V1 features closed** | *Page Composition* — Story beat allocation · Page density indicators · AI page-turn recommendations |
| **Requirement areas** | `R-CMP-*` (beats, breaks, density, page turns, solver) · `R-ARC-*` (composition persistence) · `R-QAS-*` (composition invariants) |
| **Human-inspectable artifacts** | initial composition report (`sbx compose report`): page list, beats per page, density class per page, ranked page-turn suggestions with their scores (`05` §2.5); the `cmp_rev` JSON dump; a contact sheet of page boxes (text-only, no reader yet) |
| **Automated tests (`14`)** | `T-CMP-*`: solver determinism golden — same triple + viewport + engine ⇒ identical plan hash (`07` §4.5). `T-CMP-*`: **the DP is the only planner — there is no fast path (`07` §4.2), so no fast-path/DP equivalence test exists; the `blank-heavy` fixture retires with the path and `T-CMP-002` is repointed from the retired equality to the property that a soft lock can never make an unfrozen plan unsatisfiable (`07` §2, §4.3).** `T-CMP-*`: the tie-break rule (fewer pages → earlier break → lexicographic spans) holds. `T-CMP-*`: `COMP_BLOCK_LOST` / `COMP_BLOCK_DUPLICATED` / `COMP_BLOCK_UNRESOLVED` / `COMP_REVISION_CONTAINS_PROSE`. `T-CMP-*`: a hard conflict returns the **minimal unsatisfiable subset of the H1/H2 locks** — deletion-based, deterministic iteration order, soft locks never in the set — naming each lock's `reason` (`07` §5.2; worked examples E3/E4). `T-CMP-*`: two soft locks can never produce a hard conflict, and the shipped weights order them S2 (3000) > S3 (800) > S1 (500) (`07` §2, §4.3). `T-CMP-*`: `05` §E1 — the spec's own revealed page turn is ranked first and, accepted, becomes `intentional_break{essential:true}` + an S2 lock. `T-CMP-*`: `deriveBeats` stability — editing a block's text changes no id, no beat, no assignment (`05` §1.3) |
| **Exit criteria** | ☐ `deriveBeats()` on the fixture blueprint produces one `Beat` per `progression[]` entry with stable ids. ☐ An initial composition of the reference project is emitted as a `cmp_rev` with `reason: "initial_composition"` and produces zero critical findings. ☐ Every block of `ms_rev` appears in exactly one page span. ☐ Density is classified from measurement, never word count (`05` §2.4). ☐ A deliberately unsatisfiable lock pair produces a hard conflict and **no** plan. ☐ Re-running "initial composition" on unchanged inputs returns the identical hash. ☐ CI green. |
| **Dependencies** | Phase 1 (1A + 1B). |

**The density band is single-sourced, and the Phase 2 classifier reads the resolved value.** Density is classified against the **resolved** band for the project, not a constant: the publication profile declares a tolerance band and `09` §4.3 *resolves* it against the concrete design revision — for the reference book `0.35 / 0.78`, not the default token's `0.88`. Phase 2 owns `composition/density/`, so the classifier must read the project's resolved band; if it read the default token, the solver's `sparse_penalty`/`dense_penalty` terms (`07` §4.3) and the worked examples in `08` would classify the same page differently from the author's density indicators. `T-PUB-011` asserts the resolved band is used. The same single-sourcing is what the Phase 1 derived word budget is measured against (`05` §1.6), which is why it appears in both phases' test lists.

### 3.3 Phase 3 — Interactive HTML Reader

| Attribute | Content |
|---|---|
| **Objective (§17)** | Deliver a functioning responsive storybook with page transitions and navigation. |
| **Modules created / changed** | creates `src/digital/` (`paginateDigital`, `renderStorybook`) and `src/digital/reader/` (the shipped, no-build, no-framework runtime, `03` §4); changes `src/studio/` (Digital Preview view, §11.2); changes `src/cli/` (`sbx export html`) |
| **Entities / revisions (`04`)** | `CompositionRevision.digital` layer populated (`measured_at`, `page_count_range`, D-06) · `Artifact` `art_` of kind `html_storybook` (standalone, D-19) · digital-scope `ValidationReport` |
| **§13 V1 features closed** | *Digital Reading* — all seven: Responsive HTML · Fullscreen presentation · Single-page and two-page modes · Page-turn animations · Reader navigation · Mobile and tablet support · Accessible reduced-motion behavior |
| **Requirement areas** | `R-DIG-*` · `R-QAS-*` (digital rendering validation) · `R-UXS-*` (digital preview) · `R-ARC-*` (artifact manifest) |
| **Human-inspectable artifacts** | the book itself: a standalone directory that opens from `file://` on desktop and phone; the reader at 360×640, 1280×800 and a spread viewport; a reduced-motion recording |
| **Automated tests (`14`)** | `T-DIG-*`: `paginateDigital` never emits a page with a clipped span — an over-tall block overflows to its own page and is reported (`03` §5.1 step 5; `05` invariant 10). `T-DIG-*`: the same triple at a fixed viewport yields an identical `DigitalPagePlan` (golden). `T-DIG-*`: reader reflows *between* planned boundaries and never re-plans (`03` §10). Visual: `T-DIG-*` screenshot baselines at the reference viewport set. `T-ARC-*`: the HTML artifact is standalone (no network fetch) and carries manifest D-14. `T-QAS-*`: no clipping, no missing text, controls reachable at every reference viewport (§10.3) |
| **Exit criteria** | ☐ The reference book opens fullscreen, offline, on a desktop browser and a phone browser. ☐ Single-page at 360×640, two-page at 1440×900; the reader never forces a spread that compromises readability (§7.1). ☐ Keyboard and touch navigation both work; reduced-motion disables animation without disabling navigation (§7.2). ☐ `digital_pages` is reported as a **range** with its viewports (D-06). ☐ No page clips text at any reference viewport. ☐ The artifact works from `file://` (D-19). ☐ CI + visual baselines green. |
| **Dependencies** | Phases 1, 2. **This is the Q-07 review point (§6).** |

### 3.4 Phase 4 — Page Composition Editor

**Size: ~4.0 units — four sub-phases.** §17 bundles six features here; the editor is the only stateful interactive application in the product, and its exit must be checkable in parts.

| Sub | Scope | Human-inspectable artifact | Exit criteria |
|---|---|---|---|
| **4a** Read/preview shell | `src/studio/` Page Composition Editor (§6.3): Page Navigator (thumbnails), Composition Canvas (the Phase-3 reader as the canvas renderer), Content Inspector (read-only), Status/Validation panel | the editor open on the fixture composition | ☐ navigator shows all pages in reading order; ☐ canvas renders the selected page/spread via the reader runtime (no second renderer); ☐ inspector lists blocks + beats per page; ☐ CI green |
| **4b** Structured edit commands | `src/composition/` edit ops — `move`, `split_page`, `merge_pages`, `insert_break`, `remove_break`, `create_page`, `convert_page` (`04` §5.4), `set_template`; each emits a `cmp_rev` + an `Action`; undo/redo = revision restore | a before/after of a re-composed book; a history list | ☐ every §6.4 capability is available **as a command** (drag is optional, §6.4); ☐ each op appends an `Action` with `from_rev`/`to_rev`; ☐ undo restores the previous revision exactly; ☐ **A-06 and A-07 performed**; ☐ CI green |
| **4c** Locks + conflict explainer | `src/composition/solver` lock API (`07` §7) surfaced in the UI; apply/release with mandatory `reason`; hard-conflict explainer rendering the **minimal unsatisfiable subset of the H1/H2 locks** (`07` §5.2 — deletion-based, soft locks never included); frozen-plan escalation (D-05) | a conflict message showing two locks and their reasons (`07` §5.2) | ☐ **A-08 performed**; ☐ a lock with no reason is rejected at creation (`04` §5.3); ☐ a hard conflict shows the minimal unsatisfiable subset and emits no plan; ☐ a frozen-page soft violation is `COMP_FROZEN_LOCK_CONFLICT` and refuses to render (`07` §E3); ☐ releasing a lock appends an `Action`; ☐ CI green |
| **4d** Density, page turns, history, approval | density indicators live (`R-CMP-*`), page-turn suggestion accept/reject/modify recorded as `state` (`05` §2.5), composition history + `restore_revision`, `Approval` `apr_` for the §6.11 scopes | suggestion list with accept/reject; an approval record | ☐ density classes rendered per page and refuse word-count-only classification; ☐ a rejected suggestion is not re-offered (`COMP_SUGGESTION_REOFFERED`); ☐ an `Approval` records the revision triple and freezes `print.pages` (D-05); ☐ a later `ms_rev` change sets the approval `stale` with a reason; ☐ CI green |

| Attribute | Content |
|---|---|
| **Entities / revisions (`04`)** | `Lock` `lck_` (all six types, `04` §5.3) · `Action` `act_` (full op set, `04` §5.4) · `Approval` `apr_` (composition scopes, `04` §7.3) · many `cmp_rev` per editing session |
| **§13 V1 features closed** | *Page Composition* — Visual page navigator · Page and spread previews · Manual page breaks · Page splitting and merging · Content and composition locks · Composition history · Composition approval (Page layout presets is assigned here and *materialised* in Phase 5) |
| **Requirement areas** | `R-CMP-*` (all of §6), `R-UXS-*` (§11.1 dashboard, §11.2 workspace, §11.3 control) · `R-QAS-*` (composition validation) |
| **Automated tests (`14`)** | `T-CMP-*`: each edit op round-trips through save/reload (§15.2). `T-CMP-*`: undo/redo restores exact revision hashes. `T-CMP-*`: §15.2 clause-by-clause — beats redistributable without loss, explicit breaks preserved when feasible, content locks protect material, print assignments stable after approval, impossible constraints identified. Integration `T-UXS-*`: the move command is reachable without drag (§6.4 accessibility) |
| **Dependencies** | Phases 1, 2, 3 (the editor's canvas **is** the Phase-3 reader). |

### 3.5 Phase 5 — Shared Design System

| Attribute | Content |
|---|---|
| **Objective (§17)** | Implement typography templates, page borders, decorative elements, and responsive styling. |
| **Modules created / changed** | changes `src/design/` (full token set, theme compilation, typography metrics, `09-design-token-architecture.md`); creates `themes/` — the eight §8.2 themes; changes `src/content`/`src/project` only to bind `design_lock`; changes `src/studio/` (Design Studio view, §11.2) |
| **Entities / revisions (`04`)** | full `DesignRevision` `dsg_` (`04` §6.1) · `PageTemplate` `tpl_` — the ten §6.8 presets (`04` §6.2) · `LicenseEntry` for fonts |
| **§13 V1 features closed** | *Visual Design* — all six: Text-only templates · Audience typography · Decorative borders · Page backgrounds · Consistent visual identity · Front and back matter templates |
| **Requirement areas** | `R-DSN-*` (§8) · `R-PRT-*` (border tokens shared with print, §8.1) · `R-UXS-*` (§11.2 Design Studio) |
| **Human-inspectable artifacts** | the eight themes rendered on one story page (text only, §8.2 "without illustrations"); a border/typography proof sheet; the Design Studio |
| **Automated tests (`14`)** | `T-DSN-*`: every `family` referenced exists in `fonts/registry.json` with a licence and, if print-bound, `embed_pdf: true` (`04` §6.1; D-09). `T-DSN-*`: every template declares `border_slot: "perimeter"` unless an explicit cover exception (`04` §6.2) — so variety cannot break §9.2 consistency. `T-DSN-*`: typography respects `minimum_readable_pt` (§8.3). `T-DSN-*`: `DESIGN_LOCK_VIOLATED` — an automatic token change against a `design_lock` is refused (`07` §2). Property `T-DSN-*`: any theme change re-paginates and re-validates without breaking a lock silently |
| **Exit criteria** | ☐ All eight §8.2 themes exist as token documents and render without illustrations. ☐ Every §6.8 preset exists as a `tpl_`. ☐ No font is selectable without a licence entry; no non-embeddable font is selectable for print (D-09). ☐ A theme switch re-paginates the fixture and reports any resulting lock conflict rather than resolving it. ☐ `R-DSN-*` minimum readable size enforced. ☐ CI green. |
| **Dependencies** | Phase 1 (design revision, D-13), Phase 3 (reader to render proofs). Runs **in parallel with Phase 4** (§4). |

### 3.6 Phase 6 — Print Renderer

| Attribute | Content |
|---|---|
| **Objective (§17)** | Build deterministic page layout, print previews, border validation, and standard PDF generation. |
| **Modules created / changed** | creates `src/print/` `layout/` + `border/` + `pdf/` (Engine E); changes `src/composition/` (populate `cmp_rev.print`, freeze on approval, D-05); changes `src/studio/` (Print Preview view, §11.2) |
| **Entities / revisions (`04`)** | `CompositionRevision.print` layer (`paper`, `pages`, `page_count`, `frozen`, `04` §5.1) · `Artifact` `art_` of kinds `reading_pdf`, `page_png`, `proof_sheet` · print-scope `ValidationReport` |
| **§13 V1 features closed** | *Print Production* — Fixed-page PDF layouts · Reading PDF export · Folded half-letter and A5 presets · Consistent print-safe borders · Binding and gutter calculations |
| **Requirement areas** | `R-PRT-*` (§9.1–§9.3) · `R-PUB-*` (reading PDF) · `R-QAS-*` (print rendering validation) · `R-DSN-*` (print token set) · `R-WIZ-016` (the page-count miss report) |
| **Human-inspectable artifacts** | a fixed-page print proof sheet; a per-page PDF page as PNG; the reading PDF; the fit report (used capacity %, slack) |
| **Automated tests (`14`)** | `T-WIZ-*`: a print page count that misses the governing `target_print_pages` after the pad step is reported, not absorbed (`T-WIZ-016`). `T-PRT-*`: the fixture's `print.page_count == target_print_pages == 16` with `PRINT_PAGE_COUNT_OFF_TARGET` absent (`T-PRT-106`). `T-PRT-*`: `print.page_count % 4 == 0` (`PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR`). `T-PRT-*`: `PRINT_PAGE_OVERFLOW` fires with `evidence{needed_lines, available_lines}` (`04` §7.2). `T-PRT-*`: `PRINT_FROZEN_OVERFLOW` — a frozen page that cannot hold its content is **not** reflowed (D-05). `T-PRT-*`: border geometry identical across pages within one style (§9.2). `T-PRT-*`: padding is only at front/back-matter boundaries (`COMP_IMPOSITION_PADDED_MIDSTORY`, D-16). `T-PRT-*`: golden PDF byte-hash per Chromium build (D-14). `T-PRT-*`: `PRINT_FONT_NOT_EMBEDDABLE` asserted before a PDF is called valid (D-09) |
| **Exit criteria** | ☐ The fixture renders to a fixed-page plan with a stable, frozen-able page count that is a multiple of four. ☐ **That page count is `16` — `target_print_pages` — with `PRINT_PAGE_COUNT_OFF_TARGET` absent (`16` §1.2.1, A-12; D-16 as amended).** ☐ Half-letter and A5 presets both produce a proof (Q-04 default: both). ☐ Borders are geometrically identical on every page and inside the print-safe area. ☐ No page overflows; any frozen-page overflow is a refused render, not a reflow. ☐ **The PDF assembly library (`pdf-lib`) version is pinned in the repository lockfile and recorded in every PDF artifact manifest (`17` D-14), and `/CreationDate`, `/ModDate` and `/ID` are normalised so two renders of one triple are byte-identical (`T-OPS-004`, `T-PRT-001`, `T-PRT-103`).** ☐ Reading PDF carries manifest D-14. ☐ `art_` for `reading_pdf` is emitted. ☐ CI + golden PDF hashes green. |
| **Dependencies** | Phases 2, 4 (frozen plan + approval), 5 (real tokens → border/gutter). Q-04 gates the preset list. |

### 3.7 Phase 7 — Booklet Publishing

| Attribute | Content |
|---|---|
| **Objective (§17)** | Implement booklet imposition, sheet previews, print instructions, and booklet PDF export. |
| **Modules created / changed** | creates `src/print/imposition/` (saddle-stitch arithmetic + sheet preview, `10-booklet-imposition-spec.md`); changes `src/print/pdf/` (imposed output); changes `src/studio/` (sheet-arrangement preview, §9.4) |
| **Entities / revisions (`04`)** | `CompositionRevision.print.imposed` (`sheets`, `spec_version`, `04` §5.1) · `Artifact` `art_` of kinds `booklet_pdf`, `print_guide` · `imposition/spec.json` |
| **§13 V1 features closed** | *Print Production* — Booklet PDF export · Booklet imposition · Printable sheet previews · Print instructions. *Operational* — Publication archives · Standalone output files |
| **Requirement areas** | `R-PRT-*` (§9.4–§9.5) · `R-PUB-*` · `R-OPS-*` (archives, standalone outputs) |
| **Human-inspectable artifacts** | the imposed booklet PDF; the sheet-arrangement preview showing fold and face relationships; the print guide (paper size, sheets, duplex, flip edge, fold, binding) |
| **Automated tests (`14`)** | `T-PRT-*`: imposition arithmetic property test — every sheet's front/back pair, duplex flip-edge correctness, total = multiple of four (D-14 `spec_version` pinned). `T-PRT-*`: `PRINT_IMPOSITION_SPEC_MISMATCH` when a manifest's spec version differs. `T-PRT-*`: deliberate blanks appear only at front/back matter (`COMP_BLANK_UNINTENDED`). `T-OPS-*`: the booklet artifact is standalone and archived with manifest |
| **Exit criteria** | ☐ The fixture produces an imposed booklet PDF with correct front/back placement and duplex ordering. ☐ Total imposed pages is a multiple of four. ☐ The sheet preview is verifiable before download (§9.5 "visual verification of booklet order"). ☐ The print guide is generated. ☐ Blanks are deliberate and recorded. ☐ CI green. |
| **Dependencies** | Phase 6. The pure imposition arithmetic **may be built in parallel with Phase 6** and joined at the end (§4). |

### 3.8 Phase 8 — Automated Quality Assurance

| Attribute | Content |
|---|---|
| **Objective (§17)** | Add robust overflow detection, composition validation, layout correction, and publication audits. |
| **Modules created / changed** | completes `src/validation/` (one file per validator family, `03` §4) — `content | composition | digital | print | ops`; adds the §10.5 correction ladder; changes `src/print/` (`proof_sheet`); changes `src/studio/` (Publication Center, §11.2) |
| **Entities / revisions (`04`)** | `ValidationReport` `val_` + `Finding` `find_` across all families · the single `blocking` derivation function (`04` §7.2) and the derived `effective_blocking = blocking ∧ ¬waived` — **both of which land in Phase 1 with the content validators (§3.1); Phase 8 closes their *coverage*, not their existence** |
| **§13 V1 features closed** | *Operational* — Automated validation (completing what Phases 1–7 proved piecemeal) |
| **Requirement areas** | `R-QAS-*` (all of §10) · `R-OPS-*` (audits, error recovery) |
| **Human-inspectable artifacts** | the Publication Center: a validation report with findings, severities, and the blocking flag; a layout-correction trace showing which §10.5 ladder step was applied |
| **Automated tests (`14`)** | `T-QAS-*`: every code in the `11-validation-strategy.md` registry has a test that fires it and a test that does **not** fire it when clean (two-sided). `T-QAS-*`: `blocking` is derived by one function from `(code, severity, state)` and is exhaustively tested (`04` §7.2). `T-QAS-*`: the §10.5 ladder runs in order — geometry → pagination → unlocked reflow → spacing within tolerance → flag → propose → approve → revalidate. `T-QAS-*`: a publication with an unresolved critical finding cannot reach `approved` (§10.5, §15.5). `T-QAS-*`: `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` refuses export (`04` §7.3) |
| **Exit criteria** | ☐ All five validator families exist and are exercised. ☐ Every registry code has a firing and a clean test. ☐ No AI call is used where a deterministic correction exists (§10.5 "Prefer deterministic correction"). ☐ A publication with a critical finding is blocked from approval. ☐ An export from a stale approval is refused. ☐ CI green. |
| **Dependencies** | Grows from Phase 1 (validators land with each phase); **closes** after Phase 7. |

### 3.9 Phase 9 — End-to-End Validation

| Attribute | Content |
|---|---|
| **Objective (§17)** | Produce, approve, export, print, fold, and inspect the first complete reference storybook. |
| **Modules created / changed** | none new; changes `fixtures/david-and-goliath/` (finalise) and `tests/acceptance/` |
| **Entities / revisions (`04`)** | a final `Approval` `apr_` with `state: approved` and `manual_proof` (`04` §7.3); the complete artifact set |
| **§13 V1 features closed** | *Operational* — Approval checkpoints · Publication archives (final) |
| **Requirement areas** | all `R-*` — this phase is the §15 acceptance proof |
| **Human-inspectable artifacts** | the printed, folded, stapled booklet in hand; the approved edition; the archive; every artifact's manifest |
| **Automated tests (`14`)** | `tests/acceptance/` — the 18 §14 demonstrations that are machine-checkable, run end-to-end on `fixtures/david-and-goliath/`; `16-reference-story-acceptance-tests.md` A-01…A-17 |
| **Exit criteria** | ☐ All machine-checkable §14 demonstrations pass in CI on the fixture. ☐ A-18 is recorded as a `manual_proof` sign-off (see §9). ☐ Export of the approved revision is reproducible on the recorded environment (D-14). ☐ CI green. |
| **Dependencies** | all. |

---

## 4. Critical path and parallelisable work

### 4.1 The critical path

```
1A ─▶ 1B ─▶ 1C ─▶ 2 ─▶ 3 ─▶ 4a ─▶ 4b ─▶ 4c ─▶ 4d ─▶ 6 ─▶ 7 ─▶ 9
                              (4)            (5 ─────────────┘)
```

The unbroken chain is **revision model → measurement → content → composition → reader → editor → print → booklet → validation**. Each arrow is a hard dependency:

| Edge | Why it cannot be reordered | Cite |
|---|---|---|
| 1 → 2 | composition reads a `ms_rev` + `dsg_rev` and measures with the bridge | D-13; `03` §5.1 |
| 2 → 3 | the reader renders a `DigitalPagePlan`; a reader before a plan renders a guess | `03` §5.1 |
| 3 → 4 | the editor's canvas **is** the reader runtime — there is no second renderer | `03` §10 ("no client-side layout decisions") |
| 4 → 6 | print consumes a frozen plan and an approval; a print renderer before freezing prints a moving target | D-05; `04` §7.3 |
| 5 → 6 | print borders/gutters derive from design tokens (§8.1, §9.2) | `04` §6.1 |
| 6 → 7 | imposition reorders pages that must already exist | §9.4 |
| 7 → 9 | the end-to-end proof ends in a folded booklet | §17 Phase 9 |

### 4.2 What may overlap

| Overlap | Condition that makes it safe | Join point |
|---|---|---|
| **Phase 4 ∥ Phase 5** | the editor (4) consumes template *slots*, which are declared in Phase 2; Phase 5 fills them with real tokens. Neither mutates the other's contract | before Phase 6 (print needs real tokens) |
| **Phase 5 ∥ Phase 4a/4b** | the Design Studio ships in Phase 5; the editor shells in 4a are renderer-driven and theme-agnostic | Phase 5 exit before Phase 6 start |
| **Phase 8 (validators) ∥ Phases 1–7** | validators are added family-by-family as each artifact lands (`03` §4: one file per family); Phase 8 closes the set, it does not start it | Phase 8 close after Phase 7 |
| **Phase 7 imposition arithmetic ∥ Phase 6** | imposition is pure arithmetic on a page count; the PDF driver is independent | booklet export joins both |

### 4.3 What may not overlap

- **No phase may begin before its dependency's exit criteria pass** — this is P3: a phase that starts on an unstable base breaks the test suite, and a broken suite invalidates the automated gate (§5.1).
- **Phase 1B (bridge) may not be overlapped with 1C**: an editor that shows estimates is worse than no editor.
- **Phase 6 may not start before Phase 5 closes**: §9.2 requires the *approved border specification*, which is a design token; rendering borders before the token set exists is the D-13 mistake at the print layer.
- **No V2 (illustration) work may overlap any V1 phase** (§8, risk R5).

### 4.4 Where Stephen's review is a dependency

| Stephen's action | Blocks | Fallback default if pending |
|---|---|---|
| Ratify D-01…D-19 | Phase 1 start (everything) | none — this is the one hard stop |
| **Q-09 the reading-rate table** (`05` §1.6; the spec supplies **no** words-per-minute rate anywhere) | Phase 1's length model: the derived word budget and every `reading_minutes` figure shown to the author | default: the published `[A]` table — 120 / **150** / 180 / 220 `_words_per_minute_` for the 0–5 / 6–10 / 11–14 / 15+ bands — held as **publication-profile data**, so changing it is a config edit, not a code change |
| **Q-07 early-preview decision** (§6) | Phase 4 start / Phase 5 visual direction | recommended default: preview after Phase 3 |
| Q-03 provider routing | Phase 1 cost work, Phase 8 L3 review | default: local/cheap for L1/L2, strong for L3 + ideation |
| Q-04 booklet size | Phase 6 presets, Phase 7 imposition | default: ship both half-letter and A5 |
| Q-05 translation | fixture content (Phase 1C) | default: WEB |
| **D-05 `Re-open pagination`** and **§6.11 approvals** | Phase 7 booklet freeze, Phase 9 | none — approval is a human action by design |
| The **external-model exit review** at each phase boundary (§5.2) | the next phase's start | none |

---

## 5. The two gates

Every phase ends by passing **both** gates. A phase that passes only one is not done.

### 5.1 The automated gate

The project's own suite, described in `14-test-plan.md`. It is the *only* gate that can fail objectively.

| Property | Rule |
|---|---|
| Scope | `tests/unit`, `tests/golden`, `tests/property`, `tests/visual`, `tests/integration`, `tests/acceptance` (`03` §4) |
| Pass condition | zero failures; the determinism goldens (D-14) hash-match on the recorded Chromium build; visual baselines match |
| Invocation | **headless via `sbx`**, never through the UI (D-02) — CI must not require a browser session the reader drives |
| Falsifiability | every claim of determinism is a golden or property test (`00` §4.3); every finding code has a firing test and a clean test (Phase 8) |
| Gate statement | "CI is green on commit `<hash>`" — a fact, not a judgement |

### 5.2 The human / model review gate

A **review from a strong external model** is run at each phase boundary, then **Stephen verifies completion himself** and decides whether the next phase starts. The reviewer judges the *artifact*, not the process.

**The review package** handed over at every gate contains exactly four items:

| # | Item | What it is | Why it is in the package |
|---|---|---|---|
| 1 | **The live artifact** | the phase's human-inspectable artifact (§3), runnable/openable by a third party without the author present | P2 — the phase must end in something Stephen can look at |
| 2 | **The test evidence** | the CI run for the exit commit: suite result, the determinism golden hashes, visual diff summary, and the finding codes exercised | proves the automated gate passed, not that it was run |
| 3 | **The honest list of what is NOT tested** | the behaviours this phase ships that no test covers, each with a reason (`manual`, `needs physical print`, `visual judgement`, `deferred to Phase n`) | an unlisted gap is how §15.5 fails silently; naming it is the point |
| 4 | **The changed-files summary** | the diff of `src/`, `spec/`, `themes/`, `profiles/`, `fixtures/`, `tests/` for the phase, with each entry mapped to the phase attribute it satisfies | lets a reviewer see scope creep in the diff rather than in prose |

**What a reviewer is shown.** The artifact first, then item 2, then item 3, then item 4 — in that order. A reviewer who reads the diff before the artifact reviews the wrong thing.

**Example "not tested" entries (Phase 6).** "Physical fold behaviour — needs a press (deferred to Phase 9, A-18)"; "border appearance on textured paper — visual judgement, no test"; "duplex flip-edge alignment on a specific printer — manual (Q-04)". These are the honest entries; an empty list at Phase 6 would itself be the finding.

---

## 6. The early-preview decision (Q-07)

> **Q-07.** Do you want an early preview release after Phase 3 (working HTML reader) to check direction, or a single review at the end of Phase 5?

### 6.1 Recommendation

**Hold the early preview — after Phase 3.** This matches Q-07's recommended default ("the reader is the first artifact you can judge as a *book*, and it is the cheapest point to change visual direction").

### 6.2 The argument

| Reason | Detail | Cite |
|---|---|---|
| It is the first artifact judgeable as a book | Phases 1–2 produce data; Phase 3 produces a *reading experience*. Direction ("does this feel like a storybook?") is only answerable once a book exists | §7.1 |
| It is the cheapest point to change direction | at Phase 3 only `dsg_rev` tokens + reader CSS exist; composition re-runs deterministically and costs nothing (§12.5). No print artifact exists, no approval of print pages has been frozen (D-05) | D-13, D-16 |
| The alternative's failure mode is expensive and late | discovering a wrong visual direction at the end of Phase 5 means the tokens have already been consumed by the print *design* (borders, gutters, §9.2) and the whole Phase-5 exit is re-done before Phase 6 | §8.1, §9.1 |
| The preview is a *diagnostic*, not a release | it does not freeze anything, so a wrong guess costs a review cycle, not a redesign of shipped outputs | D-19 (standalone file, no publishing commitment) |

### 6.3 Cost if the direction is wrong, per option

| Option | If visual direction is *wrong* | If it was *fine* |
|---|---|---|
| **Early preview after Phase 3 (recommended)** | tokens + reader restyle, re-paginate the fixture, re-review — bounded to Phase 5's design work, before print geometry is derived from it | cost is one extra review cycle; the reader is re-confirmed, nothing is undone |
| **Single review at end of Phase 5 (alternative)** | discovered after the design has been consumed by the print design; re-do spans Phase 5 **and** the Phase-6 assumptions built on it, plus every paginated plan (design change re-paginates, D-13) and both renderers' border/gutter inputs |

The asymmetry decides it: the early preview's worst case is one review cycle; the alternative's worst case is a re-do of the design layer *after* it has acquired print dependencies.

**One honest caveat.** The Phase-3 preview shows a book with a *provisional* composition (the editor is Phase 4) and text-only pages (illustration is V2, §13). It reviews **visual direction**, not final composition or content. If Stephen would rather not see a provisional book, the alternative stands — with the cost above.

---

## 7. Vertical-slice mapping (§14's 18 demonstrations)

This table is the roadmap's proof that it reaches the spec's own benchmark. Each demonstration is mapped to the phase that **first makes it possible**; a demonstration that cannot be satisfied until Phase 9 is flagged.

| # | Demonstration (§14) | First possible | Notes / flags |
|---|---|---|---|
| A-01 | Generate a story blueprint | Phase 1 | blueprint gate `05` §1.2 |
| A-02 | Generate and review the manuscript | Phase 1 | proposals + review findings as data (`05` §1.5) |
| A-03 | Identify story beats | Phase 2 | `deriveBeats` (`05` §1.3) |
| A-04 | Propose page compositions | Phase 2 | initial composition pass (`05` §2.3) |
| A-05 | Open the Page Composition Editor | Phase 4a | ⚠ only *complete* when 4a–4d close |
| A-06 | Move a story beat to another page | Phase 4b | move command, accessible non-drag (§6.4) |
| A-07 | Insert a deliberate dramatic page break | Phase 4b | `intentional_break{essential}` (`05` §E1) |
| A-08 | Lock a selected passage and page composition rule | Phase 4c | `content_lock` + `page_break_lock` (`07` §2) |
| A-09 | Apply a text-based visual template | Phase 5 | `tpl_` set (`04` §6.2) |
| A-10 | Preview the interactive desktop book | Phase 3 | two-page spread (§7.1) |
| A-11 | Preview the responsive mobile edition | Phase 3 | single-page (§7.1) |
| A-12 | Generate a fixed-page print proof | Phase 6 | `proof_sheet` artifact |
| A-13 | Verify page borders and text boundaries | Phase 6 (renders) → **Phase 8 (verifies)** | ⚠ *verification* is fully automated only in Phase 8 |
| A-14 | Generate a standard reading PDF | Phase 6 | `reading_pdf` artifact |
| A-15 | Generate the imposed booklet PDF | Phase 7 | `booklet_pdf` artifact |
| A-16 | Inspect the booklet sheet arrangement | Phase 7 | sheet preview (§9.4) |
| A-17 | Approve the final publication | **Phase 9** | ⚠ the *final* publication approval is end-to-end; approval *records* exist from Phase 4d |
| A-18 | Successfully print and assemble a physical booklet | **Phase 9** | ⚠ manual physical proof — see §9 |

**Flagged: cannot be satisfied until Phase 9** — A-18 (by construction: it is a physical act), A-17 (the final approval binds all three editions and follows Phase 9's end-to-end run). **Flagged as Phase-8-complete** — A-13 (Phase 6 renders the borders; only Phase 8's print validator *verifies* them against §10.4). **Flagged as needing all of Phase 4** — A-05.

A-01…A-16 are individually demonstrable by the phase named. The slice as a *whole* (§14 "prove the complete workflow") is only satisfied at Phase 9, which is the point of Phase 9.

---

## 8. Roadmap risk register

The five things most likely to blow up the plan. Each mitigation is a **specific phase activity**; each trigger is a checkable signal to re-plan.

| # | Risk | Why it is real | Mitigation (phase activity) | Re-plan trigger | Cite |
|---|---|---|---|---|---|
| **R1** | **Measurement fidelity drifts across Chromium versions** | the pin (D-01) is also the project's fragility: if the bridge measures differently under a new build, every golden plan hash changes at once | Phase 1B records the Chromium build id in the manifest (D-14); a **measurement-drift canary** test hashes a fixture block's layout per build and runs in CI; the pin is only moved in a dedicated, re-baselined commit | **any** golden plan hash changing without a revision-triple change | D-01, D-14; `03` §2 |
| **R2** | **Print/PDF fidelity diverges from screen** | one engine is chosen (D-01) precisely to prevent this, but rasterisation, embedding and `@page` sizing are still distinct code paths — and the *measurement* half of the risk (does the bridge measure under the media type the PDF renders with?) was unstated until the review | Phase 1's **print-media spike** settles the measurement half before any plan is built (§3.1); Phase 6 emits a `page_png` and a `proof_sheet` per page; `T-PRT-*` asserts border geometry and font embedding before a PDF is valid; Phase 9's printed booklet is the physical cross-check | a printed page disagreeing with its `page_png` (found at A-18) | D-05, D-09, D-14; §9.3 |
| **R3** | **The composition solver produces pages nobody likes** | the solver's cost terms (`07` §4.3) encode opinions; a wrong opinion produces technically-valid, editorially-poor pages | Phase 2 exit requires reproducing §E1's revealed page turn; Phase 4d adds live density + page-turn accept/reject so Stephen tunes weights against the reference story; weights are **per-profile data**, tunable without code (`07` §4.3) | if the fixture's initial composition needs manual edits on **more than half** its pages | `07` §4.3; §6.6 |
| **R4** | **AI cost and latency swamp the review loop** | §5.2 lists six review layers; run naively they are the most expensive behaviour in the product | Phase 1 ships review caching keyed by `(block text_hash, depth, profile)` (D-12) and per-task routing (Q-03); Phase 1 sets a fixed call budget for the fixture's revisions; `proposals/` makes spend auditable (`03` §7) | a single manuscript revision cycle exceeding the configured call budget (D-12) | D-12, D-17; §15.5 |
| **R5** | **Scope grows from V2 illustration features** | §13 V2's list (image containers, cover design, resolution checks) is adjacent and tempting to start "while the composition engine is open" | Phase 2 keeps illustrations out but leaves the *structural* opening V2 needs (§13 V2 "additional content blocks"); **no illustration code may merge before Phase 9**; each gate lists illustration-shaped additions in the changed-files summary | any diff touching image handling, image locks or resolution checks before Phase 9 | §13 (V2); D-15; §4.3 |

---

## 9. Definition of done for V1

V1 is done when the reference storybook passes **all five §15 acceptance families** simultaneously, on one approved revision triple, reproducible on the environment recorded in its manifest (D-14).

| §15 family | Closing condition |
|---|---|
| **§15.1 Manuscript Quality** | coherent beginning/progression/conclusion; audience-appropriate; clear lesson without repetition; no missing sections; biblical references verified; **approved text not silently altered** (D-11, `content_lock`) |
| **§15.2 Page Composition Quality** | the sequence is viewable and modifiable; beats redistributable without loss; explicit breaks preserved when feasible; content locks protect material; print assignments stable after approval (D-05); impossible constraints identified (not resolved); page-turn decisions coherent; manual changes survive save/reload; history supports rollback |
| **§15.3 Interactive HTML Quality** | modern desktop + mobile browsers; single/two-page adaptive; touch + keyboard navigation; **no clipping**; logical reading order; rotation handled; reduced-motion supported; approved visual identity retained |
| **§15.4 Print Quality** | correct sheet + booklet dimensions; uniform borders; safe margins; readable typography; correct booklet ordering; no unintended blanks; no clipped/overlapping text; proper binding allowances; correct exported content; **successful physical assembly** |
| **§15.5 Operational Quality** | projects persist; failed steps resume (D-17); revisions tracked; approved publications reproducible (D-14); AI calls focused and economical (§12.5); critical errors block approval; **exported files match the approved revision** (`EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`) |

**The closing statement.** V1 is done when `fixtures/david-and-goliath/` has produced, from one approved revision triple and one shared design specification, all three deliverables of §1.2 — the interactive HTML book, the reading PDF, and the imposed booklet PDF — each carrying a manifest reproducible on the recorded Chromium build, each validated by all five families above, and each matching the approved revision.

**On §14 demonstration 18.** A-18 ("successfully print and assemble a physical booklet") is **not machine-verifiable** and is therefore **excluded from the automated gate**. It is recorded as a `manual_proof` on the final `Approval` (`04` §7.3: `manual_proof: {kind: "printed_booklet", at, photo_hash, notes}`) and referenced as `16-reference-story-acceptance-tests.md` A-18 — a manual sign-off, not a passing test.

> ⚠ **Contradiction reported, not edited.** This roadmap was commissioned with the note that §14's demonstration 18 is "a manual physical proof (**D-16**)". The binding register disagrees: `17-decisions-and-open-questions.md` Part C states explicitly that the manual proof is **A-18** and that "D-16 of Part A is not this". D-16 in `17` is *length targeting* — the page target governs and the word budget derives from it (`17` Part A, amended) — and is unrelated to the manual proof. This document follows the register: the manual physical proof is A-18, recorded via the `manual_proof` field of `Approval`. The commissioning note appears to conflate D-16 (a decision id) with A-18 (an acceptance id).

---

## 10. Traceability

| Requirement cluster | Where this roadmap answers it |
|---|---|
| §17 nine phases, in order | §2 overview table; §3 detail; §4 critical path |
| §16 item 15 (incremental roadmap) | this document |
| §13 V1 required features | §3, "§13 V1 features closed" per phase |
| §14 eighteen demonstrations | §7 mapping (A-01…A-18) |
| §15 acceptance families | §9 definition of done |
| D-01, D-04 (one authority, deterministic pagination) | P4; §4.1; R1, R2 |
| D-03, D-10 (project as documents, content-addressed revisions) | P1; Phase 1A |
| D-05 (frozen print, re-open) | Phase 4d, Phase 6; §4.1 |
| D-06 (two page counts) | Phases 2, 3, 6 |
| D-11 (proposals) | P5; Phase 1C |
| D-12 (review depth + cache) | Phase 1; R4 |
| D-13 (composition against a real design revision) | P1; Phase 1B |
| D-14 (environment pinning) | §5.1; R1, R2; §9 |
| D-16 (as amended — the page target governs, the word budget is **derived** from measured words-per-page, padding stays front/back-matter only) | Phase 1 (the derived budget and the reading rate), Phases 2, 6 |
| D-07 (as amended — hard locks precedence; soft locks are weighted, and a conflict is H1/H2 or frozen-plan only) | Phase 2 (`07` §2, §4.3), Phase 4c (the explainer) |
| D-17 (checkpointed jobs) | Phase 1A; §3.1 |
| D-19 (standalone HTML) | Phases 3, 7 |
| Q-03, Q-04, Q-05, Q-06, **Q-07** | §4.4, §6 |
