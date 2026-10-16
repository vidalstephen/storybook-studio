# Content and Rendering Validation Strategy

**Implements:** spec §10 (Quality Assurance — §10.1 content, §10.2 composition, §10.3 digital rendering, §10.4 print rendering, §10.5 automated correction), §15 (V1 Acceptance Criteria — §15.1–§15.5), §6.11 (composition approval), §12.5 (efficient processing), §9.3 (print pagination), §9.4 (booklet imposition)
**Deliverable covered:** D13 (per §16 — "Content and rendering validation strategy")
**Inherits:** `docs/00-README.md` (§3.2 — this document owns the finding-code registry), `docs/03-technical-architecture.md` (Engine F `src/validation`, §2 determinism boundary, §8 jobs), `docs/04-project-data-schema.md` (§7.2 `ValidationReport` + `Finding`, §10 example codes, §1.1 revision identity), `docs/05-content-and-composition-model.md` (Part 3 invariants, §1.4 scripture, §2.7 targeted invalidation, §1.5 review-as-data), `docs/07-lock-and-constraint-rules.md` (§5.3 findings, §3 scope-dependent policy), `docs/17-decisions-and-open-questions.md` (D-04, D-05, D-08, D-09, D-11, D-12, D-13, D-14, D-16, D-17, Part C)

---

## 0. How to read this document

| Section | Answers |
|---|---|
| §1 | The validation model: families, severities, the blocking rule, how `blocking` is derived, and waivers |
| §2 | **The finding registry** — every code in the document set, this document owns it |
| §3 | How each family is verified: deterministic measurement vs AI-mediated judgement |
| §4 | The §10.5 correction ladder, rung by rung |
| §5 | Full vs targeted validation, and validation caching keyed by the revision triple |
| §6 | The publication gate as an explicit predicate |
| §7 | Evidence and reproducibility — what a report must record, and when it goes stale |
| §8 | The five ways validation could pass while the artifact is still wrong |

**Registry ownership.** `docs/00-README.md` §3.2 makes finding codes the property of this file. No other document may introduce a code; a code emitted by a validator that is absent from §2 is itself a finding (`OPS_REGISTRY_CODE_UNKNOWN`, §2.5). Codes already used in `02`, `03`, `04`, `05`, `07`, `13`, `14`, `17` are registered here **verbatim**, including prefixes that predate the six-prefix convention.

---

## 1. The validation model

### 1.1 Five families, six prefixes

`Finding.family` is a closed set of **five** values (`04-…` §7.2): `content | composition | digital | print | ops`. There are **six** code prefixes because the design revision has validators but no family of its own; the prefix carries module ownership, the family carries the gate. The mapping is total and single-valued:

| Prefix | `family` | Owning module (`03-…` §3) | Covers |
|---|---|---|---|
| `CONTENT_` | `content` | `src/validation/content` | §10.1 |
| `MS_` | `content` | `src/validation/content` | manuscript integrity (`04-…` §4.2) |
| `SCRIPTURE_` | `content` | `src/validation/scripture` | §10.1 scripture fidelity, §4.3 |
| `COMP_` | `composition` | `src/validation/composition` | §10.2 |
| `BEAT_` | `composition` | `src/validation/composition` | beat spans (`04-…` §4.4) |
| `BREAK_` | `composition` | `src/validation/composition` | §6.10 breaks |
| `LOCK_` | `composition` | `src/validation/composition` | §6.9 |
| `DESIGN_` | `composition` | `src/validation/design` | §8 — see note below |
| `DIG_` | `digital` | `src/validation/digital` | §10.3 |
| `PRINT_` | `print` | `src/validation/print` | §10.4 |
| `PROJECT_` | `ops` | `src/validation/ops` | project integrity (`04-…` §3, §9) |
| `OPS_` | `ops` | `src/validation/ops` | §15.5, jobs, licences, manifest |
| `EXPORT_` | `ops` | `src/validation/ops` | export gating (`04-…` §7.3) |
| `PROPOSAL_` | `ops` | `src/validation/ops` | D-11 refusal records (`04-…` §7.1) |

**Note on `DESIGN_` → `composition`.** `04-…` §7.2 fixes `family` at five values and gives no `design` value. The design revision is a *pagination input* (D-04) and a design defect manifests as a composition defect (D-13), so `DESIGN_` findings report `family: "composition"`. The prefix is retained so the owning module and the correction path are unambiguous. Adding a sixth family would contradict `04-…` §7.2; this document does not.

### 1.2 Severities

| Severity | Meaning | Set by |
|---|---|---|
| `critical` | The artifact is wrong or cannot be produced. §10.5: "A publication cannot receive a final approved status while unresolved critical rendering problems remain." | deterministic validators only |
| `major` | A requirement in §15 is unmet or a lock/intent is violated in a reported (not refused) way. Can be waived with a recorded reason (§1.4). | deterministic or AI |
| `minor` | Quality degradation. Recorded, never gating. | deterministic or AI |
| `info` | Informational drift or a dropped preference. Recorded, never gating. | deterministic or AI |

**An AI-mediated check may never emit `critical`** (§1.5). Severity is a property of the *code*, not of the run; a code whose severity is scope-dependent declares both in §2 and resolves them in `deriveBlocking` from project state (e.g. `DESIGN_FONT_UNLICENSED` is `critical` when the design is print-bound, `major` otherwise; `BREAK_UNSATISFIED` is `major` in digital scope and blocking-for-approval in print scope).

### 1.3 The blocking rule

`blocking` is **not** a property of a finding as authored; it is a pure function of `(code, severity, origin, project state)` executed once per finding at report assembly (`04-…` §7.2: "no code path may set `blocking` itself — it is derived from `(code, severity, project state)` by one function, so it can be tested exhaustively").

```ts
type Severity   = 'critical' | 'major' | 'minor' | 'info';
type Origin     = 'deterministic' | 'ai' | 'human';
type PlanScope  = 'digital' | 'print' | 'both';
type Surface    = 'plan' | 'render' | 'export' | 'booklet';

type ProjectGateState = Readonly<{
  scope: PlanScope;
  frozen: boolean;                 // D-05 — is the print plan frozen?
  surface: Surface;                // what the finding would affect
  scripture_enabled: boolean;
  publication_type: PublicationType;
  waived: boolean;                 // §1.4 W4 — is a recorded waiver in force for this finding, for this approval?
}>;

type BlockingDecision = Readonly<{
  blocking: boolean;               // the single boolean written to Finding.blocking
  effective_blocking: boolean;     // blocking ∧ ¬waived — the ONLY boolean a gate reads (rule B7)
  approval: boolean;               // blocks a move to `approved`
  export:   boolean;               // blocks any artifact write
  render:   boolean;               // blocks the render of the named page(s) / the artifact
  waiverable: boolean;
  reason: string;                  // human-readable derivation, e.g. "critical; §15.5"
}>;

/** The ONE derivation. Pure, synchronous, total, no network, no AI. Two callers, one answer:
 *   - the report assembler, to write `Finding.blocking` (B6);
 *   - the gate, per finding, with `state.waived := waived_by(a, f)` for the approval under test (B7).
 *  It never writes anything: B7's `effective_blocking` is a *view*, not a persisted field. */
function deriveBlocking(code: FindingCode, severity: Severity, origin: Origin,
                        state: ProjectGateState): BlockingDecision;
```

The function is total and has exactly these rules, in order:

| # | Rule | Result |
|---|---|---|
| B1 | `origin === 'ai'` | `{approval:false, export:false, render:false, blocking:false, waiverable:false}` — AI findings are **advisory, never gating alone** (§1.5, §3.3) |
| B2 | `severity === 'critical'` | `{approval:true, export:true, render:true}` — always; §15.5 "Critical validation errors block final approval" | 
| B3 | `severity === 'major'` **and** the §2 row flags *A* | `{approval:true, export: row.E, render:false, waiverable:true}` — an `A`-only `major` reaches export through approval (§6); a `major · A·E` (`SCRIPTURE_DISCLAIMER_MISSING`) also blocks export directly |
| B4 | `severity === 'major'` and the §2 row does **not** flag *A* | `{approval:false, export: row.E, render:false, waiverable: row.E}` — a `major · E` (`SCRIPTURE_INTERPRETATION_FLAGGED`) blocks export alone; a `major` with neither flag gets `{approval:false, export:false, render:false, blocking:false, waiverable:false}` and is reported so the author can see it |
| B5 | `severity ∈ {'minor','info'}` | all false |
| B6 | `blocking := approval \| export \| render` | the single boolean `Finding.blocking` and the input to `ValidationReport.summary.blocking` |
| B7 | `effective_blocking := blocking ∧ ¬waived` | the **gate** boolean. `waived` is not a property of the finding; it is `waived_by(a, f)` — the existence of a recorded waiver for `f` on the approval the gate is testing (§1.4 W3–W5, `12` §1.1). A waiver never rewrites `blocking` (W3), so this is the only boolean a gate may read: `11` §6's predicate and `12`'s `EXPORTABLE` both test it |

**All four flag combinations are defined.** The two flags are the §2 row's `blk` column; a `critical` overrides both (B2), an AI-origin finding is inert whatever the flags say (B1):

| `severity` / row flags | blocks approval | blocks export | blocks render | waivable |
|---|---|---|---|---|
| `critical` | **yes** | **yes** | **yes** | no — never (W1) |
| `major · A·E` | **yes** | **yes** | no | yes |
| `major · A` | **yes** | no — only through approval (§6) | no | yes |
| `major · E` | no | **yes** | no | yes |
| `major · none` | no | no | no | no — there is no block to lift |
| `minor` / `info` / AI origin | no | no | no | no |

**The rule, stated identically in `12` §1.1.** A finding blocks **approval** iff it is flagged `A` and not waived under the approval being tested, or it is `critical` (**never** waivable). A finding blocks **export** iff it is flagged `E` and not waived under that approval, or it is `critical`. A flagged-but-waived finding blocks nothing. An unflagged finding blocks nothing. `waived_by(a, f)` is a relation to an approval (§1.4 W4), so the predicate takes the `Approval` as an argument and reads that approval's `waivers[]`; there is no `Finding.waived` property and no `Finding.blocking.approval`.

Consequences, stated as policy:

| Question | Answer |
|---|---|
| Which severities block **approval**? | All `critical`; and those `major` codes whose §2 row is marked *A* — `BREAK_UNSATISFIED` in print scope, `LOCK_UNSATISFIED` for the S2 print case, `COMP_BLANK_UNINTENDED`, `COMP_IMPOSITION_PADDED_MIDSTORY`, `PRINT_GUTTER_INSUFFICIENT`, `PRINT_PAGE_COUNT_OFF_TARGET`, `SCRIPTURE_DISCLAIMER_MISSING` (*A·E*), `SCRIPTURE_CHRONOLOGY_REORDERED`, and `OPS_APPROVAL_UNWAIVED_MAJOR` — the approval act's own refusal code, which is **never waivable** (§1.4 W6, N8). Every *A* `major` blocks **until it is waived**, and a waiver lifts it without changing `blocking` (B7, §1.4). |
| Which severities block **export**? | All `critical`; plus the `major` codes §2 flags *E* directly — **exactly two**: `SCRIPTURE_INTERPRETATION_FLAGGED` (`major · E`, `05` §1.4) and `SCRIPTURE_DISCLAIMER_MISSING` (`major · A·E`). Neither is inert: rule B4 gives the first `export:true` with `approval:false`, so it refuses the export of an otherwise fully approved artifact, and rule B3 gives the second both gates. A `major` flagged *A* but not *E* does **not** block export directly; it blocks export only while approval is withheld, because export requires an approval (§6, `12` §1.1). A recorded waiver lifts an *E* block exactly as it lifts an *A* block (B6, §1.4). |
| Which severities block **render**? | Only `critical`, and only for the pages they name (or the whole artifact when they name none — e.g. `OPS_MEASUREMENT_PRE_FONT_SETTLE`, `COMP_LOCK_CONFLICT_HARD`). A `major` never refuses a render; the frozen-print escalation that does refuse is `critical` (`COMP_FROZEN_LOCK_CONFLICT`, `PRINT_FROZEN_OVERFLOW`, D-05). |
| Which block **nothing**? | `minor`, `info`, every AI-origin finding, and `major` codes not marked *A*/*E*. |

**Invariant (testable, T-QAS-007).** `Finding.blocking` and its three sub-flags are populated **only** by `deriveBlocking`, and `effective_blocking` is populated by nothing else. The `Finding` constructor takes no `blocking` argument; neither boolean is settable outside `src/validation/policy.ts`; a static guard asserts there is no other write path. `effective_blocking` adds no persisted report field (`04-…` §7.2 is unchanged): it is the derived gate view over the finding plus the waiver set in force (B7, W4), computed at gate evaluation and never stored on the finding. `blocking` is `severity`-independent in the sense `04-…` §7.2 requires: a `major` can be non-blocking (rule B4's unflagged case; a `major · E` is blocking for export while not blocking for approval) and a `critical` is always blocking (rule B2).

### 1.4 Waivers

**The blocking rule, in four cases. This section and `12-…` §1.1 state it identically; a reader must not be able to find two rules.** The `Waiver` type defined below is the **single definition** of that shape in the document set: `04` §7.3 and `12` §11.3 reference it and must not re-spell it.

| # | Case | Consequence |
|---|---|---|
| 1 | a `major` **marked *A*** in §2, **un-waived** | **blocks approval** (rule B3). It does not block export or render directly — export is reached through approval (§6). When its row also carries *E* (`SCRIPTURE_DISCLAIMER_MISSING`) it blocks export directly as well |
| 2 | the same finding, **waived** — a recorded `wv_` with a non-empty reason, listed in the covering `Approval.waivers[]` | **does not block** anything: `effective_blocking = blocking ∧ ¬waived` is false (rule B7). The waiver does not clear the finding and does not rewrite `blocking` (W3) |
| 3 | a `major` **marked *E* only** in §2, **un-waived** | **blocks export** and nothing else (rule B4): `SCRIPTURE_INTERPRETATION_FLAGGED` refuses the artifact write even under a governing, sound approval, until the finding is waived **or** a human sets `verification.state` to `verified`/`disputed` with a note (`05` §1.4). It does not block the approval act (§6.2) |
| 4 | a `major` **marked neither *A* nor *E*** | **blocks nothing** — approval, export or render — whether or not anyone tried to waive it (rule B4, unflagged case). Such a code is `waivable: false` (W1), so an attempted waiver is refused at creation: there is no block to lift |

A waiver is the mechanism of case 2 and of nothing else. It is a recorded decision, never a mutation of the finding:

```ts
type Waiver = Readonly<{
  id: string;                 // wv_
  finding_id: FindingId;      // find_
  code: FindingCode;
  waived_by: string;          // actor
  reason: string;             // REQUIRED, non-empty — same rule as a Lock (§04 §5.3)
  scope: ApprovalScope;       // the §6.11 scope it applies to
  created_at: string;         // ISO-8601 UTC
}>;
```

| Rule | Statement |
|---|---|
| W1 | Only findings whose `deriveBlocking(...).waiverable === true` may be waived. `critical` is never `waiverable` (§10.5). |
| W2 | A waiver requires a non-empty `reason` and an actor; a waiver with no reason is rejected at creation, exactly as a `Lock` is (`04-…` §5.3). |
| W3 | A waiver does not delete, downgrade or rewrite the finding. The finding remains in the report with its `blocking` flag **unchanged**, and is `waived` only in the derived gate view of the approval that records the waiver (B7); that `Approval` records every `wv_` it relied on. |
| W4 | `waived` is a relation to an approval, not a property of a finding: `waived_by(a, f) := ∃ w ∈ a.waivers : w.finding_id = f.id`, or (W5) `w.code = f.code` with a scope that covers the finding. The gate reads `effective_blocking(f, a) = f.blocking ∧ ¬waived_by(a, f)`, split by gate as `effective_blocking_approval(f, a) = BLOCKING_APPROVAL(f) ∧ ¬waived_by(a, f)` and `effective_blocking_export(f, a) = BLOCKING_EXPORT(f) ∧ ¬waived_by(a, f)` — `11` §6 and `12-…` §1.1 `EXPORTABLE` test these and nothing else. Waiving is therefore visible in the same report a reviewer reads **and** on the record that relied on it, not in a side channel. |
| W5 | A waiver is scoped: a manuscript-scope waiver does not waive the same code in print scope. |
| W6 | The two approval-refusal codes are **not waivable findings**. `OPS_APPROVAL_UNWAIVED_MAJOR` is a *refusal reason* for the act of approving — the `code` of the refusal record, with `refusal.reason = "OPS_APPROVAL_UNWAIVED_MAJOR:find_…"` (`12-…` §1.2, §2.2; N8) — and never a waivable finding: a waiver of the code that fires because findings are un-waived would be circular. `OPS_APPROVAL_BLOCKED_BY_CRITICAL` is `critical` and so non-waivable by W1. |

**Waiverability is data, not a hard-coded list** (`12-…` §11.1 requests this): `waivable = (severity === 'major') && row.blk !== 'none'` — read straight off the §2 `blk` column, which **is** that per-code boolean, so the gate's waiver test is data-driven and no separate column is needed (N7). A `major` is waivable exactly when it carries a block to lift (`A`, `E` or `A·E`). Defaults that need no per-code entry:

- every `critical` is `waivable: false` — rule B2 makes it always blocking, and §10.5's final sentence is absolute; `OPS_APPROVAL_BLOCKED_BY_CRITICAL` exists precisely to refuse an approval that would override this;
- every `minor`/`info` and every AI-origin finding is `waivable: false` — there is nothing to waive;
- every `major` whose §2 row declares `blk = none` is `waivable: false` — a waiver would be inert, because there is no block to lift (case 4 above): `CONTENT_LENGTH_UNDER_TARGET`, `COMP_BEAT_SPLIT`, `COMP_SPACING_OUT_OF_BOUNDS`, `DIG_FONT_FALLBACK_METRIC_DRIFT`, `OPS_FROZEN_LOCK_RELEASED`, `OPS_BUNDLED_THEME_LICENCE_UNPUBLISHABLE`. **This is why "any un-waived `major`" is not a gate condition**: with case 4 in force, an unflagged `major` cannot be waived (W1) and does not need to be — no gate may turn it into a blocker. Only an *`A`-flagged* `major` is an un-waived blocker, and only for approval (`OPS_APPROVAL_UNWAIVED_MAJOR`, W6). An `E`-flagged one is a blocker for export alone;
- the scope-dependent `major` rows — `BREAK_UNSATISFIED`, `LOCK_UNSATISFIED`, `DESIGN_FONT_UNLICENSED` — are `waivable: true` in the scope where §2 marks them *A*, and inert elsewhere (§1.2);
- the approval-refusal codes are `waivable: false` (W6).

The blocking `major` codes that a recorded waiver **can** lift are therefore:
- **for approval** — `PRINT_GUTTER_INSUFFICIENT`, `PRINT_PAGE_COUNT_OFF_TARGET`, `COMP_BLANK_UNINTENDED`, `COMP_IMPOSITION_PADDED_MIDSTORY`, `BREAK_UNSATISFIED` (print scope), `LOCK_UNSATISFIED` (S2 in print scope), `SCRIPTURE_CHRONOLOGY_REORDERED`, `SCRIPTURE_DISCLAIMER_MISSING`;
- **for export** — `SCRIPTURE_INTERPRETATION_FLAGGED`, `SCRIPTURE_DISCLAIMER_MISSING`.

The five codes whose owner `09` states as `critical` — `PRINT_BORDER_TEXT_COLLISION`, `PRINT_BORDER_BELOW_VISIBLE_MINIMUM`, `DESIGN_TOKEN_BLOCK_DIVERGENCE`, `DESIGN_TEMPLATE_BORDER_DRIFT`, `DESIGN_DROP_CAP_NOT_MEASURED` — are registered `critical` per G7 and are therefore **never** waivable (N2).

#### Test obligations this gate owes

The tests this gate owes — a waiver case, the `E` flag, `effective_blocking` — are tabulated in **§10.1**, addressed to `docs/14`. No existing `T-QAS-001…009` row is renumbered.

### 1.5 What a validation run produces

`validate(scope) -> ValidationReport` (`03-…` §3, Engine F). One run writes one immutable, content-addressed revision (`04-…` §1.2) named by its own hash:

```
val_rev = sha256(canonical_json({ scope, ms_rev, cmp_rev, dsg_rev, engine_version }))   // 04 §1.1
```

The report carries `judged`, `summary` and `findings[]` exactly as `04-…` §7.2 specifies. It carries no prose, and it is never edited — a re-validation is a new `val_rev` (§7).

---

## 2. The finding registry

**This is the registry.** Every code used anywhere in this document set is defined here. Columns:

- **blk** — `A` blocks a move to `approved`; `E` blocks an export/artifact write; `R` blocks a render of the named page(s)/artifact; `none` = recorded only. `·` separates. `critical` is always `A·E·R` (rule B2) and is written as such.
- **auto** — whether a §10.5 ladder rung may clear it without a human, and which rung (§4); `none — human` means no rung clears it.
- **cite** — the spec section or decision that authorises the check. An uncited row is a defect.

Prefixes: `§x.y` = `docs/source/STORYBOOK-STUDIO-SPEC.md`; `04 §x` = `docs/04-…`; and so on.

### 2.1 Content family (`content` — §10.1, §15.1)

| code | severity | blk | what it checks | evidence fields | auto | cite |
|---|---|---|---|---|---|---|
| `CONTENT_SECTION_MISSING` | major | A | a blueprint `progression[]` entry, or a required `front_matter`/`back_matter` section, has no prose blocks | `beat_id, section_kind, expected_blocks` | rung 6 | §15.1, §4.2 |
| `CONTENT_COHERENCE_WEAK` | minor (AI) | none | beginning → progression → conclusion coherence; a scene that does not follow from the previous | `block_ids[], beat_ids[], confidence` | rung 6 | §10.1, §15.1 |
| `CONTENT_READING_LEVEL_CEILING_EXCEEDED` | major | A | derived Flesch–Kincaid reading level > `content_rules.reading_level_max` | `fk_score, target_max, block_ids[]` | rung 6 | §10.1, §15.1 |
| `CONTENT_READING_LEVEL_UNDER_TARGET` | info | none | derived reading level below the audience band (too easy for the stated proficiency) | `fk_score, target_min` | rung 6 | §15.1, §3.2 |
| `CONTENT_THEME_STATEMENT_MISSING` | major | A | blueprint `central_theme` absent or empty — the lesson is never stated where the contract requires it | `blueprint_field` | none — human | §4.2, §15.1 |
| `CONTENT_THEME_DRIFT` | minor (AI) | none | prose departs from the declared `central_theme`/`theme` | `block_ids[], stated_theme, inferred_theme, confidence` | rung 6 | §10.1 |
| `CONTENT_LESSON_UNCLEAR` | minor (AI) | none | the central lesson is not derivable from the prose alone | `block_ids[], confidence` | rung 6 | §15.1 |
| `CONTENT_LESSON_REPETITION_EXCESSIVE` | minor (AI) | none | the lesson is restated more often than the profile allows | `block_ids[], repeats, allowed` | rung 6 | §15.1 |
| `CONTENT_DUPLICATION_EXACT` | major | A | two blocks' normalised text is identical (NFC + collapsed whitespace + trim) | `block_ids[], text_hash, char_span` | rung 6 | §10.1, §5.1 |
| `CONTENT_DUPLICATION_SUSPECTED` | minor (AI) | none | a paraphrase pair above the similarity threshold | `block_ids[], similarity` | rung 6 | §10.1 |
| `CONTENT_AUDIENCE_MISMATCH` | minor (AI) | none | vocabulary / sentence length vs `age_range` + `reading_proficiency` | `block_ids[], age_range, metric` | rung 6 | §15.1, §3.2 |
| `CONTENT_PROHIBITED_TOPIC` | major | A | a profile `content_rules.prohibited_topics` term is present | `block_ids[], term, char_span` | rung 6 | §3.2, §10.1 |
| `CONTENT_REQUIRED_LESSON_STATEMENT_MISSING` | major | A | the profile requires a lesson block (`role: lesson`); none exists | `expected_role` | rung 6 | §3.2 |
| `CONTENT_LENGTH_UNDER_TARGET` | major | none | `words < target_words × (1 − word_tolerance)` — the **lower-only** tolerance band (on the fixture `0.85 × 1106 = 940 _words_`); reported, not blocking, because the page target **governs** and the word budget is **derived** from it (D-16 **as amended**, `05` §1.6 — an earlier revision of this cell said "D-16 makes page count the output, not the goal", which is the reverse of the amendment) | `words, target_words, word_tolerance` | rung 6 | D-16, §1.3 |
| `CONTENT_LENGTH_OVER_TARGET` | minor | none | `words > target_words` — **any** excess over the derived budget: the tolerance is **one-sided, lower only**, and the budget is already derived at the resolved density ceiling minus the reserve, so nothing above `target_words` is permissible (`05` §1.6 items 1 and 4). An earlier revision tested `words > target_words × (1 + word_tolerance)`, an **upper** band that no longer exists | `words, target_words, word_tolerance` | rung 6 | D-16 (as amended) |
| `CONTENT_FILLER_DETECTED` | minor (AI) | none | padding or artificial expansion to fill pages | `block_ids[], confidence` | rung 6 | §5.1, D-16 |
| `CONTENT_CITATION_MISSING` | major | A | a `fact`/`quotation` source block has no `SourceReference` | `block_ids[], kind` | none — human | §4.3 |
| `CONTENT_SOURCE_UNVERIFIED` | major | A | `SourceReference.verification.state ∈ {unverified, disputed}` | `srcref_id, state` | none — human | §4.3, §15.1 |
| `CONTENT_FACT_UNSUPPORTED` | minor (AI) | none | a claim is not entailed by its `srcref_` | `block_ids[], srcref_id, confidence` | rung 6 | §10.1 |
| `CONTENT_FINDING_UNANCHORED` | critical | A·E·R | an AI content finding with no/unknown `refs.block_ids[]`, or a `quote_hash` that matches no referenced block — **discarded, never surfaced as a real finding** | `rejected_finding, reason` | none — human | §5.2, D-12 |
| `MS_TEXT_HASH_DRIFT` | major | A | `Block.text_hash` ≠ `sha256(normalise(text))` | `block_id, expected_hash, actual_hash` | none — human | §12.2, 04 §4.2 |
| `MS_STATS_DRIFT` | info | none | cached `stats` (words, `reading_minutes`, `reading_level`) ≠ recomputed | `field, stored, derived` | yes (rewrite derived) | §12.5 |
| `MS_BEAT_ORDER_NOT_PERMUTATION` | critical | A·E·R | `ms_rev.beat_order` is not a permutation of the beat list | `missing[], duplicated[]` | yes (re-derive) | 04 §4.2 |
| `SCRIPTURE_UNSOURCED` | critical (when `scripture_enabled`) | A·E·R | a `scripture` block has no `SourceReference` resolving in `scripture/registry.json` | `block_ids[], kind` | none — human | §4.3, 04 §10 |
| `SCRIPTURE_REF_UNRESOLVED` | critical | A·E·R | `SourceReference.resolution` does not resolve to a verse range in the registry | `srcref_id, citation` | yes (re-resolve) | §4.3, 04 §8 |
| `SCRIPTURE_TRANSLATION_UNKNOWN` | critical | A·E·R | `translation` is absent from `scripture/registry.json` | `translation` | none — human | D-08 |
| `SCRIPTURE_TEXT_MISMATCH` | critical | A·E·R | a `scripture` block's text ≠ the registry verse text (normalised) — also catches paraphrase typed as scripture | `block_id, ref, edit_distance` | none — human | §4.3 |
| `SCRIPTURE_CHRONOLOGY_REORDERED` | major | A (waivable) | beat order ≠ `SourceReference` verse order for a `biblical` profile | `beat_ids[], expected_order` | none — human | §4.3, 05 §1.4 |
| `SCRIPTURE_INTERPRETATION_FLAGGED` | major | E | `verification.state = flagged` with no human `verified`/`disputed` | `srcref_id, notes` | none — human | §4.3, 05 §1.4 |
| `SCRIPTURE_DIALOGUE_UNMARKED` | critical | A·E·R | invented dialogue in a `scripture` block without `as_paraphrase: true` | `block_id, proposal_id` | none — human | §4.3, D-08 |
| `SCRIPTURE_DISCLAIMER_MISSING` | major | A·E | `disclaimer_required` is true but no disclaimer block exists | `srcref_id` | none — human | §4.3 |

### 2.2 Composition family (`composition` — §10.2, §6.9, §6.10)

| code | severity | blk | what it checks | evidence fields | auto | cite |
|---|---|---|---|---|---|---|
| `COMP_REVISION_CONTAINS_PROSE` | critical | A·E·R | any prose field anywhere in a `cmp_rev` | `path, found_field` | yes (strip) | §12.3, D-10 |
| `COMP_BLOCK_LOST` | critical | A·E·R | Σ span blocks < blocks in `ms_rev` | `missing_block_ids[]` | yes (re-solve) | 04 §10 |
| `COMP_BLOCK_DUPLICATED` | critical | A·E·R | a block appears in > 1 span/page within a plan | `block_id, page_ids[]` | yes (re-solve) | 04 §10 |
| `COMP_BLOCK_UNRESOLVED` | critical | A·E·R | a span names a block absent from `ms_rev` (a superseded block) | `block_id, page_id` | none — human (re-apply composition) | 05 §1.3 |
| `COMP_PLAN_CONTENT_DIVERGENCE` | critical | A·E·R | the union of digital-plan blocks ≠ the union of print-plan blocks ≠ `ms_rev` blocks | `digital_only[], print_only[]` | yes (re-solve) | §15.1, 04 §5.1 |
| `COMP_ORDER_CONTRADICTS_BEAT_ORDER` | major | A | a later beat is on an earlier page with no `ordering_override` + reason | `page_a, page_b, beat_ids[]` | yes (rung 2) | §6.10, 04 §10 |
| `COMP_BEAT_ORDER_NOT_PERMUTATION` | critical | A·E·R | `logical.beat_order` omits or duplicates a beat | `missing[], duplicated[]` | yes (re-derive) | 04 §5.1 |
| `COMP_TEMPLATE_INVALID` | major | A | page `kind` ∉ the template's `kind_compatibility`; or a template lacks `border_slot: "perimeter"` without an explicit cover exception | `page_id, template_id, kind` | yes (rung 2) | §6.8, §9.2, 04 §6.2 |
| `COMP_BEAT_SPLIT` | major | none | a `beat_lock` group is split across non-adjacent pages in an **unfrozen** plan | `beat_id, page_ids[]` | yes (rung 3) | §6.9, 07 §3 |
| `COMP_SPAN_INVALID` | critical | A·E·R | `from_line > to_line`, `to_line` beyond measured lines, or two spans' line ranges overlap | `page_id, block_ids[], ranges[]` | yes (rung 2) | 04 §5.1 |
| `COMP_BLANK_UNINTENDED` | major | A | a blank page with no `blank_intentional.reason` | `page_id` | yes (record reason or re-solve) | §9.4, 05 Pt3 #8 |
| `COMP_IMPOSITION_PADDED_MIDSTORY` | major | A | padding to reach a multiple of four inserted between story pages | `page_ids[]` | yes (move padding to front/back) | D-16, 05 Pt3 #7 |
| `COMP_SUGGESTION_REOFFERED` | minor | none | a page-turn suggestion in state `rejected` is emitted again | `suggestion_id` | yes (suppress) | §6.6 |
| `COMP_SPACING_OUT_OF_BOUNDS` | major | none | an automatic spacing adjustment exceeded `spacing_tolerance` | `page_id, delta_pt, limit_pt` | none — human (reported so the author sees how it was achieved) | §6.7 |
| `COMP_DENSITY_OUT_OF_BAND` | minor | none | `fill_ratio` < `sparse_below` or > `dense_above` on a page that is not intentionally sparse (`opening`/`reflective`/`reveal`) | `page_id, fill_ratio, band` | yes (rung 2/4) | §6.7, 08 §6.2 |
| `COMP_LOCK_CONFLICT_HARD` | critical | A·E·R | no `START→END` path exists under H1/H2 locks; no plan is emitted | `lock_ids[] (minimal conflicting set)` | none — human | §6.9, 07 §5.1 |
| `COMP_FROZEN_LOCK_CONFLICT` | critical | A·E·R | a **frozen** page violates an S1–S3 lock beyond tolerance; the render is refused (D-05) | `page_id, lock_id, magnitude_lines` | none — human | D-05, 07 §5.1 |
| `COMP_LOCK_INVALID` | critical | A·E·R | a `Lock` with no `reason`, or a scope shape that does not match its type | `lock_id, type, field` | none — human | 04 §5.3 |
| `COMP_FROZEN_PAGE_REFLOWED` | critical | A·E·R | a frozen page's assignment changed without `Re-open pagination` | `page_id, approved_spans, current_spans` | none — human | D-05, §15.2 |
| `COMP_LAYER_PURITY_VIOLATION` | critical | A·E·R | the logical layer holds a viewport- or paper-derived value | `path, value` | yes (strip to digital/print layer) | §6.10 |
| `COMP_ORPHAN_WIDOW_VIOLATION` | minor | none | a page ends with < `orphans` lines, or begins with < `widows` lines, of a block | `page_id, block_id, lines, limit` | yes (rung 2) | 04 §6.1 |
| `COMP_DENSITY_WITHOUT_MEASUREMENT` | major | A | a density class was derived from word/char count instead of measurement | `page_id, inputs[]` | yes (re-measure) | §6.7 |
| `COMP_SOLVER_NONDETERMINISTIC` | critical | A·E·R | identical inputs produce a different plan hash — the planner is a pure function of the revision triple, the viewport and the engine, with the documented tie-break (`07` §4.5) making the hash reproducible; the DP is the only planner, so there is no second code path to compare against | `hash_a, hash_b, ms_rev, cmp_rev, dsg_rev, viewport_px_css` | none — human | D-04, 07 §4.5 |
| `COMP_PROFILE_INVALID` | major | A | profile solver weights non-integer or missing; `sparse_below ≥ dense_above`; or the reference viewport set is incomplete | `field, value` | none — human | 07 §4.3, §7.4 |
| `COMP_REVISION_POINTER_MISMATCH` | major | A | `cmp_rev.ms_rev` / `cmp_rev.dsg_rev` ≠ the current pointers | `field, stored, pointer` | yes (re-solve) | D-13, 04 §5.1 |
| `LOCK_UNSATISFIED` | major | A (S2 in print scope) / none | a soft lock violated in an **unfrozen** plan | `lock_id, type, page_id, magnitude_lines` | yes (rung 3) | §6.9, 07 §5.3 |
| `BREAK_UNSATISFIED` | major | A (print scope) / none (digital) | an `essential` break not honoured | `before_block, scope, page_id` | yes (rung 2/3) | §6.10, 07 §5.3 |
| `BREAK_DROPPED_PREFERENCE` | info | none | a preference (`essential: false`) break was dropped | `before_block` | none | 07 §5.3 |
| `DESIGN_LOCK_VIOLATED` | critical | A·E·R | an automatic operation changed a `design_lock` token | `token_path, op, old_value, new_value` | none — refused | 07 §2, §5.3 |
| `DESIGN_FONT_UNLICENSED` | critical (print) / major (digital) | A·E·R | a referenced `family` has no licence entry in `fonts/registry.json` | `family, role` | none — human | D-09, §8.3, 04 §8 |
| `DESIGN_PHYSICAL_VALUE_IN_DIGITAL` | critical | A·E·R | a `_mm` field reaches the reader stylesheet, the measurement container, or the compiled JS token object as a value | `token_path, value_mm, consumer` | yes (recompile) | §8.1, 09 §1.6 |
| `DESIGN_TOKEN_UNIT_UNSUFFIXED` | critical | A·E·R | a token's `unit` does not match its path suffix | `token_path, unit` | yes | §8.1, 09 §2.4 |
| `DESIGN_UNIT_PAIR_MISMATCH` | critical | A·E·R | a token's `_pt` and `_px_css` values were set from different roundings and disagree | `token_path, value_pt, value_px_css, expected_px_css` | yes (recompute) | §8.1, 09 §1.3 |
| `DESIGN_UNIT_CONVERSION_IN_CONSUMER` | critical | A·E·R | a unit conversion occurs in the reader, the print sheet, the measurement container, or the solver (conversion happens once, in the compiler) | `token_path, consumer` | yes | §8.1, 09 §3.3 |
| `DESIGN_TOKEN_COMPUTED_IN_CONSUMER` | major | A | a `calc()` in a consumer changes an `identity` token's value instead of composing it | `token_path, consumer` | yes | §8.1, 09 §3.3 |
| `DESIGN_TOKEN_MISSING_AT_CONSUMER` | critical | A·E·R | a consumer falls back to a hard-coded value for a missing token path | `token_path, consumer` | yes | §8.1, 09 §3.3 |
| `DESIGN_TOKEN_CONSUMER_UNDECLARED` | major | A | a token is emitted to a consumer outside its declared `consumers` set | `token_path, consumer` | yes | §8.1, 09 §2.4 |
| `DESIGN_CSS_PROPERTY_UNIT_MISMATCH` | major | A | a property present in both the reader and the paged-media stylesheet is not unit-consistent with its path | `token_path, property, unit` | yes | §8.1, 09 §3.5 |
| `DESIGN_TOKEN_VERSION_UNSUPPORTED` | major | A | a design revision references a token whose `since` version exceeds the engine's | `token_path, since, engine` | none — human | 04 §9, 09 §2.4 |
| `DESIGN_TOKEN_BLOCK_DIVERGENCE` | critical | A·E·R | `DesignRevision.typography`/`layout` (the `04` §6.1 projection) disagrees with the token set | `field, token_path, value` | yes (re-project) | 04 §6.1, 09 §8.1 |
| `DESIGN_DERIVED_TOKEN_AUTHORED` | major | A | a derived token (e.g. `layout.text_box_ratio`) was authored rather than computed | `token_path` | yes (recompute) | 09 §1.5 |
| `DESIGN_IDENTITY_FROM_VIEWPORT` | critical | A·E·R | a token marked `role: identity` has a value that depends on the live viewport rather than the reference box | `token_path, value` | yes | §8.1, 09 §1.7 |
| `DESIGN_PAGE_ASPECT_DRIFT` | major | A | `page.ref_box_px_css` aspect differs from the trim aspect by more than `page.ref_box_tolerance_px_css` | `ref_box_px_css, trim_mm, delta` | yes | 04 §5.1, 09 §1.7 |
| `DESIGN_PARITY_LINEBREAK_DRIFT` | major | A | at the reference box the digital plan breaks a line differently from the print plan for the same block, `dsg_rev` and Chromium build | `block_id, digital_break, print_break` | none — human | 09 §1.7 |
| `DESIGN_DENSITY_BAND_INVERTED` | critical | A·E·R | `sparse_below ≥ dense_above` after profile/theme resolution | `sparse_below, dense_above` | yes | §6.7, 09 §4.3 |
| `DESIGN_DENSITY_BAND_WIDENED` | info | none | a theme declares a density band wider than the profile's; the band is narrowed and the theme reported advisory | `theme_band, profile_band` | yes (narrow) | §6.7, 09 §4.3 |
| `DESIGN_MEASURE_OUT_OF_BAND` | info | none | the measured mean line length leaves `type.measure_cpl_band` | `page_id, cpl, band` | yes | §6.7, 09 §5.1 |
| `DESIGN_BODY_BELOW_MINIMUM` | critical | A·E·R | `type.<role>.size_pt < minimum_readable_pt` for a prose role | `role, size_pt, min_pt` | yes (rung 1) | §8.3, 09 §5.2 |
| `DESIGN_FURNITURE_BELOW_MINIMUM` | major | A | `type.page_number`/`type.caption` `size_pt` below `type.furniture_min_pt` | `role, size_pt, min_pt` | yes | §8.3, 09 §5.2 |
| `DESIGN_PROSE_IN_FURNITURE_ROLE` | major | A | a `role: furniture` token carries prose | `token_path, block_ids[]` | none — human | 04 §4.1, 09 §5.2 |
| `DESIGN_SCALE_STEP_BELOW_MINIMUM` | critical | A·E·R | `size_px_css × s < minimum_readable_pt × 4/3` at a reader scale step `s` | `role, scale_step, size_px_css` | yes | §7.3, 09 §5.2 |
| `DESIGN_ORPHAN_WIDOW_BELOW_FLOOR` | major | A | `typography.orphans` or `widows` below the floor of 2 | `field, value` | yes | 04 §6.1, 09 §5.3 |
| `DESIGN_BLOCK_LANG_MISSING` | info | none | a block whose `lang` differs from the book's carries no per-block `lang` | `block_id` | yes | §3.2, 09 §5.4 |
| `DESIGN_HYPHENATION_DICTIONARY_MISSING` | major | A | `hyphens: auto` is set for a `lang` for which Chromium has no dictionary — line breaks differ from the plan | `lang` | none | D-04, 09 §5.4 |
| `DESIGN_HYPHENATION_IN_DISPLAY` | major | A | `type.display.hyphenate`/`type.heading.hyphenate` is true | `role` | yes | 04 §6.1, 09 §5.4 |
| `DESIGN_JUSTIFICATION_WITHOUT_HYPHENATION` | major | A | justified body text at print with hyphenation disabled | `role, scope` | yes | §15.4, 09 §5.4 |
| `DESIGN_LINE_HEIGHT_IMPLICIT` | critical | A·E·R | `line_height` is `normal` or absent (resolved by the browser from the font file) | `role` | yes | 09 §5.1 |
| `DESIGN_DROP_CAP_NOT_MEASURED` | critical | A·E·R | a drop cap is not excluded from the first line's available width in measurement | `token_path, page_id` | yes (re-measure) | §6.7, 09 §1.5 |
| `DESIGN_MEASURE_BOX_DIVERGENCE` | critical | A·E·R | the measurement container applies padding/margin/border the renderers do not — the failure that makes density a lie | `viewport_px_css, container_box, render_box` | yes (rung 1) | §6.7, 09 §1.6 |
| `DESIGN_CONTRAST_BELOW_MINIMUM` | major | A | `colour.ink.*` on its background falls below `colour.min_contrast_ratio` | `pair, ratio, min_ratio` | yes | §8.3, 09 §4.4 |
| `DESIGN_READER_THEME_METRIC_DRIFT` | critical | A·E·R | a reader colour variant differs from `light` in any non-colour property | `variant, property` | yes | §7.3, 09 §4.4 |
| `DESIGN_READER_OVERRIDE_UNAUTHORISED` | critical | A·E·R | the reader runtime applies a change outside `reader_overrides` | `property, value` | none | §7.3, 09 §5.5 |
| `DESIGN_READER_TYPE_SHRUNK` | critical | A·E·R | the measured glyph size in the reader at the smallest live box ≠ the compiled size (a reader shrank type to fit) | `page_id, compiled_px_css, measured_px_css` | none | §8.3, 09 §5.5 |
| `DESIGN_MOTION_TOKEN_IN_PRINT` | major | A | the paged-media compiler consumes a `motion.*` token | `token_path` | yes | §8.1, 09 §1.6 |
| `DESIGN_PRINT_TOKEN_UNSAFE` | major | A | a print consumer reads a token whose `print_safe` is false | `token_path, consumer` | yes | §9.1, 09 §2.4 |
| `DESIGN_PAPER_UNSUPPORTED` | critical | A·E·R | the selected paper has no `paper_fit` block — the print path never improvises a text box | `paper` | none — human | §9.1, 09 §1.4 |
| `DESIGN_TEMPLATE_BORDER_DRIFT` | critical | A·E·R | a template's frame region differs from the design's perimeter frame | `template_id, field` | yes | §9.2, 09 §7.2 |
| `DESIGN_LOCK_PATH_INVALID` | critical | A·E·R | a `design_lock` target is a prefix substring, not a full path segment (refused at lock creation) | `lock_id, token_path` | none (refused) | §8.1, 09 §2.5 |
| `DESIGN_LOCK_PATH_UNRESOLVED` | major | A | a locked token path is absent from the current token set — never silently ignored | `lock_id, token_path` | none — human | 04 §5.3, 09 §2.5 |
| `DESIGN_FONT_UNREGISTERED` | critical | A·E·R | a family used by a token is absent from `fonts/registry.json` | `family` | none — human | D-09, 09 §6.3 |
| `DESIGN_FONT_FILE_MISSING` | critical | A·E·R | a registered font file is missing, or its `sha256` mismatches | `family, file` | none — human | D-09, 09 §6.1 |
| `DESIGN_FONT_METRICS_DRIFT` | critical | A·E·R | a metric-dependent token is invalidated by a font-file change even though the token set is byte-identical | `family, expected_metrics_hash, actual` | none — human | D-09, 09 §6.1 |
| `DESIGN_FONT_NOT_DISTRIBUTABLE` | critical | A·E | a font's `distributable` is false and it would be inlined into an HTML export | `family` | none — human | D-19, 09 §6.1 |
| `DESIGN_FONT_SUBSET_NOT_PERMITTED` | major | A | subsetting requested where `license.modification_permitted` is false | `family` | none | D-09, 09 §6.4 |
| `DESIGN_FONT_LANG_UNCOVERED` | major | A | a font's `language_coverage` does not cover the book's `lang` — a missing glyph found at design time, not render time | `family, lang` | none | §10.4, 09 §6.5 |
| `DESIGN_FONT_PRIVATE_ON_DISTRIBUTED_EXPORT` | critical | A·E | a private design revision (or a non-distributable font) is exported as a distributable artifact | `dsg_rev, family` | none — human | D-19, 09 §6.6 |
| `BEAT_UNASSIGNED_BLOCK` | major | A | a block belongs to no beat | `block_ids[]` | yes (re-derive) | 04 §4.4, §10 |
| `BEAT_BLOCK_SHARED` | major | A | a block belongs to > 1 beat | `block_id, beat_ids[]` | yes (re-derive) | 04 §4.4, §10 |
| `BEAT_ORPHANED_BLOCKS` | major | A | removing a beat left its blocks unassigned (blocks are never deleted) | `beat_id, block_ids[]` | none — human (reassign) | 05 §1.3, 04 §4.3 |
| `BEAT_DERIVATION_NONDETERMINISTIC` | critical | A·E·R | `deriveBeats()` differs across runs on an identical blueprint | `hash_a, hash_b` | none — human | 05 §1.3 |

### 2.3 Digital family (`digital` — §10.3, §7, §15.3)

| code | severity | blk | what it checks | evidence fields | auto | cite |
|---|---|---|---|---|---|---|
| `DIG_TEXT_CLIPPED` | critical | A·E·R | rendered glyph boxes cross the content box or the page edge — **measured on rendered pixels, never on the plan** | `page_id, block_id, overflow_px_css, direction` | yes (rung 2/3) | §10.3, §6.10 |
| `DIG_PAGE_OVERFLOW` | critical | A·E·R | measured content height > available height | `page_id, needed_px_css, available_px_css` | yes (rung 2) | §6.10, §10.3 |
| `DIG_TEXT_OVERLAP` | critical | A·E·R | two glyph boxes intersect | `page_id, block_ids[], overlap_px_css` | yes (rung 2) | §10.3 |
| `DIG_TEXT_MISSING` | critical | A·E·R | a planned block renders no glyphs | `page_id, block_id` | yes (rung 2) | §10.3 |
| `DIG_TEXT_TRUNCATED` | critical | A·E·R | a renderer clipped or ellipsised text (`overflow: hidden`, inserted `…`) | `page_id, block_id, clipped_chars` | yes (rung 2) | §6.10 |
| `DIG_RENDER_TEXT_DIFFERS_FROM_PLAN` | critical | A·E·R | rendered text ≠ `ms_rev` text for the page's spans | `page_id, block_ids[]` | yes (re-render) | §15.1, §15.3 |
| `DIG_OFFSCREEN_CONTROLS` | major | A | a navigation/control element lies outside the viewport at a reference size | `viewport_px_css, control_id, bbox` | yes (rung 1) | §10.3 |
| `DIG_CONTROL_NONFUNCTIONAL` | critical | A·E·R | a paging control does not change the page | `control_id` | none — human | §10.3 |
| `DIG_KEYBOARD_NAV_MISSING` | major | A | arrow / space navigation absent | `missing_keys[]` | none — human | §15.3, §10.3 |
| `DIG_TOUCH_NAV_MISSING` | major | A | swipe / tap navigation absent | `handler` | none — human | §15.3, §10.3 |
| `DIG_READING_ORDER_WRONG` | critical | A·E·R | DOM order ≠ reading order | `page_id, block_ids[]` | yes (re-render) | §15.3 |
| `DIG_RESPONSIVE_LAYOUT_BROKEN` | major | A | a reference viewport overflows horizontally, does not reflow, selects the wrong single/spread mode, or exceeds `page_count_range` | `viewport_px_css, issue` | yes (rung 2) | §10.3, §7.4, D-06 |
| `DIG_TYPOGRAPHY_UNREADABLE` | major | A | computed `size_px_css`/line-height below legibility bounds, or body contrast ratio < 4.5:1 | `page_id, size_px_css, line_height, ratio` | yes (rung 1) | §10.3, §8.3 |
| `DIG_TRANSITION_INCORRECT` | major | A | the page transition runs the wrong direction/order, or blocks input beyond `max_ms` | `page_id, expected, actual, duration_ms` | none — human | §10.3, §7.2 |
| `DIG_REDUCED_MOTION_IGNORED` | major | A | `prefers-reduced-motion` is not honoured | `affected[]` | none — human | §10.3, §15.3 |
| `DIG_FONT_SCALING_BREAKS` | major | A | a `scale_steps` value causes clipping/overflow, or a `font_scale` override is ignored | `scale_step, page_id` | yes (rung 2) | §7.3, §10.3 |
| `DIG_ORIENTATION_BREAKS` | major | A | rotation introduces clipping, wrong reading order, or the wrong spread mode | `orientation, issue` | yes (rung 2) | §10.3, §15.3 |
| `DIG_PAGE_NUMBER_WRONG` | minor | none | the displayed page number ≠ the plan index | `page_id, shown, expected` | yes (re-render) | §8.1 |
| `DIG_STANDALONE_VIOLATION` | major | A | the HTML book references an external/network resource, or a resource fails to load from `file://`, or a web font is not subset | `resource, kind` | yes (inline/subset) | D-19, §15.3, §7.1 |
| `DIG_FONT_FALLBACK_APPLIED` | major | A | the reader substituted a family for a missing glyph without reporting it | `family, fallback, codepoint` | none | §7.3, 09 §6.5 |
| `DIG_FRAME_CONTROL_COLLISION` | major | A | the perimeter frame overlaps a page control | `viewport_px_css, control_id, overlap_px_css` | yes (rung 1) | §10.3, 09 §7.5 |
| `DIG_FRAME_DROPPED_SMALL_VIEWPORT` | minor | none | at a viewport too small to hold the frame plus a readable measure the reader drops the frame and reports it (disclosed, never silent) | `viewport_px_css` | none | §7.1, 09 §7.5 |
| `DIG_READER_REPLANNED` | critical | A·E·R | a reader page boundary does not correspond to a planned boundary (beyond a permitted local overflow) — the reader never re-plans the book | `page_id, planned_boundary, actual_boundary` | none — human | §7.4, 03 §10, 09 §5.5 |
| `DIG_RULE_WIDENED` | info | none | a rule below 0.5 `_px_css` was widened to 0.5 `_px_css` for digital rendering | `page_id, token_path, from_px_css` | yes | 09 §7.5 |
| `DIG_SCALE_LADDER_TRUNCATED` | info | none | the reader requests a scale step the ladder does not offer | `requested_step, ladder[]` | yes (clamp to ladder) | §7.3, 09 §4.2 |
| `DIG_UNBREAKABLE_WRAP_APPLIED` | minor | none | the reader inserted an `overflow-wrap` break for a word wider than the measure | `page_id, block_id` | none | §6.10, 09 §5.1 |

### 2.4 Print family (`print` — §10.4, §9, §15.4)

| code | severity | blk | what it checks | evidence fields | auto | cite |
|---|---|---|---|---|---|---|
| `PRINT_PAGE_OVERFLOW` | critical | A·E·R | assigned content needs more lines than the page box | `page_id, needed_lines, available_lines, overflow_px_css` | yes (rung 2) | §9.3, §10.4 |
| `PRINT_TEXT_CLIPPED` | critical | A·E·R | rendered glyph boxes cross the trim or safe box — **measured on rendered pixels** | `page_id, block_id, overflow_mm` | yes (rung 2) | §10.4, §9.1 |
| `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | critical | A·E·R | `print.page_count % 4 ≠ 0` for `saddle_stitch` | `page_count, remainder` | yes (pad front/back only) | §9.4, 04 §10 |
| `PRINT_PAGE_COUNT_OFF_TARGET` | major | A | `print.page_count ≠ targets.target_print_pages` **after** the pad-to-a-multiple-of-four step — the user-facing page target of §3.2/§14.1/§18 is missed; evidence records `expected_page_count`, `actual_page_count` and the contributing `story_page_count`. It is never corrected by padding mid-story (`COMP_IMPOSITION_PADDED_MIDSTORY`) or by expanding prose (§5.1, D-16 amended: the page target drives the word budget, so a miss is reported, not absorbed) | `expected_page_count, actual_page_count, story_page_count` | yes (rung 2) | §3.2, §14.1, §18, D-16 |
| `PRINT_FROZEN_OVERFLOW` | critical | A·E·R | a frozen page cannot hold its assigned content — **not reflowed**, project moves to `composition_stale` | `page_id, needed_lines, available_lines, frozen_at` | none — human (`Re-open pagination`) | D-05, §9.3 |
| `PRINT_TRIM_DIMENSION_WRONG` | critical | A·E·R | rendered page / PDF `MediaBox` (or imposed sheet size) ≠ the paper trim | `page_id, expected_mm, actual_mm` | yes (re-render) | §10.4, §9.1 |
| `PRINT_GUTTER_INSUFFICIENT` | major | A | the spine-side clear space between the two **facing text boxes** < `gutter_mm`, where `clear_mm = trim_width_mm − text_box_width_mm + gutter_mm + binding_allowance_mm` (half-letter `139.7 − 96 + 4 + 3 = 50.7 _mm_` ≥ `4`). Under the shift model the insets travel with the text box, so the check reduces to `text_box_width_mm > trim_width_mm + binding_allowance_mm` (`> 142.7 _mm_`) and is **dormant for V1**: no design in this set can fire it, and `G1`'s firing fixture (`T-QAS-001`) must be a purpose-built synthetic design revision declaring a text box wider than the sheet's half (the reference set discharges the gutter through the two facing boxes — `09` §7.4 C5, `10` §6.5, `08` §4.2) | `page_id, gutter_mm, required_mm` | yes (rung 1) | §10.4, §9.1, 08 §4.2 |
| `PRINT_BINDING_ALLOWANCE_VIOLATED` | critical | A·E·R | content falls inside the binding allowance on the spine side | `page_id, block_id, mm` | yes (rung 1) | §15.4, §9.1 |
| `PRINT_SAFE_MARGIN_VIOLATED` | critical | A·E·R | `min(margin_outer_mm, spine_side_inset_mm) < safe_area_mm` — content inside the print-safe margin (§9.2 physical closure, not waivable silently) | `page_id, safe_area_mm, margin_mm` | yes (rung 1) | §9.2, §10.4, 08 §4.2 |
| `PRINT_BORDER_OUTSIDE_SAFE_AREA` | critical | A·E·R | the frame's outer edge falls below `safe_area_mm` (constraint C1: `border.offset_mm ≥ safe_area_mm`) | `page_id, offset_mm, frame_edge_mm, safe_area_mm` | yes (rung 1) | §9.2, 09 §7.4, 10 §6.6 |
| `PRINT_BORDER_TRIM_DRIFT` | critical | A·E·R | after cropping to trim the frame is clipped or drifts — the border check runs on the **post-trim raster**, not on the token set | `page_id, cut_mm, frame_edge_mm` | yes (rung 1) | §9.2, 08 §4.3, 10 §6.6 |
| `PRINT_BORDER_GEOMETRY_MISMATCH` | critical | A·E·R | the frame is not identical on every page of a `dsg_rev` | `page_ids[], field, values[]` | yes (rung 1) | §9.2, 09 §7.1 |
| `PRINT_BORDER_BELOW_VISIBLE_MINIMUM` | critical | A·E·R | the frame is below `min_visible_mm` — it may not survive printing, cutting or folding | `page_id, thickness_pt, min_visible_mm` | yes (rung 1) | §9.2, 09 §7.1 |
| `PRINT_ORNAMENT_CLIPS_FRAME` | major | A | a corner ornament's bounding box escapes the frame corner region at its declared `size_pt` | `page_id, ornament, overflow_mm` | yes (rung 1) | §6.8, 09 §7.3 |
| `PRINT_GUTTER_EXCEEDS_MARGIN` | critical | A·E·R | `safe_area_mm + gutter_mm + binding_allowance_mm > spine_side_inset_mm` — the **spine-side** inset cannot host the declared insets (C4's floor; half-letter `6 + 4 + 3 = 13.00 ≤ 25.35`). The fore edge is bound by C1, C2 and the safe-area check, never by the gutter, so the reference is the spine-side inset alone and **not** a `min(...)` over the two insets (an earlier revision read `min_side_text_margin_mm`; `08` §4.2) | `safe_area_mm, gutter_mm, binding_allowance_mm, spine_side_inset_mm` | yes (rung 1) | §9.1, 09 §7.4, 08 §4.2 |
| `PRINT_UNBREAKABLE_OVERFLOW` | critical | A·E·R | a word wider than the measure cannot be broken; the print page refuses (the reader may insert `overflow-wrap` and reports it) | `page_id, block_id, word_chars` | none — human | §6.10, 09 §5.1 |
| `PRINT_MISSING_GLYPH` | critical | A·E·R | no fallback is available and the font lacks coverage for a codepoint — the print path refuses (the reader shows a banner and reports) | `page_id, codepoint, lang` | none — human (font swap) | §10.4, 09 §6.5 |
| `PRINT_FONT_FALLBACK_METRIC_DRIFT` | critical | A·E·R | the print scope substituted a fallback whose metrics differ — the render is refused, not reflowed (the D-05 posture) | `family, fallback, expected_metrics_hash, actual` | none — human | D-05, D-09, 09 §6.5 |
| `DIG_FONT_FALLBACK_METRIC_DRIFT` | major | none | the digital scope substituted a fallback whose metrics differ: the substitution renders, is recorded, and the page count is re-derived and re-reported — the reader reflows and discloses (D-06, §7.4) | `family, fallback, expected_metrics_hash, actual, pages_before, pages_after` | none — human | D-09, 09 §6.5 |
| `PRINT_IMPOSITION_GUTTER_MISMATCH` | major | A | the `safe_area_mm + binding_allowance_mm` assumption used when offsetting an imposed sheet differs from the design's | `expected_mm, actual_mm` | yes (re-impose) | 09 §7.4, 10 §2.4 |
| `PRINT_BORDER_INCONSISTENT` | major | A | perimeter-frame geometry, `thickness_pt` or offset differs between pages within one style — **measured on the rendered page, not on the token set** | `page_ids[], field, values[]` | yes (rung 1) | §9.2, §10.4, §15.4 |
| `PRINT_BORDER_TEXT_COLLISION` | critical | A·E·R | text or footer overlaps the frame | `page_id, block_id, overlap_mm` | yes (rung 1/2) | §9.2, 09 §7.4 (C2), 08 §5 rung 1 |
| `PRINT_GLYPH_MISSING` | critical | A·E·R | a codepoint has no glyph in the font used (tofu) | `page_id, codepoint, family` | none — human (font swap) | §10.4 |
| `PRINT_FONT_NOT_EMBEDDABLE` | critical | A·E·R | a font with `embed_pdf: false` was selected for print | `family` | none — human | D-09, 04 §8 |
| `PRINT_FONT_SUBSET_FAILED` | critical | A·E·R | the embedded subset lacks a glyph the page uses | `family, missing[]` | none — human | D-09 |
| `PRINT_PAGE_NUMBERING_WRONG` | critical | A·E·R | the printed page number ≠ its reading-order index | `page_id, shown, expected` | yes (re-render) | §10.4, §8.1 |
| `PRINT_IMPOSITION_PAGE_NUMBER_WRONG` | critical | A·E·R | the page number is wrong **on the imposed sheet** (after reordering) | `sheet, slot, shown, expected` | yes (re-impose) | §9.4, §10.4 |
| `PRINT_IMPOSITION_ORDER_WRONG` | critical | A·E·R | a front-face slot holds the wrong page, or a facing pair is wrong | `sheet, slot, expected_page, actual_page` | yes (re-impose) | §9.4, §15.4 |
| `PRINT_IMPOSITION_PAGE_ERROR` | critical | A·E·R | the imposed grid is not a permutation of `1..M` — a page missing, appearing twice, or replaced by an unexpected blank (one failure, three instances) | `page_id, slots[]` | yes (re-impose) | §9.4, §10.4, 10 §9 |
| `PRINT_REVERSE_SIDE_BLANK_UNRECORDED` | major | A | an imposed blank at a sheet slot has no deliberate `blank_intentional.reason` — the sheet-level counterpart of `COMP_BLANK_UNINTENDED` | `sheet, slot` | yes (record or re-impose) | §9.4, §15.4, 10 §2.4 |
| `PRINT_IMPOSITION_SPEC_MISMATCH` | critical | A·E·R | `imposition.spec_version` ≠ `imposition/spec.json` | `artifact_version, spec_version` | yes (re-impose) | D-14, 04 §8 |
| `PRINT_PRINT_GUIDE_MISMATCH` | minor | none | the print guide's paper / sheets / flip edge / fold ≠ the artifact config | `field, guide, actual` | yes (regenerate guide) | §9.5 |
| `PRINT_CONTENT_MISMATCH_APPROVED` | critical | A·E·R | the rendered text ≠ the approved `ms_rev` text — subsumes render-vs-plan drift | `page_id, block_ids[]` | none — human | §10.4, §15.4 |

### 2.5 Operations family (`ops` — §15.5, §12.5, §13)

| code | severity | blk | what it checks | evidence fields | auto | cite |
|---|---|---|---|---|---|---|
| `PROJECT_POINTER_DANGLING` | critical | A·E·R | a `pointers.*` value has no file, or its hash ≠ the pointer | `field, pointer, found` | none — human | 04 §3, §10 |
| `PROJECT_SCHEMA_UNSUPPORTED` | critical | A·E·R | `schema_version` > the engine's supported version (never opened read-write) | `found, supported` | none — human | 04 §9 |
| `PROJECT_STAGE_MISMATCH` | minor | none | stored `stage` ≠ the recomputed stage | `stored, derived` | yes (rewrite) | 04 §3 |
| `OPS_REVISION_IMMUTABLE_VIOLATION` | critical | A·E·R | a revision document changed after its hash was taken | `rev, stored_hash, actual_hash` | none — human | D-10, 04 §1.2 |
| `OPS_REVISION_PARENT_BROKEN` | major | A | a revision's `parent` does not exist | `rev, parent` | none — human | 04 §4.2 |
| `OPS_REVISION_REASON_MISSING` | minor | none | a revision lacks `reason` / actor | `rev` | none | §15.5, 04 §4.2 |
| `OPS_PERSISTENCE_ROUNDTRIP_LOSS` | critical | A·E·R | save → reload loses a manual composition change | `page_id, field` | none — human | §15.2, §15.5 |
| `OPS_JOB_NOT_RESUMABLE` | major | A | a failed step cannot resume from its checkpoint (no checkpoint written) | `job_id, step` | yes (checkpoint) | §15.5, D-17 |
| `OPS_JOB_INTERRUPTED` | minor | none | a job was left `running` after a crash and re-queued at its checkpoint | `job_id, last_checkpoint` | yes (resume) | §15.5, D-17 |
| `OPS_JOB_ABANDONED` | major | A | attempts exhausted; terminal `abandoned` | `job_id, step, attempts` | yes (resume) | §12.5, D-17 |
| `OPS_PROVIDER_UNAVAILABLE` | minor | none | a provider error on a step (the cached replay is checked first) | `job_id, provider` | yes (retry / routing fallback) | §12.5 |
| `OPS_PROVIDER_RATE_LIMITED` | minor | none | a provider throttle response | `provider, attempt` | yes (backoff) | §12.5 |
| `OPS_PROPOSAL_SCHEMA_INVALID` | major | A | a proposal fails its `jsonSchema` (free text is never regex-parsed) | `proposal_id, schema_error` | yes (retry to the bound) | §12.4, 03 §7 |
| `OPS_AI_ECONOMY_VIOLATION` | major | A | a replay on unchanged inputs made a billable provider call | `prompt_hash, provider, model, calls` | none — human | §15.5, §12.5, D-17 |
| `OPS_AI_MUTATED_STATE` | critical | A·E·R | a code path exists from an AI response to a mutated revision (static guard) | `call_site` | none — human | D-11, §11.3 |
| `OPS_PROPOSAL_UNAPPLIED_LEAK` | critical | A·E·R | an AI result influenced an artifact without a recorded applied proposal | `prop_id, artifact_id` | none — human | D-11 |
| `PROPOSAL_TARGETS_LOCKED_CONTENT` | critical (refusal at creation) | E (the affected apply) | a proposal targets a `content_lock` span — refused where the intent is formed | `prop_id, lock_id` | none — human | D-11, 07 §6 E2 |
| `OPS_LICENSE_MISSING` | critical | A·E | a used asset (translation, font, third-party) has no `licenses.json` entry | `kind, identifier` | none — human | D-08, 04 §8 |
| `OPS_NETWORK_FONT_REFERENCE` | major | A | an HTML export references a network font rather than an inlined `woff2` subset | `family, url` | yes (inline/subset) | D-19, 09 §6.2 |
| `OPS_BUNDLED_THEME_LICENCE_UNPUBLISHABLE` | major | none | a bundled theme references a font that would prevent the codebase being published (Q-02's stated constraint) | `theme, family` | none — human | D-09, Q-02, 09 §6.6 |
| `OPS_LICENSE_SCOPE_EXCEEDED` | critical | A·E | a licence exists but does not permit this use | `identifier, use, scope` | none — human | D-08 |
| `OPS_MANIFEST_INCOMPLETE` | critical | A·E | an artifact manifest is missing a D-14 field | `missing[]` | yes (regenerate manifest) | D-14, §15.5 |
| `OPS_ARTIFACT_UNREPRODUCIBLE` | critical | A·E | `manifest.reproducible: false` — an unpinned environment at generation, a failed re-derivation (`bytes_differ`), an unavailable recorded Chromium build, or a missing `val_rev`; the artifact is reported `unreproducible`, never `valid` | `field, expected, actual, unreproducible_reason` | none — human | D-14, §15.5, 12 §6.5 |
| `OPS_ARTIFACT_PARTIAL` | critical | A·E | an exported artifact is incomplete (whole-or-nothing violated) | `artifact_id, missing_pages[]` | none — human | 03 §10, 07 §5.4 |
| `OPS_APPROVAL_BLOCKED_BY_CRITICAL` | critical | A·E | approval refused while a blocking (unresolved) finding is live in the publication-scope report — the code path that enforces §10.5's final sentence | `finding_ids[], scope` | none — human | §10.5, 12 §2.2 |
| `OPS_APPROVAL_UNWAIVED_MAJOR` | major | A (approval-refusal code — never waivable, W6) | a `major` finding marked *A* in §2 is **un-waived** in the judged `val_rev` when the approval act is attempted: the act is refused, and this code is the refusal record's `code` with `refusal.reason = "OPS_APPROVAL_UNWAIVED_MAJOR:find_…"`. It is a **refusal reason, not a waivable finding** — the underlying *A* `major` is the thing to resolve or waive (`12-…` §1.2, §2.2) | `finding_ids[], scope` | none — human | §6.9, §15.1, 12 §2.2 |
| `OPS_APPROVAL_TAMPERED` | critical | A·E·R | an `approvals/<id>.json` fails its content-hash check, or its `state`/`revisions` disagree with the tree (a hand-edited approval) | `apr_id, field` | none — human | §15.5, 12 §10 |
| `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` | critical | E | export invoked while the publication gate (§6) is false; the reason names the failing conjunct — a missing `apr_`, `approval_stale`, `revision_mismatch`, an `environment_mismatch:<component>` (Chromium build / fonts hash / hyphenation / imposition spec), or a stale `val_rev` | `gate_reason, pointers, approval_revisions, environment` | none — human | 04 §7.3, §10, 12 §6.6 |
| `OPS_VALIDATION_REPORT_STALE` | major | A | the cited report judged a different triple/engine, or its `judged` block is incomplete | `cited, current, missing[]` | yes (revalidate) | 04 §7.2, §7 here |
| `OPS_VALIDATION_SCOPE_INCOMPLETE` | major | A | the cited report's `scope` omits a required family | `missing[]` | yes (revalidate) | 04 §7.2 |
| `OPS_MEASUREMENT_STALE` | critical | A·E·R | a cached measurement was used for a different triple / viewport / engine, or the cache key omits the engine version | `cache_key, expected` | yes (re-measure) | §12.5, D-14 |
| `OPS_MEASUREMENT_PRE_FONT_SETTLE` | critical | A·E·R | a measurement was taken before `document.fonts.ready` **and** a two-pass, 2 × rAF layout-stability poll satisfied — the plan is not emitted even as a candidate | `viewport_px_css, fonts_ready` | yes (re-measure) | D-14, 08 §2.6 |
| `OPS_APPROVAL_ENVIRONMENT_MISMATCH` | critical | E | the pinned environment changed — Chromium build id, a font file hash, or the hyphenation/ICU data set; a failure to investigate, never a rebaseline, and export is refused | `component, expected, actual` | none — human | D-01, D-14, 08 §7.2 |
| `OPS_MIGRATION_INVALID` | critical | A·E·R | a migration is not idempotent, or requires network/AI | `migration, a, b` | none — human | 04 §9 |
| `OPS_SCHEMA_DOC_DIVERGENCE` | major | A | `spec/*.schema.json` diverges from `04-…` | `entity, field` | none — human | 04 preamble |
| `OPS_CONCURRENCY_ORDER_VIOLATION` | critical | A·E·R | a parallel operation made page numbering non-deterministic | `op, hash_a, hash_b` | none — human | 03 §9 |
| `OPS_LOCK_MUTATED_AUTOMATICALLY` | critical | A·E·R | an automatic process released, weakened or re-scoped a `Lock` (static guard) | `call_site, lock_id` | none — human | 07 §5.4 |
| `OPS_REGISTRY_CODE_UNKNOWN` | critical | A·E·R | a finding carries a code absent from this registry | `code` | none — human | 00 §3.2 |
| `OPS_HEADLESS_PARITY` | minor | none | an operation available in the UI is absent from the CLI, or vice versa | `op` | none | D-02 |
| `OPS_ARCHIVE_INCOMPLETE` | critical | A·E | a sealed archive cannot reproduce its publication, or lacks a required member | `archive_id, missing[]` | none — human | §13, 12 §7.3 |
| `OPS_ARCHIVE_CONTAINS_CACHE` | critical | A·E | an archive member path resolves under `.cache/` — the archive would certify reproducibility from a cache | `member_path` | yes (re-seal) | 12 §7.4 |
| `OPS_FROZEN_LOCK_RELEASED` | major | none | a lock in `Approval.frozen.content_lock_ids` was released while the approval is governing | `apr_id, lock_id` | none — human | §15.2, 12 §3.2 |

**Registry size.** content 31 · composition 80 · digital 26 · print 32 · ops 42 = **211 codes**, plus `DIG_FONT_FALLBACK_METRIC_DRIFT`, which §2.4 files beside its print sibling `PRINT_FONT_FALLBACK_METRIC_DRIFT` with its `DIG_` prefix intact (reconciliation §4.3) — 212 registry rows in total. The set exceeds a minimal registry because it also absorbs every code already used by `02`, `04`, `05`, `07`, `08`, `09`, `10`, `12` and `13` (verbatim), which `00` §3.2 requires of the owner.

### 2.6 Registry invariants

| # | Invariant | Test |
|---|---|---|
| G1 | Every code emitted by any validator exists in §2, and every code in §2 has ≥ 1 fixture that fires it | `T-QAS-001` |
| G2 | Every code has ≥ 1 fixture that does **not** fire it (no false positive) | `T-QAS-002` |
| G3 | `deriveBlocking` is total over the registry and exhaustively tested | `T-QAS-003` |
| G4 | No validator writes `blocking` (static guard) | `T-QAS-007` |
| G5 | Every §2 row carries a spec or `D-nn` citation | doc lint |
| G6 | Two codes never describe the same check with different severities — a duplicate is a defect, reported not patched | review |
| G7 | Severity is taken from the owning document (`04` §10, `05` Part 3, `07` §5.3, `08`, `09`, `10`, `12`); where the owning document states none, this registry assigns it and records that fact (§2.7) | doc lint |
| G8 | The `DESIGN_` prefix reports `family: "composition"` (§1.1) — the design revision is a pagination input (D-04) and a design defect is a composition defect (D-13) | static guard |
| G9 | No code emitted by a validator is absent from §2 (`OPS_REGISTRY_CODE_UNKNOWN`) | `T-QAS-001` |

### 2.7 Ownership, severity and overlap notes

| Note | Statement |
|---|---|
| N1 | Every code already used by another document is registered **verbatim**, including prefixes that predate the six-prefix convention (`MS_`, `BEAT_`, `BREAK_`, `LOCK_`, `SCRIPTURE_`, `PROJECT_`, `EXPORT_`, `PROPOSAL_`). |
| N2 | Where the owning document states a severity, §2 uses it (G7). Where it states none (`09`'s `DESIGN_FONT_SUBSET_NOT_PERMITTED`, `DESIGN_FURNITURE_BELOW_MINIMUM`, `DESIGN_HYPHENATION_DICTIONARY_MISSING`, `DESIGN_HYPHENATION_IN_DISPLAY`, `DESIGN_PROSE_IN_FURNITURE_ROLE`, `DESIGN_TOKEN_VERSION_UNSUPPORTED`, `DESIGN_UNIT_PAIR_MISMATCH`, `DIG_FONT_FALLBACK_APPLIED`, `DIG_FRAME_DROPPED_SMALL_VIEWPORT`, `DIG_UNBREAKABLE_WRAP_APPLIED`, `OPS_NETWORK_FONT_REFERENCE`, `PRINT_IMPOSITION_GUTTER_MISMATCH`, `PRINT_ORNAMENT_CLIPS_FRAME`), the registry assigns it, defaulting to `major` (the weakest blocking class) so an unstated severity can never over-block a render or an export. **`09` does state a severity for these five, as `critical`** — `PRINT_BORDER_TEXT_COLLISION` (§7.4, constraint C2), `PRINT_BORDER_BELOW_VISIBLE_MINIMUM` (§7.4, C3), `DESIGN_TOKEN_BLOCK_DIVERGENCE` (§8.1, D-1), `DESIGN_TEMPLATE_BORDER_DRIFT` (§7.2) and `DESIGN_DROP_CAP_NOT_MEASURED` (§1.5) — and §2 registers all five as `critical · A·E·R`. An earlier version of this note listed four of them as unstated and registered them `major`; that was wrong, and because severity now decides waivability it was load-bearing. |
| N3 | `DESIGN_FONT_UNLICENSED` (this registry, `04` §8) and `DESIGN_FONT_UNREGISTERED` (09 §6.3) are distinct: the first is a missing *licence entry*, the second a family absent from the registry at all. `DESIGN_FONT_METRICS_DRIFT` (token invalidation) and `OPS_MEASUREMENT_PRE_FONT_SETTLE` (measurement timing) are distinct from both. |
| N4 | `PRINT_BORDER_INCONSISTENT` (frame varies between pages), `PRINT_BORDER_GEOMETRY_MISMATCH` (frame not identical across a `dsg_rev`) and `PRINT_BORDER_TRIM_DRIFT` (frame drifts after cropping) are three distinct observations of the same frame; they are kept separate because `09` §7.1, `08` §4.3 and `10` §6.6 each name one. |
| N5 | `PRINT_PAGE_NUMBERING_WRONG` (reading order) and `PRINT_IMPOSITION_PAGE_NUMBER_WRONG` / `PRINT_IMPOSITION_ORDER_WRONG` / `PRINT_IMPOSITION_PAGE_ERROR` (imposed sheet) are deliberately distinct — the §8 failure-mode #5. |

| N6 | ~~`PRINT_SAFE_AREA_BREACH`~~ — **RESOLVED.** Not registered, and no longer used anywhere: `08` adopted `PRINT_SAFE_MARGIN_VIOLATED` / `PRINT_BORDER_OUTSIDE_SAFE_AREA`. A validator emitting the old name raises `OPS_REGISTRY_CODE_UNKNOWN`. |
| N7 | The `blk` column is normative and carries waiverability: `A` (blocks approval), `E` (blocks export), `A·E` (both), `none` (recorded only, never waivable). §1.4's `waivable` predicate reads this column; there is no separate `waivable` column, and no code may be waived without one of these flags. |
| N8 | The two approval-refusal codes are not waivable findings (W6). `OPS_APPROVAL_UNWAIVED_MAJOR` is a refusal **reason** naming the un-waived `A` finding that caused it (`12-…` §1.2, §2.2) — waiving it would be circular, since it exists only because a finding was not waived; a waiver is recorded against the underlying `major`, never against the refusal code. `OPS_APPROVAL_BLOCKED_BY_CRITICAL` is `critical` and non-waivable by W1. |

---

## 3. How each family is verified

### 3.1 The determinism boundary, per family

`03-…` §2 states the boundary; this is the consequence for validation. A check that measures is deterministic and permanent. A check that judges is AI-mediated and advisory.

| Family | Deterministic measurement (test suite forever) | AI-mediated judgement (advisory, never blocking alone) |
|---|---|---|
| content | normalised duplication, `text_hash`, `stats` recompute, reading-level arithmetic, `content_rules` term match, every `SCRIPTURE_*` lookup against `scripture/registry.json`, citation resolution | coherence, theme drift, lesson clarity, repetition, audience fit, filler, fact entailment, interpretive scripture judgement |
| composition | every `COMP_*`/`BEAT_*`/`BREAK_*`/`LOCK_*`/`DESIGN_*` check — all are pure functions of a revision triple and the lock set (D-04) | none (page-turn *ranking* is heuristic+deterministic; the AI supplies only a rationale, §6.6) |
| digital | all `DIG_*` — Chromium measurement (line boxes, block heights) plus raster comparison of the rendered page against the plan and `ms_rev` | none |
| print | all `PRINT_*` — Chromium measurement in `_mm`, raster comparison post-trim, imposition arithmetic | none |
| ops | all `PROJECT_*`/`OPS_*`/`EXPORT_*`/`PROPOSAL_*` | none |

**Consequence for §10.1.** Of the seven §10.1 items, *completeness*, *reading level*, *editorial accuracy* (the citation/hash part), *absence of accidental duplication*, and *scripture fidelity* are deterministic (so they can be blocking). *Coherence* and *theme consistency*, and the interpretive remainder of *editorial accuracy*, are AI-mediated (so they are `minor`/advisory and never gate).

### 3.2 AI-mediated content checks: the structured output shape

An AI review call (`03-…` §7, task `review` or `scripture_review`) returns data, never prose (`05-…` §1.5). It must validate against this schema, or the call is a failed step and is retried then `abandoned` (`OPS_PROPOSAL_SCHEMA_INVALID`):

```ts
/** Returned by the provider. Validated before any Finding is constructed. */
type AiReviewFinding = {
  block_ids: BlockId[];                 // REQUIRED, non-empty; every id must resolve in the judged ms_rev
  layer: 'developmental'|'structural'|'line'|'copy'|'proof'|'specialized';
  issue_type: string;                   // closed vocabulary per layer + profile
  severity: 'major'|'minor'|'info';     // may NOT be 'critical' (see 3.3, bound R3)
  message: string;                      // references block ids; quotes at most the cited span
  evidence: { span: [number, number]; quote_hash: Sha256; confidence: number };
  suggestion_text?: string;             // becomes a Proposal body; never applied here
};
```

The Finding constructed from it **references block ids only** — never a location that cannot be re-derived, never free prose as the `refs` payload (`05-…` §1.5, "Review never returns prose"):

```ts
{ code: CONTENT_*, family: 'content', severity, origin: 'ai',
  refs: { block_ids, page_ids: [], lock_ids: [] },
  message, evidence: { span, quote_hash, confidence, layer },
  correction: { ladder_step: 'propose_localized_revision', automatic: false, suggested } }
```

Because `origin === 'ai'`, `deriveBlocking` returns rule **B1**: the finding is recorded but can never set `approval`, `export` or `render`. AI content judgement is therefore never a gate by itself, whatever severity the model claims. This is the operational reading of §1.3 ("AI assists … but does not replace deterministic formatting") applied to validation.

### 3.3 How a hallucinated finding is bounded

| # | Bound | On failure |
|---|---|---|
| R1 | `block_ids` is non-empty and every id resolves in the judged `ms_rev` | finding discarded; `CONTENT_FINDING_UNANCHORED` (critical) is raised against the *rejected* finding, so a model that invents anchors is visible |
| R2 | `evidence.quote_hash` = `sha256(normalise(text.slice(span)))` of a referenced block | finding discarded; `CONTENT_FINDING_UNANCHORED` |
| R3 | severity is capped at `major`; `derived origin: 'ai'` forces all three gate-flags false | over-claim is silently corrected, then recorded |
| R4 | `confidence < τ` (profile) is recorded as `info`, never `major` | downgraded |
| R5 | results are cached by `(block text_hash, depth, review profile)` (D-12) — the same input cannot yield one finding on one run and none on the next | cache hit is byte-identical |
| R6 | `refs` is taken **only** from the validated `block_ids`; the model's `message` is never parsed for references | a message that names a page or block in prose is inert |

---

## 4. The correction ladder (§10.5)

§10.5 fixes the order: *fix layout geometry → recalculate pagination → reflow unlocked text → adjust spacing within approved limits → flag composition conflicts → propose localized editorial revision → obtain approval for content changes → rerun all relevant validations.* One rung per subsection, in the spec's order. Rungs are applied **per finding**, and each application is recorded (rung, finding id, new revision) on the `ValidationReport`'s correction trail.

The two hard rules that govern the whole ladder:

- **Any rung that touches prose requires approval.** Only rungs 6 and 7 can change prose, and rung 7 is the approval. No ladder path auto-applies a prose change (D-11, §1.3 "approved text … must be protected").
- **Geometry rungs never touch prose.** Rungs 1–5 and 8 operate on `dsg_rev`, `cmp_rev`, the plan and the artifacts. They create no `ms_rev`.

### 4.1 Rung 1 — Fix layout geometry

| | |
|---|---|
| **Trigger** | a geometry-origin finding that is a pure function of the design/box: `PRINT_SAFE_MARGIN_VIOLATED`, `PRINT_BORDER_TRIM_DRIFT`, `PRINT_GUTTER_EXCEEDS_MARGIN`, `PRINT_BORDER_TEXT_COLLISION`, `DIG_OFFSCREEN_CONTROLS`, `DESIGN_MEASURE_BOX_DIVERGENCE`, `DESIGN_BODY_BELOW_MINIMUM`, `DESIGN_TOKEN_MISSING_AT_CONSUMER` |
| **Automatic** | yes, but bounded: only over token paths **not** under a `design_lock` (else `DESIGN_LOCK_VIOLATED`, critical). |
| **Changes** | the frame geometry / padding / margin / legibility tokens. |
| **Revision** | a new `dsg_rev` when a token value changes; no revision when the correction is render-time only. |
| **May clear** | the geometry findings above, and a consequent `COMP_SPACING_OUT_OF_BOUNDS` **only if** it lands inside `spacing_tolerance` (else it is not cleared). |
| **Never clears** | anything content- or prose-derived; any lock violation; any overflow caused by too much text (that is rung 2/3); `PRINT_FROZEN_OVERFLOW` (D-05). |

### 4.2 Rung 2 — Recalculate pagination

| | |
|---|---|
| **Trigger** | a plan-derived finding: `*_PAGE_OVERFLOW`, `COMP_ORPHAN_WIDOW_VIOLATION`, `COMP_DENSITY_OUT_OF_BAND`, `COMP_DENSITY_OUT_OF_BAND`, `COMP_SPAN_INVALID`, `BREAK_UNSATISFIED`, `COMP_TEMPLATE_INVALID`, `COMP_ORDER_CONTRADICTS_BEAT_ORDER` |
| **Automatic** | yes — re-run `solve()` over the **unchanged** constraint set. Deterministic (D-04). |
| **Changes** | the page/span assignment in the plan. Placement only. |
| **Revision** | a new `cmp_rev` (digital and/or print plan). |
| **May clear** | the plan-derived findings above, when the re-solve removes their cause. |
| **Never clears** | a hard lock conflict (no path exists → rung 5); a frozen-page overflow (D-05 refuses); any `SCRIPTURE_*`/`CONTENT_*` finding; `COMP_PLAN_CONTENT_DIVERGENCE` unless the re-solve actually re-covers every block. |

### 4.3 Rung 3 — Reflow unlocked text

| | |
|---|---|
| **Trigger** | an overflow that survives a rung-2 re-solve because a locked or preference-pinned span holds the page: `LOCK_UNSATISFIED`, `COMP_BEAT_SPLIT`, residual `*_PAGE_OVERFLOW`. |
| **Automatic** | yes, **only** on an unfrozen plan and **only** over blocks that are unlocked, unapproved and not under a `print_page_lock`. |
| **Changes** | moves blocks across page boundaries; may drop S4 preference breaks and split S1/S3 groups within tolerance. It moves *text placement*, never text. |
| **Revision** | a new `cmp_rev`. No `ms_rev` is created. |
| **May clear** | `LOCK_UNSATISFIED` (unfrozen), `COMP_BEAT_SPLIT`, `COMP_ORPHAN_WIDOW_VIOLATION`, residual overflow whose cause was placement. |
| **Never clears** | a violated `content_lock` or `print_page_lock`; a frozen plan (→ rung 5 escalation); `COMP_SPACING_OUT_OF_BOUNDS`; any content finding. Reflow must never cross a lock — that is the whole of §6.9. |

### 4.4 Rung 4 — Adjust spacing within approved limits

| | |
|---|---|
| **Trigger** | a residual overflow where tightening removes ≤ `spacing_tolerance`, or a density finding inside the tolerance band. |
| **Automatic** | yes — this is the **only** content-neutral edit §6.7 permits to be automatic, and only inside declared bounds. |
| **Changes** | leading / paragraph spacing / permitted tracking. Never word count, never text. |
| **Revision** | a new `dsg_rev` if a spacing token scales; otherwise a per-page adjustment recorded on the `cmp_rev`. |
| **May clear** | `*_PAGE_OVERFLOW`, `COMP_DENSITY_OUT_OF_BAND`, `COMP_DENSITY_OUT_OF_BAND`. |
| **Never clears** | any prose finding; anything when the adjustment would push another page into overflow; a `design_lock` token (refused → `DESIGN_LOCK_VIOLATED`); `COMP_SPACING_OUT_OF_BOUNDS` is raised, not cleared, when the bound was already exceeded. |

### 4.5 Rung 5 — Flag composition conflicts

| | |
|---|---|
| **Trigger** | rungs 1–4 exhausted, or a hard conflict exists: `COMP_LOCK_CONFLICT_HARD`, `COMP_FROZEN_LOCK_CONFLICT`, `PRINT_FROZEN_OVERFLOW`. |
| **Automatic** | yes — this rung only *emits*. It mutates nothing. |
| **Changes** | nothing. It surfaces the conflict and the **minimal conflicting set**, each lock with its mandatory `reason` (`07-…` §5.2). |
| **Revision** | none. |
| **May clear** | **nothing.** This rung is terminal until a human acts; a refused render emits nothing (`07-…` §5.4). |
| **Never clears** | — by construction. |

### 4.6 Rung 6 — Propose localized editorial revision

| | |
|---|---|
| **Trigger** | a content finding that no geometry rung can resolve: a page cannot hold the prose (`*_PAGE_OVERFLOW` with a locked span), `CONTENT_LENGTH_UNDER_TARGET`, `CONTENT_READING_LEVEL_CEILING_EXCEEDED`, `CONTENT_COHERENCE_WEAK`, `CONTENT_DUPLICATION_*`. |
| **Automatic** | the **proposal** is generated automatically; **applying it is never automatic** (D-11). |
| **Changes** | the proposed prose edit is inert until applied. Applying it creates a new revision. |
| **Revision** | a new `ms_rev` **on apply only**, citing the `prop_`. |
| **May clear** | its target content/overflow findings **only after** rung 7 approval and rung 8 revalidation. |
| **Never clears** | a lock violation — a proposal targeting a `content_lock` span is refused at creation (`PROPOSAL_TARGETS_LOCKED_CONTENT`); a geometry finding; a `SCRIPTURE_*` mismatch (a proposal cannot silently "fix" scripture text). |

### 4.7 Rung 7 — Obtain approval for content changes

| | |
|---|---|
| **Trigger** | a pending rung-6 proposal. |
| **Automatic** | **no.** This is the human gate, and the only rung permitted to authorise a prose change. |
| **Changes** | the approval state for the relevant §6.11 scope; records the applied `ms_rev` and every `wv_` waiver relied on. |
| **Revision** | none (an `apr_` records the triple; it does not create a revision). |
| **May clear** | the "unapproved change" condition that withheld approval. |
| **Never clears** | any finding; it authorises a change, it does not clear one. §10.5: approval is not granted while an unresolved critical rendering problem remains. |

### 4.8 Rung 8 — Rerun all relevant validations

| | |
|---|---|
| **Trigger** | any earlier rung produced a new revision, or rung 7 granted approval. |
| **Automatic** | yes. Scoped by §5. |
| **Changes** | nothing in the project; it writes a new `ValidationReport`. |
| **Revision** | a new `val_rev` (§1.5). |
| **May clear** | any finding whose **cause revision no longer exists** — the finding is simply absent from the new report because the code was re-evaluated against the new triple. |
| **Never clears** | a finding it re-derives. A report is never edited to remove a finding; a clean re-validation is a *new* report with its own hash (§7). |

---

## 5. Scope and incrementality

### 5.1 Full vs targeted

| | Full validation | Targeted revalidation |
|---|---|---|
| When | project open, first approval, any engine/Chromium/registry change, an explicit **Validate all** | any single change, per the tables below |
| Scope | every family, every scope value | the scopes the change can affect |
| Report | `scope` covers every required scope → eligible to satisfy the gate | `scope` covers the subset → **not** eligible alone; the gate needs the union of partials to cover `JUDGED_SCOPES` for one triple (§6). (`JUDGED_SCOPES`, the report-side set, is not `12` §1.4's `REQUIRED_SCOPES(K)`, the approval-side set — two different sets, two names, §6.1.) |
| Cost | measured against the reference viewport set (§7.4) | the affected pages/blocks only — §12.5 "avoid regenerating complete books" |

### 5.2 Exact scope per change type

Superset of `05-…` §2.7 and `02-…` §6.4. **No `05-…` §2.7 or `02-…` §6.4 row is altered.** Bold rows are additions for the cases this document must also cover.

| Change | Revalidate | Report `scope` |
|---|---|---|
| One block's text | that block's page(s), digital + print; content validators for that block only | `[manuscript, composition]` |
| Typography size | all pages of the affected plan (geometry is global); content validators **not** re-run | `[composition, digital, print]` |
| One lock (add/release) | pages containing the locked scope only | `[composition]` |
| Front matter | print pages `1..k` and the total page-count parity check | `[composition, print]` |
| Blueprint `progression[]` reorder | beat-span validators for changed beats; re-solve pages holding affected beats | `[manuscript, composition]` |
| A beat removed | orphaned blocks + their pages; invalidate page-turn suggestions for the beat | `[manuscript, composition]` |
| A block moved between beats | both beats' spans; the pages holding either | `[manuscript, composition]` |
| A proposal applied to unlocked, unapproved content (autonomous) | identical to the human-applied case for the same change | as for that change |
| A `dsg_rev` token that is a `design_lock` target attempted by an automatic op | refused, not revalidated (`DESIGN_LOCK_VIOLATED`) | — |
| Frozen print page overflows after any of the above | the affected frozen pages; `composition_stale`; render refused | `[print, ops]` |
| **Template changed** (`tpl_`) | every page using that template, both plans | `[composition, digital, print]` |
| **Theme / token set recompiled** | all pages (geometry is global); design validators; **not** content | `[composition, design, digital, print]` |
| **Translation or source reference changed** | the touched `srcref_`'s scripture blocks + their pages | `[manuscript, composition]` |
| **Reference viewport set changed** | the digital plan only | `[digital]` |
| **`imposition/spec.json` version changed** | the booklet arithmetic and every imposed artifact | `[print, ops]` |
| **Locale / hyphenation dictionary changed** | the full digital + print plans (hyphenation moves breaks); `OPS_APPROVAL_ENVIRONMENT_MISMATCH` | `[digital, print, ops]` |
| **Engine or Chromium build changed** | **everything** (D-14 reproducibility) | all scopes |
| **This registry changed** (`registry_version`) | **everything** — a new code or a changed severity invalidates every prior report | all scopes |

### 5.3 Validation caching, keyed by the revision triple

```
val_rev(scope) = sha256(canonical_json({ scope, ms_rev, cmp_rev, dsg_rev, engine_version }))   // 04 §1.1
```

| Rule | Statement |
|---|---|
| C1 | A report is stored at `validation/<hash>.json` and addressed by exactly its judged `(scope, triple, engine_version)` (`03-…` §6). |
| C2 | Requesting a scope for a triple+engine already reported is a **cache hit** — byte-identical, no re-measure, no AI call. This is the mechanism behind §12.5's "targeted revalidation" and `OPS_AI_ECONOMY_VIOLATION`'s cost bound. |
| C3 | A cache hit requires `registry_version` and `chromium` to match as well; if either differs the report is stale (§7) and is recomputed. |
| C4 | Measurement results referenced by a report are cached separately at `project/.cache/measure/<hash>.json` keyed by `(triple, viewport)`; they are disposable and reproducible (`03-…` §5.1). |
| C5 | The gate (§6) may be satisfied only by a report (or a union of partials) whose `judged` equals the current triple **and** whose `scope` covers `JUDGED_SCOPES`. A partial report for one scope can never satisfy the gate alone. |

---

## 6. Gating

### 6.1 The predicate

The publication gate is one pure predicate over a `ValidationReport`, the current pointers, the engine environment, **and an `Approval`**. Every UI action, CLI command and job step consults it; nothing else decides whether a publication is approvable or exportable.

The `Approval` is an **argument, not a global**, because the findings test is `effective_blocking_*(f, a) = blocking(f) ∧ ¬waived_by(a, f)` (B6, W4): a waiver is a relation to an approval, and without an approval there is no waiver set to consult. `a = null` means "no approval exists yet"; then `waived_by(null, f)` is false by definition, so an un-waived `E` finding still refuses the export and the gate can never pass without an approval.

```ts
type GateResult = Readonly<{ approved: boolean; exportable: boolean; blocked_by: FindingId[] }>;

/** The report-side scope set (04 §7.2 `report.scope`). Deliberately NOT `12` §1.4's `REQUIRED_SCOPES(K)`,
 *  which is the *approval*-side set: the two are different sets and now have different names. */
const JUDGED_SCOPES = ['manuscript','structure','composition','design','digital','print','approvals','ops'] as const;

function publicationGate(report: ValidationReport,
                         s: GateState,              // { pointers, environment: env(engine), kind: ArtifactKind }
                         a: Approval | null): GateResult {
  const fresh =
    report.judged.ms_rev         === s.pointers.ms_rev   &&
    report.judged.cmp_rev        === s.pointers.cmp_rev  &&
    report.judged.dsg_rev        === s.pointers.dsg_rev  &&
    report.judged.engine_version === s.environment.engine_version &&
    report.judged.chromium       === s.environment.chromium;

  const scopeComplete = JUDGED_SCOPES.every(x => report.scope.includes(x));

  // W4 — the ONLY way a waiver enters the gate. There is no `Finding.waived` and no `Finding.blocking.*`.
  const waivedBy = (f: Finding): boolean => a !== null && waived_by(a, f);

  // Derived per finding from (code, severity, origin, project state), §1.3. `waived` is the W4 relation
  // evaluated against THIS approval, which is why the decision is computed here and not stored.
  const dec = (f: Finding) => deriveBlocking(f.code, f.severity, f.origin,
                                             { ...stateFor(report, s, f), waived: waivedBy(f) });

  const approveBlockers = report.findings.filter(f => dec(f).approval && dec(f).effective_blocking);
  const exportBlockers  = report.findings.filter(f => (dec(f).export || dec(f).render)
                                                        && dec(f).effective_blocking);
  // approveBlockers === effective_blocking_approval true; exportBlockers === effective_blocking_export
  // or -render true (B6 / `12` §1.1). No filter reads a bare `f.blocking`.

  // `approved` — fresh and complete report, no critical, and no un-waived `A`-flagged finding (B3, B6).
  const approved =
    fresh && scopeComplete && report.summary.critical === 0 && approveBlockers.length === 0;

  // `exportable` — additionally one approval that is approved, matches the triple and the §6.1 environment
  // field-for-field, and covers `12` §1.4's REQUIRED_SCOPES(kind); and no un-waived `E`-flagged finding or
  // critical (B2, B4, B6).
  const exportable =
    approved && a !== null &&
    a.state === 'approved' &&
    eqTriple(a.revisions, s.pointers) &&
    eqEnv(a.environment, s.environment) &&      // §6.1's shape; `12` §6.1 owns it
    REQUIRED_SCOPES(s.kind).every(x => a.scope.includes(x)) &&   // `12` §1.4
    exportBlockers.length === 0;

  return { approved, exportable, blocked_by: [...approveBlockers, ...exportBlockers].map(f => f.id) };
}
```

`stateFor(report, s, f)` assembles the `ProjectGateState` of §1.3 from the report, the gate state and the finding (`scope`, `frozen`, `surface`, `scripture_enabled`, `publication_type`); only `waived` is supplied by the gate, from `waived_by(a, f)`.

The rule this implements is `12` §1.1's, stated identically in §1.3 above: a finding blocks **approval** iff it is flagged `A` and not waived under `a`, or it is `critical`; it blocks **export** iff it is flagged `E` and not waived under `a`, or it is `critical`; flagged-but-waived and unflagged findings block nothing. The tests this owes are tabulated in §10.1.

### 6.2 Which combinations permit what

| Report / state | `approved` | `exportable` |
|---|---|---|
| Fresh, scope-complete, 0 critical, no un-waived `A` finding, no approved `apr_` yet | **true** | false — approval still required |
| Fresh, scope-complete, 0 critical, no un-waived `A` finding, `apr_` approved with matching revisions + environment | **true** | **true** |
| One `major` `A` finding, un-waived | false | false |
| The same finding **waived** (recorded reason on the approval under test) | true | true if `apr_` matches |
| One `major` `E` finding (`SCRIPTURE_INTERPRETATION_FLAGGED`), un-waived, `apr_` otherwise matching | **true** | **false** — the `E` flag blocks the artifact write without blocking the approval act (B4, B6) |
| The same `E` finding **waived** | **true** | **true** if `apr_` matches |
| `publicationGate(report, s, null)` — no approval argument at all | per the rows above | **false** always (`waived_by(null, f)` is false, and `a ≠ null` is required) |
| Any `critical` (rule B2) | false | false |
| A stale report (`judged` ≠ pointers/engine) | false | false |
| A partial report missing a required scope | false | false |
| `apr_` approved but its revisions ≠ current pointers | false | false |
| `apr_` revisions match but its environment ≠ the engine's (Chromium/fonts) | — | false |

### 6.3 No code path may export when the predicate is false

| Rule | Statement |
|---|---|
| X1 | Every artifact-writing entry point — `renderStorybook()`, `readingPdf()`, `bookletPdf()`, `renderPages()`, `printGuide()`, any `art_` write — calls `publicationGate` **before** producing bytes. |
| X2 | When `exportable === false`, the entry point emits `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (critical) with `gate_reason` from `blocked_by`, and returns a refusal. |
| X3 | A refusal emits **no file**. Whole-or-nothing (`03-…` §10). A partial artifact that looks complete is the one failure the product cannot afford (`07-…` §5.4 rule 2, `R-OPS-011`). |
| X4 | The refusal is recorded on the `Artifact` attempt and the `Job`, so a reviewer can see that an export was attempted and why it was refused — the audit trail behind §15.5 "Exported files match the approved revision". |

---

## 7. Evidence and reproducibility

### 7.1 What a `ValidationReport` must record

A later reviewer must be able to re-derive the report without asking the author anything. The `judged` block of `04-…` §7.2 is the minimum; this document extends it to the D-14 environment so the report is as reproducible as an artifact:

| Field | Source | Why |
|---|---|---|
| `judged.ms_rev`, `judged.cmp_rev`, `judged.dsg_rev` | pointers at validation time | the revision triple the report judges (`04-…` §1.1) |
| `judged.engine_version` | engine | the code that produced the findings |
| `judged.chromium` | pinned Chromium build (D-01) | typesetting differs across builds (D-14) |
| `fonts_hash` | `fonts/registry.json` metrics hashes | a substituted font typesets differently (D-14, `OPS_MEASUREMENT_STALE`) |
| `theme_token_hash` | `dsg_rev` token set | geometry is global; a token change invalidates the report |
| `imposition_spec_version` | `imposition/spec.json` | the booklet arithmetic version (D-14) |
| `reference_viewport_set` | the set used for digital pagination | §7.4 pagination is viewport-derived (D-06) |
| `registry_version` | a hash of this file | a new code or a changed severity invalidates every prior report |
| `measurement_cache_keys[]` | `project/.cache/measure/<hash>.json` | the measurements the geometry findings rest on |
| per AI finding: `prop_id, provider, model, prompt_hash, input_hashes, response_hash` | `proposals/` | D-12 caching and audit; §15.5 "AI calls are focused and economical" is auditable from here |

### 7.2 When a report becomes stale

A report is stale — and the gate's `fresh`/`C3` checks fail — when **any** of the following differs from current state:

| Staleness trigger | Detected by |
|---|---|
| `ms_rev`, `cmp_rev` or `dsg_rev` pointer moved | `OPS_VALIDATION_REPORT_STALE`, gate `fresh` |
| `engine_version` or `chromium` changed | gate `fresh`; forces a full revalidation (§5.2) |
| `fonts_hash` or `theme_token_hash` changed | `OPS_VALIDATION_REPORT_STALE` |
| `imposition_spec_version` changed | `OPS_VALIDATION_REPORT_STALE` |
| `registry_version` changed | `OPS_VALIDATION_REPORT_STALE`; forces a full revalidation |
| the report's `scope` no longer covers a required family | `OPS_VALIDATION_SCOPE_INCOMPLETE` |
| `judged` is missing a field | `OPS_VALIDATION_REPORT_STALE` |

Staleness is never repaired by editing the report. The remedy is rung 8: re-validate and write a new `val_rev`. An `Approval` that cited a now-stale report is set `stale` with a `stale_reason` and is never silently returned to `approved` (`04-…` §7.3, `05-…` §2.7).

---

## 8. How this fails in practice

The five most likely ways a gate passes while the artifact is still wrong, and the specific check §2 adds for each. Every one is a case where the *plan* is clean and the *rendered object* is not.

| # | Failure | Why a naive validator misses it | The check that catches it |
|---|---|---|---|
| 1 | **Measurement taken before fonts settle.** Web-font metrics arrive after first layout, so line boxes are measured against a fallback; pagination is "valid" for the wrong metrics. | The plan is internally consistent; `text_hash` matches; only the *measurement inputs* were wrong. | `OPS_MEASUREMENT_PRE_FONT_SETTLE` — the measurement pass asserts `document.fonts.ready` plus a two-pass, 2 × rAF layout-stability poll before reading; `OPS_MEASUREMENT_PRE_FONT_SETTLE` catches the substitution case by comparing the loaded face's `metrics_hash` to `fonts/registry.json` before any rect is read. Both are critical and refuse the plan. |
| 2 | **Validating the plan rather than the rendered pixels.** `Σ span lines == measured lines`, `page_count % 4 == 0`, every `text_hash` matches — and the PDF still clips a descender or drops a glyph (`14-…`, the `dng` failure mode). | Every asserted quantity is a property of the plan; the defect lives in pixels. | `DIG_TEXT_CLIPPED` / `PRINT_TEXT_CLIPPED` computed from the **rasterised page** against the content box, plus `DIG_RENDER_TEXT_DIFFERS_FROM_PLAN` / `PRINT_CONTENT_MISMATCH_APPROVED`. Any check whose evidence is "plan-derived only" may not carry an `R` flag. |
| 3 | **AI content checks returning plausible prose findings with no anchor.** The model returns a fluent critique naming no block, so the finding cannot be resolved, rechecked or cleared. | `message` looks like a finding; nothing downstream can verify it. | `CONTENT_FINDING_UNANCHORED` — the AI output shape requires non-empty `block_ids` and a matching `quote_hash` (bounds R1–R2, §3.3); a finding that fails either is discarded, and the rejection itself is raised so the model's unreliability is visible. |
| 4 | **Border consistency checked on the plan rather than after trimming.** The perimeter frame is identical in the token set and in the laid-out box, but the physical crop or the creep push-out moves it off the safe area. | §9.2 consistency is checked before the page exists as an object. | `PRINT_BORDER_TRIM_DRIFT` and `PRINT_GUTTER_EXCEEDS_MARGIN` (both measured against the **post-trim, post-creep** frame offset), plus `PRINT_BORDER_INCONSISTENT` measured on the **rendered, cropped** page. The border check runs after trim and after creep compensation, not on the token set. |
| 5 | **Page-number check passing on a plan whose imposition is wrong.** Reading-order page numbers are correct on the reading plan, so a plan-level check is green — while the imposed sheet places page 9 facing page 16. | §9.4 reorders pages; a reading-order check never sees the sheet. | `PRINT_IMPOSITION_ORDER_WRONG` and `PRINT_IMPOSITION_PAGE_NUMBER_WRONG` — distinctly from `PRINT_PAGE_NUMBERING_WRONG` — checked **on the imposed sheet** after reordering, together with `PRINT_IMPOSITION_ORDER_WRONG` (the mirrored-back-side case), `PRINT_IMPOSITION_PAGE_ERROR`, `PRINT_IMPOSITION_PAGE_ERROR` and `PRINT_IMPOSITION_PAGE_ERROR`. |

**The general rule these five share:** a validator may only assert a property of the object it can observe. When the observable object is the plan, the check is a *precondition*, not a proof; the proof is the pixel. This is why the registry distinguishes `R` (blocks a render) from `A` (blocks approval) and why `*_TEXT_CLIPPED`, `PRINT_BORDER_TRIM_DRIFT` and `PRINT_IMPOSITION_*` are measured on rendered output.

---

## 9. Traceability

| Requirement | Where answered |
|---|---|
| `R-QAS-001`/`002` content validation, duplication | §2.1, §3.1 |
| `R-QAS-003` scripture fidelity | §2.1 (`SCRIPTURE_*`), §3.1 |
| `R-QAS-004` beats in sequence | §2.2 (`COMP_ORDER_CONTRADICTS_BEAT_ORDER`, `COMP_BEAT_ORDER_NOT_PERMUTATION`) |
| `R-QAS-005` protected passages unmodified | §2.1 (`MS_TEXT_HASH_DRIFT`), §2.2 (`COMP_FROZEN_PAGE_REFLOWED`, `LOCK_UNSATISFIED`) |
| `R-QAS-006` unmet breaks reported | §2.2 (`BREAK_UNSATISFIED`) |
| `R-QAS-007` missing/duplicated content | §2.2 (`COMP_BLOCK_LOST/DUPLICATED`, `COMP_PLAN_CONTENT_DIVERGENCE`) |
| `R-QAS-008` unsatisfied lock flagged, never repaired | §2.2 (`LOCK_UNSATISFIED`, `COMP_FROZEN_LOCK_CONFLICT`), §4.3/§4.5 |
| `R-QAS-009` intentional blanks | §2.2 (`COMP_BLANK_UNINTENDED`), §2.4 (`PRINT_IMPOSITION_PAGE_ERROR`) |
| `R-QAS-010` clipping / overlap / missing text | §2.3, §2.4 |
| `R-QAS-011` responsive, readable, functional controls | §2.3 |
| `R-QAS-012` font scaling, reduced motion, orientation | §2.3 |
| `R-QAS-013` dimensions, margins, gutters, borders | §2.4 |
| `R-QAS-014` overflow, glyphs, imposition, content match | §2.4 |
| `R-QAS-015` the §10.5 ladder | §4 |
| `R-QAS-016` critical blocks approval | §1.3 (rule B2), §6 |
| `R-QAS-017` every finding carries code/family/severity/refs/evidence/blocking | §1.5, §2, §3.3 |
| `R-OPS-006`/`007` critical errors block, exports match | §6.3 |
| `R-OPS-008`/`012` manifest, reproducibility | §7 |
| `R-OPS-104` licence completeness | §2.5 (`OPS_LICENSE_*`) |

---

## 10. Notes recorded, not edited

Points where another document in this set contradicts itself or this document, reported rather than silently resolved (`00-…` §4 convention 1):

| Where | Contradiction | Resolution taken here |
|---|---|---|
| `17-…` Part C, row 1 | **RESOLVED.** `17` now writes `BREAK_UNSATISFIED`; the canonical code is `BREAK_UNSATISFIED` (`04-…` §10, `07-…` §5.3) | no action outstanding |
| `04-…` §8 | lists `COMP_PROFILE_*` as a wildcard | resolved to the single code `COMP_PROFILE_INVALID` (§2.2) |
| `08` §2.6, `09` §6.5 | both describe the measurement-settling failure | registered as `OPS_MEASUREMENT_PRE_FONT_SETTLE` (critical, 08's naming) |
| `08` §4.2 vs `10` §B-3 | **RESOLVED.** `08` adopted `PRINT_SAFE_MARGIN_VIOLATED` / `PRINT_BORDER_OUTSIDE_SAFE_AREA`; `PRINT_SAFE_AREA_BREACH` is not registered and is now unreferenced outside reconciliation notes | no action outstanding |
| `10` §9 vs an earlier draft of `10` | one version used `PRINT_IMPOSITION_PAGE_MISSING` / `_DUPLICATED`; the current version collapses them into `PRINT_IMPOSITION_PAGE_ERROR` | registered as `PRINT_IMPOSITION_PAGE_ERROR` (the current `10`), one code for "the grid is not a permutation of `1..M`" |
| `09` severities | `09` names ~18 codes; five of them it **does** state as `critical` (C2, C3, D-1, §7.2, §1.5) | §2 registers those five `critical · A·E·R` and the rest by N2's default `major`. An earlier revision of this row claimed `09` stated none and that the registry never assigns `critical`; both were false, and severity now decides waivability (N2, G7) |
| `11` §2.1 prefix table | `family` has five values but six code prefixes | `DESIGN_` reports `family: "composition"` (§1.1, G8) |
| `04-…` §7.2 vs §2.4 here | `family` has five values, but the document set uses a `DESIGN_` prefix with no matching family | `DESIGN_` reports `family: "composition"` (§1.1); a sixth family would contradict `04-…` §7.2 |

### 10.1 Test obligations this gate owes — for `docs/14` to declare

No row of `14-…` covers any waiver case, the `E` flag, or `effective_blocking` (`12-…` §11.2; the round-2 review's item 8). `11` mints no test ids: the **finding code under test** below is not a test id. `docs/14` owns the ids and declares these as rows in its own shape — a block extending `T-QAS-001…009`, renumbering none (and `T-QAS-007` stays the no-direct-write static guard). Writing a `T-` id here that `14` has not defined would be exactly the C7 defect `tools/check-traceability.py` exists to catch, so this table deliberately mints none.

| finding code under test | scenario | asserted outcome |
|---|---|---|
| `PRINT_GUTTER_INSUFFICIENT` (major · A), **waived** | a waived `A`-flagged `major` on the approval under test | `effective_blocking_approval(f, a) === false`; the approval act succeeds; `12` §1.1 `EXPORTABLE` is not refused for it |
| `PRINT_GUTTER_INSUFFICIENT` (major · A), **un-waived** | the same finding **un-waived** | `effective_blocking_approval(f, a) === true`; the approval act is refused with `OPS_APPROVAL_UNWAIVED_MAJOR`; `SOUND(a)` is false for every candidate approval, so `EXPORTABLE` is false |
| `COMP_SPACING_OUT_OF_BOUNDS` (major · `blk = none`) | an unflagged `major` | all three sub-flags false and `blocking === false`; `waiverable === false`; creating a `wv_` for it is **refused** at creation (W1); `approved` and `exportable` are unaffected |
| any `critical`, e.g. `PRINT_BORDER_TEXT_COLLISION` | any `critical` | `waiverable === false`; a `Waiver` naming it is rejected at creation (W1); the approval act is refused with `OPS_APPROVAL_BLOCKED_BY_CRITICAL`; the export is refused (B2) |
| `SCRIPTURE_INTERPRETATION_FLAGGED` (major · E), un-waived | an `E`-flagged `major`, un-waived, with an otherwise sound governing approval | `blocking.approval === false` **and** `blocking.export === true`; `approved === true` but `exportable === false` — the `E` flag takes effect independently of approval (B4) |
| every §2 row, × both gates | every §2 row × both gates | `blocking === approval ∨ export ∨ render` (B6); the §1.3 truth table holds for all four flag combinations, and no `blk = none` code is ever blocking |
| every §2 row × both approval states | `effective_blocking(f, a)` against `f.blocking` and `waived_by(a, f)`, over every registry code and both approval states | `effective_blocking(f, a) === f.blocking && !waived_by(a, f)` — false **exactly** when `f.blocking` is false or a waiver for `f` is on `a`; no other code path can make it false |
| — (call-site / type-level) | call sites: `effective_blocking_approval(f, a)`, `effective_blocking_export(f, a)`, `waived_by(a, f)`, `publicationGate(report, s, a)` | `a` is a required, **non-nullable** parameter of the three relations — the predicate cannot be called without an approval. `publicationGate(report, s, null)` returns `exportable === false`, since `waived_by(null, f) === false` and an un-waived `E` finding still blocks |
| `SCRIPTURE_CHRONOLOGY_REORDERED` (major · A), two scopes | waiver scope (W5) | the `w.code = f.code` arm requires the waiver's `scope` to cover the finding: a `manuscript`-scope waiver does not lift the same code in `print` scope. The `w.finding_id = f.id` arm does (W4) |
| — (predicate-level, `environment`) | an approval whose `environment` omits a §6.1 field | `SOUND(a)` is false (two differently shaped objects are never equal) and the export is refused with `reason: "environment_mismatch:<component>"` — the regression test for the §6.1 single-owner rule |
