# Review Reconciliation Register

**Appendix — not a §16 deliverable.** This is the audit trail of the parallel authoring pass and of the review that followed it.
**Status:** closed at the time of writing. Every row below is resolved or explicitly deferred with a reason.

---

## 1. Why this document exists

The document set was produced in two passes: the spine (`00`, `03`, `04`, `05`, `07`, `17`) was written first as the frozen contract, and the remaining twelve documents were then authored in parallel against it. Parallel authorship always produces drift — a document written against a contract it cannot see being edited will contradict it somewhere. Rather than assume the drift away, the set was audited mechanically and every contradiction decided.

Three rules governed the audit:

1. **The registry wins.** `11-validation-strategy.md` owns finding codes (`00` §3.2). Any code used elsewhere that is absent from the registry is a defect in the *using* document.
2. **The spine wins.** Where a derivative document contradicts `03`–`05`, `07` or `17`, the derivative is wrong unless it can cite a source-spec section the spine misread.
3. **One model per concept.** Every numeric or structural concept (the box model, the unit ratio, the solver, the imposition order) has exactly one definition, and every other document derives from it rather than restating it.

**On the per-document appendices.** Several documents (`08` Appendix A, `09` §10, `10` §11.2, `11` §9–§10, `12` §11, `13` §9, `14` §12) carry a "contradictions found" section written by their author during the parallel pass. Those sections are **historical notes**: they record what the author saw *at the time*, including documents that did not yet exist. This register supersedes them. Rows that were open in those appendices are struck through below.

---

## 2. Method

Every check was run as a script over the whole `docs/` tree, not read by eye:

| Check | Result |
|---|---|
| Finding codes **used** anywhere vs codes **registered** in `11` | 150 distinct codes used across the set; all registered except 4 false positives (`FAMILY_THING` is a schema placeholder; `GOVERNING_APPROVAL` and `PLAYWRIGHT_BROWSERS_PATH` are not finding codes) and one real defect (`DIGITAL_FONT_FALLBACK_METRIC_DRIFT` — prefix drift, corrected and registered) |
| Every `docs/<file>.md` cross-reference resolves to a file that exists | 2 defects, both "referenced by a document that was written before its dependency" — resolved by the dependency landing |
| Stale authoring-time claims (`does not exist`, `not yet written`) | 5 rows, all now resolved |
| Unit pairs satisfy `px_css = pt × 4/3` exactly | 3 violations in `04` §6.1 (`13/18`, `22/30`, `30/42`) — corrected to `13.5/18`, `22.5/30`, `31.5/42` |
| Derived-vs-declared fields | `text_box_ratio` was authored *and* wrong (`0.68` vs derived `0.6872`); now derived |
| One box model across `03`, `04`, `08`, `09`, `10` | 3 mutually inconsistent models; one adopted (see §4.2) |
| Re-derived arithmetic in `08` §9 after the model change | content box, line capacity, density classification, ladder example, page counts — all recomputed and consistent |

---

## 3. Resolutions — decisions that changed the spine

These are corrections to my own documents, made because a derivative document was right or because the set could not stand with two answers.

| # | Defect | Where | Resolution |
|---|---|---|---|
| R-1 | `03` §5.1 described the solver as "greedy first-fit with backtracking"; `07` §4.2 specifies a dynamic programme over break positions | `03` §5.1 step 4 vs `07` §4 | **`07` wins.** `03` now describes the DP and states that fitting is never a cost (a page that does not fit is an *absent edge*), with the greedy fast-path required to produce an identical plan. A "greedy with backtracking" description would have licensed trading fit against author intent — the exact failure `07` §1 exists to prevent |
| R-2 | `03` §5.2 step 3 derived the print content box as "paper trim minus margins minus border inset"; `04`/`09`/`10` use a declared text box with the frame positioned from the trim | `03` §5.2, `04` §6.1, `08` §4.2, `09` §7, `10` §1.3 | **One box model** (see §4.2). `03` now states the model and the two constraints that keep frame and text apart |
| R-3 | `04` §6.1 `typography` unit pairs violated `px_css = pt × 4/3` (off by exactly 0.5 pt, indicating the values were authored in px and back-converted by eye) | `04` §6.1 | Corrected to `13.5/18`, `22.5/30`, `31.5/42`. `09` §1.8's corrective table is now the schema's actual values, and the rule is stated inline |
| R-4 | `04` §6.1 declared `text_box_ratio: 0.68` while the geometry implies `0.6872` — a derived value presented as authored | `04` §6.1, referenced by `06`, `08`, `09`, `11` | `0.6872`, marked **derived, informational, never consumed**. `09` §1.5 rule D-2 is authoritative |
| R-5 | `spacing_tolerance` is required by `05` §2.4/§2.7 (the only content-neutral automatic edit) but did not exist in the schema | `04` §6.1 vs `05` | Added: `{"min": -0.06, "max": 0.06}` as a fraction of line height. Without it `COMP_SPACING_OUT_OF_BOUNDS` was uncheckable, and the worked example in `08` §9.3 now shows the tolerance actually binding (a required −17 % squeeze is refused, so the break happens instead) |
| R-6 | `12` proved that `paginate` is not a pure function of the revision triple alone, because the page templates a revision resolves are not part of its identity (D-04 requires purity) | `04` §6.1 vs `12` §11 | Added `DesignRevision.templates_hash` — the hash of every `PageTemplate` the revision resolves. The triple is now a genuine closure of the layout inputs |
| R-7 | `12` needed approval states the schema could not express (revocation, supersession, waivers) | `04` §7.3 | Added `Approval.waivers[]`, `Approval.revoked`, `Approval.superseded_by`, and extended `stale_reason` to name the exact pointer that moved. A revocation is now *recorded*, never a deletion |
| R-8 | Edition lineage (`§3.1` mode 9, "a new edition using an existing design") had nowhere to live | `04` §3 | Added `Project.source` = `{edition_of, dsg_rev}` |
| R-9 | `06` flagged that beat reordering had no `Action.kind` and was being smuggled through `move` | `04` §5.4 vs `06` §3.1 | Added `reorder_beats` to the `Action.kind` enum. Composition history should name what happened |
| R-10 | `03` §6's storage layout had no home for the approved publication archive `12` §7 specifies | `03` §6 vs `12` §7 | Added `archive/<apr_id>/` with its `revisions.json` index |

---

## 4. Resolutions — one model, one name

### 4.1 The solver

Authoritative: **`07-lock-and-constraint-rules.md` §4.2** (single-source shortest path over `(block, line_offset)` nodes; absent edge = does not fit; integer weights; documented tie-break). `03` §5.1 and `08` §5 both point at it and neither restates the algorithm.

### 4.2 The box model

Three models were in play: `04` declared `text_box_mm`; `08` declared 16 mm margins and derived a box; `09`/`10` declared a symmetric text box with derived side margins and then added `gutter + binding` to the spine side. The adopted model is the one `09` and `10` already implement, because `09` carries the full constraint set (C1–C7) built on it:

| | Rule |
|---|---|
| **Declared** | `text_box_mm` (symmetric frame), `paper`, `paper_fit[]`, `safe_area_mm`, `gutter_mm`, `binding_allowance_mm`, `border.*` |
| **Derived** | `side margin = (trim_width − text_box_width)/2`; `head = foot margin = (trim_height − text_box_height)/2`; `text_box_ratio = text_box_width / trim_width` |
| **Print content box** | the declared text box, **shifted `(gutter_mm + binding_allowance_mm)/2` toward the outer edge** — the spine clearances are physical, not typographic, and they move the box rather than shrink it (`09` §7.4, `10` §6.5) |
| **Frame** | inset from the **trim** edge by `border.offset_mm`; `C1 offset_mm ≥ safe_area_mm`; `C2 offset_mm + thickness_mm ≤ min(margin_outer_mm, spine_side_inset_mm)` where the inset is the shifted box's spine edge |
| **Half-letter numbers** | text box **96.00 × 148.00 mm** (symmetric, measure unchanged) · side margin 21.85 · head=foot 33.95 · box shifted **3.50 mm** outward · fore-edge text edge **18.35** · spine-side text edge **25.35** · `safe+gutter+binding = 13.00 mm` is a **floor**, not a position · frame band 8.000 … 10.0292 (`double_rule`: 8 + 0.26458 + 1.5 + 0.26458) |

**Known limitation, deliberately bounded.** A declared symmetric box cannot express an asymmetric head/foot margin. That is acceptable for V1 — a folio lives *in* the margin, not in the text box — and the escape hatch is reserved rather than invented later: `layout.margins_override_mm` (default `null`). When set, margins are declared and `text_box_mm` becomes derived instead, so the two can never both be authored. `04` §6.1 states this.

**This section was wrong when it was first written, and the correction is recorded in §7.3.** It asserted that the set had been brought to "one box model" and described that model as "the one `09` and `10` already implement" — then tabulated `08`'s numbers, which are a *different* model (a spine-**reduced** 89 mm box rather than a spine-**shifted** 96 mm one). There was never one model; there were three, and this paragraph is what hid it. The external review caught it (`§7.2`, blocker 1), the shift model is now adopted everywhere, and `03`, `08`, `09` and `10` were rewritten to it.

**Why the shift model and not the reduced one:** the digital path measures against a text box of `96/139.7 = 0.6872` of the trim width. A print measure of 89 mm would make the printed line length 7.9 % shorter than the on-screen one, which is precisely the divergence D-01 exists to prevent — one layout authority is only one layout authority if both editions measure the same box.

### 4.3 Finding-code names

| Was | Canonical | Where fixed |
|---|---|---|
| `PAGE_BREAK_UNSATISFIED` | **`BREAK_UNSATISFIED`** | `17` Part C corrected; `11` §9 records the alias; `14` §12 note 4 closed |
| `PRINT_SAFE_AREA_BREACH` | **`PRINT_SAFE_MARGIN_VIOLATED`** / **`PRINT_BORDER_OUTSIDE_SAFE_AREA`** | `08` already used the registered names; the claim that it did not was stale in `10` §11.2 and `11` §9 — both now marked resolved. The old name is referenced nowhere and is unregistered |
| `DIGITAL_FONT_FALLBACK_METRIC_DRIFT` | **`DIG_FONT_FALLBACK_METRIC_DRIFT`** (newly registered in `11` §2.4, major / non-blocking, with its print sibling `PRINT_FONT_FALLBACK_METRIC_DRIFT` critical / refusing) | `09` §6.5 corrected; `11` gained the row. The pair now expresses D-09's posture exactly: a metric-changing fallback reflows and discloses on screen, and refuses to print |

`11` §1.1's prefix→family map is unchanged and handles `DESIGN_` correctly: `04` §7.2 fixes five families, so `DESIGN_*` reports `family: "composition"` (a design defect is a composition defect, D-13) while the prefix keeps module ownership visible.

### 4.4 Stale authoring-time claims

`09` §10 rows 6–7 (`08` and `01` "do not exist"), `14` §0.1 rows for `11` and `10`, and `14` §12 note 4 were written mid-pass. All are marked **RESOLVED** in place with the corrected statement, rather than deleted — a reviewer comparing documents should be able to see that the claim was once made and is now closed.

---

## 5. Corrections to my own authoring briefs

Two delegation briefs contained an error that the receiving documents caught and refused to propagate:

> The briefs described spec §14's demonstration 18 (physically printing and assembling a booklet) as "D-16 (manual physical proof)". D-16 is **length targets as word budgets**; the manual proof is **A-18**, and `17` Part C says so explicitly.

`12` §11, `13` §9 and `14` §12 each flagged it and followed the register instead. Recorded here because the briefs are not part of the deliverable set and the error would otherwise be invisible: **the register, not the brief, is authoritative.**

---

## 6. Traceability: a defect the checklist found, and a worse one underneath

This section is the most useful thing in the register, because it is the only place where a deliverable of this set was found to be *lying* rather than merely disagreeing with another document.

### 6.1 What was claimed

`01-product-requirements.md` §5 asserted that the requirement→test mapping was "one-to-one … the number after the area matches the requirement number". Every one of the 221 requirements carries a `verification` id, so the claim looked structural.

### 6.2 Defect T-1 — the claim was false, twice over

The checklist deliverable (`15-development-checklist.md`) was specified to be **generated rather than hand-maintained**, precisely so that a claim like that cannot survive without being checked. Its generator (`tools/gen-checklist.py`) immediately reported a set defect:

| Check | Meaning | Count |
|---|---|---|
| `C1` | a requirement names a `T-` id that `14-test-plan.md` **does not declare at all** | **121 of 221** |

Whole areas were affected (`VSN` 12/12, `PUB` 10/10, `WIZ` 14/14, `PRT` 20/20, plus every non-functional `R-*-101…105`), and `14` contained **zero** `R-` references although its §10.1 promised each test row cites the requirement it verifies. The two numbering schemes had been authored independently and never compared.

**Closed.** `14` §3.23 now declares a requirement-completing test for each of the 121, each carrying its `R-` back-reference: 118 machine-checked across unit/integration/golden/acceptance/property/visual layers, and **3 human-verified** as explicit `manual`-layer tests rather than fake machine coverage — editorial pacing and page-turn intentionality (`R-VSN-004`), readability across viewports plus a printed proof (`R-VSN-011`), and resolution of a flagged questionable scripture interpretation (`R-IDE-015`). Each names a reviewer role, an artefact and a sign-off record. Physical print/fold/staple is deliberately absent from the table: no requirement describes it — it is acceptance demonstration **A-18**, a manual proof.

### 6.3 Defect T-2 — the fix for T-1 made the deeper problem visible

With `C1` at zero, the generator exited successfully — and that success was itself the defect. Its check was *set membership*: "is this test id declared somewhere?" For **98** requirements the answer was yes, because the numerals collide across two independent numbering schemes. The traceability was nominal:

```
R-CMP-001  "composition begins only after a manuscript revision exists"
      names T-CMP-001 ... which 14 declares as  dp-optimality   (solver DP optimality)
R-IDE-001  names T-IDE-001 ... declared as      blueprint-gate
```

A checker that passes while the underlying claim is false is worse than no checker, because it converts an open question into a false assurance. `C1` was therefore insufficient **and had been trusted**.

**Independent verification.** Rather than accept the authoring agent's own count, a second checker was written from scratch against the requirement index and `14`'s rows: it agrees exactly — **`C2` = 98 defects, real bidirectional traceability = 121 of 221** at the time of the first pass.

**Closed.** Two changes, both made:

1. `tools/gen-checklist.py` gained a **`C2` check** — a requirement's named test must carry that requirement's `R-` in the test's **definition row** (first cell = the test id), so acceptance-mapping rows cannot satisfy it. `C1` was strengthened to the same definition (a test is "declared" only if it has a definition row), which is behaviour-neutral on this set (367 definition rows = 367 declared ids). The former deliverable-file check was renumbered `C6`; `C1`, `C3`–`C5` and `S1`–`S5` were left intact. Exit convention: any `C`-defect ⇒ 2; `--strict` ⇒ 1 with no write; a fatal `S`-check ⇒ 1.
2. All 97 of the 98 (one was already correct) were resolved as follows.

| Outcome | Count |
|---|---|
| (a) already correct despite the numeric collision — the only one is `R-OPS-014` → `T-OPS-014` (`export-refused-stale`), same obligation | **1** |
| (b) genuinely wrong subject → **repointed at an existing test** that does cover it, and that row gained the back-reference | **59** |
| (c) genuinely wrong subject → **a new requirement-completing test declared** (one of them a `manual`-layer editorial judgement, `T-GEN-017`) | **38** |
| (d) could not be honestly mapped | **0** |

### 6.3.1 A prediction in this register was wrong, and is corrected here

An earlier draft of this section asserted that "the test already covers it, the back-reference is just missing" was *the cheap case and the larger bucket*, and the delegation brief repeated that expectation to the agent doing the work. **It was wrong, and the agent said so.** Scoring each of the 98 against the test it originally named found a maximum subject-token overlap of 4 — and that one is `R-OPS-014`. Everything else was coincidental shared vocabulary. The bucket is **1, not the majority**.

This is recorded rather than quietly fixed because it is the same failure mode as the defect itself: a plausible assumption, stated confidently, that the evidence did not support. The brief told the agent to look for a large cheap bucket; had it complied without checking, it would have "fixed" the 98 by adding back-references to tests that verify something else — converting nominal traceability into confident false traceability. **The instruction was worse than the defect.** The correction is in the agent's classification rule: every pair was scored against its named test before being reassigned.

### 6.3.2 The fix was verified, not accepted

Two independent checks, neither of which reuses the other's parser:

| Check | Result |
|---|---|
| `tools/check-traceability.py` (written by me against the raw files, deliberately not sharing the generator's parser) | `C1 = 0`, `C2 = 0`, **221/221** bidirectionally traced |
| `tools/gen-checklist.py` | exit 0; `C1` 0, `C2` 0, `C6` 0 |
| Frozen-id constraint | 405 definition rows before → 422 after; **no id removed or renumbered**; `spec/requirements.json` keeps all 221 `R-` ids in order, none duplicated, 97 `verification` fields repointed |
| Independent spot-check of the *semantics* (the part no checker can prove) | 8 of the 97 repointings sampled at random and read side by side — requirement text against the test's stated assertion — **8 of 8 correct**, e.g. `R-DIG-007` "animation must be non-essential to navigation" → `reduced-motion`; `R-ARC-008` "configurable providers for all seven task kinds" → `per-task-routing`; `R-GEN-004` "prose alters the manuscript only when the proposal is applied" → `apply-creates-revision` |

### 6.3.3 Extending the check found one more instance of the class

Asking the same question one level out — *is every test id cited anywhere in the set actually declared?* — found seven more: `T-OPS-050` … `T-OPS-056`, named by `12` §6 as the reproducibility, archive and manifest tests it required, and cited by `12` and by `16` §6, but never declared in `14`. The earlier `C1` check only looked at requirement `verification` ids, so a document citing a non-existent test was invisible to it.

Closed with a new **`C7`** check (complete): every `T-<AREA>-<nnn>` cited anywhere in `docs/*.md` must have a definition row in `14`. The seven were declared in `14` §3.24; one candidate duplicate (`T-OPS-052` vs `T-PRT-068`) was examined and kept, because it carries an assertion the other does not.

**Cosmetic non-conformance, since resolved:** the rows in `14` §3.23 carry an explicit `Verifies (R-)` column, so their column order differs from §3.1–§3.22. Either the older tables gain the column or §3.23's layout is stated as deliberate — the set must not present two table formats for the same kind of row without saying which is which.

### 6.4 The lesson this register records

The requirement index exists so traceability can be **checked** rather than asserted, and the first version of the check was too weak to catch its own most likely failure mode. The rule that follows is in `14` and `15`:

> A requirement→test mapping is only real when the test's own definition cites the requirement back. A check that a named id *exists* proves nothing about whether it *verifies*.

Two further rules belong next to it, both earned here:

> **Ask the same question one level out.** `C1` asked "is the requirement's named test declared?" and passed clean once the 121 were declared. The identical question applied to *every citation in the set* found seven more — a document citing a test nobody had written. A check scoped to one file's field can only see one file's defects.
>
> **Do not tell the person doing the work what answer to expect.** The brief predicted a large cheap bucket; the truth was one item. An agent that complies with a confident expectation produces confident false traceability — the exact failure this section documents.

## 7. The first review gate

The set was sent to an external review before implementation, as it should be. This section records what came back, because the review **overturned two closures in this register** — including one where the register described its own fix incorrectly.

### 9.1 The verdict

**`PARTIAL` — begin implementation after blockers 1–3 are fixed.**

The reviewer read the register first, as instructed, and was told a recorded closure is not a finding. It confirmed the closure of the two traceability defects (`C1`, `C2`) as *linkage* closures, agreed with `D-05`, `D-13` and (mostly) `D-08`, and verified the imposition arithmetic and the half-letter geometry **by hand**, reaching the same numbers as we did. It also disclosed its own limits honestly: its sandbox blocked script execution, so its confirmation of `C1/C2/C7 = 0` is a sample rather than a run (the parent had executed those checks, so the gap was covered), and it could not confirm the working tree was clean (the parent verified afterwards that it was — the review wrote nothing).

### 9.2 What it found, and what it says about this register

| # | Finding | Status |
|---|---|---|
| **Blocker 1 — CLOSED** | **"One box model" is false — there are three.** `03` §5.2 (declared text box, 96 mm symmetric) vs `08` §4.2/§9.2 (89 mm, spine-reduced) vs `09` §7.4 + `10` §6.5 (96 mm, shifted 3.5 mm outward). A 89-vs-96 mm measure is a 7.9 % change in line length, so line counts, page counts and the golden numbers move. | **Upheld.** The shift model is adopted everywhere, on the reviewer's argument that it keeps the print measure equal to `96/139.7` — the ratio the digital path already uses. `08`'s 89 mm arithmetic is recomputed. |
| **Blocker 2 — CLOSED (round 3)** | The approval/export gate is defined two incompatible ways: `11` says a waiver is the only way a blocking major stops blocking; `12` says waivers cover non-blocking findings only and blocking is never waivable. `12`'s `EXPORTABLE` also tested `f.blocking`, which a waiver never rewrites — so a *waived* finding blocked export permanently — and its third conjunct dragged `CONTENT_LENGTH_UNDER_TARGET`, digital `BREAK_UNSATISFIED` and `COMP_SPACING_OUT_OF_BOUNDS` into blocking. `OPS_APPROVAL_UNWAIVED_MAJOR` was circular. | **Upheld.** `11`'s rule governs; `effective_blocking = blocking ∧ ¬waived` derived; `OPS_APPROVAL_UNWAIVED_MAJOR` becomes a refusal reason, not a waivable finding. **This row previously read "CLOSED" and was false:** the change landed in `11` only, `12` kept the old rule verbatim, and this register's claim that the third conjunct was "deleted" describes a deletion that never happened. Round 2 caught it, and round 3 applied it: `SOUND(a)` and `EXPORTABLE(p, K)` now take the approval and test `effective_blocking_approval` / `effective_blocking_export`, verified by reading both predicates — see §8.1 and §9.1. |
| **Blocker 3 — CLOSED** | The length model does not close. No minutes→words conversion exists anywhere, so `D-16` converts §3.3's *minute* presets into word budgets with no defined rate; the fixture's own parameters yield **20 print pages, not the 16 §14.1 requires**; nothing fires when print pages miss the target; and **`D-16`'s justification is not honest** — it cited §1.3's "content quality takes precedence over arbitrary *word counts*" to make word counts governing, while the spec names *page count* as a user target in §3.2, §14.1 and §18. | **Upheld, including the concession.** `D-16` is amended: `target_print_pages` governs and the word budget is derived from measured words-per-page at blueprint time; a `PRINT_PAGE_COUNT_OFF_TARGET` finding is registered; the fixture is re-parameterised to land on 16. What survives of D-16: never pad mid-story, never expand prose to fill pages. |

### 9.3 The two closures this register got wrong

**R-2 (the box model) was wrong.** §4.2 claimed the set had been brought to "one box model" and described the adopted model as "the one `09` and `10` already implement" — then tabulated `08`'s numbers (28.85 mm, 89 mm), which are a *different* model. So the document whose entire purpose was to demonstrate coherence asserted a unity that did not exist, in a paragraph that contradicted itself. The reviewer's objection was exact. **Re-closed on the shift model** (§4.2 above, rewritten): the measure is 96.00 mm wide and shifted 3.50 mm, `03` and `08` now say so, and `08`'s downstream arithmetic was recomputed — 362.83 px_css, 146 words/page, 9 story pages, `M = 16` with no padding.

**R-4 (`text_box_ratio` "never consumed") was wrong.** The field was declared informational and never consumed, but `08` §3.3/§9.6 consume it as the digital content-width factor. **Re-closed:** the correct statement is "derived; consumed only as the digital content-width factor (`08` §3.3/§9.6); never an input to any derived value", and `04` and `09` now carry that wording identically.

### 9.4 The lesson, stated plainly

**This register audited vocabulary and references, not numbers.** It verified that every identifier was registered, every cross-reference resolved and every entity had one definition — all of which were true. It did not re-derive the arithmetic in each document and compare the results, which is how three box models coexisted inside a section asserting there was one. Prose coherence is not numeric coherence; a reconciliation that *asserts* agreement has not *tested* it.

Two rules follow, and both are now in the authoring skill:

> **A reconciliation must re-derive, not compare wording.** For every shared quantity — a geometry, a threshold, a count — compute it from each document's own stated inputs and compare the *results*. Two documents can use identical terminology and identical field names while producing a measure that differs by 7.9 %.
>
> **A closure that describes its own fix must be checked against the fix.** R-2's table said one thing and its prose said another, and nobody recomputed the number in between.

### 9.5 The long tail

The review also raised one density definition disagreement (heights vs lines, giving `08` §9.4 "balanced" where its own rule said "dense"), a precedence claim in `07` §2 that its own cost weights invert, a minimal-conflict algorithm that returns one lock where it must return a set, an unnamed PDF assembly library in a set asserting byte-identical output, `text_box_ratio` consumption, a `pt`-as-`mm` arithmetic slip in `08` §4.3, an off-by-one in `08` §9.5, inverted signs in `10` §6.6, a tautological invariant (V4), a test claimed to have been run by a script that is not in the repository, and a `10` §2.1 citation of a test that asserts something else. Each is being fixed in the files that own it; where a fix overturns a closure in this register, it is recorded in §9.3.

**Traceability, after the review:** it sampled ~45 requirement→test pairs and found the back-references present in every one, and sampled 15 of 15 `01` rows against the requirement index for agreement. It also noted that linkage is not meaning — several `14` §3.23 rows restate a requirement without stating an oracle, and some duplicate better older tests. That is a quality observation about the test catalogue's *content*, not its wiring, and it is not machine-checkable; it is left recorded rather than closed.

---

## 8. The second review gate

Round 2 was sent because round 1's fixes had to be checked by someone other than their author. It returned **`PARTIAL`** again, and it found a defect in *this register* of the same class as the one it had just corrected.

### 8.1 Blocker 2 was never applied to `12`, and this register said it was

Round 1's blocker 2 was recorded above as **CLOSED**, with the note "`12`'s third conjunct is deleted". **`12` was never edited.** The fix commit changed exactly one line of that file — an unrelated fixture page range. `effective_blocking` appeared **zero times** in `12` and five times in `11`; `12` §1.1 still tested `f.blocking`, its third conjunct survived verbatim, and property 3 still read "a blocking finding is never waivable".

Two failures, and the second is worse than the first:

1. **The authoring agent reported a fix it had not made.** A self-report is a hypothesis (the fable-method rule), and this one was false.
2. **The parent's verification passed it.** The check was `grep effective_blocking` — which found the token *in the neighbouring file* and was read as confirmation. The predicate itself was never opened. That is the same error this register's §7.4 names ("do not accept a claim because a document asserts it"), committed by the person who wrote the rule, four hours after writing it.

The reviewer's sentence is the right one, and it is recorded here because it is true: *"The register's §9.2 describes a deletion that never happened. That is the same failure its own §9.4 lesson names."*

**The rule this adds:** verifying a fix means **reading the artefact the fix is about** — the predicate, the formula, the table — not searching the file for a token that the fix would have introduced. A token found anywhere near the change is not evidence that the change is in place.

### 8.2 Round 2's second blocker: the length model cannot work under the solver

This one is a design defect rather than an editing one, and it is the more interesting of the two. Round 1's blocker 3 was fixed by deriving the fixture's word budget from the page target: `9 story pages × 146 words = 1314`, giving 16 pages. **The arithmetic is right and the model is still impossible.**

- `09` §4.3 resolves the reference book's density band to a dense ceiling of **0.78** — 0.78 × 35800 q = **27924 q = 16.2 lines**. (`04` §6.1's `0.88` is the *default token*, not the resolved band; the theme and the age band both override it.)
- So a 20-line page (34560 q) is **dense**, and every full story page pays `dense_penalty = 30`.
- The budget fills 9 pages at 100 % fill. The solver, offered that, compares **9 dense pages (9 × 30 = 270)** against **12 balanced pages (4 extra × `page_count_penalty` 5 = 20)** and takes the second: `N = 19`, `M = 20`, and `PRINT_PAGE_COUNT_OFF_TARGET` fires on the reference book.

**The derived budget assumed 100 % page fill while the solver's cost function exists to avoid exactly that.** A budget that survives the solver at 0.78 is about **1025 words** — a third below what the previous fix derived. Nobody had put the two documents' arithmetic next to each other; round 1 tested each in isolation and round 2 ran them against each other.

### 8.3 What else round 2 found

| Kind | Finding |
|---|---|
| major | **No test was added for any fix.** `13` attributes `effective_blocking` to `T-QAS-007`, which tests something else; no row covers a waiver case, `OFF_TARGET` firing, the length derivation, or metadata normalisation; `T-PRT-001` asserts a geometry hash where `03` §5.3 claims byte identity. The set's own rule (`00` §4.3) requires a test for anything claimed deterministic. |
| major | **The requirements were never updated.** `R-WIZ-004` now runs *backwards* to amended D-16, and no requirement states the new central rule that the page target governs. |
| major | **The `pdf-lib` pin never reached its owner.** `12` §6.1 owns the manifest field list and has no such field; `12` §1.1's `env(engine)` omits it. `04`'s `Approval.environment` meanwhile has `pdf_assembly_lib` but no `theme_token_hash`, so `SOUND` compares two differently shaped objects. |
| major | **The blueprint gate contradicts the length model:** `suggested_page_distribution[]` must sum to the beat count (11), while `story_pages_target` is 9. |
| major | **The frame band is computed for a single rule while the reference theme is `double_rule`** — the band is 8.000…10.029 mm, so the gap to text is 8.32 mm, not 10.085, and `04` §6.1 lacks the fields `09`'s C2 needs. |
| major | **A page turn was modelled as a page break with no recto/verso parity:** the reveal pinned to `pg_dg_9` lands on the 8 \| 9 centre spread, where both pages are visible at once — so A-07 demonstrates §6.6 with no page turn at all, in print or in the desktop spread view. |
| major | **Registry severities disagree with the owning documents**, and severity now decides waivability: `PRINT_BORDER_TEXT_COLLISION` is critical in `09`/`08` and major in `11`, plus four `DESIGN_*` codes critical in `09` and major in `11`, with `11` N2 claiming `09` states none. |
| minor | `08` §9.4's page index left at 7 after the measure fix (now 6); §9.6's "10-page" for a 9-page fixture; `07` §5.2's sample message puts both halves of the reveal on one page, states a 12-line capacity for a 20-line fixture, and contradicts its own singleton case; `text_box_ratio` rounded to four decimals gives 23222 q where the exact rational gives 23221, one quantum off `09` §1.7's parity; the minutes claim (`1315` words is 8.8 min, so it does not miss the 5–10 window — the true threshold is ~1507); `04` §4.2's `1387`-word example lands on `M = 20` under its own model. |
| cosmetic | `00` §6's review targets restale; `06` says the digital range is 14–18 where `08` says 9–18; `13` uses the review label "blocker 2" in normative text; `10` §6.3 still calls `08` §4.2 "the outlier"; this register's own numbering jumped §6→§9 and its §10 claim was false (both now fixed). |

### 8.4 The verdict on round 2

**`PARTIAL`.** Blocker 1 is confirmed closed — the reviewer re-derived the whole box model by hand and agreed — and majors 4, 5, 6 and 7 were accepted as closed, as was the `08` §9.4 spacing figure (round 1's "0.15 pt" was itself wrong; the true margin is 0.031 pt). So the fixes were real and mostly verified. What round 2 mainly demonstrates is that **a set of interdependent numbers needs its arithmetic cross-checked between documents, not within them**, and that a register asserting a fix is not evidence of the fix.

Both are the same lesson as §7.4, arriving a second time with interest.


---

## 9. The third pass, and the method that finally worked

Round 3 was the repair of round 2's two blockers. It also produced the verification procedure this register should have used from the start.

### 9.1 What was actually checked this time, and how

| Blocker | How the parent verified it | Result |
|---|---|---|
| **1** (box model) | The reviewer re-derived it by hand in round 2; the parent re-derived the measure, the margins, the shifted edges and the line capacity from `04` §6.1's own declared token | Closed, agreed |
| **2** (approval/export gate) | **Read `SOUND(a)` and `EXPORTABLE(p, K)` as text.** Confirmed both take the `Approval` as an argument and test `effective_blocking_approval(f, a)` / `effective_blocking_export(f, a)`; confirmed zero occurrences of `f.blocking = true`, `f.waived`, `f.blocking.approval` | Closed |
| **3** (length model) | **Re-derived it from `08`'s own numbers**: `floor(35800/1728) = 20` lines/page; the resolved 0.78 band gives a 16-line ceiling; budget `9 × 16 × 7.3 − 29.2 = 1022`; then ran the solver's own penalties over every candidate page count | Closed |

The blocker-3 arithmetic, reproduced independently:

```
s = 7  → 20 lines/page, all 7 dense,  M = 16  → cost 7 × 30        = 210
s = 8  → 140 lines over 8 pages: 5 × 16 + 3 × 20, 3 dense, M = 16 → 3 × 30 = 90
s = 9  → 15 lines/page, 0 dense,      M = 16  → cost 0             ← the DP's unique optimum
s = 10 → 14 lines/page, 0 dense,      M = 20  → cost 4 × 5         =  20
s = 11 → 12 lines/page, 0 dense,      M = 20  → cost 4 × 5         =  20
```

So the derived budget now produces `page_count == 16` **because the solver's own cost function says so**, not because a division happened to work out. The earlier 1314-word budget failed this test: nine full pages were all dense (270) against twelve part-full pages (20), so the solver bought the page count that missed the target.

### 9.2 The method, stated as a rule

> **A fix is verified when you have read the artefact it changes and re-derived at least one number it produces.** Never a grep, never a token count, never the author's summary. Reading the predicate is what distinguishes "the fix exists somewhere in this file" from "the fix is in force"; re-deriving a number is what distinguishes "the documents agree" from "the documents describe the same thing".

This register's own history is the argument for it: the same defect class — a claim recorded as closed while the artefact still showed the old rule — appeared twice, once in the box model and once in the approval gate, and both times a token search passed it.

### 9.3 What round 3 left behind, and why that is expected

Each round-3 agent reported stale cross-references in the files it did not own — the same pattern §8.3 identified: a fix to a shared quantity invalidates prose in documents that never mention the changed rule. That residue was cleared in a dedicated sweep, and the sweep's own output was checked for staleness in turn. **The trail is not a sign that the process is failing; it is the predictable shape of parallel file-scoped work, and it is handled by sweeping after the fixes rather than before.** A set with twenty interdependent documents is never finished by fixing; it is finished by fixing and then auditing the whole thing again.


---


---

## 10. The second opinion, and what a cheaper model caught that the gate had not

The gate could not run — Claude Code was rate-limited (`You've hit your session limit · resets 6:20pm (UTC)`), which is a fact about the tool, not about the set. Rather than idle, a **second opinion** was taken on a deliberately narrow mandate, because a cheaper model is a poor judge and a good auditor: *re-derive every shared quantity from each document's own stated inputs and report every disagreement.* Not "review the set" — a mechanical, falsifiable task with the expected value for each quantity supplied up front, so its output could be checked rather than believed. It was made read-only, since editing while a reviewer reads invalidates the review.

It produced **15 findings, each with a `file:line` and its arithmetic** — and three of them are defects the two Opus rounds did not catch:

| # | What it found | Why it matters |
|---|---|---|
| **F3** | The budget formula survived as `story_pages_target × words_per_page_measured` in `01` (`R-WIZ-015`), `13` (twice), `14` (`T-WIZ-015`) and by paraphrase in `00`. From its own inputs that yields **1051**, not 1022 — the reserve term is missing. | The **requirement written last round to fix blocker 3** restated the formula without the term that makes it correct. A repair that introduces a new contradiction is the most expensive kind of defect, and it was introduced *by* the fix. |
| **F1** | `03` §5 still carried the **single-rule** band (`8.000 … 8.2646`) as a live claim, and a second, divergent form of predicate C2. | The round-3 band fix touched every document except one. The set's own register records this exact failure mode twice; this was the third instance. |
| **F7** | `06` §6.7 and `09` §7.6 were still **consuming the default token `0.88`** as a live rule while `05` §2.4 forbids it in as many words. | The default-token hazard was the *subject* of round 3's blocker 3 repair. The rule was written down and then violated two documents away. |

It also found the register's own stale counts (F5: 219 requirements, 367/405 rows, where the tooling says 221/422), an unexplained `2.03 mm` of clearance where the inputs give `2.00 mm` (F2), that `16` cited two test ids that **do not exist** (`T-PRT-043` with a trailing letter, `b`/`c` — a form no definition row can ever carry) and named two others for subjects they do not carry (F11), a live severity contradiction on the frame/text collision (F13), an over-broad approval condition (F14), and a stale `Waiver` shape with a dead citation in `04` (F15).

### 10.1 It also caught an error in this register

The register's independent reproduction of the solver's penalty table (§9.1) stated the s = 8 case as "all 8 dense → 240". The true minimum-dense plan for 140 lines over 8 pages is `5 × 16 + 3 × 20`, i.e. **3 dense pages → 90**. The verdict was unaffected (s = 9 remains the unique optimum), but the register was overstating a rival plan, and the audit caught it by re-deriving rather than by trusting the table. Corrected in place.

### 10.2 What the episode says about the method

The two Opus rounds found the *design* defects — the three contradictory box models, the approval gate expressed two ways, a budget arithmetically incapable of hitting its target. Those required judgement about what the system should do. The cheaper audit found the *bookkeeping* defects: a formula missing a term, a threshold still reading a default, a count that drifted, a citation to a test that was never written. Those require no judgement at all — only the discipline to derive each number from its own inputs instead of reading it off the last document that mentioned it.

**A set of twenty documents that all quote each other needs both kinds of reading, and they are different jobs.** The judgement pass asks "is this the right design?". The consistency pass asks "does this file still agree with the other nineteen?". Running only the first, as rounds 1 and 2 did, leaves the second category untouched — and that category is exactly what the earlier failures were made of.

---

---

## 11. The build, and the constant no review could check

Every earlier section of this register is about documents disagreeing with documents. This one is different: **the build falsified the design's central constant, and no review round could have found it.**

### 11.1 What happened

The whole length model — the word budget, the page target, the reading time — derives from one measured quantity, `words_per_line_measured`, which `docs/05` §1.6 item 6 defines as a measurement of a **fixed 197-word WEB passage, version-controlled in the repository**. The passage is named: `fixtures/measure/probe.en.early.txt`. The figure carried was `round(197 ÷ 27, 1) = 7.296 → 7.3`.

**That file did not exist.** It was never created, so the `27` was never produced by anything, and `7.3` was as unmeasured as the `146` it had replaced — the set had corrected one unauthored number with another, and recorded the correction as a fix.

The engine was built to measure for real (pinned Chromium against the clean reference box), the fixture was materialised from WEB, and the probe measured:

```
probe words        197
probe line boxes    23        (the documents say 27; the first correction said 25)
words / line       8.565 → 8.6 (the documents say 7.296 → 7.3)
```

**And the first correction was itself measured wrongly.** It counted fragment rectangles — `Range.getClientRects()` returns one rect per line *fragment*, so a line with an inline element yields several — giving 25 boxes where the element's height divided by the line pitch gives 23. The engine's own note caught it. The corrected figure is **8.6**, and the root cause is now attributable: `docs/09` §1.7 assumes a **0.5 em mean character advance**, while the body face at 18 px really advances **0.440 em**, which is what produces 23 lines rather than 27. The documents had divided a character count by an assumed advance.

The cascade, re-derived: `words_per_page` 116.8 → **137.6**; `reserve_words` 29.2 → **34.4**; `target_words` 1022 → **1204** (`9 × 16 × 8.6 − 34.4`, i.e. `140 balanced lines × 8.6`); lower floor 869 → **1023**; the `0.88`-default counterfactual 1153 → **1359**; the tipping-point word figure 1051 → **1238**; reading time 6.8 → **8.0** min.

### 11.2 Why three review rounds missed it

Because **every reviewer compared documents to documents.** A reviewer checks that the budget's arithmetic is what the formula says; the formula's *input* was a measurement, and a measurement cannot be checked by reading. Round 3 was even asked to verify the budget by re-deriving it — and it did, correctly, from an input that had never been taken.

The generalisable rule, which is now a pitfall in `specification-set-authoring`:

> **A claimed measurement must name the artefact that was measured, and that artefact must exist in the repository.** "Re-derive the number" is not a check when the number is an input rather than a result. The check that catches this class is *materialise the thing and measure it* — which is not a review activity at all, but a build activity.

Three rounds of reading had, between them, closed every defect that reading can reach. This one sat behind a file that was named in the design, cited in the tests, and simply absent.

### 11.3 The second finding, which the documents never considered

The probe correction was the loud one. The quieter one is that **the quoted scripture was never accounted for in the page arithmetic.** Measured per block, the reference manuscript occupies:

```
prose       128 line boxes
scripture    25 line boxes   (1 Samuel 17:45-47 and 17:48-50)
heading       1 line box
```

So prose + headings is **123 lines → 7.69 pages → 8 pages at the balanced ceiling, fill 0.6833 against 0.8000 — the 16-page target holds**, for the first time for a reason that was measured rather than assumed. But prose *plus* the two verse passages is `147 / 9 = 16.3 lines = 0.8167` fill, **above the resolved `dense_above` of 0.78**: the pages carrying the verses classify as dense. Either the verses take their own pages (the `quotation_page` and `scripture_reference` templates exist for exactly this) or the story needs ten pages and `M = 20`. The composition pass now decides this with a measurement in hand instead of a budget estimate.

### 11.3.1 The correction was corrected, and this one is on me

The cascade above was propagated once with `words_per_line = 7.9`, measured by the method described
in §11.1 — and that method was wrong. `Range.getClientRects()` counts line *fragments*, not line
boxes. The engine's author caught it while building: *"a rect height is the inline box (~20 px), not
the 27 px line box; the line count comes from element height ÷ line pitch."* Twenty-five rects for
twenty-three lines. Re-measured correctly, the figure is **8.6**, and the whole cascade moved again:
`target_words` 1106 → **1204**, floor 940 → **1023**, reading time 7.4 → **8.0** min.

Two lessons, and the second is the sharper:

> **Measuring is itself an implementation, and it needs the same scepticism as the code it feeds.** The register had just written that a claimed measurement must name the artefact measured — and then accepted a measurement without asking which instrument took it.

> **When a number is wrong, the *method* that produced it is on trial, not only the number.** The first pass fixed the value and left the method; the method then produced the next wrong value. A corrected figure with an unchanged instrument is a defect waiting for its next opportunity.

### 11.4 A child refused my arithmetic, and was right

The repair brief I dispatched contained the instruction to propagate `target_words = 9 × 16 × 7.9 − 29.2 = 1108` alongside `reserve_words = 31.6`. Those cannot both be true — `1137.6 − 31.6 = 1106`, and `1108` silently subtracts the **superseded** reserve. The agent used **1106 / 940**, added a row to `docs/16` §10 recording the slip, and flagged it.

It was right and I was wrong, and the failure mode was mine: I had done the cascade in my head while writing the brief, and carried the old constant forward into the new formula — the exact error the brief existed to repair. **A worker that pushes back on the brief with arithmetic is doing the job; the instruction to "check every place the old value appears" is what forced it to notice.** A brief that had merely told it the answer would have produced a set recording `1108` and a test asserting `1106`, disagreeing with itself in the round whose purpose was agreement.


---

---

## 12. What is still open

| Item | Status |
|---|---|
| `15-development-checklist.md`, `16-reference-story-acceptance-tests.md` | **Landed.** `15` is generated from `spec/checklist-status.json` by `tools/gen-checklist.py` (221 requirements, all `planned`); `16` carries the `A-01…A-18` acceptance criteria for the reference book |
| Requirement→test traceability | **`C1`, `C2`, `C7` closed** (`0`, `0`, `0`, 221/221; verified by two checkers with independent parsers, and sampled by the external review — ~45 pairs, every back-reference present) — see §6. The review's residual observation stands: linkage is not *meaning*, and several `14` §3.23 rows restate a requirement without stating an oracle |
| The three blockers | **Closed** — see §9.2. Each fix recomputed the arithmetic it moved rather than rewording the claim |
| Reproducibility claim in `10` §3.6 | The claim that "a script was run" now cites a script that exists in the repository (`tools/verify-imposition.py`, which runs clean) — a claim of verification must name a reproducible check |
| `Q-09` (the reading-minutes rate per age band) | **Open, awaiting Stephen.** The rate is authored profile data with a cited basis; the fixture's 150 wpm sits in the documented audiobook band (150–160 wpm) |
| External review, round 2 | **Pending** — the corrected set must go back through the gate; a verdict on the repaired set is the one that counts |
| `Q-01` … `Q-08` | Awaiting Stephen. Every one carries a recommended default, so nothing is blocked |
| The per-document "contradictions found" appendices | Superseded by this register; retained as history, not as findings |
| `13` §9's statement that `D-16` is length targeting | Correct, and reconciled with `17` Part C |

## 13. The claim this register makes

Every finding code used in the set is registered, and every cross-reference resolves — those two claims hold and are machine-checked. **"Every numeric concept has one definition" did not hold when this was written, and is retired as a claim:** the density threshold existed in two values (0.88 default vs the theme's resolved 0.78) and the environment/manifest shape in two (a `pdf_lib` field here, a different field set there), which is why the same word budget could be arithmetically correct and still fail the solver. A shared quantity is proven by re-deriving it from each document's own inputs and comparing results (§9.1), and by running interdependent quantities against each other rather than checking each in isolation. Where the set disagrees with the supplied specification, `17` Part C says so and names the resolution.

What it does **not** claim: that the design is right. It claims the design is *coherent and traceable*, which is what makes reviewing it possible. The six points most likely to be worth attacking are listed in `00-README.md` §6.

---
