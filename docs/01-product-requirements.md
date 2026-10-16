# Product Requirements

**Implements:** spec §1–§3, §11, §13, §15
**Deliverable covered:** D1 (per §16)
**Inherits:** `docs/00-README.md`, `docs/03-technical-architecture.md`, `docs/04-project-data-schema.md`, `docs/05-content-and-composition-model.md`, `docs/07-lock-and-constraint-rules.md`, `docs/17-decisions-and-open-questions.md`

---

## 1. Purpose and scope

This document is the V1 **product requirements specification** (§16 deliverable 1). It states every obligation the product must satisfy for the Version 1, text-only release, as a set of testable requirements that the rest of the document set implements and proves.

**What a requirement means here.** A requirement is an obligation that is all three of:

1. **Imperative and bounded** — it names a single behaviour that is either present or absent, not an aspiration (`docs/00` §4.1, §4.5).
2. **Verifiable** — it carries a verification identifier `T-<AREA>-<nnn>` that maps to a test case in `docs/14-test-plan.md`, or, where it cannot be tested automatically, an entry in §7 below naming the manual sign-off path (`docs/00` §4.3).
3. **Attributed** — it cites the spec section that requires it (§x.y) or the decision that authorises it (D-nn). An unattributed requirement is a defect in this set (`docs/00` §4.1).

**Scope.** In scope: spec §1 (vision and foundational principles), §2 (publication types), §3 (creation wizard), §11 (studio workspace and UX), §13 (Version 1 operational requirements) and §15 (Version 1 acceptance criteria). This document does not restate the data contract (`docs/04`), the composition model (`docs/05`), the lock rules (`docs/07`) or the architecture (`docs/03`); it states the obligations they exist to satisfy and cross-references them.

**Identifier and unit conventions.** Requirement IDs follow `R-<AREA>-<nnn>` and verification IDs `T-<AREA>-<nnn>`, with AREA drawn from the thirteen areas of `docs/00` §3.1; the schemes are not restated here. All quantities carry a unit suffix (`_mm`, `_pt`, `_px_css`, `_em`, `_lines`, `_words`) per `docs/00` §4.4. Functional requirements occupy the `001`–`099` suffix band; the non-functional requirements of §4 occupy the `1xx` band of the same per-area space, so a single numbering space covers both.

**Resolving the spec's "should".** Per `docs/00` §4 convention 6, every "should" in the source spec is resolved here to a **must** unless an explicit exception is recorded. The exceptions carried as `should` are `R-WIZ-013`, `R-IDE-016`, `R-CMP-011`, `R-DIG-011` and `R-PRT-002`; all other "should" statements became musts. Notable resolutions of spec "should" language:

| Spec wording | Resolution |
|---|---|
| §6.9 "locks should have explicit priorities and scopes" | must — numeric precedence, scope and mandatory reason per lock (`R-CMP-020`; D-07) |
| §6.10 "essential breaks preserved where feasible" | must at the maximum reference viewport or reported as a finding in digital; must and blocking-for-approval in print (D-07, `docs/07` §3) |
| §3.2 "provide recommended defaults" | must — every configuration field carries a profile-derived default (`R-WIZ-003`) |
| §6.6 "optional intelligent recommendations" | must for the suggestion mechanism and its accept/reject/modify record; optional for the author to use any suggestion (`R-CMP-018`) |
| §9.4 "booklet preview should visually show" | must (`R-PRT-015`) |
| §9.2 "cover-specific exceptions require explicit author selection" | out of scope for V1; no cover-exception path is built (§6) |

## 2. Actors and contexts of use

The system has three human actors and two machine actors. Each human actor consumes a defined subset of the three deliverables of §1.2.

| Actor | Context of use | Deliverables consumed | Interface |
|---|---|---|---|
| **Author** (single user, Stephen) | Local-first studio: configure a project, generate and edit prose, compose pages, design, preview, validate, approve and export (§11.2) | All three; the HTML storybook is previewed in-app, the two PDFs are the export outputs | Studio workspace (D-02) and the `sbx` CLI |
| **Reader** | Opens the storybook on a phone, tablet or desktop browser, online or offline (§7.1) | **Interactive HTML Storybook** (§1.2) | Reader runtime in a modern browser (D-19) |
| **Printer** (production operator, or a print service) | Folds and saddle-stitches a physical booklet from a PDF; may also print a flat reading copy (§9.4, §9.5) | **Booklet-Ready PDF** plus the print guide; **Standard Reading PDF** for flat printing | Files on disk; the print guide is human-readable (D-19) |
| **Deterministic engines** (machine) | Produce every page geometry, render and validation result with no creative authority (§12.4, D-04) | Revision triples and page plans consumed internally | Module interfaces (`docs/03` §3) |
| **AI providers** (machine) | Produce prose proposals and stored suggestions; never mutate state (D-11) | Reads revisions; returns `Proposal` data | Provider adapter interface (`docs/03` §7) |

**Contexts, and what each fixes.** The author's context fixes the *workspace*: a visual, resumable, job-driven application (§11.2, §11.3). The reader's context fixes the *rendering target*: an unknown viewport, no installation, reduced-motion and touch and keyboard input (§7.1–§7.4). The printer's context fixes the *physical target*: known paper geometry, a print-safe area, a folding sequence and a parity constraint (§9.1–§9.5). These three contexts are why a single design revision feeds three outputs while pagination stays independent (D-06, D-13).

## 3. Functional requirements

One row per requirement, grouped by area. `Priority` is `must` or `should` for V1; `Verification` is the test identifier `T-<AREA>-<nnn>` owned by `docs/14-test-plan.md`.

### 3.1 VSN — Vision and foundational principles (spec §1)

Owning document: `docs/01-product-requirements.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-VSN-001 | The system must produce the interactive HTML storybook, the reading PDF and the booklet PDF from one approved manuscript revision and one approved design revision. | §1.2 | must | T-VSN-001 |
| R-VSN-002 | All three deliverables must render from a shared design token set so the visual identity is identical across outputs. | §1.2 | must | T-VSN-002 |
| R-VSN-003 | Content-quality decisions must take precedence over any word-count or page-count target when the two conflict. | §1.3, D-16 | must | T-VSN-003 |
| R-VSN-004 | Short-form pacing and intentional page transitions must be first-class composition decisions rather than an emergent property of text volume. | §1.3 | must | T-VSN-004 |
| R-VSN-005 | The user must retain authority over every creative and editorial decision, and no such decision may be finalised without a recorded user action. | §1.3, D-11 | must | T-VSN-005 |
| R-VSN-006 | Deterministic code must own all typography measurement, page geometry and rendering, and AI must never decide layout. | §1.3, D-04 | must | T-VSN-006 |
| R-VSN-007 | The digital and print editions must share one visual identity while keeping independent pagination. | §1.3 | must | T-VSN-007 |
| R-VSN-008 | Approved text and approved page composition must be protected against unrequested regeneration. | §1.3, D-11 | must | T-VSN-008 |
| R-VSN-009 | Formatting defects must be emitted as findings before publication and never silently approximated. | §1.3, §10.5 | must | T-VSN-009 |
| R-VSN-010 | Generation must favour efficient, modular, reproducible computation and must avoid unnecessary AI calls. | §1.3, §12.5 | must | T-VSN-010 |
| R-VSN-011 | Accessibility and readability must remain intact across every reference viewport and the print trim. | §1.3 | must | T-VSN-011 |
| R-VSN-012 | Every project must be recoverable, editable and version-controlled from files on local disk. | §1.3, D-03 | must | T-VSN-012 |

### 3.2 PUB — Publication types (spec §2)

Owning document: `docs/01-product-requirements.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-PUB-001 | The system must support the four publication types of §2: children's literature, biblical and faith-based, inspirational, and educational and other. | §2 | must | T-PUB-001 |
| R-PUB-002 | Publication-specific rules must be implemented as data-driven publication profiles rather than as separate applications or code paths. | §2, D-15 | must | T-PUB-002 |
| R-PUB-003 | The children's literature profile must supply age-appropriate defaults for typography, density tolerance, theme and length preset. | §2.1 | must | T-PUB-003 |
| R-PUB-004 | The biblical profile must enable scripture source capture, scripture validation and the public-domain translation registry. | §2.2, D-08 | must | T-PUB-004 |
| R-PUB-005 | The inspirational profile must operate without requiring any scripture reference. | §2.3 | must | T-PUB-005 |
| R-PUB-006 | The educational and other profile must accept imported manuscripts that require editing and professional formatting. | §2.4 | must | T-PUB-006 |
| R-PUB-007 | Adding a new publication type must require only a new profile document and no code change. | §2, D-15 | must | T-PUB-007 |
| R-PUB-008 | A project must record its publication type and profile name as configuration fields resolved at creation. | §3.2 | must | T-PUB-008 |
| R-PUB-009 | Every publication profile must declare the front matter and back matter its type requires. | §2, §3.2 | must | T-PUB-009 |
| R-PUB-010 | Every publication profile must declare the density tolerance band used for its target age range. | §6.7 | must | T-PUB-010 |

### 3.3 WIZ — Creation wizard and configuration (spec §3)

Owning document: `docs/02-workflow-specification.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-WIZ-001 | The creation wizard must offer all ten creation modes of §3.1 as selectable entry points. | §3.1 | must | T-WIZ-001 |
| R-WIZ-002 | The wizard must collect every story-configuration field of §3.2 before drafting may begin. | §3.2 | must | T-WIZ-002 |
| R-WIZ-003 | The wizard must supply profile-derived recommended defaults for every configuration field so that no parameter must be set manually. | §3.2 | must | T-WIZ-003 |
| R-WIZ-004 | Each length preset of §3.3 must resolve to a governing target printable page count (`target_print_pages`) and a target beat count; the page count, not a word budget, is the length the preset fixes. | §3.3, D-16 | must | T-WIZ-004 |
| R-WIZ-005 | The wizard must present the target digital reading-page count and the target printable page count as two separate labelled targets. | §3.3, D-06 | must | T-WIZ-005 |
| R-WIZ-006 | The wizard must record language and regional spelling convention into the project configuration. | §3.2 | must | T-WIZ-006 |
| R-WIZ-007 | Import mode must ingest an existing manuscript as content blocks without retyping. | §3.1 | must | T-WIZ-007 |
| R-WIZ-008 | Revise-an-existing-book must open the existing project rather than create a new one. | §3.1 | must | T-WIZ-008 |
| R-WIZ-009 | New-edition-using-an-existing-design must start from a copy of the chosen project's design revision. | §3.1 | must | T-WIZ-009 |
| R-WIZ-010 | Start-from-a-template must instantiate a project from a stored profile, theme and front and back matter set. | §3.1 | must | T-WIZ-010 |
| R-WIZ-011 | The wizard must store front-matter and back-matter preferences as ordered lists in the project configuration. | §3.2 | must | T-WIZ-011 |
| R-WIZ-012 | The wizard must store illustration readiness as declared intent only and must produce no illustration behaviour in V1. | §3.2 | must | T-WIZ-012 |
| R-WIZ-013 | The wizard must reject a configuration whose age range, reading proficiency and length preset are mutually incompatible, with an actionable message. | §3.2, §3.3 | should | T-WIZ-013 |
| R-WIZ-014 | The wizard must map reading proficiency to default typography and density settings. | §3.2 | must | T-WIZ-014 |
| R-WIZ-015 | A project's target word budget must be derived from its governing page target as `target_words = story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words`, where `story_pages_target = target_print_pages − front_matter_pages − back_matter_pages`, `balanced_lines_per_page` is the ceiling of the project's resolved density band, and `words_per_line_measured` is measured on the project's concrete design revision **in the face the book ships** (`app/assets/fonts`); the `reserve_words` term (heading lines plus forced-break slack × `words_per_line_measured`) is part of the formula and must never be dropped, so the reference fixture derives `9 × 16 × 7.9 − 31.6 = 1106 _words_` and not `1138`; the budget must never be authored independently of the page target. | §3.2, D-16 | must | T-WIZ-015 |
| R-WIZ-016 | A print page count that misses `target_print_pages` after the pad-to-a-multiple-of-four step must be reported as a `PRINT_PAGE_COUNT_OFF_TARGET` finding (major, waivable), and must never be absorbed by padding or by prose expansion. | §3.2, §9.4, D-16 | must | T-WIZ-016 |
| R-WIZ-017 | A project's effective **prose** budget must be derived from the story pages' lines **available for prose**, never from the total story-page line budget: `lines_available_for_prose = story_pages_target × balanced_lines_per_page − lines_reserved_non_prose`, where `lines_reserved_non_prose` counts the lines the beat's non-prose roles occupy on the story pages (the `role: "scripture"` displays and the headings); the effective prose budget is then `lines_available_for_prose × words_per_line_measured`, and the three quantities (`lines_available`, `lines_reserved_non_prose`, `lines_available_for_prose`) must be recorded on the blueprint's `length_model`. On the reference fixture `16 × 9 = 144` lines hold `26` scripture lines and `1` heading line, so `lines_available_for_prose = 117` and the effective prose budget is `117 × 7.9 = 924 _words_`, not the `1106` the total-line formula yields — which is why the reference book composes to 20 printed pages. | §3.2, D-16 | must | T-WIZ-018 |

### 3.4 IDE — Ideation and story blueprint (spec §4)

Owning document: `docs/05-content-and-composition-model.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-IDE-001 | Ideation must return at least two alternative story concepts per request when asked for alternatives. | §4.1 | must | T-IDE-102 |
| R-IDE-002 | Each concept must contain a suggested title, premise, audience, genre, characters, conflict, lesson, conclusion, duration and structure. | §4.1 | must | T-IDE-103 |
| R-IDE-003 | Concepts must be revisable, combinable, comparable and selectable before drafting begins. | §4.1 | must | T-IDE-104 |
| R-IDE-004 | Drafting must be blocked until a StoryBlueprint containing every required field of §4.2 exists. | §4.2 | must | T-IDE-001 |
| R-IDE-005 | The blueprint must define premise, target reader, opening hook, characters, setting, central theme, progression, turning points, climax, resolution, emotional effect, closing reflection, estimated length and page distribution. | §4.2 | must | T-IDE-001 |
| R-IDE-006 | The blueprint must express progression as ordered narrative beats and page-turn opportunities rather than as chapters. | §4.2 | must | T-IDE-002 |
| R-IDE-007 | The blueprint must be stored as a content-hashed, diffable and revertible revision. | §4.2, D-10 | must | T-IDE-105 |
| R-IDE-008 | Beat derivation must produce exactly one Beat per blueprint progression entry, deterministically, with stable identifiers. | §4.2, §6.5 | must | T-IDE-002 |
| R-IDE-009 | Each beat's word budget must be derived from the blueprint's estimated word count and the entry's weight. | §5.1 | must | T-IDE-003 |
| R-IDE-010 | Removing a beat from the blueprint must unassign its blocks and raise a BEAT_ORPHANED_BLOCKS finding rather than delete the blocks. | §4.2 | must | T-IDE-010 |
| R-IDE-011 | Every scripture reference must be recorded as a SourceReference resolving to book, chapter and verse. | §4.3 | must | T-IDE-011 |
| R-IDE-012 | Scripture text and paraphrase must be distinguished structurally by block type and by source-reference coverage lists. | §4.3 | must | T-IDE-012 |
| R-IDE-013 | Invented dialogue must be marked as paraphrase and must never be typed as scripture. | §4.3, D-08 | must | T-IDE-013 |
| R-IDE-014 | A biblical project must preserve the source account's meaning and chronology, and a reordered beat must raise a SCRIPTURE_CHRONOLOGY_REORDERED finding. | §4.3 | must | T-IDE-014 |
| R-IDE-015 | Questionable interpretations must be flagged for review and must block export until a human resolves the flag. | §4.3 | must | T-IDE-015 |
| R-IDE-016 | Optional scripture references, memory verses, prayers and discussion questions must be supported as front and back matter. | §4.3 | should | T-IDE-016 |

### 3.5 GEN — Content generation and editorial (spec §5)

Owning document: `docs/05-content-and-composition-model.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-GEN-001 | Story drafting must proceed section by section against the approved blueprint. | §5.1 | must | T-GEN-015 |
| R-GEN-002 | Each drafted section must carry a narrative purpose, a word budget, relevant context, tone and emotional progression. | §5.1 | must | T-GEN-016 |
| R-GEN-003 | Drafting must avoid filler, repeated lessons, extended dialogue and any expansion performed solely to fill pages. | §5.1 | must | T-GEN-017 |
| R-GEN-004 | Drafted prose must be returned as a Proposal and must alter the manuscript only when that proposal is applied. | §5.1, D-11 | must | T-GEN-001 |
| R-GEN-005 | Editorial review must offer the six review layers of §5.2 as selectable depths L1 structural, L2 line and copy, and L3 full. | §5.2, D-12 | must | T-GEN-005 |
| R-GEN-006 | Editorial review must return findings that reference block identifiers and must never return rewritten prose. | §5.2 | must | T-GEN-006 |
| R-GEN-007 | Review results must be cached by block hash, depth and profile so that unchanged blocks are never re-reviewed. | §5.2, D-12 | must | T-GEN-007 |
| R-GEN-008 | No review layer may auto-apply a change, and applying a review suggestion must be a user action. | §5.2, D-11 | must | T-GEN-008 |
| R-GEN-009 | Controlled revision must support all ten operations of §5.3 as Proposal-producing actions. | §5.3 | must | T-GEN-009 |
| R-GEN-010 | Prose changes must remain localised to the targeted blocks unless a broader scope is explicitly requested. | §5.3 | must | T-GEN-010 |
| R-GEN-011 | A rewrite proposal targeting content-locked material must be refused at creation. | §5.3, §6.9 | must | T-GEN-011 |
| R-GEN-012 | Every AI proposal must record its provider, model, prompt hash, timestamp and input revision hashes. | §12.4, D-11 | must | T-GEN-012 |
| R-GEN-013 | Every applied prose change must produce a manuscript revision carrying a parent pointer and a reason. | §5.3, §12.2 | must | T-GEN-013 |
| R-GEN-014 | The manuscript must expose derived statistics for word count, characters, reading minutes and reading level, recomputed by validation rather than trusted. | §5.1, §10.1 | must | T-GEN-014 |

### 3.6 CMP — Page composition (spec §6)

Owning document: `docs/05-content-and-composition-model.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-CMP-001 | Page composition must begin only after a manuscript revision exists. | §6.2 | must | T-CMP-096 |
| R-CMP-002 | The system must generate an initial composition proposing page and spread boundaries, dramatic page turns and opening and closing pages. | §6.2 | must | T-CMP-097 |
| R-CMP-003 | Available content space must be estimated by measuring the actual design revision's text box rather than a nominal average. | §6.2, §6.7 | must | T-CMP-098 |
| R-CMP-004 | Composition must be a deterministic pure function of the manuscript, composition and design revisions plus the pagination target, with no network access. | §6.2, D-04 | must | T-CMP-099 |
| R-CMP-005 | The editor must let the author move text blocks between pages and reorder unlocked story beats. | §6.4 | must | T-UXS-003 |
| R-CMP-006 | The editor must let the author split a long page and merge adjacent pages. | §6.4 | must | T-UXS-005 |
| R-CMP-007 | The editor must let the author insert and remove intentional page breaks. | §6.4 | must | T-UXS-007 |
| R-CMP-008 | The editor must let the author create a page, insert an approved blank page and convert a page between the title, dedication, story, reflection and closing kinds. | §6.4 | must | T-UXS-009 |
| R-CMP-009 | The editor must let the author assign a predefined page layout template to any page. | §6.4, §6.8 | must | T-UXS-012 |
| R-CMP-010 | The editor must let the author lock selected content placement and lock an entire composed print page. | §6.4, §6.9 | must | T-UXS-013 |
| R-CMP-011 | The editor must support undo, redo, comparison of page compositions and restoration of a previous approved composition. | §6.4 | should | T-UXS-017 |
| R-CMP-012 | Accessible move commands must be available for every operation that can also be performed by dragging. | §6.4 | must | T-UXS-020 |
| R-CMP-013 | A composition revision must store block identifiers and rules only, containing no prose, and must hold the logical, digital and print layers as distinct structures. | §6.10, §12.3 | must | T-CMP-030 |
| R-CMP-014 | Digital pagination may introduce additional pages while logical beat order is always preserved. | §6.10 | must | T-CMP-033 |
| R-CMP-015 | A cohesive story beat may be split across pages only when the split is intentional and editorially appropriate. | §6.5 | must | T-CMP-100 |
| R-CMP-016 | Page density must be classified from measurement rather than raw word count, and density suggestions must offer only operations legal under the active locks and print state. | §6.7 | must | T-CMP-055 |
| R-CMP-017 | An editorial change affecting meaning or content must require explicit user approval before it is applied. | §6.7 | must | T-CMP-101 |
| R-CMP-018 | Page-turn recommendations must be ranked by deterministic signals and stored with an accepted, rejected or modified decision. | §6.6 | must | T-CMP-072 |
| R-CMP-019 | A page-turn suggestion that would fragment a beat or violate a keep-together lock must be suppressed, and the system must never introduce contrived cliffhangers. | §6.6 | must | T-CMP-071 |
| R-CMP-020 | Every lock must carry an explicit numeric precedence, a defined scope and a mandatory human reason, and an unsatisfiable set must be reported as a conflict naming the minimal conflicting locks. | §6.9, D-07 | must | T-CMP-010 |
| R-CMP-021 | A composition whose solve produces a critical violation must not be emitted as a revision. | §6.9 | must | T-CMP-009 |
| R-CMP-022 | An approval must bind a specific manuscript, composition and design revision triple, and any change that invalidates it must mark it stale with a named reason and trigger targeted revalidation only. | §6.11 | must | T-OPS-011 |

### 3.7 DIG — Interactive HTML reader (spec §7)

Owning document: `docs/08-pagination-strategy.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-DIG-001 | The HTML storybook must be a self-contained deliverable that renders from a local file with no network access. | §7.1, D-19 | must | T-DIG-040 |
| R-DIG-002 | The reader must present a polished fullscreen reading experience on desktop, tablet and mobile. | §7.1 | must | T-DIG-104 |
| R-DIG-003 | The reader must present facing pages on wide screens and a single page on narrow screens. | §7.1 | must | T-DIG-021 |
| R-DIG-004 | The reader must never force a two-page spread when doing so would compromise readability. | §7.1 | must | T-DIG-105 |
| R-DIG-005 | The reader must accommodate both portrait and landscape orientations without losing content. | §7.1 | must | T-DIG-023 |
| R-DIG-006 | The reader must support all five configurable transitions of §7.2: page curl, fold, horizontal slide, fade and instant. | §7.2 | must | T-DIG-106 |
| R-DIG-007 | Animation must be non-essential to navigation, and interactions must remain functional when an animation is unavailable or fails. | §7.2 | must | T-DIG-042 |
| R-DIG-008 | The reader must respect the reduced-motion preference. | §7.2, D-19 | must | T-DIG-042 |
| R-DIG-009 | The reader must support previous and next, tap or click, touch swipe and keyboard navigation. | §7.3 | must | T-DIG-041 |
| R-DIG-010 | The reader must provide fullscreen mode, reading progress and optional page numbering. | §7.3 | must | T-DIG-107 |
| R-DIG-011 | The reader must provide a table of contents for books that exceed a configured length. | §7.3 | should | T-DIG-011 |
| R-DIG-012 | The reader must support font-size adjustment within the design revision's declared scale steps. | §7.3 | must | T-DIG-012 |
| R-DIG-013 | The reader must support resume-reading and jumping to the beginning or the end. | §7.3 | must | T-DIG-013 |
| R-DIG-014 | The reader must calculate pagination from viewport dimensions, page proportions, text measurements, font settings and border geometry. | §7.4 | must | T-DIG-014 |
| R-DIG-015 | The reader must reflow a passage that cannot fit rather than clipping or hiding it. | §7.4, §6.10 | must | T-DIG-015 |
| R-DIG-016 | The reader must disclose when a requested composition cannot be reproduced on the current viewport. | §6.10, §7.4 | must | T-DIG-016 |
| R-DIG-017 | The reader must provide accessible navigation through correct focus order, control labels and landmarks. | §7.3 | must | T-DIG-017 |

### 3.8 DSN — Design system (spec §8)

Owning document: `docs/09-design-token-architecture.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-DSN-001 | A single approved design revision must supply design tokens to both the HTML and the PDF renderer. | §8.1 | must | T-VSN-002 |
| R-DSN-002 | The token set must cover typography, page backgrounds, border styles, border thickness, border offsets, content padding, heading hierarchy, decorative accents, page numbering, section dividers and page layout presets. | §8.1 | must | T-DSN-103 |
| R-DSN-003 | The design revision must carry separate digital and print unit sets so each renderer reads only its own. | §8.1 | must | T-DSN-104 |
| R-DSN-004 | V1 must ship the eight themes of §8.2 as token documents. | §8.2 | must | T-DSN-006 |
| R-DSN-005 | Every shipped theme must produce a complete design without illustrations. | §8.2 | must | T-DSN-006 |
| R-DSN-006 | The design system must provide age-appropriate typography presets plus manual adjustment. | §8.3 | must | T-DSN-105 |
| R-DSN-007 | Typography must expose font size, actual font metrics, line length, line spacing, paragraph spacing and contrast. | §8.3 | must | T-DSN-106 |
| R-DSN-008 | The design must enforce a readable minimum font size and must refuse to render text below it. | §8.3 | must | T-DSN-004 |
| R-DSN-009 | A custom font may be selected only when it has an entry in the licensing registry. | §8.3, D-09 | must | T-DSN-009 |
| R-DSN-010 | A font may be selected for a print design only when its registry entry declares that PDF embedding is permitted. | §8.3, D-09 | must | T-DSN-010 |
| R-DSN-011 | The print renderer must assert that font embedding succeeded before declaring a PDF valid. | §8.3, D-09 | must | T-DSN-011 |
| R-DSN-012 | The design revision must carry language and hyphenation as part of the pagination input. | §3.2, D-04 | must | T-DSN-012 |
| R-DSN-013 | The design revision must declare which reader overrides are permitted, including font scale and the allowed theme list. | §7.3 | must | T-DSN-013 |

### 3.9 PRT — Print production and booklets (spec §9)

Owning document: `docs/10-booklet-imposition-spec.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-PRT-001 | The print renderer must lay out pages using deterministic physical page measurements. | §9.1 | must | T-PRT-001 |
| R-PRT-002 | The print renderer must support US Letter folded to half-letter, A4 folded to A5, and custom paper sizes. | §9.1 | should | T-PRT-002 |
| R-PRT-003 | The print renderer must apply fixed inner and outer margins, a binding allowance and page-level composition rules. | §9.1 | must | T-PRT-003 |
| R-PRT-004 | Every printed page must use the approved border specification with identical thickness within a selected style. | §9.2 | must | T-PRT-004 |
| R-PRT-005 | Borders must remain inside the print-safe area and must not collide with text or footers. | §9.2 | must | T-PRT-005 |
| R-PRT-006 | The perimeter frame must remain visually consistent across pages even where interior page templates vary. | §9.2 | must | T-PRT-006 |
| R-PRT-007 | The print engine must measure actual content fit and the resulting physical page count. | §9.3 | must | T-PRT-007 |
| R-PRT-008 | Print pagination must honour the frozen approved page assignments supplied by the composition editor. | §9.3, D-05 | must | T-PRT-008 |
| R-PRT-009 | On overflow the engine must detect it, identify the affected pages, preserve protected content and locks, and refuse to reflow a frozen page rather than approximating it. | §9.3, D-05 | must | T-PRT-009 |
| R-PRT-010 | The print engine must never silently revise approved prose. | §9.3 | must | T-PRT-010 |
| R-PRT-011 | The total imposed page count of a saddle-stitched booklet must be an exact multiple of four. | §9.4 | must | T-PRT-011 |
| R-PRT-012 | Imposition must order pages correctly for folding, place front and back correctly and respect duplex flip-edge rules. | §9.4 | must | T-PRT-012 |
| R-PRT-013 | Blank pages required for page-count parity must be inserted deliberately at front and back matter boundaries only. | §9.4, D-16 | must | T-PRT-013 |
| R-PRT-014 | The system must offer the reading PDF and the imposed booklet PDF as two separate downloads. | §9.4 | must | T-PRT-014 |
| R-PRT-015 | The booklet preview must show how sheets fold and which pages will face one another. | §9.4 | must | T-PRT-015 |
| R-PRT-016 | The system must generate a print guide specifying paper size, sheet count, duplex requirements, flip-edge settings, actual-size guidance, folding orientation and binding recommendations. | §9.5 | must | T-PRT-016 |
| R-PRT-017 | The system must support visual verification of booklet order before the imposed PDF is downloaded. | §9.5 | must | T-PRT-017 |
| R-PRT-018 | The print output must have correct page numbering and must contain no unintended blank or missing pages. | §10.4 | must | T-PRT-018 |

### 3.10 QAS — Quality assurance (spec §10)

Owning document: `docs/11-validation-strategy.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-QAS-001 | Content validation must verify completeness, coherence, reading level and theme consistency. | §10.1 | must | T-QAS-018 |
| R-QAS-002 | Content validation must detect accidental duplication of prose. | §10.1 | must | T-QAS-019 |
| R-QAS-003 | Scripture fidelity must be validated against the resolved source references where scripture applies. | §10.1 | must | T-IDE-022 |
| R-QAS-004 | Composition validation must verify that story beats appear in the intended sequence. | §10.2 | must | T-CMP-033 |
| R-QAS-005 | Composition validation must verify that protected passages have not been modified. | §10.2 | must | T-CMP-008 |
| R-QAS-006 | Composition validation must report each required page break that is not honoured where feasible. | §10.2 | must | T-CMP-034 |
| R-QAS-007 | Composition validation must detect story content that is missing or duplicated. | §10.2 | must | T-CMP-031 |
| R-QAS-008 | Composition validation must flag an unsatisfied lock as unsatisfied and must never repair it silently. | §10.2, §6.9 | must | T-CMP-040 |
| R-QAS-009 | Composition validation must verify that every blank page is intentional and has a recorded reason. | §10.2 | must | T-CMP-037 |
| R-QAS-010 | Digital rendering validation must detect clipping, overlap and missing text. | §10.3 | must | T-QAS-010 |
| R-QAS-011 | Digital rendering validation must verify responsive layout, readable typography and functional page controls. | §10.3 | must | T-QAS-011 |
| R-QAS-012 | Digital rendering validation must verify correct behaviour under font scaling, reduced motion and screen orientation change. | §10.3 | must | T-QAS-012 |
| R-QAS-013 | Print rendering validation must verify physical dimensions, print-safe margins, gutters and border consistency. | §10.4 | must | T-QAS-013 |
| R-QAS-014 | Print rendering validation must verify the absence of overflow and missing glyphs, correct imposition, and content that matches the approved manuscript. | §10.4 | must | T-QAS-014 |
| R-QAS-015 | Automated correction must follow the §10.5 ladder, exhausting deterministic correction before any AI-assisted revision is proposed. | §10.5 | must | T-QAS-015 |
| R-QAS-016 | A publication must not receive a final approved status while an unresolved critical rendering problem remains. | §10.5 | must | T-QAS-016 |
| R-QAS-017 | Every finding must carry a code, a family, a severity, affected references, evidence and a blocking decision. | §10, D-05 | must | T-QAS-017 |

### 3.11 UXS — Studio workspace and UX (spec §11)

Owning document: `docs/06-composition-editor-ux.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-UXS-001 | The project dashboard must display title, publication type, audience, current stage and the status of manuscript, composition, design, digital preview, print proof, approval and export. | §11.1 | must | T-UXS-105 |
| R-UXS-002 | The dashboard must display the digital page-count range and the print page count together and always labelled. | §11.1, D-06 | must | T-DIG-027 |
| R-UXS-003 | The workspace must provide the seven separated editing environments of §11.2. | §11.2 | must | T-UXS-106 |
| R-UXS-004 | The Story Editor must support developing and refining the manuscript. | §11.2 | must | T-UXS-107 |
| R-UXS-005 | The Story Blueprint environment must manage premise, characters, themes, narrative beats and source references. | §11.2 | must | T-UXS-108 |
| R-UXS-006 | The Page Composition Editor must provide the page navigator, composition canvas, content inspector, design inspector, composition assistant and status and validation panel of §6.3. | §11.2, §6.3 | must | T-UXS-109 |
| R-UXS-007 | The Design Studio must allow the author to customise visual appearance, typography, borders and page templates. | §11.2 | must | T-UXS-110 |
| R-UXS-008 | The Digital Preview must render the responsive HTML presentation inside the workspace. | §11.2 | must | T-UXS-111 |
| R-UXS-009 | The Print Preview must render fixed pages, spreads, booklet arrangement and print quality. | §11.2 | must | T-UXS-112 |
| R-UXS-010 | The Publication Center must present validation results, approval controls and export actions. | §11.2 | must | T-UXS-113 |
| R-UXS-011 | Guided mode must require the user to approve each major decision. | §11.3 | must | T-VSN-005 |
| R-UXS-012 | Autonomous mode must operate only on unlocked, unapproved content and must never create an approval. | §11.3, D-11 | must | T-UXS-114 |
| R-UXS-013 | The system must not silently change locked or approved material in either operating mode. | §11.3 | must | T-VSN-008 |
| R-UXS-014 | Every long-running action must return a job identifier with visible progress rather than blocking the request. | §11.3, D-17 | must | T-UXS-101 |

### 3.12 ARC — Architecture, data, providers (spec §12)

Owning document: `docs/03-technical-architecture.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-ARC-001 | The seven engines of §12.1 must be implemented as modules, each exposing one public interface and not reaching into another module's storage. | §12.1 | must | T-ARC-106 |
| R-ARC-002 | Module dependency direction must be one-way, and the digital, print and validation modules must be unable to trigger AI or to write prose. | §12.1, §12.4 | must | T-ARC-107 |
| R-ARC-003 | The system must maintain separate records for all sixteen kinds of structured project data listed in §12.2. | §12.2 | must | T-ARC-018 |
| R-ARC-004 | Content blocks and story beats must have stable identifiers so that a revision does not require rebuilding all composition data. | §12.2 | must | T-IDE-006 |
| R-ARC-005 | The approved manuscript must remain the single authoritative content source. | §12.3 | must | T-PRT-010 |
| R-ARC-006 | The composition editor must reference manuscript content by identifier and must store no independent copy of the prose. | §12.3 | must | T-ARC-005 |
| R-ARC-007 | The digital and print renderers must generate from the same approved content revision. | §12.3 | must | T-PRT-069 |
| R-ARC-008 | The system must support configurable AI providers and models for all seven task kinds of §12.4. | §12.4 | must | T-ARC-025 |
| R-ARC-009 | Typography measurement, page geometry, rendering, booklet imposition and file validation must be handled by conventional deterministic code and never by a model. | §12.4, D-04 | must | T-ARC-028 |
| R-ARC-010 | Every revision must be content-addressed by a hash over its canonical JSON serialisation. | §12.5, D-10 | must | T-ARC-004 |
| R-ARC-011 | Only the blocks that changed and the pages they affect may be regenerated or re-measured after an edit. | §12.5 | must | T-DIG-008 |
| R-ARC-012 | Cached manuscript summaries must be keyed by the content hash of the manuscript they summarise. | §12.5 | must | T-ARC-108 |
| R-ARC-013 | All AI and render work must run as checkpointed, resumable jobs with bounded retries and an explicit abandoned terminal state. | §12.5, D-17 | must | T-ARC-040 |
| R-ARC-014 | AI calls must be cached by prompt hash, input hash, provider and model, and a replayed cached call must be byte-identical. | §12.5 | must | T-ARC-021 |
| R-ARC-015 | A project must be a directory of human-readable JSON documents, with any database used only as a disposable index and job queue. | §12.2, D-03 | must | T-ARC-045 |
| R-ARC-016 | Opening a project whose schema version exceeds the engine's supported version must be refused and never silently downgraded. | §12.2, D-03 | must | T-ARC-013 |
| R-ARC-017 | Any AI result that will influence page geometry must first be materialised as a stored revision. | §12.4, D-11 | must | T-ARC-029 |

### 3.13 OPS — Operational requirements (spec §13, §15.5)

Owning document: `docs/12-approval-and-versioning-workflow.md`.

| ID | Requirement | Spec cite | Priority | Verification |
|---|---|---|---|---|
| R-OPS-001 | Projects must save to disk and reload with all manual composition changes intact. | §13, §15.2 | must | T-OPS-001 |
| R-OPS-002 | A step interrupted by a crash, a rate limit or a provider fault must resume from its last checkpoint. | §13, §15.5 | must | T-OPS-002 |
| R-OPS-003 | Revisions must be tracked with a parent pointer, a reason and an actor. | §13, §15.5 | must | T-OPS-003 |
| R-OPS-004 | An approved publication must be reproducible from its recorded environment and revision triple. | §15.5, D-14 | must | T-OPS-004 |
| R-OPS-005 | AI calls must be focused and economical, and their cost must be auditable from the stored proposals alone. | §15.5, §12.5 | must | T-OPS-005 |
| R-OPS-006 | A critical validation error must block final approval. | §15.5, §10.5 | must | T-OPS-006 |
| R-OPS-007 | Exported files must match the approved revision, or the export must be refused. | §15.5 | must | T-OPS-007 |
| R-OPS-008 | Every export must carry a manifest recording engine version, Chromium build, font file hashes, theme token hash, imposition spec version and the revision triple. | §15.5, D-14 | must | T-OPS-008 |
| R-OPS-009 | Every approved publication and its exported artifacts must be archived and retrievable. | §13 | must | T-OPS-009 |
| R-OPS-010 | Each deliverable must be emitted as a standalone file or directory that the author owns. | §13, D-19 | must | T-OPS-105 |
| R-OPS-011 | Error recovery must never leave a partial artifact that appears complete. | §13, D-05 | must | T-CMP-094 |
| R-OPS-012 | An artifact whose manifest cannot be reproduced on the recorded environment must be reported as unreproducible rather than valid. | §15.5, D-14 | must | T-PRT-068 |
| R-OPS-013 | A headless command-line interface must expose project, compose, validate and export operations without the user interface. | §13, D-02 | must | T-OPS-106 |
| R-OPS-014 | An export that cites an approval which is stale relative to the current revision pointers must be refused. | §15.5 | must | T-OPS-014 |

## 4. Non-functional requirements

Non-functional requirements use the `1xx` suffix band of the same per-area identifier space. The `Target` column states the numeric commitment where engineering can bind one; where the spec gives no number, the target is derived from §12.5 (efficient processing) and §15.5 (operational quality) and is calibrated by the reference benchmark of §14.

### 4.1 Determinism

| ID | Requirement | Spec cite | Priority | Target | Verification |
|---|---|---|---|---|---|
| R-ARC-101 | The pagination and solve functions must be deterministic: identical revisions, target, engine version and pinned Chromium build must yield a byte-identical page plan. | §12.4, D-04 | must | golden hash equality | T-ARC-101 |
| R-ARC-102 | All solver measurements must be quantised to 1/64-pixel integers and all constraint weights must be integers, so no floating-point rounding can change a plan. | D-04 | must | no float in solver input | T-ARC-102 |
| R-ARC-103 | Any collection whose order affects output must be iterated in ULID sort order, never in hash-map order. | D-04 | must | order-independence test | T-ARC-103 |
| R-ARC-104 | Measuring one content block in Chromium must complete within 5 ms, and measuring a 10,000-word manuscript at a single viewport within 5 s, on the reference host. | §12.5 | must | < 5 ms/block; < 5 s/book | T-ARC-104 |
| R-ARC-105 | The initial composition solve for a manuscript of up to 400 blocks must complete within 500 ms. | §12.5 | must | < 500 ms | T-ARC-105 |

### 4.2 Reproducibility

| ID | Requirement | Spec cite | Priority | Target | Verification |
|---|---|---|---|---|---|
| R-OPS-101 | Every exported artifact must embed the environment manifest of engine version, Chromium build, font hashes, token hash, imposition spec version and revision triple. | §15.5, D-14 | must | manifest present on 100% of exports | T-OPS-101 |
| R-OPS-102 | An export must be refused unless the cited approval is approved, its revisions equal the current pointers and its recorded environment equals the engine's actual environment. | §15.5 | must | refusal test | T-OPS-102 |
| R-OPS-103 | Re-running any AI or render job on unchanged inputs must perform zero billable provider calls. | §12.5, §15.5 | must | 0 calls on replay | T-OPS-103 |
| R-OPS-104 | Every third-party asset actually used must be recorded in the project licence file, and a missing entry must raise an OPS_LICENSE_MISSING finding. | §12.2, D-08 | must | licence completeness | T-OPS-104 |

### 4.3 Performance

| ID | Requirement | Spec cite | Priority | Target | Verification |
|---|---|---|---|---|---|
| R-UXS-101 | Any long-running operation must return a job identifier within 200 ms and must never hold an HTTP request open for the duration of a render. | §12.5, D-17 | must | < 200 ms to job id | T-UXS-101 |
| R-DIG-101 | The first reader page must become interactive within 2 s on the reference mid-range mobile device served from local files. | §7.1 | must | < 2 s to interactive | T-DIG-101 |
| R-DIG-102 | A page-turn transition must target 60 frames per second and must degrade to the instant transition when the device cannot sustain it. | §7.2 | must | 60 fps target | T-DIG-102 |
| R-PRT-101 | Rendering one print page must complete within 2 s and producing a 16-page reading PDF within 30 s on the reference host. | §9.3 | must | < 2 s/page; < 30 s/book | T-PRT-101 |

### 4.4 Accessibility

| ID | Requirement | Spec cite | Priority | Target | Verification |
|---|---|---|---|---|---|
| R-UXS-102 | Every animation must be honoured as non-essential, and the reader must supply a no-animation path when reduced motion is requested. | §7.2 | must | reduced-motion test | T-UXS-102 |
| R-UXS-103 | Every editing operation, including moving content between pages, must be reachable without a pointer device. | §6.4, §7.3 | must | keyboard-reach test | T-UXS-103 |
| R-UXS-104 | Every shipped theme must meet WCAG 2.1 AA contrast, at least 4.5:1 for body text, on its page background. | §8.3 | must | contrast >= 4.5:1 | T-UXS-104 |
| R-DIG-103 | Digital body text must never render below 16 px_css at scale 1.0 under any permitted reader override. | §8.3, §7.3 | must | >= 16 px_css | T-DIG-103 |
| R-PRT-102 | Print body text must never render below the design revision's declared readable minimum of 12 pt. | §8.3 | must | >= 12 pt | T-PRT-102 |

### 4.5 Licensing

| ID | Requirement | Spec cite | Priority | Target | Verification |
|---|---|---|---|---|---|
| R-DSN-101 | Font selection must resolve to a licensing registry entry with a licence recorded, and a font without one must be unselectable. | §8.3, D-09 | must | registry lookup | T-DSN-101 |
| R-DSN-102 | A font used in a print design must declare PDF embedding permitted, and embedding failure must invalidate the PDF. | §8.3, D-09 | must | embed assertion | T-DSN-102 |
| R-IDE-101 | Importing scripture must require a licence entry for the chosen translation, and the import must be refused without one. | §4.3, D-08 | must | refusal test | T-IDE-101 |

## 5. Requirements traceability

Every requirement is traceable along one chain, using the identifier schemes of `docs/00` §3 (not restated here):

```
R-<AREA>-<nnn>   ──owning doc──►  docs/NN-*.md   ──phase──►  spec §17 phase 1–9   ──proof──►  T-<AREA>-<nnn>
       │                                                         │                                │
       └── checklist status (planned/in progress/implemented/validated/deferred, §16) ◄──────────┘
```

**Requirement → document.** A requirement names exactly one owning document in §3 above; that document must specify *how* the requirement is met and may not invent requirement IDs (`docs/00` §3.1). Document 01 owns the requirement; documents 02–14 own the mechanism.

**Requirement → phase.** Each requirement carries a phase number 1–9 matching the implementation priorities of spec §17. A requirement is implemented in the phase where it first becomes buildable, which is not always the phase where its document is written.

**Requirement → test.** Every functional and non-functional requirement carries a `verification` id `T-<AREA>-<nnn>`, and **that id is authoritative**: `docs/14-test-plan.md` owns the `T-` namespace (`docs/00` §3.2) and must declare the very id the requirement names. The number after the area is an *identifier, not a position* — it does not track the requirement number, and the mapping is **not** one-to-one: a test may verify several requirements, a requirement may be covered by several tests, and `docs/14` numbers its own catalogue (§3.1–§3.22) separately from the requirement-completing tests declared in §3.23. The area prefix reuses the requirement AREA set, but the allocation is by *test subject*, so a requirement may name a test in another area (`R-CMP-005` → `T-UXS-003`); the pairing is made explicit by the `R-` back-reference on that test's own definition row. The invariant is enforced **both ways** by `tools/gen-checklist.py`: **`C1`** — every requirement in `spec/requirements.json` names a `verification` id that `docs/14` declares; **`C2`** — the row that declares that id carries the requirement's own `R-` id. Both must be zero. Requirements a machine cannot check are declared in `docs/14` at the `manual` layer and listed in §7 with their reviewer role, checklist artefact and sign-off record.

**Requirement → gate.** Each §15 acceptance criterion (G1–G5, §8) is satisfied only when every requirement in its cluster is green.

The area-to-document-to-phase mapping is:

| Area | Owning document | Requirement range | Phases |
|---|---|---|---|
| VSN | `docs/01-product-requirements.md` | R-VSN-001 … R-VSN-012 | 1, 2, 4, 5, 8 |
| PUB | `docs/01-product-requirements.md` | R-PUB-001 … R-PUB-010 | 1, 2 |
| WIZ | `docs/02-workflow-specification.md` | R-WIZ-001 … R-WIZ-017 | 1, 6 |
| IDE | `docs/05-content-and-composition-model.md` | R-IDE-001 … R-IDE-016 | 1, 2, 5 |
| GEN | `docs/05-content-and-composition-model.md` | R-GEN-001 … R-GEN-014 | 1, 4 |
| CMP | `docs/05-content-and-composition-model.md` | R-CMP-001 … R-CMP-022 | 2, 3, 4 |
| DIG | `docs/08-pagination-strategy.md` | R-DIG-001 … R-DIG-017 | 3 |
| DSN | `docs/09-design-token-architecture.md` | R-DSN-001 … R-DSN-013 | 5, 6 |
| PRT | `docs/10-booklet-imposition-spec.md` | R-PRT-001 … R-PRT-018 | 6, 7, 8 |
| QAS | `docs/11-validation-strategy.md` | R-QAS-001 … R-QAS-017 | 8 |
| UXS | `docs/06-composition-editor-ux.md` | R-UXS-001 … R-UXS-014 | 1, 3, 4, 5, 6, 7 |
| ARC | `docs/03-technical-architecture.md` | R-ARC-001 … R-ARC-017 | 1, 2, 4, 6 |
| OPS | `docs/12-approval-and-versioning-workflow.md` | R-OPS-001 … R-OPS-014 | 1, 8, 9 |
| NFR (cross-cutting) | per concern (§4) | R-*-1xx | 1, 2, 3, 4, 5, 6, 9 |

## 6. Out of scope for V1

The following are explicitly **not** V1 obligations. They carry no `R-` identifier. The **non-foreclosure rule** applies to all of them: V1 must not make any of them impossible (`docs/00` §5, `docs/03` §10).

| Excluded | Spec source | Non-foreclosure requirement in V1 |
|---|---|---|
| Illustrations, image containers, text-and-image layouts, image placement and resizing, full-page artwork, illustrated covers | §13 Version 2, §13 V2 closing paragraph | Illustrations must arrive as additional content blocks without redesigning the manuscript or print system — composition stores block identifiers and templates admit new block types (`R-ARC-006`, `R-CMP-013`) |
| Character and scene visual continuity, illustration references, print-resolution checks | §13 Version 2 | Beat and source-reference metadata must already be able to carry future illustration bindings without a schema migration that discards stable IDs (`R-ARC-004`) |
| Audiobook narration, read-along highlighting, multilingual publication, pronunciation aid, interactive vocabulary | §13 Version 3 | The reader runtime must be data-driven from a revision so a narration track or a second language is added as data, not as a second renderer (`R-DIG-001`) |
| Scripture exploration, comprehension activities, audio ambience, saved reader progress, digital bookshelves, branded collections | §13 Version 3 | Reader state must not be baked into the artifact, so a future reader service can layer on it without re-authoring books (D-19) |
| Collaborative authoring, multi-book collections, shared characters, template marketplace, catalogue management, translation workflows, print integrations, advanced edition management | §13 Version 4 | Projects must remain single-owner directories of plain JSON so a future collection layer can index them rather than re-model them (D-03) |
| Incremental or patch updates to exported files | `docs/03` §10 | An export is a whole artifact or a refusal; partial exports must never be produced (`R-OPS-011`) |
| Client-side layout decisions in the reader | `docs/03` §10 | The reader reflows between planned boundaries; it must not re-plan the book (`R-DIG-014`, `R-DIG-015`) |
| An editor that mutates prose in place | `docs/03` §10 | Prose changes are proposals applied to revisions (`R-GEN-004`, `R-GEN-008`) |
| A plugin system | `docs/03` §10 | Extensibility for V1 is satisfied by profiles, themes and templates as data (`R-PUB-002`, `R-PUB-007`) |
| Cloud service, accounts, multi-tenant hosting, publish-to-URL | §13 V1 (local), `docs/03` §10, D-19 | The studio is local-first and every deliverable is a standalone file the author owns (`R-DIG-001`, `R-OPS-010`) |
| Illustration-readiness rendering behaviour | §3.2 | The wizard stores intent only and produces no illustration behaviour (`R-WIZ-012`) |

## 7. Requirements that cannot be verified automatically

Some obligations of §15 are physical or human judgements. They are recorded with a manual sign-off path and are **excluded from automated release gates** so a CI pass never implies they were met. Where such an obligation is a requirement, `docs/14-test-plan.md` still declares its `verification` id — at the `manual` layer, in `docs/14` §3.23 — so the requirement is never left with an id the plan does not declare. The table names the reviewer role, the checklist artefact and the sign-off record for each.

| R-id | T-id (layer `manual`) | Requirement (short) | Spec source | Why not automatable | Manual sign-off path |
|---|---|---|---|---|---|
| `R-VSN-004` | `T-VSN-004` | Short-form pacing and intentional page transitions are first-class composition decisions, not an emergent property of text volume | §1.3 | whether a page turn reads as deliberate and paced is an editorial judgement; the machine can only check that page turns *are* recorded composition data | Reviewer role **Author (editorial)**; artefact `checklists/editorial-pacing.md`; sign-off recorded as an `Approval` with scope `manuscript` (`docs/04` §7.3). Machine bounds: `T-CMP-060`…`T-CMP-072`, `T-UXS-007` |
| `R-VSN-011` | `T-VSN-011` | Accessibility and readability remain intact across every reference viewport and the print trim | §1.3 | the thresholds are machine-checkable, but "readable" on a device and on a printed proof is a human verdict over the whole page | Reviewer roles **Author** and **Print production operator**; artefact `checklists/readability.md`; sign-off as the G3 and G4 gate records (§8). Machine bounds: `T-UXS-104`, `T-DIG-103`, `T-PRT-102`, `T-CMP-039` |
| `R-IDE-015` | `T-IDE-015` | Questionable interpretations are flagged and block export until a human resolves the flag | §4.3 | the interpretive judgement is human; the flag, the gate and the state are machine-checked | Reviewer role **Author (scripture reviewer)**; artefact `checklists/scripture-interpretation.md`; sign-off is the author setting `SourceReference.verification.state`, export blocked while `flagged` (`docs/05` §1.4). Machine half: `T-IDE-024` |
| `R-GEN-003` | `T-GEN-017` | Drafted prose contains no filler, no repeated lesson, no over-extended dialogue and no passage expanded to fill pages | §5.1 | whether prose reads as filler or padding is an editorial judgement; the machine can only check that the engine never pads or truncates to reach a target and that duplication is reported | Reviewer role **Author (editorial)**; artefact `checklists/drafting-quality.md`; sign-off as the manuscript `Approval` (`docs/04` §7.3). Machine bounds: `T-VSN-003`, `T-QAS-019` |
| — (no `R-`) | **`A-18`** acceptance record | Print and assemble a physical booklet successfully | §14 required demonstration 18; §15.4 "Successful physical booklet assembly" | requires paper, a printer and folding; no machine-observable signal exists | The `A-18` acceptance record in `docs/16-reference-story-acceptance-tests.md`, stored as `Approval.manual_proof {kind: "printed_booklet", at, photo_hash, notes}` (`docs/04` §7.3); the artifact manifest is not `reproducible` on this path and is labelled a manual proof |
| — (no `R-`) | — | The writing is appropriate for the intended audience | §15.1 | an editorial judgement, not a measurable invariant; automated checks bound reading level only | Author sign-off recorded on the approval (`Approval` scope `manuscript`); reading-level drift is reported by `MS_STATS_DRIFT` (`docs/04` §10) as an input, never as the verdict |
| — (no `R-`) | — | The central lesson is clear without excessive repetition | §15.1, §10.1 | requires semantic judgement; duplication detection (`R-GEN-003`, machine-checked) is only a proxy | Author sign-off on the manuscript approval |
| — (no `R-`) | — | Significant adaptations are approved by the author | §4.3 | a consent decision by definition | A recorded `Approval` with scope `manuscript` (D-11); `R-CMP-017`'s machine test covers only that approval is *required* |
| — (no `R-`) | **`A-18`** acceptance record | The printed book matches the approved design in hand | §15.4 | depends on the physical print run and paper stock | `Approval.manual_proof` of kind `printed_booklet`, referenced by the exported artifact |

Four of these rows are requirements and therefore carry a `T-` id (`T-VSN-004`, `T-VSN-011`, `T-IDE-015`, `T-GEN-017`), declared at the `manual` layer in `docs/14` §3.23. The remaining rows are §15.1/§15.4 acceptance judgements for which `spec/requirements.json` states no `R-` requirement — note that the physical booklet proof is acceptance demonstration **A-18**, never a requirement id, and that **D-16 is the governing page target from which the word budget is derived**, not the manual proof (see `docs/REVIEW-RECONCILIATION.md` §5).

Every other requirement in §3 and §4 has an automated verification path. All 221 requirements name a `verification` id that `docs/14-test-plan.md` declares, and each of those ids is declared by a row carrying the requirement's `R-` back-reference, so the traceability holds in both directions (`docs/14` §10.1; checks `C1` and `C2` in `tools/gen-checklist.py`). A requirement whose test cannot be written is escalated to this table or removed; it is never left silently unverified (`docs/00` §4.5).

## 8. Priority and release gating

`must` requirements are release-blocking for V1; `should` requirements are included in V1 but may be deferred past the first acceptance pass without failing it. The V1 acceptance pass is the set of criteria in §15.1–§15.5, each expressed below as a gate that closes only when every requirement in its cluster verifies.

| Gate | Spec criterion | Requirements that must be green | Gate fails if |
|---|---|---|---|
| **G1 — Manuscript quality** | §15.1 | §3.4 IDE, §3.5 GEN, §3.2 PUB; §4.4 accessibility not required | Any `must` in IDE/GEN red, or an unapproved adaptation, or an unresolved scripture flag |
| **G2 — Page composition quality** | §15.2 | §3.6 CMP, §3.11 UXS (editor), `R-ARC-011`, `R-OPS-001`, `R-OPS-003` | Composition cannot survive save and reload, or history cannot roll back, or an impossible constraint is not identified |
| **G3 — Interactive HTML quality** | §15.3 | §3.7 DIG, §3.8 DSN (digital units), §4.4 accessibility (reader) | Any clipping, a broken reading order, a missing reduced-motion path, or loss of the approved visual identity |
| **G4 — Print quality** | §15.4 | §3.9 PRT, `R-DSN-010/011`, `R-PRT-102`, §7 manual sign-off | Border inconsistency, a margin breach, an unintended blank page, incorrect imposition, or missing manual proof for the physical assembly demonstration |
| **G5 — Operational quality** | §15.5 | §3.13 OPS, `R-ARC-010/013/014`, §4.2 reproducibility | Projects do not persist, a failed step cannot resume, an export does not match the approved revision, or a critical validation error fails to block approval |

**What must exist before a V1 acceptance pass.** All `must` requirements in §3 and §4 are green; every gate G1–G5 is closed; the reference project of §14 has produced all three deliverables with matching manifests; and the two manual sign-offs of §7 are recorded. The acceptance pass is run once end-to-end (§17 Phase 9) against the reference storybook, not per-component.

**Deferral rule.** A `should` requirement may be deferred only if the deferral is recorded as `deferred` in `docs/15-development-checklist.md` with a reason, and the deferral does not open a gate above. No `must` requirement may be deferred.

**Escalation.** If a requirement in this document contradicts a `D-nn`, the requirement is wrong and must be raised for ratification rather than implemented (`docs/17` preamble).
