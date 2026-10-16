# Round-1 external review opinion (verbatim)

> Produced by an external review pass over this specification set before implementation, at the author's request, as the exit gate. Recorded verbatim so a later reviewer can read the primary source rather than this set's summary of it. The register's §9 records what was done about each finding.

```
VERDICT: PARTIAL — begin implementation after blockers 1–3 are fixed.
```

The set's structure is sound: the identifier schemes, the registry discipline, the D-05/D-13 reasoning and the imposition arithmetic all hold. Its central numeric claim, "one box model", is false, though. The set has three. The approval gate is defined two incompatible ways. And the reference book's own length parameters can't produce the 12 or 16 pages that §14.1 requires.

---

## BLOCKERS

**1. Three print box models, not one. The register's §4.2 closure (R-2) is wrong.** Kind (c).
- **`03` §5.2 step 3:** "The content box is the design's **declared** `layout.text_box_mm`". That gives a symmetric 96 × 148 mm box, side margins 21.85 / 21.85.
- **`08` §4.2 and §9.2:** the box loses gutter + binding on the spine side. That gives **89** × 148 mm, fore edge 21.85, spine edge 28.85.
- **`09` §7.4 (lines 909–915) and `10` §6.5:** the box stays **96** mm wide and is *shifted* 3.5 mm outward, giving fore edge **18.35** and spine edge **25.35**.
- **`10` §6.5 contradicts itself in one sentence:** it says the spine text edge is "13 mm from the trim", then computes the clear space as 2 × 25.35.
- **The register misdescribes its own fix:** it says the adopted model is "the one `09` and `10` already implement", but then tabulates `08`'s numbers (28.85, 89 mm).
- **Why it blocks:** an 89 vs 96 mm measure is a 7.9 % difference in line length. That changes line counts and page counts, and the golden numbers in `08` §9 and the `A-12`/`A-13` assertions.
- **What to do:** pick one model. I'd take `09`'s shift model, because it keeps the print measure equal to the 96/139.7 ratio the digital path uses. Then rewrite `03` §5.2 step 3, `08` §4.2 and §9.2–9.6 (width becomes 362.83 px_css; recompute words per page), the register's §4.2, and delete the "13 mm" claim in `10` §6.5 and `09` line 915. The 13 mm figure is a *floor* (C4), not a position.

**2. The approval and export gate is defined two incompatible ways (`11` §1.3–1.4 vs `12` §1.1 and §2.2).** Kind (c).
- **`11` §1.4:** "A waiver is the only mechanism by which a **blocking** major stops blocking approval."
- **`12` §1.1, property 3:** "Waivers cover **non-blocking** findings only. A blocking finding is never waivable."
- **`12`'s `EXPORTABLE` makes it worse in two ways:**
  - Conjunct 2 tests `f.blocking`, which `11` W3 says a waiver never rewrites. So a *waived* A-flagged major blocks export permanently.
  - Conjunct 3 requires every *non-blocking* waivable major to be waived. `11`'s default makes every major waivable unless it is one of seven listed codes. So `CONTENT_LENGTH_UNDER_TARGET`, digital `BREAK_UNSATISFIED` and `COMP_SPACING_OUT_OF_BOUNDS` all end up blocking approval through `OPS_APPROVAL_UNWAIVED_MAJOR`. That contradicts `11` rule B4 and D-16's "reported, not blocking".
- **It is also circular:** `11` §1.4 (line 146) lists `OPS_APPROVAL_UNWAIVED_MAJOR` itself as waivable.
- **Why it blocks:** `Finding.blocking`/`waivable` (`04` §7.2) and `deriveBlocking` (`T-QAS-007`) are Phase 1 content-validation code.
- **What to do:** adopt `11`'s rule.
  - A-flagged majors block until waived.
  - Unflagged majors block nothing.
  - Add a derived `effective_blocking = blocking ∧ ¬waived`, and have `EXPORTABLE` use it.
  - Delete `12`'s conjunct 3.
  - Make `OPS_APPROVAL_UNWAIVED_MAJOR` a refusal reason, not a waivable finding.

**3. The length model doesn't close, and the reference book misses §14.1 by its own arithmetic.** Kinds (b) and (c).
- **No minutes→words conversion exists anywhere.** D-16 turns §3.3's *minute* presets into word budgets. `04`'s example (1387 words → 7.4 min, line 172) implies about 187 wpm, but no document states a rate or how it varies by age band. `R-GEN-014` requires "reading minutes … recomputed", yet the formula is undefined.
- **The fixture's targets land on 20 pages:**
  - Inputs: `target_words` 1400 (`16`), front matter f = 4, back matter b = 3, and `08` §9.5's own ~135 words per page.
  - That gives 11 story pages, so N = 18 and M = **20**.
  - Even at the 96 mm measure (≈146 words/page) you get 10 story pages and M = 20.
  - To reach M = 16 the story must fit 9 pages, which is ≤ 1215 words at 135 words/page. 1215 is barely inside `1400 ± 15 %`.
- **`A-12` hard-codes the 16-page result** ("story pages 5–13, back matter 14–16") while `16` line 25 says page count is an output.
- **No finding fires when print pages ≠ `target_print_pages`:** `11` has only word-based findings, and the solver's `page_count_penalty` is 5 per page. A user making §18's canonical "16-page" request gets 20 pages silently.
- **D-16's justification is not honest.** It cites §1.3 "content quality takes precedence over arbitrary *word counts*" to make word counts the governing target. The spec names page count as a user target three times (§3.2, §14.1, §18).
- **I agree with half of D-16:** never pad or expand prose.
- **What to do:**
  - Derive `target_words` from `target_print_pages` at blueprint time, using measured words per page on the concrete design revision (D-13 makes that possible).
  - Register a `PRINT_PAGE_COUNT_OFF_TARGET` (major, A-flagged, waivable).
  - Define the reading-minutes formula per age band.
  - Re-set the fixture to roughly 1150–1200 words, or reduce front/back matter.
  - Make `A-12` derive page indices from the plan.

---

## MAJOR

**4. Density is defined three ways, and the solver's cost depends on it.**
- `05` §2.4 (line 148): `fill_ratio = measured_height / available_height`.
- `08` §6.1 (normative): `used_lines × 10000 > 8800 × available_lines`.
- `08` §9.4 (worked example) uses heights: 31104/35800 = 0.8688, "balanced". The `08` §6.1 rule gives 18/20 = 0.90, **dense**.
- `07` §4.3's sparse/dense penalties feed the DP, so the two definitions produce different plans.
- Fix: one definition, using heights in q as an exact rational.

**5. `07` §2's precedence is fiction for soft locks.**
- It claims "Total and strict: S1 > S2 > S3".
- The §4.3 weights invert it: beat split (S1) costs 500, keep-together (S3) 800, essential break (S2) 3000.
- The weights are per-profile, so the effective precedence varies by profile.
- D-07's rule ("same precedence, cannot both hold → `CompositionConflict`") can never fire for soft locks inside a DP.
- Fix: either use a lexicographic cost vector ordered by precedence, or state that the weights govern and drop the "strict" claim.

**6. The minimal-conflict algorithm (`07` §5.2) is wrong.**
- "Remove locks one at a time in precedence order… report the first lock whose removal restores solvability" returns *one* lock, not a set. It returns nothing when two or more removals are needed.
- §5.2's sample message lists a `keep_together_lock` (soft) inside a hard conflict, which contradicts E3.
- Fix: run a deletion-based minimal-unsatisfiable-subset search over H2 locks only.

**7. Byte-identical reproducibility has an unpinned, unnamed component.**
- `10` §8.2 forbids re-rendering, so `bookletPdf()` must place Chromium-rendered pages 2-up with a PDF library.
- `03` §5.3 doesn't name that library, D-14's manifest doesn't record it, and D-01 is silent on it.
- PDF `/CreationDate`, `/ModDate` and `/ID` handling appears nowhere, but `T-OPS-004` and `T-PRT-001` assert byte identity. I couldn't verify Chromium's metadata behaviour here.
- Fix: name and pin the library, add it to the manifest, and normalise the metadata.

**8. Traceability is linked, but often not meaningful.**
- **I agree with the T-1/T-2 closures as *linkage* closures.**
- **Most of the 121 rows added in `14` §3.23 restate the requirement with no oracle.** Examples: `T-PRT-004`, `T-PRT-007`, `T-OPS-005`.
- **They duplicate better older tests that carry no back-reference.** For example, `T-PRT-016` ≡ `T-PRT-070`, and `T-PRT-015` ≡ `T-PRT-048`.
- **Several requirements are only partly covered:**
  - `R-CMP-014` → `T-CMP-033` tests beat order only.
  - `R-CMP-016` → `T-CMP-055` covers clause 1 of 2.
  - `R-CMP-018` → `T-CMP-072` doesn't test the stored accept/reject/modify decision.
- **C7 is existence-only, which is the C2 defect one level out:**
  - `10` §5.1 says `T-PRT-048`/`049` assert "preview grid == PDF sheet map". They don't.
  - `10` §2.1 says `T-PRT-049` asserts the M % 4 refusal. It asserts only "no measurement, no AI".
  - `T-PRT-012` tests a "configured" flip edge, but `10` §4.2 says the flip edge is derived and never configured.
- **No property test asserts V2 parity**, even though `10` §3.6 calls it "the only discriminating check".

## MINOR

- **`10` §6.4 creep gate contradicts itself.** "Apply when S ≥ 6" with "either gate" means the *sheet* gate fires at M = 24. The table says M = 24 is "no", and the text says "the thickness gate bites first". It's dormant at 12/16 pages, but two implementations will diverge at M = 24.
- **`10` §6.6 table signs are wrong.** The doc's own formula with c = p gives fore = 8 − t, but the table says 8 + t. The uncompensated row is physically inverted. Dormant in V1, since t = 0.
- **`10` §6.2's "no page straddles the fold" is false for c > 0.** The panels overlap by 2c, and the doc needs a clip rule.
- **`text_box_ratio` is consumed despite being declared "never consumed".** `04` line 328, `09` line 137 and register R-4 say never consumed, but `08` line 118 and §9.6 use it as the digital content width. I dispute R-4's closure.
- **The fast path doesn't match the DP.** `07` §4.2's fast-path condition ignores the density, page-count and template penalties, which apply on every page. Greedy first-fit will diverge from the DP. `T-CMP-002`'s `blank-heavy` fixture can't catch this.
- **`08` §4.3 frame position is wrong.** It says "8.75 mm", with clearance 13.10. The correct values are 8.2646 mm (as `08` §9.2 itself says) and 13.585 mm; 0.75 pt was added as if it were 0.75 mm.
- **`08` §9.4's spacing example is wrong, though the conclusion survives.** 19.5 pt does *not* fit 22 lines: 22 × 26 px = 572 px, but only 559.37 px is available. The correct figure is ≤ 1627 q = 19.07 pt (−5.85 %). It still fits the ±6 % band, by 0.15 pt.
- **`08` §9.5–9.6 numbers are inconsistent.** "Inserting the 3 pads" should be 1. "9-page print story" contradicts s = 11 in the same section.
- **`08` §4.6 rank 2 still says "(before page 1)"** in the normative text. `10` §2.3 corrects it, but `08` was never edited.
- **`CONTENT_LENGTH_UNDER_TARGET` has two severities:** minor in `08` §4.6, major in the `11` registry.
- **`10` §3.4 V4 is a tautology.** "p and p+1 differ by exactly 1" is always true. The real facing-pair invariant isn't stated, and `10` §3.7 never asserts V4.
- **`10` §3.6's "a script was run" can't be reproduced.** No such script is in the repo. My hand check agrees with its results.
- **`09` §7.4 C5 checks something that doesn't exist.** It checks a sheet gutter, but `10` §6.2 says no gutter exists between panels.
- **The "independent" checker is weaker than the generator in two places.** `check-traceability.py` excludes `14` from C7, and its C1 uses "mentioned anywhere" rather than definition rows. Also, neither checker compares `spec/requirements.json` against `01`, which `00` §3.1 names as the owner.
- **D-08 needs a footnote, and `00` §6 overstates it.** KJV is under Crown letters patent in the UK. D-08 is a gate, not a removal: the `licenses.json` path keeps the capability.

## COSMETIC

- **The register is partly stale.** `REVIEW-RECONCILIATION` §6.3.3 still says C7 is "being closed" and the table-shape item "remains to normalise", while its §7 and the HEAD commit say both are done.
- **`10` §3.3's inverse table is ambiguous.** Rows 1–2 lack the `p ≤ M/2` qualifier, so read literally they overlap rows 3–4.

---

## THE SIX REVIEW TARGETS

| Target | Holds? | Honest? |
|---|---|---|
| **D-01** single Chromium | Yes, in principle | Yes. Two gaps: the PDF assembly library is unnamed (finding 7), and nothing says measurement runs under print-media emulation. That needs a Phase 1 spike: measure line counts and compare them with the PDF's extracted lines. |
| **D-05** frozen print, refuse to render | Yes | Yes. §9.3 step 5 ("request revision") is read correctly as re-open. I agree. |
| **D-13** composition against a real design | Yes | Yes. The cost (a design change re-paginates and stales print approval) is stated. I agree. |
| **D-16** length as words | Half | No. See blocker 3. |
| **D-08** public-domain scripture | Yes | Mostly. It's a licence gate, not a capability removal. |
| **`07` §3** scope-dependent policy | The table itself is coherent with `08` §5 and `11` | The risk of silent override sits in the solver that implements it (findings 5 and 6): weights, not precedence, decide soft-lock outcomes. |

**§16 mapping:** all 18 covering files exist and address their deliverable. Deliverable 10 (`08` Part B) carries blocker 1.

## WHAT I VERIFIED MYSELF (by hand; scripts couldn't run)

- **Imposition tables, M = 8, 12, 16:** every cell matches the `10` §3.2 formulas.
- **V1–V3 hold.** V2 holds algebraically for all i: front-left = M − 2(i−1) is even, front-right odd, back-left even, back-right odd.
- **Inverse-mapping spot checks:** p = 1, 3, 4, 9, 10, 15, 16 at M = 16.
- **Half-letter geometry:** (139.7 − 96)/2 = 21.85; (215.9 − 148)/2 = 33.95; 96/139.7 = 0.6872; 21.85 + 7 = 28.85; 139.7 − 28.85 − 21.85 = 89.00.
- **Point and pixel conversions:** 139.7 / 215.9 / 297 / 210 / 148 mm → 396 / 612 / 841.8898 / 595.2756 / 419.5276 pt. The 13.5/18, 22.5/30 and 31.5/42 pairs are exact. `09` §7.4's 1/64 values check out (1451, 23221, 1935).
- **Line capacity:** 559.37 / 27 → 20 lines. 20 × 1728 = 34560 ≤ 35800 < 36288.
- **`08` §9.4:** q arithmetic, 17 % squeeze and 16.78 pt all correct.
- **Other derived values:** the creep table and S = 21 limit, the A5 residual of 1.0 mm, and `09` §7.5's 0.057266 / 18.79 px.
- **Traceability sample:** about 45 requirement→test pairs read side by side. In every one, the named test's definition row carries the R- back-reference. 15 of 15 sampled `01` rows match the JSON, and both have 219 rows.

## WHAT I COULD NOT VERIFY

- **I couldn't run `check-traceability.py` or `gen-checklist.py --check`.** This session's permission gate blocked all script execution (even `python3 -c` and `awk`). C1 = 0 / C2 = 0 / C7 = 0 is unconfirmed by execution; my sample is consistent with it.
- **I couldn't confirm the working tree is unchanged.** `git status` was blocked too. I issued no write commands, and both script invocations were refused before they executed.
- **I read only parts of some documents:** `01`, `02`, `04`, `05`, `06`, `11`, `12`, `13`, `14` and `16` partially. I didn't open `report/index.html` or the published site.
- **Chromium behaviour:** PDF metadata determinism, and whether screen and print metrics agree, can't be tested without the pinned build.
- **Physical models:** I didn't validate the creep model (one caliper per sheet) against print practice, or a words-per-minute assumption, since none exists to check.

## THE THREE THINGS I WOULD FIX FIRST

1. **One box model** (blocker 1). Then recompute `08` §9 and the `A-12`/`A-13` numbers.
2. **One blocking/waiver rule** across `11` and `12`, with `effective_blocking` (blocker 2).
3. **Close the length model:** a page target drives the word budget, a registered page-count-off-target finding, a defined reading-minutes formula, and a fixture that can actually produce 16 pages (blocker 3).
