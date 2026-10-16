# Reference Story Acceptance Tests

**Implements:** spec §14 (§14.1 reference project, the 18 required demonstrations), §15.1–§15.5 (V1 acceptance criteria), §4.3 (biblical content validation), §9.1–§9.5 (print layout and booklet engine), §10.1 (content validation), §6.6 (page-turn storytelling)
**Deliverable covered:** D18 (per §16 — "Initial reference-story acceptance tests")
**Inherits:** `docs/00-README.md` (§3 identifier schemes, §4 conventions), `docs/04-project-data-schema.md` (entities, §4.5 `SourceReference`, §5.1 `CompositionRevision`, §7.3 `Approval`, §7.4 `Artifact`), `docs/05-content-and-composition-model.md` (§1.4 scripture, §2.3 initial pass, §2.5 page turns, Part 3), `docs/07-lock-and-constraint-rules.md` (§2–§5, §6 E1–E4), `docs/08-pagination-strategy.md` (§3–§4, §9), `docs/09-design-token-architecture.md` (§1.7 parity, §5, §7), `docs/10-booklet-imposition-spec.md` (§3, §6, §7, §10), `docs/11-validation-strategy.md` (§2 the finding registry — **the only source of finding codes used here**), `docs/12-approval-and-versioning-workflow.md` (§1 export predicate, §3 freeze, §6 manifest, §8 manual proof), `docs/13-incremental-roadmap.md` (§3 phases, §7 vertical-slice mapping), `docs/14-test-plan.md` (§3 test catalogue, §4 fixtures), `docs/17-decisions-and-open-questions.md` (D-01…D-19, Part C)

> **Status.** This document is the owner of the acceptance ids `A-01`…`A-18` (`docs/00` §3.2). It turns spec §14's 18 required demonstrations into **checkable observations** against one fixed fixture — the David and Goliath reference book — so that a reviewer can run the list against a real build and get an unambiguous pass/fail on every row. It writes no implementation, no story prose, and mints no finding code (`docs/11` owns every code; an unregistered code is `OPS_REGISTRY_CODE_UNKNOWN`).

> **The two corrections this document exists, in part, to hold.** (1) Spec §14 demonstration 18 is acceptance id **A-18**, a **manual proof** recorded on `Approval.manual_proof` (`docs/04` §7.3, `docs/12` §8), **excluded from every automated gate** (`docs/17` Part C; `docs/13` §9). (2) **D-16 is length targeting** (`docs/17` Part A) and has nothing to do with the manual proof. **D-16 is amended:** `target_print_pages` is the **governing** length target, and the fixture's `target_words` is **derived** from it at blueprint time from words-per-page measured on the concrete design revision. §1.2 shows that arithmetic landing on 16 pages; a print plan that misses the target after padding is `PRINT_PAGE_COUNT_OFF_TARGET` (`docs/11` §2.4), not a silent 20-page book.

---

## 1. The reference project specification

Spec §14.1's benchmark, restated as the **concrete configuration the fixture must have**. The fixture lives **inside the repo** at `fixtures/david-and-goliath/` as the acceptance fixture (Q-06 recommended default; `docs/14` §4.1), because §15.4's print criteria are only testable against a fixed book.

### 1.1 Benchmark (§14.1) → fixture configuration

| §14.1 benchmark statement | Fixture field(s) | Value | Basis |
|---|---|---|---|
| Title **"David and Goliath — A Story of Courage and Faith"** | `title_working`, `BookMetadata.title`, `.subtitle` | `David and Goliath`, `A Story of Courage and Faith` | §14.1; `docs/04` §3, §3.2 |
| **Ages 6–10** | `config.age_range`, `config.reading_proficiency` | `{min: 6, max: 10}`, `early` | §14.1; `docs/04` §3.1 |
| **Reading duration ≈ 5–10 minutes** | `targets.reading_minutes_min` / `_max` | `5` / `10` | §14.1; `docs/04` §3 |
| **Bible story** | `config.publication_type`, `config.profile`, `config.length_preset` | `biblical`, `childrens_bible`, `bible_story` | §2.2, §14.1; D-15; `docs/04` §3.1 |
| **Print length: 12 or 16 pages incl. front/back matter** | `targets.target_print_pages` = **`16`** — the **governing** length target (D-16 as amended); `cmp_rev.print.page_count` remains an output *of the solve*, and a miss is reported, never repaired | asserted properties: `print.page_count == 16` **and** `% 4 == 0`; `PRINT_PAGE_COUNT_OFF_TARGET` absent | §14.1, §9.4; D-16 as amended; `docs/04` §3, §5.1; `docs/11` §2.4 |
| **Standalone responsive fullscreen HTML** | `Artifact.kind = html_storybook`; standalone, offline from `file://` | — | §7.1, §15.3; D-19 |
| **Desktop two-page open-book where space permits** | digital spread at `≥ 1024 × 768` | spread at `1280×800`, `1440×900`; single below | §7.1; `docs/08` §3.2 |
| **Mobile single-page reading mode** | single-page at `360×640`, `414×896`, `768×1024` | — | §7.1; `docs/08` §3.1 |
| **Warm paper appearance, refined typography, consistent decorative borders** | theme `warm_parchment`; `layout.border` | theme 5 (§8.2); `double_rule`, `0.75 pt`, `offset_mm 8`, `#8a6f47`, `square` | §14.1, §8.2, §9.2; `docs/09` §4.1, §7.1 |
| **Configurable page-turn effect** | `motion.transition_style`, `reader_overrides` | from `{curl, fold, slide, fade, instant}`; reduced-motion honoured | §6.6, §7.2; `docs/04` §6.1 |

### 1.2 Length target — **the page target governs; the word budget is derived from it (D-16 as amended)**

The fixture's length target is **16 print pages including front and back matter** (§14.1). `target_words` is not chosen; it is the number of words that fills nine story pages of this design revision **at the ceiling of the resolved density band, less a reserve**, and §1.2.1 shows the arithmetic — including the check against the solver's own cost function, because a budget derived by division alone is one the solver may refuse to place. The formula and the reading-minutes rate are in `docs/05` §1.6.

| Field | Value | Basis |
|---|---|---|
| `targets.target_print_pages` | **`16`** — the governing target | §14.1, §18; D-16 as amended; `docs/04` §3 |
| `front_matter_pages` `f` | **`4`** — title, copyright, dedication, contents | §3.2; `docs/08` §4.5; §1.3 below |
| `back_matter_pages` `b` | **`3`** — memory verse, discussion questions, about/closing | §3.2, §4.3; `docs/08` §4.5; §1.3 below |
| `story_pages_target` `s` | **`9`** = 16 − 4 − 3 (derived) | D-16 as amended; `docs/05` §1.6 |
| `capacity_lines_per_page` | **`20`** = `floor(35800 / 1728)` — the page at 100 % fill (`docs/08` §9.3) | `docs/08` §9.3 |
| `balanced_lines_per_page` | **`16`** = `floor(0.78 × 35800 / 1728)` — the ceiling of the **resolved** density band | `docs/04` §6.1 `resolved_density_band` (`0.35 / 0.78`); `docs/09` §4.3; `docs/08` §6.1 |
| `words_per_line_measured` | **`7.9 _words_`** per line — measured by the §2 bridge on the fixed `measure_probe` (`197 _words_` over **25** line boxes, the element height ÷ the line pitch in the **shipped face**, the face asserted — `docs/08` §2.6.1; **not** the `getClientRects()` fragment-rect count) | measured; `docs/05` §1.6 item 6 |
| `words_per_page_measured` `w_p` | **`126.4 _words_`** = 16 × 7.9 — what one story page holds *at the band*. (The superseded `146` was `20 × 7.3` and `137.6` was `16 × 8.6`; both figures are retained as history — `docs/05` §1.6 item 6) | measured; `docs/05` §1.6 items 1 and 6 |
| `reserve_words` | **`31.6 _words_`** = 4 lines × 7.9 — 2 lines for the opening story page's heading, 2 at the `S2` break (`34.4` = 4 × 8.6 is superseded, kept as history) | `docs/05` §1.6 item 1 |
| `targets.target_words` | **`1106`** = 9 × 16 × 7.9 − 31.6 — **derived**, never authored (`1204` = 9 × 16 × 8.6 − 34.4 is superseded, kept as history) | D-16 as amended; `docs/05` §1.6 |
| `targets.word_tolerance` | `0.15` — a **one-sided lower** drafting band: `words ≥ 0.85 × 1106 = 940`; nothing **above** `target_words` is tolerated (`1023` = 0.85 × 1204 is superseded) | `docs/04` §3; `docs/05` §1.6 item 4 |
| `targets.target_beats` | `11` | `docs/04` §3; `docs/14` §4.1 |
| Derived reading time | `round(1106 ÷ 150, 1) = **7.4 minutes**` — inside §14.1's "approximately 5–10 minutes" (`round(1204 ÷ 150, 1) = 8.0` is superseded) | `docs/05` §1.6 (the 6–10 band's 150 `_words_per_minute_`) |
| The binding constraint | the **page** target is missed above `1138` words — `144` balanced lines pass (`9 × 16`), the `145`th fails; §14.1's minute window only above `1507` (`1238` = 144 × 8.6 is superseded) | `docs/05` §1.6 item 4 |
| Under-length manuscript | reported as `CONTENT_LENGTH_UNDER_TARGET` (major, non-blocking) for the author to resolve — **text is never expanded to fill pages** | D-16 as amended; §5.1 |
| Pages | an **output** of the solve, not of the word count; mid-story padding is forbidden (`COMP_IMPOSITION_PADDED_MIDSTORY`); a miss after padding is `PRINT_PAGE_COUNT_OFF_TARGET` (`docs/11` §2.4) | D-16 as amended; `docs/08` §4.6 |

#### 1.2.1 The arithmetic, including the solver's own decision and the pad-to-four step

`target_words` is not divided out of a words-per-page figure. It is derived **at the ceiling the density band actually allows**, and then checked against the solver's cost function (`docs/07` §4.2–§4.3), because a budget that fills a page past the band is one the solver will not place. Five quantities are involved:

```
content-box height  available_height_q      = 559.375 px_css × 64                  = 35800 q   (docs/08 §9.2)
line pitch          line_height_q           =  27.000 px_css × 64                  =  1728 q   (docs/08 §9.3)
capacity            capacity_lines_per_page = floor(35800 / 1728)                  =    20 lines (100 % fill)
resolved band       resolved_density_band    = 0.35 / 0.78                           (docs/04 §6.1; docs/09 §4.3)
balanced ceiling    balanced_lines_per_page = floor(0.78 × 35800 / 1728)            =    16 lines  ← not 20
                     16 × 1728 = 27648 ≤ 27924 = 0.78 × 35800 < 29376 = 17 × 1728
words per line      words_per_line_measured = 7.9                                   (docs/05 §1.6 item 6)
```

```
target_words = story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words
             = 9 × 16 × 7.9 − 31.6      = 1137.6 − 31.6      = 1106.0 → 1106 _words_   (= 140 balanced lines)

pad = (4 − (f + s + b) mod 4) mod 4 = (4 − (4 + 9 + 3) mod 4) mod 4 = (4 − 16 mod 4) mod 4 = 0
N   = f + s + b + pad = 4 + 9 + 3 + 0 = 16        M = N = 16,  16 % 4 = 0 ✓
```

**⇒ 16 print pages, with no padding inserted at all.** Front matter occupies pages `1..4`, the nine story pages immediately follow, back matter closes — and `PRINT_PAGE_COUNT_OFF_TARGET` is absent.

**Why the *solver* agrees — the step a division by a words-per-page figure cannot make.** `1106` words is `140` lines. The DP of `docs/07` §4.2 partitions those 140 lines and pays, per story page, `dense_penalty` 30 above the resolved ceiling and 5 for each page beyond the 16-page target (`M = 20` costs `4 × 5 = 20`):

| story pages `s` | least dense pages needed to hold 140 lines | `dense_penalty` | `M` | `page_count_penalty` | total |
|---|---|---|---|---|---|
| 7 | 7 (all at the 20-line capacity) | 210 | 16 | 0 | **210** |
| 8 | 3 (`128 + 4 × 3 ≥ 140`) | 90 | 16 | 0 | **90** |
| **9** | **0** (`9 × 16 = 144 ≥ 140`) | **0** | **16** | **0** | **0** ← the DP's plan |
| 10 | 0 (`10 × 16 = 160 ≥ 140`) | 0 | 20 | 20 | **20** |
| 11 | 0 | 0 | 20 | 20 | **20** |
| 12 | 0 | 0 | 20 | 20 | **20** |

Nine story pages is the unique zero-cost plan, and a tie would go to the fewest pages anyway (`docs/07` §4.2). `M = 16`, `PRINT_PAGE_COUNT_OFF_TARGET` absent.

**The 100 %-fill budget did not — the defect this replaced.** `9 × 146 = 1314` words is `180` lines. Each of its nine full pages is `34560 q`, and `34560 × 10000 = 345,600,000 > 279,240,000 = 7800 × 35800`, so every one is **dense**: nine pages cost at least `9 × 30 = 270`. Twelve 15-line pages (`180 = 12 × 15`, each `25920 q` and balanced) pay `M = 20`'s four extra pages at `4 × 5 = 20`:

```
9 × dense_penalty 30 = 270        vs        12-page plan: 4 × page_count_penalty 5 = 20
⇒ the DP takes 12 story pages:  N = 4 + 12 + 3 = 19,  pad = 1,  M = 20,  PRINT_PAGE_COUNT_OFF_TARGET fires
```

So the old budget was arithmetically correct **and impossible under the set's own solver**: it assumed 100 % page fill, and the cost function exists to prevent exactly that (`docs/07` §4.2–§4.3; `REVIEW-RECONCILIATION` §8.2). The identical derivation at the **`0.88` default** rather than the resolved `0.78` gives `9 × 18 × 7.9 − 31.6 = 1248` words (`158` lines), which also plans to 16 — eight pages would need four dense ones (`120`), ten pay `20`. The *verdict* is insensitive to the band; the *number* is not. That is why the band is single-sourced in `docs/04` §6.1 and the budget is derived from the **resolved** one.

**A shorter draft still lands on 16 — but only above 81 lines.** Because `pad` absorbs up to three pages *at the front/back-matter boundary only*, `s ∈ {6, 7, 8, 9}` all give `M = 16` (`N = 13…16`, `pad = 3…0`). Two arithmetic consequences follow, and they are what make the tolerance band **one-sided** (`docs/05` §1.6 item 4):

- **Below** the budget the plan stays on target down to `81` lines (`697 _words_`); at `80` lines or fewer the DP fits the story in five balanced pages, `M = 12`, and the target is missed in the other direction. `word_tolerance`'s floor — `0.85 × 1106 = 940` words = `119` lines — sits well inside that window, so the lower band costs nothing.
- **Above** the budget nothing is forgiven: `1106` words already fills nine *balanced* pages, so the very next line pushes a tenth page in (`s = 10`, `M = 20`). The DP's tipping point is the `145`th line: `144` balanced lines pass (`9 × 16` = 144 × 7.9 ≈ `1138` words) and `145` fail (145 × 7.9 = 1145.5 ≈ `1146` words). A-02 and `docs/14` §4.1's fixture row must therefore assert the band **from below only**.

**The measured figure, and the chain it replaces — corrected three times.** An earlier revision recorded `w_p = 146` as "measured", with the derivation `135 × 96/89 = 145.6 ≈ 146` — an `[A]` value scaled from another `[A]` value, and no text to measure at blueprint time. It is replaced by `docs/05` §1.6 item 6's `measure_probe`: a fixed, version-controlled passage per (language, audience band), measured through the §2 bridge at the reference page box. Three generations of the measurement were wrong, each for its own reason (all four are recorded in `docs/05` §1.6 item 6). The documents' `7.3` was `round(197 / 27, 1)` — nothing in the repository produced the `27`, because the probe file did not exist until the build measured it. The first *real* measurement of that file, `7.9 = round(197 / 25, 1)`, counted line **fragments** rather than lines — a line holding an inline element yields several rects — so it over-reported. The correction to `8.6`, taken by the right instrument (the element's height divided by the line pitch, **not** the `Range.getClientRects()` rect count — `docs/08` §2.2), was measured in the **wrong face**: the harness never loaded the design's font, so Chromium rendered a fallback. Measured at last in the shipped face (`app/assets/fonts`, Lora) the probe is `197 _words_` over **`25`** line boxes, so `words_per_line_measured = round(197 / 25, 1) = 7.9`, and the face is now **asserted** by comparing widths against an absent family (`docs/08` §2.6.1). The manuscript's own prose measures `1008 / 122 = 8.26` words/line — near the probe's `7.88`, and far from the superseded `7.3`. The budget stays robust to a change of measure in the way the old chain claimed to be, and for the right reason: `balanced_lines_per_page` is a function of the band and the box *height*, not of the measure, so a narrower measure moves `words_per_line` and the budget together and leaves `M = 16`.

**The quoted scripture is not in the length model, and it forces a line-budget split (`R-WIZ-017`).** The reference manuscript's measured line occupancy is prose `122` line boxes, the two quoted verse passages (`1 Samuel 17:45–47`, `17:48–50`) `26` line boxes, and headings `1` line box. §1.2's formula treats the nine story pages as if prose were the only thing on them, and it is not — so the budget must be derived from a **line-budget split**: `lines_available = 16 × 9 = 144`, less `26` scripture lines and `1` heading line, leaves `117` lines for prose, so the effective prose budget is `117 × 7.9 = 924 _words_`, **not** the `1106` the total-line formula yields (`docs/05` §1.6 item 7; `T-WIZ-018`). And the pages that carry the verses classify as **dense**: prose plus headings plus the verses is `123 + 26 = 149` lines → `149 / 9 = 16.6` lines `= 0.8278` fill against the `20`-line capacity, **above the resolved `dense_above` of `0.78`**. This is the **composition pass's decision, not this document's** — and the build's own composition has already made it: with the verse passages inlined into the story the reference book composes to **20 printed pages (story `10`, pad `3`)** rather than 16, and a `977`-word manuscript is still `14` lines over. The alternative the templates exist to allow is that the verse passages take **their own pages** — the `quotation_page` / `scripture_reference` templates exist for exactly this, and the back matter already carries the memory verse — or the story needs a **tenth page and `M = 20`**, with `PRINT_PAGE_COUNT_OFF_TARGET` reported rather than absorbed. The solver measures every block for real (`docs/05` §1.6) rather than assuming this.

### 1.3 Design theme, paper preset, matter

| Item | Value | Basis |
|---|---|---|
| Theme | `warm_parchment` (theme 5): `Lora` body `13.5 pt`/`18 px_css`, `Lora` heading `22.5/30`, `Cinzel` display `31.5/42`; `line_height` body `1.5` | §8.2, §14.1; `docs/09` §4.1 |
| `lang` / `hyphenation` | `en` / `en-us` — **part of the pagination input** (D-04) | `docs/04` §3.1, §6.1; `docs/17` Part C |
| Paper (`layout.paper`) | `half_letter`; trim `139.7 × 215.9 _mm_` | §9.1; `docs/08` §4.1 |
| `layout.paper_fit[]` | `["half_letter","a5"]` (Q-04 ships both) | `docs/04` §6.1; Q-04 |
| `text_box_mm` | `{width: 96, height: 148}` (declared, symmetric) → margins derived (side `21.85`, head=foot `33.95`); `text_box_ratio` derived = the **exact rational `96/139.7`** — never the 4-decimal `0.6872`, which is one quantum off at the reference box | `docs/04` §6.1; `docs/08` §4.2, §9.6 |
| `safe_area_mm` / `gutter_mm` / `binding_allowance_mm` | `6` / `4` / `3` | §9.1, §9.2; `docs/04` §6.1 |
| `reader_overrides` | `{font_scale: true, theme: ["light","sepia","dark"], line_height: false}` | §7.3; `docs/04` §6.1 |
| `front_matter[]` | `["title","copyright","dedication","contents"]` (4 pages) | §3.2; `docs/08` §4.5 |
| `back_matter[]` | `["memory_verse","discussion_questions","about"]` (3 pages) | §3.2, §4.3; `docs/08` §4.5 |

`front_matter[]` and `back_matter[]` are the two terms that fix `story_pages_target = 16 − 4 − 3 = 9` (§1.2.1). **The fixture does not shorten them to reach 16 pages.** The external review offered two ways out — "roughly 1150–1200 words, *or* fewer matter pages" — and the first was taken, in its derived form (which lands at `1106`, at the foot of the reviewer's indicative range), because a word budget computed from the page target is arithmetic whereas deleting a required section (a memory verse, the discussion questions) is a content decision the author has to make. `§1.4`'s scripture requirements and §3.2's matter list stay intact.

### 1.4 Scripture-translation constraint

| Rule | Fixture value | Basis |
|---|---|---|
| Public-domain translations only; a copyrighted translation is **refused** without a matching licence entry | translation registry key **`web`** (World English Bible) — Q-05 recommended default | **D-08**; §4.3; Q-05 |
| `scripture/registry.json` must contain `web` | present | D-08; `docs/04` §8 |
| `licenses.json` must carry the `web` entry (`kind`, identifier, scope) | present | D-08; `docs/04` §8; `OPS_LICENSE_MISSING` |
| Citation | `1 Samuel 17` (fixture quotation `17:38-51`; optional memory verse `17:45`) | §4.3; `docs/04` §4.5 |

### 1.5 The entity / revision set the fixture must contain

Every prefix below is from `docs/04` §2 and §3.3 of `docs/00`. This is the fixture's **mandatory inventory**; a missing entity is a failure of the fixture, not of a single acceptance row.

| Entity | Canonical prefix (content-hash where noted) | Fixture count (expected) | Produced at |
|---|---|---|---|
| `Project` / `ProjectConfig` / `BookMetadata` | `prj_` | 1 | project creation |
| `Block` | `blk_` | ≈ 120 | `docs/08` §8 workload note |
| `ManuscriptRevision` | `ms_` (sha256) | ≥ 3 (draft, post-review, approved) | drafting / review |
| `StoryBlueprint` | content hash | 1 | A-01 |
| `Beat` | `beat_` | 11 | A-03 (`deriveBeats`) |
| `SourceReference` | `srcref_` | 1 (`srcref_dg_1sam17`) | scripture setup |
| `CompositionRevision` | `cmp_` (sha256) | ≥ 5 (initial + each A-06…A-09 edit) | A-04…A-09 |
| `Page` | `pg_` | 16 | print pagination |
| `Lock` | `lck_` | ≥ 3 (content, print-page, essential break) | A-07, A-08 |
| `Action` | `act_` | ≥ 4 | one per composition edit |
| `DesignRevision` | `dsg_` (sha256) | ≥ 2 (creation default, `warm_parchment`) | project creation / A-09 |
| `PageTemplate` | `tpl_` | the 10 §6.8 presets resolved by the design | Phase 5 |
| `Proposal` | `prop_` | ≥ 2 (blueprint, draft) | A-01, A-02 |
| `ValidationReport` / `Finding` | `val_` (sha256) / `find_` | ≥ 3 (content, digital, print scopes) | each validation |
| `Approval` | `apr_` | 1 governing | A-17 |
| `Artifact` | `art_` | 5 (`html_storybook`, `reading_pdf`, `booklet_pdf`, `proof_sheet`, `print_guide`) | A-10…A-16 |
| `Job` | `job_` | ≥ 1 per render | renders |
| `LicenseEntry` | `(kind, identifier)` | `web` + each font | `licenses.json` |

### 1.6 Fixture vocabulary — block, beat, page and lock placeholders

Real ids are ULIDs or content hashes (`docs/04` §2). This document uses **symbolic placeholders** so a criterion can name a specific object; the fixture's `FIXTURE.lock.json` (`docs/14` §4.3) binds each placeholder to its real id. A reviewer substitutes via that manifest. No placeholder is an id in the project.

| Placeholder | Kind | What it is | Beat / page (expected) | Basis |
|---|---|---|---|---|
| `blk_dg_title` | block `heading` | title-page heading | `pg_dg_1`, `tpl_title` | §6.8 |
| `blk_dg_dedication` | block `paragraph` | dedication line | front matter | §3.2 |
| `blk_dg_hook` | block `paragraph`, `role: opening` | opening hook | `beat_dg_1` | §4.2 |
| `blk_dg_goliath_taunt` | block `paragraph` | the taunt (paraphrase) | `beat_dg_3` | §6.6 |
| `blk_dg_david_volunteers` | block `paragraph` | David volunteers (invented dialogue, paraphrase) | `beat_dg_5` | §4.3 |
| `blk_dg_saul_armour` | block `paragraph` | Saul's armour (invented dialogue, paraphrase) | `beat_dg_6` | §4.3 |
| **`blk_dg_stone`** | block `paragraph` | last block of `beat_dg_7` — the spec's own sentence *"The young shepherd reached into his bag and chose a single smooth stone."* | `beat_dg_7`, on the **recto** `pg_dg_9` — the last page before the turn | §6.6 |
| **`blk_dg_forward`** | block `paragraph`, `role: opening` | first block of `beat_dg_8` — *"With courage in his heart, David stepped forward."* | `beat_dg_8`, **opens the verso `pg_dg_10`** after the break — reached only by a page turn | §6.6; §2 A-07 |
| `blk_dg_giant_falls` | block `paragraph`, `role: climax` | climax | `beat_dg_9`, `tpl_reveal` | §6.8 |
| **`blk_dg_verse`** | block **`scripture`** | WEB `1 Samuel 17:45` (verbatim) | quotation / `tpl_scripture_ref` | §4.3; D-08 |
| `blk_dg_verse2` | block **`scripture`** | WEB `1 Samuel 17:47` (verbatim) | back matter | §4.3 |
| `blk_dg_reflection` | block `paragraph`, `role: reflection` | closing reflection | `beat_dg_11`, `tpl_reflective` | §6.8 |
| `blk_dg_lesson` | block `paragraph`, `role: lesson` | stated lesson | closing | §3.2 |
| `blk_dg_memory_verse` | block `scripture`, `role: verse` | memory verse | back matter | §4.3 |
| `blk_dg_discussion_q1` | block `paragraph`, `role: question` | discussion question | back matter, `tpl_discussion` | §4.3 |
| `blk_dg_about` | block `paragraph` | about/closing | back matter | §3.2 |
| `beat_dg_1` … `beat_dg_11` | `beat_` | the 11 story beats | — | D-16; §6.5 |
| `pg_dg_1` … `pg_dg_16` | `pg_` | the 16 print pages | **derived from the plan, never hard-coded**: the first `k_f` pages are front matter, the next `s` are story, the remainder are back matter, with `k_f + s + k_b + pad = M = 16` (§2, A-12 criterion). At this fixture's parameters that is front `1–4`, story `5–13`, back `14–16` — an arithmetic *consequence* of `f = 4, s = 9, b = 3`, not an assertion | D-16 as amended; §1.2.1; `docs/04` §5.2 |
| `lck_dg_content_reveal` | `content_lock` | locks wording of `blk_dg_stone` … `blk_dg_forward` | H1 | §6.9; `docs/07` §2 |
| `lck_dg_print_reveal` | `print_page_lock` | freezes `blk_dg_forward` onto **`pg_dg_10`** — the **verso** the parity rule requires (`docs/05` §2.5). It is *not* `pg_dg_9`: `8 | 9` is the 16-page booklet's **centre spread** (`§4.4`), where both pages are visible at once and no turn occurs | H2 | §6.9; `docs/07` §2, E1; §2 A-07 |
| `lck_dg_break_reveal` | `page_break_lock` (`essential: true`) | break before `blk_dg_forward` | S2 | §6.6; `docs/07` §2 |
| `srcref_dg_1sam17` | `srcref_` | the 1 Samuel 17 source reference | — | §4.3; `docs/04` §4.5 |

---

## 2. The acceptance table — `A-01` … `A-18`

One row per required demonstration, in spec §14's order. **Layer** is one of `unit | golden | visual | integration | manual` (`docs/14` §2). **Finding codes that must be absent** are registered codes (`docs/11` §2); their *presence* fails the row. The acceptance criterion is a checkable observation, not a description.

| ID | Demonstration (§14, shortened) | Fixture state / preconditions | Acceptance criterion (checkable observation) | Layer | Evidence artifact | Finding codes that must be absent | Requirement areas |
|---|---|---|---|---|---|---|---|
| **A-01** | Generate a story blueprint | empty project, `publication_type: biblical`, profile `childrens_bible` | `structure/blueprint.json` exists as a revision and contains every `docs/05` §1.2 required field; `progression[]` has ≥ 5 entries; `climax` ≠ `resolution`; `central_theme` non-empty; drafting of prose is **refused** before these hold. Blueprint's **derived `length_model`** is present (`docs/05` §1.2, §1.6): `story_pages_target = 9`, `balanced_lines_per_page = 16` and `words_per_line_measured = 7.9` recorded **with the `dsg_rev` and the `measure_probe_hash` they were measured from**, `resolved_density_band = 0.35 / 0.78`, and `target_words = 9 × 16 × 7.9 − 31.6` = **1106** on this design revision; the **line split** recorded beside it (`lines_available = 144`, `lines_reserved_non_prose = 27`, `lines_available_for_prose = 117`, effective prose budget `924 _words_`; `R-WIZ-017`); `estimated_words` inside the **one-sided** band (`≥ 0.85 × 1106 = 940`, and **not** above `target_words`); `Σ suggested_page_distribution == 11` beats. Drafting of prose is **refused** before all of this holds | unit | `structure/blueprint.json` + its content-hash; `prop_` for the blueprint | `CONTENT_THEME_STATEMENT_MISSING`, `CONTENT_SECTION_MISSING` | `R-IDE`, `R-WIZ`, `R-ARC` |
| **A-02** | Generate and review the manuscript | blueprint present and valid | `ms_rev` exists with ~120 `blk_`; every AI-written block's `origin` ∈ {`ai`,`human`}; review returns **findings as data** referencing `blk_` ids, never prose (`docs/05` §1.5); a copy-paste that changes only trailing whitespace changes no `text_hash`. `stats.words` inside the derived budget's **one-sided** band (`940 … 1106 _words_`), and `stats.reading_minutes == round(stats.words ÷ 150, 1)` — the derived value, not a stored one (`docs/05` §1.6; `R-GEN-014`) | unit | `ms_` revision; `proposals/*.json`; review findings | `MS_TEXT_HASH_DRIFT`, `MS_STATS_DRIFT`, `CONTENT_DUPLICATION_EXACT`, `CONTENT_FINDING_UNANCHORED` | `R-GEN`, `R-IDE`, `R-ARC` |
| **A-03** | Identify story beats | `ms_rev` present | `structure/beats.json` contains exactly **11** `beat_` records, one per `progression[]` entry, stable ids; every `blk_` in `ms_rev` belongs to **exactly one** beat; `ms_rev.beat_order` is a permutation of the beat list; `deriveBeats()` on unchanged input returns the identical hash | unit | `structure/beats.json`; `ms_rev.beat_order`; `deriveBeats()` hash | `BEAT_UNASSIGNED_BLOCK`, `BEAT_BLOCK_SHARED`, `BEAT_DERIVATION_NONDETERMINISTIC`, `MS_BEAT_ORDER_NOT_PERMUTATION` | `R-IDE`, `R-CMP` |
| **A-04** | Propose page compositions | beats + design revision present | an initial `cmp_rev` is emitted with `reason: "initial_composition"`; `Σ len(spans)` over all pages equals the block count of `ms_rev`; no prose appears anywhere in the document; every `block_id` resolves; re-running the initial pass on unchanged inputs returns the identical revision hash | golden | `composition/revisions/<cmp_>.json`; initial-composition report | `COMP_REVISION_CONTAINS_PROSE`, `COMP_BLOCK_LOST`, `COMP_BLOCK_DUPLICATED`, `COMP_BLOCK_UNRESOLVED`, `COMP_SOLVER_NONDETERMINISTIC` | `R-CMP`, `R-ARC` |
| **A-05** | Open the Page Composition Editor | a `cmp_rev` exists | the editor opens on the current `cmp_rev`; the Page Navigator lists every page in reading order; the Canvas renders the selected page/spread **via the reader runtime** (no second renderer); the Content Inspector lists blocks + beats for the selected page | integration | editor session; navigator + canvas assertions | `COMP_BLOCK_LOST`, `COMP_BLOCK_DUPLICATED` | `R-UXS`, `R-CMP` |
| **A-06** | Move a story beat to another page | `cmp_rev` open, target page unfrozen | performing the move command (non-drag, §6.4) creates a **new** `cmp_rev` and appends exactly one `Action{kind: "move"}` with actor + params; the moved beat's blocks reappear on the target page; no block is lost or duplicated; undo restores the previous revision hash exactly | integration | new `cmp_rev`; `composition/history.json` `Action` | `COMP_BLOCK_LOST`, `COMP_BLOCK_DUPLICATED`, `COMP_ORDER_CONTRADICTS_BEAT_ORDER`, `OPS_PERSISTENCE_ROUNDTRIP_LOSS` | `R-CMP`, `R-UXS` |
| **A-07** | Insert a deliberate dramatic page break | the reveal boundary `blk_dg_stone` → `blk_dg_forward` | after the action: `cmp_rev.logical.intentional_breaks` contains `{before_block: blk_dg_forward, essential: true, reason: "reveal"}`; an `S2 page_break_lock` (`lck_dg_break_reveal`) exists; **in the print plan a break exists immediately before `blk_dg_forward`**; the **rendered PDF page N ends with the sentence containing `blk_dg_stone`** and **page N+1 begins with `blk_dg_forward`**; and **the reveal's page is a verso — `N+1 ≡ 0 (mod 2)`, here `pg_dg_10` — so the reveal is reached by a real page turn and is not shared with its predecessor on one spread** (`docs/05` §2.5's parity rule; `§1.6`); on the 360×640 digital plan the break is honoured at the max reference viewport or reported | integration + golden | new `cmp_rev`; `lck_`; PDF raster of pages N and N+1 | `BREAK_UNSATISFIED` (print scope), `COMP_BEAT_SPLIT`, `LOCK_UNSATISFIED` | `R-CMP`, `R-QAS` |
| **A-08** | Lock a selected passage and a page-composition rule | the reveal span and `pg_dg_10` | a `content_lock` (`lck_dg_content_reveal`) over `blk_dg_stone` … `blk_dg_forward` and a `print_page_lock` (`lck_dg_print_reveal`) on `pg_dg_10` both exist with non-empty `reason`; a rewrite `Proposal` targeting the locked span is **refused at creation** (`PROPOSAL_TARGETS_LOCKED_CONTENT` recorded on the `Proposal`), creating no revision; a `Lock` with no `reason` is rejected | unit | `composition/locks.json`; refused `prop_`; `Action{kind:"lock"}` | `COMP_LOCK_INVALID`, `PROPOSAL_TARGETS_LOCKED_CONTENT` (as an *expected* refusal, recorded — not a failure), `COMP_FROZEN_LOCK_CONFLICT` | `R-CMP` |
| **A-09** | Apply a text-based visual template | design revision + `cmp_rev` | applying `tpl_reveal` (and `tpl_scripture_ref`, `tpl_reflective`) creates a new `cmp_rev` via `Action{kind:"set_template"}`; each `tpl_` declares `border_slot: "perimeter"`; page `kind` is compatible with its template; the design revision resolves the template set by `templates_hash`; no token change alters the perimeter frame | integration | new `cmp_rev`; `dsg_rev`; template registry | `COMP_TEMPLATE_INVALID`, `DESIGN_TEMPLATE_BORDER_DRIFT`, `PRINT_BORDER_GEOMETRY_MISMATCH` | `R-DSN`, `R-CMP`, `R-UXS` |
| **A-10** | Preview the interactive desktop book | `html_storybook` artifact present | at `1280×800` and `1440×900` the reader presents a **two-page spread** and at `768×1024` and narrower a single page; DOM reading order equals `logical.beat_order`; prev/next, click, swipe and keyboard (arrow/space) all change the page; no off-screen control at any reference viewport | integration + visual | `art_` (`html_storybook`); viewport screenshots; reader session | `DIG_RESPONSIVE_LAYOUT_BROKEN`, `DIG_READING_ORDER_WRONG`, `DIG_KEYBOARD_NAV_MISSING`, `DIG_CONTROL_NONFUNCTIONAL`, `DIG_OFFSCREEN_CONTROLS` | `R-DIG`, `R-QAS`, `R-UXS` |
| **A-11** | Preview the responsive mobile edition | same artifact | at `360×640` and `414×896` the reader presents a **single page**; `digital.page_count_range` is reported with the viewports it was measured at (never a bare number); the frame is projected by ratio, not unit-converted; rotating the device re-paginates without contradicting beat order and without clipping | integration + visual | reader session at each viewport; `cmp_rev.digital.measured_at` | `DIG_RESPONSIVE_LAYOUT_BROKEN`, `DIG_ORIENTATION_BREAKS`, `DIG_FRAME_CONTROL_COLLISION`, `DIG_TEXT_CLIPPED` | `R-DIG`, `R-QAS` |
| **A-12** | Generate a fixed-page print proof | print `cmp_rev` (unfrozen) | `renderPages()` produces a `proof_sheet` and one `page_png` per print page; each page's `MediaBox` equals the trim `139.7 × 215.9 _mm_` (= `396.0000 × 612.0000 _pt_`); **the page bands are read off the plan, not asserted as literals** — with `k_f` front-matter pages, `s` story pages and `k_b` back-matter pages, `1 ≤ p ≤ k_f` must be front matter, `k_f < p ≤ k_f + s` story, and `k_f + s < p ≤ M` back matter, where `M = k_f + s + k_b + pad = print.page_count`; `print.page_count == 16` on the fixture (§1.2.1); every page carries a fit report (used capacity %, slack) | golden + visual | `art_` (`proof_sheet`, `page_png`); per-page fit report | `PRINT_TRIM_DIMENSION_WRONG`, `PRINT_PAGE_OVERFLOW`, `PRINT_PAGE_COUNT_OFF_TARGET` | `R-PRT`, `R-QAS` |
| **A-13** | Verify page borders and text boundaries | rendered print proof | measured on the **rendered, cropped** raster of every page: the frame band lies at `border.offset_mm` from the trim on all four edges within **± 0.05 `_mm_`** and the spread across all 16 pages is **≤ 0.05 `_mm_`**; the frame's outer edge is ≥ `safe_area_mm` (`6 _mm_`); `min(margin_outer, spine_side_inset) ≥ safe_area_mm`; no glyph box crosses the content box; no text overlaps the frame; body type ≥ `12 pt` | visual | rasterised pages; border-measurement report | `PRINT_BORDER_INCONSISTENT`, `PRINT_BORDER_GEOMETRY_MISMATCH`, `PRINT_BORDER_TRIM_DRIFT`, `PRINT_BORDER_OUTSIDE_SAFE_AREA`, `PRINT_SAFE_MARGIN_VIOLATED`, `PRINT_TEXT_CLIPPED`, `PRINT_BORDER_TEXT_COLLISION`, `PRINT_BORDER_BELOW_VISIBLE_MINIMUM` | `R-PRT`, `R-DSN`, `R-QAS` |
| **A-14** | Generate a standard reading PDF | approved-or-current print plan | `reading_pdf` artifact exists; page count equals `print.page_count`; page order is `1..M` (no imposition); every font used is **embedded and subset**; extracted text equals `ms_rev` text for every page's spans; the artifact manifest carries the D-14 environment | unit + golden | `art_` (`reading_pdf`); manifest; extracted text | `PRINT_CONTENT_MISMATCH_APPROVED`, `PRINT_FONT_NOT_EMBEDDABLE`, `PRINT_MISSING_GLYPH`, `PRINT_PAGE_NUMBERING_WRONG` | `R-PRT`, `R-PUB`, `R-OPS` |
| **A-15** | Generate the imposed booklet PDF | `M` a multiple of four; `imposition.spec_version == 1` | `booklet_pdf` artifact exists; page count equals `M/2` sheet sides; sheet count equals `imposed.sheets` (`M/4`); each booklet page `MediaBox` equals the sheet `279.4 × 215.9 _mm_` (= `792.0000 × 612.0000 _pt_`); the imposed grid is a permutation of `1..M`; every odd page is in a right panel and every even page in a left panel | golden | `art_` (`booklet_pdf`); `Sheets` structure; manifest | `PRINT_IMPOSITION_ORDER_WRONG`, `PRINT_IMPOSITION_PAGE_ERROR`, `PRINT_IMPOSITION_PAGE_NUMBER_WRONG`, `PRINT_IMPOSITION_SPEC_MISMATCH`, `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | `R-PRT`, `R-OPS` |
| **A-16** | Inspect the booklet sheet arrangement | `booklet_pdf` + preview data | the sheet preview is a projection of the **same `Sheets` value** the PDF consumed; it shows sheet grid `1..S`, page numbers and page contents per panel, the fold model, facing pairs, the head marker and the blank provenance; for `M = 16` sheet 1 front reads `16 | 1` and sheet 4 back reads `8 | 9`; `print_guide` states paper, sheets, duplex, flip edge, fold, binding and the one-line verification | integration | sheet preview; `art_` (`print_guide`); `Sheets` | `PRINT_IMPOSITION_ORDER_WRONG`, `PRINT_IMPOSITION_PAGE_ERROR`, `PRINT_REVERSE_SIDE_BLANK_UNRECORDED`, `PRINT_PRINT_GUIDE_MISMATCH` | `R-PRT`, `R-UXS` |
| **A-17** | Approve the final publication | a fresh, scope-complete validation report with 0 critical findings; frozen print plan | a governing `Approval{state:"approved"}` exists binding `{ms_rev, cmp_rev, dsg_rev, val_rev}` and `environment`; it records `frozen.print_pages` and `frozen.content_lock_ids`; approval is **user-only** (no automatic transition); approval is **refused** in exactly two cases and no others — while an unresolved `critical` finding exists (`OPS_APPROVAL_BLOCKED_BY_CRITICAL`) **or** while an un-waived **`major · A`** finding exists (`OPS_APPROVAL_UNWAIVED_MAJOR`); an un-waived **`major · E`** finding refuses **export only** and never the approval act (`SCRIPTURE_INTERPRETATION_FLAGGED`), and an unflagged `major` (`blk = none`) refuses neither, whether or not a waiver was attempted (`docs/11` §1.4 cases 1/3/4, rules B3/B4, W1); a later pointer move sets the record `stale` with a named `stale_reason` (never deleted) | integration | `approvals/<apr_>.json`; `val_` report | `OPS_APPROVAL_BLOCKED_BY_CRITICAL`, `OPS_APPROVAL_UNWAIVED_MAJOR`, `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` | `R-OPS`, `R-QAS` |
| **A-18** | Successfully print and assemble a physical booklet | A-17 recorded; `booklet_pdf` artifact exported | **manual, not machine-verifiable.** A human prints the `booklet_pdf` at actual size (head-preserving flip), folds, staples, and records an `Approval.manual_proof` naming the printed `art_` whose manifest hash matches the file. **Excluded from every automated gate** (§2.1) | manual | `Approval.manual_proof` record + photo evidence | *(none — no `T-` test exists; a finding cannot be raised by an automated gate)* | `R-PRT` (manual sign-off) |

### 2.1 A-18 is a manual proof and is outside the gate — stated once

`manual_proof: {kind: "printed_booklet", at, by, approved_triple, artifact_id, booklet_pdf_sha256, environment, printer, assembly, evidence[], notes}` (`docs/12` §8.1; `docs/04` §7.3). Its presence is **not** a conjunct of `EXPORTABLE` (`docs/12` §1.3) and satisfies no `T-` test (`docs/12` §8.3). Its absence never blocks approval or export; `manual_proof: null` is the normal state. The fixture's approved state carries a `manual_proof` **slot**, not a gate (`docs/14` §4.1).

---

## 3. Scripture-fidelity suite (§4.3, §10.1)

### 3.1 The `SourceReference` that must exist

| Field | Required value | Basis |
|---|---|---|
| `id` | `srcref_dg_1sam17` (`srcref_`) | `docs/04` §4.5 |
| `kind` | `scripture` | §4.3 |
| `citation` | `1 Samuel 17:38-51` | §4.3 |
| `translation` | `web` — must exist in `scripture/registry.json` (public-domain, D-08) | D-08; Q-05 |
| `resolution` | `{book: 1_samuel, chapter_start: 17, verse_start: 38, chapter_end: 17, verse_end: 51}` — **deterministically resolved**, not free text | `docs/04` §4.5 |
| `quoted_text_block_ids[]` | `[blk_dg_verse, blk_dg_verse2, blk_dg_memory_verse]` | `docs/04` §4.5 |
| `paraphrase_block_ids[]` | every narrative block incl. `blk_dg_goliath_taunt`, `blk_dg_david_volunteers`, `blk_dg_saul_armour` | `docs/04` §4.5 |
| `verification` | `{state, method, notes, reviewer}` — see §3.5 | `docs/04` §4.5 |
| `disclaimer_required` | `true` (invented dialogue accompanies the passage) | §4.3; `docs/04` §4.5 |

### 3.2 Scripture-typed blocks vs paraphrase

| Block class | `Block.type` | Appears in | Rule |
|---|---|---|---|
| Verbatim scripture | `scripture` | `srcref.quoted_text_block_ids[]` | text must equal the registry verse text (normalised); a mismatch is `SCRIPTURE_TEXT_MISMATCH` (critical) |
| Narrative / paraphrase / invented dialogue | `paragraph` (or `heading`, `line`, `quotation`) | `srcref.paraphrase_block_ids[]` | must **never** be typed `scripture`; a `scripture`-typed block that does not resolve is `SCRIPTURE_TEXT_MISMATCH` |
| Back-matter verse | `scripture`, `role: verse` | both lists | a quoted verse must resolve and be listed |

**Invariant (§4.3).** Every `scripture`-type block in `ms_rev` is covered by a `SourceReference` whose `resolution` resolves in the registry and whose `translation` has a licence entry; otherwise `SCRIPTURE_UNSOURCED` (critical for published artifacts).

### 3.3 The invented-dialogue rule, and how it is proven

| Rule | Mechanism | Proof (findings that must be absent) |
|---|---|---|
| Invented dialogue must not be presented as literal scripture | a block whose text does not resolve against the registry verse index is **refused at proposal time** | `SCRIPTURE_TEXT_MISMATCH` absent |
| Invented dialogue must be marked | the block is `paragraph` **and** its `SourceReference` carries `as_paraphrase: true`; a proposal that invents dialogue in a `scripture`-typed block without `as_paraphrase: true` is refused | `SCRIPTURE_DIALOGUE_UNMARKED` absent |
| The reader must be told | when `disclaimer_required` is true a disclaimer block exists and is placed | `SCRIPTURE_DISCLAIMER_MISSING` absent |

Test basis: `T-ARC-027` (dialogue guard), `T-IDE-022` (text mismatch), `T-IDE-020` (sourced).

### 3.4 Chronology and translation-licence assertions

| Assertion | Checkable observation | Finding that must be absent |
|---|---|---|
| Chronology preserved | the beat order for a `biblical` profile follows `srcref.resolution` verse order: `beat_dg_*` sequence is monotonic in verse number; an out-of-order beat is `SCRIPTURE_CHRONOLOGY_REORDERED` (major, waiverable **only** with a recorded reason) | `SCRIPTURE_CHRONOLOGY_REORDERED` |
| Translation resolves | `web` exists in `scripture/registry.json`; `srcref.resolution` resolves to a verse range | `SCRIPTURE_TRANSLATION_UNKNOWN`, `SCRIPTURE_REF_UNRESOLVED` |
| Translation licensed | `licenses.json` carries a `web` entry (kind, identifier, permitted scope) | `OPS_LICENSE_MISSING` |
| Verified translation | the citation is `verified` (not `flagged`/`disputed`) before publication | `SCRIPTURE_INTERPRETATION_FLAGGED`, `CONTENT_SOURCE_UNVERIFIED` |

Test basis: `T-IDE-023` (chronology), `T-IDE-021` (ref unresolved), `T-IDE-025` (licence).

### 3.5 Human sign-off: `verification.state` transitions

`SourceReference.verification.state ∈ {unverified, verified, flagged, disputed}` (`docs/04` §4.5).

| From → To | Trigger | Initiator | Record carried | Blocking effect |
|---|---|---|---|---|
| *(none)* → `unverified` | `srcref_` created | system | default | export blocked by `SCRIPTURE_UNSOURCED` if unresolved |
| `unverified` → `flagged` | the citation needs interpretive review | AI (`specialized` review) | `SCRIPTURE_INTERPRETATION_FLAGGED` (major, **blocking for export** until a human resolves) | blocks export |
| `flagged` → `verified` | a human reads the passage, confirms it, sets `method`/`notes`/`reviewer` | **human only** | reviewer name + method + notes | clears the block |
| `flagged` → `disputed` | a human records a doubt with a note | human only | note + reviewer | remains blocking; a revision is required |
| `disputed` → `verified` | a corrected `ms_rev` re-verifies | human only | new `srcref_` verification on the new block hashes | clears only on the new triple |

Acceptance: the fixture's governing `srcref_dg_1sam17.verification.state == "verified"` with a non-empty `reviewer` and `notes`; the corresponding `flagged` record (if it existed) remains readable history on the prior triple.

---

## 4. Print acceptance suite (§15.4, §9.1–§9.5)

### 4.1 Sheet and booklet dimensions

| Quantity | Asserted value | Finding that must be absent | Basis |
|---|---|---|---|
| Reading PDF page box (`MediaBox`) | trim `139.7 × 215.9 _mm_` = `396.0000 × 612.0000 _pt_` | `PRINT_TRIM_DIMENSION_WRONG` | §9.1; `docs/08` §4.1; `T-PRT-062` |
| Booklet PDF page box (`MediaBox`) | sheet `279.4 × 215.9 _mm_` = `792.0000 × 612.0000 _pt_` | `PRINT_TRIM_DIMENSION_WRONG` | §9.4; `docs/10` §6.1 |
| Booklet PDF page count | `M/2` sheet sides (`S = M/4` sheets) | — | `docs/10` §8 |
| Reading PDF page count | `print.page_count = M` | — | `T-PRT-060` |
| Trim/bleed boxes | `TrimBox == MediaBox == BleedBox` (`bleed = 0`) | — | `docs/10` §6.3 |

### 4.2 Border uniformity — measured, with an explicit tolerance

Measured on the **rendered, cropped raster** of every page (`docs/11` §3.4; `docs/08` §4.3), never on the token set.

| Quantity | Declared value (`warm_parchment`, half-letter) | Tolerance | Basis |
|---|---|---|---|
| Frame outer-edge offset from the trim, per edge, per page | `border.offset_mm` = `8.00 _mm_` | **± 0.05 `_mm_`** per edge (≈ 0.14 `_pt_`; sub-pixel at the 150 DPI raster of `docs/14` §6.1) | `docs/09` §7.4; `docs/10` §6.6 |
| Spread of that offset across all 16 pages | one value, `8.000 _mm_` (the frame is computed once from `dsg_rev`) | **≤ 0.05 `_mm_`** (max − min across pages) | §9.2 "Align consistently across pages" |
| Rule thickness — **`double_rule`**, the reference theme's style | outer `border.thickness_pt` = `0.75 _pt_` = `0.2646 _mm_`; inner `border.thickness_inner_pt` = `0.75 _pt_` = `0.2646 _mm_`; `border.gap_mm` = `1.5 _mm_` | ± 0.03 `_mm_` per rule | `docs/09` §7.1, §7.4; C3; `docs/04` §6.1 |
| Frame **band** (offset → inner edge of the inner rule) | `8.000 … 10.0292 _mm_` = `8 + 0.2646 + 1.5 + 0.2646` | computed, not rasterised | `docs/08` §4.3 |
| Clearance frame → nearest text | `18.35 − 10.0292 = **8.32 _mm_**` (and `C2`: `10.0292 + text_gap_min_mm 3 = 13.0292 ≤ 18.35`) | — | `docs/08` §4.2 `C2` |
| Frame must survive trim/fold | frame band `8.000 … 10.0292 _mm_` ≥ `safe_area_mm` `6 _mm_` (**2.03 `_mm_`** slack) | — | `docs/10` §6.6 |

> The ± 0.05 `_mm_` tolerance is **authored in this document**, not a registry constant: `docs/11` registers `PRINT_BORDER_INCONSISTENT` and `PRINT_BORDER_GEOMETRY_MISMATCH` but states no numeric tolerance. Since the frame is computed once from `dsg_rev` and identical by construction, the tolerance bounds rasterisation error only. Reported as an addition for `docs/11`/`docs/09` to ratify (§10).

> **The band is the band of a `double_rule`.** An earlier revision of this table gave the band as `8.000 … 8.2646 _mm_` with `10.085 _mm` of clearance to text — the arithmetic of a **`single_rule`** frame, applied to a theme whose style is `double_rule` (`§1.1`, `docs/04` §6.1). With `docs/09` §7.1's values (outer 0.75 `_pt_`, inner 0.75 `_pt_`, `gap_mm` 1.5) the band ends at `10.0292 _mm_` and the clearance is `8.32 _mm_`. `docs/08` §4.3 carries the same corrected figures; `docs/09` §7.4 should (`§10`).

Findings that must be absent: `PRINT_BORDER_INCONSISTENT`, `PRINT_BORDER_GEOMETRY_MISMATCH`, `PRINT_BORDER_TRIM_DRIFT`, `PRINT_BORDER_OUTSIDE_SAFE_AREA`, `PRINT_BORDER_BELOW_VISIBLE_MINIMUM`.

### 4.3 Print-safe margins, clipping, overlap

| Check | Observation | Finding that must be absent | Basis |
|---|---|---|---|
| Print-safe margins | `min_side_text_margin_mm ≥ safe_area_mm`, where **`min_side_text_margin_mm = min(margin_outer_mm, spine_side_inset_mm) = min(18.35, 25.35) = 18.35 _mm_`** is the nearer text edge to the trim (`docs/08` §4.2) — the quantity both this check and `C2` bind, and which is *derived*, never authored; frame outer edge ≥ `safe_area_mm`; content box is the declared text box **shifted `(gutter + binding)/2 = 3.50 mm` toward the outer edge** (measure unchanged) | `PRINT_SAFE_MARGIN_VIOLATED` | §9.2; `docs/08` §4.2 |
| No clipped text | no rendered glyph box crosses the content box or the trim on any page | `PRINT_TEXT_CLIPPED` | §10.4; `T-CMP-039` |
| No overlapping text | no two glyph boxes intersect; no text overlaps the frame | `PRINT_PAGE_OVERFLOW`, `PRINT_BORDER_TEXT_COLLISION` | §10.4 |
| No missing glyph | no `.notdef`/tofu on any page; unbreakable words refuse rather than overflow silently | `PRINT_MISSING_GLYPH`, `PRINT_GLYPH_MISSING`, `PRINT_UNBREAKABLE_OVERFLOW` | §10.4; `docs/09` §5.4 |
| Readable typography | body `13.5 pt ≥ minimum_readable_pt 12 pt` | `DESIGN_BODY_BELOW_MINIMUM` | §8.3 |

### 4.4 Booklet ordering, blanks, binding allowance

| Check | Observation | Finding that must be absent | Basis |
|---|---|---|---|
| Correct booklet ordering | imposed grid is a permutation of `1..M` (**V1**); every odd page in a right panel, every even in a left (**V2**); `front_right(1)=1`, `front_left(1)=M` (**V3**); for every even `p`, `p` and `p+1` are a facing pair — `p` on a left panel and `p+1` on a right panel, on the **same** nesting sheet when the pair *is* the centre spread (`p = M/2`) and on **immediately adjacent** sheets otherwise — never more than one sheet index apart, and exactly one except at `p = M/2` (**V4**); `M=16` sheet 1 front `16 \| 1`, sheet 4 back `8 \| 9` |
| No unintended blank pages | every `blank` page carries `blank_intentional.reason`; every imposed blank has a deliberate record; `pad = (4 − N mod 4) mod 4` inserted only at the back (then front) boundary; `M % 4 == 0` | `COMP_BLANK_UNINTENDED`, `PRINT_REVERSE_SIDE_BLANK_UNRECORDED`, `COMP_IMPOSITION_PADDED_MIDSTORY`, `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | §9.4; D-16; `docs/08` §4.6 |
| Binding allowance | content clear of the spine allowance; `safe_area + gutter + binding ≤ spine_side_inset_mm` (the `C4` floor — a **spine-side** inset only, `13.00 ≤ 25.35`; see `docs/08` §4.2); facing text boxes ≥ `gutter_mm` (`2 × 25.35 = 50.7 ≥ 4`) | `PRINT_BINDING_ALLOWANCE_VIOLATED`, `PRINT_GUTTER_INSUFFICIENT`, `PRINT_GUTTER_EXCEEDS_MARGIN` | §9.1; `docs/08` §4.2 |

### 4.5 Exported content matches the approved revision

| Check | Observation | Finding that must be absent | Basis |
|---|---|---|---|
| Exported content | extracted text of the reading PDF and booklet PDF equals the approved `ms_rev` text for every page's spans; the HTML book, the reading PDF and the booklet PDF agree | `PRINT_CONTENT_MISMATCH_APPROVED`, `DIG_RENDER_TEXT_DIFFERS_FROM_PLAN`, `COMP_PLAN_CONTENT_DIVERGENCE` | §10.4, §12.3; `T-PRT-069` |
| Artifact cites the approval | the artifact's `approval_id` names an approval whose `revisions` and `environment` equal the current pointers and engine | `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` | §15.5; `docs/04` §7.3 |

### 4.6 The A-18 manual physical-assembly proof — record fields

Recorded on `Approval.manual_proof` (`docs/12` §8.1), **excluded from the automated gate** (§2.1; `docs/17` Part C).

| Field | Meaning |
|---|---|
| `kind` | `"printed_booklet"` |
| `at`, `by` | timestamp; the human signer **by name** (never `autonomous`) |
| `approved_triple` | `{ms_rev, cmp_rev, dsg_rev}` — must equal the cited approval's `revisions` |
| `artifact_id` | the `booklet_pdf` `art_` actually printed |
| `booklet_pdf_sha256` | must equal that artifact's manifest file hash |
| `environment` | `{engine_version, chromium, imposition_spec_version}` |
| `printer` | `{paper, scale: "actual_size", duplex: true, flip_edge, sheets}` |
| `assembly` | `{folded, bound: "saddle_stitch", folds_correct, sheet_order_correct, borders_visible_after_trim, margins_clear}` |
| `evidence[]` | ≥ 1 photograph of the folded, stapled booklet (`{kind, path, sha256, bytes}`) |
| `notes` | free text |

If the triple later changes, `approved_triple` no longer matches the pointers and the proof is **stale evidence** — it is not carried forward by a successor approval (`docs/12` §8.2).

---

## 5. Interactive HTML acceptance suite (§15.3)

### 5.1 Layout, navigation and rendering

| Check | Observation | Finding that must be absent | Basis |
|---|---|---|---|
| Desktop two-page | at `1280×800` and `1440×900` a facing spread is presented; the spread is not forced when a leaf's measure would fall below the readable minimum | `DIG_RESPONSIVE_LAYOUT_BROKEN`, `DIG_TYPOGRAPHY_UNREADABLE` | §7.1; `docs/08` §3.2 |
| Mobile single-page | at `360×640`, `414×896`, `768×1024` a single page is presented | `DIG_RESPONSIVE_LAYOUT_BROKEN` | §7.1 |
| Touch navigation | tap and swipe change the page | `DIG_TOUCH_NAV_MISSING` | §15.3; §7.3 |
| Keyboard navigation | arrow / space / jump-to-start/end change the page | `DIG_KEYBOARD_NAV_MISSING`, `DIG_CONTROL_NONFUNCTIONAL` | §15.3; §7.3 |
| No clipping | no glyph box crosses the content box at any reference viewport; no page overflows; no text is truncated or ellipsised | `DIG_TEXT_CLIPPED`, `DIG_PAGE_OVERFLOW`, `DIG_TEXT_TRUNCATED`, `DIG_TEXT_MISSING` | §10.3; §6.10 |
| No overlap / on-screen controls | controls stay on-screen; the frame never overlaps a control | `DIG_TEXT_OVERLAP`, `DIG_OFFSCREEN_CONTROLS`, `DIG_FRAME_CONTROL_COLLISION` | §10.3 |
| Logical reading order | DOM order equals `logical.beat_order` | `DIG_READING_ORDER_WRONG` | §15.3 |
| Orientation change | a rotation re-paginates between planned boundaries, keeps reading order and spread mode correct, and never re-plans the book | `DIG_ORIENTATION_BREAKS`, `DIG_READER_REPLANNED` | §15.3; `docs/08` §3.5 |
| Reduced motion | with `prefers-reduced-motion: reduce` animation is disabled **and navigation still works**; a page transition does not block input beyond `max_ms` | `DIG_REDUCED_MOTION_IGNORED`, `DIG_TRANSITION_INCORRECT` | §7.2, §10.3 |
| Font scaling | each declared scale step reflows without clipping; a step is clamped to the ladder | `DIG_FONT_SCALING_BREAKS` | §7.3 |
| Standalone | the book opens from `file://` with no network fetch; fonts are inlined `woff2` subsets | `DIG_STANDALONE_VIOLATION`, `OPS_NETWORK_FONT_REFERENCE` | D-19; §15.3 |

### 5.2 "Retains the approved visual identity" — checked objectively

Identity is **not** judged by eye; it is a value comparison against `dsg_rev`.

| Step | Observation | Pass condition | Finding that must be absent | Basis |
|---|---|---|---|---|
| 1 | Compile the design revision: `compileDesignRevision(dsg_rev, theme, registry, paper, "ref", chromiumBuild) → CompiledTokens` | the compiled set includes `metricsHash` and `theme_token_hash`; it is byte-identical to the value recorded in the artifact manifest | `DESIGN_FONT_METRICS_DRIFT`, `OPS_MEASUREMENT_STALE` | `docs/09` §3.1; D-14 |
| 2 | Load the running reader at `1440×900` in the **pinned** Chromium; read every `--sb-*` custom property for token paths whose `meta.consumers` includes `reader_css` and whose `meta.role == "identity"` via `getComputedStyle` | every such computed value equals the compiled value (normalised to the same quantity) — `type.*.size_px_css`, line height, family, colour, rule style, rule thickness, page proportion, background | `DESIGN_IDENTITY_FROM_VIEWPORT`, `DESIGN_READER_OVERRIDE_UNAUTHORISED` | `docs/09` §1.7, §3.2, §3.5 |
| 3 | Measure the glyph size in the reader at the smallest live box | equals the compiled size (the reader may not shrink type to fit) | `DESIGN_READER_TYPE_SHRUNK` | §8.3; `docs/09` §5.2 |
| 4 | Compare the digital plan at the **reference box** against the print plan for the same `dsg_rev` and Chromium build | identical line-break positions and identical lines-per-page for every block | `DESIGN_PARITY_LINEBREAK_DRIFT` | `docs/09` §1.7 |
| 5 | Sample the rasterised HTML page and rasterised print page at the reference box | same family, same size, same colour and same frame ratio | `DIG_TYPOGRAPHY_UNREADABLE` | §15.3; `docs/09` §7.5 |

Steps 1–4 are **machine-checkable pass/fail** (a value equality); step 5 is a corroborating raster check. The only human judgement left is "does it *look* right", which §8 records as such.

---

## 6. Operational acceptance suite (§15.5)

| Criterion (§15.5) | Observation | Test id | Finding that must be absent | Basis |
|---|---|---|---|---|
| Projects persist correctly | save → close → reopen yields a byte-identical project directory and the same pointer triple; a manual composition change survives save/reload | `T-UXS-022`, `T-OPS-035` | `OPS_PERSISTENCE_ROUNDTRIP_LOSS`, `PROJECT_POINTER_DANGLING` | §15.2, §15.5; D-03 |
| Failed steps resume | killing a render mid-run and restarting re-queues the job at its last checkpoint and produces the identical bytes; a job with no checkpoint is `OPS_JOB_NOT_RESUMABLE` | `T-ARC-042`, `T-ARC-043` | `OPS_JOB_NOT_RESUMABLE`, `OPS_JOB_ABANDONED` | §15.5; D-17 |
| Revisions are tracked | every revision document is immutable and content-addressed; an edited revision document fails its hash; a revision's `parent` resolves | `T-OPS-030` | `OPS_REVISION_IMMUTABLE_VIOLATION`, `OPS_REVISION_PARENT_BROKEN` | §15.5; D-10 |
| Approved publications are reproducible (**byte identity**) | two renders of the same triple on the recorded environment produce byte-identical files with equal `files[].sha256`; `sbx artifact reproduce` from the manifest yields identical bytes on a clean `.cache/` | **`T-OPS-031`** (identical-input-same-bytes), **`T-OPS-051`** (manifest-reproduces-artifact), `T-PRT-065` | `OPS_ARTIFACT_UNREPRODUCIBLE`, `OPS_MANIFEST_INCOMPLETE`, `OPS_ARTIFACT_PARTIAL` | §15.5; D-14; `docs/12` §6.4 |
| AI calls are focused and economical | **measurement method:** enumerate `proposals/*.json` and count entries per `task`; count provider-cache **misses** keyed by `(prompt_hash, input_hash, provider, model)`; a replay over unchanged inputs must produce **0** billable calls | `T-ARC-021` (cache-hit) | `OPS_AI_ECONOMY_VIOLATION`, `OPS_AI_MUTATED_STATE`, `OPS_PROPOSAL_UNAPPLIED_LEAK` | §15.5, §12.5; D-11, D-12 |
| Critical errors block approval | approval is refused while an unresolved critical finding or an un-waived major finding exists in the judged report | `T-QAS-009` | `OPS_APPROVAL_BLOCKED_BY_CRITICAL`, `OPS_APPROVAL_UNWAIVED_MAJOR` | §10.5, §15.5 |
| Exported files match the approved revision | every artifact's `revisions` equal the current pointers and the cited `approval_id`'s triple and `environment`; an export attempted from a stale/mismatched revision is refused with **no file written** | `T-OPS-014`, `T-OPS-018` | `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`, `OPS_APPROVAL_ENVIRONMENT_MISMATCH` | §15.5; `docs/12` §1.1 |

### 6.1 AI call economy — the ceiling is calibrated, not invented

The **method** above is fixed. The **ceiling** (a number of calls or tokens per manuscript-revision cycle) is **not asserted in this document** and must not be: it can only be calibrated by the first real vertical-slice run (Q-03 routing; `docs/13` §8 R4). Recording the number produced by the first run, and asserting `0` on every identical replay thereafter, is the checkable form of §15.5's "AI calls are focused and economical". Until the first run, the only assertable properties are: (a) an identical replay makes zero billable calls (`T-ARC-021`); (b) review caching is keyed by `(block text_hash, depth, profile)` so a one-paragraph edit re-reviews one paragraph (`T-GEN-003`); (c) every call is auditable from `proposals/` (`docs/12` §9).

---

## 7. Run order for the vertical slice

The exact sequence, the state each step leaves behind, and the re-run scope when only one artifact changed. Steps are ordered so that no step begins before its dependency's exit criteria pass (`docs/13` §4.3, P3).

### 7.1 The sequence

| # | Step (acceptance id) | Operation | Writes / leaves behind | Gate state after |
|---|---|---|---|---|
| 1 | project create | `sbx project create --profile childrens_bible` | `project.json` (`prj_`); `dsg_rev` (default theme); `scripture/registry.json` check | no approval |
| 2 | **A-01** blueprint | generate + apply blueprint proposal | `structure/blueprint.json` (revision); `prop_` | drafting unblocked |
| 3 | **A-02** manuscript | draft + review + apply | `ms_rev`; `manuscript/blocks.json`; review findings; `proposals/*` | `ms_rev` pointer set |
| 4 | **A-03** beats | `deriveBeats(blueprint)` | `structure/beats.json`; `ms_rev.beat_order` | beat order fixed |
| 5 | **A-04** initial composition | initial pass | `composition/revisions/<cmp_>.json` (`reason: initial_composition`) | `cmp_rev` pointer set |
| 6 | **A-05** open editor | open on current `cmp_rev` | *(UI)* | — |
| 7 | **A-06** move beat | `move` command | new `cmp_rev`; `Action{move}`; `composition/history.json` | — |
| 8 | **A-07** deliberate break | accept the reveal suggestion → `intentional_break` + `S2` lock | new `cmp_rev`; `lck_dg_break_reveal`; `Action{insert_break}` | essential break recorded |
| 9 | **A-08** locks | `content_lock` + `print_page_lock` | `locks.json` (`lck_dg_content_reveal`, `lck_dg_print_reveal`); `Action{lock}` | H1/H2 in force |
| 10 | **A-09** template | `set_template` | `dsg_rev` (theme materialised); new `cmp_rev`; `Action{set_template}` | design frozen |
| 11 | print pagination | `paginatePrint` (unfrozen) | `cmp_rev.print` (`paper`, `pages`, `page_count`, `imposed`) | plan recomputable |
| 12 | **A-10/A-11** HTML preview | `sbx export html` | `art_` (`html_storybook`); `cmp_rev.digital.measured_at`, `page_count_range` | — |
| 13 | **A-12** print proof | `renderPages()` | `art_` (`proof_sheet`, `page_png`); per-page fit report | print plan visible |
| 14 | **A-13** border/boundary verify | print validation | print-scope `val_` report | — |
| 15 | **A-14** reading PDF | `readingPdf()` | `art_` (`reading_pdf`) + manifest | export blocked (no approval) |
| 16 | **A-15/A-16** booklet | `bookletPdf()` + preview | `art_` (`booklet_pdf`, `print_guide`); `Sheets` | export blocked |
| 17 | freeze + validate | freeze print plan; full-scope validation | frozen `cmp_rev.print`; scope-complete `val_` (0 critical) | `approval_ready` |
| 18 | **A-17** approve | user approves the §6.11 scopes | governing `apr_` (`state: approved`), `frozen.print_pages`, `frozen.content_lock_ids` | exportable |
| 19 | export on approval | re-export artifacts citing `apr_` | `art_` manifests cite `approval_id` + `environment` | reproducible |
| 20 | **A-18** manual proof | print/fold/staple; record | `Approval.manual_proof` + photo | *(no gate change)* |

### 7.2 Re-run scope when only one artifact changed

Targeted revalidation, not a full rebuild (`docs/12` §4; `docs/11` §5.2; `docs/08` §8.1).

| What changed | Re-measure | Re-solve | Re-render | Revalidate | Approvals |
|---|---|---|---|---|---|
| One block's text, occupied lines unchanged | that block | none (byte-identical `cmp_rev`) | none | that block's pages | no staleness (no-op, `docs/12` §2.5.1) |
| One block's text, lines changed | that block | affected suffix (both plans) | affected pages | that block's pages, digital + print | `stale` (`manuscript_revision_changed`) |
| Typography token (size/line-height) | all blocks | both plans, all pages | all artifacts | all pages (content **not** re-run) | `stale` (`typography_changed`) |
| Border/gutter/safe-area token | print geometry | print plan | print artifacts (proof, reading, booklet) | print scope | `stale` (`design_revision_changed`) |
| One lock added/released | none | pages of the locked scope | affected pages | that scope only | `stale` if `content_lock_released` |
| Front/back matter edited | matter blocks | print indices `1..k` (front) or `n−j..n` (back) + parity | matter pages + full booklet | `[composition, print]` | `stale`; frozen assignment refused until `Re-open pagination` |
| Only the booklet PDF re-exported | none | none | booklet page reassembly only | `[print, ops]` | unchanged if the triple is unchanged |
| Reading PDF re-exported only | none | none | reading PDF only | `[ops]` | unchanged |
| Engine or Chromium build changed | everything | both plans | all artifacts | all scopes | `stale` (`environment_changed`) |

---

## 8. Honest limitations

Which §15.2–§15.5 criteria are only partially automatable at V1, what a human must verify, and what is deferred with the reason. Each row names a substitute, so the thing is explicitly out of the automated gate rather than silently untested (`docs/14` §11).

### 8.1 Partially automatable — machine-checked plus human

| §15 criterion | Automated part | Human part | Why the split |
|---|---|---|---|
| §15.2 "Page-turn decisions remain narratively coherent" | the heuristic ranking is deterministic and tested (`docs/05` §2.5 signals); the accepted `intentional_break` is asserted (A-07) | whether the reveal *reads* well | ranking is a heuristic; "coherent" is editorial (`docs/11` §3.1) |
| §15.2 "The system identifies impossible composition constraints" | `COMP_LOCK_CONFLICT_HARD` and the **minimal unsatisfiable subset of the H1/H2 locks** are asserted (`docs/07` §5.2) | which intent to keep | the machine identifies; the author chooses |
| §15.3 "Works in modern desktop and mobile browsers" | the **pinned** Chromium at the reference viewport set + `file://` standalone (A-10, A-11) | real-device matrix (Safari, Firefox, a physical phone) | one layout authority by design (D-01); cross-browser is deferred |
| §15.3 "Retains the approved book's visual identity" | the value-equality check of §5.2 (steps 1–4) is pass/fail | "does it look like the approved book" | identity tokens are checkable; aesthetics are not |
| §15.4 "Readable typography" | `minimum_readable_pt`, contrast ratio, line-length band are asserted | print appearance on the chosen stock | legibility metrics are objective; paper is physical |
| §15.5 "AI calls are focused and economical" | the measurement method and the 0-on-replay assertion | the ceiling | calibrated by the first real run only (§6.1) |

### 8.2 Human-only

| Criterion | Who verifies | Record |
|---|---|---|
| §15.4 "Successful physical booklet assembly" | Stephen, by hand | `Approval.manual_proof` (**A-18**; excluded from the gate) |
| Print appearance: colour cast, grain/show-through, fold creep on the chosen paper | Stephen | `manual_proof.printer`/`notes`; `notes` documents show-through, grain, humidity (`docs/10` §7.2) |
| Duplex flip-edge alignment on a specific printer | Stephen | `manual_proof.printer.flip_edge` + the one-line verification in the `print_guide` (`docs/10` §7.1) |
| Editorial judgement: is the story good and audience-appropriate beyond the deterministic metrics | Stephen / an L3 review | review findings + approvals |

### 8.3 Deferred, with the reason

| Deferred | Reason |
|---|---|
| Cross-browser / real-device rendering matrix | V1 is one pinned Chromium by decision (D-01); §15.3's "modern browsers" is met by the pinned build + standalone offline file |
| Illustration, image containers, cover design, resolution checks | V2 (§13 V2); no illustration code may merge before Phase 9 (`docs/13` §4.3, R5) |
| Colour management / ICC profiles, bleed, crop marks, `trim_to_size` | V1 is text-only and `crop_marks = false`, `bleed_mm = 0` (`docs/10` §6.3) |
| Perfect binding, coil/comb, 4-up, landscape leaves | §9.4 names saddle-stitch only; V1 family is saddle-stitch 2-up fold-in-half (`docs/10` §1.1) |
| Publish-to-URL | standalone file for V1 (D-19); publishing is an explicit separate action |
| A third paper preset | Q-04; the two presets ship and a third is added only when one has been printed (`docs/10` §7.3) |
| Dedicated creep/shingling finding code | `docs/11` §2.4 has no creep code; breaches surface through `PRINT_BINDING_ALLOWANCE_VIOLATED` / `PRINT_GUTTER_INSUFFICIENT` / `PRINT_BORDER_OUTSIDE_SAFE_AREA` (`docs/10` §11.2 B-5) |

---

## 9. Traceability table — A-01 … A-18 → §17 phase → requirement areas

The §17 phase that **first makes each demonstration possible** (`docs/13` §7). A row flagged **Phase 9** cannot be satisfied earlier; a row flagged **Phase 8** is fully *verified* only when the validators close.

| A-id | §14 demonstration | §17 phase (first possible) | Requirement areas proved | Flag |
|---|---|---|---|---|
| A-01 | Generate a story blueprint | **1** Content Foundation | `R-IDE`, `R-WIZ`, `R-ARC` | — |
| A-02 | Generate and review the manuscript | **1** Content Foundation | `R-GEN`, `R-IDE`, `R-ARC` | — |
| A-03 | Identify story beats | **2** Structured Composition | `R-IDE`, `R-CMP` | — |
| A-04 | Propose page compositions | **2** Structured Composition | `R-CMP`, `R-ARC` | — |
| A-05 | Open the Page Composition Editor | **4a** Page Composition Editor | `R-UXS`, `R-CMP` | complete only when 4a–4d close |
| A-06 | Move a story beat to another page | **4b** | `R-CMP`, `R-UXS` | — |
| A-07 | Insert a deliberate dramatic page break | **4b** | `R-CMP`, `R-QAS` | — |
| A-08 | Lock a selected passage and page composition rule | **4c** | `R-CMP` | — |
| A-09 | Apply a text-based visual template | **5** Shared Design System | `R-DSN`, `R-CMP`, `R-UXS` | — |
| A-10 | Preview the interactive desktop book | **3** Interactive HTML Reader | `R-DIG`, `R-QAS`, `R-UXS` | Q-07 review point |
| A-11 | Preview the responsive mobile edition | **3** Interactive HTML Reader | `R-DIG`, `R-QAS` | — |
| A-12 | Generate a fixed-page print proof | **6** Print Renderer | `R-PRT`, `R-QAS` | — |
| A-13 | Verify page borders and text boundaries | **6** renders → **8** verifies | `R-PRT`, `R-DSN`, `R-QAS` | verification fully automated only in Phase 8 |
| A-14 | Generate a standard reading PDF | **6** Print Renderer | `R-PRT`, `R-PUB`, `R-OPS` | — |
| A-15 | Generate the imposed booklet PDF | **7** Booklet Publishing | `R-PRT`, `R-OPS` | — |
| A-16 | Inspect the booklet sheet arrangement | **7** Booklet Publishing | `R-PRT`, `R-UXS` | — |
| A-17 | Approve the final publication | **9** End-to-End Validation | `R-OPS`, `R-QAS` | final approval only at Phase 9; approval *records* exist from 4d |
| A-18 | Successfully print and assemble a physical booklet | **9** End-to-End Validation | `R-PRT` (manual sign-off) | **manual; excluded from the automated gate** |

**Coverage.** §15.1 (manuscript) is proved by A-01/A-02; §15.2 (composition) by A-03…A-09; §15.3 (HTML) by A-10/A-11; §15.4 (print) by A-12…A-16 + A-18; §15.5 (operational) by A-14…A-17 and §6. Together with the scripture-fidelity suite (§3) and the print/HTML/operational suites (§4–§6), the 18 demonstrations cover all five §15 acceptance families on **one** approved revision triple.

---

## 10. Contradictions and gaps reported, not edited

Per convention (`docs/00` §4.1), reported here rather than fixed in another document.

| # | Where | Issue | Resolution taken here |
|---|---|---|---|
| 1 | `docs/14` §0.1 vs `docs/11` §2.5 | `docs/14` states the registry has **213** codes; `docs/11` §2.5 sums to **210** (31 + 80 + 26 + 31 + 42). | This document treats the registry as `docs/11` §2 declares it (the owner wins, `docs/00` §3.2); it references codes by name, so no count is asserted. `docs/14` should be reconciled to `docs/11`. — **Closed (round 3).** `docs/14` §0.1 now reads **212** registered codes, and `docs/11` §2.5 gives `31 + 80 + 26 + 32 + 42 = 211` rows plus `DIG_FONT_FALLBACK_METRIC_DRIFT`, filed in §2.4 beside its print sibling (`DIG_` prefix intact) — **212** registry rows, with §2.4 carrying its full 33-row print family. The `213` / `210` pair is gone and the two documents agree. |
| 2 | `docs/11` §2.4 | The border-consistency codes (`PRINT_BORDER_INCONSISTENT`, `PRINT_BORDER_GEOMETRY_MISMATCH`) carry **no numeric tolerance**; §15.4 "uniform page borders" is therefore not decidable as written. | This document authors a tolerance: **± 0.05 `_mm_` per edge, ≤ 0.05 `_mm_` spread across pages** (§4.2), derived from the frame being computed once from `dsg_rev`. Offered for `docs/11`/`docs/09` to ratify or replace. |
| 3 | `docs/13` §7 vs `docs/12` §8 | Both are correct: the manual proof is **A-18** and **D-16** is length targeting. No contradiction remains; restated here because the earlier authoring briefs conflated them (`docs/REVIEW-RECONCILIATION.md` §5). | Follows the register; A-18 is a manual proof (§2.1, §4.6). |
| 4 | `docs/08` §4.2/§4.3 vs `docs/09` §7.1/§7.4 | The frame's reference edge (text box vs trim) is a reported, resolved contradiction; `docs/09` (the token owner, D-11) wins — the frame is measured from the **trim** edge, symmetric about the leaf. | This document follows `docs/09`: frame offset `8.000 _mm_` from the trim, symmetric (§4.2). `docs/10` §11.2 B-9 records the same resolution. |
| 5 | **`docs/16` §1.2 — this document** | The fixture's own length parameters produced **20** print pages, not the 16 §14.1 requires: `target_words 1400` was *authored* rather than derived from a page target the spec names three times (§3.2, §14.1, §18), so nothing in the set could notice the miss. Then the *derived* replacement (`1314`) was arithmetically correct and still impossible: it assumed 100 % page fill, and the solver's own cost function prefers twelve balanced pages to nine dense ones, so it returned `M = 20` anyway. | **Re-parameterised from the page target at the resolved density ceiling, less a reserve**, per D-16 as amended (`docs/17` Part A): `target_words = 9 × 16 × 7.3 − 29.2 = **1022**`, and §1.2.1 shows the penalty arithmetic by which the DP returns nine story pages — not merely that `1022/16/7.3` divides to 9. A miss is now `PRINT_PAGE_COUNT_OFF_TARGET` (`docs/11` §2.4). Recorded here because the fixture is this document's own artefact; the decision itself is amended in `docs/17`. *(Superseded by the probe measurement — row 16 (`7.9` / `1106`), itself superseded by the corrected method — **row 19**: `8.6` / `1204` — which is in turn superseded by **row 20**: `7.9` / `1106` again, measured in the shipped face.)* |
| 6 | `docs/16` (this document) §1.6 vs §2 A-12 — **internal, now closed** | The `pg_dg_*` placeholder row hard-coded "story `5–13`, back `14–16`" while §1.1's own row and line 25 of the acceptance table state that the page count is an **output** of the solve. A hard-coded index list cannot be right for a plan whose length is computed. | Both places now state the **band structure** (`k_f` front, then `s` story, then `k_b` back, with `k_f + s + k_b + pad = M`) and note that `5–13` / `14–16` is that structure evaluated at this fixture's `f = 4, s = 9, b = 3`. A-12 asserts the structure, not the literals. |

**Rows 7–15 were added by the length-model pass** (review round 2, blocker 2 and "what the fixes broke" items 1, 4–7, 9). Each names a file this document does not own, so each was **reported, not edited here** — and each is now kept as a **record** rather than as a live finding: rows 7–10 and 12–15 have since been applied in their owning documents and are marked **closed** below with what changed; **row 11 remains reported** (`docs/10` §3.4 vs `tools/verify-imposition.py`, whose `check_v4` still accepts an adjacent-sheet centre pair).

| # | Where | Issue | Resolution taken here |
|---|---|---|---|
| 7 | `docs/11` §2.1 | `CONTENT_LENGTH_UNDER_TARGET` still reads "(D-16 makes page count the output, not the goal)" — the reverse of amended D-16 — and `CONTENT_LENGTH_OVER_TARGET` still tests `words > target_words × (1 + word_tolerance)`, an **upper** tolerance that no longer exists (`§1.2`, `docs/05` §1.6 item 4). | Recorded. `docs/11` owns the registry; both rows must become **one-sided** — under-length below `0.85 × target_words` (`869`), and **any** excess above `target_words` (which is where the page target is missed, at `1051` words). — **Closed (round 3).** `docs/11` §2.1 now reads exactly that: `CONTENT_LENGTH_UNDER_TARGET` is `major · none` testing `words < target_words × (1 − word_tolerance)` — the **lower-only** band, `0.85 × 1022 = 869 _words_` — and `CONTENT_LENGTH_OVER_TARGET` is now `minor · none` testing `words > target_words`, the non-existent upper band removed. *(Superseded by row 16, and again by row 19: the bounds become `0.85 × 1204 = 1023 _words_` and the page target is missed above `1238` words; `docs/11` §2.1 itself still carries the `869`/`1022` pair — see row 17.)* |
| 8 | `docs/14` §4.1 | The fixture row still carries `target_words` derived = **`1314`** ("9 story pages × 146 `_words_`/page"). | Recorded. `docs/14` owns the fixture rows; the row should read `1022 = 9 × 16 × 7.3 − 29.2`, with `balanced_lines_per_page 16`, `words_per_line_measured 7.3`, `resolved_density_band 0.35 / 0.78`. — **Closed (round 3, then re-corrected).** `docs/14` §4.1 now reads `target_words` **derived** = **`1204 _words_`** = 9 story pages × 16 balanced lines × 8.6 `_words_`/line − 34.4 `_words_` reserve, at the resolved band `0.35 / 0.78` (the `1022`/`7.3`/`29.2` triple this row first quoted was superseded by the probe measurement, row 16, and that `1106`/`7.9` pair in turn by the corrected method, row 19); `1314` no longer appears in the fixture rows. |
| 9 | `docs/09` §7.4 | Two things: `C2` needs `thickness_inner_pt` / `gap_mm`, which `docs/04` §6.1 now carries; and §7.4's worked band (`8.000 … 8.2646 mm`, clearance `10.085 mm`) is a **`single_rule`** band on a **`double_rule`** theme. With §7.1's own values it is `8.000 … 10.0292 mm` and the clearance is `8.32 mm`; the gap `8.2646 → 9.7646` is `gap_mm` 1.5 and `9.7646 → 10.0292` is the inner 0.75 `_pt_` rule. | Recorded here and corrected in the two documents that own the geometry (`docs/08` §4.2 `C2`, §4.3 band). `docs/09` §7.4 should adopt the same band and figures. — **Closed (round 3).** `docs/09` §7.4 now carries `8.000 … 10.0292 mm` and the `8.32 mm` clearance (its `C2` reference line reads `10.0292 + 3 = 13.0292 ≤ min(18.35, 25.35) = 18.35` ✓, `PRINT_BORDER_TEXT_COLLISION` critical), and `docs/08` §4.2/§4.3 carry the same. |
| 10 | `docs/11` §2.4 | `PRINT_GUTTER_INSUFFICIENT` can only fire when `text_box_width_mm > trim_width_mm + binding_allowance_mm` (`> 142.7 mm` on half-letter), because the shift model gives `50.7 mm` of clear space across the fold — which strains `docs/11` §5.1's `G1` ("every code in §2 has ≥ 1 fixture that fires it", `T-QAS-001`). And `PRINT_GUTTER_EXCEEDS_MARGIN` is stated over `min_side_text_margin_mm` where `C4` binds only the **spine-side** inset. | Recorded here and in `docs/08` §4.2. `docs/11` owns the registry and the fixtures' requirement: either a firing fixture built from a deliberately over-wide custom paper (`docs/08` §4.1 permits one), or retirement of the code. — **Closed (round 3).** `docs/11` §2.4 now binds `PRINT_GUTTER_EXCEEDS_MARGIN` to the **spine-side** inset alone (`safe_area_mm + gutter_mm + binding_allowance_mm > spine_side_inset_mm`, `6 + 4 + 3 = 13.00 ≤ 25.35`), explicitly **not** a `min(...)` over the two insets, and records `PRINT_GUTTER_INSUFFICIENT` as **dormant for V1** — `G1`'s firing fixture is to be a purpose-built synthetic design revision declaring a text box wider than the sheet's half. |
| 11 | `docs/10` §3.4 vs `tools/verify-imposition.py` | V4's prose requires the centre pair to be on the **same** sheet, but the script's `check_v4` asserts only `abs(i_p − i_q) ≤ 1`, which also accepts an adjacent-sheet centre pair. | Recorded. `docs/10`/`tools` own it: the check should be `abs(sheet(p) − sheet(p+1)) == (0 if p == M/2 else 1)`. |
| 12 | `docs/14` §3 | V2 and V4 exist only as engine guards. | **Declared in `docs/14`:** `T-PRT-043` is V1 as a *property* test; V2 and V4 need property twins — `T-PRT-104` (parity — for all generated `M ≡ 0 (mod 4)`, every odd page lands in a right panel and every even in a left) and `T-PRT-105` (facing pairs — for all generated `M`, for every even `p`, `p` is on a left panel, `p+1` on a right, and `abs(sheet(p) − sheet(p+1)) == (0 if p == M/2 else 1)`). — **Closed (round 3):** both are declared in `docs/14` §3 (`T-PRT-104`, `T-PRT-105`, §3.24's round-2 additions), and `docs/14`'s id grammar is `T-<AREA>-<nnn>`, so the two ids first offered here — `T-PRT-043` carrying a trailing `b`, and carrying a trailing `c` — were never declared and never could be: a trailing letter is not a declaration row. |
| 13 | `docs/14` §3, `docs/13` | No test covers the length-model derivation, `PRINT_PAGE_COUNT_OFF_TARGET` firing, or the fixture's own `page_count == 16`. | **Declared in `docs/14`** (round-2 additions, §3.24): `T-WIZ-015` (derivation — the blueprint's `target_words` equals `story_pages_target × balanced_lines_per_page × words_per_line_measured − reserve_words` for a generated `(band, words_per_line)` pair), `T-WIZ-016` (`PRINT_PAGE_COUNT_OFF_TARGET` firing — after the pad-to-a-multiple-of-four step, `print.page_count ≠ target_print_pages` raises it and no mid-story pad or prose expansion closes the gap), and `T-PRT-106` (the fixture plans to exactly `16` pages with no `OFF_TARGET`, **and** the `0.88`-default derivation `1248` also plans to 16 — the band-insensitivity claim of §1.2.1). The earlier attribution to `T-CMP-090` and `T-PRT-070` was wrong: those rows are `example-e2-content-lock` (a proposal refused at creation) and `print-guide` (the §9.5 print guide), and neither covers any of the three obligations. — **Closed (round 3):** the three covering rows are now declared. |
| 14 | `docs/10` §6.3 | Calls `docs/08` §4.2 "the outlier" for measuring from the text box; `docs/08` has measured the frame from the **trim** since review round 1. | Recorded. `docs/10` owns the sentence. — **Closed (round 3).** `docs/10` §6.3 now states that `docs/08` §4.2 measures the frame from the **trim** edge too, so the two agree, and marks the earlier `single_rule` band with its `10.085 mm` clearance **and** the "the outlier" wording as **both superseded**. |
| 15 | `docs/06` | Shows the digital page range as **`14–18`** where `docs/08` §3.8 — the owner — says `9–18` for the same fixture. | Recorded here and in `docs/17` D-06's consequence. `docs/06` should follow `docs/08`. — **Closed (round 3).** `docs/06` §3.4 now shows **`9–18`** and marks the earlier `14–18` figure as wrong and superseded; `docs/17` D-06's consequence records the same, and `docs/04` §5.1's `measured_at[]` carries the two endpoints (`18` at `360×640`, `9` at the wide spread). |
| **16** | `docs/05` §1.6 item 6, and the whole length model derived from it | The `measure_probe` fixture (`fixtures/measure/probe.en.early.txt`) **had never been created**, so `words_per_line_measured = 7.3` — and every figure derived from it — rested on a number nothing in the repository produced. The build measured the passage for the first time (pinned Chromium `153.0.8010.12`, clean reference box `23221/64 q`): `197 _words_` over **`25`** line boxes `= 7.88 → **7.9**`. The manuscript's own prose independently measures `1008 / 128 = 7.875`. | **Corrected here and in `docs/05` §1.6, `docs/13`, `docs/14`, `docs/16` §1.2/§1.2.1, `docs/17` D-16, `docs/00` §6 and `spec/requirements.json`**: `words_per_line_measured 7.3 → 7.9`, `words_per_page_measured 116.8 → 126.4`, `reserve_words 29.2 → 31.6`, `target_words 1022 → 1106`, floor `869 → 940`, `0.88`-default `1153 → 1248`, tipping-point word figure `1051 → 1138`. The superseded values are retained as **history** in `docs/05` §1.6 item 6 with the reason (*the probe was never materialised*). **Unchanged, because they depend on the box and the band and not on words per line:** `story_pages_target 9`, `balanced_lines_per_page 16`, `capacity_lines_per_page 20`, `= floor(35800/1728)`, the `144`/`145`-line tipping point, and `M = 16`. A new test, `T-WIZ-017`, pins the measured figure to the version-controlled probe so the class cannot recur silently. **This correction came from building the thing**; the constant survived three review rounds because every reviewer compared documents to documents. **This row's own `25` line boxes / `7.9` was itself wrong — it counted fragment rects, not line boxes — and is superseded by row 19 (`23` line boxes / `8.6`), which is in turn superseded by **row 20**: `23` was the right instrument in the wrong face, and the shipped face gives `25` line boxes and `7.9` again — the value that stands.** |
| **17** | `docs/04` §3/§4.2 and `docs/11` §2.1 | Both still carried the **superseded** budget. `docs/04` §3's `target_words: 1022` and §4.2's `stats` example (`words 1022`, `chars 5852`, `reading_minutes 6.8`); `docs/11` §2.1's `CONTENT_LENGTH_UNDER_TARGET` bound `0.85 × 1022 = 869`. | **`docs/04` corrected (in this document's sibling pass); `docs/11` reported, not edited.** `docs/04` §3 now reads `target_words: 1204 = 9 × 16 × 8.6 − 34.4`, and §4.2's `stats` example reads `words 1204`, `chars 6895`, `reading_minutes 8.0` (`round(1204 ÷ 150, 1)`). `docs/11` §2.1, which this document does not own, must make the same move from its `0.85 × 1022 = 869` bound to `0.85 × 1204 = 1023`; it is handled in that document's own pass. Both generations of superseded figures (`1022`/`869`/`5852`/`6.8`, then `1106`/`940`) are retained as history (rows 16, 19). *(Both the `869` and the `1023` bounds are superseded by **row 20**: the floor is `940` and the page target is missed above `1138` words.)* |
| **18** | the length-model cascade itself, as first propagated | The cascade as first stated read `target_words = 9 × 16 × 7.9 − 29.2 = 1108` and floor `942` — figures that keep the **superseded** `29.2` subtrahend while moving the reserve itself to `31.6`. With the reserve the formula actually defines (`4 lines × 7.9 = 31.6`; `docs/05` §1.6 item 1), `9 × 16 × 7.9 − 31.6 = 1106.0`, and the floor is `0.85 × 1106 = 940`. | **This document and its siblings use `1204` / `1023`** (row 19) — the same formula, the corrected input — because `T-WIZ-015` asserts exactly that identity against the fixture. The `1108` / `942` pair is retained here as the record of that arithmetic slip, and the later `1106` / `940` pair (row 16) the same way; `fixtures/measure/README.md` now carries the corrected figures and the methodology note. *(Superseded by **row 20**: the value that stands is `1106` / `940`.)* |

| **19** | `docs/05` §1.6 item 6 (again), `docs/08` §2.2, and `docs/09` §1.7 | The probe *had* been materialised and measured, but the measurement counted **line fragments**, not line boxes: `Range.getClientRects()` returns one rect per line *fragment*, so a line containing an inline element yields several. The line count was taken as the rect count (**`25`**) instead of the element's height divided by the line pitch, which gives **`23`** — so `words_per_line_measured = round(197 ÷ 25, 1) = 7.9` was wrong a second time. The underlying cause is `docs/09` §1.7's **assumed 0.5 em mean character advance** (≈ 40.3 characters per line): the theme's real body face at 18 px_css has a `0.440 em` advance = 7.918 px_css → ≈ 45.83 characters per line → 23 lines. A sweep confirmed that `27` boxes would require either a 300 px content box (79.2 mm, not 96 mm) or a ~21.5 px body (16.1 pt, not 13.5 pt); font substitution and hyphenation do not explain it. | **Corrected here and in `docs/05` §1.6, `docs/08` §2.2, `docs/09` §1.7, `docs/13`, `docs/14`, `docs/16` §1.2/§1.2.1, `docs/17` D-16, `docs/00` §6 and `spec/requirements.json`**: `words_per_line_measured 7.9 → 8.6` (`197 / 23 = 8.565`), `words_per_page_measured 126.4 → 137.6` (`16 × 8.6`), `reserve_words 31.6 → 34.4` (`4 × 8.6`), `target_words 1106 → 1204` (`9 × 16 × 8.6 − 34.4`), floor `940 → 1023` (`0.85 × 1204`), `0.88`-default `1248 → 1359` (`9 × 18 × 8.6 − 34.4`), tipping-point word figure `1138 → 1238` (`144 × 8.6`), capacity words/page `158 → 172` (`20 × 8.6`). `docs/08` §2.2's claim that `getClientRects()` yields "one DOMRect per line box" is itself wrong and is corrected there — it is one per line *fragment*, and the line count is `round(height_q ÷ line_height_q)`, exactly `q(element.getBoundingClientRect().height)`. `docs/09` §1.7 now marks the `0.5 em` advance as an assumption measured against (`0.440 em`) and states the rule: a character-advance figure must be measured on the concrete face at the concrete size, never assumed. The line-based quantities (`story_pages_target 9`, `balanced_lines_per_page 16`, `capacity_lines_per_page 20`, the `144`/`145`-line tipping point, `M = 16` as the *target*) are unchanged. **This constant was wrong twice — once for a missing artefact and once for a wrong instrument — and a third time for a wrong *face*: see row 20.** |
| **20** | `docs/05` §1.6 item 6 (again), `docs/08` §2.6/`docs/09` §1.7/§6, and the whole length model | The constant was wrong a third time: the **right instrument in the wrong face**. The harness called `document.fonts.load('18px "Lora, 'Iowan Old Style\', Georgia, serif"')` — the **whole quoted stack** — which matches no face and resolves without fetching anything, so Chromium silently rendered a fallback while `document.fonts.check()` still answered "available". The `23` line boxes were a fallback's count. Measured in the face the book ships (`app/assets/fonts`, Lora, embedded as base64 `woff2` subsets), the probe is `197 _words_` over **`25`** line boxes `= 7.880 → **7.9**`, and the measurement now **asserts the face** by comparing advance widths against a family that cannot exist. A **second finding** rides with it: the budget never reserved lines for the beat's `role: "scripture"` displays, so `9 × 16 = 144` lines are not all available to prose — reserving `26` scripture lines and `1` heading line leaves `117`, and `117 × 7.9 = 924 _words_`, not the `1106` the total-line formula yields.  | **Corrected here and in `docs/05` §1.6 items 6–7, `docs/00` §6, `docs/01` `R-WIZ-015`/`R-WIZ-017`, `docs/04` §3/§4.2, `docs/08` §2.2/§2.6.1/§9.5, `docs/09` §1.7/§6/§6.1a, `docs/13`, `docs/14` §3.23.3/§4.1, `docs/17` D-16, `spec/requirements.json` and `fixtures/measure/README.md`**: `words_per_line_measured 8.6 → 7.9` (`197 / 25 = 7.880`), `words_per_page_measured 137.6 → 126.4` (`16 × 7.9`), `reserve_words 34.4 → 31.6` (`4 × 7.9`), `target_words 1204 → 1106` (`9 × 16 × 7.9 − 31.6`), floor `1023 → 940` (`0.85 × 1106`), `0.88`-default `1359 → 1248` (`9 × 18 × 7.9 − 31.6`), tipping-point word figure `1238 → 1138` (`144 × 7.9`), capacity words/page `172 → 158` (`20 × 7.9`). The bridge now asserts the rendered face (`docs/08` §2.6.1) and reads the same `app/assets/fonts` directory as the emitter (`docs/09` §6, §6.1a). The split is a new rule and a new requirement — `docs/05` §1.6 item 7 / `R-WIZ-017`, verified by `T-WIZ-018`; the face assertion is added to `T-WIZ-017`. **Unchanged:** `story_pages_target 9`, `balanced_lines_per_page 16`, `capacity_lines_per_page 20`, the `144`/`145`-line tipping point, `M = 16`. |

### 10.1 Why the set's own checker could not see a citation to a test that does not exist — and the half of that gap still open

Row 12's first draft cited two `T-PRT-043`-family ids that carried a **trailing letter**, and neither had a definition row in `docs/14` — the V2/V4 property twins are declared there as `T-PRT-104` and `T-PRT-105`. **`tools/check-traceability.py`'s `C7` check reported zero for them**, because the revision in force at audit time collected cited ids with

```python
re.findall(r"\bT-[A-Z]{3}-\d{3}\b", text)
```

The trailing `\b` requires a word boundary immediately after the third digit, and a **letter is a word character**, so the pattern captured the *declared* `T-PRT-043` and silently discarded the trailing letter. The row therefore passed on a false positive: a citation of the V1 test stood in for a citation of a test that did not exist. The same pattern parses `docs/14`'s declaration rows, so an id grammar admitting a trailing letter would have been partly invisible on both sides of the check.

**Where the gap now stands, stated exactly.**

| Scan | Pattern in force | Sees a trailing-letter id? |
|---|---|---|
| `tools/check-traceability.py` — `C7` (and its `C1`/`C2` mention set) | `\bT-[A-Z]{3}-\d{3}[a-z]?\b` — tightened by commit `45c783c`, whose subject is precisely this blind spot | **yes** |
| `tools/gen-checklist.py` — `TEST_ID_RE`, used by its own `C7` | `\bT-[A-Z]{3}-\d{3}\b` — still the old pattern | **no** |

The two checkers therefore **disagree** on the same corpus: on a suffixed id, `check-traceability.py` reports it as undeclared and exits non-zero, while `gen-checklist.py` reports `C7 = 0` and exits clean. A set that runs both and takes the green one is checked by the weaker of the two. The tightened pattern also found a live instance on its first run — one suffixed citation survives in `docs/REVIEW-RECONCILIATION.md`, a register this document does not own and so reports rather than edits (`docs/00` §4.1). `tools/` is not this document's file, so the remaining instance is **reported, not patched**: `gen-checklist.py:191`'s `TEST_ID_RE` needs the same `[a-z]?` (and, if the grammar is meant to be closed, an explicit rejection of ids whose definition row cannot be anchored).

This document's side of the fix is the citation itself: it now names only ids that carry a declaration row, and writes `T-PRT-043` with a spelled-out suffix where the discarded-id incident has to be described at all.
