# Content and Composition Model

**Implements:** spec §4 (blueprint), §5 (structured generation), §6.1–6.7, §6.10, §6.11 (composition), §12.3 (single source of truth)
**Deliverables covered:** D5 (story blueprint and content model), D6 (story beat and composition model)
**Inherits:** `17-decisions-and-open-questions.md` D-04, D-05, D-06, D-10, D-11, D-12, D-13, D-16, D-18

---

## Part 1 — The content model

### 1.1 The chain

```
IDEA ──► BLUEPRINT ──► BEATS ──► BLOCKS ──► (prose) ──► MANUSCRIPT REVISION
          §4.2          §6.5      §12.2                     §12.3 SINGLE SOURCE OF TRUTH
                                                                  │
                                            ┌─────────────────────┴─────────────────────┐
                                            ▼                                           ▼
                                   COMPOSITION REVISION                        DESIGN REVISION
                                   (block IDs + rules, no prose)               (tokens + typography)
                                            │                                           │
                                            └──────────────► PAGINATION ◄───────────────┘
                                                    (digital plan, print plan)
```

Three properties fall out of this chain and are the reason for it:

1. **Prose appears exactly once**, in the manuscript revision. Composition and design cannot disagree with it because they do not hold it (§12.3).
2. **Beats are the composition currency.** Pages are assigned beats and blocks; neither renderer ever decides meaning.
3. **Every arrow is a revision boundary with a hash** (D-10), so "approved" is decidable rather than remembered.

### 1.2 What a blueprint must produce before drafting is allowed

A `StoryBlueprint` (§4.2) is *lightweight but structured*: it is the contract the prose must satisfy. Drafting is blocked until the blueprint contains, at minimum:

| Required | Why |
|---|---|
| `premise` (≤ 60 words) | §4.2 |
| `target_reader` (age range + proficiency + reading minutes) | §4.2, §3.2 |
| `opening_hook` — one sentence | §4.2 |
| `characters[]` with at least one carrying an `arc` | §4.2 (where applicable; a non-narrative devotional may have none) |
| `central_theme` — one sentence stating the lesson | §4.2, §15.1 "central lesson is clear without excessive repetition" |
| `progression[]` — ≥ 5 beats, each `{purpose, emotional_direction, blocks_expected}` | §4.2, §6.5 |
| `climax` and `resolution` present and distinct | §4.2, §15.1 "coherent beginning, progression, and conclusion" |
| **`length_model`** — the derived budget of §1.6: `{story_pages_target, capacity_lines_per_page, balanced_lines_per_page, words_per_line_measured, measure_probe_hash, words_per_page_measured, reserve_words, resolved_density_band, measured_on (dsg_rev), target_words, rate_wpm, word_tolerance, reading_minutes}` | **D-16 as amended**, §3.2 ("Target printable booklet-page count"), §14.1, §18 — the page target governs, so the word budget is a *derived* value and cannot be a free input |
| `estimated_words` inside the **one-sided** drafting band — `estimated_words ≥ (1 − word_tolerance) × target_words`, and never **above** `target_words` | D-16 as amended; §1.6 item 4 |
| `suggested_page_distribution[]` summing to the target beat count | §4.2 |

**The derived budget is a gate, not an aim (D-16 as amended).** The blueprint must contain the page-derived word budget — `target_print_pages` minus the front/back-matter pages, filled at the **resolved density ceiling** (`04` §6.1 `resolved_density_band`) with words-per-line **measured on the project's concrete design revision** (§1.6; D-13 is what makes that a measurement rather than an estimate), minus a stated reserve. Drafting is refused until it is present, for the same reason the other rows exist: a story drafted against no budget is a story that will miss the user's page target, and §3.2, §14.1 and §18 all express that target in **pages**. The failure is then reported rather than hidden: a print plan whose page count misses the target raises `PRINT_PAGE_COUNT_OFF_TARGET` (major, A; registered and owned by `11` §2.4). This document names the code and does not define it.

The blueprint is a **revision** (hashed, diffable, revertible). An AI-produced blueprint is a proposal (D-11) and the apply action is what creates the revision.

**Anti-pattern this blocks:** drafting a story first and deriving a blueprint afterwards to satisfy the workflow. The blueprint's `progression[]` is what beats are derived from, so a post-hoc blueprint produces beats that merely describe the prose instead of pacing it — which is precisely the failure §6.1 exists to prevent.

### 1.3 Beats: derivation and stability

`deriveBeats(blueprint)` (Engine B) is deterministic given the blueprint:

- one `Beat` per `progression[]` entry, in order, with a new stable `beat_` id;
- `word_budget = estimated_words × (entry.weight / Σ weight)`, default weights equal;
- `emotional_direction` copied;
- `turning_point` set from `turning_points[]` membership.

Blocks are then attached to beats **by the drafting process**, not inferred after the fact: when the Content Engine drafts a beat, the blocks it produces are created with that `beat_id` in their provenance. `Beat.block_ids` is therefore assembled from blocks, and is the authoritative span.

**Stability rules (§12.2 "stable identifiers ... so revisions do not require rebuilding all composition data"):**

- Editing a block's text does **not** change its `id`, its beat, or any page assignment. Only its `text_hash` changes.
- Splitting a block creates a new block and keeps the original's id on the first part — so a page span that referenced the original still resolves.
- Merging blocks retires all but the first id (the retired ids are recorded in the survivor's `absorbed_ids[]` so historical composition revisions remain resolvable).
- Deleting a block is a *supersede*, which is a `COMP_BLOCK_UNRESOLVED` critical finding for any composition revision that references it, forcing the composition to be re-applied rather than silently repaired.

**Why this matters:** it is what makes §15.2's "Manual composition changes survive project save and reload" true across an editorial pass. If editing prose invalidated composition, the editor would be unusable in practice.

### 1.4 Scripture content rules (§4.3)

Enforced structurally, not editorially:

| Rule | Mechanism |
|---|---|
| Distinguish scripture text from paraphrase | Block `type: "scripture"` vs `type: "paragraph"`, plus `SourceReference.quoted_text_block_ids` / `paraphrase_block_ids` |
| Preserve meaning and chronology of the source account | Beat order for a `biblical` profile must follow the `SourceReference` verse order; an out-of-order beat raises `SCRIPTURE_CHRONOLOGY_REORDERED` (major, waiverable with a recorded reason) |
| Never present invented dialogue as literal scripture | A `scripture`-type block whose text does not resolve against the registry's verse index is refused at proposal time (`SCRIPTURE_TEXT_MISMATCH`, critical). Invented dialogue must be `paragraph` + `as_paraphrase: true` on its `SourceReference` |
| Verified translations, appropriately licensed | D-08; unlicensed citation is refused |
| Flag questionable interpretations for review | `SourceReference.verification.state = flagged` + a `SCRIPTURE_INTERPRETATION_FLAGGED` finding that is blocking for export until a human sets `verified` or `disputed` with a note |
| Optional references, memory verses, prayers, discussion questions | back-matter templates `tpl_scripture_ref`, `tpl_discussion` + blocks with `role: verse` / `role: question` |

### 1.5 Editorial review as data (§5.2, D-12)

Review never returns prose. It returns `Finding`-shaped data referencing block ids:

```
{block_id, depth, layer ∈ {developmental, structural, line, copy, proof, specialized},
 issue_type, severity, message, suggestion_text?, span?}
```

Consequences:
- A suggestion with `span` can be shown inline in the editor; applying it is a `Proposal` (D-11).
- Review results are cached by `(block text_hash, depth, profile)` (D-12), so a re-review after a one-paragraph edit costs one paragraph.
- **No review layer may auto-apply.** §5.3's list of controlled revisions is a set of *user-initiated* operations; autonomy is bounded by §11.3 + D-11.

### 1.6 The length model — page target → word budget → reading minutes *(D-16 as amended)*

Three length quantities circulate in this set and the spec, and before this section nothing said which one governs. **D-16 as amended** settles it: the **page** target governs, the **word** budget is derived from it, and the **minute** figure is derived from the word count. All three are therefore computable in one direction, and none of them is authored by hand.

```
                                   §3.2 "Target printable booklet-page count"
        target_print_pages  ──┐    §14.1 "Print Length: 12 or 16 pages"      GOVERNING
                              │    §18  "Create a 16-page … storybook"
                              ▼
   story_pages_target = target_print_pages − front_matter_pages − back_matter_pages
                              │
                              │  × balanced_lines_per_page × words_per_line_measured
                              │                              ← MEASURED on the concrete dsg_rev (D-13)
                              │  − reserve_words             ← heading + forced-break slack (item 1)
                              ▼
        target_words        ──┐                                          DERIVED (05 §1.2 gate)
                              ▼
   reading_minutes = round( words ÷ rate_words_per_minute(age_band) , 1 )  DERIVED (R-GEN-014)

   pad = (4 − (f + s + b) mod 4) mod 4   ← applied ONLY at the front/back-matter boundary (§9.4, 08 §9.5)
```

**1. `target_words` is derived, at blueprint time — at the *resolved* density ceiling, minus a reserve, never at 100 % fill.**

```
target_words = story_pages_target
             × balanced_lines_per_page     ← floor(resolved_density_band.dense_above × available_height_q
                                                     / line_height_q)
             × words_per_line_measured     ← MEASURED on the concrete dsg_rev (D-13; item 6 defines the probe)
             − reserve_words               ← the heading and the forced break (below)
```

- **At the ceiling, not at capacity.** The solver's cost function exists to keep a story page inside the density band (`07` §4.3), so the page a story *actually* fills is the highest line count that still classifies as `balanced` — `floor(dense_above × available_height_q / line_height_q)` — and **not** `capacity_lines_per_page = floor(available_height_q / line_height_q)`. On the reference revision those are `16` and `20`. A budget derived at capacity (the old `9 × 20 × 7.3 = 1314`) is a budget the solver declines to place: nine 20-line pages each pay `dense_penalty` 30, while twelve 15-line pages pay `page_count_penalty` 5 apiece, so 270 loses to 20 and the plan lands on `N = 19`, `M = 20` (`07` §4.2, §4.3; the comparison is laid out in `16` §1.2.1). The same derivation at the `0.88` **default** rather than the resolved `0.78` gives 18 lines and `1248` words — which is why the single-sourcing of item 4's band, and of `04` §6.1's `resolved_density_band`, is load-bearing rather than cosmetic.
- **The reserve, and why it is 4 lines.** `reserve_words = (heading_lines + break_slack_lines) × words_per_line_measured`, rounded to whole words. The reference fixture reserves **4 lines = 31.6 `_words_`**: **2 lines** for the opening story page's heading, which precedes that page's body (the first story page is `tpl_opening`; `08` §9.4's worked page shows a heading at 2 lines), and **2 lines** for the `S2` break before `blk_dg_forward` — a page boundary the solver may not move (`07` §3), which strands whatever does not divide a whole number of balanced lines. The reserve is not padding: it is the *difference between the budget and the solver's own tipping point*. Nine balanced story pages hold `9 × 16 = 144` lines; at 145 lines the cheapest plan the DP can find is ten story pages (`page_count_penalty` 20 against `dense_penalty` 30), giving `N = 17`, `pad = 3`, `M = 20`. A budget sitting exactly on 144 lines would be one line of prose away from failing its own acceptance test.
- **`words_per_line_measured` is a measurement, defined in item 6**, taken through the same bridge that measures everything else (`08` §2, `03` §5.1) — not a nominal average, which is exactly what D-13 rejects. Because it is measured rather than assumed, a typography or paper change moves the budget instead of moving the page count. It is recorded **with the `dsg_rev` it was measured on *and* the `measure_probe_hash` it was measured from**; a new `dsg_rev` re-derives the budget. `capacity_lines_per_page` and `balanced_lines_per_page` are recorded beside it, so that a reader can see which of the two the budget used. The measurement must be taken **in the face the book ships** — `app/assets/fonts` is the single source for that face (`09` §1.7, §6) — because a count taken in any other face is a count of another book (`08` §2.6).
- **The budget is a gate.** A blueprint that carries no derived budget is refused drafting (§1.2), and the whole record — including `resolved_density_band` — is stored on the blueprint's `length_model`.
- **The line budget is split, and the prose budget is its remainder (item 7).** `story_pages_target × balanced_lines_per_page` is the **total** line budget; the beat's `role: "scripture"` displays and the headings consume lines from it, and the budget must be derived from `lines_available_for_prose`, never from the total. On the reference fixture that is `144 − 26 − 1 = 117` lines → `924 _words_`, not `1106` (item 7; `R-WIZ-017`).

**2. Reading minutes — the formula and its rate.** `R-GEN-014` requires reading minutes to be *recomputed* by validation rather than trusted; previously nothing defined what to recompute, so the requirement had no oracle. The formula is:

```
rate_words_per_minute(age_band)   ── publication-profile data (D-15), defaults below
reading_minutes = round( words ÷ rate_words_per_minute(age_band) , 1 )
```

Rounding is to one decimal place, ties away from zero — stated because the value is displayed to the author, and `MS_STATS_DRIFT` (`11` §2.1) compares two computations, so the rounding rule is part of the contract.

| Age band (`config.age_range`) | Proficiency (`config.reading_proficiency`) | Rate `_words_per_minute` | Basis |
|---|---|---|---|
| 0–5 (read aloud *to* a pre-reader) | `emerging` | **120** | **[A]** — authored, below the audiobook band, to allow for the pauses and questions a shared picture-book reading involves. Comfortable vocalised pacing is documented at 100–125 wpm for presentation delivery (Wong, *Essential Study Skills*, 2014) |
| **6–10** (the §14.1 fixture: shared read-aloud) | `early` | **150** | Audiobooks are recommended at **150–160 wpm**, "the range that people comfortably hear and vocalize words" (Williams 1998, *Proceedings of the HFES* 42nd Annual Meeting, 1447–1451). Below the continuous adult read-aloud rate measured at **184 ± 29 wpm** across 17 languages (228 ± 30 for English) — Trauzettel-Klosinski & Dietz, IReST, *Investigative Ophthalmology & Visual Science* 53(9), 2012 — which is right for a child audience with page turns |
| 11–14 (independent reader) | `developing` | **180** | **[A]** — nearer the read-aloud figure above than the adult silent band, reflecting a reader who is fluent aloud but not yet reading at adult pace |
| 15+ (adult silent reading) | `fluent` | **220** | Inside the documented silent reading-for-comprehension band of **200–230 wpm** (`17` Part B Q-09 for ratification) |

**The rate is an assumption, and it is labelled as one.** The spec supplies **no** words-per-minute rate anywhere (§3.3 gives durations; §3.2 asks for a word count), which is precisely why the old D-16 could convert a minute preset into a word budget with no arithmetic behind it. The rates above are therefore `[A]` values, not spec constants: they are **publication-profile data** (D-15), so they change without a code change, and they are recorded for Stephen's ratification as **Q-09** (`17` Part B; `13` §4.4).

**3. What this fixes in the worked example.** `04` §4.2's `stats` example carried `1387` words and `reading_minutes: 7.4`, which implies ≈187 wpm — an unstated rate, and one that is the adult *continuous* read-aloud figure (184 ± 29 above) with no child-audience allowance. It now carries the fixture's **derived budget**, `1106` words, and `round(1106 ÷ 150, 1) = **7.4**` minutes. Two things were corrected and neither is the rate: `1387` words is not `7.4` minutes at the fixture's band (`round(1387 ÷ 150, 1) = 9.2`), and `1387` is itself a budget the solver will not place in 16 pages (`176` lines → past the `144` the nine story pages hold → `M = 20`). 187 wpm is a real rate for a different reader, and choosing a rate — or a word count — to preserve a stale example would have been exactly the error this amendment removes.

**4. The band is one-sided: a floor on drafting, and nothing above the budget.** `word_tolerance` exists so drafting is not forced to hit an exact count; it cannot be widened into a licence to miss the page target, and it runs in **one direction only**:

```
lower band  (the only band):   words ≥ (1 − word_tolerance) × target_words    [fixture: ≥ 0.85 × 1106 = 940]
upper bound (not a tolerance): words ≤ target_words                            [an invariant, not a band]
```

The asymmetry is arithmetic, not editorial. Below the budget a shorter story occupies fewer balanced pages, and the shortfall is absorbed by the pad at the front/back-matter boundary, so the page count stays on target: on the reference fixture every story length from `81` to `144` lines (`640…1138 _words_`) plans to `M = 16`, because `s ∈ {6,7,8,9}` are exactly the story-page counts for which `f + s + b + pad(s) = 16` (`16` §1.2.1). **Above** the budget the mechanism reverses: the budget is already the content that fills nine *balanced* pages, so one more line pushes a tenth page in, `s = 10`, `M = 20`, and `PRINT_PAGE_COUNT_OFF_TARGET` fires. There is no "upper half of the band" that behaves like the lower one — which is why `targets.word_tolerance` (`04` §3) is a **one-sided lower band**, and why an over-length manuscript is a *reported* miss (`CONTENT_LENGTH_OVER_TARGET`) rather than an admitted one.

**Why the earlier text's minute claim was wrong.** It said that `1315` words "already needs a tenth page, `1511` an eleventh", so that both the page target **and** §14.1's "approximately 5–10 minutes" are missed. The page half is right; the minute half is not. `1315 ÷ 150 = 8.77 → 8.8` minutes, comfortably inside the window. Reading minutes are a *derived, rounded* figure, so the 10-minute ceiling is crossed only above **`1507` words** (`1507 ÷ 150 = 10.047 → 10.0`; `1508 ÷ 150 = 10.053 → 10.1`). The correct statement is narrower and more useful: **`144` balanced lines pass (`9 × 16`, ≈`1138` words) and the `145`th line fails (≈`1146` words), so the page target is the binding constraint; the minute window is crossed only above `1507` words.** The page target is therefore the binding constraint by a wide margin, and it is the one the blueprint gate and `PRINT_PAGE_COUNT_OFF_TARGET` exist to enforce.

**5. What never happens.** No prose is expanded or padded to reach a page count (§5.1); no mid-story padding is inserted (`COMP_IMPOSITION_PADDED_MIDSTORY`, `07` §5.3); the solver's `page_count_penalty` stays low deliberately (`07` §4.3) so the machine cannot buy the target by densifying pages; and an under-length manuscript is reported (`CONTENT_LENGTH_UNDER_TARGET`, major, non-blocking) for the author to resolve. This is the half of the old D-16 that survives unchanged.

**6. The reference measurement text (`measure_probe`) — what `words_per_line_measured` is measured on.** An earlier revision said only that words-per-page was "measured through the same bridge". That is not measurable as it stands: at blueprint time no prose exists, no measurement text was defined, and the figure actually carried (`146`, hence `7.3` per line) was an `[A]` value scaled from another `[A]` value (`135 × 96/89`), not a measurement at all — so D-13's argument rested on a number nothing computed. **The `7.3` that replaced `146` was likewise not a measurement, for the same reason:** it was `round(197 ÷ 27, 1)`, and no artefact in the repository produced `197 words / 27 line boxes` — the file this section names had never been created, so the figure was nominal from the day it was written. It stood until the build measured the probe for the first time. **This correction came from building the thing:** the constant survived three review rounds because every reviewer compared documents to documents, and nothing in the set measured the passage the set itself defines. The measurement is defined here instead, and the fixture now exists — and has since been taken three times, in three instruments/faces, only the last of which is the book's own type (the four generations are recorded below):

| Field | Rule |
|---|---|
| What | `measure_probe` — **one fixed passage per (language, audience band)**, version-controlled in the repository and hashed into the design revision as `measure_probe_hash` |
| Where | `fixtures/measure/probe.<lang>.<band>.txt`; for the reference fixture `probe.en.early.txt`, drawn from the **WEB** translation the fixture already cites (Q-05, D-08) so that the probe's register matches the prose and no new licence is needed |
| Provenance | WEB **1 Samuel 17:1–16**, public domain, re-derived from the source by `app/tools/measure-book.ts` (reproducible and version-controlled, not hand-typed); `measure_probe_hash = sha256:4d0bb74d435ea5a044b1817ce8ce8eef6b366fc82c7a089ae051390888f998d0`, **computable now that the file exists**, where before it was a nominal field |
| Length | a **fixed, recorded** word count `probe_words` — recorded, never authored; the fixture's probe is `197 _words_` |
| Measured how | the §2 measurement bridge (`08` §2), against the **reference page box** (`09` §1.4 — the trim at 96 dpi), because `09` §1.7's parity invariant makes that the one box at which the print and digital measures agree: half-letter's `5.5 × 8.5 in` trim with a `96 _mm_` measure → `96 × 96/25.4 = 362.8346 _px_css` = `23221/64 q` |
| The figure | `words_per_line_measured = round(probe_words ÷ probe_line_boxes, 1)`, where `probe_line_boxes` is the **height-based** line count — `round(quantise64(element.getBoundingClientRect().height) ÷ line_height_q)` — and not the number of `Range.getClientRects()` rects (those are per line *fragment*, several to a line); the fixture's probe spans **25 line boxes** → `round(197 ÷ 25, 1) = 7.880 → **7.9 _words_** per line, and the face the probe rendered in must be **asserted** before the count is taken (`08` §2.6) — `document.fonts.check()` reports an unavailable family as available and `document.fonts.load()` given a whole quoted stack resolves without loading anything, so the line count alone does not prove which face produced it |
| Fixed per | (language, audience band). A change to either is a **new probe**, hence a new `words_per_line_measured` and a re-derived budget, recorded on the blueprint's `length_model` — never patched in place (`09` §8.1). `T-WIZ-017` pins the measured figure to this file, so a probe edit that does not re-derive the budget fails loudly |

**Superseded generations, kept as history — three of them; the fourth is the value that stands.** Generation 1: `7.3` (`= round(197 ÷ 27, 1)`), `116.8` (`= 16 × 7.3`), `29.2` (`= 4 × 7.3`), `1022` (`= 9 × 16 × 7.3 − 29.2`) and the floor `869` (`= 0.85 × 1022`) — wrong because **nothing had measured the probe**: the fixture `05` §1.6 item 6 names had never been created, so nothing in the repository ever produced the `27`. Generation 2: `7.9` (`= round(197 ÷ 25, 1)`), `126.4` (`= 16 × 7.9`), `31.6` (`= 4 × 7.9`), `1106` (`= 9 × 16 × 7.9 − 31.6`) and the floor `940` (`= 0.85 × 1106`) — wrong because its `25` was taken by counting `Range.getClientRects()` **fragment** rects instead of line boxes; a line containing an inline element returns several rects. Generation 3: `8.6` (`= round(197 ÷ 23, 1)`), `137.6`, `34.4`, `1204` and `1023` — wrong because, although it used the right instrument (element height ÷ line pitch), it ran it in the **wrong face**: the harness called `document.fonts.load()` with the *whole quoted family stack*, which matches no face and resolves without loading anything, so Chromium silently rendered a fallback while `document.fonts.check()` still answered "available". Generation 4 — **the value that stands** — is `7.9`, `126.4`, `31.6`, `1106` and `940` again: right instrument, right face (`app/assets/fonts`, Lora), `197 _words_` over `25` line boxes. All four are the **same formula** with a corrected input, and only the fourth was measured in the book's own type; a corrected figure with an unchanged instrument is a defect waiting for its next opportunity (`REVIEW-RECONCILIATION` §11.3.1). The older `146`/`1314` chain (derived at 100 % page fill) is retained the same way below.

`words_per_page_measured` is then `balanced_lines_per_page × words_per_line_measured = 16 × 7.9 = **126.4 _words_**`: displayed to the author at one decimal, and **never** re-multiplied into the budget (the budget multiplies lines × words-per-line directly, so a second rounding cannot creep in). The superseded `146` is the figure at `capacity_lines_per_page` (now `20 × 7.9 = 158`), i.e. at 100 % fill; it is retained only as that capacity figure and as the record of a superseded derivation (`08` §9.5).

**The quoted scripture the length model never counted.** The reference manuscript's real line occupancy, measured per block by the height method, is **prose `122` line boxes · the two quoted verse passages (`1 Samuel 17:45–47`, `17:48–50`) `26` line boxes · headings `1` line box**. The length model of items 1 and 6 above assumes the story prose is the only thing occupying story pages, and it is not — which is the whole of item 7 below:

- **Prose plus headings is `123` line boxes** on the pre-trim measurement. That *looked* like it held the sixteen-page target only because it was compared with the whole `144`-line page; against item 7's prose allowance of `117` lines it is already `6` lines over, which is the defect item 7 fixes.
- **Prose plus headings plus the two verse passages is `123 + 26 = 149` lines** → `149 / 9 = 16.6` lines `= 0.8278` fill (against the `20`-line capacity), which is **above the resolved `dense_above` of `0.78`**, so those pages classify as **dense**.

This is the composition pass's decision, not this document's — and the build's own composition has already made it: with the verse passages laid into the story pages, the reference book composes to **20 printed pages** (story `10`, pad `3`) rather than 16, because the inlined verses push the story past the nine balanced pages the budget assumes. The alternative the templates exist to allow is that the verse passages take **their own pages** — the `quotation_page` and `scripture_reference` templates exist for exactly this, and the back matter already carries the memory verse — or the story simply needs a **tenth page and `M = 20`**, with `PRINT_PAGE_COUNT_OFF_TARGET` reported rather than absorbed. The solver measures **every block** for real rather than assuming this, and reports the density it actually finds (`app/src/paginate.ts`). Item 7 makes that a rule rather than an observation: the non-prose lines are reserved *before* the word budget is taken, so the budget the composition pass works against is the `924 _words_` prose remainder, and the twenty-page result is the arithmetic of the model rather than a surprise.

**7. The line budget is split, and the word budget must be the *prose* remainder — never the whole page.** Items 1 and 6 derive `target_words` as though prose were the only thing occupying the nine story pages. It is not: on this design a story page also carries the beat's **headings** and, on the two beats that quote scripture, a `role: "scripture"` display of the verse passage. The budget must therefore be derived from a **line-budget split**:

```
lines available                 balanced_lines_per_page × story_pages_target = 16 × 9 = 144
  reserved, non-prose           the two role:"scripture" displays              =  26
                                the opening heading + section headings         =   1
lines available for prose                                                       = 117
  ⇒ effective prose budget     lines_available_for_prose × words_per_line_measured
                                                                                = 117 × 7.9 = 924 _words_
```

The three quantities — `lines_available`, `lines_reserved_non_prose`, `lines_available_for_prose` — are recorded on the blueprint's `length_model` beside `words_per_line_measured`, and the budget is derived from the **last** of them, never from `lines_available`. (`reserve_words`, item 1, is the forced-break slack and applies on top of the prose budget; it is not the same thing as the non-prose line reservation.) The reference fixture's prose budget is therefore `924 _words_`, **not** the `1106` that item 1's total-line formula yields — the total-line arithmetic is high by exactly the `27` lines the non-prose roles occupy, which is `27 × 7.9 = 213 _words_` of prose the page never had. This is why the reference book composes to **20 printed pages rather than 16**, and why a `977`-word manuscript (the bridge's own count of the trimmed fixture prose) is still `14` lines over the nine pages: under the build's current metrics its prose alone measures `131` line boxes, and `131 + 26 + 1 = 158` against the `144` the nine pages hold. `D-16`'s "never expand prose to fill pages" is unaffected — the correction makes the budget *smaller*, never larger.

---

## Part 2 — The composition model

### 2.1 Three layers, three lifetimes (§6.10)

| Layer | What it is | Lifetime | Changes when | Spec |
|---|---|---|---|---|
| **Logical** | Beat order, intentional breaks, which beats share a page | The whole project. Never viewport- or paper-derived. | Author reorders a beat or moves a block between pages | §6.10(a) |
| **Digital** | Screen pages derived from the logical layer at a given viewport | Recomputed on any typography, viewport or content change | Freely. Count is a *range*. | §6.10(b), §7.4 |
| **Print** | Fixed physical pages, frozen on approval | Frozen at approval (D-05) | Only by an explicit `Re-open pagination` | §6.10(c), §9.3 |

The three are stored in one `CompositionRevision` (schema §5.1) so that a single hash covers "what the author intended", but they are produced by different passes and have different mutability. This is the resolution of §6.10 — the spec asks for three things that behave differently; giving them one home makes the difference explicit rather than accidental.

### 2.2 Which layer owns a given decision

| Decision | Layer | Enforced by |
|---|---|---|
| Beat A before beat B | Logical | `COMP_ORDER_CONTRADICTS_BEAT_ORDER` |
| Page break before this passage (author intent) | Logical (`intentional_breaks`) | `BREAK_UNSATISFIED` |
| This paragraph must not split across pages | Logical + lock (`keep_together_lock`) | `LOCK_UNSATISFIED` |
| How many lines of this block are on page 9 | Digital **and** Print, independently | both plans carry spans |
| Whether page 9 of the PDF holds beat 4 | Print (frozen) | `PRINT_FROZEN_OVERFLOW` |
| Whether the phone edition shows `1 Samuel 17:45` alone on a screen | Digital | measurement |

### 2.3 The initial composition pass (§6.2, made concrete)

§6.2 lists ten steps; this is what they map to.

| §6.2 step | Implementation | Deterministic? |
|---|---|---|
| 1. Analyze story structure | Read blueprint + beat list + `structural` review findings | — |
| 2. Identify logical narrative beats | `structure.deriveBeats()` (already exists); re-run only if blueprint changed | Yes |
| 3. Estimate available content space | Measure the text box for **the actual design revision** (D-13) at the reference viewport set and at the print trim | Yes |
| 4. Propose page/spread boundaries | `composition.solve()` — the single-source shortest-path DP of `07-lock-and-constraint-rules.md` §4.2 (a *plan* search, not a max-fill heuristic; there is no fast path — `07` §4.2) | Yes |
| 5. Suggest dramatic page-turn locations | `pagerun` heuristics (§2.5) | Heuristic |
| 6. Identify opening and closing pages | Template assignment rules: first story beat → `tpl_opening`; final beat → `tpl_reflective`/`tpl_closing` | Yes |
| 7. Generate an initial composition | The above, emitted as a **new `cmp_rev`** with `reason: "initial_composition"` | Yes |
| 8. Present it | Studio opens the Page Composition Editor on the new revision | — |
| 9. Allow manual modification | `move`, `split_page`, `merge_pages`, `insert_break`, … each producing a new `cmp_rev` + an `Action` | — |
| 10. Validate changes against layout and print rules | Engine F, scoped to affected pages (targeted revalidation, §12.5) | Yes |

**Cost note (§12.5):** steps 3–7 are pure functions of the revision triple. Re-running "initial composition" on unchanged inputs returns the identical revision hash, so the UI can offer "reset composition" without spending anything.

### 2.4 Density evaluation (§6.7)

Density is a function of measurement, never of word count. **One definition, as an exact rational over quantised heights** — the same expression `08` §6.1 states normatively and `08` §9.4 works numerically, so the solver's cost terms (`07` §4.3) and the worked example cannot disagree.

```
fill_ratio = measured_height_q / available_height_q     // both integers, 1/64 px_css (07 §4.5, 08 §6.1)

sparse  iff  measured_height_q × 10000 <  sparse_below × 10000 × available_height_q   // 3500 here
dense   iff  measured_height_q × 10000 >  dense_above  × 10000 × available_height_q   // 7800 here
otherwise balanced
```

- The comparison is **integer cross-multiplication of quantised heights**, never a float division: the classification decides solver costs, and two implementations must not disagree at a boundary (`T-CMP-050` pins the edge).
- `measured_height_q` is the sum of the placed line-box heights **plus** `extra_p` — ornaments, drop caps and space-before allowances, already subtracted in measurement (`07` §4.1). `available_height_q` is the content box height.
- It is a **height** ratio, not a line ratio. The two differ on the same page: `08` §9.4's example is `18 / 20 = 0.90` by lines against `31104 / 35800 = 0.8688` by height. Both read **dense** on the reference book, because its resolved ceiling is `0.78` — `31104 × 10000 = 311,040,000 > 7800 × 35800 = 279,240,000`. The height reading only looks *balanced* under the `0.88` **default token**, which is not this book's band. The box is filled with height, not with line *counts*.
- `sparse_below` / `dense_above` are the design revision's **`resolved_density_band`** (`04` §6.1) — resolved from the theme, the publication profile and the `§6.7` defaults by `09` §4.3, bound to the project's profile (D-15). **Every consumer must read the resolved band**, never the declared `layout.density_tolerance` (`0.33`/`0.80` here, a projection of the theme's own token, `09` §1.5 D-1) and never the `§6.7` default (`0.35`/`0.88`, which is the outer bound the resolution narrows within). The integer literals are `round(resolved_density_band.<threshold> × 10 000)`, written as integers because that is how the comparison is performed: `3500` and `7800` on the reference book. A classifier that used the default's `8800` would place `08` §9.4's page in the wrong class, and one that used the declared `0.80` would place it in a third — which is precisely the divergence `DESIGN_DENSITY_BAND_WIDENED` (`09` §4.3) reports.

| Classification | Condition | Notes |
|---|---|---|
| Too sparse | `measured_height_q × 10000 < 3500 × available_height_q` (resolved `sparse_below` 0.35) | not applied to `opening` / `reflective` / `reveal` pages, whose sparseness is intentional (§6.7) |
| Balanced | neither comparison holds | |
| Dense | `measured_height_q × 10000 > 7800 × available_height_q` (resolved `dense_above` **0.78**; `8800` is the `0.88` default and does not apply to this book) | `measured_height_q ≤ available_height_q` for every page that is not overflowing |
| Overflowing | `measured_height_q > available_height_q` | a hard fit failure, not a classification: the solver simply has no edge there (§2.3 step 4, `07` §4.2) |

**Contributing factors, and what they may not do.** Four further quantities are computed and shown *with* the classification (`06` §2.4), because an author who sees "too sparse" needs to know why:

```
line_factor   = used_lines / maximum_lines             // the same page viewed in lines
para_factor   = paragraph_count_normalised             // rhythm at equal length (editorial context)
visual_factor = decorative elements inside the text box (drop caps, ornaments, verses)
audience_band = profile.density_band(age_range)        // selects the thresholds above
```

None of them is a **second classification path**. `visual_factor` enters the classification through `measured_height_q`, because an ornament's space reservation is geometry-affecting and therefore measured (`09` §5); `audience_band` enters by selecting `sparse_below`/`dense_above`; `line_factor` and `para_factor` are explanatory only — they do not change a page's class. A class that depended on a factor no oracle defines would be exactly the "density from something other than measurement" failure that `COMP_DENSITY_WITHOUT_MEASUREMENT` (major, A; `11` §2.2) exists to catch.

**§6.7's suggestions** map to specific operations, and each is offered only when it is legal:

| Suggestion | Operation | Refused when |
|---|---|---|
| Redistribute text | `move` blocks between adjacent unlocked pages | target page frozen or would overflow |
| Move a paragraph | `move` | as above |
| Create a new page | `create_page` + span split | would break `print_page_lock` |
| Adjust permitted spacing | tighten/loosen within the design's tolerance band | would push another page into overflow |
| Expand an underdeveloped beat | `Proposal` to the Content Engine (AI, needs approval) | beat is `content_lock`ed |
| Condense prose | `Proposal` to the Content Engine (AI, needs approval) | as above |

**Editorial changes affecting meaning always require approval** (§6.7): the last two rows are `Proposal`s, never automatic. Spacing adjustment is the only *content-neutral* edit that may be automatic, and only inside declared bounds (`spacing_tolerance` in the design revision).

### 2.5 Page-turn storytelling (§6.6)

Page turns are **suggestions attached to blocks**, ranked by deterministic signals, with an AI rationale attached but not used for ranking:

| Signal | Detection | Score |
|---|---|---|
| Suspenseful reveal | beat boundary + `emotional_direction: turn` + a question or withheld object in the last sentence of the beat | +3 |
| Dramatic pause | beat boundary + word budget of the following beat is small | +2 |
| Change of setting | beat `purpose` contains a location change, or beat metadata flags it | +2 |
| Scene transition | beat boundary where the following beat starts a new `progression[]` grouping | +2 |
| Emotional emphasis | `emotional_direction` change of sign | +1 |
| Surprising discovery | `turning_point: true` on the following beat | +3 |
| Question followed by answer | last block of preceding beat ends with `?`, first block of following beat answers (heuristic: no `?` and shares a salient noun via a simple term overlap) | +2 |
| Quiet reflective ending | final beat + `tpl_reflective`/`tpl_closing` | +2 |

**Anti-contrivance rule (§6.6 "The system must not introduce contrived cliffhangers"):** a suggestion is **suppressed** when
- it would place fewer than `min_lines_on_page` (design, default 3) lines on the closing page of a beat, or
- it would create a page containing only one sentence that is not a `role: opening|closing` block, or
- the preceding beat has fewer than 2 blocks (nothing to suspend), or
- it would violate a `keep_together_lock`.

Suggestions are stored on the `cmp_rev` as `page_turn_suggestions[]` with `state: {accepted, rejected, modified}` — so accepting one is a recorded authorial decision (§6.6 "accept, reject, or modify"), and a rejected suggestion is not silently re-offered on the next pass.

**A page turn is not a page break, and the parity rule that separates them.** A `page_break_lock` (S2) guarantees only that a block **starts a page**. It does not guarantee that a reader has to *turn* to see it, and on any two-page presentation the difference is total: the two facing pages of a spread are visible at once, so a block that begins the **right-hand** page of a spread shares that spread with the page before it. A reveal placed there demonstrates nothing — which is exactly what happened to the reference fixture's A-07 while its reveal was pinned to `pg_dg_9`: in a 16-page saddle-stitch, `8 | 9` is the booklet's **centre spread** (`16` §4.4, `10` §3.5), so sheets 4's back shows `blk_dg_stone` and `blk_dg_forward` side by side and no page turn occurs in print or in the desktop spread view.

```
reading-order spreads:  {1} · {2,3} · {4,5} · {6,7} · {8,9} · {10,11} · …      (verso, recto)
σ(p) = floor(p / 2)   for p ≥ 2                                               the spread page p is printed on
a turn happens between p−1 and p  ⇔  σ(p) ≠ σ(p−1)  ⇔  p ≡ 0 (mod 2)
```

**Rule.** An `intentional_break` whose `reason` is a reveal must place its first block on a page whose **predecessor is not on the same spread** — i.e. on an **even** print page (a verso), `p ≡ 0 (mod 2)`, from which the reveal reads across into its recto: a **verso → recto** reveal entered by a real turn. The rule is stated on the **print page index**, not on a story-page ordinal, because the front matter shifts the parity: with `k_f` front-matter pages the story pages run `k_f+1 … k_f+s`, so an odd `k_f` makes page `k_f+1` a verso and inverts every story page's parity with it. This is the requirement `07` §6 E1's accepted break must satisfy and `16` A-07 asserts; it is checkable as `p mod 2 == 0` against `cmp_rev.print.pages`.

### 2.6 Composition locks and conflicts (§6.9)

See `07-lock-and-constraint-rules.md` for the full semantics. The composition model's obligation is only this: **a composition revision is emitted with its violations attached, never with them resolved silently.**

```
solve() -> { plan, violations: [ {lock_id, code, page_id, magnitude} ] }
```

If `violations` contains anything of severity `critical`, the plan is not emitted as a revision at all — the solve fails, and the UI shows the conflict for the author to resolve. This is §6.9's "the system must identify the conflict rather than silently overriding the author's intent", implemented as a refusal rather than a warning.

### 2.7 Composition approval (§6.11)

Approval scopes in §6.11 map to revision pointers, and each scope has an explicit invalidation trigger:

| Approved thing (§6.11) | Bound to | Invalidated by |
|---|---|---|
| Complete manuscript | `ms_rev` | any new `ms_rev` |
| Story beat order | `ms_rev.beat_order` | reordering beats |
| Preferred page-turn locations | `cmp_rev.logical.intentional_breaks` | adding/removing a break |
| Digital reading composition | `cmp_rev.digital` + the reference viewport set | typography or viewport-set change |
| Fixed print composition | `cmp_rev.print` (frozen) | `Re-open pagination` only |
| Visual design | `dsg_rev` | any token change; may invalidate print pagination (D-13) |
| Final rendered previews | `val_rev` + artifacts | any of the above, plus browser/engine change |

Invalidation is **targeted, not total** (§12.5 "targeted revalidation", §6.11 "Changes that invalidate an approval should trigger targeted revalidation"):

| Change | Revalidate |
|---|---|
| One block's text | that block's page(s), digital + print; content validators for that block only |
| Typography size | all pages of the affected plan (geometry is global), content validators not re-run |
| One lock | pages containing the locked scope only |
| Front matter | print pages 1..k and the total page count parity check |

The `Approval` record is set to `stale` with a `stale_reason` naming which pointer moved (schema §7.3); it is never deleted and never silently re-validated into `approved`.

---

## Part 3 — Invariants and where they are checked

| # | Invariant | Validator | Severity |
|---|---|---|---|
| 1 | Composition contains no prose | `COMP_REVISION_CONTAINS_PROSE` | critical |
| 2 | Every `ms_rev` block is on exactly one page of each plan | `COMP_BLOCK_LOST`, `COMP_BLOCK_DUPLICATED` | critical |
| 3 | Every referenced block resolves in `ms_rev` | `COMP_BLOCK_UNRESOLVED` | critical |
| 4 | Beat order is a permutation and page order does not contradict it | `COMP_ORDER_CONTRADICTS_BEAT_ORDER` | major |
| 5 | Essential breaks honoured in print; honoured in digital at max viewport or reported | `BREAK_UNSATISFIED` | major / critical (print) |
| 6 | Print page count is a multiple of 4 | `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | critical |
| 7 | Only front/back matter was padded (D-16) | `COMP_IMPOSITION_PADDED_MIDSTORY` | major |
| 8 | Blank pages have a recorded reason | `COMP_BLANK_UNINTENDED` | major |
| 9 | No page overflows its measured box (digital or print) | `*_PAGE_OVERFLOW` | critical |
| 10 | No text is clipped by any renderer | `*_TEXT_CLIPPED` | critical |
| 11 | Lock violations are attached, not hidden | `LOCK_UNSATISFIED` | major/critical by lock type |
| 12 | Rejected page-turn suggestions are not re-offered | `COMP_SUGGESTION_REOFFERED` | minor |
| 13 | Spacing adjustments stayed inside tolerance | `COMP_SPACING_OUT_OF_BOUNDS` | major |
| 14 | Stats (words, reading time) match derived values | `MS_STATS_DRIFT` | info |
| 15 | Print page count equals `target_print_pages` **after** the pad-to-a-multiple-of-four step | `PRINT_PAGE_COUNT_OFF_TARGET` (`11` §2.4 — named here, never defined here) | major (A, waivable) |
| 16 | Density class was derived from measurement, not from a word or character count | `COMP_DENSITY_WITHOUT_MEASUREMENT` | major |

Invariant 15 is the length model's closure (D-16 as amended, §1.6): invariant 6 makes the booklet *imposable* and invariant 15 makes it the book the user asked for; neither implies the other, which is why both exist. Invariant 16 is why §2.4 has exactly one classification expression.

Invariants 2, 4, 5, 6, 11 are the load-bearing ones: they are what make the claim "the HTML book and the printed book contain the same story" checkable rather than aspirational.
