# Project Data Schema

**Implements:** spec §12.2 (structured project data), §12.3 (single source of truth), §6.9 (locks), §6.11 (approval), §12.5 (versioned data)
**Inherits:** `17-decisions-and-open-questions.md` D-03, D-10, D-11, D-18

This document is the authoritative description of project state. `spec/*.schema.json` is its machine-readable form; the two must not diverge, and a test asserts they describe the same entities.

---

## 1. Conventions

| Rule | Value |
|---|---|
| Field naming | `snake_case` on disk, `camelCase` in TypeScript (generated) |
| Timestamps | ISO-8601 UTC, millisecond precision, always `created_at` / `updated_at` |
| Lengths | **Explicit unit suffix always**: `_pt`, `_mm`, `_px_css`, `_em`, `_lines`, `_words`, `_chars`. A bare `width` is a schema error. |
| Physical vs digital units | `*_mm`/`*_pt` are print; `*_px_css`/`*_em` are digital. A design revision carries both sets; a renderer reads only its own (§8.1) |
| Nulls | Omitted, never `null`, except where a tri-state is meaningful (`approval.state`), which uses `""`/enum instead |
| Enums | Lowercase `snake_case` strings, closed sets, never integers |
| Unknown fields | Rejected (`additionalProperties: false`) so typos fail loudly |
| Canonical serialisation | JSON with sorted keys, no insignificant whitespace, arrays ordered by their documented sort key — this byte string is what D-10 hashes |

### 1.1 Revision identity

```
ms_rev  = sha256(canonical_json(manuscript_revision_content))
cmp_rev = sha256(canonical_json(composition_revision_content))
dsg_rev = sha256(canonical_json(design_revision_content))
val_rev = sha256(canonical_json({scope, ms_rev, cmp_rev, dsg_rev, engine_version}))
```

A revision document does **not** contain its own hash. The hash is the filename and the pointer value. This makes revision documents independent of naming and safely de-duplicable.

### 1.2 Entity classes

| Class | Meaning | Mutable? | Example |
|---|---|---|---|
| **Registry entity** | Long-lived identity, edited in place | Yes, with `updated_at` | `Project`, `Block`, `Beat`, `Lock`, `PageTemplate` |
| **Revision** | Immutable snapshot, content-addressed | No, ever | `ManuscriptRevision`, `CompositionRevision`, `DesignRevision`, `ValidationReport` |
| **Event** | Append-only historical record | No | `Proposal`, `Job`, `Action` (composition history) |
| **Approval** | A decision binding revisions | State machine only | `Approval` |
| **Artifact** | A produced file + its manifest | No | `Artifact` |

---

## 2. Entity catalog

| Entity | ID prefix | Identity | Storage | Class |
|---|---|---|---|---|
| `Project` | `prj_` | ULID | `project.json` | Registry |
| `ProjectConfig` | — | embedded in Project | `project.json` | Registry |
| `BookMetadata` | — | embedded in Project | `project.json` | Registry |
| `PublicationProfile` | — | name | `profiles/<name>.json` (repo) | Registry |
| `Block` | `blk_` | ULID | `manuscript/blocks.json` | Registry |
| `ManuscriptRevision` | `ms_` | content hash | `manuscript/revisions/<hash>.json` | Revision |
| `StoryBlueprint` | — | content hash | `structure/blueprint.json` | Revision |
| `Beat` | `beat_` | ULID | `structure/beats.json` | Registry |
| `SourceReference` | `srcref_` | ULID | `structure/sources.json` | Registry |
| `CompositionRevision` | `cmp_` | content hash | `composition/revisions/<hash>.json` | Revision |
| `Page` | `pg_` | ULID (stable across revisions) | inside `CompositionRevision` | Revision-scoped |
| `Lock` | `lck_` | ULID | `composition/locks.json` | Registry |
| `Action` | `act_` | ULID | `composition/history.json` | Event |
| `DesignRevision` | `dsg_` | content hash | `design/revisions/<hash>.json` | Revision |
| `PageTemplate` | `tpl_` | name | `design/templates/<id>.json` | Registry |
| `Proposal` | `prop_` | ULID | `proposals/<id>.json` | Event |
| `ValidationReport` | `val_` | content hash | `validation/<hash>.json` | Revision |
| `Finding` | `find_` | ULID | inside `ValidationReport` | Revision-scoped |
| `Approval` | `apr_` | ULID | `approvals/<id>.json` | Approval |
| `Artifact` | `art_` | ULID | `artifacts/<id>/` | Artifact |
| `Job` | `job_` | ULID | `jobs/<id>.json` | Event |
| `LicenseEntry` | — | `(kind, identifier)` | `licenses.json` | Registry |

---

## 3. `Project`

```jsonc
{
  "id": "prj_01J...",
  "schema_version": 3,                     // bumped only by an explicit migration
  "created_at": "...", "updated_at": "...",
  "title_working": "David and Goliath",
  "config": { /* ProjectConfig */ },
  "metadata": { /* BookMetadata */ },
  "pointers": {                            // current positions in the project
    "manuscript_revision": "ms_9f3a...",
    "composition_revision": "cmp_4c1b...",
    "design_revision": "dsg_77e0...",
    "validation_report": "val_2ab9...",
    "approvals": ["apr_01J..."]
  },
  "source": null,                          // {edition_of: prj_id, dsg_rev} when this project is a new edition (§3.1 mode 9)
  "stage": "composing",                    // see 02-workflow-specification.md §3
  "autonomy": "guided",                    // guided | autonomous
  "review_depth": "l2",                    // D-12
  "targets": {
    "target_print_pages": 16,              // THE GOVERNING LENGTH TARGET (D-16 as amended; 05 §1.6).
                                           //   §3.2 ("Target printable booklet-page count"), §14.1 and §18
                                           //   all express the user's length in pages; it governs, it is not advisory.
    "target_words": 1106,                  // DERIVED at blueprint time and NEVER authored (05 §1.6). The budget
                                           //   fills the story's pages AT THE RESOLVED DENSITY CEILING, minus a
                                           //   reserve — never at 100 % fill:
                                           //     story_pages_target × balanced_lines_per_page × words_per_line_measured
                                           //       − reserve_words
                                           //     = 9 × 16 × 7.9 − 31.6 = 1137.6 − 31.6 = 1106.0 → 1106
                                           //   (three superseded generations, all kept as history. Gen 1 `7.3`/`29.2`/`1022`:
                                           //    the probe fixture was never materialised, so `words_per_line_measured` was
                                           //    a number nothing produced. Gen 2 `7.9`/`31.6`/`1106`: the probe existed, but
                                           //    was measured by counting Range.getClientRects() *fragment* rects (25) rather
                                           //    than line boxes. Gen 3 `8.6`/`34.4`/`1204`: the right instrument — element
                                           //    height ÷ line pitch — run in the WRONG FACE, because the harness never
                                           //    loaded the design's font (document.fonts.load() given the whole quoted
                                           //    stack resolves without loading anything). Measured 2026-10-15 in the shipped
                                           //    face (app/assets/fonts, Lora): 197 words / 25 line boxes = 7.880 → 7.9, and the
                                           //    rendered face is ASSERTED (widths compared against an absent family), never
                                           //    trusted to document.fonts.check(). See 05 §1.6 item 6, fixtures/measure/README.md.)
                                           //   balanced_lines_per_page = floor(resolved_density_band.dense_above
                                           //     × available_height_q / line_height_q) = floor(0.78 × 35800 / 1728) = 16
                                           //   (this project's RESOLVED band, §6.1; the 0.88 default token would give
                                           //   18 lines and a budget of 1248 = 9 × 18 × 7.9 − 31.6).
                                           //   NOTE (05 §1.6 item 7) — the nine story pages are not all prose: the beat's
                                           //     role:"scripture" displays (26 lines) and the headings (1 line) are reserved
                                           //     first, so the effective PROSE budget is (144 − 26 − 1) × 7.9 = 117 × 7.9
                                           //     = 924 _words_, not the 1106 above. The budget must be derived from
                                           //     lines_available_for_prose, never from the total (R-WIZ-017).
                                           //   Fixture arithmetic: 16-… §1.2.1.
    "word_tolerance": 0.15,                // ONE-SIDED — a LOWER drafting band only: words ≥ (1 − 0.15) ×
                                           //   target_words = 940. There is no upper tolerance: above the budget the
                                           //   page target is missed, so an over-length manuscript is REPORTED
                                           //   (CONTENT_LENGTH_OVER_TARGET) rather than admitted (05 §1.6 item 4).
    "target_beats": 11,
    "reading_minutes_min": 5, "reading_minutes_max": 10   // a CHECK on the derived budget, not an input (05 §1.6)
  }
}
```

**Invariants**
- `pointers.*` must resolve to files that exist and whose content hashes match the pointer value. A dangling pointer is a `PROJECT_POINTER_DANGLING` critical finding.
- `schema_version` must be ≤ the engine's supported version; a higher version refuses to open (never silently downgrades).
- `stage` is derivable from state but stored for fast UI; the validator recomputes it and reports mismatch rather than trusting it.
- `targets.target_print_pages` is the **governing** length target (D-16 as amended); `targets.target_words` is **derived** from it at blueprint time and stored for display, with the full derived record — including the `dsg_rev` the words-per-line figure was measured on and the **resolved** density band it was derived at — on the blueprint's `length_model` (`05` §1.2, §1.6). The budget is derived at the **resolved** band's ceiling (`resolved_density_band`, §6.1), never at 100 % page fill and never from the `0.35`/`0.88` default token: a budget derived from the default is a budget the solver cannot place inside the target page count (`05` §1.6 item 1). `targets.word_tolerance` is a **one-sided lower** band; nothing above `target_words` is tolerated, because above it the page target is missed (`05` §1.6 item 4). A blueprint without a derived budget is refused drafting. A print plan whose page count misses `target_print_pages` **after** the pad-to-a-multiple-of-four step raises `PRINT_PAGE_COUNT_OFF_TARGET` (major, A, waivable — registered and owned by `11` §2.4; named here, never defined here).

### 3.1 `ProjectConfig`

| Field | Type | Notes |
|---|---|---|
| `publication_type` | enum | `childrens` \| `biblical` \| `inspirational` \| `educational` \| `other` (§2) |
| `profile` | string | name of the `PublicationProfile` (D-15). The profile also carries the length model's **rate** — `rate_words_per_minute` per age band — because the spec supplies no such rate and a tunable assumption belongs in data, not code (`05` §1.6; Q-09) |
| `genre`, `subgenre` | string | §3.2 |
| `fiction` | enum | `fiction` \| `nonfiction` \| `adaptation` |
| `age_range` | `{min, max}` | years |
| `reading_proficiency` | enum | `emerging` \| `early` \| `developing` \| `fluent` |
| `tone` | string[] | from profile's vocabulary |
| `perspective` | enum | `first` \| `third_limited` \| `third_omniscient` \| `second` \| `n/a` |
| `theme` | string | the intended lesson (§3.2) |
| `language` | BCP-47 | **part of the design revision and therefore of the pagination input** (D-04, Part C of the decisions register) |
| `spelling_convention` | enum | `us` \| `uk` \| `other` |
| `writing_style` | string | |
| `length_preset` | enum | `micro` \| `early_reader` \| `bible_story` \| `childrens_short` \| `inspirational` \| `extended` \| `devotional` (§3.3) |
| `front_matter` | string[] | e.g. `["title","copyright","dedication"]` |
| `back_matter` | string[] | e.g. `["memory_verse","discussion_questions","about"]` |
| `scripture_enabled` | bool | adds scripture validators and source fields |
| `illustration_ready` | bool | V1 stores intent only (§3.2) |
| `content_rules` | object | profile-supplied: prohibited topics, required lesson statement, reading-level ceiling |

### 3.2 `BookMetadata`

Publication-facing only (what appears on the title page and in exports): `title`, `subtitle`, `author`, `illustrator` (empty in V1), `publisher`, `copyright_year`, `copyright_holder`, `isbn` (optional), `edition`, `language_of_publication`, `dedication`, `acknowledgements`.

**Invariant:** `author` is never inferred from the project owner or requestor — it is either supplied or omitted (`illustrated-storybook-production` §8 pitfall; §14's benchmark leaves it to Stephen to supply).

---

## 4. Content entities

### 4.1 `Block` — the atomic unit of prose

§12.2's "stable identifiers for content blocks" is realised here. A block is the smallest thing a lock, a page assignment or a rewrite can target.

| Field | Type | Notes |
|---|---|---|
| `id` | `blk_` ULID | **never changes**, never reused |
| `type` | enum | `paragraph` \| `heading` \| `subheading` \| `line` \| `quotation` \| `scripture` \| `list_item` \| `page_number` \| `blank` |
| `role` | enum? | semantic role for templates: `opening` \| `climax` \| `reflection` \| `verse` \| `question` \| `lesson` \| null |
| `text_hash` | sha256 | hash of the block's text at the current `ms_rev` |
| `origin` | object | `{kind: "human"\|"ai"\|"import", provider?, model?, prompt_hash?, proposal_id?}` |
| `created_at`, `superseded_at` | | a block is superseded, never deleted while referenced |

Prose text lives in the **manuscript revision**, keyed by block id — not in the block registry. This is deliberate: it means a composition revision referencing `blk_x` cannot possibly contain a stale copy of `blk_x`'s prose (§12.3).

### 4.2 `ManuscriptRevision` (`ms_`)

```jsonc
{
  "parent": "ms_previous..." | null,
  "reason": "apply_proposal:prop_01J...",     // why this revision exists
  "created_at": "...", "created_by": "human" | "autonomous",
  "review_depth_applied": "l2",
  "blocks": [                                  // ORDER IS MEANING (reading order)
    {"block_id": "blk_a", "text": "...", "text_hash": "..."},
    {"block_id": "blk_b", "text": "..."}
  ],
  "beat_order": ["beat_1", "beat_2"],          // structural order at this revision
  "stats": {"words": 1106, "chars": 6334, "reading_minutes": 7.4, "reading_level": {"fk": 4.1, "target_max": 5.0}}
}
```

**Invariants**
- Every `block_id` in `blocks` exists in the block registry.
- `text_hash` matches `sha256(normalised(text))` where normalisation is NFC + collapsed whitespace + trimmed — chosen so a copy-paste that changes trailing whitespace is *not* a content change for lock purposes.
- `stats` is derived; a validator recomputes it and reports drift (never trusts it).
- `stats.reading_minutes` is recomputed by the **defined** formula `round(words ÷ rate_words_per_minute(age_band), 1)` (`05` §1.6) — which is what gives `R-GEN-014`'s "reading minutes recomputed" an oracle. The example above is the §14.1 fixture's band (6–10, `early`, 150 `_words_per_minute_`) **at the derived budget** (`§3`: `1106 = 9 × 16 × 7.9 − 31.6`, i.e. `140 balanced lines × 7.9`): `1106 ÷ 150 = 7.3733 → **7.4**`, inside §14.1's 5–10 minute window (`chars` moves with the word count, at the fixture's ≈5.73 characters per word — `1106 × 5.73 ≈ 6334`). It previously read `1387` words with `reading_minutes: 7.4`, which implied an unstated ≈187 wpm — the adult continuous read-aloud rate, with no child-audience allowance; **the number was corrected, not the rate** (`05` §1.6 item 3). The word count was then re-derived too (`1387 → 1022`; `1022 → 1106` when the probe was first measured; `1106 → 1204` when the line count was re-measured by the correct instrument in the wrong face; and `1204 → 1106` when it was measured at last **in the face the book ships** — `05` §1.6 item 6's four generations): under the amended model `1387` words is `176` lines (`1387 ÷ 7.9`), past the `144` balanced lines the nine story pages hold, so the example contradicted the very target it illustrated (`16` §1.2.1). An example is corrected when it is the defect (`05` §1.6 item 4).
- `beat_order` covers every beat exactly once; beats are resolved to block spans via `structure/beats.json`.

### 4.3 `StoryBlueprint` (§4.2)

`premise`, `target_reader`, `opening_hook`, `characters[]` (`name`, `role`, `description`, `arc`), `setting`, `central_theme`, `progression[]` (ordered `{beat_ref, purpose, emotional_direction}`), `turning_points[]`, `climax`, `resolution`, `intended_emotional_effect`, `closing_reflection`, `estimated_words`, `suggested_page_distribution[]` (`{beat_ref, pages_suggested}`), plus provenance.

**Note on §4.2's "story beats and page-turn opportunities, not chapters":** the blueprint's `progression[]` entries *are* beat stubs; `deriveBeats()` (Engine B) turns them into `Beat` records with stable IDs. A blueprint revision that removes a beat does not delete the beat's blocks — it unassigns them and raises a `BEAT_ORPHANED_BLOCKS` finding.

### 4.4 `Beat`

| Field | Notes |
|---|---|
| `id` `beat_` | stable |
| `purpose` | narrative/instructional purpose (§5.1 "a specific narrative or instructional purpose") |
| `block_ids[]` | ordered; the beat's span in the manuscript |
| `word_budget` | §5.1 approximate budget |
| `emotional_direction` | rising \| falling \| flat \| turn |
| `turning_point` | bool — flagged as a §4.2 turning point |
| `locked` | mirror of an active `beat_lock`, for fast checks |

A block belongs to **at most one** beat. A block belonging to none is `BEAT_UNASSIGNED_BLOCK` (major).

### 4.5 `SourceReference` (§4.3)

| Field | Notes |
|---|---|
| `id` `srcref_` | |
| `kind` | `scripture` \| `fact` \| `tradition` \| `quotation` |
| `citation` | e.g. `1 Samuel 17:38-51` |
| `translation` | registry key; must exist in `scripture/registry.json` (D-08) |
| `resolution` | `{book, chapter_start, verse_start, chapter_end, verse_end}` — **deterministically resolved**, not free text |
| `quoted_text_block_ids[]` | which manuscript blocks are verbatim scripture |
| `paraphrase_block_ids[]` | which are paraphrase/imaginative expansion |
| `verification` | `{state: unverified\|verified\|flagged\|disputed, method, notes, reviewer}` |
| `disclaimer_required` | bool — true when invented dialogue accompanies the passage (§4.3 "Avoid presenting invented dialogue as literal scripture") |

**Invariant (§4.3):** every `scripture`-type block in the manuscript must be covered by a `SourceReference` whose `resolution` resolves in the registry, and whose `translation` has a licence entry. Otherwise `SCRIPTURE_UNSOURCED` (critical for published artifacts).

---

## 5. Composition entities

### 5.1 `CompositionRevision` (`cmp_`) — contains **no prose** (§12.3)

```jsonc
{
  "parent": "cmp_prev..." | null,
  "reason": "move:blk_c->pg_4",
  "ms_rev": "ms_9f3a...",            // the manuscript this plan was made for
  "dsg_rev": "dsg_77e0...",          // the design it was measured against (D-13)
  "scope": "print" | "digital" | "both",
  "logical": {                        // §6.10 layer 1 — intent, viewport-independent
    "beat_order": ["beat_1", "..."],
    "beats_per_page": {"pg_1": ["beat_1"], "pg_4": ["beat_2","beat_3"]},
    "intentional_breaks": [{"before_block": "blk_x", "essential": true, "reason": "reveal"}]
  },
  "digital": {                        // §6.10 layer 2 — screen-specific, reflowable
    "pages": [{"page_id": "pg_1", "template": "tpl_story", "spans": [{"block_id":"blk_a","from_line":0,"to_line":12}], "violations": []}],
    "measured_at": [{"viewport_px_css": "360x640", "pages": 18}, {"viewport_px_css": "1440x900", "pages": 9, "spread": true}],
    "page_count_range": [9, 18]
  },
  "print": {                          // §6.10 layer 3 — fixed physical assignment
    "paper": "half_letter" | "a5" | {"width_mm": 139.7, "height_mm": 215.9},
    "pages": [
      {"page_id": "pg_1", "kind": "title",   "template": "tpl_title",   "spans": [], "frozen": true},
      {"page_id": "pg_5", "kind": "story",   "template": "tpl_story",   "spans": [{"block_id":"blk_c","from_line":0,"to_line":9}], "frozen": true}
    ],
    "page_count": 16,
    "imposed": {"sheets": 4, "spec_version": 1}
  },
  "approval_state": "unapproved" | "approved" | "stale"
}
```

**Invariants** (validated, `05-content-and-composition-model.md` §6)
- No prose appears anywhere in this document.
- `sum(len(spans))` over all pages equals the number of blocks in `ms_rev` — nothing dropped, nothing duplicated.
- Every `block_id` resolves in `ms_rev` and its `text_hash` matches.
- `print.page_count % 4 == 0` for `saddle_stitch` imposition.
- `logical.beat_order` is a permutation of the beat list, and page order never contradicts beat order (a later beat may not appear on an earlier page unless an explicit `ordering_override` is recorded with a reason).
- `digital.pages` and `print.pages` may differ in count and in contents — that is legal (§6.10, D-06) — but every `essential` break must be honoured in `print`, and must be honoured in `digital` at the largest reference viewport or reported as `BREAK_UNSATISFIED`.

### 5.2 `Page`

Fields: `page_id` (stable ULID), `kind` (`title` \| `copyright` \| `dedication` \| `contents` \| `story` \| `quotation` \| `scripture` \| `reflection` \| `discussion` \| `closing` \| `blank` \| `back`), `template` (`tpl_`), `spans[]`, `frozen`, `notes`, `blank_intentional` (bool, with `reason`).

`kind` is what §6.4 calls "convert a page into a title, dedication, story, reflection, or closing page". Conversion changes `kind`+`template` and never touches prose.

### 5.3 `Lock` (§6.9) — full semantics in `07-lock-and-constraint-rules.md`

```jsonc
{
  "id": "lck_01J...",
  "type": "content_lock" | "beat_lock" | "page_break_lock" | "keep_together_lock" | "print_page_lock" | "design_lock",
  "scope": {                       // exactly one of:
    "block_ids": ["blk_a","blk_b"],           // content_lock, beat_lock, keep_together_lock
    "before_block": "blk_x",                  // page_break_lock
    "page_id": "pg_5",                        // print_page_lock
    "token_paths": ["typography.body.size_pt"]// design_lock
  },
  "precedence": 0,                  // filled from the type's class (H1/H2/S1–S4, 07 §2). For a HARD lock this is
                                    // the solver's real precedence (enforced by edge removal) and is not overridable;
                                    // for a SOFT lock it orders the report and selects the weight (07 §4.3).
                                    // An override requires a non-empty `reason`.
  "essential": true,                // page_break_lock only
  "tolerance": {"lines_over": 2},   // keep_together_lock only
  "created_at": "...", "created_by": "...", "reason": "...",
  "state": "active" | "released", "released_at": null
}
```

Every lock carries a human `reason`. A lock with no reason is rejected at creation — the spec's whole point is that composition decisions are *intentional*.

### 5.4 `Action` (composition history, §6.4 undo/redo, §15.2 rollback)

`{id, at, kind, from_rev, to_rev, params, actor}` where `kind ∈ {move, reorder_beats, split_page, merge_pages, insert_break, remove_break, create_page, delete_page, convert_page, set_template, lock, unlock, freeze, reopen_pagination, restore_revision, accept_suggestion}`. History is append-only; "undo" is restoring an earlier revision, not deleting an action.

---

## 6. Design entities

### 6.1 `DesignRevision` (`dsg_`)

```jsonc
{
  "parent": "dsg_prev...",
  "theme": "warm_parchment",              // §8.2
  "tokens": { /* token set, see 09-design-token-architecture.md */ },
  "typography": {
    // px_css = pt × 4/3 exactly (1 pt ≡ 4/3 px_css) — a mismatch is DESIGN_UNIT_PAIR_MISMATCH (09-… §1.8)
    "body":    {"family": "Lora",   "size_pt": 13.5, "size_px_css": 18, "line_height": 1.5,  "letter_spacing_em": 0, "hyphenate": true},
    "heading": {"family": "Lora",   "size_pt": 22.5, "size_px_css": 30, "line_height": 1.15},
    "display": {"family": "Cinzel", "size_pt": 31.5, "size_px_css": 42},
    "minimum_readable_pt": 12,              // §8.3 "Preserve readable minimum sizes"
    "scale_steps": [0.85, 1.0, 1.15, 1.3],  // reader font-size adjustment (§7.3)
    "orphans": 2, "widows": 2
  },
  "layout": {
    // THE BOX MODEL (one rule; 08-… §4.2 and 09-… §7 implement it):
    //   DECLARED  text_box_mm (symmetric frame), paper, safe_area_mm, gutter_mm, binding_allowance_mm, border.*
    //   DERIVED   side margin   = (trim_width_mm  - text_box_mm.width)  / 2
    //             head=foot margin = (trim_height_mm - text_box_mm.height) / 2
    //             text_box_ratio  = text_box_mm.width / trim_width_mm        (never authored; consumed only
    //                                 as the digital content-width factor -- 08 §3.3, §9.6)
    //             print content box = text box SHIFTED (gutter_mm + binding_allowance_mm)/2 toward the OUTER edge
    //                                 (measure unchanged -- the spine clearances are physical, not typographic -- 08-… §4.2, 10-… §1.3)
    "paper": "half_letter",                  // the paper this geometry was authored for; switching = new dsg_rev, never a rescale (09-… §2.1)
    "paper_fit": ["half_letter", "a5"],       // papers this design is known to fit without a re-solve
    "text_box_mm": {"width": 96, "height": 148},   // DECLARED, symmetric
    "margins_override_mm": null,              // escape hatch: {head,foot,inner,outer}. If set, margins are DECLARED
                                              // and text_box_mm becomes derived -- the only way to express an
                                              // asymmetric head/foot margin. V1 ships it null (folios live in the margin).
    "text_box_ratio": {"n_mm": 96, "d_mm": 139.7},   // DERIVED = 96 / 139.7 — an EXACT RATIONAL, never a decimal.
                                            //   528 × 0.6872 = 362.8416 px_css → 23222 q, one quantum off the
                                            //   23221/64 q the geometry gives (96 × 96/25.4 = 362.8346 → 23221 q),
                                            //   and that one quantum breaks 09-… §1.7's line-break parity at the
                                            //   reference box (§9.6). Consumed only as the digital content-width
                                            //   factor (08 §3.3, §9.6); never an input to any derived value
                                            //   (09 §1.5 rule D-2). Register R-4's "never consumed" is superseded.
    "border": {"style": "double_rule", "thickness_pt": 0.75,            // OUTER rule (09-… §7.1)
               "thickness_inner_pt": 0.75,                              // double_rule only; absent for single_rule
               "gap_mm": 1.5,                                           // outer→inner rule gap; double_rule only
               "offset_mm": 8, "colour": "#8a6f47", "corner": "square",
               "text_gap_min_mm": 3, "min_visible_mm": 0.18},           // 09-… §7.1; the C2 and C3 inputs
    "safe_area_mm": 6, "gutter_mm": 4, "binding_allowance_mm": 3,
    "spacing_tolerance": {"min": -0.06, "max": 0.06},  // fraction of line height; the ONLY content-neutral automatic edit (05-… §2.4)
    "min_side_text_margin_mm": 18.35,       // DERIVED = min(margin_outer_mm, spine_side_inset_mm) = min(18.35, 25.35).
                                            //   The nearer text edge to the trim; the quantity the C2 frame check and
                                            //   the safe-area check bind (08-… §4.2). Never authored (09 §1.5 D-3).
    "density_tolerance": {"sparse_below": 0.33, "dense_above": 0.80},   // DECLARED — the THEME's own band
                                            //   (09-… §4.1, theme 5 `warm_parchment`). A projection of the theme
                                            //   token `density_band`, so it MUST equal its token path (09 §1.5 D-1 —
                                            //   otherwise DESIGN_TOKEN_BLOCK_DIVERGENCE). It is neither the §6.7
                                            //   default 0.35/0.88 nor the resolved band.
    "resolved_density_band": {              // DERIVED — the ONLY band any consumer may read (05 §2.4, 07 §4.3,
                                            //   08 §6.1, and 14's tests). Resolved from theme + publication profile
                                            //   + the §6.7 defaults by 09-… §4.3's rule (max on sparse, min on
                                            //   dense), bound to this project's profile (D-15) when the revision
                                            //   is compiled:
      "sparse_below": 0.35,                 //   max(theme 0.33, profile childrens_bible / early 0.33, default 0.35)
      "dense_above": 0.78,                  //   min(theme 0.80, profile 0.78, default 0.88)
      "resolved_from": ["theme", "profile", "default"], "profile": "childrens_bible"
    }
  },
  "templates_hash": "a19f...",              // hash of every PageTemplate this revision resolves (D-04: pagination
                                            // must be a pure function of the revision triple, so the templates it
                                            // reads are part of its identity -- see 12-… §11)
  "lang": "en", "hyphenation": "en-us",      // part of the pagination input (D-04)
  "reader_overrides": {                      // what the reader runtime may change (§7.3)
    "font_scale": true, "theme": ["light","sepia","dark"], "line_height": false
  }
}
```

**Invariant:** every `family` referenced must exist in `fonts/registry.json` with `license` present and, if used for print, `embed_pdf: true` (D-09).

### 6.2 `PageTemplate` (§6.8)

`{id, name, kind_compatibility[], regions[]}` where a region is `{slot, blocks_allowed[], vertical_align, max_lines, typography_role, border_slot}`. The ten presets of §6.8 are shipped templates: `tpl_title`, `tpl_story`, `tpl_opening`, `tpl_reveal`, `tpl_reflective`, `tpl_quotation`, `tpl_scripture_ref`, `tpl_discussion`, `tpl_closing`, `tpl_blank`.

**Invariant (§6.8/§9.2):** every template declares `border_slot: "perimeter"` unless it is explicitly a cover exception — the perimeter frame geometry comes from the design revision, so template variety cannot break border consistency ("Page templates may vary internally, but the perimeter frame must remain visually consistent").

---

## 7. Process entities

### 7.1 `Proposal` (D-11)

`{id, task, created_at, target: {kind: manuscript|composition|design|structure, refs[]}, change: <typed payload>, rationale, provenance: {provider, model, prompt_hash, input_hashes, tokens, latency_ms}, state: proposed|applied|rejected|superseded, applied_as: ms_rev|cmp_rev|null, refusal: null|{code, reason}}`

For a `scripture` project, a `change` payload that invents dialogue in a `scripture`-type block must carry `as_paraphrase: true`; otherwise the proposal is refused (`SCRIPTURE_DIALOGUE_UNMARKED`, D-08/§4.3). A proposal targeting a `content_lock` span is refused **at creation** (D-11).

### 7.2 `ValidationReport` + `Finding` (§10)

```jsonc
{
  "id": "val_...", "scope": ["manuscript","composition","print"],
  "judged": {"ms_rev": "...", "cmp_rev": "...", "dsg_rev": "...", "engine_version": "0.1.0", "chromium": "..."},
  "generated_at": "...",
  "summary": {"critical": 0, "major": 2, "minor": 5, "info": 3, "blocking": true},
  "findings": [{
    "id": "find_01J...",
    "code": "PRINT_PAGE_OVERFLOW",
    "family": "print",                       // content | composition | digital | print | ops
    "severity": "critical",
    "blocking": true,
    "refs": {"page_id": "pg_9", "block_ids": ["blk_r"], "lock_ids": []},
    "message": "Block blk_r needs 11 lines, page pg_9 holds 8.",
    "evidence": {"needed_lines": 11, "available_lines": 8, "overflow_px_css": 46},
    "correction": {"ladder_step": "reflow_unlocked", "automatic": false, "suggested": "move blk_r to pg_10"}
  }]
}
```

`severity` and `blocking` are separate: a major finding can be non-blocking, and a critical finding is always blocking. The blocking policy lives in `11-validation-strategy.md`, and no code path may set `blocking` itself — it is derived from `(code, severity, project state)` by one function, so it can be tested exhaustively.

### 7.3 `Approval` (§6.11, §14)

```jsonc
{
  "id": "apr_01J...", "at": "...", "by": "stephen",
  "scope": ["manuscript","beat_order","page_turns","digital_composition","print_composition","design","previews"],
  "revisions": {"ms_rev": "...", "cmp_rev": "...", "dsg_rev": "...", "val_rev": "..."},
  "environment": {"engine_version": "...", "chromium": "...", "fonts_hash": "...", "pdf_assembly_lib": {"name": "pdf-lib", "version": "<pinned>"}, "imposition_spec_version": 1},
                                 // D-14: the environment that produced the artifact. The PDF assembly library is
                                 // part of it although it typesets nothing -- the booklet PDF is assembled from
                                 // already-rendered Chromium pages (10-… §8.2), so its pin is a reproducibility
                                 // input (17-… D-14). The manifest's field list is owned by 12-… §6; this row
                                 // records the same set and does not define it.
  "frozen": {"print_pages": [5,6,7,8,9,10,11,12,13], "content_lock_ids": ["lck_a"]},
                                 // the story-page band of the 16-page fixture: f = 4 front pages, then
                                 // s = 9 story pages (5..13), then b = 3 back (16 §1.2.1). Derived from the
                                 // plan, not hard-coded: the band is 1..k_f, k_f+1..k_f+s, k_f+s+1..M.
  "state": "approved" | "stale",
  "stale_reason": null | "manuscript_revision_changed" | "composition_revision_changed" | "design_revision_changed" | "engine_changed" | "chromium_changed" | "fonts_changed" | "pdf_assembly_lib_changed" | "imposition_spec_changed",
  "waivers": [],                 // [{id /*wv_*/, finding_id /*find_*/, code, waived_by, reason,
                                 //   scope /*ApprovalScope*/, created_at}] -- the Waiver shape is defined once
                                 // and only once, in 11-… §1.4 (W4/W5); this row references it and does not
                                 // re-spell it (12-… §11.3). `scope` is load-bearing: a waiver lifts one flag
                                 // in one scope and never rewrites the finding (W3, W5). `critical` is never
                                 // waivable (W1, §10.5), and an unflagged `major` has no block to lift
  "revoked": null,               // {at, by, reason} -- revocation is recorded, never a deletion
  "superseded_by": null,         // apr_id of the approval that replaced this one
  "manual_proof": null | {"kind": "printed_booklet", "at": "...", "photo_hash": "...", "notes": "..."}
}
```

**Invariant:** an artifact may only cite an `Approval` with `state: approved` **and** revisions equal to the current pointers, **and** `environment` equal to the engine's actual environment. Otherwise the export is refused with `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (critical) — this is the mechanism behind §15.5 "Exported files match the approved revision".

### 7.4 `Artifact`

`{id, kind: html_storybook|reading_pdf|booklet_pdf|page_png|proof_sheet|print_guide|manifest, created_at, approval_id, manifest: {revisions, environment, files[] with sha256 and bytes}, reproducible: true|false}` — `environment` carries the D-14 set in full, **including the pinned PDF assembly library** (`17` D-14; the field list is owned by `12` §6 and is referenced, not duplicated, here).

### 7.5 `Job` (D-17)

`{id, kind, state, created_at, updated_at, steps: [{name, state, attempts, checkpoint, result_hash}], input_hashes, error, resumes: n}`

---

## 8. Registries in the repository

| File | Contents | Enforced by |
|---|---|---|
| `profiles/<name>.json` | publication profile (D-15) | `COMP_PROFILE_*` validators |
| `themes/<name>.json` | theme = a named token set (§8.2, eight themes) | design validators |
| `fonts/registry.json` | font families + licence + embed flags (D-09) | `DESIGN_FONT_UNLICENSED`, `PRINT_FONT_NOT_EMBEDDABLE` |
| `scripture/registry.json` | public-domain translations + book/chapter/verse index (D-08), **and a per-translation `jurisdiction`** — the KJV's freedom is jurisdictional (D-08's footnote: Crown letters patent in the UK), so "public domain" is recorded as *where*, not as a bare boolean | `SCRIPTURE_UNSOURCED`, `SCRIPTURE_REF_UNRESOLVED` |
| `imposition/spec.json` | imposition arithmetic version (D-14) | `PRINT_IMPOSITION_SPEC_MISMATCH` |
| `licenses.json` (per project) | translations, fonts, third-party assets actually used | `OPS_LICENSE_MISSING` |

---

## 9. Migration policy

1. `schema_version` is a single integer per document kind, bumped only when a field is removed or its meaning changes.
2. Migrations are pure functions `migrate_N_to_N1(doc) -> doc`, registered in `src/project/migrations/`, each with a fixture pair (before/after).
3. Opening a project runs pending migrations into a **copy**, validates the migrated project, and only then swaps. The pre-migration project directory is retained as `project.json.pre-vN`.
4. A migration must be idempotent and must not require network access or an AI call.
5. A project whose `schema_version` exceeds the engine's is refused with an actionable message (never opened read-write, never partially migrated).

---

## 10. Invariants summary (each is a named validator)

| Invariant | Code | Severity |
|---|---|---|
| Pointers resolve, hashes match | `PROJECT_POINTER_DANGLING` | critical |
| No prose inside a composition revision | `COMP_REVISION_CONTAINS_PROSE` | critical |
| All `ms_rev` blocks appear in exactly one page span | `COMP_BLOCK_LOST` / `COMP_BLOCK_DUPLICATED` | critical |
| Referenced block exists in `ms_rev` | `COMP_BLOCK_UNRESOLVED` | critical |
| `print.page_count % 4 == 0` | `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR` | critical |
| `print.page_count == targets.target_print_pages` **after** the pad-to-four step | `PRINT_PAGE_COUNT_OFF_TARGET` (`11` §2.4) | major (A) |
| Beat/page order consistent | `COMP_ORDER_CONTRADICTS_BEAT_ORDER` | major |
| Essential break honoured | `BREAK_UNSATISFIED` | major (critical in print) |
| `text_hash` matches text | `MS_TEXT_HASH_DRIFT` | major |
| Block belongs to ≤ 1 beat | `BEAT_BLOCK_SHARED` | major |
| Every block in a beat | `BEAT_UNASSIGNED_BLOCK` | major |
| Scripture block sourced + licensed | `SCRIPTURE_UNSOURCED` | critical for export |
| Font licensed / embeddable | `DESIGN_FONT_UNLICENSED` | critical for print |
| Approval matches current revisions | `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` | critical |
| Stats match derived stats | `MS_STATS_DRIFT` | info |
| `schema_version` supported | `PROJECT_SCHEMA_UNSUPPORTED` | critical |
