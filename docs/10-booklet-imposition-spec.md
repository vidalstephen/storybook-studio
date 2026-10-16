# Booklet Imposition Specification

**Implements:** spec §9.4 (booklet imposition), §9.5 (print instructions), §9.1 (fixed-page renderer), §9.2 (consistent borders), §15.4 (print quality), §12.4 (deterministic formatting)
**Deliverable covered:** D12 (per §16 item 12)
**Inherits:** `docs/00-README.md` (§3 identifier schemes, §4 conventions), `docs/03-technical-architecture.md` (§5.2, §5.3, §9), `docs/04-project-data-schema.md` (§5.1, §5.2, §6.1, §6.2, §7.4, §8, §10), `docs/05-content-and-composition-model.md` (Part 2, Part 3), `docs/07-lock-and-constraint-rules.md` (§5.4), `docs/08-pagination-strategy.md` (Part B — §4.1–§4.7, §9), `docs/11-validation-strategy.md` (§2.4 registry), `docs/13-incremental-roadmap.md` (§3.6–§3.7), `docs/14-test-plan.md` (§3.10–§3.11), `docs/17-decisions-and-open-questions.md` (D-04, D-05, D-14, D-16, D-01, Q-04)

`docs/08` (Part B) and `docs/11` §2.4 are binding on this document: print page boxes, margins, safe area and the D-16 pad rule come from `docs/08` §4.2/§4.5/§4.6, and **every finding code below is taken from `docs/11` §2.4 rather than minted here**. Two `docs/08` defects that bear on imposition are reported in §11.2 (not edited).

---

## 1. Definitions and scope

### 1.1 Scope

| Item | V1 value | Source |
|---|---|---|
| Imposition family | **saddle-stitch, 2-up, fold-in-half** only | §9.4 ("For saddle-stitched booklets") |
| Output | one imposed **booklet PDF** (`art_` kind `booklet_pdf`) + one **print guide** (`art_` kind `print_guide`) | §9.4, §9.5, `docs/04` §7.4 |
| Page content | text only | §1.2 V1 scope |
| Arithmetic | pure function of `(M, paper, spec_version)`; no measurement, no AI, no I/O | §12.4, `docs/03` §2, D-04 |
| Out of scope in V1 | perfect binding, coil/comb, 4-up/gang, cover on heavier stock, bleed, crop marks, landscape leaves | §16 item 12 names only "booklet imposition"; §9.4 names only saddle-stitch; `docs/08` §4.1 ("a landscape leaf is out of scope for V1") |

The engine's public seam is `impose(pages, paper, spec) -> Sheets` in `src/print/imposition/` (`docs/03` §4). It is called by `bookletPdf()` and by the sheet preview; **no other code computes sheet order** (§5.1).

### 1.2 Terms

| Term | Definition in this document |
|---|---|
| **booklet page** | One `Page` of the print `PagePlan` (`docs/04` §5.1 `print.pages`, §5.2). A physical printed side of the folded booklet. Numbered `1..M`. |
| **M** | `print.page_count` — total booklet pages, always a multiple of 4 (`docs/04` §5.1). |
| **N** | the pre-pad content page count `f + s + b` (`docs/08` §4.5). `M = N + pad`. |
| **sheet** | One physical piece of paper, carrying 4 booklet pages (2 per side). `S = M/4` sheets. |
| **sheet index i** | `1..S`, counted **from the outside** (`i=1` is the outermost sheet = the one holding the cover). |
| **side** | `front` (side 1, printed first) or `back` (side 2, the reverse). |
| **panel** | One half of a sheet: `L` (left half) or `R` (right half), delimited by the fold line at `x = sheet_w_mm/2`. Each panel's box **is** the booklet trim size, up to the A-series residual (§6.1). |
| **front / back** | "front" = side 1 of a sheet; "back" = its reverse. Never "front cover"/"back cover" (those are booklet pages 1 and M). |
| **head** | The top edge of a sheet in its as-printed orientation (`y = 0`). The head is preserved across a correct duplex flip; a flip that moves the head is the failure mode in §4.4. |
| **spine** | The fold line, at `x = sheet_w_mm/2`, vertical for every V1 preset. |
| **trim** | The finished booklet page size = one panel = `paper.trim_*_mm` (`docs/08` §4.1). |
| **gutter** | `design.layout.gutter_mm` = 4 mm — the clear space that must remain between the two **facing text boxes** across the spine (`docs/04` §6.1; `docs/08` §4.2: "used by the spread proof and the imposition spread check, not subtracted twice from a single leaf"). |
| **binding allowance** | `design.layout.binding_allowance_mm` = 3 mm — extra inset the fold/stitch consumes, added to the **inner** side only (`docs/04` §6.1; `docs/08` §4.2). |
| **safe area** | `safe_area_mm` = 6 mm — the distance from the **trim edge** that survives cutting and folding; no content and no border **ink** may fall closer (`docs/09` §7.4, `docs/08` §4.2). |
| **frame offset** | `border.offset_mm` = 8 mm — the perimeter frame is **measured from the trim edge** and is symmetric about the leaf, so it is identical on both pages of a spread (`docs/09` §7.1/§7.4, `docs/04` §6.1). |
| **creep / shingling** | The fore-edge protrusion of the inner sheets of a folded nested stack, caused by their smaller fold radius. Measured in `_mm`, monotonic in sheet index. |
| **flip edge** | The pair of sheet edges about which the printer turns the paper to image the back side: `long` or `short`. Also called the driver's "binding edge". |
| **long-edge duplexing** | Back side imaged so that the sheet is turned about its **long** edge (the longer pair of edges). |
| **short-edge duplexing** | Back side imaged so that the sheet is turned about its **short** edge. |
| **head-preserving flip** | A flip whose axis is **parallel to the spine**; the fold line stays vertical and the head stays at the top. The only correct flip for a booklet (§4). |
| **residual** | `r = sheet_w_mm − 2 × trim_w_mm` — the slack left by A-series / imperial size rounding; 0 for `half_letter`, 1.0 mm for `a5` (§6.1). |
| **spec_version** | `imposition.spec_version` — the arithmetic version in `imposition/spec.json` (`docs/04` §8) and in every artifact manifest (D-14). |

### 1.3 What V1 compensates for, and what it only documents

| Physical effect | V1 behaviour | Grounds |
|---|---|---|
| **Fold-line placement** | **Compensated.** The fold line is pinned to the media centre; every page is placed in exact panel coordinates (§6.2). | §9.4 "Pages must be ordered correctly for folding", §9.1 |
| **Spine-side loss from binding** | **Compensated.** The **text box**, not the frame, absorbs `gutter_mm` + `binding_allowance_mm`; the frame stays symmetric about the trim (`docs/09` §7.1, §7.4). | §9.2, `docs/04` §6.1 |
| **Parity to a multiple of four** | **Compensated** by inserted blank booklet pages, at front/back matter boundaries only (§2). | §9.4 "Total imposed pages must be a multiple of four", D-16 |
| **Creep / shingling** | **Compensated above a threshold**, otherwise **only measured and documented**. Formula and threshold in §6.4; reported in the print guide. | §9.2 "Remain visible after … folding under the selected production settings" |
| **A-series residual (0.5 mm per panel on `a5`)** | **Compensated** by placing panels flush to the fold (§6.2) and letting the residual fall in the outer margins. | §9.1 "Fixed inner and outer margins" |
| **Fore-edge trim of the inner sheets** | **Documented, not performed.** V1's crop-mark policy is "none" (§6.3); the engine budgets a nominal `fore_edge_trim_mm` only in order to check the frame (§6.6). | §9.2, §15.4 "Safe print margins" |
| **Ink show-through / opacity, paper grain, humidity** | **Documented only.** Named in the print guide's notes; no arithmetic effect. | §15.4 |
| **Printer scaling / "fit to page"** | **Documented, then asserted against.** The guide mandates actual-size printing; the engine cannot detect it, so the preview (§5) is the check. | §9.5 "Actual-size printing guidance" |
| **Colour management / ICC** | **Documented only.** No colour in V1. | §1.2 |

**Rule (D-04).** Imposition changes **only order and placement**. It never measures, never re-solves pagination, never alters a `Page`'s spans, and never calls AI. A change to the number of pages is a pagination act (`paginatePrint`, `docs/03` §5.2 step 5, `docs/08` §4.6) and precedes imposition.

---

## 2. Pad to a multiple of four

### 2.1 Where padding happens

`paginatePrint()` (`docs/03` §5.2 step 5; `docs/08` §4.6) is the only component that inserts a page. Imposition **requires** `M % 4 == 0` and refuses otherwise (§9). This split is what makes the arithmetic pure (D-04): `T-PRT-049` asserts that imposition performs **no measurement and no AI call** (pure reordering) — it does **not** assert the `M % 4` refusal. The count itself is asserted by `T-PRT-026` (golden: `page_count % 4 == 0`), the property forms `T-CMP-035` / `T-PRT-011`, and the pad-split by `T-PRT-025` (`docs/14` §3.10).

### 2.2 The content page list

Before padding, pagination has produced the ordered content list of `docs/08` §4.5:

```
page index 1   … f      front matter   (title, copyright, dedication, contents, …)  placed, frozen
page index f+1 … f+s    story pages    (solved over ms_rev in beat order)
page index f+s+1 … f+s+b back matter   (memory verse, discussion questions, about, closing, blanks)
```

Front matter resolves **before** story pages so that story numbering is stable (§9.4 "Blank pages must be inserted deliberately"; `docs/05` Part 2).

### 2.3 The pad function

```
N     = f + s + b                         # content pages, _pages        (docs/08 §4.5)
pad   = (4 - (N mod 4)) mod 4             # blanks to insert, _pages     (docs/08 §4.6)
M     = N + pad                           # imposed page count, _pages
S     = M / 4                             # sheets, _sheets
```

Insertion positions, in the only order that is legal:

| Rank | Position | Condition | Rationale |
|---|---|---|---|
| 1 | **Back boundary** — after the last back-matter page | always available | D-16(a); `docs/08` §4.6 rank 1 |
| 2 | **Front boundary** — immediately after the last front-matter page, before the first story page | only when the back boundary is unavailable (e.g. a frozen back-matter page that cannot receive trailing blanks) | D-16(a); `docs/08` §4.6 rank 2 |
| 3 | *(forbidden)* anywhere between two `story` pages | — | `COMP_IMPOSITION_PADDED_MIDSTORY` (major, `docs/08` §4.6) |

The arithmetic is fully determined by `(N, back-boundary availability)` — no randomness, no heuristic.

Two further blanks are **content**, not padding, and are counted inside `N`: the verso of the title page and the verso of a single-page copyright notice (§9.4 "Blank pages must be inserted deliberately where needed"). They are authored during front/back-matter resolution, before the pad function runs (`docs/08` §4.5).

> **Reconciliation (`docs/08` §4.6).** `docs/08` writes rank 2 as "at the front-matter boundary (before page 1)". Taken literally this inserts a blank at index 1, which occupies the booklet's **front cover** (panel `R` of sheet 1 front, §3.2) and contradicts `docs/08` §4.5's own front-matter-first placement rule. Rank 2 is therefore specified here as the front-matter/**story** boundary — after the last front-matter page, before the first story page. An author-supplied leading blank is a front-matter `Page`, not a pad. Reported in §11.2.

### 2.4 Deliberate blank vs accident

| Case | Representation | Finding |
|---|---|---|
| Deliberate (padding) | `Page.kind == "blank"`, `blank_intentional == true`, `blank_intentional.reason` ∈ `{pad_to_multiple_of_four, front_matter_verso, copyright_verso, back_matter_recto}` (`docs/04` §5.2) | none |
| Deliberate (authored) | same, `reason` set by the author, plus an `Action` (`act_`, `docs/04` §5.4) with `kind: create_page` | none |
| Accident: blank without a reason | `kind == "blank"`, `blank_intentional.reason` empty/absent | **`COMP_BLANK_UNINTENDED`** — major (`docs/08` §4.6, `docs/05` Part 3 #8) |
| Accident: blank at an imposed position with no record | reaches a sheet slot with no `blank_intentional` record | **`PRINT_REVERSE_SIDE_BLANK_UNRECORDED`** — major (`docs/11` §2.4) |
| Accident: empty page that is not `kind == "blank"` | `spans == []` and `kind != "blank"` | **`PRINT_IMPOSITION_PAGE_ERROR`** — critical, "replaced by an unexpected blank" (`docs/11` §2.4); `COMP_BLOCK_LOST` (critical) if blocks are unaccounted for |
| Accident: padding landed mid-story | blank page between two `story` pages | **`COMP_IMPOSITION_PADDED_MIDSTORY`** — major, D-16 |

A blank is therefore never "merely empty": it is a `Page` with a kind, an explicit intent flag, a reason string, and — for padding — a deterministic position. Anything else is a finding. §15.4's "No unintended blank pages" is exactly this check, at two levels: the **plan** level (`COMP_BLANK_UNINTENDED`) and the **sheet** level (`PRINT_REVERSE_SIDE_BLANK_UNRECORDED`).

**Imposition's own check.** Because imposition sees only page numbers, it re-asserts the invariant independently: every page number it places must resolve to a `Page` whose `kind` is not `blank`, **or** whose `blank_intentional.reason` is non-empty. A blank that fails this is reported at the imposed slot as `PRINT_REVERSE_SIDE_BLANK_UNRECORDED` as well as at the plan position.

---

## 3. The imposition table (the complete arithmetic)

### 3.1 Constants

```
IMPOSITION_SPEC_VERSION = 1        # imposition/spec.json  (docs/04 §8, D-14)
ALGORITHM               = "saddle_stitch_2up_fold_half"
```

### 3.2 Sheet count and page assignment

With `i` = 1-indexed sheet number counted **from the outside**:

```
S        = M / 4

front_left (i)  = M - 2*(i-1)          # panel L of side 1
front_right(i)  = 2*(i-1) + 1          # panel R of side 1
back_left  (i)  = 2*(i-1) + 2          # panel L of side 2
back_right (i)  = M - 2*(i-1) - 1      # panel R of side 2
```

Equivalently, in terms of the fold position:

```
front_left(i)  = M - (i-1)*2       front_right(i) = 1 + (i-1)*2
back_left (i)  = 2 + (i-1)*2       back_right (i) = M - 1 - (i-1)*2
```

### 3.3 Inverse mapping (page → position)

For a page `p ∈ 1..M`, let `q = p` if `p ≤ M/2`, else `q = M - p + 1`. Then — **the `p ≤ M/2` qualifier on rows 1–2 is required**, because `q` alone does not distinguish the two halves and without it rows 1–2 overlap rows 3–4:

| `p` | sheet `i` | side | panel |
|---|---|---|---|
| `q` odd, `p ≤ M/2` | `(q+1)/2` | `front` | `R` |
| `q` even, `p ≤ M/2` | `q/2` | `back` | `L` |
| `q` odd, `p > M/2` | `(q+1)/2` | `front` | `L` |
| `q` even, `p > M/2` | `q/2` | `back` | `R` |

This inverse is the form the validator and the preview use, because it answers "where is page 7?" in one step.

### 3.4 The four invariants

| # | Invariant | Why it holds |
|---|---|---|
| **V1** | The multiset `{front_left(i), front_right(i), back_left(i), back_right(i) : i = 1..S}` is exactly `{1..M}` — no duplicate, no omission | §9.4 "Total imposed pages must be a multiple of four"; `docs/14` T-PRT-043 |
| **V2** | Every **odd** page lands in a **right** panel; every **even** page lands in a **left** panel | the standard recto/verso rule; a mirrored back side breaks it immediately — this is the check behind `PRINT_IMPOSITION_ORDER_WRONG` |
| **V3** | `front_right(1) == 1` and `front_left(1) == M` — page 1 on the outside front, right panel | §9.4 "Front and back placement must be correct"; the cover is a recto |
| **V4** | For every even `p ∈ [2, M-2]`, pages `p` and `p+1` are a **facing pair**: `p` on a left (`L`) panel and `p+1` on a right (`R`) panel, and the two sheet indices are related **exactly**: `i_p = i_{p+1}` when `p = M/2` (the centre spread — `back_L` faces `back_R` on the innermost sheet, `i = S`) and `\|i_p − i_{p+1}\| = 1` for every other even `p` — so the fold walk `1 \| 2,3 \| 4,5 \| … \| M-1,M \| M` reconstructs the reading order `1..M` | §9.4 "which pages will face one another" after folding. **The former text — "`p` and `p+1` differ by exactly 1" — is an arithmetic tautology and asserted nothing, and the looser reading that let the centre pair sit anywhere within one sheet asserted less than the grid does; this is the real facing-pair invariant.** `docs/14`'s `T-PRT-105` asserts it exactly, and `tools/verify-imposition.py`'s `check_v4` (`\|i_p − i_q\| ≤ 1`) checks its weaker necessary condition, so the script and this table pass together (`M ∈ {8, 12, 16}`: `8\|9` shares sheet `S` back; every other pair is exactly one sheet apart). |

### 3.5 Worked tables

**M = 8** — `S = 2` sheets, 4 sides.

| Sheet i | Side | Left panel | Right panel |
|---|---|---|---|
| 1 | front | 8 | 1 |
| 1 | back | 2 | 7 |
| 2 | front | 6 | 3 |
| 2 | back | 4 | 5 |

**M = 12** — `S = 3` sheets, 6 sides.

| Sheet i | Side | Left panel | Right panel |
|---|---|---|---|
| 1 | front | 12 | 1 |
| 1 | back | 2 | 11 |
| 2 | front | 10 | 3 |
| 2 | back | 4 | 9 |
| 3 | front | 8 | 5 |
| 3 | back | 6 | 7 |

**M = 16** — `S = 4` sheets, 8 sides.

| Sheet i | Side | Left panel | Right panel |
|---|---|---|---|
| 1 | front | 16 | 1 |
| 1 | back | 2 | 15 |
| 2 | front | 14 | 3 |
| 2 | back | 4 | 13 |
| 3 | front | 12 | 5 |
| 3 | back | 6 | 11 |
| 4 | front | 10 | 7 |
| 4 | back | 8 | 9 |

Flat page sequence, in print order (side 1 of sheet 1 first): `8,1,2,7,6,3,4,5` · `12,1,2,11,10,3,4,9,8,5,6,7` · `16,1,2,15,14,3,4,13,12,5,6,11,10,7,8,9`.

### 3.6 The check performed on these tables

The script is **`tools/verify-imposition.py`** — checked in, so the claim is reproducible; it generates the sheet grid from §3.2 and asserts V1–V4 and §3.3's inverse mapping. Run over `M ∈ {8, 12, 16}`:

```
$ python3 tools/verify-imposition.py
M  S     V1     V2     V3     V4    inv  flat seq                                 matches §3.5
8  2   pass   pass   pass   pass   pass  8,1,2,7,6,3,4,5                            pass
12 3   pass   pass   pass   pass   pass  12,1,2,11,10,3,4,9,8,5,6,7                 pass
16 4   pass   pass   pass   pass   pass  16,1,2,15,14,3,4,13,12,5,6,11,10,7,8,9     pass
```

| M | V1 permutation of `1..M` exactly once | V2 odd→R / even→L | V3 `p1 = front-right(sheet 1)`, `pM = front-left(sheet 1)` | V4 facing pairs `(p, p+1)`, `p` even |
|---|---|---|---|---|
| 8 | **pass** (`8,1,2,7,6,3,4,5`) | **pass** | **pass** — `1`→(1,front,R), `8`→(1,front,L) | **pass** — `2|3` S1b↔S2f, `4|5` S2 back (same side), `6|7` S2f↔S1b |
| 12 | **pass** | **pass** | **pass** | **pass** — `2|3`,`4|5`,`8|9`,`10|11` across sheets; `6|7` S3 back (same side) |
| 16 | **pass** | **pass** | **pass** | **pass** — `8|9` S4 back (same side) is the centre spread; all others across sheets |

The fold walk `1, 2,3, 4,5, …, M-1,M` reconstructs `1..M` exactly for all three values, which is V4 restated end to end. V2 is the load-bearing check: a **mirrored** back side (`back_left = M-2(i-1)-1`, `back_right = 2(i-1)+2`) still satisfies V1, still puts page 1 on the outside front, and is caught by nothing except V2 — which is why V2 is the validator's primary assertion (the script re-checks that a mirrored back side passes V1 and fails V2 for all three sizes).

### 3.7 Pseudocode

```
impose(pages, paper, spec):
  M = len(pages)
  if M % 4 != 0:  raise PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR
  if spec.spec_version != IMPOSITION_SPEC_VERSION:
                  raise PRINT_IMPOSITION_SPEC_MISMATCH
  S = M div 4
  sheets = []
  for i in 1..S:
     front = Side(panelL = pages[front_left(i)],  panelR = pages[front_right(i)])
     back  = Side(panelL = pages[back_left(i)],   panelR = pages[back_right(i)])
     sheets.push(Sheet(index=i, nesting_depth=i, front=front, back=back))
  assert_permutation(sheets, M)        # V1 -> PRINT_IMPOSITION_PAGE_ERROR
  assert_parity(sheets, M)             # V2 -> PRINT_IMPOSITION_ORDER_WRONG
  assert_cover(sheets, M)              # V3 -> PRINT_IMPOSITION_ORDER_WRONG
  assert_facing_pairs(sheets, M)       # V4 -> PRINT_IMPOSITION_ORDER_WRONG
  return Sheets(spec_version, M, S, sheets)
```

`assert_parity` (V2) and `assert_facing_pairs` (V4) are the two **discriminating** assertions and are asserted as **properties**: they must hold for *every* `M ≡ 0 (mod 4)`, not only for the worked tables of §3.5 — a mirrored back side passes V1 and V3 and is caught by V2 alone; a broken facing pair passes V1 and is caught by V4 alone. The invariants are asserted **here**, in the engine's `impose()` guard, and they are now declared in `docs/14` as well: `T-PRT-104` asserts V2 as a property over generated plans, and `T-PRT-105` asserts V4 — the exact relation above, whose weaker necessary condition `|i_p − i_q| ≤ 1` is what `tools/verify-imposition.py`'s `check_v4` checks — while `T-PRT-043` asserts V1 and `T-PRT-044` covers V3 and the assembly walk. `docs/14` owns the `T-` ids and this document does not mint one; `tools/verify-imposition.py` is the reproducible check of both invariants on the worked sizes.

The `assert_*` calls emit findings and abort the render (`docs/07` §5.4: no "closest possible" fallback; `docs/11` §2.4 marks every `PRINT_IMPOSITION_*` code `A·E·R`). The pseudocode is normative for order and abort behaviour, not for language.

---

## 4. Duplex and flip-edge rules

### 4.1 The one physical constraint

> **The duplex flip axis must be parallel to the fold line (the spine).** Nothing else about duplexing matters. (§9.4 "Binding orientation must be respected"; §9.5 "Appropriate flip-edge settings".)

A flip about an axis parallel to the spine keeps the head at the top and mirrors left↔right. A flip about the perpendicular axis rotates the back side 180° and is always wrong (§4.4).

### 4.2 Deriving the flip edge from data

The fold line is vertical in the as-printed sheet (V1 presets, §6.1). The flip axis is therefore vertical. The vertical edges of a sheet have length `sheet_h_mm`. Whether the driver calls this "long" or "short" depends only on whether `sheet_h_mm` is the longer dimension:

```
flip_edge = (sheet_h_mm > sheet_w_mm) ? "long" : "short"      # for a vertical fold
```

| Preset | paper | sheet media (**as printed**) | `sheet_w_mm × sheet_h_mm` | fold line | vertical edges are | `flip_edge` |
|---|---|---|---|---|---|---|
| `half_letter` | US Letter (8.5 × 11 in) | Letter **landscape** | 279.4 × 215.9 | vertical at `x = 139.7` | the short pair | **short** |
| `a5` | A4 (210 × 297) | A4 **landscape** | 297.0 × 210.0 | vertical at `x = 148.5` | the short pair | **short** |
| custom | as supplied | as supplied | `w < h` | vertical | the long pair | **long** |

Both V1 presets are **short-edge**: the imposed sheet is landscape while the booklet leaf is portrait.

> **Reconciliation (driver terminology).** Driver UIs name the duplex option after the **paper's binding edge in the page's orientation**. The imposed PDF page is landscape, so its short edges are the vertical (fold-parallel) ones and the correct option is the one that turns the sheet about a vertical axis — labelled "short-edge" by the drivers in scope. Some drivers invert this for landscape pages, which is why §7's guide states the *outcome* ("the head must stay at the top when you turn the sheet left-to-right") as well as the word, and why the guide carries the physical verification line. A wrong label is caught by the verification step, not by the PDF.
>
> **Reconciliation (`docs/08` §4.1).** `docs/08` writes the fold as "once, long edge" and lists the sheet as `215.9 × 279.4`. Both are consistent with this table once "long edge" is read as a **fold description** — "fold across the sheet's long dimension", which halves 279.4 and yields the contract trim `139.7 × 215.9` — and once the sheet is listed in its as-printed (landscape) orientation, which is the only orientation in which a single fold produces a **portrait** leaf. `docs/08` does not state a duplex setting, so there is no conflict on `flip_edge`. Reported in §11.2.

### 4.3 What changes between portrait and landscape sheet handling

| Aspect | Landscape sheet (V1 presets) | Portrait sheet (custom media) |
|---|---|---|
| Media box | `W > H`, panels side by side | `H > W`, panels side by side |
| Panel width | `trim_w_mm` (+ residual split to the outer edges, §6.2) | `trim_w_mm` |
| Fold line | vertical, `x = sheet_w_mm/2` | vertical, `x = sheet_w_mm/2` |
| `flip_edge` | `short` | `long` |
| Panel rotation | `0_deg` (portrait trim in a portrait panel) | `0_deg` |
| Imposition table | **identical** (§3.2 depends on `M` only) | **identical** |
| Relation between the two | The landscape arrangement rotated 90° *as a whole sheet*; `flip_edge` therefore flips `long ↔ short`. | |

Two consequences worth stating because they are the usual bugs:

1. The **arithmetic is orientation-independent**. `sheet_orientation` changes only the media box, the panel offsets and the rotation, never the page assignment. A golden test can therefore assert the same `Sheets` table for both orientations (V1–V4 hold regardless).
2. `sheet_orientation_override` (for printers that feed paper long-edge-first) rotates **every sheet page** by `90_deg` **and** recomputes `flip_edge`. The two must move together; changing one alone produces §4.4's failure.

### 4.4 Failure mode, and how the preview prevents it

**Failure mode** — the user prints duplex with the *perpendicular* flip edge (for V1 presets: the top-bottom flip instead of the head-preserving one). A flip about the perpendicular axis equals a head-preserving flip **composed with a 180° in-plane rotation**, so the back side arrives rotated 180°: the two panels swap and every back-side page is upside down. For `M = 16` the physical result is:

| Sheet | back, as designed | back, as physically printed under the wrong flip |
|---|---|---|
| 1 | `[2 \| 15]` | `[15 inverted \| 2 inverted]` |
| 2 | `[4 \| 13]` | `[13 inverted \| 4 inverted]` |
| 3 | `[6 \| 11]` | `[11 inverted \| 6 inverted]` |
| 4 | `[8 \| 9]` | `[9 inverted \| 8 inverted]` |

The booklet folds and staples, and then *every verso page is upside down*, with the innermost spread showing `9|8` instead of `8|9`. It is not detectable by inspecting the PDF, only by holding paper.

**How the preview prevents it.** The preview (§5) is rendered from the same `Sheets` structure as the PDF, so what the user approves and what the printer receives agree **by construction**. What remains is the printer's own setting, which no artifact can control, so:

| Prevention | Where |
|---|---|
| The flip-edge value is computed from the media geometry (§4.2), never typed, so it cannot be internally inconsistent. The only user input is `sheet_orientation_override` (§4.3), from which `flip_edge` is **re-derived** — so `docs/14`'s "configured flip edge" (`T-PRT-012`, `T-PRT-045`) is read as *configured sheet orientation*, never a typed edge | engine |
| The preview shows the fold model **and** the duplex setting on the same panel | §5.3 |
| The preview draws a **head marker** (a corner tick) on every sheet side, so an inverted back side is visible in the preview as "the tick should be top-left, top-left, top-left …" | §5.3 |
| A one-line physical check is in the guide: hold sheet 1 flat — *page 1 must be on the right half and page M on the left half, both upright* | §7.1 |
| Printing with the wrong flip produces a booklet whose backs are inverted — so the verification step is the last gate before stapling, not the PDF | §7.1 |
| The guide's own fields are checked against the artifact config (`PRINT_PRINT_GUIDE_MISMATCH`, minor, `docs/11` §2.4) | §7.3 |

**The other ways a human "staples a booklet shut"** — single-sided printing, stacking the sheets in reverse nesting order, or stapling the fore edge — are prevented the same way: the preview and the guide state the **nesting order** and the **staple position** explicitly (`sheet 1 outermost … sheet S innermost`; "2 staples ON the fold line") and never leave either to be inferred from page numbers.

---

## 5. Sheet preview

### 5.1 What it is, and what it must not be

The preview is the §9.4 requirement "the booklet preview should visually show how sheets will fold and which pages will face one another", and the §9.5 requirement "Support visual verification of booklet order before downloading the final imposed PDF".

> **The preview is a projection of the same `Sheets` value that `bookletPdf()` consumes. It is never a second implementation of §3.2.** The engine calls `impose()` **once** per render; the preview and the PDF are two renderings of that one result. What is **actually asserted** by declared tests: the committed sheet maps `T-PRT-040/041/042` (determinism of re-imposition for `M ∈ {8,12,16}`), the fold / facing-pages model by `T-PRT-048` (and `T-PRT-015`), and the arithmetic-only purity — no measurement, no AI — by `T-PRT-049`. **No declared test asserts equality of the preview's page-number grid with the PDF's sheet map**; the two consume the same `Sheets` by construction, and a test id for that equality is `docs/14`'s to add (an earlier revision of this section cited `T-PRT-048`/`T-PRT-049` for that equality, which neither test asserts).

### 5.2 Data the preview consumes

| Input | Source | Used for |
|---|---|---|
| `Sheets` (spec_version, M, S, per-side panels) | `impose()` (§3) | the sheet grid, the page numbers |
| `PrintPage.kind` + `template` + title/first line | `docs/04` §5.1, §5.2 | the page label under each thumbnail |
| page thumbnails (`art_` kind `page_png`) | `docs/04` §7.4; `docs/13` Phase 6 | the page **content** on each panel, so ordering is verified against what is actually printed, not against numbers |
| `paper` preset (name, media, fold line, caliper, residual `r`) | `docs/08` §4.1; §6.1 | the sheet outline, the fold line, the head marker |
| `flip_edge` + duplex mode | §4.2 | the duplex banner |
| `creep_i_mm` per sheet | §6.4 | the shingle indicator on affected sheets |
| page 1 and page M positions | §3.4 V3 | the cover assertion line |
| blank reasons | `docs/04` §5.2 | blank provenance labels |

### 5.3 What it must show

| Element | Requirement | Grounds |
|---|---|---|
| Sheet grid, one row per sheet, two columns per side | sheets ordered `1..S` with the nesting depth labelled | §9.4 |
| **Page numbers** on every panel | the booklet page number, and the imposed flat sequence | §9.4 |
| **Page contents** on every panel | the thumbnail, so a mis-imposition is visible as wrong text, not just a wrong number | §9.4, §9.5 |
| Fold model | the fold line drawn through the middle of every sheet, plus a "viewed after folding" spread row | §9.4 |
| **Facing pairs** | a second view: spreads `1`, `2\|3`, `4\|5`, …, `M-1\|M`, labelled with which sheet sides produce them | §9.4 |
| Head marker | a tick at the head of every side | §4.4 |
| Duplex banner | "Two-sided: head-preserving flip — shown as *short edge* on the imposed landscape page" | §9.5 |
| Nesting order | "sheet 1 outermost … sheet S innermost" | §9.5 "Binding or stapling recommendations" |
| Blank provenance | a `blank` panel shows its `blank_intentional.reason` | §9.4, `docs/04` §5.2 |
| Count line | `print 16 pages · 4 sheets · 8 sides` | D-06 (labelled counts, never a bare "page count") |

### 5.4 Preview is not an approval surface for geometry

The preview displays; it does not decide. It cannot change the sheet order, cannot release a lock, and cannot be edited. Approving the booklet is an `Approval` action (§6.11 scope `print_composition`, `docs/04` §7.3), and the exported artifact must cite an `apr_` whose `revisions` and `environment` (including `imposition_spec_version`) match the engine's — otherwise the export is refused with `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (`docs/04` §7.3, D-14).

---

## 6. Output geometry

### 6.1 Sheet media box and trim

| Preset | box | `_mm` | `_pt` (`round(mm × 72 / 25.4, 4)`, half-up) |
|---|---|---|---|
| `half_letter` | sheet (Letter landscape) | 279.4 × 215.9 | **792.0000 × 612.0000** |
| `half_letter` | trim (half-letter portrait) | 139.7 × 215.9 | 396.0000 × 612.0000 |
| `a5` | sheet (A4 landscape) | 297.0 × 210.0 | **841.8898 × 595.2756** |
| `a5` | trim (A5 portrait) | 148.0 × 210.0 | 419.5276 × 595.2756 |

`docs/08` §4.2 states the single conversion the whole print path uses (`1 in = 25.4 mm = 96 px_css`, `1 pt = 25.4/72 mm`). Rules that make two implementations byte-comparable:

1. The mm→pt factor is exactly `72/25.4`; the value is written with **4 decimal places, round-half-up**. No other rounding is permitted.
2. The booklet PDF page's `MediaBox` is `[0, 0, sheet_w_pt, sheet_h_pt]`; **page origin is the sheet's top-left in the as-printed orientation** (PDF's own origin is bottom-left; the driver negates `y`, and the negation is part of the contract, not left to the driver).
3. `TrimBox == MediaBox == BleedBox` for every booklet page (`bleed = 0`, §6.3).
4. The **reading** PDF uses `MediaBox = [0, 0, trim_w_pt, trim_h_pt]` per `docs/08` §4.2 (`T-PRT-062`). The mismatch between the two artifacts' media boxes is checked by `PRINT_TRIM_DIMENSION_WRONG` (`docs/11` §2.4, critical); see §8 and §11.2 for the wording ambiguity in that code.

**The A-series residual.** `2 × trim_w_mm` need not equal `sheet_w_mm`:

```
r = sheet_w_mm - 2 * trim_w_mm            # residual, _mm
half_letter:  279.4 - 2*139.7 = 0.0 mm
a5:           297.0 - 2*148.0 = 1.0 mm
vertical residual = sheet_h_mm - trim_h_mm = 0.0 mm for both presets
```

The residual is **never** placed at the spine. It is split equally between the two outer (fore) edges — `r/2` per panel — by the flush-to-fold placement of §6.2. For `half_letter` the arithmetic is exact; for `a5` each panel carries 0.5 mm of unprinted slack at its fore edge, which the outer margin absorbs and which requires no cut (§6.3). This is a real A-series rounding fact (`A5 = 148 × 210 mm`, ISO 216), not an error, and it is deterministic so both implementations agree.

### 6.2 2-up placement of each booklet page

For sheet `i`, creep shift `c = creep_i_mm` (§6.4), residual `r = sheet_w_mm − 2 × trim_w_mm` (§6.1):

| Panel | `x_offset_mm` | `y_offset_mm` | `width_mm × height_mm` | `rotation_deg` |
|---|---|---|---|---|
| `L` (left) | `sheet_w_mm/2 − trim_w_mm + c` | `0` | `trim_w_mm × trim_h_mm` | `0` |
| `R` (right) | `sheet_w_mm/2 − c` | `0` | `trim_w_mm × trim_h_mm` | `0` |

Worked values: `half_letter` → `L` at `0 + c`, `R` at `139.7 − c`. `a5` → `L` at `0.5 + c`, `R` at `148.5 − c`.

Properties this placement guarantees:

- **Panels are flush to the fold only at `c = 0`; above it they overlap by `2c` and are clipped.** `L`'s right edge sits at `x = sheet_w_mm/2 + c` and `R`'s left edge at `x = sheet_w_mm/2 − c`, so the two **placed** boxes overlap by `2c`, centred on the fold. The **clip rule** makes "no page straddles the fold" true: each panel's placed box is clipped to its own side of the fold — `L` to `x ∈ [0, sheet_w_mm/2]`, `R` to `x ∈ [sheet_w_mm/2, sheet_w_mm]`. A page may therefore be *placed* across the fold but is never *imaged* across it. The clip loses no ink in any V1 booklet: the overlap is at most `2c ≤ 4 mm` (§6.4 caps `c ≤ 2 mm`), while the innermost spine-side ink — the frame — is at least `border.offset_mm = 8 mm` from the fold, so no glyph or rule falls in the clipped strip. At `c = 0` the clip is exactly the fold line.
- **The residual falls at the fore edges only** (`r/2` each), never in the gutter.
- **`c` shifts both pages toward the fold** — `+c` for `L`, `−c` for `R` — which is what creep compensation *is* (§6.4). With `c = 0` (all V1 booklets below the threshold) both offsets are fixed constants.
- **Rotation rule.** `rotation_deg = 0` when the trim orientation matches the panel orientation (both V1 presets and all custom portrait-leaved media: portrait trim in a portrait panel). V1 emits no preset requiring a non-zero rotation; a future landscape-leaved preset would rotate both panels by `90_deg` about the panel centre and use a `trim_h_mm × trim_w_mm` box. State it as a rule so an implementer cannot invent a third value.
- **No gutter is inserted between panels.** `gutter_mm` and `binding_allowance_mm` live **inside** each leaf's box (`docs/08` §4.2), so the panels abut at the fold. A physical gap would make `2 × panel_w_mm ≠ sheet_w_mm` and desynchronise the fold from the trim.

### 6.3 Trim marks / crop marks policy

> **V1 emits no crop marks and no trim marks. `crop_marks = false`, `bleed_mm = 0`.**

Why:

1. **Nothing needs cutting.** For both presets the folded panel **is** the contract trim (`docs/08` §4.1). A correctly folded sheet is the finished leaf; a `half_letter` booklet needs no cut at all, and the `a5` residual (§6.1) is 0.5 mm of blank paper inside the outer margin.
2. **There is nowhere legal to put them.** The booklet media box equals the press sheet, so a mark would be visible ink in the finished booklet. Marks require a media box larger than the paper (a mark area outside the trim, reachable only with bleed), which contradicts §9.5's actual-size guidance: a larger media box forces desktop-printer scaling.
3. **Bleed is zero for the same reason.** With `bleed_mm = 0`, no ink may cross the trim. The design's outermost ink is the perimeter frame, whose band begins at `border.offset_mm` = 8 mm from the trim (`docs/09` §7.4) — `offset_mm − safe_area_mm` = 2 mm inside the print-safe floor. Nothing is clipped by construction.

**Interaction with the border token (§9.2, `docs/04` §6.1, `docs/09` §7.1/§7.4).** The frame is the outermost ink, and `border.offset_mm` is **measured from the trim edge** — 8 mm, symmetric about the leaf, identical on both pages of a spread. Its band is `8.000 … 10.0292 mm` from every trim edge (`offset 8 + outer 0.75 _pt_ 0.2646 + gap 1.5 + inner 0.75 _pt_ 0.2646` — the reference theme is a **`double_rule`**, `docs/09` §7.4), so the margin above the print-safe floor is exactly `offset_mm − safe_area_mm = 2 mm` — the budget §6.6 spends — and the clearance to the text box is `18.35 − 10.0292 = 8.32 mm`. `docs/08` §4.2 measures the frame from the **trim** edge too, so the two agree: no document in the set measures it from the text-box edge. (An earlier revision of this paragraph gave the band as `8.000 … 8.26458 mm` with a `10.085 mm` clearance — a **`single_rule`** band on a `double_rule` theme — and still called `docs/08` §4.2 "the outlier" after `08` had been corrected; both are superseded.)

**When crop marks would be required** (documented, not implemented): a `trim_to_size` production mode on custom paper, or a cover on oversized stock. That mode needs `bleed_mm ≥ 3`, a media box of `trim + 2 × (bleed + mark_area)`, and the user's guillotine — a different production path (V2).

### 6.4 Creep / shingling policy

**Inputs.** `caliper_mm` (paper thickness) declared on the paper preset (§9.1 "Custom paper sizes"). Default for 20 lb / 80 gsm bond: `caliper_mm = 0.10`.

**Formula** — outermost sheet as reference (shift 0), inner sheets shifted toward the spine:

```
S            = M / 4                                       # sheets, _sheets
creep_i_mm   = (i - 1) * caliper_mm                        # i = 1..S, outermost first
creep_max_mm = (S - 1) * caliper_mm                        # innermost sheet
```

**Threshold.** Compensation is applied when **both** gates are met — the sheet gate is a **floor** (never compensate below six sheets) and the thickness gate is the **binding physical** condition:

```
CREEP_THRESHOLD_SHEETS = 6          # floor:  never compensate when S < 6   (M < 24)
CREEP_MIN_MM           = 0.5        # bite:   compensate when (S-1)*caliper_mm > 0.5
apply compensation  ⇔  (S >= CREEP_THRESHOLD_SHEETS) AND ((S-1)*caliper_mm > CREEP_MIN_MM)
```

The earlier wording — "apply when **either** gate is exceeded" — was self-contradictory: under a literal OR the sheet gate *alone* fires at `M = 24` and the table below must read "yes", contradicting its own "the thickness gate bites first". The rule is **AND**. **Which gate governs depends only on the caliper**, and for the shipped stock the **thickness gate governs** (it bites at or after the six-sheet floor):

| stock | thickness gate bites at | sheet-gate floor | first compensated `S` / `M` | gate that governs |
|---|---|---|---|---|
| `caliper_mm = 0.10` (20 lb / 80 gsm default) | `(S-1)×0.10 > 0.5` ⇒ `S ≥ 7` | `S ≥ 6` | `S = 7` / `M = 28` | **thickness** |
| thicker than 0.10 (e.g. 0.15) | `(S-1)×0.15 > 0.5` ⇒ `S ≥ 5` | `S ≥ 6` | `S = 6` / `M = 24` | **sheet floor** |
| thinner than 0.10 (e.g. 0.05) | `(S-1)×0.05 > 0.5` ⇒ `S ≥ 12` | `S ≥ 6` | `S = 12` / `M = 48` | **thickness** |

Below the gate, `creep_i_mm = 0` and the value is still **measured and reported** in the guide (§1.3), never silently dropped. The thickness gate is **strict**: `creep_max = 0.50 mm` exactly at `S = 6` is not compensated (`0.50 > 0.5` is false), which is why `M = 24` reads "no" below and `M = 28` reads "yes".

| `M` | `S` | `creep_max_mm` at 0.10 | compensated? |
|---|---|---|---|
| 8 | 2 | 0.10 | no |
| 16 | 4 | 0.30 | no |
| 24 | 6 | 0.50 | **no** — sheet floor `S ≥ 6` met, thickness gate strict (`0.50 > 0.5` false) |
| 28 | 7 | 0.60 | **yes** |
| 32 | 8 | 0.70 | **yes** |
| 48 | 12 | 1.10 | **yes** |

**Application.** `c = creep_i_mm` enters §6.2's offsets for both panels of sheet `i`. Nothing else changes: §3.2 is untouched, so creep never alters *which* page goes where — only where the page sits on the sheet. Creep is a geometry concern (§6), not an ordering concern (§3).

**Limits, and the findings that fire.** The creep shift moves both leaves toward the spine, so it spends spine-side clearance and leaves the frame further from the fore trim. The budget comes from `docs/09` §7.4's token geometry — the frame band's 2 mm of slack above the print-safe floor:

```
creep shifts the whole leaf toward the spine, frame included (docs/09 §7.4):
   fore side : frame distance from the fore trim  8 + c  -> grows, always >= safe_area_mm
   spine side: frame distance from the spine trim 8 - c  -> must stay >= safe_area_mm
require creep_i_mm <= border.offset_mm - safe_area_mm            # 8 - 6 = 2 mm
```

At `caliper_mm = 0.10` the 2 mm limit is reached at `S = 21` (`M = 84`), so **for every V1 booklet creep is comfortably legal** and the limit is asserted rather than expected to fire. The text box has its own, looser absorption of the fold: `docs/09` §7.4 places the **spine text edge at `25.35 mm` from the trim**, so the C4 floor `safe_area_mm + gutter_mm + binding_allowance_mm = 13 mm` still holds with `12.35 mm` to spare (the `13 mm` is the floor, not the edge). When a limit *is* breached the render is **refused**, not clamped (`docs/07` §5.4 rule 2), with the registered code:

| Breach | Code (`docs/11` §2.4) | Severity |
|---|---|---|
| shift exhausts the binding allowance / the gutter | `PRINT_BINDING_ALLOWANCE_VIOLATED` · `PRINT_GUTTER_INSUFFICIENT` | critical · major |
| shift drives the frame outside the safe area | `PRINT_BORDER_OUTSIDE_SAFE_AREA` · `PRINT_SAFE_MARGIN_VIOLATED` | critical · critical |

### 6.5 Fold line and gutter geometry

```
fold_x_mm = sheet_w_mm / 2
```
- `fold_x_mm` is the spine for **all four** V1 page placements. No page's **ink** straddles it: each panel is clipped to its own side of the fold (§6.2), and the `≤ 2c` placement overlap lies entirely in the spine-side margin (`≥ border.offset_mm = 8 mm` from the fold).
- Spine-side text inset per booklet page: the **spine text edge sits `25.35 mm` from the trim (a position)**, and the **C4 floor** `safe_area_mm + gutter_mm + binding_allowance_mm = 6 + 4 + 3 = 13 mm` is the minimum that edge must clear (`13 ≤ 25.35` ✓ — a floor, not a position). The **text box** carries the shift, so the frame stays symmetric about the trim (`docs/09` §7.4).
- **The gutter is satisfied by the two facing text boxes, not by sheet geometry.** `docs/09` §7.4 places the text box `(gutter_mm + binding_allowance_mm)/2 = 3.50 mm` toward the outer edge, so the clear space between the two facing text boxes across the fold is `2 × 25.35 = 50.7 mm ≥ gutter_mm` (4 mm). `docs/08` §4.2 scopes `gutter_mm` to "the spread proof and the imposition spread check, not subtracted twice from a single leaf". A breach is `PRINT_GUTTER_INSUFFICIENT` (major, `docs/11` §2.4). **No additional sheet-level gutter is added.**
- Fore-edge (outer) text edge = `18.35 mm` from the trim (`docs/09` §7.4), unchanged by imposition; the frame band remains at `8.000 … 10.0292 mm` on all four edges (`double_rule`: `8 + 0.2646 + 1.5 + 0.2646`; §6.6).

### 6.6 How the frame survives trimming and folding (§9.2)

§9.2 requires the border to "remain visible after printing, cutting, or folding under the selected production settings". The geometry is `docs/09` §7.4's, which is the token owner's: the frame is measured **from the trim edge** and is symmetric about the leaf.

```
trim                        = 139.7 × 215.9 mm            (half_letter)
frame band (all four edges) = border.offset_mm … offset_mm + outer 0.75 pt + gap_mm 1.5 + inner 0.75 pt
                            = 8.000 … 10.0292 mm          (double_rule; 0.75 pt = 0.2646 mm, gap_mm = 1.5)
gap, frame → nearest text   = 18.35 − 10.0292 = 8.32 mm   ≥ border.text_gap_min_mm (3)   (docs/09 §7.4, C2)
C1                          = border.offset_mm >= safe_area_mm        (8 >= 6)  ✓ , slack 2 mm
```

The frame is therefore 2 mm clear of the print-safe floor and 8.32 mm clear of the text box, so it cannot be removed by folding, and the budget for creep plus a nominal cut is:

```
net_i = c_i - p_i                         # net shift of the leaf's content toward the SPINE, _mm
                                          #   c_i = applied creep compensation (content shift toward the spine, §6.2)
                                          #   p_i = pushout of sheet i (the fore edge moves OUT, §6.4); net = c - p
frame_trim_offset_mm(i, side) = frame_band_offset_mm + s(i, side) * net_i - fore_edge_trim_mm
   s = +1 on the fore side   (a shift toward the spine moves the ink AWAY from the fore trim)
   s = -1 on the spine side  (a shift toward the spine moves the ink TOWARD the spine trim)
require frame_trim_offset_mm(i, side) >= safe_area_mm on every side
```

Evaluating the formula above:

| Case | Frame offset from the **trimmed** edge | Requirement |
|---|---|---|
| No creep, no trim (`net = 0`, `t = 0`) | `8.000 … 10.0292 mm` on all four edges | `≥ 6 mm` ✓ (C1; 2 mm slack) |
| Uncompensated pushout (`c = 0 ⇒ net = −p_i`), no cut | fore `8 − p_i`; spine `8 + p_i` mm | holds while `p_i ≤ 2 mm` |
| **Compensated** (`c = p_i ⇒ net = 0`), nominal cut `t_mm` | fore `8 − t_mm`; spine `8 − t_mm` | holds while `t_mm ≤ 2 mm` |
| Any sheet, spine side (`s = −1`) | `8 − net_i − t_mm` = `8 − (c_i − p_i) − t_mm` mm | holds while `net_i + t_mm ≤ 2 mm` (§6.4) |

**Sign note (corrected).** The formula above carries `(c_i − p_i)`, not `(p_i − c_i)`: the applied shift `c` moves ink **toward** the spine, so it *raises* the fore offset and *lowers* the spine offset, while the pushout `p` does the opposite. The two are opposite-signed, and the earlier revision had the parenthesised term backwards, which inverted the whole table — it read the compensated fore offset as `8 + t_mm` when the formula `8 + s·(c − p) − t` gives `8 − t_mm` at `c = p`. With `c = p` (the V1 case) both offsets are `8 − t_mm`; with `t = 0` (every V1 preset, §6.3) the offset is the frame band `8.000 … 10.0292 mm`, so **the compensated table is dormant in V1** and the sign change moves no rendered ink. §6.4's binding limit reads `spine = 8 − net_i ≥ 6 ⇒ net_i ≤ 2 mm` (with `p = 0`, `c ≤ 2 mm`), unchanged.

- `fore_edge_trim_mm` is **0** for every V1 preset (no cutting, §6.3); it exists so a custom / `trim_to_size` production setting can be checked, and so the finding evidence names the number that would breach.
- Findings: **`PRINT_BORDER_OUTSIDE_SAFE_AREA`** (critical) for C1 and for any side whose post-shift offset falls below `safe_area_mm`; **`PRINT_BORDER_TRIM_DRIFT`** (critical, `docs/11` §2.4: "after cropping to trim the frame is clipped or drifts — the border check must run **post-trim**"); `PRINT_BORDER_TEXT_COLLISION` (**critical · A·E·R** for C2 — `docs/09` §7.4 C2 and `docs/08` §5 rung 1 own the severity and `docs/11` §2.4 registers it `critical · A·E·R` per G7, so it is **never waivable**, `docs/11` §1.4 W1/N2). `docs/11` §2.4 requires the border check to run on the **rendered, post-trim raster**, not on the token set — this document supplies the geometry the raster is judged against.
- **Folding moves no ink.** The fold's only effect on the frame is the whole-leaf creep displacement of §6.4, bounded by its 2 mm budget. That, plus the `a5` residual falling in the outer margin, is the whole of §9.2's "remain visible after … folding".

---

## 7. Print instructions generation (§9.5)

The `printGuide()` surface (`docs/03` §3 Engine E; `docs/02` W12) emits `art_` kind `print_guide` (`docs/04` §7.4). It is a small JSON document plus a rendered one-page human form. **Every field is derived; none is a literal in the template.**

### 7.1 Fields and derivation

| §9.5 field | Key | Derived from | Example (`half_letter`, `M = 16`) |
|---|---|---|---|
| Paper size | `paper_size` | `print.paper` preset → media box (§6.1) | `"US Letter, landscape — 279.4 × 215.9 mm (792.00 × 612.00 pt)"` |
| Number of sheets | `sheet_count` | `S = M/4` from the `Sheets` result (§3.2) | `4` |
| Double-sided requirement | `duplex_required` | always `true` for saddle-stitch (folding needs both sides) | `true` |
| Flip-edge setting | `flip_edge` | `flip_edge(sheet_w_mm, sheet_h_mm)` (§4.2), a **function of the media geometry**, never typed | `"head-preserving flip (shown as 'short edge' on the landscape sheet)"` |
| Actual-size guidance | `actual_size` | policy + the reason (`panel_*_mm == trim_*_mm` depends on 100 % scale; `docs/08` §4.1) | `"Print at 100% / 'Actual size'. Do NOT use 'Fit to page', 'Shrink to fit' or any scaling."` |
| Folding orientation | `fold` | fold axis (vertical, §6.5) + page-1 panel (§3.4 V3) | `"Fold the whole stack in half along the vertical centre line; page 1 must end up on the outside front."` |
| Binding / stapling | `binding` | `S`, `trim_h_mm`, `fold_x_mm` | `"Saddle stitch: 2 staples ON the fold line, at 1/4 and 3/4 of the 215.9 mm height, straddling the spine."` |
| **One-line verification** | `verify` | `M`, page-1 panel, `flip_edge` (§4.4) | `"Before folding: sheet 1 must read page 1 on the RIGHT half and page 16 on the LEFT half, both upright. Upside down ⇒ wrong duplex flip; reprint."` |

### 7.2 Additional derived fields (not named by §9.5, but required by §9.4's correctness claims)

| Key | Derived from | Purpose |
|---|---|---|
| `nesting_order` | `S` + "sheet index counted from outside" (§1.2) | "sheet 1 outermost … sheet 4 innermost" — prevents the reversed-stack failure (§4.4) |
| `sheet_map` | the `Sheets` grid (§3) | the full table, so the user can check any sheet |
| `blank_pages` | every `Page` with `kind == "blank"` + its reason (§2.4) | §15.4 "No unintended blank pages" |
| `creep` | `caliper_mm`, `S` (§6.4) | `{applied: false, creep_max_mm: 0.30}` |
| `residual_mm` | `sheet_w_mm − 2 × trim_w_mm` (§6.1) | `0.0` (`half_letter`) / `1.0` (`a5`) |
| `print_pages` / `sheets` / `sides` | `M`, `S`, `2S` | D-06 — labelled counts, never a bare "page count" |
| `spec_version` | `imposition/spec.json` (D-14) | reproducibility; `PRINT_IMPOSITION_SPEC_MISMATCH` if it drifts |
| `environment` | engine version, Chromium build id, `fonts_hash`, theme token hash (D-14) | `docs/04` §7.4 manifest |
| `notes` | §1.3 "documented only" rows | show-through, grain, humidity — stated so their absence is not read as a guarantee |

### 7.3 Why derivation is not decoration

Every field above is a function of data the engine already holds. Three consequences, each testable:

1. **The guide cannot disagree with the PDF.** `sheet_count`, `flip_edge` and `sheet_map` come from the same `Sheets` value that produced the PDF (§5.1), and `docs/11` §2.4 registers `PRINT_PRINT_GUIDE_MISMATCH` (minor: "the print guide's paper / sheets / flip edge / fold ≠ the artifact config") as the check. `T-PRT-070` asserts the field set; `T-PRT-061` asserts `sheet_count == Sheets.S`.
2. **A preset change cannot leave a stale instruction.** Adding a third paper size (Q-04) is a preset file; `flip_edge`, media box, fold description, residual and binding geometry all re-derive, so no template edit is needed and none is possible.
3. **The guide is reproducible.** It is an artifact with a D-14 manifest and a `_pt`/`_mm`-suffixed, canonically serialised body (`docs/04` §1), so it hashes and can be diffed between releases.

---

## 8. Reading PDF vs booklet PDF

Both are §1.2 deliverables from one approved manuscript and one design revision, and §9.4 requires both to be offered as separate downloads.

| | Reading PDF | Booklet PDF |
|---|---|---|
| `Artifact.kind` | `reading_pdf` (`docs/04` §7.4) | `booklet_pdf` (`docs/04` §7.4) |
| Page count | `M` = `print.page_count` | `2 × S` = `M / 2` sheet sides |
| Page order | `1, 2, 3, …, M` (reading order) | `S1.front, S1.back, S2.front, S2.back, …, S S.front, S S.back` (print order) |
| Each page holds | one booklet page | two booklet pages, 2-up per §6.2 |
| Page size | `trim_w_pt × trim_h_pt` (`docs/08` §4.2, `T-PRT-062`) | `sheet_w_pt × sheet_h_pt` (§6.1) |
| Imposition applied? | **no** (order untouched) | **yes** (§3.2) |
| Producer | `readingPdf()` (`docs/03` §3, §5.3) | `bookletPdf()` (`docs/03` §3, §5.3) |
| Duplex needed? | no | **yes**, `flip_edge` per §4.2 |
| Tests | `T-PRT-060` (count `== print.page_count`) | `T-PRT-061` (sheet count `== imposed.sheets`), `T-PRT-040/041/042` (golden maps) |

### 8.1 Why both exist (§9.4)

The reading PDF is the "normal page sequence" — what a person reads on screen or prints 1-up, and what §15.4's "Correct exported content" is judged against. The booklet PDF is the press artifact. They are the **same book**: page *n* of the reading PDF and booklet page *n* on the imposed sheet must contain byte-identical rendered content. That equality is only meaningful if both are produced from the same source, so:

### 8.2 The single-source rule

> `readingPdf()` and `bookletPdf()` are two **orderings** of one set of rendered `PrintPage` documents. They must be generated from the **same `print.pages`** and the **same `dsg_rev`**. Neither may re-paginate, re-measure, or re-render.

| Contract | Where |
|---|---|
| Both derive from the same `print.pages` (one `Page` per rendered document) | `docs/03` §5.3; `docs/04` §5.1 |
| Both record the same revision triple `{ms_rev, cmp_rev, dsg_rev}` and environment in their manifest | D-14; `docs/04` §7.4; `docs/02` W12 |
| Both cite the **same** `apr_`, and are refused if it is stale or its environment differs | `docs/04` §7.3; `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` |
| Both carry `imposition.spec_version`, and the booklet PDF's value must equal `imposition/spec.json` | D-14; `docs/04` §8; `PRINT_IMPOSITION_SPEC_MISMATCH` |
| `CompositionRevision.print.imposed = {sheets: S, spec_version: 1}` describes the booklet PDF | `docs/04` §5.1 |
| Extracted text of the HTML book, the reading PDF and the booklet PDF agree | `T-PRT-069`; §12.3; D-10 |

A consequence worth stating: because the two PDFs share rendered page documents, **imposition cannot change text, only position** — so §15.1's "Approved text is not silently altered" is true of the booklet PDF by construction, not by review. `docs/11` §2.4 registers `PRINT_CONTENT_MISMATCH_APPROVED` (critical) as the independent check that the rendered text still equals the approved `ms_rev`.

---

## 9. Validation

Every check is a `Finding` (`docs/04` §7.2) with a code, family, severity and a **derived** `blocking` flag — computed by the single function of `(code, severity, project state)` (`docs/04` §7.2, `T-QAS-003`); no code path sets it. The codes below are **`docs/11` §2.4's registry**, quoted, not re-minted. `docs/11`'s `blk` column means **A** blocks approval, **E** blocks export, **R** blocks the render (`docs/11` §2.1/§2.4 legend).

| # | Check | Code (`docs/11` §2.4) | Severity | `blk` |
|---|---|---|---|---|
| 1 | `M % 4 != 0` (before padding) | `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | critical | A·E·R |
| 2 | A reading-order page **missing** from the imposed grid | `PRINT_IMPOSITION_PAGE_ERROR` | critical | A·E·R |
| 3 | A page appearing **twice** on two panels | `PRINT_IMPOSITION_PAGE_ERROR` | critical | A·E·R |
| 4 | Back side not in §3.2 order (V2 parity fails); a slot holds the wrong page; a facing pair is wrong; a back side violates the duplex flip edge | `PRINT_IMPOSITION_ORDER_WRONG` | critical | A·E·R |
| 5 | The printed page number on the imposed sheet ≠ its expected page | `PRINT_IMPOSITION_PAGE_NUMBER_WRONG` | critical | A·E·R |
| 6 | A `blank` page with no `blank_intentional.reason` (plan level) | `COMP_BLANK_UNINTENDED` | major | A |
| 7 | An imposed blank with no deliberate record (sheet level) | `PRINT_REVERSE_SIDE_BLANK_UNRECORDED` | major | A |
| 8 | Padding inserted between two `story` pages | `COMP_IMPOSITION_PADDED_MIDSTORY` | major | A |
| 9 | `spec_version` in the plan/manifest ≠ `imposition/spec.json` | `PRINT_IMPOSITION_SPEC_MISMATCH` | critical | A·E·R |
| 10 | Frame clipped or drifted **after cropping to trim** | `PRINT_BORDER_TRIM_DRIFT` | critical | A·E·R |
| 11 | Frame extends beyond the print-safe area | `PRINT_BORDER_OUTSIDE_SAFE_AREA` | critical | A·E·R |
| 12 | Content lies within the print-safe margin | `PRINT_SAFE_MARGIN_VIOLATED` | critical | A·E·R |
| 13 | Content falls inside the binding allowance (creep/shift consumed it) | `PRINT_BINDING_ALLOWANCE_VIOLATED` | critical | A·E·R |
| 14 | Spine-side clear space between the two facing text boxes < `gutter_mm` | `PRINT_GUTTER_INSUFFICIENT` | major | A |
| 15 | Reading PDF page / MediaBox ≠ trim; imposed sheet size ≠ the expected sheet | `PRINT_TRIM_DIMENSION_WRONG` | critical | A·E·R |
| 16 | An empty page with `kind != "blank"` in the imposed grid | `PRINT_IMPOSITION_PAGE_ERROR` | critical | A·E·R |
| 17 | The print guide's fields ≠ the artifact config | `PRINT_PRINT_GUIDE_MISMATCH` | minor | none |
| 18 | Rendered text ≠ the approved `ms_rev` text | `PRINT_CONTENT_MISMATCH_APPROVED` | critical | A·E·R |

Every code in the required set is present: #1 page count, #2 missing page, #3 duplicated page, #4 wrong back-side order, #6/#7 blank unintentionality, #9 spec-version mismatch, #10/#11 frame outside the print-safe area after trim.

### 9.1 Notes on this registry

- **Codes #2, #3 and #16 deliberately share one code.** `docs/11` collapses "missing / duplicated / replaced by an unexpected blank" into `PRINT_IMPOSITION_PAGE_ERROR`, which is correct: they are one failure (the imposed grid is not a permutation of `1..M`) and the evidence `{page_id, slots[]}` carries the instance. This document does **not** mint separate `*_PAGE_MISSING` / `*_PAGE_DUPLICATED` codes.
- **#4 is the only discriminating check.** V1 (permutation) passes on a mirrored back side; V2 does not (§3.6). `PRINT_IMPOSITION_ORDER_WRONG` must never be weakened to a warning.
- **No creep-specific code exists.** Creep breaches surface through #13/#14/#11 (binding allowance, gutter, safe area). If a dedicated code is wanted, `docs/11` must mint it — this document will then cite it here.
- **Safe-area code naming — RESOLVED.** An earlier revision of `docs/08` §4.2/§4.3 named the safe-area breach `PRINT_SAFE_AREA_BREACH`. `docs/08` has since adopted the registered names (`PRINT_SAFE_MARGIN_VIOLATED`, `PRINT_BORDER_OUTSIDE_SAFE_AREA`), so the registry, `docs/08`, `docs/09` §7.1 and this document now agree. `PRINT_SAFE_AREA_BREACH` does not exist and is not registered.
- **`PRINT_TRIM_DIMENSION_WRONG`'s wording conflates two boxes** ("`MediaBox` (or imposed sheet size) ≠ the paper trim"). The reading page's MediaBox *is* the trim; the booklet page's MediaBox is the **sheet** (§6.1). The check is right; the parenthetical is not. Reported in §11.2.

### 9.2 When the checks run

| Moment | Checks |
|---|---|
| `paginatePrint()` exit (`docs/02` W10) | 1, 6, 8 — page count, blank intent, pad position (`docs/08` §4.6) |
| `impose()` | 2, 3, 4, 5, 16 — structure; always, in the engine, non-bypassable |
| Pre-download preview (§5) | 2, 3, 4, 6, 7 surfaced on the preview panel |
| Export (`bookletPdf()`) | 9, 10, 11, 12, 13, 14, 15, 17, 18 + approval/environment match (`EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`) |

A finding emitted by `impose()` aborts the render and produces **no** artifact (`docs/07` §5.4; `docs/03` §10 "an export is a whole artifact or nothing").

---

## 10. Worked end-to-end example — 16-page half-letter booklet

### 10.1 Inputs

| Input | Value |
|---|---|
| `print.paper` | `half_letter` |
| `print.page_count` M | 16 (`f = 4` front matter 1–4, `s = 9` story 5–13, `b = 3` back matter 14–16, `N = 16`, `pad = 0`) |
| sheet media | Letter landscape, 279.4 × 215.9 mm (792.00 × 612.00 pt) |
| trim (`panel`) | half-letter portrait, 139.7 × 215.9 mm; residual `r = 0.0 mm` |
| fold | vertical at `x = 139.7 mm` |
| `flip_edge` | **short** |
| tokens (reference theme) | `text_box_mm = 96 × 148`; symmetric side margin `(139.7 − 96)/2 = 21.85 mm`; `gutter_mm = 4`; `binding_allowance_mm = 3`; `safe_area_mm = 6`; `border.offset_mm = 8`; `border.thickness_pt = 0.75` (`docs/09` §7.4; `docs/04` §6.1) |
| `imposition.spec_version` | 1 |

### 10.2 Sheet count

```
S = M / 4 = 16 / 4 = 4 sheets        (8 printed sides, 8 × 2 = 16 booklet pages)
booklet PDF page count = 2S = 8
reading PDF page count = M = 16
```

### 10.3 The full 8-side assignment table

| Print order | Sheet | Nesting | Side | Flip edge | Left panel | Right panel |
|---|---|---|---|---|---|---|
| 1 | 1 (outermost) | 1 | front | — | **16** | **1** |
| 2 | 1 | 1 | back | short | **2** | **15** |
| 3 | 2 | 2 | front | — | **14** | **3** |
| 4 | 2 | 2 | back | short | **4** | **13** |
| 5 | 3 | 3 | front | — | **12** | **5** |
| 6 | 3 | 3 | back | short | **6** | **11** |
| 7 | 4 (innermost) | 4 | front | — | **10** | **7** |
| 8 | 4 | 4 | back | short | **8** | **9** |

Verified against §3.6: every page `1..16` appears exactly once; every odd page is in a right panel and every even page in a left panel; page 1 is on sheet 1 front-right; `8|9` is the centre spread. Geometric confirmation of the two quantities that are easiest to get wrong: `2 × 139.7 = 279.4 mm` exactly, so the residual is `0.0 mm` and the fold line coincides with the panel boundary (§6.1, §6.2); and the frame band sits at `8.000 … 10.0292 mm` from the trim on all four edges (`double_rule`: offset 8 + outer 0.75 _pt_ 0.2646 + gap 1.5 + inner 0.75 _pt_ 0.2646), so C1 (`offset_mm ≥ safe_area_mm`) passes with 2 mm of slack (`docs/09` §7.4, §6.6).

### 10.4 The physical assembly order a human sees

**Print** all 4 sheets duplex, head-preserving flip (shown as *short edge*), actual size. **Stack** with sheet 1 outermost and sheet 4 innermost. **Fold** the whole stack in half along the vertical centre line, page 1 outside. **Staple** twice on the fold.

Reading the folded booklet, spread by spread:

| Spread | Left page | Right page | Where the two come from |
|---|---|---|---|
| cover | — | **1** | sheet 1 front, right panel |
| 1 | **2** | **3** | sheet 1 back-L ↔ sheet 2 front-R (facing across the fold) |
| 2 | **4** | **5** | sheet 2 back-L ↔ sheet 3 front-R |
| 3 | **6** | **7** | sheet 3 back-L ↔ sheet 4 front-R |
| 4 | **8** | **9** | sheet 4 **back**, both panels — the centre spread |
| 5 | **10** | **11** | sheet 4 front-L ↔ sheet 3 back-R |
| 6 | **12** | **13** | sheet 3 front-L ↔ sheet 2 back-R |
| 7 | **14** | **15** | sheet 2 front-L ↔ sheet 1 back-R |
| back cover | **16** | — | sheet 1 front, left panel |

Note spread 4: `8|9` are printed on **one side of one sheet** (the innermost sheet's back), whereas spreads 1–3 and 5–7 face **across** two nested sheets. Both are correct spreads; a checker that asserts "no two consecutive pages share a sheet side" is wrong and must not be written (§3.6).

### 10.5 What a non-head-preserving duplex print produces if the flip-edge instruction is ignored

The user selects the top-bottom flip (the perpendicular axis). Each back side is imprinted rotated 180°:

| Sheet | intended back | physically printed back | effect when folded |
|---|---|---|---|
| 1 | `2 \| 15` | `15 inverted \| 2 inverted` | inside of the front cover shows page 2 upside down in the right panel; page 15 upside down in the left |
| 2 | `4 \| 13` | `13 inverted \| 4 inverted` | spread 2 shows `13|4` inverted |
| 3 | `6 \| 11` | `11 inverted \| 6 inverted` | spread 3 shows `11|6` inverted |
| 4 | `8 \| 9` | `9 inverted \| 8 inverted` | centre spread shows `9|8` inverted |

Outcome: the booklet folds and staples perfectly and **reads** as `1, [inverted backs], 16`; every verso page is upside down and the verso/recto order of each spread is reversed. The PDF is byte-identical to the correct run — the fault is entirely in the printer setting — which is why §4.4's preview, head markers and one-line verification step exist, and why §7's `flip_edge` field is derived rather than typed.

**Recovery.** Re-print with the head-preserving flip. No new artifact is needed; the sheet map is unchanged.

---

## 11. Traceability

`R-PRT-*` is the print-production requirement area (`docs/00` §3.1, `docs/13` §3.7). Numerals are allocated by `01-product-requirements.md`; `docs/08` §10 sets the precedent that documents map to the **area** only, and this document follows it. The right-hand column is the §17 phase that delivers the claim.

| Claim (§) | `R-PRT-*` area | Spec | Phase (§17) |
|---|---|---|---|
| Saddle-stitch 2-up fold-half only (§1.1) | `R-PRT-*` (imposition family) | §9.4 | **Phase 7** |
| Imposition is pure — no measurement, no AI, no I/O (§1.3, §3.7) | `R-PRT-*` (determinism); `R-ARC-*` | §12.4, D-04 | Phase 7 ∥ Phase 6 (`docs/13` §3.7 dep.) |
| Sheet arithmetic `S = M/4`, page formulas (§3.2) | `R-PRT-*` (sheet arithmetic) | §9.4 | **Phase 7** |
| Pad to a multiple of four, front/back only (§2) | `R-PRT-*`; `R-CMP-*` (pad position) | §9.4, D-16 | Phase 6 (count) → Phase 7 (impose) |
| Deliberate blank vs accident, two levels (§2.4) | `R-CMP-*`; `R-PRT-*` | §9.4, §15.4 | Phase 4 (blanks) / Phase 7 |
| Back-side order, flip-edge rules (§4) | `R-PRT-*` (duplex ordering) | §9.4, §9.5 | **Phase 7** |
| Facing-pages / fold model (§4.4, §5.3, §10.4) | `R-PRT-*` (fold correctness) | §9.4 | **Phase 7** |
| Sheet preview data + "same function" rule (§5) | `R-PRT-*` (preview); `R-UXS-*` | §9.4, §9.5 | **Phase 7** |
| Sheet media box, trim, residual, pt rounding (§6.1) | `R-PRT-*` (sheet geometry) | §9.1, §15.4 | **Phase 6** (renderer) → Phase 7 |
| 2-up offsets, flush-to-fold, rotation rules (§6.2) | `R-PRT-*` (placement geometry) | §9.4, §9.1 | **Phase 7** |
| No crop marks / no bleed (§6.3) | `R-PRT-*` (trim policy) | §9.1, §9.5 | **Phase 7** |
| Creep threshold, formula, limits (§6.4) | `R-PRT-*` (creep) | §9.2, §9.5 | **Phase 7** |
| Gutter satisfied without sheet-level gutter (§6.5) | `R-PRT-*`; `R-DSN-*` (gutter token) | §9.1, §9.2 | Phase 5 → Phase 7 |
| Frame survives trim and fold (§6.6) | `R-PRT-*`; `R-DSN-*` (border token) | §9.2, §15.4 | Phase 5 → Phase 7 |
| Print guide fields and derivation (§7) | `R-PRT-*` (print instructions) | §9.5 | **Phase 7** |
| Reading vs booklet PDF, single-source rule (§8) | `R-PRT-*`; `R-PUB-*` (reading PDF) | §9.4, §1.2 | Phase 6 (reading) / **Phase 7** |
| Manifest / `spec_version` (§7.2, §8.2) | `R-PRT-*`; `R-OPS-*` | §15.5, D-14 | Phase 7 |
| All validation checks (§9) | `R-PRT-*`; `R-QAS-*` (findings) | §10, §15.4 | Phase 7 (structure) / Phase 8 (registry) |
| Worked 16-page example (§10) | `R-PRT-*` (reference behaviour) | §9.4, §9.5, §14 demo 16 | Phase 7 |
| Physical print, fold, staple (A-18) | `R-PRT-*` (manual sign-off) | §14 demo 18 | Phase 9 (`manual_proof`, excluded from gates) |

### 11.1 Test coverage this document owns

| Test (`docs/14`) | What this document supplies |
|---|---|
| `T-PRT-040/041/042` | the golden sheet maps for `M ∈ {8,12,16}` (§3.5) |
| `T-PRT-043` | invariant V1 (§3.4) |
| `T-PRT-044` | invariants V3, V4 and the assembly walk (§3.4, §10.4) |
| `T-PRT-045` | flip-edge derivation (§4.2) and the wrong-flip result (§10.5) |
| `T-PRT-046` | creep threshold, formula and limits (§6.4) |
| `T-PRT-047` | spec-version mismatch (§9 code 9) |
| `T-PRT-048` | preview / fold-model requirements (§5) |
| `T-PRT-049` | "arithmetic only" rule (§1.3, §3.7) |
| `T-PRT-061`, `T-PRT-070` | sheet count and guide fields (§7, §8) |

### 11.2 Contradictions and gaps reported, not edited

| # | Location | Issue | Resolution here |
|---|---|---|---|
| **B-1** | `docs/08` §4.1 and §9.1: sheet listed as `215.9 × 279.4` with fold "once, long edge", trim `139.7 × 215.9` | **Internal inconsistency.** The trim `139.7` is half of `279.4` (the 11-in dimension), so the fold halves the sheet's long dimension; a **portrait** feed with a vertical fold would give panels `107.95 × 279.4`, and a portrait feed halving the height would give a landscape leaf `215.9 × 139.7`. Only a **landscape** feed with a vertical fold yields the stated portrait trim. §4.1's own sentence "Booklet pages are portrait" confirms which is intended. | The sheet is specified here in its **as-printed** orientation (`279.4 × 215.9`, §4.2, §6.1). `docs/08`'s paper, fold-count and trim values are all preserved. `docs/08` §4.1's dimension listing and `docs/08` §9.1's "Sheet (US Letter) 215.9 × 279.4" should be read as the paper's portrait designation, not its feed orientation. |
| **B-2** | `docs/08` §4.6 rank 2: pad "at the front-matter boundary (before page 1)" | A pad at index 1 occupies the front cover (sheet 1 front-right, §3.2) and contradicts `docs/08` §4.5's front-matter-first rule. | Rank 2 is specified as the front-matter/**story** boundary (§2.3). |
| **B-3** | ~~`docs/08` §4.2/§4.3 vs `docs/11` §2.4 and `docs/09` §7.1~~ | **RESOLVED.** `docs/08` now uses the registered names throughout; `docs/09` §7.1 and this document already did. `PRINT_SAFE_AREA_BREACH` is not registered and is referenced only in reconciliation notes. | No action outstanding. |
| **B-4** | `docs/11` §2.4 `PRINT_TRIM_DIMENSION_WRONG`: "`MediaBox` (or imposed sheet size) ≠ the paper trim" | Conflates two boxes: the reading page's `MediaBox` **is** the trim (`docs/08` §4.2, `T-PRT-062`); the booklet page's `MediaBox` is the **sheet** (§6.1). The check is correct; the parenthetical reads as if the imposed sheet should equal the trim. | §6.1 and §8 state both boxes explicitly; the code's trigger is scoped to "each artifact against its own expected box". |
| **B-5** | `docs/11` §2.4 | **Gap.** No finding code covers creep/shingling. Creep breaches currently surface as `PRINT_BINDING_ALLOWANCE_VIOLATED` / `PRINT_GUTTER_INSUFFICIENT` / `PRINT_BORDER_OUTSIDE_SAFE_AREA`. | §6.4 states the thresholds and maps breaches to those codes; if a dedicated code is wanted, `docs/11` must mint it. |
| **B-6** | `docs/04` §5.1 `print.paper` union carries only geometry | **Gap.** §6.4 needs `caliper_mm` on the paper preset. | A preset-registry field is required (`docs/04` §8). Until then the default is the documented `0.10 mm` for 20 lb / 80 gsm bond. |
| **B-7** | `docs/14` T-PRT-062 | "every page's `MediaBox` equals the trim size" is true of the reading PDF and false of the booklet PDF. | §6.1/§8 scope it; the test needs the same scoping (same root as B-4). |
| **B-8** | Q-04 | Which physical sizes are actually used gates the preset list. §4.2 and §6.1 give `half_letter` and `a5`; a third preset must supply its own `caliper_mm`, `residual_mm` and re-derived `flip_edge` (§7.3). | Open; no block. |
| **B-9** | ~~`docs/08` §4.2/§4.3 ("`border.offset_mm` measured inward from the **text-box** edge") vs `docs/09` §7.1/§7.4 ("the frame is measured from the **trim edge** … the frame is symmetric about the trim")~~ | **RESOLVED.** `docs/08` §4.2/§4.3 now measure the frame inward from the **trim** edge and state the band `8.000 … 10.0292 mm` (`double_rule`; `docs/09` §7.4 carries the same corrected band), so C1 (`offset_mm ≥ safe_area_mm`) is a real constraint with 2 mm of slack. The "text-box edge" wording appears nowhere. | `docs/09` is followed here (§6.3, §6.6, §6.4); no action outstanding. |
| **B-10** | ~~`docs/08` §9.1 margins vs `docs/04` §6.1 / `docs/09` §7.4~~ | **RESOLVED (shift model).** One box model governs the set: `text_box_mm` is declared and symmetric and **is the measure** (half-letter `96.00 × 148.00 mm`); margins and `text_box_ratio` are derived; the print content box is the declared box **shifted** `(gutter + binding)/2 = 3.50 mm` toward the outer edge — fore text edge `18.35 mm`, spine text edge `25.35 mm`, measure **unchanged**. `docs/08` §4.2/§9.2 and `docs/03` §5.2 step 3 were rewritten to it. The earlier "content box removes `gutter + binding` from the spine side" (the asymmetric `89.00 × 148.00 mm` box) is superseded. | No action outstanding. |
