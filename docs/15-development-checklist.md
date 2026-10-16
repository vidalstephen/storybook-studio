# Development Checklist

**Implements:** spec §16 item 17 ("The development checklist should track each requirement as planned, in progress, implemented, validated, or deferred"), §15 (V1 acceptance criteria), §17 (implementation priorities)
**Deliverable covered:** D17 (per §16)
**Inherits:** `docs/00-README.md` (§2 document/deliverable index, §3 identifier schemes, §4 conventions), `docs/01-product-requirements.md` (owns the `R-<AREA>-<nnn>` ids and the gates G1–G5), `spec/requirements.json` (the machine-readable 221-requirement index), `docs/13-incremental-roadmap.md` (owns the nine §17 phases and their exit criteria), `docs/14-test-plan.md` (owns the `T-<AREA>-<nnn>` ids and the coverage rule), `docs/11-validation-strategy.md` (owns finding codes)

> **Registry boundaries.** This document mints no identifier. It restates no requirement, no test, no phase exit criterion and no finding code — it projects them. `R-` is owned by `docs/01`, `T-` by `docs/14`, `A-01…A-18` by `docs/16-reference-story-acceptance-tests.md`, phases and exit criteria by `docs/13`, finding codes by `docs/11` (`docs/00` §3.2). Where this document and an owner disagree, the **owner wins** and this document is regenerated.

> **Two naming collisions to read correctly.** `D<nn>` (no hyphen) is a **§16 deliverable number** — so *this* file is `D17`. `D-nn` (hyphen) is a **decision** in `docs/17` — so `D-17` is the *checkpointed-jobs* decision, unrelated to this file. And §14's demonstration 18 (physically print and assemble a booklet) is the acceptance id **A-18**, recorded as `Approval.manual_proof` (`docs/04` §7.3; `docs/01` §7) — **not** `D-16`. `D-16` is *length targets as word budgets and beat counts* (`docs/17` Part C).

---

## 1. What this document is, and how to use it

`spec/requirements.json` holds 221 requirements across thirteen AREAs (`docs/00` §3.1). This checklist is the single view that answers, for each one: **what phase closes it, what test verifies it, and where it stands.** Nothing else in the set does the last of those three.

**Source of truth.** The status store is `spec/checklist-status.json` — one entry per requirement:

```json
{ "id": "R-CMP-014", "status": "planned", "note": "", "updated": "2026-10-15" }
```

The status store is the only file updated by hand. This markdown file is a **view**: the four tables in §3, §4, §5 and §6 are generated from the store and the index and are overwritten on every run. Editing text inside a marker region is lost — the framing around it is not.

**Who updates what.**

| Actor | Updates | When |
|---|---|---|
| An implementing agent | `spec/checklist-status.json` — the status and note of any requirement whose state changed | in the same change that moves the requirement's state, so the store and the code never disagree |
| Stephen | `spec/checklist-status.json` — ratification, deferrals, and the status of any requirement he personally verifies | at a phase boundary (`docs/13` §5.2) or when accepting a `validated` claim |
| Nobody | the generated regions of this file | they are rewritten by the generator; a hand edit inside a marker is a lost edit |

**Regenerating.**

```
python3 tools/gen-checklist.py            # regenerate; exit 0 clean, exit 2 if the set has defects
python3 tools/gen-checklist.py --strict   # abort on any defect (exit 1, nothing written)
python3 tools/gen-checklist.py --check    # validate and report only; never writes
```

The generator reads `spec/requirements.json`, `spec/checklist-status.json` and `docs/14-test-plan.md`, and writes only between four named marker pairs — `GEN:AREA-MATRICES`, `GEN:PHASE-VIEW`, `GEN:ORPHANS` and `GEN:DELIVERABLE-COVERAGE`, each an HTML comment of the form `<!-- GEN:NAME -->` … `<!-- /GEN:NAME -->`. It is deterministic — identical inputs produce byte-identical output — and has no third-party dependencies. Its exit codes are load-bearing:

| Exit | Meaning | Document written? |
|---|---|---|
| `0` | all checks pass; no orphans, no gaps | yes |
| `1` | **fatal**: the status store cannot be reconciled with the index (a requirement with no status entry, a status entry with no requirement, a status outside the five, a `deferred` entry with an empty note, or a missing marker pair) | **no** — a store that cannot be reconciled would render a misleading table |
| `2` | the store is valid, but the **requirement set has defects** (an uncovered requirement, a missing §16 deliverable file, a requirement with no phase or no owning document). Written because the checklist's whole job is to record these | yes, and the defects are named on `stderr` |

The split is deliberate: exit `1` means *the checklist cannot be trusted*; exit `2` means *the checklist is correct and it is reporting that the set is incomplete*.

---

## 2. The status model

The five states are the spec's (§16 item 17). What they mean **here**, and the evidence each requires:

| Status | Means | Evidence required to enter it | Exit rule |
|---|---|---|---|
| `planned` | The requirement is in the index; no implementation exists for it. **This is the state of all 221 requirements at authoring time** — this set precedes code (`docs/00` §5). | none | — |
| `in_progress` | Implementation has begun; no passing test yet. | a named workstream or phase activity (`docs/13` §3) touching it | — |
| `implemented` | Code exists for the requirement, but its verifying test has **not** run green on the pinned environment. | the code exists and the verifying `T-` test exists in `docs/14` | — |
| `validated` | Code exists **and** the named verifying test has run and passed on the pinned Chromium build, with the run cited. | a **cited result**: the commit hash, the CI run, and — where determinism is claimed — the matched golden hash | see the evidence rule below |
| `deferred` | Deliberately not implemented for V1. | a **non-empty note** naming the reason and the authorising spec section or `D-nn` | only a `should` requirement may be `deferred` (`docs/01` §8) |

**The `validated` evidence rule — a `validated` status is not a claim.** A requirement may be marked `validated` only when a **named test that actually ran** produced a **cited result**. Absent a citation it is `implemented`, never `validated`. This is `docs/00` §4.3 made operational — *"a claim of determinism without a golden test is not a claim"* — and `docs/14` §1.2. The gate statement of `docs/13` §5.1 is the model: *"CI is green on commit `<hash>`" — a fact, not a judgement.* A `validated` entry whose note carries no commit hash or run reference is itself a defect in this document.

**The deferral rule.** `docs/01` §8: a `should` requirement may be deferred **only** if the deferral is recorded as `deferred` here with a reason, and the deferral does not open a gate. **No `must` requirement may be deferred.** The generator enforces a non-empty note on every `deferred` entry (a `must` deferral is reported as a set defect).

**The five `should` requirements** (`docs/01` §8: included in V1, deferrable past the first acceptance pass without failing it): `R-WIZ-013`, `R-IDE-016`, `R-CMP-011`, `R-DIG-011`, `R-PRT-002`. Every other requirement is `must` and release-blocking.

---

## 3. Per-area matrices

One table per AREA, in the canonical order of `docs/00` §3.1. Columns: `ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note`. A `Verifying test` marked **⚠ unmapped** names a test the requirement claims but `docs/14-test-plan.md` does not declare; every such row is listed again in §5.

<!-- GEN:AREA-MATRICES -->
_Generated by `tools/gen-checklist.py` from `spec/requirements.json`, `spec/checklist-status.json` and `docs/14-test-plan.md`. Do not edit by hand._

Legend: a `Verifying test` value marked **⚠ unmapped** is not declared by `docs/14-test-plan.md`; it is recorded as an orphan in §5.

#### VSN — vision and foundational principles (spec §1)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-VSN-001 | The system must produce the interactive HTML storybook, the reading PDF and the booklet PDF from one approved … | §1.2 | must | 1 | `T-VSN-001` | planned | — |
| R-VSN-002 | All three deliverables must render from a shared design token set so the visual identity is identical across … | §1.2 | must | 5 | `T-VSN-002` | planned | — |
| R-VSN-003 | Content-quality decisions must take precedence over any word-count or page-count target when the two conflict. | §1.3, D-16 | must | 1 | `T-VSN-003` | planned | — |
| R-VSN-004 | Short-form pacing and intentional page transitions must be first-class composition decisions rather than an … | §1.3 | must | 4 | `T-VSN-004` | planned | — |
| R-VSN-005 | The user must retain authority over every creative and editorial decision, and no such decision may be … | §1.3, D-11 | must | 1 | `T-VSN-005` | planned | — |
| R-VSN-006 | Deterministic code must own all typography measurement, page geometry and rendering, and AI must never decide … | §1.3, D-04 | must | 2 | `T-VSN-006` | planned | — |
| R-VSN-007 | The digital and print editions must share one visual identity while keeping independent pagination. | §1.3 | must | 1 | `T-VSN-007` | planned | — |
| R-VSN-008 | Approved text and approved page composition must be protected against unrequested regeneration. | §1.3, D-11 | must | 4 | `T-VSN-008` | planned | — |
| R-VSN-009 | Formatting defects must be emitted as findings before publication and never silently approximated. | §1.3, §10.5 | must | 8 | `T-VSN-009` | planned | — |
| R-VSN-010 | Generation must favour efficient, modular, reproducible computation and must avoid unnecessary AI calls. | §1.3, §12.5 | must | 1 | `T-VSN-010` | planned | — |
| R-VSN-011 | Accessibility and readability must remain intact across every reference viewport and the print trim. | §1.3 | must | 8 | `T-VSN-011` | planned | — |
| R-VSN-012 | Every project must be recoverable, editable and version-controlled from files on local disk. | §1.3, D-03 | must | 1 | `T-VSN-012` | planned | — |

#### PUB — publication types (spec §2)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-PUB-001 | The system must support the four publication types of §2: children's literature, biblical and faith-based … | §2 | must | 1 | `T-PUB-001` | planned | — |
| R-PUB-002 | Publication-specific rules must be implemented as data-driven publication profiles rather than as separate … | §2, D-15 | must | 1 | `T-PUB-002` | planned | — |
| R-PUB-003 | The children's literature profile must supply age-appropriate defaults for typography, density tolerance … | §2.1 | must | 1 | `T-PUB-003` | planned | — |
| R-PUB-004 | The biblical profile must enable scripture source capture, scripture validation and the public-domain … | §2.2, D-08 | must | 1 | `T-PUB-004` | planned | — |
| R-PUB-005 | The inspirational profile must operate without requiring any scripture reference. | §2.3 | must | 1 | `T-PUB-005` | planned | — |
| R-PUB-006 | The educational and other profile must accept imported manuscripts that require editing and professional … | §2.4 | must | 1 | `T-PUB-006` | planned | — |
| R-PUB-007 | Adding a new publication type must require only a new profile document and no code change. | §2, D-15 | must | 1 | `T-PUB-007` | planned | — |
| R-PUB-008 | A project must record its publication type and profile name as configuration fields resolved at creation. | §3.2 | must | 1 | `T-PUB-008` | planned | — |
| R-PUB-009 | Every publication profile must declare the front matter and back matter its type requires. | §2, §3.2 | must | 1 | `T-PUB-009` | planned | — |
| R-PUB-010 | Every publication profile must declare the density tolerance band used for its target age range. | §6.7 | must | 2 | `T-PUB-010` | planned | — |

#### WIZ — creation wizard and configuration (spec §3)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-WIZ-001 | The creation wizard must offer all ten creation modes of §3.1 as selectable entry points. | §3.1 | must | 1 | `T-WIZ-001` | planned | — |
| R-WIZ-002 | The wizard must collect every story-configuration field of §3.2 before drafting may begin. | §3.2 | must | 1 | `T-WIZ-002` | planned | — |
| R-WIZ-003 | The wizard must supply profile-derived recommended defaults for every configuration field so that no … | §3.2 | must | 1 | `T-WIZ-003` | planned | — |
| R-WIZ-004 | Each length preset of §3.3 must resolve to a governing target printable page count (`target_print_pages`) and … | §3.3, D-16 | must | 1 | `T-WIZ-004` | planned | — |
| R-WIZ-005 | The wizard must present the target digital reading-page count and the target printable page count as two … | §3.3, D-06 | must | 1 | `T-WIZ-005` | planned | — |
| R-WIZ-006 | The wizard must record language and regional spelling convention into the project configuration. | §3.2 | must | 1 | `T-WIZ-006` | planned | — |
| R-WIZ-007 | Import mode must ingest an existing manuscript as content blocks without retyping. | §3.1 | must | 1 | `T-WIZ-007` | planned | — |
| R-WIZ-008 | Revise-an-existing-book must open the existing project rather than create a new one. | §3.1 | must | 1 | `T-WIZ-008` | planned | — |
| R-WIZ-009 | New-edition-using-an-existing-design must start from a copy of the chosen project's design revision. | §3.1 | must | 1 | `T-WIZ-009` | planned | — |
| R-WIZ-010 | Start-from-a-template must instantiate a project from a stored profile, theme and front and back matter set. | §3.1 | must | 1 | `T-WIZ-010` | planned | — |
| R-WIZ-011 | The wizard must store front-matter and back-matter preferences as ordered lists in the project configuration. | §3.2 | must | 1 | `T-WIZ-011` | planned | — |
| R-WIZ-012 | The wizard must store illustration readiness as declared intent only and must produce no illustration … | §3.2 | must | 1 | `T-WIZ-012` | planned | — |
| R-WIZ-013 | The wizard must reject a configuration whose age range, reading proficiency and length preset are mutually … | §3.2, §3.3 | should | 1 | `T-WIZ-013` | planned | — |
| R-WIZ-014 | The wizard must map reading proficiency to default typography and density settings. | §3.2 | must | 1 | `T-WIZ-014` | planned | — |
| R-WIZ-015 | A project's target word budget must be derived from its governing page target as `target_words = … | §3.2, D-16 | must | 1 | `T-WIZ-015` | planned | — |
| R-WIZ-016 | A print page count that misses `target_print_pages` after the pad-to-a-multiple-of-four step must be reported … | §3.2, §9.4, D-16 | must | 6 | `T-WIZ-016` | planned | — |
| R-WIZ-017 | A project's effective prose budget must be derived from the story pages' lines available for prose, never … | §3.2, D-16 | must | 1 | `T-WIZ-018` | planned | — |

#### IDE — ideation and story blueprint (spec §4)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-IDE-001 | Ideation must return at least two alternative story concepts per request when asked for alternatives. | §4.1 | must | 1 | `T-IDE-102` | planned | — |
| R-IDE-002 | Each concept must contain a suggested title, premise, audience, genre, characters, conflict, lesson … | §4.1 | must | 1 | `T-IDE-103` | planned | — |
| R-IDE-003 | Concepts must be revisable, combinable, comparable and selectable before drafting begins. | §4.1 | must | 1 | `T-IDE-104` | planned | — |
| R-IDE-004 | Drafting must be blocked until a StoryBlueprint containing every required field of §4.2 exists. | §4.2 | must | 1 | `T-IDE-001` | planned | — |
| R-IDE-005 | The blueprint must define premise, target reader, opening hook, characters, setting, central theme … | §4.2 | must | 1 | `T-IDE-001` | planned | — |
| R-IDE-006 | The blueprint must express progression as ordered narrative beats and page-turn opportunities rather than as … | §4.2 | must | 1 | `T-IDE-002` | planned | — |
| R-IDE-007 | The blueprint must be stored as a content-hashed, diffable and revertible revision. | §4.2, D-10 | must | 1 | `T-IDE-105` | planned | — |
| R-IDE-008 | Beat derivation must produce exactly one Beat per blueprint progression entry, deterministically, with stable … | §4.2, §6.5 | must | 2 | `T-IDE-002` | planned | — |
| R-IDE-009 | Each beat's word budget must be derived from the blueprint's estimated word count and the entry's weight. | §5.1 | must | 2 | `T-IDE-003` | planned | — |
| R-IDE-010 | Removing a beat from the blueprint must unassign its blocks and raise a BEAT_ORPHANED_BLOCKS finding rather … | §4.2 | must | 2 | `T-IDE-010` | planned | — |
| R-IDE-011 | Every scripture reference must be recorded as a SourceReference resolving to book, chapter and verse. | §4.3 | must | 1 | `T-IDE-011` | planned | — |
| R-IDE-012 | Scripture text and paraphrase must be distinguished structurally by block type and by source-reference … | §4.3 | must | 1 | `T-IDE-012` | planned | — |
| R-IDE-013 | Invented dialogue must be marked as paraphrase and must never be typed as scripture. | §4.3, D-08 | must | 1 | `T-IDE-013` | planned | — |
| R-IDE-014 | A biblical project must preserve the source account's meaning and chronology, and a reordered beat must raise … | §4.3 | must | 2 | `T-IDE-014` | planned | — |
| R-IDE-015 | Questionable interpretations must be flagged for review and must block export until a human resolves the flag. | §4.3 | must | 1 | `T-IDE-015` | planned | — |
| R-IDE-016 | Optional scripture references, memory verses, prayers and discussion questions must be supported as front and … | §4.3 | should | 5 | `T-IDE-016` | planned | — |
| R-IDE-101 | Importing scripture must require a licence entry for the chosen translation, and the import must be refused … | §4.3, D-08 | must | 1 | `T-IDE-101` | planned | — |

#### GEN — content generation and editorial (spec §5)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-GEN-001 | Story drafting must proceed section by section against the approved blueprint. | §5.1 | must | 1 | `T-GEN-015` | planned | — |
| R-GEN-002 | Each drafted section must carry a narrative purpose, a word budget, relevant context, tone and emotional … | §5.1 | must | 1 | `T-GEN-016` | planned | — |
| R-GEN-003 | Drafting must avoid filler, repeated lessons, extended dialogue and any expansion performed solely to fill … | §5.1 | must | 1 | `T-GEN-017` | planned | — |
| R-GEN-004 | Drafted prose must be returned as a Proposal and must alter the manuscript only when that proposal is applied. | §5.1, D-11 | must | 1 | `T-GEN-001` | planned | — |
| R-GEN-005 | Editorial review must offer the six review layers of §5.2 as selectable depths L1 structural, L2 line and … | §5.2, D-12 | must | 1 | `T-GEN-005` | planned | — |
| R-GEN-006 | Editorial review must return findings that reference block identifiers and must never return rewritten prose. | §5.2 | must | 1 | `T-GEN-006` | planned | — |
| R-GEN-007 | Review results must be cached by block hash, depth and profile so that unchanged blocks are never re-reviewed. | §5.2, D-12 | must | 1 | `T-GEN-007` | planned | — |
| R-GEN-008 | No review layer may auto-apply a change, and applying a review suggestion must be a user action. | §5.2, D-11 | must | 1 | `T-GEN-008` | planned | — |
| R-GEN-009 | Controlled revision must support all ten operations of §5.3 as Proposal-producing actions. | §5.3 | must | 1 | `T-GEN-009` | planned | — |
| R-GEN-010 | Prose changes must remain localised to the targeted blocks unless a broader scope is explicitly requested. | §5.3 | must | 1 | `T-GEN-010` | planned | — |
| R-GEN-011 | A rewrite proposal targeting content-locked material must be refused at creation. | §5.3, §6.9 | must | 4 | `T-GEN-011` | planned | — |
| R-GEN-012 | Every AI proposal must record its provider, model, prompt hash, timestamp and input revision hashes. | §12.4, D-11 | must | 1 | `T-GEN-012` | planned | — |
| R-GEN-013 | Every applied prose change must produce a manuscript revision carrying a parent pointer and a reason. | §5.3, §12.2 | must | 1 | `T-GEN-013` | planned | — |
| R-GEN-014 | The manuscript must expose derived statistics for word count, characters, reading minutes and reading level … | §5.1, §10.1 | must | 1 | `T-GEN-014` | planned | — |

#### CMP — page composition (spec §6)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-CMP-001 | Page composition must begin only after a manuscript revision exists. | §6.2 | must | 2 | `T-CMP-096` | planned | — |
| R-CMP-002 | The system must generate an initial composition proposing page and spread boundaries, dramatic page turns and … | §6.2 | must | 2 | `T-CMP-097` | planned | — |
| R-CMP-003 | Available content space must be estimated by measuring the actual design revision's text box rather than a … | §6.2, §6.7 | must | 2 | `T-CMP-098` | planned | — |
| R-CMP-004 | Composition must be a deterministic pure function of the manuscript, composition and design revisions plus … | §6.2, D-04 | must | 2 | `T-CMP-099` | planned | — |
| R-CMP-005 | The editor must let the author move text blocks between pages and reorder unlocked story beats. | §6.4 | must | 4 | `T-UXS-003` | planned | — |
| R-CMP-006 | The editor must let the author split a long page and merge adjacent pages. | §6.4 | must | 4 | `T-UXS-005` | planned | — |
| R-CMP-007 | The editor must let the author insert and remove intentional page breaks. | §6.4 | must | 4 | `T-UXS-007` | planned | — |
| R-CMP-008 | The editor must let the author create a page, insert an approved blank page and convert a page between the … | §6.4 | must | 4 | `T-UXS-009` | planned | — |
| R-CMP-009 | The editor must let the author assign a predefined page layout template to any page. | §6.4, §6.8 | must | 4 | `T-UXS-012` | planned | — |
| R-CMP-010 | The editor must let the author lock selected content placement and lock an entire composed print page. | §6.4, §6.9 | must | 4 | `T-UXS-013` | planned | — |
| R-CMP-011 | The editor must support undo, redo, comparison of page compositions and restoration of a previous approved … | §6.4 | should | 4 | `T-UXS-017` | planned | — |
| R-CMP-012 | Accessible move commands must be available for every operation that can also be performed by dragging. | §6.4 | must | 4 | `T-UXS-020` | planned | — |
| R-CMP-013 | A composition revision must store block identifiers and rules only, containing no prose, and must hold the … | §6.10, §12.3 | must | 2 | `T-CMP-030` | planned | — |
| R-CMP-014 | Digital pagination may introduce additional pages while logical beat order is always preserved. | §6.10 | must | 3 | `T-CMP-033` | planned | — |
| R-CMP-015 | A cohesive story beat may be split across pages only when the split is intentional and editorially … | §6.5 | must | 2 | `T-CMP-100` | planned | — |
| R-CMP-016 | Page density must be classified from measurement rather than raw word count, and density suggestions must … | §6.7 | must | 4 | `T-CMP-055` | planned | — |
| R-CMP-017 | An editorial change affecting meaning or content must require explicit user approval before it is applied. | §6.7 | must | 4 | `T-CMP-101` | planned | — |
| R-CMP-018 | Page-turn recommendations must be ranked by deterministic signals and stored with an accepted, rejected or … | §6.6 | must | 4 | `T-CMP-072` | planned | — |
| R-CMP-019 | A page-turn suggestion that would fragment a beat or violate a keep-together lock must be suppressed, and the … | §6.6 | must | 4 | `T-CMP-071` | planned | — |
| R-CMP-020 | Every lock must carry an explicit numeric precedence, a defined scope and a mandatory human reason, and an … | §6.9, D-07 | must | 4 | `T-CMP-010` | planned | — |
| R-CMP-021 | A composition whose solve produces a critical violation must not be emitted as a revision. | §6.9 | must | 4 | `T-CMP-009` | planned | — |
| R-CMP-022 | An approval must bind a specific manuscript, composition and design revision triple, and any change that … | §6.11 | must | 4 | `T-OPS-011` | planned | — |

#### DIG — interactive HTML reader (spec §7)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-DIG-001 | The HTML storybook must be a self-contained deliverable that renders from a local file with no network access. | §7.1, D-19 | must | 3 | `T-DIG-040` | planned | — |
| R-DIG-002 | The reader must present a polished fullscreen reading experience on desktop, tablet and mobile. | §7.1 | must | 3 | `T-DIG-104` | planned | — |
| R-DIG-003 | The reader must present facing pages on wide screens and a single page on narrow screens. | §7.1 | must | 3 | `T-DIG-021` | planned | — |
| R-DIG-004 | The reader must never force a two-page spread when doing so would compromise readability. | §7.1 | must | 3 | `T-DIG-105` | planned | — |
| R-DIG-005 | The reader must accommodate both portrait and landscape orientations without losing content. | §7.1 | must | 3 | `T-DIG-023` | planned | — |
| R-DIG-006 | The reader must support all five configurable transitions of §7.2: page curl, fold, horizontal slide, fade … | §7.2 | must | 3 | `T-DIG-106` | planned | — |
| R-DIG-007 | Animation must be non-essential to navigation, and interactions must remain functional when an animation is … | §7.2 | must | 3 | `T-DIG-042` | planned | — |
| R-DIG-008 | The reader must respect the reduced-motion preference. | §7.2, D-19 | must | 3 | `T-DIG-042` | planned | — |
| R-DIG-009 | The reader must support previous and next, tap or click, touch swipe and keyboard navigation. | §7.3 | must | 3 | `T-DIG-041` | planned | — |
| R-DIG-010 | The reader must provide fullscreen mode, reading progress and optional page numbering. | §7.3 | must | 3 | `T-DIG-107` | planned | — |
| R-DIG-011 | The reader must provide a table of contents for books that exceed a configured length. | §7.3 | should | 3 | `T-DIG-011` | planned | — |
| R-DIG-012 | The reader must support font-size adjustment within the design revision's declared scale steps. | §7.3 | must | 3 | `T-DIG-012` | planned | — |
| R-DIG-013 | The reader must support resume-reading and jumping to the beginning or the end. | §7.3 | must | 3 | `T-DIG-013` | planned | — |
| R-DIG-014 | The reader must calculate pagination from viewport dimensions, page proportions, text measurements, font … | §7.4 | must | 3 | `T-DIG-014` | planned | — |
| R-DIG-015 | The reader must reflow a passage that cannot fit rather than clipping or hiding it. | §7.4, §6.10 | must | 3 | `T-DIG-015` | planned | — |
| R-DIG-016 | The reader must disclose when a requested composition cannot be reproduced on the current viewport. | §6.10, §7.4 | must | 3 | `T-DIG-016` | planned | — |
| R-DIG-017 | The reader must provide accessible navigation through correct focus order, control labels and landmarks. | §7.3 | must | 3 | `T-DIG-017` | planned | — |
| R-DIG-101 | The first reader page must become interactive within 2 s on the reference mid-range mobile device served from … | §7.1 | must | 3 | `T-DIG-101` | planned | — |
| R-DIG-102 | A page-turn transition must target 60 frames per second and must degrade to the instant transition when the … | §7.2 | must | 3 | `T-DIG-102` | planned | — |
| R-DIG-103 | Digital body text must never render below 16 px_css at scale 1.0 under any permitted reader override. | §8.3, §7.3 | must | 3 | `T-DIG-103` | planned | — |

#### DSN — design system (spec §8)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-DSN-001 | A single approved design revision must supply design tokens to both the HTML and the PDF renderer. | §8.1 | must | 5 | `T-VSN-002` | planned | — |
| R-DSN-002 | The token set must cover typography, page backgrounds, border styles, border thickness, border offsets … | §8.1 | must | 5 | `T-DSN-103` | planned | — |
| R-DSN-003 | The design revision must carry separate digital and print unit sets so each renderer reads only its own. | §8.1 | must | 5 | `T-DSN-104` | planned | — |
| R-DSN-004 | V1 must ship the eight themes of §8.2 as token documents. | §8.2 | must | 5 | `T-DSN-006` | planned | — |
| R-DSN-005 | Every shipped theme must produce a complete design without illustrations. | §8.2 | must | 5 | `T-DSN-006` | planned | — |
| R-DSN-006 | The design system must provide age-appropriate typography presets plus manual adjustment. | §8.3 | must | 5 | `T-DSN-105` | planned | — |
| R-DSN-007 | Typography must expose font size, actual font metrics, line length, line spacing, paragraph spacing and … | §8.3 | must | 5 | `T-DSN-106` | planned | — |
| R-DSN-008 | The design must enforce a readable minimum font size and must refuse to render text below it. | §8.3 | must | 5 | `T-DSN-004` | planned | — |
| R-DSN-009 | A custom font may be selected only when it has an entry in the licensing registry. | §8.3, D-09 | must | 5 | `T-DSN-009` | planned | — |
| R-DSN-010 | A font may be selected for a print design only when its registry entry declares that PDF embedding is … | §8.3, D-09 | must | 6 | `T-DSN-010` | planned | — |
| R-DSN-011 | The print renderer must assert that font embedding succeeded before declaring a PDF valid. | §8.3, D-09 | must | 6 | `T-DSN-011` | planned | — |
| R-DSN-012 | The design revision must carry language and hyphenation as part of the pagination input. | §3.2, D-04 | must | 5 | `T-DSN-012` | planned | — |
| R-DSN-013 | The design revision must declare which reader overrides are permitted, including font scale and the allowed … | §7.3 | must | 5 | `T-DSN-013` | planned | — |
| R-DSN-101 | Font selection must resolve to a licensing registry entry with a licence recorded, and a font without one … | §8.3, D-09 | must | 5 | `T-DSN-101` | planned | — |
| R-DSN-102 | A font used in a print design must declare PDF embedding permitted, and embedding failure must invalidate the … | §8.3, D-09 | must | 6 | `T-DSN-102` | planned | — |

#### PRT — print production and booklets (spec §9)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-PRT-001 | The print renderer must lay out pages using deterministic physical page measurements. | §9.1 | must | 6 | `T-PRT-001` | planned | — |
| R-PRT-002 | The print renderer must support US Letter folded to half-letter, A4 folded to A5, and custom paper sizes. | §9.1 | should | 6 | `T-PRT-002` | planned | — |
| R-PRT-003 | The print renderer must apply fixed inner and outer margins, a binding allowance and page-level composition … | §9.1 | must | 6 | `T-PRT-003` | planned | — |
| R-PRT-004 | Every printed page must use the approved border specification with identical thickness within a selected … | §9.2 | must | 6 | `T-PRT-004` | planned | — |
| R-PRT-005 | Borders must remain inside the print-safe area and must not collide with text or footers. | §9.2 | must | 6 | `T-PRT-005` | planned | — |
| R-PRT-006 | The perimeter frame must remain visually consistent across pages even where interior page templates vary. | §9.2 | must | 6 | `T-PRT-006` | planned | — |
| R-PRT-007 | The print engine must measure actual content fit and the resulting physical page count. | §9.3 | must | 6 | `T-PRT-007` | planned | — |
| R-PRT-008 | Print pagination must honour the frozen approved page assignments supplied by the composition editor. | §9.3, D-05 | must | 6 | `T-PRT-008` | planned | — |
| R-PRT-009 | On overflow the engine must detect it, identify the affected pages, preserve protected content and locks, and … | §9.3, D-05 | must | 8 | `T-PRT-009` | planned | — |
| R-PRT-010 | The print engine must never silently revise approved prose. | §9.3 | must | 6 | `T-PRT-010` | planned | — |
| R-PRT-011 | The total imposed page count of a saddle-stitched booklet must be an exact multiple of four. | §9.4 | must | 7 | `T-PRT-011` | planned | — |
| R-PRT-012 | Imposition must order pages correctly for folding, place front and back correctly and respect duplex … | §9.4 | must | 7 | `T-PRT-012` | planned | — |
| R-PRT-013 | Blank pages required for page-count parity must be inserted deliberately at front and back matter boundaries … | §9.4, D-16 | must | 7 | `T-PRT-013` | planned | — |
| R-PRT-014 | The system must offer the reading PDF and the imposed booklet PDF as two separate downloads. | §9.4 | must | 7 | `T-PRT-014` | planned | — |
| R-PRT-015 | The booklet preview must show how sheets fold and which pages will face one another. | §9.4 | must | 7 | `T-PRT-015` | planned | — |
| R-PRT-016 | The system must generate a print guide specifying paper size, sheet count, duplex requirements, flip-edge … | §9.5 | must | 7 | `T-PRT-016` | planned | — |
| R-PRT-017 | The system must support visual verification of booklet order before the imposed PDF is downloaded. | §9.5 | must | 7 | `T-PRT-017` | planned | — |
| R-PRT-018 | The print output must have correct page numbering and must contain no unintended blank or missing pages. | §10.4 | must | 8 | `T-PRT-018` | planned | — |
| R-PRT-101 | Rendering one print page must complete within 2 s and producing a 16-page reading PDF within 30 s on the … | §9.3 | must | 6 | `T-PRT-101` | planned | — |
| R-PRT-102 | Print body text must never render below the design revision's declared readable minimum of 12 pt. | §8.3 | must | 6 | `T-PRT-102` | planned | — |

#### QAS — quality assurance (spec §10)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-QAS-001 | Content validation must verify completeness, coherence, reading level and theme consistency. | §10.1 | must | 8 | `T-QAS-018` | planned | — |
| R-QAS-002 | Content validation must detect accidental duplication of prose. | §10.1 | must | 8 | `T-QAS-019` | planned | — |
| R-QAS-003 | Scripture fidelity must be validated against the resolved source references where scripture applies. | §10.1 | must | 8 | `T-IDE-022` | planned | — |
| R-QAS-004 | Composition validation must verify that story beats appear in the intended sequence. | §10.2 | must | 8 | `T-CMP-033` | planned | — |
| R-QAS-005 | Composition validation must verify that protected passages have not been modified. | §10.2 | must | 8 | `T-CMP-008` | planned | — |
| R-QAS-006 | Composition validation must report each required page break that is not honoured where feasible. | §10.2 | must | 8 | `T-CMP-034` | planned | — |
| R-QAS-007 | Composition validation must detect story content that is missing or duplicated. | §10.2 | must | 8 | `T-CMP-031` | planned | — |
| R-QAS-008 | Composition validation must flag an unsatisfied lock as unsatisfied and must never repair it silently. | §10.2, §6.9 | must | 8 | `T-CMP-040` | planned | — |
| R-QAS-009 | Composition validation must verify that every blank page is intentional and has a recorded reason. | §10.2 | must | 8 | `T-CMP-037` | planned | — |
| R-QAS-010 | Digital rendering validation must detect clipping, overlap and missing text. | §10.3 | must | 8 | `T-QAS-010` | planned | — |
| R-QAS-011 | Digital rendering validation must verify responsive layout, readable typography and functional page controls. | §10.3 | must | 8 | `T-QAS-011` | planned | — |
| R-QAS-012 | Digital rendering validation must verify correct behaviour under font scaling, reduced motion and screen … | §10.3 | must | 8 | `T-QAS-012` | planned | — |
| R-QAS-013 | Print rendering validation must verify physical dimensions, print-safe margins, gutters and border … | §10.4 | must | 8 | `T-QAS-013` | planned | — |
| R-QAS-014 | Print rendering validation must verify the absence of overflow and missing glyphs, correct imposition, and … | §10.4 | must | 8 | `T-QAS-014` | planned | — |
| R-QAS-015 | Automated correction must follow the §10.5 ladder, exhausting deterministic correction before any AI-assisted … | §10.5 | must | 8 | `T-QAS-015` | planned | — |
| R-QAS-016 | A publication must not receive a final approved status while an unresolved critical rendering problem remains. | §10.5 | must | 8 | `T-QAS-016` | planned | — |
| R-QAS-017 | Every finding must carry a code, a family, a severity, affected references, evidence and a blocking decision. | §10, D-05 | must | 8 | `T-QAS-017` | planned | — |

#### UXS — studio workspace and UX (spec §11)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-UXS-001 | The project dashboard must display title, publication type, audience, current stage and the status of … | §11.1 | must | 4 | `T-UXS-105` | planned | — |
| R-UXS-002 | The dashboard must display the digital page-count range and the print page count together and always labelled. | §11.1, D-06 | must | 4 | `T-DIG-027` | planned | — |
| R-UXS-003 | The workspace must provide the seven separated editing environments of §11.2. | §11.2 | must | 1 | `T-UXS-106` | planned | — |
| R-UXS-004 | The Story Editor must support developing and refining the manuscript. | §11.2 | must | 1 | `T-UXS-107` | planned | — |
| R-UXS-005 | The Story Blueprint environment must manage premise, characters, themes, narrative beats and source … | §11.2 | must | 1 | `T-UXS-108` | planned | — |
| R-UXS-006 | The Page Composition Editor must provide the page navigator, composition canvas, content inspector, design … | §11.2, §6.3 | must | 4 | `T-UXS-109` | planned | — |
| R-UXS-007 | The Design Studio must allow the author to customise visual appearance, typography, borders and page … | §11.2 | must | 5 | `T-UXS-110` | planned | — |
| R-UXS-008 | The Digital Preview must render the responsive HTML presentation inside the workspace. | §11.2 | must | 3 | `T-UXS-111` | planned | — |
| R-UXS-009 | The Print Preview must render fixed pages, spreads, booklet arrangement and print quality. | §11.2 | must | 6 | `T-UXS-112` | planned | — |
| R-UXS-010 | The Publication Center must present validation results, approval controls and export actions. | §11.2 | must | 7 | `T-UXS-113` | planned | — |
| R-UXS-011 | Guided mode must require the user to approve each major decision. | §11.3 | must | 4 | `T-VSN-005` | planned | — |
| R-UXS-012 | Autonomous mode must operate only on unlocked, unapproved content and must never create an approval. | §11.3, D-11 | must | 4 | `T-UXS-114` | planned | — |
| R-UXS-013 | The system must not silently change locked or approved material in either operating mode. | §11.3 | must | 4 | `T-VSN-008` | planned | — |
| R-UXS-014 | Every long-running action must return a job identifier with visible progress rather than blocking the request. | §11.3, D-17 | must | 1 | `T-UXS-101` | planned | — |
| R-UXS-101 | Any long-running operation must return a job identifier within 200 ms and must never hold an HTTP request … | §12.5, D-17 | must | 1 | `T-UXS-101` | planned | — |
| R-UXS-102 | Every animation must be honoured as non-essential, and the reader must supply a no-animation path when … | §7.2 | must | 3 | `T-UXS-102` | planned | — |
| R-UXS-103 | Every editing operation, including moving content between pages, must be reachable without a pointer device. | §6.4, §7.3 | must | 4 | `T-UXS-103` | planned | — |
| R-UXS-104 | Every shipped theme must meet WCAG 2.1 AA contrast, at least 4.5:1 for body text, on its page background. | §8.3 | must | 5 | `T-UXS-104` | planned | — |

#### ARC — architecture, data, providers (spec §12)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-ARC-001 | The seven engines of §12.1 must be implemented as modules, each exposing one public interface and not … | §12.1 | must | 1 | `T-ARC-106` | planned | — |
| R-ARC-002 | Module dependency direction must be one-way, and the digital, print and validation modules must be unable to … | §12.1, §12.4 | must | 2 | `T-ARC-107` | planned | — |
| R-ARC-003 | The system must maintain separate records for all sixteen kinds of structured project data listed in §12.2. | §12.2 | must | 1 | `T-ARC-018` | planned | — |
| R-ARC-004 | Content blocks and story beats must have stable identifiers so that a revision does not require rebuilding … | §12.2 | must | 1 | `T-IDE-006` | planned | — |
| R-ARC-005 | The approved manuscript must remain the single authoritative content source. | §12.3 | must | 1 | `T-PRT-010` | planned | — |
| R-ARC-006 | The composition editor must reference manuscript content by identifier and must store no independent copy of … | §12.3 | must | 2 | `T-ARC-005` | planned | — |
| R-ARC-007 | The digital and print renderers must generate from the same approved content revision. | §12.3 | must | 6 | `T-PRT-069` | planned | — |
| R-ARC-008 | The system must support configurable AI providers and models for all seven task kinds of §12.4. | §12.4 | must | 1 | `T-ARC-025` | planned | — |
| R-ARC-009 | Typography measurement, page geometry, rendering, booklet imposition and file validation must be handled by … | §12.4, D-04 | must | 2 | `T-ARC-028` | planned | — |
| R-ARC-010 | Every revision must be content-addressed by a hash over its canonical JSON serialisation. | §12.5, D-10 | must | 1 | `T-ARC-004` | planned | — |
| R-ARC-011 | Only the blocks that changed and the pages they affect may be regenerated or re-measured after an edit. | §12.5 | must | 4 | `T-DIG-008` | planned | — |
| R-ARC-012 | Cached manuscript summaries must be keyed by the content hash of the manuscript they summarise. | §12.5 | must | 1 | `T-ARC-108` | planned | — |
| R-ARC-013 | All AI and render work must run as checkpointed, resumable jobs with bounded retries and an explicit … | §12.5, D-17 | must | 1 | `T-ARC-040` | planned | — |
| R-ARC-014 | AI calls must be cached by prompt hash, input hash, provider and model, and a replayed cached call must be … | §12.5 | must | 1 | `T-ARC-021` | planned | — |
| R-ARC-015 | A project must be a directory of human-readable JSON documents, with any database used only as a disposable … | §12.2, D-03 | must | 1 | `T-ARC-045` | planned | — |
| R-ARC-016 | Opening a project whose schema version exceeds the engine's supported version must be refused and never … | §12.2, D-03 | must | 1 | `T-ARC-013` | planned | — |
| R-ARC-017 | Any AI result that will influence page geometry must first be materialised as a stored revision. | §12.4, D-11 | must | 2 | `T-ARC-029` | planned | — |
| R-ARC-101 | The pagination and solve functions must be deterministic: identical revisions, target, engine version and … | §12.4, D-04 | must | 2 | `T-ARC-101` | planned | — |
| R-ARC-102 | All solver measurements must be quantised to 1/64-pixel integers and all constraint weights must be integers … | D-04 | must | 2 | `T-ARC-102` | planned | — |
| R-ARC-103 | Any collection whose order affects output must be iterated in ULID sort order, never in hash-map order. | D-04 | must | 2 | `T-ARC-103` | planned | — |
| R-ARC-104 | Measuring one content block in Chromium must complete within 5 ms, and measuring a 10,000-word manuscript at … | §12.5 | must | 2 | `T-ARC-104` | planned | — |
| R-ARC-105 | The initial composition solve for a manuscript of up to 400 blocks must complete within 500 ms. | §12.5 | must | 2 | `T-ARC-105` | planned | — |

#### OPS — operational requirements (spec §13 V1 ops, §15.5)

| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |
|---|---|---|---|---|---|---|---|
| R-OPS-001 | Projects must save to disk and reload with all manual composition changes intact. | §13, §15.2 | must | 1 | `T-OPS-001` | planned | — |
| R-OPS-002 | A step interrupted by a crash, a rate limit or a provider fault must resume from its last checkpoint. | §13, §15.5 | must | 1 | `T-OPS-002` | planned | — |
| R-OPS-003 | Revisions must be tracked with a parent pointer, a reason and an actor. | §13, §15.5 | must | 1 | `T-OPS-003` | planned | — |
| R-OPS-004 | An approved publication must be reproducible from its recorded environment and revision triple. | §15.5, D-14 | must | 9 | `T-OPS-004` | planned | — |
| R-OPS-005 | AI calls must be focused and economical, and their cost must be auditable from the stored proposals alone. | §15.5, §12.5 | must | 1 | `T-OPS-005` | planned | — |
| R-OPS-006 | A critical validation error must block final approval. | §15.5, §10.5 | must | 8 | `T-OPS-006` | planned | — |
| R-OPS-007 | Exported files must match the approved revision, or the export must be refused. | §15.5 | must | 9 | `T-OPS-007` | planned | — |
| R-OPS-008 | Every export must carry a manifest recording engine version, Chromium build, font file hashes, theme token … | §15.5, D-14 | must | 9 | `T-OPS-008` | planned | — |
| R-OPS-009 | Every approved publication and its exported artifacts must be archived and retrievable. | §13 | must | 9 | `T-OPS-009` | planned | — |
| R-OPS-010 | Each deliverable must be emitted as a standalone file or directory that the author owns. | §13, D-19 | must | 9 | `T-OPS-105` | planned | — |
| R-OPS-011 | Error recovery must never leave a partial artifact that appears complete. | §13, D-05 | must | 9 | `T-CMP-094` | planned | — |
| R-OPS-012 | An artifact whose manifest cannot be reproduced on the recorded environment must be reported as … | §15.5, D-14 | must | 9 | `T-PRT-068` | planned | — |
| R-OPS-013 | A headless command-line interface must expose project, compose, validate and export operations without the … | §13, D-02 | must | 1 | `T-OPS-106` | planned | — |
| R-OPS-014 | An export that cites an approval which is stale relative to the current revision pointers must be refused. | §15.5 | must | 9 | `T-OPS-014` | planned | — |
| R-OPS-101 | Every exported artifact must embed the environment manifest of engine version, Chromium build, font hashes … | §15.5, D-14 | must | 9 | `T-OPS-101` | planned | — |
| R-OPS-102 | An export must be refused unless the cited approval is approved, its revisions equal the current pointers and … | §15.5 | must | 9 | `T-OPS-102` | planned | — |
| R-OPS-103 | Re-running any AI or render job on unchanged inputs must perform zero billable provider calls. | §12.5, §15.5 | must | 1 | `T-OPS-103` | planned | — |
| R-OPS-104 | Every third-party asset actually used must be recorded in the project licence file, and a missing entry must … | §12.2, D-08 | must | 1 | `T-OPS-104` | planned | — |
<!-- /GEN:AREA-MATRICES -->

---

## 4. The phase view

For each of the nine §17 phases: the requirement ids it closes, and its exit gate. The exit gate is **owned by `docs/13`** and cited, never restated — `docs/13` §3 gives each phase's checkable exit criteria and `docs/13` §5 gives the two gates every phase must pass. A requirement's phase is where it *first becomes buildable*, which is not always where its document is written (`docs/01` §5).

<!-- GEN:PHASE-VIEW -->
_Generated by `tools/gen-checklist.py`. Exit criteria are **owned by `docs/13-incremental-roadmap.md`** and cited, not restated here (`docs/13` §3). Every phase also passes the two gates of `docs/13` §5._

| Phase | §17 objective (short) | Requirement ids closed by this phase | Count | Exit gate (owned by `docs/13`) |
|---|---|---|---|---|
| **1 — Content Foundation** | project configuration, story blueprints, manuscript editing, and basic content validation | R-ARC-001, R-ARC-003, R-ARC-004, R-ARC-005, R-ARC-008, R-ARC-010, R-ARC-012, R-ARC-013, R-ARC-014, R-ARC-015, R-ARC-016, R-GEN-001, R-GEN-002, R-GEN-003, R-GEN-004, R-GEN-005, R-GEN-006, R-GEN-007, R-GEN-008, R-GEN-009, R-GEN-010, R-GEN-012, R-GEN-013, R-GEN-014, R-IDE-001, R-IDE-002, R-IDE-003, R-IDE-004, R-IDE-005, R-IDE-006, R-IDE-007, R-IDE-011, R-IDE-012, R-IDE-013, R-IDE-015, R-IDE-101, R-OPS-001, R-OPS-002, R-OPS-003, R-OPS-005, R-OPS-013, R-OPS-103, R-OPS-104, R-PUB-001, R-PUB-002, R-PUB-003, R-PUB-004, R-PUB-005, R-PUB-006, R-PUB-007, R-PUB-008, R-PUB-009, R-UXS-003, R-UXS-004, R-UXS-005, R-UXS-014, R-UXS-101, R-VSN-001, R-VSN-003, R-VSN-005, R-VSN-007, R-VSN-010, R-VSN-012, R-WIZ-001, R-WIZ-002, R-WIZ-003, R-WIZ-004, R-WIZ-005, R-WIZ-006, R-WIZ-007, R-WIZ-008, R-WIZ-009, R-WIZ-010, R-WIZ-011, R-WIZ-012, R-WIZ-013, R-WIZ-014, R-WIZ-015, R-WIZ-017 | 79 | `docs/13` §3.1 (exit criteria); both gates `docs/13` §5 |
| **2 — Structured Composition** | story beats, logical page boundaries, composition metadata, and basic page allocation | R-ARC-002, R-ARC-006, R-ARC-009, R-ARC-017, R-ARC-101, R-ARC-102, R-ARC-103, R-ARC-104, R-ARC-105, R-CMP-001, R-CMP-002, R-CMP-003, R-CMP-004, R-CMP-013, R-CMP-015, R-IDE-008, R-IDE-009, R-IDE-010, R-IDE-014, R-PUB-010, R-VSN-006 | 21 | `docs/13` §3.2 (exit criteria); both gates `docs/13` §5 |
| **3 — Interactive HTML Reader** | a functioning responsive storybook with page transitions and navigation | R-CMP-014, R-DIG-001, R-DIG-002, R-DIG-003, R-DIG-004, R-DIG-005, R-DIG-006, R-DIG-007, R-DIG-008, R-DIG-009, R-DIG-010, R-DIG-011, R-DIG-012, R-DIG-013, R-DIG-014, R-DIG-015, R-DIG-016, R-DIG-017, R-DIG-101, R-DIG-102, R-DIG-103, R-UXS-008, R-UXS-102 | 23 | `docs/13` §3.3 (exit criteria); both gates `docs/13` §5 |
| **4 — Page Composition Editor** | visual page navigation, page splitting, content redistribution, composition rules, locks, and revision tracking | R-ARC-011, R-CMP-005, R-CMP-006, R-CMP-007, R-CMP-008, R-CMP-009, R-CMP-010, R-CMP-011, R-CMP-012, R-CMP-016, R-CMP-017, R-CMP-018, R-CMP-019, R-CMP-020, R-CMP-021, R-CMP-022, R-GEN-011, R-UXS-001, R-UXS-002, R-UXS-006, R-UXS-011, R-UXS-012, R-UXS-013, R-UXS-103, R-VSN-004, R-VSN-008 | 26 | `docs/13` §3.4 (exit criteria); both gates `docs/13` §5 |
| **5 — Shared Design System** | typography templates, page borders, decorative elements, and responsive styling | R-DSN-001, R-DSN-002, R-DSN-003, R-DSN-004, R-DSN-005, R-DSN-006, R-DSN-007, R-DSN-008, R-DSN-009, R-DSN-012, R-DSN-013, R-DSN-101, R-IDE-016, R-UXS-007, R-UXS-104, R-VSN-002 | 16 | `docs/13` §3.5 (exit criteria); both gates `docs/13` §5 |
| **6 — Print Renderer** | deterministic page layout, print previews, border validation, and standard PDF generation | R-ARC-007, R-DSN-010, R-DSN-011, R-DSN-102, R-PRT-001, R-PRT-002, R-PRT-003, R-PRT-004, R-PRT-005, R-PRT-006, R-PRT-007, R-PRT-008, R-PRT-010, R-PRT-101, R-PRT-102, R-UXS-009, R-WIZ-016 | 17 | `docs/13` §3.6 (exit criteria); both gates `docs/13` §5 |
| **7 — Booklet Publishing** | booklet imposition, sheet previews, print instructions, and booklet PDF export | R-PRT-011, R-PRT-012, R-PRT-013, R-PRT-014, R-PRT-015, R-PRT-016, R-PRT-017, R-UXS-010 | 8 | `docs/13` §3.7 (exit criteria); both gates `docs/13` §5 |
| **8 — Automated Quality Assurance** | robust overflow detection, composition validation, layout correction, and publication audits | R-OPS-006, R-PRT-009, R-PRT-018, R-QAS-001, R-QAS-002, R-QAS-003, R-QAS-004, R-QAS-005, R-QAS-006, R-QAS-007, R-QAS-008, R-QAS-009, R-QAS-010, R-QAS-011, R-QAS-012, R-QAS-013, R-QAS-014, R-QAS-015, R-QAS-016, R-QAS-017, R-VSN-009, R-VSN-011 | 22 | `docs/13` §3.8 (exit criteria); both gates `docs/13` §5 |
| **9 — End-to-End Validation** | produce, approve, export, print, fold, and inspect the first complete reference storybook | R-OPS-004, R-OPS-007, R-OPS-008, R-OPS-009, R-OPS-010, R-OPS-011, R-OPS-012, R-OPS-014, R-OPS-101, R-OPS-102 | 10 | `docs/13` §3.9 (exit criteria); both gates `docs/13` §5 |

**222 of 222** requirements carry a phase 1–9 (a requirement is implemented where it first becomes buildable, `docs/01` §5).
<!-- /GEN:PHASE-VIEW -->

---

## 5. Orphans and gaps

**The rule.** A requirement with **no phase**, **no test**, or **no owning document** is a **defect in the requirement set**, not a note (`docs/00` §3, §4.5). It is surfaced here and the generator exits non-zero; it is never silently omitted or worked around. `docs/14` §10.1 states the same rule from the test side: *"every requirement `R-<AREA>-<nnn>` must be covered by ≥ 1 `T-<AREA>-<nnn>`, or explicitly marked manual / not-machine-testable with a reason. An uncovered, unmarked requirement is a defect in `docs/15`."* Requirements that genuinely cannot be automated are the named manual sign-offs of `docs/01` §7 and are **excluded from the automated gate by design** — they are neither orphans nor silently untested.

Set-level gaps (a §16 deliverable with no covering file) are reported in the same region, because both are the same class of thing: a claim the set makes that the files do not yet back.

<!-- GEN:ORPHANS -->
_Generated by `tools/gen-checklist.py`. Every row is a defect in the set, not a note (`docs/00` §3, `docs/14` §10.1)._

**No orphan requirements.** Every requirement carries a phase, an owning document and a `verification` id declared by `docs/14-test-plan.md`.

**No deliverable gap.** All eighteen §16 deliverables have a covering file.
<!-- /GEN:ORPHANS -->

---

## 6. Deliverable coverage

**The invariant.** Every one of the eighteen §16 deliverables maps to **exactly one covering file**, and that file exists. The mapping is owned by `docs/00-README.md` §2 and is **projected**, not duplicated, here; the check that proves it is the generator's `Present` column (an `os.path.exists` at generation time) plus the row-count assertion of eighteen. A deliverable whose covering file is absent is listed as a set-level gap in §5 and fails generation with exit `2`.

<!-- GEN:DELIVERABLE-COVERAGE -->
_Generated by `tools/gen-checklist.py` from the §16 deliverable list, cross-referencing `docs/00-README.md` §2. `Present` is the result of an `os.path.exists` check at generation time._

| §16 # | Deliverable (§16) | Covering file | Present |
|---|---|---|---|
| 1 | Product requirements specification | `docs/01-product-requirements.md` | yes |
| 2 | End-to-end workflow specification | `docs/02-workflow-specification.md` | yes |
| 3 | Technical architecture | `docs/03-technical-architecture.md` | yes |
| 4 | Project data schema | `docs/04-project-data-schema.md` | yes |
| 5 | Story blueprint and content model | `docs/05-content-and-composition-model.md` | yes |
| 6 | Story beat and composition model | `docs/05-content-and-composition-model.md` | yes |
| 7 | Page Composition Editor interface design | `docs/06-composition-editor-ux.md` | yes |
| 8 | Composition constraint and lock rules | `docs/07-lock-and-constraint-rules.md` | yes |
| 9 | Responsive digital pagination strategy | `docs/08-pagination-strategy.md` | yes |
| 10 | Fixed print pagination strategy | `docs/08-pagination-strategy.md` | yes |
| 11 | Shared typography and design-token architecture | `docs/09-design-token-architecture.md` | yes |
| 12 | Booklet imposition specification | `docs/10-booklet-imposition-spec.md` | yes |
| 13 | Content and rendering validation strategy | `docs/11-validation-strategy.md` | yes |
| 14 | Publication approval and versioning workflow | `docs/12-approval-and-versioning-workflow.md` | yes |
| 15 | Incremental development roadmap | `docs/13-incremental-roadmap.md` | yes |
| 16 | Automated test plan | `docs/14-test-plan.md` | yes |
| 17 | Development checklist | `docs/15-development-checklist.md` | yes |
| 18 | Initial reference-story acceptance tests | `docs/16-reference-story-acceptance-tests.md` | yes |
<!-- /GEN:DELIVERABLE-COVERAGE -->

---

## 7. The V1 release gate as a checklist

The V1 acceptance pass (§15) is run **once, end-to-end**, against the reference storybook of §14 — not per component (`docs/01` §8). The gate definitions are owned by `docs/01` §8 (**G1–G5**); this is the ordered checklist of conditions that must hold **before** that pass is attempted, each with the document or command that proves it.

| # | Condition | Proves it | Owner |
|---|---|---|---|
| 1 | Every requirement has a status entry, and no status is outside the five | `python3 tools/gen-checklist.py --check` exits `0` on the store checks | this file, §2 |
| 2 | No `must` requirement is `deferred`; every `deferred` entry names its reason and authorisation | the same run; §2 deferral rule | `docs/01` §8 |
| 3 | Every `must` requirement is `validated` with a cited run | the status store, read against §2's evidence rule | `docs/01` §8 |
| 4 | **G1 — Manuscript quality** closed | every `must` in §3.3 IDE / §3.4 GEN / §3.2 PUB green; no unapproved adaptation; no unresolved scripture flag | `docs/01` §8, §15.1 |
| 5 | **G2 — Page composition quality** closed | §3.6 CMP, §3.7 UXS (editor), `R-ARC-011`, `R-OPS-001`, `R-OPS-003` green; composition survives save/reload; history rolls back | `docs/01` §8, §15.2 |
| 6 | **G3 — Interactive HTML quality** closed | §3.7 DIG, §3.8 DSN (digital units), §4.4 accessibility (reader) green; no clipping; reduced-motion present | `docs/01` §8, §15.3 |
| 7 | **G4 — Print quality** closed | §3.9 PRT, `R-DSN-010/011`, `R-PRT-102`, and the §7 manual sign-off recorded | `docs/01` §8, §15.4 |
| 8 | **G5 — Operational quality** closed | §3.13 OPS, `R-ARC-010/013/014`, §4.2 reproducibility green; export matches the approved revision | `docs/01` §8, §15.5 |
| 9 | The reference project produces all three §1.2 deliverables from **one** approved revision triple | the Phase 9 run on `fixtures/david-and-goliath/` | `docs/13` §9 |
| 10 | The machine-checkable §14 demonstrations **A-01…A-17** pass in CI on the fixture | `tests/acceptance/`; A-id → `T-` binding in `docs/14` §3.18 | `docs/14` §8.1 |
| 11 | **A-18** (physical print, fold, staple) recorded as a manual sign-off — excluded from the automated gate | `Approval.manual_proof {kind: printed_booklet, …}` | `docs/01` §7, `docs/04` §7.3, `docs/13` §9 |
| 12 | CI is green on the exit commit, on the pinned Chromium build | "CI is green on commit `<hash>`" | `docs/13` §5.1, D-14 |
| 13 | Determinism goldens hash-match on the recorded Chromium build | `T-OPS-030`…`T-OPS-035`; a drift is a failure to investigate, never a rebaseline | `docs/14` §7 |
| 14 | Every exported artifact's manifest is reproducible on the recorded environment and matches the approved revision | `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` clear | D-14, `docs/11` §6 |
| 15 | The two manual sign-offs of `docs/01` §7 are recorded | the `Approval` records | `docs/01` §7 |
| 16 | No orphan requirement remains (§5 region is empty) | `python3 tools/gen-checklist.py --check` exits `0` | this file, §5 |

Items 1–3, 16 are properties of **this** checklist and are checkable without running the product. Items 4–15 are properties of the product and are proven elsewhere; this checklist tracks their requirement cluster, it does not re-test them.

---

## 8. What is **not** tracked here, and why

This document tracks **requirements**, one row each, against a phase and a verifying test. Anything without an `R-` id is out of its scope, and adding a row for it would break the one-to-one invariant of `docs/14` §10.1 and `docs/00` §3.1.

| Not tracked | Why | Where it lives instead |
|---|---|---|
| Implementation tasks, tickets, estimates, calendar dates | a task is not a requirement, and `docs/00` §5 excludes dates; the roadmap is sequenced by exit criteria, not durations | `docs/13` §3 (phase activities) |
| Code review, PR state, merge status | a requirement's status is not a pull request's status; a merged PR does not make a requirement `validated` — a cited passing run does | the repository's GitHub workflow |
| Refactors, technical debt, internal module work | these change code, not the requirement set; a refactor that changes no requirement changes no row. `docs/13` P3 (a phase that breaks CI is not done) is the automated gate, not this checklist | `docs/03` (module tree), `docs/13` §5.1 |
| Test internals, baselines, fixtures, coverage percentages | owned by the test plan; this checklist cites a requirement's verifying `T-`, it does not describe it | `docs/14` §3, §10 |
| The finding-code registry | owned by the validation strategy; this checklist never names a code | `docs/11` §2 |
| V2–V4 features (illustration, narration, collaboration) | carry no `R-` id (`docs/01` §6). Only their **accommodation** is a requirement (`R-ARC-004`, `R-CMP-013`, `R-DIG-001`, …) and that accommodation **is** tracked | `docs/01` §6, `docs/03` §10 |
| UI visual design and mockups | not a requirement; `docs/06` specifies structure, states and interactions | `docs/06` |

---

## 9. Traceability

| This document answers | By |
|---|---|
| spec §16 item 17 (five-state requirement tracking) | §2 (the model), §3 (per-area matrices), §4 (phase view) |
| spec §15 (acceptance criteria) and the G1–G5 gates | §7 (release-gate checklist), citing `docs/01` §8 |
| spec §17 (nine phases) | §4, citing `docs/13` §3 |
| spec §16 (all eighteen deliverables covered) | §6 |
| the coverage rule "every `R-` has ≥ 1 `T-` or is explicitly manual" | §5, generated by `tools/gen-checklist.py` |
| every `R-<AREA>-<nnn>` in `docs/01` | §3, projected from `spec/requirements.json` |

**Machine view.** `tools/gen-checklist.py` is the mechanism; this file is its output. A reviewer who distrusts a row need not read the generator: the row is a projection of one line of `spec/requirements.json` and one line of `spec/checklist-status.json`, both of which are diffable.
