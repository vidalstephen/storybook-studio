# Lock and Constraint Rules

**Implements:** spec §6.9 (composition locks), §6.10 (responsive composition), §6.4 (lock operations), §10.2 (composition validation), §6.11 (approval)
**Deliverable covered:** D8 (composition constraint and lock rules)
**Inherits:** `17-decisions-and-open-questions.md` D-05, D-07, D-11

---

## 1. Why this document exists

The spec requires locks to have "explicit priorities and scopes" and requires that an unsatisfiable set of constraints be *identified* rather than silently resolved (§6.9). Neither is implementable from the spec as written, because "priority" is never given a value and "conflict" is never defined. This document fixes both, and defines the solver that satisfies them.

The whole design follows from one sentence:

> **A lock is the author saying "this was intentional". Anything that violates one must be either impossible or visible — never quiet.**

---

## 2. Lock types, precedence and semantics

| # | Lock | Class — *policy and reporting*, not a solver rank (see below) | Protects | Scope shape | Violated by |
|---|---|---|---|---|---|
| 1 | `content_lock` | **H1 — hard** | The approved wording of a block span | `block_ids[]` | Anything that would change the text: applying a `Proposal`, an AI rewrite, an automatic simplification |
| 2 | `print_page_lock` | **H2 — hard** | Placement of content on a fixed physical page | `page_id` (+ `block_ids[]`) | Any reflow that moves a locked block off its frozen page or adds content to it |
| 3 | `beat_lock` | **S1 — soft, reported** | The grouping/adjacency of a beat's blocks | `block_ids[]` (usually a beat's span) | A page break that splits the beat's blocks across non-adjacent pages |
| 4 | `page_break_lock` (`essential: true`) | **S2 — soft, reported** | A page must begin before a block | `before_block` | A layout in which that block starts mid-page |
| 5 | `keep_together_lock` | **S3 — soft, tolerance** | Blocks staying on one page | `block_ids[]`, `tolerance.lines_over` | The group needing to be split; violation magnitude = lines over the page box |
| 6 | `page_break_lock` (`essential: false`) | **S4 — preference** | A preferred break | `before_block` | Same as S2, but freely droppable and only reported as `info` |
| 7 | `design_lock` | **P — pin** | A design decision against automatic change | `token_paths[]` | An automatic design mutation (theme switch, spacing adjustment, auto-fit) |

**Two orderings, and only one of them is a total order.** The table above names *classes*, and a class does two jobs: it fixes the violation policy (§3) and it orders the report (§5.3). It is **not** a single ranking of everything:

- **Hard locks have a total, strict, profile-independent precedence: H1 > H2.** It is enforced by *removing edges* from the solver's graph (§4.4), never by a cost, so it is a genuine precedence: `content_lock` outranks `print_page_lock` because text is what the author owns, and a plan that cannot satisfy both does not exist rather than existing with a penalty.
- **Soft locks (S1–S4) are weighted, not ordered.** They are cost terms (§4.3), and the weights are **per-profile data** (D-15). The shipped weight vector deliberately does **not** follow the S-numbering: an unmet `essential` break (S2) costs 3000, a `keep_together_lock` breach (S3) costs 800 per group, a `beat_lock` split (S1) costs 500 per split. The effective avoidance order in the default profile is therefore **S2 > S3 > S1**, and that is the intended product policy: §3 makes an unmet essential break *blocking for approval* in print, an S3 breach a tolerance question, and an S1 split a reported soft violation.
- **The consequence, stated rather than implied.** A cost cannot make a path cease to exist, so **two soft locks can never make an unfrozen plan unsatisfiable**. D-07's "two locks that cannot both hold produce a `CompositionConflict`" therefore fires for the H1/H2 pair (§4.4, §5.1) and for the frozen-plan escalation (§5.1, D-05) — never for two soft locks inside the DP. An earlier draft of this section claimed "precedence is total and strict: H1 > H2 > S1 > S2 > S3 > S4"; the §4.3 weights inverted one half of that claim and the DP made the other half unreachable, so the claim is withdrawn and replaced by the two statements above.

**Why the cost is not lexicographic over the classes.** Making S1 always beat S2 always beat S3 regardless of profile weights would let the old sentence stand literally, and it was rejected because it inverts §3: the solver would then accept an unmet *essential break* (a print approval gate) in order to avoid splitting a *beat lock* (a disclosed soft violation), and the 3000 weight would become dead data that no plan could ever trade against. The cost of the chosen resolution is that the soft-lock ordering is a numeric judgement living in profile data rather than a rule — a profile with an unwise weight vector can express a policy the set does not intend, which is what `COMP_PROFILE_INVALID` (major, A; `11` §2.2) guards.

A `Lock` document may override its `precedence` for an exceptional case, but only with a non-empty `reason` (schema §5.3), and the override is surfaced in the UI as an unusual state. For a soft lock the override changes its **weight** (and its reporting order), because that is the only mechanism a soft lock has; for a hard lock it is refused, since H1 > H2 is the mechanism by which text outranks placement.

**`design_lock` does not enter the page solver.** It constrains the *mutation path* of the design revision: any automatic operation (auto-fit spacing, theme application, "improve layout") must treat locked token paths as constants. A user-initiated token edit is always permitted — the lock exists to stop the machine, not the author.

---

## 3. Violation policy depends on scope, because scopes have different promises

The same soft lock has different consequences in the digital plan and the print plan. This is not an inconsistency; it is §6.10's substance.

| Lock | Digital plan | Print plan, **not yet approved** | Print plan, **frozen** (D-05) |
|---|---|---|---|
| `content_lock` | hard | hard | hard |
| `print_page_lock` | n/a (not meaningful on a viewport) | hard | hard |
| `beat_lock` | soft — minimise, report, proceed | soft — minimise, report, proceed | **conflict** — refuse to render at the violating page; author must `Re-open pagination` |
| `page_break_lock` essential | soft — must be honoured at the **maximum reference viewport** or reported (§6.10 "preserved where feasible") | soft — reported; a `BREAK_UNSATISFIED` in print scope is **blocking for approval** | **conflict** |
| `keep_together_lock` | soft within tolerance | soft within tolerance | **conflict** if magnitude > tolerance |
| `page_break_lock` preference | droppable, `info` | droppable, `info` | droppable, `info` |

**Why the digital plan is allowed to violate soft locks at small viewports:** §6.10 explicitly anticipates it ("a small mobile display may not have sufficient space to preserve exactly the same page as a desktop spread") and explicitly requires disclosure. Reflow is the *correct* behaviour on a phone, and refusing to render because a beat split is the wrong product decision.

**Why the frozen print plan may not:** §15.2 requires print page assignments to be stable after approval, §15.4 requires no unintended blanks and correct booklet ordering, and the physical object already exists in the author's hands once it is printed. A frozen plan that cannot hold its content is a fact the author must be told about, not a layout the machine may quietly change.

---

## 4. The solver

`solve()` is the component that turns measurements plus constraints into a `PagePlan`. It is deterministic (D-04) and lives in `src/composition/solver/`.

### 4.1 Model

Everything is expressed in **lines**, not pixels, for cost purposes.

- A page *p* has capacity `C_p` = `floor(available_height / line_height)` lines, plus `extra_p` for ornaments/drop caps/space-before allowances already subtracted in measurement.
- Each block *b* is a sequence of line boxes with heights; its **occupancy** on a page is the integer count of line boxes placed there (fractional leading is accumulated in 1/64-px integers and consumed when it crosses a line, which is exactly how a text engine behaves).
- A `break_position` is `(block_index, line_offset)`.

### 4.2 Algorithm

A **single-source shortest path (dynamic programme)** over the sequence of break positions:

- Nodes: `(b, l)` — block *b*, line offset *l*. Plus `START` and `END`.
- Edge `(b1,l1) → (b2,l2)` means "one page holds the content from `(b1,l1)` up to but excluding `(b2,l2)`", and exists only if that content fits the page box (hard fit; the edge is absent, never penalised, if it does not fit).
- Edge cost = the sum of soft constraint penalties incurred by *ending a page at that position* (§4.3).
- Shortest path = the plan with the lowest total penalty. Because edges only go forward and each has a defined cost, the result is unique except for exact ties.

**Fitting is never a reason for the graph to have no path.** A block whose own measured height exceeds the page's available height — an oversized block — gets a **single degenerate edge** that places it alone on one page, and that page is *reported* (`DIG_PAGE_OVERFLOW` / `PRINT_PAGE_OVERFLOW`, critical, A·E·R) rather than the solve failing. This is what `03` §5.1 step 5 and `08` §3.7 require ("the plan is still emitted … its render is refused"); nothing is truncated, nothing is clipped, and the span is never shortened. It is also what keeps this document's conflict machinery about **locks**: `minimalConflict` (§5.2) asserts as its precondition that `solve` is unsatisfiable, and if an oversized block could empty the graph that assertion would fire for a *fit* problem and the search would return the empty set. With the degenerate edge in place the **only** way the graph loses its `START → END` path is the removal of edges by H1/H2 locks (§4.4) — including the frozen plan, whose constraint set is the same mechanism (§5.1, `08` §4.7).

**Tie-breaking is explicit and part of the contract:** equal-cost paths resolve to the one with (1) fewer pages, then (2) the earlier first page break, then (3) the lexicographically smaller span sequence. Without this rule, two runs on the same input could differ in an unobservable but real way.

**Complexity:** O(n·L) nodes where L is lines per block; with L ≤ 200 and n ≤ 400 this is trivially fast — the initial composition of a 16-page book is sub-millisecond, and the expensive part of the pipeline is measurement in Chromium, not the solver.

**No fast path — the optimisation was removed, with the reason.** An earlier draft took a greedy first-fit path "when no S1–S4 lock and no orphan/widow minimum applies", asserting it produced the identical plan. **That condition is not sufficient for equivalence.** `sparse_penalty` (40), `dense_penalty` (30), `template_mismatch_penalty` (100) and `page_count_penalty` (5) apply on **every** page and are not gated by any lock, so greedy max-fill will diverge routinely rather than rarely: greedy packs a page to 92 % fill and pays `dense_penalty` 30, where the DP breaks one line earlier, lands the page inside the band (+0) and pays `page_count_penalty` 5 for one more page — a total of 5 against 30, so the DP's plan is 25 cheaper on a two-page book. It is deleted rather than conditioned on, for three reasons:

1. **The optimisation buys nothing measurable.** The solver is not the bottleneck — the DP over `≤ 400` nodes × `≤ 200` lines is sub-millisecond and the whole pipeline budget allows it `≤ 5 ms` per plan (`08` §8). A second code path cannot pay for itself against a stage that is already free.
2. **A sufficient condition is as expensive as the search it replaces.** To certify equivalence one must establish that *no* cost term can fire at *any* feasible break position in this input — which requires knowing the fill of every candidate break, i.e. most of the DP. `COMP_PROFILE_INVALID` and per-profile weights would then have to be re-certified on every weight change.
3. **A second code path is a second plan hash.** Its only possible failure signal is `COMP_SOLVER_NONDETERMINISTIC` (critical) — a divergence is *supposed* to be impossible, so a silent one is undetectable in production. Not worth the risk for a free stage.

**The retired `blank-heavy` fixture could not have caught such a divergence**, which is why the equivalence claim survived review: blank and back-matter pages hold no prose, so no density, orphan, widow or template term can fire there and the two algorithms agree *by construction*. A fixture that cannot fail is not evidence. The fast-path equality test went with the path: `14` §3.3 repoints `T-CMP-002` to the property that a soft lock can never make a plan unsatisfiable, and `14` §4 drops the `blank-heavy` row.

> **Reported, then corrected in the owning documents.** The three statements that described the deleted path have since been corrected at source: `03` §5.1 (the fast-path clause is deleted), `11` §2.2's `COMP_SOLVER_NONDETERMINISTIC` row (the equality-check reference is dropped), and `14` §3.3 (`T-CMP-002` repointed, its `blank-heavy` fixture row removed). `REVIEW-RECONCILIATION.md` R-1 is the register's own record and is owned there. The solver is owned here; this note records that the correction landed.

### 4.3 Cost terms

| Term | Applies when | Weight (default; per-profile) |
|---|---|---|
| `sparse_penalty` | `fill_ratio < resolved_density_band.sparse_below` on a `story` page — `fill_ratio` as defined in `05` §2.4: `measured_height_q / available_height_q`, an exact rational compared by integer cross-multiplication, **not** a line ratio | 40 |
| `dense_penalty` | `fill_ratio > resolved_density_band.dense_above`, same definition. The band is the **resolved** one (`04` §6.1 `resolved_density_band`, resolved by `09` §4.3 against the theme and the project's profile) — never the `0.88` default token, whose use would place the reference book's pages in the wrong class and change the plan | 30 |
| `orphan_penalty` | page ends with fewer than `typography.orphans` lines of a block | 200 |
| `widow_penalty` | page begins with fewer than `typography.widows` lines of a continued block | 200 |
| `beat_split_penalty` | a `beat_lock` group spans a break | 500 per split |
| `keep_together_penalty` | a `keep_together_lock` group spans a break | 800 per group |
| `essential_break_penalty` | an S2 break position is passed without a break | 3000 |
| `preference_break_penalty` | an S4 break position is passed | 20 |
| `cliffhanger_penalty` | §2.5 anti-contrivance rule | 600 |
| `template_mismatch_penalty` | page `kind` and assigned template disagree (§6.8) | 100 |
| `page_count_penalty` | per additional page beyond `targets.target_print_pages` | 5 (deliberately low — see below) |

Weights are **per publication profile**, so a children's book penalises density more heavily than an inspirational reflection. They are declared in `profiles/<name>.json`, which makes the solver's behaviour a configurable, testable artefact rather than a hard-coded opinion.

**Which soft lock is avoided first is a number, not a rank (D-07, §2).** The weight column is the *only* mechanism that orders two soft locks, so the table cannot be read top-to-bottom for priority: an unmet `essential` break (3000) outranks a `keep_together_lock` breach (800), which outranks a `beat_lock` split (500). That is the shipped policy and not an accident — §3 makes an unmet S2 break a gate for print approval, an S3 breach a tolerance question, and an S1 split a disclosed violation. A profile may change the numbers; `COMP_PROFILE_INVALID` (major, A; `11` §2.2) is what catches a vector that expresses a policy the set does not intend. `design_lock` has no weight at all — it is enforced on the mutation path, not here (§2).

**Why `page_count_penalty` stays at 5 although the page target now governs (D-16 as amended).** The page target governs the *manuscript's length* (`05` §1.6): the word budget is derived from it at blueprint time **at the resolved ceiling minus a reserve**, precisely so that the target plan is the one this solver's own cost function prefers — nine balanced 16-line pages cost 0 against a ten-page plan's 20 and a nine-page 20-line plan's 270 (`05` §1.6 item 1; `16` §1.2.1). It does not govern the *solver*, and it must not: a solver permitted to buy the page count would buy it by packing pages to the dense threshold, trading readability for a number — exactly what §1.3 and §5.1 forbid.

The two are not in tension, but the boundary between them is worth stating exactly, because §4.2's worked trade is real. `page_count_penalty` is **not** a term that will add pages to a book written to its budget: it is 5, it never outbids a 30-point density term, and for a manuscript at or below the derived budget the target plan costs 0. It *will* trade a page for a dense page when a manuscript is **longer than its budget** — the DP adds a page, the page target is missed, and `PRINT_PAGE_COUNT_OFF_TARGET` (major, A; registered and owned by `11` §2.4, named here and not defined here) reports it to the author. That is the intended behaviour and not a defect: the machine may not repair an over-length manuscript by densifying it, and it may not repair it by expanding or cutting prose either (`05` §1.6 items 4–5). What remains for this term inside the target is a mild tie-breaker between plans that are otherwise equal, and 5 is the right size for that: small enough never to outbid a density or orphan term, and non-zero so that between two otherwise identical plans the shorter book wins (§4.2 tie-break rule (1) says the same thing deterministically).

### 4.4 Hard constraints are not costs

A hard constraint (H1, H2) is never given a finite weight. It is enforced by **removing edges from the graph**:

- `content_lock` removes nothing — it constrains *text*, and the solver cannot change text anyway. It is enforced earlier, in the proposal path (D-11). Its participation in the solver is therefore an assertion, and the solver asserts it: if a plan's blocks' `text_hash`es do not match `ms_rev`, the solve fails.
- `print_page_lock` removes all edges that would place a locked block on a different page, and all edges that would place unlocked content onto a locked page. If the remaining graph has no path from `START` to `END`, the solve **fails with a conflict** (§5).

### 4.5 Determinism requirements

- All measurement values are quantised to 1/64 px integers before entering the solver.
- No floating-point weights: weights and penalties are integers.
- No iteration over hash-map key order: block/beat/lock collections are sorted by their ULID before iteration.
- Same revision triple + same viewport + same engine + same Chromium build ⇒ identical `PagePlan`, asserted by a golden test that hashes the plan.

---

## 5. Conflict detection and reporting

### 5.1 Definitions

- **Hard conflict** — no plan exists that satisfies all H1/H2 locks. The solve fails; no plan is emitted; the author is shown the minimal unsatisfiable subset of those locks (§5.2). **Fit is not part of this definition.** An oversized block cannot empty the graph (§4.2): it gets its own page and a critical overflow finding, and the plan is emitted so the ladder (`08` §5) can run. Only the removal of edges by a hard lock leaves no path.
- **Escalated conflict** — in the frozen print plan, a soft lock (S1–S3) would be violated beyond its tolerance. The render of the affected page is refused (D-05); the plan is not altered.
- **Soft violation** — a soft lock violated in a plan that is not frozen. A plan *is* emitted, with the violation attached.

### 5.2 Minimal conflicting set — a minimal unsatisfiable subset of the **hard** locks

When a hard conflict occurs (§5.1 — no plan exists under the H locks), the system reports a **minimal unsatisfiable subset of the hard locks**: a set that cannot all hold *and* from which no member can be removed without restoring a plan. That is the smallest sufficient explanation an author can act on — a message naming nine locks when two are in conflict is useless.

**The algorithm is a deletion-based minimal-unsatisfiable-subset (MUS) search over the H locks only.** The earlier wording ("remove locks one at a time in precedence order … report the first lock whose removal restores solvability") was wrong twice: it returned **one** lock rather than a set, and it returned **nothing** when two or more removals were needed — which is the normal case for the E4 configuration.

```
minimalConflict(input):
    H = { ℓ | ℓ.state == "active"  and  class(ℓ) ∈ {H1, H2} }     # soft locks (S1–S4) are excluded
    S = H
    assert solve(input, S) is unsat                               # precondition: §5.1 already held
    for ℓ in H ordered by (class, then ℓ.id):                     # deterministic — §4.5 forbids hash order
        if solve(input, S \ {ℓ}) is unsat:                        # ℓ is not needed
            S = S \ {ℓ}
    return S                                                       # unsat, and every member necessary
```

- **Correctness.** The initial set is unsatisfiable, so an unsat test on `S \ {ℓ}` can only remove a lock that is not required; the loop therefore never makes `S` satisfiable, and at exit no single member can be removed. That is exactly a minimal unsatisfiable subset. It is **minimal, not minimum**: a smaller conflicting set may exist elsewhere in `H`; what is guaranteed is that the returned set is irredundant and that the deterministic iteration order makes the return value reproducible on identical input (§4.5).
- **Complexity.** `|H| + 1` solve invocations, each `O(n·L)` (§4.2), so `O(|H| · n · L)` worst case. `|H|` is 1–5 in practice (the fixture has two), and the DP is sub-millisecond, so the search costs less than one measurement pass — it is not worth an incremental or divide-and-conquer variant.
- **Soft locks are never in the returned set.** They are costs, not constraints (§2): a cost cannot make a path cease to exist, so no soft lock can be a *necessary member* of an unsatisfiable subset. A soft lock violated by the emitted plan is reported as a violation against that plan (§5.3), which is a different message for a different problem.
- **A single `print_page_lock` can also be unsatisfiable alone** — one whose assigned blocks cannot physically fit the page it names. `minimalConflict` then returns the singleton, because `S \ {ℓ}` is satisfiable for that one lock. Reporting "this lock cannot be satisfied on this page" is the correct answer, and the old algorithm's framing ("removing either lock makes a composition possible") could not express it.

**Conflict messages must name, for each lock, that lock's `reason`** (mandatory at creation, schema §5.3), because the point of the message is to put two *intents* side by side and let the author choose. A hard conflict has **two shapes**, and `minimalConflict` returns the right set for each: two or more H2 locks whose scopes cannot coexist (**E4**), and the **singleton** — a single `print_page_lock` whose named page cannot physically hold the blocks it names (§5.2's last bullet). An earlier revision of this section called the first "the only shape a hard conflict can take", which its own next paragraph contradicted. The message is the same shape in both cases: the `reason` strings, the page, and what that page can hold. E4's reads:

```
Cannot compose print pages. No plan satisfies both of these locks, and neither can be dropped
without restoring a plan.

  lck_01J8a  print_page_lock · page 10 · H2
             "the reveal must land on a fresh page"
             blocks assigned to page 10: blk_dg_forward
  lck_01J8b  print_page_lock · page 10 · H2
             "the closing reflection must face the reveal"
             blocks assigned to page 10: blk_dg_reflection

Page 10 holds 20 lines; the two assignments need 27. Which intent do you want to keep?
  [ Release "the reveal must land on a fresh page" ]   [ Release "the closing reflection must face the reveal" ]   [ Open page 10 manually ]
```

Two corrections are recorded here rather than left to be re-found. (1) The page and capacity figures are the reference fixture's: `available_lines = floor(35800 / 1728) = 20` (`05` §2.4, `08` §9.3), and the reveal's page is **10** — the verso the parity rule requires (`05` §2.5), since `8 | 9` is the booklet's centre spread. An earlier revision of this message put both halves of the reveal on page 9 and gave that page a 12-line capacity it does not have. (2) It called two locks on one page the only shape a hard conflict can take; the singleton case two paragraphs below is the other, and both are named above.

Every name in that message is a `reason` field, never a free paraphrase: §6.9 requires the *author's* intent to be surfaced, and a machine's description of the constraint is not the author's intent. The actions are the ones §5.4 permits — releasing a lock (a user action, recorded as an `Action`) or editing the page by hand. No action is offered that the machine could take on its own.

### 5.3 Findings emitted

| Situation | Code | Severity | Blocking |
|---|---|---|---|
| Hard conflict, no plan produced | `COMP_LOCK_CONFLICT_HARD` | critical | yes (no plan exists) |
| Frozen print plan violates a soft lock | `COMP_FROZEN_LOCK_CONFLICT` | critical | yes (render refused) |
| Soft lock violated in an unfrozen plan | `LOCK_UNSATISFIED` | major | only if the lock is S2 and scope is print |
| Essential break not honoured in digital at the max viewport | `BREAK_UNSATISFIED` | major | no |
| Essential break not honoured in print | `BREAK_UNSATISFIED` | major | **yes, for approval** (§15.2 "Explicit page breaks are preserved when feasible" is an acceptance criterion) |
| Preference break dropped | `BREAK_DROPPED_PREFERENCE` | info | no |
| Spacing adjusted beyond tolerance to satisfy a lock | `COMP_SPACING_OUT_OF_BOUNDS` | major | no (reported so the author can see how it was achieved) |
| `design_lock` token changed by an automatic operation | `DESIGN_LOCK_VIOLATED` | critical | yes |

### 5.4 Never silently resolved

Two hard rules that the implementation must assert, not merely intend:

1. No automatic process may release, weaken, or re-scope a `Lock`. The only API that changes a lock is a user action, and it appends an `Action` (§5.4 of the schema) recording who changed what.
2. No renderer may fall back to a "closest possible" plan after a conflict. A refused render emits nothing; a partial artifact that looks complete is the failure mode the whole product cannot afford.

---

## 6. Worked examples

### E1 — The spec's own page turn (§6.6)

Page N ends with *"The young shepherd reached into his bag and chose a single smooth stone."*; page N+1 begins *"With courage in his heart, David stepped forward."*

- `blk_stone` is the last block of beat 7; `blk_steps` is the first block of beat 8.
- The heuristic (05 §2.5) scores the beat-7/beat-8 boundary: `turning_point: true` on beat 8 (+3) and `emotional_direction: turn` (+3) → rank 1.
- The suggestion is stored on the `cmp_rev`. Accepting it creates an `intentional_break {before_block: blk_steps, essential: true, reason: "reveal"}` plus an `S2` lock, via one `Action`.
- On a phone at 360×640, if the surrounding beats cannot fit without splitting elsewhere, the solver may drop the break; it then emits `BREAK_UNSATISFIED` (major, non-blocking) and the reader sees the break merged — disclosed, not hidden.
- On the printed page, where the author froze it, the break is preserved or the render refuses.

### E2 — `content_lock` and a rewrite proposal

The author locks `blk_stone..blk_steps` (the reveal) as approved wording. A later "simplify for younger readers" pass covers beat 7.

- The Content Engine's proposal targets `blk_stone` → **refused at creation** with `PROPOSAL_TARGETS_LOCKED_CONTENT`, because D-11 puts the refusal where the intent is formed, not where it would land.
- The UI shows the refusal and offers "release the lock and re-run". Nothing about the manuscript changed, and no revision was created.
- The refusal is recorded on the `Proposal` document (`refusal.code`), so a reviewer can see that the AI tried and was blocked — the audit trail of §15.1.

### E3 — `keep_together_lock` vs `print_page_lock`

A keep-together group of 24 lines must stay on one page; no page in V1 can hold more than 20 (`available_lines = floor(35800 / 1728) = 20`, `05` §2.4, `08` §9.3).

- **H2 does not outrank S3 — it does not have to.** A soft lock is a cost, not a constraint (§2), so this case is not a precedence comparison at all: the `print_page_lock` removes every edge that would move its content off page 10 or add content to it (§4.4), the remaining graph still has a path — the group is composed across a break, because it cannot fit any page whole and a break costs 800 against a solve that would otherwise be impossible — and the plan *exists* with the lock simply violated.
- If the plan is **not yet approved**, this is a soft violation: `LOCK_UNSATISFIED` (major) attached to page 10, and the editor highlights the split.
- Once **frozen**, the same situation is `COMP_FROZEN_LOCK_CONFLICT` (critical) and page 10 refuses to render until the author re-opens pagination or reduces the group. This is the case that makes D-05 necessary: silently splitting text the author locked is exactly what §6.9 forbids.

### E4 — Two `print_page_lock`s on one page

Page 10 is locked for the reveal (`blk_dg_forward`); a second lock is later added, also targeting page 10, for the closing reflection (`blk_dg_reflection`).

- Both are H2; the solver finds no path — `COMP_LOCK_CONFLICT_HARD`.
- The minimal unsatisfiable subset is the two locks, and the message is the two `reason` strings only. The author releases one, and the solve proceeds. No plan was emitted at any point, so nothing to roll back.

---

## 7. API surface

```ts
// all pure, all synchronous, none may call AI
compose(input: {msRev, dsgRev, locks, beats, template, profile, target}): SolveResult
solve(input: SolveInput): {plan: PagePlan} | {conflict: LockConflict}
checkLocks(input: {plan, locks}): Violation[]
minimalConflict(input: SolveInput): LockId[]        // a minimal unsatisfiable subset of the H1/H2 locks (§5.2); never contains a soft lock
applyLock(input: {rev, lock}): CompositionRevision     // new revision + Action
releaseLock(input: {rev, lockId, by, reason}): CompositionRevision
```

`compose` is the only entry point the UI uses; `solve` exists for tests and for the conflict explainer.
