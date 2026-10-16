# Decisions and Open Questions

**Status:** draft for ratification by Stephen
**Purpose:** the product specification (`docs/source/STORYBOOK-STUDIO-SPEC.md`) is a complete statement of *intent* but it is not, and should not be, an engineering specification. It leaves roughly two dozen implementation-deciding questions open. This document separates them into two lists:

- **D-xx — Decisions taken.** The spec is silent (or ambiguous) and an implementer must choose. A choice has been made here so the rest of the architecture is concrete. Each entry states the choice, why, and the alternative that was rejected. **These are reversible by Stephen; they are not open for silent drift by an implementer.**
- **Q-xx — Open questions.** The answer depends on Stephen's preference, not on engineering. Each carries a **recommended default**, so no work is blocked while an answer is pending.

Every other document in `docs/` inherits this file. If a document contradicts a `D-xx`, the document is wrong.

---

## Part A — Decisions taken

### D-01 — One runtime, one layout authority: TypeScript/Node with a pinned Chromium

The Studio is a single Node.js/TypeScript codebase. Every measurement and every rendering that produces a page geometry — digital pagination, print pagination, PDF export — runs in **one pinned Chromium build** (Playwright's bundled Chromium, version recorded in the artifact manifest).

**Why:** §1.2 requires the HTML edition, the reading PDF and the booklet PDF to derive from "one approved manuscript and a shared design specification". Two layout engines (e.g. a browser for HTML and WeasyPrint/ReportLab for PDF) implement line-breaking, hyphenation, font metrics and float/inline behaviour *differently*; the two editions would then disagree about how much text fits on a page, and §15 acceptance ("exported files match the approved revision") would be unprovable. One engine removes the class of bug where the printed book and the on-screen book contain different text on different pages.

**Rejected:** Python + WeasyPrint (two layout authorities; CSS Paged Media support is close but not identical to Chromium's); ReportLab (hand-rolled line breaking — reimplementing a text engine is the single largest risk in the project); Node + a native PDF library for print (same problem).

**Consequence:** the whole stack is TypeScript. Python is not used anywhere in the runtime.

---

### D-02 — The Studio is a local-first web application

A Fastify HTTP server serving a React single-page application, bound to loopback/tailnet, storing projects on the local filesystem. No cloud service, no accounts, no per-project server-side state beyond the machine it runs on.

**Why:** the workflow in §11.2 is a visual workspace — page navigator, canvas, inspectors. §6.4 requires accessible *move commands* alongside drag, which means a real UI, not a CLI. §1.3 requires every project to be "recoverable, editable, and version-controlled" — a local filesystem store makes a project a directory a human can read, diff and back up.

**Rejected:** Electron desktop (packaging and auto-update cost with no benefit over a local server); CLI-only (cannot satisfy §6.3/§6.4); hosted multi-tenant SaaS (out of scope for V1; see Q-02).

**Consequence:** a headless CLI (`sbx`) exists alongside the server so that acceptance tests, CI and scripted builds do not require the UI.

---

### D-03 — A project is a directory of JSON documents, not a database row set

Canonical project state lives as plain JSON documents under a project directory (`project.json`, `manuscript/*.json`, `composition/*.json`, `design/*.json`, `approvals/*.json`, `validation/*.json`). A SQLite database is used **only** as a disposable index and job queue; deleting it must never lose project state.

**Why:** §12.2 requires separate records for sixteen kinds of project data, and §12.5/§15.5 require checkpointing and reproducibility. JSON documents are diffable, reviewable in a pull request, hashable for content addressing (D-10), and recoverable by hand if the app breaks.

**Rejected:** SQLite-as-source-of-truth (opaque history, painful manual recovery, poor diffability); a document store/service (violates D-02).

---

### D-04 — Pagination is a pure function; AI is never in the layout path

```
paginate(manuscript_revision, composition_revision, design_revision, target) -> PagePlan
```

is deterministic, has no network calls, and produces byte-identical output for identical inputs. AI appears in the system in exactly two roles: **producing prose proposals** (Content Engine) and **producing *suggestions* that are stored as data** — page-turn recommendations, density advice, structural critique. A suggestion is inert until a human or an explicit rule applies it, at which point it becomes part of a revision.

**Why:** §1.3 ("AI assists ... but does not replace deterministic formatting"), §12.4 ("Conventional code must handle typography measurements, page geometry, rendering, booklet imposition, and file validation"), §15.5 ("AI calls are focused and economical"), §15.4 ("Correct booklet page ordering").

**Rejected:** letting a model choose page breaks directly (non-reproducible, unverifiable, and it would violate "approved text is not silently altered").

---

### D-05 — Print pagination is frozen at approval; later overflow *re-opens* pagination

A conflict between two spec statements (§6.10 "print-specific page assignments should remain fixed once approved" and §9.3, which requires detecting overflow, proposing reflow and asking for revision) is resolved as follows:

1. Before approval, print pagination is recomputed freely.
2. At approval, the print `PagePlan` is frozen and recorded in the approval record.
3. After approval, if content or design changes such that a frozen page overflows, the system does **not** reflow silently and does **not** overwrite the approved plan. It emits a `PRINT_FROZEN_OVERFLOW` finding against the affected pages and moves the project to `composition_stale`. Editing is then explicitly re-opened by the user (one click, `Re-open pagination`), which creates a **new** composition revision; the approved one remains in history forever.
4. Renders that would require violating a frozen page are refused, never approximated.

**Why:** this is the only reading that satisfies both §6.10/§15.2 (stability, "print page assignments remain stable after approval") and §6.9 ("the system must identify the conflict rather than silently overriding the author's intent"). §9.3's step 5 — "request revision where necessary" — is exactly this re-open.

---

### D-06 — Two page counts, always labelled, never conflated

`digital_pages` (a range plus the reference viewports it was measured at) and `print_pages` (a single integer, always a multiple of 4 in booklet form) are distinct fields on every composition revision, displayed together in the dashboard, the Publication Center and every export manifest.

**Why:** §3.3 ("Do not equate reading-page count with printable-page count"), §6.10 (digital pagination may introduce additional pages), §7.4 (pagination is viewport-derived). A single "page count" number is the most likely place for this product to mislead its user.

**Consequence:** the dashboard (§11.1) shows e.g. `digital 9–18 pages (phone → desktop) · print 16 pages`. (`06` §3.4 now shows **`9–18`** for this fixture, matching `08` §3.8 — the owner of the pagination range — and marks the earlier `14–18` figure as wrong and superseded; `04` §5.1's `measured_at[]` carries the two endpoints. The disagreement is settled and `16` §10 item 15 is closed.)

---

### D-07 — Lock priority is explicit: hard locks have **precedence**, soft locks have **weights** *(amended after the external review)*

Six lock types with a defined priority and a defined violation policy. Priority has **two forms, and they are not the same mechanism**:

1. **Hard locks (`content_lock` H1, `print_page_lock` H2) have a total, strict, profile-independent precedence: H1 > H2.** It is enforced by *removing edges* from the solver's graph, never by a cost (`07` §4.4), so it is a genuine precedence: if the remaining graph has no `START → END` path, the solve fails with `COMP_LOCK_CONFLICT_HARD` and **no plan is emitted**.
2. **Soft locks (`beat_lock` S1, `page_break_lock` essential S2, `keep_together_lock` S3, `page_break_lock` preference S4) are weighted, not ordered.** They are costs, and the weights are per-profile data (`07` §4.3, D-15). The shipped weight vector deliberately does **not** follow the S-numbering — 3000 for an unmet S2 break, 800 per S3 group breach, 500 per S1 split — so the effective avoidance order in the default profile is **S2 > S3 > S1**. That is the product policy rather than an accident: §3 (`07` §3) makes an unmet essential break in print a gate for approval, an S3 breach a tolerance question, and an S1 split a disclosed soft violation.

**Two locks that cannot both hold produce a `CompositionConflict`, never a silent tie-break** — for the H1/H2 pair by construction, and for soft locks only in the **frozen** print plan (D-05: `COMP_FROZEN_LOCK_CONFLICT`, render refused). Two soft locks can never make an *unfrozen* plan unsatisfiable, because a cost cannot make a path not exist. The previous text of this decision claimed a total strict order `H1 > H2 > S1 > S2 > S3 > S4` together with a soft-lock `CompositionConflict`; the §4.3 weights invert that order and a DP can never produce that conflict, so both halves were corrected here and in `07` §2. Full rules in `07-lock-and-constraint-rules.md` §2 and §4.

**Why:** §6.9 requires "explicit priorities and scopes" but does not give them.

**Alternative rejected.** A **lexicographic** cost vector over the precedence classes — so that S1 always beats S2 always beats S3 whatever the profile weights — would let the old sentence stand literally. It was rejected because it inverts §3: the solver would then accept an unmet *essential break* (a print approval gate) to avoid splitting a *beat lock* (a disclosed soft violation), and the 3000 weight would become dead data that no plan could ever trade against. **The cost of the chosen resolution:** the soft-lock ordering is a numeric judgement living in profile data rather than a rule, so an unwise weight vector can express a policy the set does not intend. `COMP_PROFILE_INVALID` (major, `11` §2.2) plus the shipped defaults are the guard, and `11` §2.2's matrix tests (`T-CMP-080`…`092`) pin the *policy*, not a cost order.

---

### D-08 — Scripture text: public-domain translations only, by default

The scripture source registry ships with public-domain translations only (KJV, ASV, WEB, YLT). A copyrighted translation can only be used if a matching entry exists in the project's `licenses.json` recording the translation, the licence, and the scope of permitted use. Without that entry the import is **refused**, not warned about.

**Why:** §4.3 requires "verified Bible translations where available and appropriately licensed" and §15.1 requires references to be "appropriately verified". Embedding a licensed translation in a distributed HTML book or a PDF without a recorded licence is a legal defect, not a quality defect. The word "appropriately" is doing load-bearing work in the spec and this is what it means operationally.

**Rejected:** warning-only (the default outcome would be a distributed PDF with unlicensed text); shipping a licensed translation "for convenience" (same problem, worse).

**Footnote — the gate is not a capability removal, and "public domain" is jurisdictional** *(added after the external review; no change to the decision)*.

- **KJV is not unconditionally public domain.** In the United Kingdom the Authorised (King James) Version is protected by **Crown letters patent** (and the rights of the privileged presses), so "public-domain translations only (KJV, ASV, WEB, YLT)" is a statement about the *US* public domain, not a universal one. The registry therefore records a **`jurisdiction`** per translation (`scripture/registry.json`; `04` §8), and the licence check is jurisdiction-aware: a book distributed into a jurisdiction where the chosen translation is not free needs a `licenses.json` entry exactly as a copyrighted translation does. The reference fixture is unaffected — it uses WEB (Q-05), which is unencumbered in both jurisdictions.
- **D-08 is a licence *gate*, not a capability removal.** A copyrighted or jurisdiction-restricted translation is not *unavailable*; it is unavailable **until a `licenses.json` entry records it** (§4.3: "verified Bible translations where **available and appropriately licensed**"). The `licenses.json` path therefore preserves the capability in full — the refusal happens at import/proposal time and is recorded (`refusal.code`), which is an auditable gate rather than a permanent prohibition. Read as a removal, D-08 would forbid a licensed user from citing the Bible they have licensed, which nothing in the spec asks for.

**Recorded correction, not an edit, of `00`.** `00-README.md` §6 item 5 summarises this decision as "**Removes a capability the spec does not explicitly forbid**". Both halves of that sentence overstate: the capability is *gated, not removed*, and §4.3 does explicitly address licensing ("appropriately licensed"). `00` is not this document's file, so the correction lives here, at the decision the summary points to.

---

### D-09 — Fonts enter the system only through a licensing registry, and PDF embedding is a declared property

`fonts/registry.json` lists every font with: family, files, `license`, `embed_pdf` (bool), `subset_web` (bool), `language_coverage`, `metrics_hash`. A font with `embed_pdf: false` cannot be selected for a print design; a font without a licence entry cannot be selected at all.

**Why:** §8.3 — "Allow custom fonts only when the application can appropriately load, embed, and distribute them."

**Consequence:** the eight V1 themes ship with open-licence families (see `09-design-token-architecture.md`), and the print renderer asserts embedding succeeded before a PDF is declared valid.

---

### D-10 — Revisions are content-addressed

A manuscript revision, a composition revision and a design revision are each identified by `sha256` over a canonical JSON serialisation (sorted keys, no insignificant whitespace, explicit unit suffixes). A human-facing label (`ms-003`, `cmp-002`) is an alias on top of the hash, never the identity.

**Why:** §12.2 requires stable identifiers for blocks; §15.5 requires approved publications to be reproducible and exports to match the approved revision. A monotonic counter can be reset, forked or reused by a restore; a hash cannot. It also gives §12.5's "cached manuscript summaries" a natural cache key for free.

**Consequence:** "approved revision" is expressed as a triple of hashes; equality of two publications is decidable by comparing hashes, not by re-reading prose.

---

### D-11 — AI never mutates state; it returns Proposals that must be applied

Every AI-mediated operation returns a `Proposal` object (target refs, proposed change, rationale, provenance: provider, model, prompt hash, timestamp). Applying a proposal is an explicit action that creates a new revision. There is no code path from an AI response to a mutated manuscript.

**Why:** §1.3 ("approved text and intentional page composition must be protected against unrequested regeneration"), §6.9 (content lock), §11.3 ("must not silently change locked or approved material"), §15.1 ("Approved text is not silently altered").

**Consequence:** a proposal targeting content-locked material is *refused at creation*, not filtered at apply time.

---

### D-12 — Editorial review depth is a setting, and results are cached by content hash

Three depths: **L1 Structural** (§5.2 developmental + structural), **L2 Line + copy** (line editing, copyediting, proofreading), **L3 Full** (L2 + specialized scripture/factual verification). Results are cached keyed by `(block hash, depth, review profile)`. Unchanged blocks are never re-reviewed.

**Why:** §5.2 lists six review layers that, run on every pass over every block, is the single most expensive behaviour in the product — the opposite of §12.5 ("Avoid regenerating complete books when only one page, paragraph, or design parameter has changed") and §15.5 ("AI calls are focused and economical"). It also makes review results *inspectable data* rather than an invisible step.

**Rejected:** always running all six layers (cost, and §5.3's "Changes must remain localized" is better served by reviewing the blocks that changed).

---

### D-13 — Composition always runs against a concrete design revision

A project is created with a default theme, producing a real `design_revision` immediately. Page composition is therefore always computed against actual font metrics, not estimates. A design change re-paginates and may produce a `CompositionConflict` against locks.

**Why:** §6.2 wants an initial composition *before* the Design Studio stage in §11.2's navigation order, but §6.7 requires density to be judged on "actual font metrics" and §6.2 step 3 is "estimate available content space". Estimated space before typography exists is the mechanism by which §15.4's "no clipped or overlapping text" fails late and expensively.

**What the measurement is taken on, at blueprint time.** "Measured on a concrete design revision" needs a *text* to measure, and at blueprint time no prose exists. `05` §1.6 item 6 therefore defines a fixed, version-controlled **`measure_probe`** per (language, audience band), measured through the same bridge at the reference page box; `words_per_line_measured` and the resolved density band are both re-derived from it whenever the design revision changes. Without that definition the cited figure was an `[A]` value scaled from another `[A]` value, and D-13's "measurement rather than an estimate" had nothing to point at.

**Rejected:** computing composition against a nominal "average" text box (guarantees a re-pagination surprise later).

---

### D-14 — Reproducibility requires environment pinning, recorded in every artifact

Every exported artifact carries a manifest recording: engine version, **Chromium build id**, font file hashes, theme token hash, imposition spec version, **the PDF assembly library and its pinned version**, and the revision triple. An artifact whose manifest cannot be reproduced on the recorded environment is reported as `unreproducible`, not as valid.

**The PDF assembly library is part of the environment even though it does no typesetting.** `10` §8.2 forbids re-rendering a booklet, so the imposed PDF is assembled by **placing the already-rendered Chromium pages 2-up with a PDF library** — the parent's ruling names **`pdf-lib`**. It must therefore be named and pinned like every other input:

- **name**: `pdf-lib`;
- **pinned version**: recorded in the repository's dependency lockfile and copied into the manifest at build time. This register deliberately names **no version number**: the pin is a build input, not a design decision, and a version written into a specification is stale the day it is written. What is normative is that the field exists, is pinned, and is compared on reproduction — a manifest missing it is `OPS_MANIFEST_INCOMPLETE` (`11` §2.5), and Phase 6 pins it as an exit criterion (`13` §3.6);
- **ownership**: the manifest's field list belongs to `12-approval-and-versioning-workflow.md` §6; this decision states *what must be recorded*, `12` states *where*. `04` §7.3's `Approval.environment` and §7.4's `Artifact.manifest` reference it rather than duplicating the list.

A PDF writer stamps `/CreationDate`, `/ModDate` and `/ID` by default, which would make two byte-identical renders differ. Those fields are **normalised** (fixed values or values derived from the revision triple) because `T-OPS-004` and `T-PRT-001` assert byte identity across runs; the normalisation rule is the renderer's (`03` §5.3, `10` §8.2), and it is recorded here because it is the same reproducibility requirement that names the library.

**Why:** §15.5 ("Approved publications are reproducible") is not achievable from content hashes alone — the same markup typesets differently under a different Chromium build or a substituted font.

---

### D-15 — Publication types are data, not code paths

Each §2 publication type is a **publication profile**: a JSON document toggling rules (which review layers default on, whether scripture refs are expected, default theme, default length preset, required front/back matter, density tolerances for the age band). Adding a publication type is adding a file.

**Why:** §2 closing line — "Publication-specific rules should be implemented through extensible configurations rather than entirely separate applications."

---

### D-16 — **`target_print_pages` governs; the word budget is derived from it** *(amended after the external review — see the quotation below)*

**The superseded wording this replaces — quoted in full so the change is visible (do not implement this):**

> ### D-16 — Length targets are word budgets and beat counts; page counts are outputs
>
> A project's target length is expressed as `target_words ± tolerance` and `target_beats`. `target_print_pages` is a **soft aim** with two permitted consequences: (a) front and back matter may be padded to reach a multiple of four, (b) an under-length manuscript is reported as a content finding for the author to resolve. Mid-story padding is never permitted, and text is never expanded merely to fill pages.
>
> **Why:** §1.3 ("Content quality takes precedence over arbitrary word counts"), §5.1 ("must avoid filler ... or artificial expansion solely to fill pages"), set against §3.3's minute-based presets and §14's "12 or 16 pages". Something has to arbitrate; prose quality is the stated priority, so it arbitrates.

**Which half changed, and why — the concession, stated plainly.** The old entry used §1.3's "content quality takes precedence over arbitrary **word counts**" to make *word counts* the governing length target. That is a misreading, and it is the substantive error: §1.3's sentence protects prose from padding and expansion — it does not nominate word count as the target. The spec names **page count** as a user target where it names a length at all: §3.2 ("Target printable booklet-page count", alongside "Target word count" — both are wizard inputs, and the *page* one is the one §14.1 and §18 then use), §14.1 ("**Print Length:** 12 or 16 pages, including appropriate front and back matter") and §18's canonical request ("Create a **16-page** children's Bible storybook…"). A word count is a *means*; the page count is the thing the user asked for and the thing the physical booklet either is or is not. The old entry's justification is therefore withdrawn.

**The amended decision:**

1. **`target_print_pages` is the governing length target.** It is fixed at **blueprint time**, not a mere aim: `story_pages_target = target_print_pages − front_matter_pages − back_matter_pages`, and `target_words` is **derived** from it as

   ```
   target_words = story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words
   balanced_lines_per_page = floor(resolved_density_band.dense_above × available_height_q / line_height_q)
   ```

   — i.e. at the **ceiling of the resolved density band, less a stated reserve**, not at 100 % page fill, because the solver's cost function exists to keep a page inside that band and will otherwise leave the target by adding pages (`07` §4.2–§4.3). Both the words-per-line figure and the band are **measured/resolved on the project's concrete design revision**, which D-13 is what makes possible rather than estimated; the words-per-line figure is measured on a fixed **`measure_probe`** (`05` §1.6 item 6), so it is reproducible at blueprint time rather than assumed. The blueprint gate (`05` §1.2) refuses drafting until the derived budget is present. The formula, the units and the measurement's provenance are in `05` §1.6.
2. **A print page count that misses the target is reported, not absorbed.** `PRINT_PAGE_COUNT_OFF_TARGET` (major, blocks approval until waived; registered in `11` §2.4) fires when `print.page_count ≠ target_print_pages` **after** the pad-to-a-multiple-of-four step. It is owned by `docs/11` and is named — never redefined — in `04` §3 and §10, `05` §1.6 and Part 3, `07` §4.3 and `13` §3.6. Note that the solver's `page_count_penalty` stays deliberately low (`07` §4.3): the machine must not buy the page target by densifying pages, so the miss is surfaced to the author.
3. **What survives from the old entry, unchanged, and is the reason this is an amendment rather than a reversal:** mid-story padding is **never** permitted (`COMP_IMPOSITION_PADDED_MIDSTORY`); text is **never** expanded to fill pages (§5.1, `CONTENT_FILLER_DETECTED`); and a word count never overrides content quality — an under-length manuscript is reported (`CONTENT_LENGTH_UNDER_TARGET`, major, non-blocking) for the author to resolve, rather than fixed by the machine. **Padding front and back matter to a multiple of four remains the only permitted padding** (§9.4, `08` §9.5).
4. **Reading minutes are computed, not assumed.** §3.3's presets are stated in minutes and §3.2 requires a reading duration, so the minute figure is a *derived* output of the word count: `reading_minutes = round(words / rate_words_per_minute(age_band), 1)`, with the per-band rate table in `05` §1.6. This is what makes `R-GEN-014`'s "reading minutes recomputed" a computation with a definition rather than a restatement, and it removes the last place where a length figure had no arithmetic behind it.

**Why (amended):** §3.2 (page count is a wizard input), §14.1 and §18 (both express the benchmark in pages), §3.3 (presets in minutes, which are therefore derived), §5.1 and §1.3 (protect prose — the *quality* half, which is retained above). Where the page target and a word estimate disagree, the page target governs; where *content quality* and the page target disagree, quality governs and the miss is **reported** — which is the whole of the old entry's defensible content, now subordinate to the target instead of substituting for it.

**Rejected:** keeping page count as an advisory aim (the review's blocker 3: the fixture's own parameters miss §14.1 by four pages and nothing fired); and letting the solver raise `page_count_penalty` to force the target (it would trade readability for a number, which is the failure §1.3 and §5.1 exist to prevent).

**`00-README.md` §6 item 4 corrected.** `00` §6 item 4 previously listed "D-16, length as words not pages" as a review target — the reverse of this decision. It has since been corrected in `00` itself (the page target governs; the word budget is derived from it), so that review target is retired and the two documents now agree.

**Consequence for the reference fixture.** `16` §1.2's parameters are re-derived from this amendment. Old sets of them failed for several different reasons: `target_words 1400` was *authored* and landed on **20** print pages with nothing firing; the derived replacement `1314` was arithmetically correct and **still** landed on `M = 20`, because it was derived at 100 % page fill while the solver prefers twelve balanced pages to nine dense ones; and the replacement's own central input, `words_per_line_measured`, was wrong three times in turn. `7.3` was **never measured** — the probe file `05` §1.6 item 6 names had not been created, so it rested on a number nothing produced. The first real measurement of that probe, `7.9`, was taken by counting `Range.getClientRects()` **fragment** rects (`25`) instead of line boxes. That was corrected to `8.6` by the right instrument — element height ÷ line pitch — but in the **wrong face**: the harness never loaded the design's font (it called `document.fonts.load()` with the whole quoted family stack, which resolves without loading anything), so Chromium rendered a fallback while `document.fonts.check()` still said the family was available. Measured at last in the face the book ships — `app/assets/fonts`, Lora — the probe is `197 _words_` over `25` line boxes, so `words_per_line_measured = 7.9` and the derivation gives `1106` words (`9 × 16 × 7.9 − 31.6 = 1106.0`), landing on `M = 16`. The arithmetic — the pad-to-a-multiple-of-four step, the solver's penalty comparison, and why the `0.88` default band would give `1248` and the same verdict — is in `16` §1.2 and §1.2.1. The *line-based* parameters (`balanced_lines_per_page 16`, `capacity_lines_per_page 20`, `story_pages_target 9`, the `144`-line tipping point) are unchanged: they depend on the box and the band, not on words per line. **Two consequences this amendment did not anticipate.** First, the quoted verse passages occupy `26` line boxes the length model never counted, so prose plus headings plus the verses is `149` lines `= 0.8278` fill — above the resolved `dense_above` of `0.78`. Second, and more fundamental, the budget's **input** is wrong: the nine story pages are not all prose, so the word budget must be derived from the lines **available for prose** after the non-prose roles are reserved (`144 − 26 − 1 = 117` lines → `924 _words_`), never from the total (`05` §1.6 item 7; `R-WIZ-017`). Either the verse passages take their own pages (`quotation_page` / `scripture_reference`) or the story needs a tenth page and `M = 20`; that is the composition pass's decision, and the build's own composition returns **20** printed pages for exactly this reason (`05` §1.6 items 6–7, `16` §1.2).

---

### D-17 — All AI and render work runs as checkpointed, resumable jobs

Ideation, drafting, review, suggestion generation and every render are jobs with a persisted state, a step list, and a checkpoint after each step. A job interrupted by a crash, a rate limit or a provider fault resumes from its last checkpoint. §12.5's "Bounded retries" is implemented per step with a maximum attempt count and an explicit `abandoned` terminal state.

**Why:** §12.5 ("Automatic checkpointing"), §15.5 ("Failed steps can be resumed"). It also prevents the worst UX failure in the product: losing a composed book to a provider timeout.

---

### D-18 — Identifier scheme

| Kind | Form | Identity |
|---|---|---|
| Mutable entity (project, block, beat, lock, job, page) | `prj_01HX…`, `blk_01HX…`, `beat_…`, `lck_…` | ULID, stable forever, never reused |
| Manuscript / composition / design / validation revision | `ms_9f3a…`, `cmp_9f3a…`, `dsg_9f3a…`, `val_9f3a…` | content hash (D-10) |
| Approval | `apr_01HX…` | ULID, references a revision triple |
| Artifact | `art_01HX…` | ULID, references approval + manifest |

Block IDs survive all revisions (§12.2: "revisions do not require rebuilding all composition data"). A block is never deleted-and-recreated to express an edit; it is superseded, preserving its ID and gaining a new hash.

---

### D-19 — Published HTML books are standalone files; publishing to a URL is an explicit, separate action

The deliverable of §7 is a **self-contained directory** (or a single HTML file with inlined CSS, fonts subset and base64-embedded) that works offline from `file://`. Publishing a book to a public URL is a distinct action with its own record, because §1.2 requires the artifact to be distributable and a hosted copy is a different thing from a file the author owns.

**Why:** §1.2 ("standalone fullscreen, responsive digital book"), §15.3 ("Works in modern desktop and mobile browsers"), and operational reality on this host — see Q-08.

---

## Part B — Open questions for Stephen

Each has a recommended default; none blocks progress.

| ID | Question | Recommended default | Affects |
|---|---|---|---|
| **Q-01** | Primary user surface — local web app on the workstation, desktop app, or CLI-only? | Local web app + headless CLI (D-02) | Packaging, auth, Phase 1 shape |
| **Q-02** | Is Storybook Studio a **product you ship or sell**, or a personal studio tool? | Personal studio tool for V1; keep the codebase publishable (no secrets, licence-clean assets) so the decision stays open | Auth, multi-user, onboarding, licensing of bundled fonts |
| **Q-03** | Which AI provider(s) should be the default, and do you want per-task model routing (e.g. cheap model for copyedit, strong model for developmental review)? | Provider-agnostic with per-task routing configured in one file; default to a local/cheap model for L1/L2 and a strong model only for L3 and ideation | Provider adapters, cost profile, §12.4 |
| **Q-04** | Which physical booklet size do you actually print on? half-letter (US Letter folded) and A5 (A4 folded) are the spec's presets — is there a third you use? | Ship both presets; add a third only when you have printed one | Print engine presets, Phase 6 |
| **Q-05** | Preferred Bible translation for the David & Goliath benchmark (public-domain only per D-08)? | **WEB** (World English Bible) — modern English, reads better aloud to ages 6–10 than KJV | Reference project content |
| **Q-06** | Should the David & Goliath reference book ship **inside the repo** as a test fixture, or as a separate example project? | Inside the repo as the acceptance fixture — §15.4's print criteria are only testable against a fixed book | Repo layout, test plan |
| **Q-07** | Review cadence: do you want an early preview release after Phase 3 (working HTML reader) to check direction, or a single review at the end of Phase 5? | Early preview after Phase 3 — the reader is the first artifact you can judge as a *book*, and it is the cheapest point to change visual direction | Roadmap gates |
| **Q-08** | Should the Studio be able to publish a finished book to a public URL, or is a standalone file always the end state? | Standalone file for V1 (D-19); add publish-to-URL once the print path is proven | Deployment, Phase 4+ |
| **Q-09** | The spec states reading durations in **minutes** (§3.3's presets, §14.1's "approximately 5–10 minutes") and a word target in §3.2, but supplies **no words-per-minute rate anywhere** — so the two were never convertible. `05` §1.6 now defines `reading_minutes = round(words ÷ rate_words_per_minute(age_band), 1)` with a stated rate per age band (120 / **150** / 180 / 220 `_words_per_minute_` for 0–5 / 6–10 / 11–14 / 15+; the 6–10 figure rests on the 150–160 wpm audiobook-narration band and sits below the measured 184 ± 29 wpm adult read-aloud rate). **Do those rates match how you expect these books to be read?** | Keep the table, and keep it as **profile data** (D-15) so it is a config edit rather than a code change | The derived word budget, every `reading_minutes` figure shown to the author, the §14.1 fixture's 5–10 minute check, `R-GEN-014`'s recomputation |

---

## Part C — Spec text that cannot be implemented as written

Recorded here so it is not "discovered" mid-build as a surprise. Each is resolved by a `D-xx` above; this list exists so the resolution is visible next to the original wording.

| Spec wording | Problem | Resolution |
|---|---|---|
| §6.10 "Page breaks designated as essential should be preserved **where feasible**" vs §6.9 "the system must identify the conflict rather than silently overriding the author's intent" | "Where feasible" has no operational meaning; as written it licenses silently dropping a break the author marked essential | D-07: an essential break is a *soft-hard* constraint — it may be unmet only if reported as a `BREAK_UNSATISFIED` finding. **Amended after the review:** "and never when the unmet break would also break a `beat_lock`" is not a precedence rule a DP can enforce, because both are costs; it is what the shipped **weights** enforce (an unmet S2 break costs 3000 against 500 for an S1 split and 800 for an S3 breach, `07` §4.3), so it holds for the default profile and is guarded by `COMP_PROFILE_INVALID` |
| §6.10 "Print-specific page assignments should remain fixed once approved" vs §9.3 (detect overflow → propose reflow → rerender) | Directly contradictory unless reflow requires re-opening approval | D-05 |
| §3.3 length presets in **reading minutes** vs §14 "Print Length: 12 or 16 pages" and §6.2 "estimate available content space" | Nothing states which target governs when they disagree. §3.2 offers both a "Target word count" and a "Target printable booklet-page count" and does not say which arbitrates | **D-16 as amended**: `target_print_pages` governs, and `target_words` is *derived* from it at blueprint time using words-per-page measured on the concrete design revision (`05` §1.6; D-13 is what makes it measurable). A page count that misses the target is `PRINT_PAGE_COUNT_OFF_TARGET` (`11` §2.4) — reported, never absorbed by padding or prose expansion |
| §3.3 presets are stated in **reading minutes**, §3.2 asks for a "Target word count", §14.1 states a duration ("Approximately 5–10 minutes") | **No words-per-minute rate exists anywhere in the spec**, so a minute figure and a word count were never convertible; D-16's original word-only model had no way to honour §3.3's presets | `05` §1.6 defines `reading_minutes = round(words ÷ rate_words_per_minute(age_band), 1)` with a per-band rate table, so `R-GEN-014`'s "reading minutes recomputed" is a computation. The rate is an **authored assumption** (`[A]`) — the spec supplies none — stored as publication-profile data (D-15) and listed for ratification in `13` §4.4 |
| §5.1 "must avoid filler … or artificial expansion solely to fill pages" vs §9.4's pad-to-a-multiple-of-four | Read together, the first can be read as forbidding the pad the second requires | Padding is permitted **only** at the front/back-matter boundary and only to reach a multiple of four (§9.4; `08` §9.5). Mid-story padding is `COMP_IMPOSITION_PADDED_MIDSTORY`; expanding prose to *avoid* a pad is `CONTENT_FILLER_DETECTED`. Both halves are stated in D-16 as amended |
| §6.2 orders composition **before** design, but §6.7 requires density to be judged on "actual font metrics" | Composition against estimated metrics guarantees re-pagination after design | D-13 |
| §6.10 "Digital page counts may change when typography or viewport dimensions change" + §15.2 "Print page assignments remain stable after approval" | Both are correct but nothing requires the *product* to disclose both numbers, so a user reads "page count" as one fact | D-06 |
| §15.5 "Approved publications are reproducible" with no environment pinning stated | Content hashes alone do not reproduce a typeset page | D-14 |
| §5.2 six review layers on every pass vs §12.5 "avoid regenerating complete books" / §15.5 "AI calls are focused and economical" | Unbounded cost, and the two requirements cannot both hold under a literal reading | D-12 |
| §4.3 "verified Bible translations where available and appropriately licensed" | No operational meaning; the default behaviour would be distributing licensed text | D-08 |
| §14 required demonstration 18 — "Successfully print and assemble a physical booklet" | Not machine-verifiable; cannot be a passing test | D-16 of Part A is not this — see `16-reference-story-acceptance-tests.md` A-18: a manual sign-off record, explicitly excluded from automated gates |
| §11.3 autonomous mode vs §6.9 locks and §6.11 approval states | Undefined what autonomous mode may change without approval | Autonomous mode may operate only on content that is **unlocked and unapproved**, and may never create an approval. Any proposed change that would violate a lock is refused at proposal time (D-11) |
| §12.2 "page composition instructions" as a stored record vs §12.3 manuscript as single source of truth | "Instructions" could be read as storing composed text | Composition stores block **IDs** plus rules only; a composition revision contains no prose (D-10, `05-content-and-composition-model.md` §3) |
| §3.2 "language and regional spelling conventions" not appearing anywhere in the pagination inputs (§7.4, §6.7) | Language affects hyphenation, which changes line breaks, which changes page fit | `lang` and `hyphenation` are part of the design revision and are therefore part of the pagination input tuple (D-04) |
