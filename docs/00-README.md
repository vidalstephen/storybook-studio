# Storybook Studio — Specification Set

**Product:** Storybook Studio — AI-assisted short-form storytelling, page composition, interactive HTML books and print-ready booklet publishing
**Release in scope:** Version 1, text-only
**Status:** architecture and specification complete for review — **no implementation code exists yet, by design**
**Source of intent:** `docs/source/STORYBOOK-STUDIO-SPEC.md` (the product specification as supplied, unmodified)

---

## 1. How to review this

The product specification states *what the product must do*. This document set states *how it will be built and how each requirement will be proven*. It is written to be reviewable in this order:

| If you want to… | Read |
|---|---|
| Know what decisions were made on your behalf, and what I need from you | **`17-decisions-and-open-questions.md`** — read this first. It is the one document that asks for your input |
| Understand the shape of the system | `03-technical-architecture.md` |
| Check the data contract | `04-project-data-schema.md` |
| Check the product's heart — how story becomes pages | `05-content-and-composition-model.md` |
| Check the guarantees (locks, validity, reproducibility) | `07-lock-and-constraint-rules.md`, `11-validation-strategy.md`, `12-approval-and-versioning-workflow.md` |
| Check the plan and the gates | `13-incremental-roadmap.md` |
| Check how "done" is proven | `14-test-plan.md`, `16-reference-story-acceptance-tests.md` |
| Check whether the set contradicts itself | **`REVIEW-RECONCILIATION.md`** — the mechanical audit of the whole set, with every contradiction and its resolution |
| Track every requirement | `15-development-checklist.md` |

**Review posture:** treat `17-…` and every `D-xx` as a claim you can overrule. An implementer who follows this set without your ratification is following *my* decisions, not yours.

---

## 2. Documents

| # | Document | Covers spec | Deliverable(s) in §16 |
|---|---|---|---|
| 00 | `00-README.md` | — | index |
| 01 | `01-product-requirements.md` | §1–§3, §11, §13, §15 | **1** Product requirements specification |
| 02 | `02-workflow-specification.md` | §3, §6.2, §11, §12.5 | **2** End-to-end workflow specification |
| 03 | `03-technical-architecture.md` | §12 | **3** Technical architecture |
| 04 | `04-project-data-schema.md` | §12.2, §12.3, §6.9, §6.11 | **4** Project data schema |
| 05 | `05-content-and-composition-model.md` | §4, §5, §6.1–6.7, §6.10 | **5** Story blueprint and content model · **6** Story beat and composition model |
| 06 | `06-composition-editor-ux.md` | §6.3, §6.4, §11.2 | **7** Page Composition Editor interface design |
| 07 | `07-lock-and-constraint-rules.md` | §6.9, §6.10, §10.2 | **8** Composition constraint and lock rules |
| 08 | `08-pagination-strategy.md` | §6.10, §7.4, §9.3 | **9** Responsive digital pagination strategy · **10** Fixed print pagination strategy |
| 09 | `09-design-token-architecture.md` | §8 | **11** Shared typography and design-token architecture |
| 10 | `10-booklet-imposition-spec.md` | §9.4, §9.5 | **12** Booklet imposition specification |
| 11 | `11-validation-strategy.md` | §10, §15 | **13** Content and rendering validation strategy |
| 12 | `12-approval-and-versioning-workflow.md` | §6.11, §12.2, §15.5 | **14** Publication approval and versioning workflow |
| 13 | `13-incremental-roadmap.md` | §17 | **15** Incremental development roadmap |
| 14 | `14-test-plan.md` | §15, §16.16 | **16** Automated test plan |
| 15 | `15-development-checklist.md` | §16.17 | **17** Development checklist |
| 16 | `16-reference-story-acceptance-tests.md` | §14, §15 | **18** Initial reference-story acceptance tests |
| 17 | `17-decisions-and-open-questions.md` | gaps in §1–§15 | **decisions register** (added; not a §16 deliverable) |
| — | `REVIEW-RECONCILIATION.md` | — | **reconciliation register** (added): the audit of the parallel authoring pass — every code, cross-reference, unit and box-model contradiction, with its resolution |
| — | `source/STORYBOOK-STUDIO-SPEC.md` | — | the supplied specification, verbatim |

All eighteen §16 deliverables are covered. Two files are additions rather than §16 deliverables: `17-decisions-and-open-questions.md`, because §16 assumed the source specification was complete and it is not (see `17-…` Part C); and `REVIEW-RECONCILIATION.md`, because a set authored in parallel needs its own contradictions audited rather than assumed away.

---

## 3. Identifier schemes (used across every document)

### 3.1 Requirements

`R-<AREA>-<nnn>`, where AREA is one of:

| Area | Domain | Area | Domain |
|---|---|---|---|
| `VSN` | vision and foundational principles (§1) | `DSN` | design system (§8) |
| `PUB` | publication types (§2) | `PRT` | print production and booklets (§9) |
| `WIZ` | creation wizard and configuration (§3) | `QAS` | quality assurance (§10) |
| `IDE` | ideation and story blueprint (§4) | `UXS` | studio workspace and UX (§11) |
| `GEN` | content generation and editorial (§5) | `ARC` | architecture, data, providers (§12) |
| `CMP` | page composition (§6) | `OPS` | operational requirements (§13 V1 ops, §15.5) |
| `DIG` | interactive HTML reader (§7) | | |

Requirements are owned by `01-product-requirements.md` and traced in `15-development-checklist.md`. No other document may invent a requirement ID.

### 3.2 Other identifiers

| Kind | Form | Owner |
|---|---|---|
| Test cases | `T-<AREA>-<nnn>` | `14-test-plan.md` |
| Acceptance demonstrations | `A-01` … `A-18` | `16-reference-story-acceptance-tests.md` (§14's 18 required demonstrations, one each) |
| Validator/finding codes | `FAMILY_THING` uppercase, e.g. `PRINT_PAGE_OVERFLOW` | `11-validation-strategy.md` (registry), used everywhere |
| Decisions | `D-nn` | `17-decisions-and-open-questions.md` |
| Open questions | `Q-nn` | `17-…` |
| Spec ambiguities | Part C table of `17-…` | `17-…` |

### 3.3 Entity identifiers

Exactly as in `04-project-data-schema.md` §2 — `prj_`, `blk_`, `beat_`, `pg_`, `lck_`, `tpl_`, `srcref_`, `prop_`, `find_`, `apr_`, `art_`, `job_` (ULID) and `ms_`, `cmp_`, `dsg_`, `val_` (content hash). Every document uses these names; none may alias them.

---

## 4. Conventions every document follows

1. **Cite the spec.** A statement that implements spec text names the section (`§6.7`). A statement that goes beyond the spec names the `D-xx` that authorises it. Unattributed design choices are treated as defects in this set.
2. **No prose in a revision.** Stated once here, true everywhere: composition and design revisions contain block identifiers and rules, never text (`04-…` §1.2, `D-10`).
3. **Determinism is a testable property.** Any behaviour claimed deterministic must be reproducible by re-running with identical inputs, and is covered by a golden or property test in `14-test-plan.md`.
4. **Units carry suffixes.** `_mm`, `_pt`, `_px_css`, `_em`, `_lines`, `_words`. A bare dimension is a defect (`04-…` §1).
5. **Failures are findings, not exceptions.** Anything the system cannot do is emitted as a `Finding` with a code, a severity and a blocking decision — never as a silent approximation (`11-…`).
6. **The word "should" in the source spec becomes "must" here, or an explicit `D-xx`.** A specification containing unresolved "should"s is the reason projects drift.

---

## 5. What is deliberately *not* in this set

| Excluded | Why |
|---|---|
| Implementation code | Scope of this pass is architecture review (per Stephen's direction). `13-incremental-roadmap.md` sequences the code |
| UI visual design / mockups | `06-composition-editor-ux.md` specifies structure, states and interactions; visual design is a Phase 4/5 activity against the real components, not a mockup exercise |
| Version 2–4 feature designs (§13 of the spec: illustration, narration, collaboration) | Only their *accommodation* is specified — i.e. what V1 must not foreclose (`05-…` §2.1, `03-…` §10). Designing V2 now would be wasted work |
| Cost estimates and dates | The roadmap is sequenced with exit criteria, not durations; the reference benchmark is what calibrates them |
| A marketing/positioning plan | Depends on Q-02 (product vs personal tool) |

## 6. Known review targets

Points where a reviewer is most likely to disagree, listed so they can be attacked directly:

1. **D-01, single Chromium layout authority.** Commits the project to a pinned browser for all typesetting, including print. Strong guarantee, unusual dependency.
2. **D-05, frozen print pagination with refusal-to-render.** Deliberately refuses to produce output in a case where the spec's §9.3 language ("propose permissible reflow") might be read as permitting an automatic fix.
3. **D-13, composition against a real design revision.** Changes the stage order relative to §11.2's navigation order.
4. **D-16, the page target governs and the word budget is derived from it.** `target_print_pages` is the governing length target (§3.2, §14.1, §18); `target_words` is computed at blueprint time as `story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words` — the reserve (heading lines plus forced-break slack × `words_per_line_measured`, `31.6 _words_` on the reference fixture) is part of the formula, so the fixture derives `9 × 16 × 7.9 − 31.6 = 1106 _words_` and not `1138` — from the governing page target and the words-per-line measured **in the face the book ships** on the concrete design revision (`05` §1.6; stated as requirements in `01` `R-WIZ-004`, `R-WIZ-015` and `R-WIZ-017`), and the derivation is verified by `T-WIZ-015`/`T-WIZ-017` and, on the fixture, `T-WIZ-016`/`T-PRT-106`. The line budget those nine story pages hold is **split**, not all prose: the pages hold `144` lines, the beat's `role: "scripture"` displays and the headings take `27` of them, and the budget is the `117`-line prose remainder (`924 _words_`), never the total (`05` §1.6 item 7; `R-WIZ-017`, `T-WIZ-018`) — which is why the reference book composes to **20** printed pages rather than 16. The earlier reading — "length as words not pages" — is reversed by D-16 as amended (`17` Part A): a print page count that misses the target is reported (`PRINT_PAGE_COUNT_OFF_TARGET`, major, waivable), never absorbed by padding or prose expansion, and the budget is derived against the project's **resolved** density band (`09` §4.3), not the default token.
5. **D-08, the scripture licence gate — not a capability removal.** A translation is refused only while the project holds no `licenses.json` entry recording its licence and permitted scope, so D-08 **preserves** every licensed capability rather than forbidding it. The gate is jurisdiction-aware — the KJV is restricted in the United Kingdom by **Crown letters patent** — so "public domain" is recorded as *where*, not as a bare boolean (`17` D-08; `04` §8).
6. **`07-…` §3, scope-dependent violation policy.** The most intricate rule in the set; the justification is §6.10, but it is the place where an implementation could most easily be "simplified" into a silent override.
