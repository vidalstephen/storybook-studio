# End-to-End Workflow Specification

**Implements:** spec §3 (creation wizard and modes), §4 (ideation and blueprint), §5 (structured content generation), §6.2 (composition workflow), §6.11 (composition approval), §10.5 (automated correction), §11 (studio workspace and user control), §12.5 (efficient processing), §14 (vertical slice), §15.5 (operational quality)
**Deliverable covered:** D2 (per §16)
**Inherits:** `docs/00-README.md`, `docs/03-technical-architecture.md`, `docs/04-project-data-schema.md`, `docs/05-content-and-composition-model.md`, `docs/07-lock-and-constraint-rules.md`, `docs/17-decisions-and-open-questions.md`

---

## 1. Scope, and the one property the workflow protects

This document is the operational map of the product: the ordered stages from *choose a creation mode* (§3.1) to *a printed booklet* (§9.4), the state machine that governs movement between them, the two autonomy modes (§11.3), the re-entry paths (§6.2 "users should be able to revisit page composition after editorial revisions"), and the failure/resumption behaviour (§12.5, §15.5).

Everything below is downstream of one property established in `03-technical-architecture.md` §1 and `D-04`:

> **AI produces proposals; the user applies them; deterministic engines produce every geometry.**
> There is no code path from an AI response to a mutated manuscript (`D-11`), and no network call in the layout path (`D-04`).

Consequences used throughout, stated once:

| # | Rule | Source |
|---|---|---|
| W-1 | A stage produces a **revision** (`ms_` / `cmp_` / `dsg_` / `blueprint@<hash>`) or an **event** (`prop_` / `job_` / `act_`) or an **artifact** (`art_`) — never an untracked mutation. | `04` §1.2, `D-10` |
| W-2 | Applying a proposal is an explicit action; a proposal targeting locked content is refused **at creation**. | `D-11`, `07` §E2 |
| W-3 | Nothing reads an AI response during a render; AI output that will affect geometry is first materialised as a revision. | `03` §2, `D-11` |
| W-4 | Every long action is a checkpointed job (`job_`); no request blocks for the length of a render. | `D-17`, `03` §8 |
| W-5 | A failure the system cannot satisfy is emitted as a `Finding`, never as a silent approximation ("refusal, not warning"). | `07` §5.4, `00-README` §4.5 |
| W-6 | Every stage is drivable headlessly by `sbx` (CLI) as well as through the studio UI. | `D-02`, `03` §4 |

**Out of scope:** the interface *structure* of each workspace (§11.2) is `06-composition-editor-ux.md`; the solver's internals are `07`; pagination math is `08-*`; imposition arithmetic is `10-*`. This document cites them and adds the sequencing.

---

## 2. The canonical workflow

### 2.1 Diagram

```
  W1 configure ─▶ W2 ideate ─▶ W3 blueprint ─▶ W4 draft ─▶ W5 review
     (mode)         (by mode)      & beats          │            │
                                                     └────◀───────┘  targeted revision loop
                                                                     │
  W6 initial composition ─▶ W7 compose + locks ─▶ W8 design ─────────┤
                                  ▲                     │            │
                                  └──── re-paginate ◀────┘   (D-13: geometry is global)
                                  │
          W9 digital preview ◀────┘
                │
          W10 print proof  +  imposed-sheet preview
                │
          W11 validate  +  APPROVE  ◀── user action only; no automatic transition (D-11, §11.3)
                │
          W12 export: reading PDF · booklet PDF · print guide · manifest
                │
          (W12b — physically print, fold, staple: manual, §14 demo 18, not a machine step)
```

### 2.2 Stage list

Each stage is specified as: **entry condition · user does · system does · artifact/revision · exit condition · governing**.

---

#### W1 — Project creation and configuration (the creation-mode choice)

| Field | Value |
|---|---|
| **Entry** | No project exists; or a source project exists and the chosen mode is 8, 9 or 10 (§3.1). |
| **User does** | Chooses one of §3.1's ten creation modes; answers §3.2 (publication type, genre, age range, proficiency, tone, perspective, theme, language + spelling, length preset, front/back matter, illustration intent). Defaults from §3.2/§3.3 are pre-filled and every parameter is optional-to-override. |
| **System does** | Writes `prj_` with `config` + `metadata` (`04` §3); selects the profile's default theme and **materialises a real `dsg_rev` immediately** (`D-13`); sets `Project.autonomy` and `review_depth` (`D-12`); for mode 4 resolves the citation into a `srcref_` and refuses an unlicensed translation (`D-08`); for modes 9/10 copies the source `dsg_rev`/`tpl_` pointers; queues a `job_` for any file import parse (W-4). |
| **Produced** | `prj_` (registry) · `ProjectConfig` · `BookMetadata` · first `dsg_rev` (revision) · optional `srcref_` · optional `job_`. |
| **Exit** | `project.json` validates; a `dsg_rev` resolves and its hash matches the pointer (`PROJECT_POINTER_DANGLING` otherwise); `stage ∈ {ideation, blueprint, composing}` per mode (§5). |
| **Governing** | §3.1, §3.2, §3.3, §2; `D-02`, `D-03`, `D-15` (profiles are data), `D-13`. |

---

#### W2 — Ideation and concept selection

| Field | Value |
|---|---|
| **Entry** | `stage = ideation`. Entered directly (modes 1, 2, 4, 7, 10) or on request (modes 3, 5, 6). Skipped entirely by modes 3, 6, 7, 8, 9, 10. |
| **User does** | Requests concepts; revises, combines, compares and selects before drafting (§4.1). Selection is an explicit apply. |
| **System does** | Content Engine returns ≥ 1 `prop_` concept proposals (`task: ideate`), each carrying §4.1's fields (title, premise, audience, genre, characters, conflict, lesson, conclusion, duration, structure). Every proposal is stored applied or not (`D-11`). A rejected proposal is never silently re-offered. |
| **Produced** | `prop_` (event) · `job_`. |
| **Exit** | One concept is `applied` and seeds a blueprint draft (W3). |
| **Governing** | §4.1, §11.3, §12.4; `D-11`, `D-02`, `03` §7. |

---

#### W3 — Story blueprint and beats

| Field | Value |
|---|---|
| **Entry** | `stage = blueprint`; a seed concept (W2) or supplied source material (modes 3, 6, 7, 10). |
| **User does** | Drafts or edits the blueprint (premise, target reader, hook, characters + arcs, setting, central theme, `progression[]`, turning points, climax, resolution, emotional effect, closing reflection, `estimated_words`, `suggested_page_distribution[]`); records `srcref_` for a biblical project; accepts the AI-produced draft as a proposal. |
| **System does** | Holds the `StoryBlueprint` as a revision (content hash, diffable, revertible); on apply runs `deriveBeats()` (`05` §1.3) producing `beat_` records with stable ids; validates citations deterministically (§4.3); flags questionable interpretation as `SourceReference.verification.state = flagged` (`SCRIPTURE_INTERPRETATION_FLAGGED`). |
| **Produced** | `blueprint@<hash>` (revision) · `beat_` (registry) · `srcref_` (registry) · `prop_`. |
| **Exit** | The blueprint gate is met (`05` §1.2): `premise ≤ 60 _words_`, ≥ 5 `progression[]` beats, `climax` ≠ `resolution`, `estimated_words` inside the target band (`D-16`), `suggested_page_distribution[]` summing to the beat count. **Drafting is blocked below this gate.** |
| **Governing** | §4.2, §4.3, §6.5; `05` §1.2–1.4; `D-11`, `D-16`, `D-08`. |

> **Import modes (5, 6, 7).** The imported material is ingested as blocks with `origin.kind: "import"` held in an **uncommitted staging set**; the blueprint is produced *from* the source and applied **before** the first `ms_rev` is committed, and beats are assigned at that point. This preserves `05` §1.2's anti-pattern block (a post-hoc blueprint that merely describes the prose) without forbidding the legitimate case (structuring content that already exists).

---

#### W4 — Drafting (structured content generation)

| Field | Value |
|---|---|
| **Entry** | `stage = drafting`; blueprint applied. |
| **User does** | Reviews generated sections; issues controlled revisions of §5.3 (rewrite a paragraph, expand a beat, condense, simplify, improve dialogue, change tone, strengthen conclusion, replace repetition, improve transitions, correct inaccuracy). |
| **System does** | Generates the story in manageable sections, one per beat, with the §5.1 properties (purpose, `word_budget`, context, tone, emotional progression, transitions); up to 4 concurrent sections with **ordered commit** so beats stay coherent (`03` §9); every section returns as a `prop_`; the apply creates `blk_` blocks carrying `origin.kind: "ai"` + `beat_id` provenance and commits a new `ms_rev` (block order is reading order — `04` §4.2). |
| **Produced** | `blk_` (registry) · `ms_rev` (revision) · `prop_` · `job_`. |
| **Exit** | Every `beat_` has blocks (`BEAT_UNASSIGNED_BLOCK` otherwise); `stats` (`words`, `reading_minutes`, `reading_level`) inside target; changes localised unless a broader revision was explicitly requested (§5.3). |
| **Governing** | §5.1, §5.3, §6.2; `D-11`, `D-16`, `03` §5.1, §9. |

---

#### W5 — Editorial review and controlled revision

| Field | Value |
|---|---|
| **Entry** | `stage = review`; a stable `ms_rev`. |
| **User does** | Runs review at a chosen depth (`L1` structural / `L2` line+copy / `L3` full — `D-12`); triages findings; accepts, rejects or modifies suggestions; applies controlled revisions; signs off scripture/factual verification. |
| **System does** | Returns review results as **`Finding`-shaped data, never prose** (`05` §1.5); caches results by `(block text_hash, depth, review profile)` so an unchanged block is never re-reviewed (`D-12`, §12.5); an applied suggestion is a `prop_` → new `ms_rev`; sets `srcref_.verification` only on a human action (§4.3). |
| **Produced** | review findings (data) · `prop_` · new `ms_rev` · updated `srcref_`. |
| **Exit** | No blocking review finding remains (§10.1, §15.1); author signals draft complete. |
| **Governing** | §5.2, §5.3, §10.1, §15.1; `D-12`, `D-11`. |

> **No review layer may auto-apply** (§5.3 is a set of *user-initiated* operations; `05` §1.5).

---

#### W6 — Initial composition

| Field | Value |
|---|---|
| **Entry** | `stage = composing`; stable `ms_rev`; a `dsg_rev` exists (`D-13`). |
| **User does** | Invokes *initial composition* and reviews the emitted proposal; may invoke *reset composition* at zero cost. |
| **System does** | Runs §6.2's ten steps 1–8 as pure functions of the triple `(ms_rev, cmp_rev_parent, dsg_rev, target)` (`05` §2.3): read structure + findings; `deriveBeats()` only if the blueprint changed; measure the text box for the **actual** design revision at the reference viewport set and the print trim (`D-13`); `solve()` — DP shortest-path over break positions with the `07` §4.3 cost terms; score page-turn opportunities (`05` §2.5); assign opening/closing templates; emit a new `cmp_rev` with `reason: "initial_composition"`. Unchanged inputs re-return the identical revision hash. |
| **Produced** | `cmp_rev` (revision) · `pg_` Pages (revision-scoped) · `page_turn_suggestions[]` (each with `state: {accepted, rejected, modified}`). |
| **Exit** | A `cmp_rev` is emitted; if the graph has no `START`→`END` path the solve **fails** with `COMP_LOCK_CONFLICT_HARD` (→ `blocked`), and no plan is emitted (`07` §5). |
| **Governing** | §6.2, §6.6, §6.7, §6.10; `05` §2.3–2.5; `07` §4–§5; `D-13`, `D-04`, `D-16`. |

---

#### W7 — Composition editing and locks

| Field | Value |
|---|---|
| **Entry** | `stage = composing`; a `cmp_rev` open in the Page Composition Editor. |
| **User does** | Select page; single/spread view; move blocks between pages; reorder unlocked beats; split a page; merge adjacent pages; insert/remove intentional breaks; create a page; insert an approved blank; convert a page's `kind`; assign a template; lock content / beat / break / keep-together / print page / design; preview adjacent pages; compare compositions; undo/redo; restore a prior approved composition; accept, reject or modify page-turn suggestions; freeze a print page. |
| **System does** | Each operation emits a **new `cmp_rev` plus an `Action` (`act_`)** (`04` §5.4); re-runs the solver; attaches soft violations (`LOCK_UNSATISFIED`) rather than hiding them; **refuses to emit a plan** on a hard conflict; rejects a `Lock` with no human `reason` at creation; an accepted page-turn suggestion becomes an `intentional_break` (+ an `S2` lock) via one `Action`. |
| **Produced** | `cmp_rev` · `act_` (append-only history) · `lck_` Locks · `pg_`. |
| **Exit** | The logical and digital layers are author-satisfied; the print layer is frozen when the author is ready to proof. |
| **Governing** | §6.3–§6.9, §15.2; `07` §2–§5; `D-07`, `D-11`. |

---

#### W8 — Design Studio

| Field | Value |
|---|---|
| **Entry** | `stage = designing`; a current `dsg_rev` (the W1 default, or an edit). |
| **User does** | Selects a theme (§8.2); adjusts tokens, typography (§8.3) and borders (§9.2); edits page templates (§6.8); may lock token paths against automatic change (`design_lock`). |
| **System does** | Writes a new `dsg_rev`; because geometry is global, **re-paginates both plans** (`D-13`); every automatic operation (auto-fit, theme application, "improve layout") treats `design_lock` token paths as constants (`07` §2); validates font selection against `fonts/registry.json` (`D-09`) and asserts PDF embedding before a print artifact is declared valid. |
| **Produced** | `dsg_rev` (revision) · `tpl_` PageTemplates (registry). |
| **Exit** | The design revision is accepted and re-pagination completed, or the re-solve raises a `CompositionConflict` for the author (`D-13`). |
| **Governing** | §8, §9.2, §6.8; `07` §2; `09-design-token-architecture.md`; `D-09`, `D-13`. |

---

#### W9 — Digital preview and pagination

| Field | Value |
|---|---|
| **Entry** | `stage = digital_preview`. |
| **User does** | Inspects the responsive HTML at the reference viewport set (single page on narrow, facing pages when space allows — §7.1); inspects reader controls and reduced-motion behaviour (§7.2, §7.3); back-edges to W7/W8 to fix. |
| **System does** | `paginateDigital()` (`03` §5.1): measure each `Block` once in the pinned Chromium, collect line-box offsets via `Range.getClientRects()`, assemble constraints from `cmp_rev`, solve, emit the `DigitalPagePlan`; **never clips a span** (§6.10) — an unfittable block overflows onto its own reported page; repeats per reference viewport (360×640, 414×896, 768×1024, 1280×800, 1440×900; spread ≥ 1024×768) and reports the `page_count_range` (`D-06`); renders the standalone offline HTML storybook + reader runtime. |
| **Produced** | `cmp_rev.digital` · `art_` (`html_storybook`) · `val_rev` (digital scope). |
| **Exit** | No blocking digital finding; `digital_pages` range disclosed alongside `print_pages` (`D-06`). |
| **Governing** | §7, §10.3; `03` §5.1; `08-*`; `D-01`, `D-04`, `D-06`, `D-19`. |

---

#### W10 — Print pagination and proof

| Field | Value |
|---|---|
| **Entry** | `stage = print_proof`. |
| **User does** | Inspects fixed pages and spreads, borders, gutters, the per-page fit report and the **imposed sheet preview** (§9.4 "the booklet preview should visually show how sheets will fold"); freezes pages when satisfied. |
| **System does** | `paginatePrint()` (`03` §5.2): resolve front/back matter as real pages **before** story pages (stable numbering, §9.4); measure against the declared symmetric `layout.text_box_mm` box, shifted `(gutter_mm + binding_allowance_mm)/2 = 3.50 mm` toward the outer edge, in `_mm` throughout (the shift model, `08` §4.2); solve honouring frozen assignments — a frozen page that cannot hold its content is **not reflowed**, it raises `PRINT_FROZEN_OVERFLOW` (`D-05`); pad to a multiple of four **only** at front/back boundaries (`D-16`); emit `PrintPagePlan` with fit report; render page documents and drive Chromium `page.pdf({preferCSSPageSize: true})`; produce the imposed-sheet proof. |
| **Produced** | `cmp_rev.print` · `art_` (`page_png`, `proof_sheet`) · `val_rev` (print scope). |
| **Exit** | `print.page_count % 4 == 0`; no print blocking finding; borders uniform and inside the safe area (§9.2, §10.4). |
| **Governing** | §9.1–§9.3, §10.4; `08-*`, `10-booklet-imposition-spec.md`; `D-05`, `D-06`, `D-16`, `D-01`. |

---

#### W11 — Publication Center: validation and approval

| Field | Value |
|---|---|
| **Entry** | `stage = approval_ready`, reached automatically when all scopes validate clean (a *state*, not an approval). |
| **User does** | Reviews validation results in the Publication Center (§11.2); approves one or more §6.11 scopes — complete manuscript, beat order, preferred page turns, digital composition, fixed print composition, visual design, final rendered previews. **Approval is a user action, always.** |
| **System does** | Runs the publication-scope validation pass (Engine F, `11-*`); computes the `blocking` flag from `(code, severity, project state)` by one function (`04` §7.2; no code path may set `blocking` itself); creates the `apr_` binding the revision triple + environment (`engine_version`, `chromium`, `fonts_hash`, imposition spec version); refuses approval while a critical rendering problem is unresolved (§10.5). |
| **Produced** | `val_rev` (publication scope) · `apr_` (approval, `state: approved`). |
| **Exit** | An `apr_` with `state: approved` exists whose `revisions` equal the current pointers and whose `environment` equals the engine's actual environment (`04` §7.3). |
| **Governing** | §6.11, §10.5, §11.2, §15.5; `12-approval-and-versioning-workflow.md`; `D-11`, `D-14`. |

---

#### W12 — Export and archive

| Field | Value |
|---|---|
| **Entry** | `stage = approved`; a valid, non-stale `apr_`. |
| **User does** | Downloads the reading PDF, the imposed booklet PDF and the print guide; optionally archives the publication. |
| **System does** | Refuses export unless the approval is `approved` **and** its revisions equal the current pointers **and** its environment equals the engine's (`EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`, critical); `readingPdf()` in reading order; `bookletPdf()` reorders per the imposition arithmetic (`10-*`) with 2-up placement and duplex flip-edge rules; `printGuide()` emits §9.5's guide; writes the `D-14` manifest (engine version, Chromium build id, font hashes, theme token hash, imposition spec version, revision triple). Export is **whole-or-nothing** (`03` §10). |
| **Produced** | `art_` (`reading_pdf`, `booklet_pdf`, `print_guide`, `manifest`) · archive. |
| **Exit** | Artifacts exist, their manifest is reproducible on the recorded environment (`D-14`), and each cites the exact approved triple. |
| **Governing** | §1.2, §9.4, §9.5, §15.5; `10-*`; `D-05`, `D-14`, `D-16`. |

**W12b (not a machine stage).** Actually printing, folding and stapling the booklet is a human act (§14 demo 18). It is recorded as a `ProofSheet`/manual sign-off on the `Approval` (`manual_proof` field, `04` §7.3) and is **excluded from automated gates** (`17` Part C).

---

## 3. The project state machine

### 3.1 Stage states

`Project.stage` (`04` §3) is the project's current position; it is stored for fast UI and is derived-recomputable, so a validator **recomputes it and reports a mismatch rather than trusting it** (`04` §3 invariant).

| `project.stage` | Meaning | Normal entry |
|---|---|---|
| `project_setup` | Configuration incomplete; no usable revision yet. | creation |
| `ideation` | Concept proposals being generated/selected. | W2 |
| `blueprint` | Blueprint incomplete; drafting blocked (`05` §1.2). | W3 |
| `drafting` | Prose being generated/edited. | W4 |
| `review` | Editorial review in progress; author triaging. | W5 |
| `composing` | A composition revision is being produced or edited. | W6/W7 |
| `designing` | A design revision is being produced or edited. | W8 |
| `digital_preview` | Digital plan + HTML artifact under review. | W9 |
| `print_proof` | Print plan + proof artifacts under review. | W10 |
| `approval_ready` | All scopes validate clean; awaiting a user approval. | automatic |
| `approved` | A valid `apr_` matches the current pointers + environment. | user (W11) |
| `archived` | Publication archived; artifacts frozen. | user (W12) |
| `composition_stale` | The frozen print plan no longer holds after a change (`D-05`). Render refused. | automatic |
| `blocked` | ≥ 1 blocking critical finding exists; forward transition to approval/export refused. | automatic |

### 3.2 Legal transitions

`initiator` is `user` (only an explicit author action) or `auto` (the system, without asking).

| # | From → To | Trigger | Initiator | Bound rule |
|---|---|---|---|---|
| T-01 | `project_setup` → `ideation` | Mode chosen that generates concepts (§3.1 modes 1, 2, 4, 5). | user | — |
| T-02 | `project_setup` → `blueprint` | Mode supplies content directly (modes 3, 6, 7, 10). | user | — |
| T-03 | `project_setup` → `composing` | Mode inherits a source revision triple (modes 8, 9). | user | — |
| T-04 | `ideation` → `blueprint` | A concept `prop_` is applied as a blueprint seed. | user | `D-11` |
| T-05 | `blueprint` → `drafting` | Blueprint gate met (`05` §1.2) **and** `deriveBeats()` produced ≥ 5 `beat_`. | user, or `auto` under `autonomy = autonomous` | §4.2 |
| T-06 | `drafting` → `review` | An `ms_rev` exists with every block beat-assigned. | user, or `auto` (autonomous) | §5.1 |
| T-07 | `review` → `drafting` | Proposals applied / manual edits; a new `ms_rev` exists. | user | `D-11` |
| T-08 | `review` → `composing` | Author signals draft complete; `ms_rev` stable. | user | §6.2 |
| T-09 | `composing` → `designing` | Composition presented; author proceeds to design. | user | §11.2 |
| T-10 | `designing` → `composing` | A `dsg_rev` change forces re-pagination. | `auto` | `D-13`, W-3 |
| T-11 | `composing` → `digital_preview` | A digital plan is produced and validates clean. | user | §7.4 |
| T-12 | `designing` → `digital_preview` | As T-11 after re-pagination. | user | `D-13` |
| T-13 | `digital_preview` → `print_proof` | Author proceeds to print. | user | §9.3 |
| T-14 | `designing` / `composing` ← `digital_preview` / `print_proof` | Author changes design or re-opens composition. | user | `D-05` |
| T-15 | `print_proof` → `approval_ready` | All pre-approval scopes validate clean; no blocking finding. | `auto` | §10.5 |
| T-16 | `digital_preview` → `approval_ready` | HTML-only publication path: digital scope clean. | `auto` | §7 |
| T-17 | `approval_ready` → `approved` | Author approves one or more §6.11 scopes; `apr_` created. | **user only** | `D-11`, §11.3 |
| T-18 | `approved` → `archived` | Author archives the publication. | user | §13 (ops) |
| T-19 | `approved` → `print_proof` / `composing` / `review` | A bound pointer moves (`ms_rev` / `dsg_rev` / `cmp_rev`); the approval goes `stale`. Stage reverts to the **earliest** invalidated stage. | `auto` | `05` §2.7 |
| T-20 | `approved` → `composition_stale` | A frozen print page would overflow after a change. | `auto` | `D-05` |
| T-21 | `composition_stale` → `composing` | Author clicks *Re-open pagination*. | user | `D-05` |
| T-22 | any editing stage → `blocked` | A blocking critical finding arises (see §3.4). | `auto` | §15.5, `07` §5.3 |
| T-23 | `blocked` → *(the stage it blocked)* | The blocking finding is resolved. | user | — |

**Rules on navigation vs transition.**
- Moving between §11.2 workspaces is **not** a stage transition unless it produces a revision or invalidates one. Visiting the Print Preview from `composing` does not move the stage.
- T-19 always chooses the **earliest** invalidated stage: a manuscript change returns to `review`/`drafting`, a design change to `designing`, a print-freeze conflict to `composition_stale`.

### 3.3 Approval state machine (`04` §7.3)

`Approval.state` and `CompositionRevision.approval_state` (`04` §5.1) are the two-state machines that record decisions:

| From | To | Trigger | Notes |
|---|---|---|---|
| *(none)* | `approved` | T-17. Creates `apr_` with `state: approved`, binding `revisions` + `environment` + `frozen`. | User-initiated only. |
| `approved` | `stale` | Any bound pointer moves — see the `05` §2.7 invalidation table; `stale_reason` names **which** pointer moved. | `apr_` is **never deleted** (`05` §2.7). |
| `stale` | *(new)* `approved` | A **new** `apr_` is created after revalidation. | A stale `apr_` is never silently returned to `approved` (`04` §7.3, `05` §2.7). |
| `unapproved` | `approved` | The relevant composition revision gains a covering `apr_`. | `cmp_rev.approval_state` mirrors. |
| `approved` | `stale` | `cmp_rev` gains an `ms_rev`/`dsg_rev` mismatch. | W-3. |

### 3.4 The stale / blocked overlay

**Stale** is an *approval-level* condition (a decision has been invalidated). **Blocked** is a *validation-level* condition (forward motion is impossible). They are independent and can coexist.

`blocked` is entered (T-22) when **any** of these is present and unresolved:

| Trigger | Code | Source |
|---|---|---|
| Any finding with `blocking: true` at severity `critical` | *(varies)* | `04` §7.2, §15.5 |
| No satisfiable plan exists | `COMP_LOCK_CONFLICT_HARD` | `07` §5.3 |
| A frozen print page cannot hold its content | `COMP_FROZEN_LOCK_CONFLICT` / `PRINT_FROZEN_OVERFLOW` | `07` §5.3, `D-05` |
| A composition references a superseded block | `COMP_BLOCK_UNRESOLVED` | `05` §1.3 |
| A pointer does not resolve | `PROJECT_POINTER_DANGLING` | `04` §10 |

**Forbidden while `blocked`:** approval (T-15/T-17), export (W12), archiving, and any transition whose exit condition requires a clean validation. The system may continue to *edit* — the block forbids **publishing**, not working.

### 3.5 Forbidden actions by state

| State | Forbidden |
|---|---|
| `project_setup` | Generating prose; running composition (no `ms_rev`/`dsg_rev` yet). |
| `ideation` | Committing an `ms_rev`; running the solver. |
| `blueprint` | Drafting (§4.2/`05` §1.2 gate). |
| `drafting` | Composition; design freeze. |
| `review` | Approval. |
| `composing` | Approving a frozen print composition before the print layer exists. |
| `designing` | Exporting; approving a print composition being invalidated by the re-pagination. |
| `digital_preview` | Exporting the booklet PDF (no approved print plan). |
| `print_proof` | Exporting (no approval yet). |
| `approval_ready` | Editing the triple *and* approving in the same action (each edit invalidates, re-deriving a stale approval — `05` §2.7). |
| `approved` | Silent mutation of any bound revision; mid-story padding (`D-16`). |
| `archived` | Any mutation of the archived triple. |
| `composition_stale` | Rendering any page that would violate the frozen plan (`D-05`). |
| `blocked` | Approval, export, archive. |

### 3.6 No automatic transition may create an approval

**Stated as a hard rule, because two spec statements depend on it:**
§11.3 ("the system must not silently change locked or approved material") and `D-11` ("there is no code path from an AI response to a mutated manuscript").

- The **only** transition that produces an `apr_` is **T-17 (`approval_ready` → `approved`), and it is user-initiated.** No `auto` transition in §3.2 creates, modifies, or restores an `Approval`.
- The automatic transition T-15 (`print_proof` → `approval_ready`) **reaches the readiness state but does not approve.** "Ready to approve" and "approved" are different states precisely so that autonomy can drive the machine to the doorstep and no further.
- No `auto` transition may set `Approval.state` back to `approved` (only a new `apr_` can — §3.3). This resolves `17` Part C's row on §11.3: *autonomous mode may never create an approval.*

---

## 4. Guided and autonomous modes (§11.3)

`Project.autonomy ∈ {guided, autonomous}` (`04` §3). §11.3 defines the *intent*; these are the operational bounds.

### 4.1 What autonomous mode may do without asking

| May do | Basis |
|---|---|
| Generate proposals of any task kind (`ideate`, `draft`, `review`, `restructure`, `pageturn`, `rewrite`, `scripture_review`). | §12.4, `03` §7 |
| **Apply** a proposal whose targets are **entirely unlocked and unapproved**, creating a new revision with `created_by: "autonomous"`. | §11.3, `D-11`, `17` Part C |
| Run the whole deterministic pipeline: `deriveBeats`, `solve`, `paginateDigital`, `paginatePrint`, render, validate, impose. | `D-04` (none of this is AI) |
| Iterate the §10.5 correction ladder **steps 1–4**: fix layout geometry → recalculate pagination → reflow unlocked text → adjust spacing within approved limits. | §10.5 |
| Queue, checkpoint and resume jobs. | `D-17`, `03` §8 |
| Drive the machine to `approval_ready`. | §11.3 ("create an initial complete storybook … then present it for final review") |

"Apply" in autonomous mode is a *pre-authorised actor* performing an explicit apply — the `Proposal` event is still written (`state: applied`, `applied_as: cmp_rev|ms_rev`), so `D-11`'s audit trail is intact; it is not a path from an AI response to a mutation.

### 4.2 What autonomous mode must always ask about

| Must stop and ask | Basis |
|---|---|
| Any **approval**, of any §6.11 scope. | `D-11`, §11.3, `17` Part C |
| Applying a proposal that targets a `content_lock` span or any **approved** revision. (Refused **at creation** for locked content.) | `D-11`, `07` §E2 |
| Any content change **affecting meaning** (§10.5 steps 6–7: propose localized editorial revision → obtain approval). | §6.7 |
| Releasing, weakening or re-scoping any `Lock`. | `07` §5.4 |
| Altering a `design_lock` token path. | `07` §2 |
| Choosing **which** lock to release to resolve a hard conflict. | `07` §5.2 |
| Re-opening frozen print pagination. | `D-05` |
| Setting `SourceReference.verification.state`. | §4.3 |
| Publishing to a public URL. | `D-19`, `Q-08` (out of V1 scope) |
| Overriding any blocking critical finding. | §10.5, §15.5 |

### 4.3 Recording which mode was in force, per revision

| Record | Field | Meaning |
|---|---|---|
| `Project` | `autonomy` | The mode **currently configured** (`04` §3). |
| every revision | `created_by ∈ {human, autonomous}` | The actor that created *this* revision — `04` §4.2 defines the field on `ManuscriptRevision`; the workflow **requires the identical field on `CompositionRevision` (`04` §5.1) and `DesignRevision` (`04` §6.1)** so that every revision carries its mode. (Extension, flagged: the schema examples omit it from those two; they must not be read as forbidding it.) |
| every composition mutation | `Action.actor` | Who performed the move/split/lock (`04` §5.4). |
| every AI operation | `Proposal.provenance` | provider, model, prompt hash, input hashes, tokens, latency (`04` §7.1). |
| mode change | an event | Changing `autonomy` is a user action and is recorded; it does not retroactively relabel existing revisions. |

**Invariant:** a revision's `created_by` is immutable, so "which mode produced this revision" is decidable from the revision alone — the same property `D-10` gives "which revisions are approved".

---

## 5. Entry points — the ten creation modes (§3.1)

`mode` is recorded on the project at W1. "First artifact" is the first thing the mode produces; "skips" lists stages that never run for that mode.

| # | Mode (§3.1) | Inputs | First artifact | Skips |
|---|---|---|---|---|
| 1 | Generate a book from an idea | free-text idea + W1 config | `prop_` concept → `blueprint@<hash>` | — (full path) |
| 2 | Brainstorm story concepts | theme / genre / audience + count | N `prop_` concept proposals → one applied as `blueprint@<hash>` | W3's manual drafting is seeded; nothing else skipped |
| 3 | Story from a moral lesson or theme | `central_theme` statement + config | `blueprint@<hash>` (theme fixed) | W2 |
| 4 | Adapt a Bible passage | citation + translation registry key | `srcref_` + `blueprint@<hash>` | W2; adds scripture validators (`D-08`) |
| 5 | Transform inspirational prose into a storybook | existing prose text | imported `blk_` staging set → `blueprint@<hash>` | W2 |
| 6 | Expand a short outline | outline text | `blueprint@<hash>` (`progression[]` from the outline) | W2 |
| 7 | Import an existing story | file / plain text + config | imported `blk_` staging set → `blueprint@<hash>` | W2 |
| 8 | Revise an existing book | source `prj_` id | new `ms_rev` branch | W1 config inherited, W2, W3 (unless the blueprint changes) |
| 9 | New edition using an existing design | source `prj_` + `dsg_rev` | new `prj_` with `dsg_rev` pointer set + first `ms_rev` | W8 (design reused) |
| 10 | Reusable storybook template | template id (`profiles/` + `themes/` + `tpl_` + blueprint skeleton) | new `prj_` + `blueprint@<hash>` skeleton | W2; W8 when the template fixes the design |

**Modes 5, 6, 7** enter W3 with a staging set (not a committed `ms_rev`) so that `05` §1.2's gate still governs the first manuscript revision. **Mode 8** begins at `review`/`drafting`, not `blueprint`, unless the blueprint itself is edited (then W3 re-runs).

---

## 6. Revision and re-entry workflows

§6.2 ends "users should be able to revisit page composition after editorial revisions"; §11.2 provides the workspaces to do it. This section gives the **invalidation chain** and the **targeted revalidation scope** for each re-entry path. It **extends** the invalidation table in `05` §2.7 and does not contradict it; every revalidation is targeted, never total (§12.5, §6.11).

### 6.1 Back to the manuscript, after composition

**Trigger:** a new `ms_rev` (a proposal applied, or a manual prose edit) while a `cmp_rev` exists.

```
new ms_rev
  └─▶ cmp_rev.ms_rev ≠ current pointer                (04 §5.1)
        └─▶ cmp_rev.approval_state → stale            (04 §5.1)
              └─▶ val_rev judged on the old triple → stale   (04 §7.2 judged{})
                    └─▶ apr_ → stale, stale_reason = "manuscript_revision_changed"   (04 §7.3)
                          └─▶ art_ exportability lost: EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION  (04 §10)

new ms_rev + a frozen print page whose block grew
  └─▶ PRINT_FROZEN_OVERFLOW  → project.stage := composition_stale   (D-05)
```

**Targeted revalidation scope:**

| Revalidate | Scope | Why this is sufficient |
|---|---|---|
| Digital + print pagination | only pages whose spans include a **changed** block | measurement is a pure function of `(triple, viewport)`, cached (`03` §5.1) |
| Content validators | only the changed blocks | `D-12` cache keyed by block `text_hash` |
| Layout validators | the affected pages only | geometry is local to a page (§12.5) |
| Beat-span validators | only if a block moved between beats | `05` §1.3 |
| Approvals | set to `stale`, never deleted | `05` §2.7 |

**Property that limits the blast radius:** block ids are stable, so a text edit changes only a block's `text_hash`, never its page span (§12.2, `05` §1.3). If the edit does not change the block's occupied lines, the plan is byte-identical and the `cmp_rev` hash does not move — **no invalidation at all.**

### 6.2 Back to the blueprint, after drafting

**Trigger:** the blueprint revision changes — a `progression[]` entry added, removed or reordered.

```
blueprint revision changes
  └─▶ deriveBeats() re-run                       (05 §1.3)
        ├─▶ removed beat's blocks: BEAT_ORPHANED_BLOCKS (blocks are NOT deleted)  (05 §1.3)
        └─▶ ms_rev.beat_order changes → new ms_rev
              └─▶ cmp_rev.logical.beat_order no longer a permutation → COMP_ORDER_CONTRADICTS_BEAT_ORDER  (04 §10)
                    └─▶ cmp_rev → stale → val_rev stale → apr_ stale, stale_reason = "beat_order_changed"
                          └─▶ page_turn_suggestions referencing removed beats are invalidated
```

**Targeted revalidation scope:**

| Revalidate | Scope |
|---|---|
| Beat-span validators | changed / removed beats only |
| Composition re-solve | pages containing an affected beat |
| Content validators | orphaned blocks (`BEAT_UNASSIGNED_BLOCK`, `BEAT_ORPHANED_BLOCKS`) |
| Page-turn suggestions | suggestions whose beat no longer exists |
| Approval scope "Story beat order" | invalidated by the reorder (`05` §2.7) |

### 6.3 Back to design, after print pagination

**Trigger:** a `dsg_rev` change (a token edit in the Design Studio).

```
dsg_rev changes   (automatic ops honour design_lock — 07 §2)
  └─▶ cmp_rev.dsg_rev ≠ new pointer                       (04 §5.1)
        └─▶ geometry is global → BOTH plans re-measured and re-solved   (D-13)
              ├─▶ digital page_count_range may change
              └─▶ print page_count may change
                    └─▶ if print was frozen: frozen pages re-checked → PRINT_FROZEN_OVERFLOW possible
                          └─▶ composition_stale   (D-05)
                                └─▶ val_rev stale → apr_ stale, stale_reason = "typography_changed"
```

**Targeted revalidation scope:**

| Revalidate | Scope |
|---|---|
| Digital + print pagination | **all pages of the affected plan** (geometry is global — `05` §2.7 "Typography size") |
| Content validators | **not re-run** (`05` §2.7) |
| Design validators | font licensing + embedding (`D-09`), token completeness |
| Approvals | `visual design` scope always; `digital reading composition` and `fixed print composition` scopes if the plan moved (`05` §2.7) |

### 6.4 Extended invalidation matrix

Superset of `05` §2.7's "change → revalidate" table; the **bold** rows are the additions this document makes for the re-entry paths above. No `05` §2.7 row is altered.

| Change | Revalidate | Source |
|---|---|---|
| One block's text | that block's page(s), digital + print; content validators for that block only | `05` §2.7 |
| Typography size | all pages of the affected plan; content validators **not** re-run | `05` §2.7 |
| One lock | pages containing the locked scope only | `05` §2.7 |
| Front matter | print pages 1..k and the total page-count parity check | `05` §2.7 |
| **Blueprint `progression[]` reorder** | beat-span validators for changed beats; re-solve pages holding affected beats | §6.2 |
| **A beat removed** | orphaned blocks + their pages; invalidate page-turn suggestions for the beat | §6.2 |
| **A block moved between beats** | both beats' spans; the pages holding either | §6.2 |
| **A proposal applied to unlocked, unapproved content (autonomous)** | identical to the human-applied case for the same change | §6.1, §4.1 |
| **A `dsg_rev` token that is a `design_lock` target attempted by an automatic op** | refused, not revalidated (`DESIGN_LOCK_VIOLATED`); a *user* edit always proceeds | `07` §2 |
| **Frozen print page overflows after any of the above** | the affected frozen pages; `composition_stale`; render refused | `D-05` |

---

## 7. Failure and resumption workflows (§12.5, §15.5)

All AI and render work is a **checkpointed, resumable `job_`** (`D-17`, `03` §8): each step is atomic and idempotent, its result is written **before** the next step starts, and the terminal states are `succeeded | failed | abandoned | cancelled`. The studio **subscribes to a job id; no request blocks for the length of a render** (`03` §8).

| Failure | Detected as | Checkpointed | Resumption | What the user sees | Code |
|---|---|---|---|---|---|
| **Provider failure mid-draft / mid-review** | a step returns a provider error; the cached replay is checked first | last completed step; provider **cache keyed by `(prompt hash, input hash, provider, model)`** (`03` §7) — a replay is byte-identical and not re-billed | the job resumes; cached calls replay without re-spending | the job panel: failing step, provider id, attempt *n*/*N*, a **Resume** action | `OPS_PROVIDER_UNAVAILABLE` |
| **Rate limit** | provider throttle response | same cache; step `attempts++` with the bounded-retry policy (§12.5 "bounded retries") | resumes after backoff, or fails over to the routing fallback list (`03` §7) | "waiting on provider" with an elapsed timer | `OPS_PROVIDER_RATE_LIMITED` |
| **Crash mid-render / mid-export** | process death; job left `running` | **rendering is chunked per page**, a checkpoint after each page (`03` §8): a 200-page export dying at page 187 resumes at 187 | server restart **re-queues `running` jobs at their last checkpoint** (`03` §8) | on restart the jobs resume; an export that cannot finish is **not published** (whole-or-nothing, `03` §10) | `OPS_JOB_INTERRUPTED` |
| **Crash mid-measurement** | process death | measurements cached at `.cache/measure/<hash>.json` (disposable, reproducible — `03` §5.1) | re-measure is free and identical | transparent | — |
| **Abandoned job** | attempts exhausted on a step | terminal state; **no revision was committed** (applies are per-revision atomic) | re-queue from the last checkpoint; `resumes++` | the job shows `abandoned`, the failing step, and a **Resume** action | `OPS_JOB_ABANDONED` |
| **Interrupted apply** | crash between proposal-apply and commit | applies are atomic per revision | either the revision exists or it does not — **never partial** | the revision list shows the pre-crash revision; the proposal is still `proposed` | — |
| **Structured-output failure** | a proposal fails its `jsonSchema` | the call is a failed step | retried up to the bound, then `abandoned`; free text is **never** regex-parsed (`03` §7) | the schema mismatch is shown verbatim | `OPS_PROPOSAL_SCHEMA_INVALID` |

**Finding codes** above are in the `OPS_` family and must be **registered in `11-validation-strategy.md`** (the code registry owner) before use.

**Two invariants that survive every failure:**
1. A failed job never leaves a revision half-written (`D-17`, W-1) — so "the project is always openable" (§1.3 "recoverable, editable, version-controlled") holds.
2. A failed render never yields a partial artifact that *looks* complete (`03` §10, `07` §5.4 rule 2).

---

## 8. Workflow coverage matrix — §14's required demonstrations

§14 lists 18 demonstrations the vertical slice must produce; `16-reference-story-acceptance-tests.md` owns them as `A-01`…`A-18` (`00-README` §3.2). Mapping to this document's stages:

| Demo (§14) | `A-` | Produced by | Notes |
|---|---|---|---|
| 1. Generate a story blueprint | `A-01` | **W3** | gate in `05` §1.2 |
| 2. Generate and review the manuscript | `A-02` | **W4 + W5** | draft → review, both proposal-mediated |
| 3. Identify story beats | `A-03` | **W3** (`deriveBeats()`), consumed in **W6** | `05` §1.3 |
| 4. Propose page compositions | `A-04` | **W6** | §6.2 steps 1–8 |
| 5. Open the Page Composition Editor | `A-05` | **W7** | §6.3 |
| 6. Move a story beat to another page | `A-06` | **W7** | `move` → new `cmp_rev` + `act_` |
| 7. Insert a deliberate dramatic page break | `A-07` | **W7** | `intentional_break` (+ `S2` lock) |
| 8. Lock a passage and a page-composition rule | `A-08` | **W7** | `content_lock` + `page_break_lock`/`print_page_lock` |
| 9. Apply a text-based visual template | `A-09` | **W8** (defined) / **W7** (assigned) | §6.8, `tpl_` |
| 10. Preview the interactive desktop book | `A-10` | **W9** | spread when space allows (§7.1) |
| 11. Preview the responsive mobile edition | `A-11` | **W9** | single-page at 360×640 |
| 12. Generate a fixed-page print proof | `A-12` | **W10** | `proof_sheet` |
| 13. Verify page borders and text boundaries | `A-13` | **W10** (findings) + **W11** (validation) | §9.2, §10.4 |
| 14. Generate a standard reading PDF | `A-14` | **W12** | `reading_pdf` |
| 15. Generate the imposed booklet PDF | `A-15` | **W12** | `booklet_pdf`, `10-*` arithmetic |
| 16. Inspect the booklet sheet arrangement | `A-16` | **W10** (preview) + **W12** | §9.4/§9.5 verification before download |
| 17. Approve the final publication | `A-17` | **W11** | `apr_`, user only (§3.6) |
| 18. Successfully print and assemble a physical booklet | `A-18` | **W12b** — manual, recorded on `Approval.manual_proof` | excluded from automated gates (`17` Part C) |

Every demo is reachable from the canonical workflow; none requires a stage this document does not define.

---

## 9. What is explicitly NOT automated anywhere in the workflow — and why

The product's central refusal rule (`00-README` §4.5, `07` §1): *anything that violates an intentional decision must be either impossible or visible — never quiet.* The following are therefore **never** performed autonomously, in any state, under any mode:

| Never automated | Why | Source |
|---|---|---|
| **Creating or restoring an approval** | §11.3 "must not silently change … approved material"; the author owns the decision | `D-11`, §3.6, `17` Part C |
| **Mutating prose from an AI response** | approved text must not be silently altered | `D-11`, §1.3, §15.1 |
| **Applying a proposal to locked or approved content** | refused **at creation**, where the intent is formed | `D-11`, `07` §E2 |
| **Releasing / weakening / re-scoping a lock** | a lock is the author saying "this was intentional" | `07` §5.4 rule 1, §6.9 |
| **Choosing which lock to drop on a hard conflict** | the choice is the author's intent, not the machine's | `07` §5.2 |
| **Auto-resolving a hard/soft lock conflict by reflow** | conflicts are *identified*, never overridden | §6.9, `07` §5 |
| **Reflowing a frozen print page** | the physical object may already exist | `D-05` |
| **Falling back to a "closest possible" plan** | a partial artifact that looks complete is the failure mode the product cannot afford | `07` §5.4 rule 2 |
| **Changing content to change meaning (expand/condense)** | editorial changes affecting meaning require approval | §6.7, §10.5 steps 6–7 |
| **Silently repairing a composition that references a deleted block** | forces re-apply rather than a quiet fix | `05` §1.3 |
| **Mid-story padding to reach a page count** | content quality governs | `D-16` |
| **Substituting an unlicensed font or unlicensed scripture translation** | a legal defect, not a quality defect | `D-09`, `D-08` |
| **Signing off scripture/factual verification** | "the author should approve significant adaptations" | §4.3 |
| **Overriding a blocking critical finding** | critical errors block final approval | §10.5, §15.5 |
| **Exporting from an unapproved or stale revision** | exported files must match the approved revision | `04` §7.3, §15.5 |
| **Publishing to a public URL** | a hosted copy is a different thing from a file the author owns | `D-19`, `Q-08` |

**The one automatic behaviour that is *not* a mutation of intent** — and therefore permitted — is the §10.5 correction ladder **steps 1–4** (fix geometry → recalculate pagination → reflow *unlocked* text → adjust spacing inside the declared tolerance band). These change no words and no approved decision; step 5 (flag composition conflicts) and steps 6–8 (propose revision → obtain approval → rerun validations) are where the machine stops and the author acts.

---

## 10. Traceability

| Requirement cluster | Where this document answers it |
|---|---|
| §3.1 ten creation modes | §5 (table) |
| §3.2/§3.3 configuration and presets | W1 |
| §4 blueprint + beats, §4.3 scripture | W2, W3 |
| §5 generation, review, controlled revision | W4, W5 |
| §6.2 composition workflow | W6, §2.2 |
| §6.3–§6.9 editor, beats, turns, density, layouts, locks | W7 |
| §6.11 composition approval | W11, §3.3 |
| §7 responsive HTML | W9 |
| §8, §9.2 design + borders | W8 |
| §9.1–§9.4 print + imposition | W10, W12 |
| §10.5 automated correction ladder | §9 |
| §11.2 workspaces, §11.3 user control | §3.1, §4 |
| §12.5 efficient processing | §6.1, §7 |
| §14 reference demonstrations | §8 |
| §15.5 operational quality | §7, §11 |
