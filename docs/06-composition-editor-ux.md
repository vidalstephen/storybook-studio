# Page Composition Editor — Interface and Interaction Design

**Implements:** spec §6.1, §6.3, §6.4, §6.5, §6.6, §6.7, §6.9, §6.10, §6.11, §11.2, §7.2–§7.3, §15.2
**Deliverable covered:** D7 (per §16)
**Inherits:** `docs/00-README.md`, `docs/02-workflow-specification.md`, `docs/03-technical-architecture.md`, `docs/04-project-data-schema.md`, `docs/05-content-and-composition-model.md`, `docs/07-lock-and-constraint-rules.md`, `docs/17-decisions-and-open-questions.md`

This document specifies **structure, states, behaviour and accessibility** of the Page Composition Editor. It does **not** specify visual styling (§8 / `09-design-token-architecture.md` own appearance); where a rule is visual it is stated as a semantic requirement on a rendered state.

---

## 1. Purpose, and the constraint the design serves

§6.1 states the editor's reason to exist: *precise control over how written content is distributed, paced, and experienced across pages*, so that "a single sentence on a page", "a page turn", and "a quiet closing page" are **authored**, not emergent. §6.2 step 9 makes the author's manual modification the normative act, and §6.10 forbids the machine from silently reconciling the three composition layers.

Everything below follows from one interaction principle:

> **One deliberate gesture produces exactly one revision and one `Action`, the author sees the outcome before it is committed where a commitment is irreversible, and no intentional decision is ever changed without a recorded human reason.**

The editor must make three things **cheap** — the three verbs of §6.4's capability list:

| Must be cheap | What "cheap" means here | Why it is load-bearing |
|---|---|---|
| **Compose** | Move / split / merge / break a page in ≤ 2 gestures, with the pacing consequence (what the reader sees on the turn) visible at the moment of the gesture. | §6.1; §6.2 step 9; the whole reason composition runs *after* review (W6/W7). |
| **Lock** | Mark a decision as intentional in one action, with a mandatory one-line reason. | §6.9; `D-07`; `docs/07` §1 — a lock is the author saying "this was intentional". |
| **Compare** | See "what changed", "what would happen if", and "what did I approve" without leaving the workspace. | §6.4 (compare compositions, preview adjacent, restore approved); §6.11; §15.2 (history supports rollback). |

**Non-negotiable consequences** the interface must embody, stated once: no prose is edited here (§12.3, `D-10`; `docs/03` §10); no AI result reaches the plan without becoming a revision (`D-11`); no lock is released, weakened or re-scoped by the machine (`docs/07` §5.4 rule 1); a hard conflict is *identified*, never resolved by reflow (§6.9; `docs/07` §5).

---

## 2. Workspace layout — the six panes of §6.3

The workspace is `src/studio` (`docs/03` §4), hosting the Page Composition Editor among §11.2's seven workspaces. Each pane below names its canonical data source with the entities and fields of `docs/04`.

### 2.1 Pane responsibilities, data sources, empty and degraded states

| Pane (§6.3) | Responsibility | Data source (canonical) | Empty state | Degraded state (analysis unavailable) |
|---|---|---|---|---|
| **Page Navigator** | Thumbnail strip of every page/spread in reading order for the **currently selected plan**; the authoring surface for page-level ops. | `CompositionRevision.digital.pages[]` **or** `.print.pages[]`; per entry `Page.page_id`, `Page.kind`, `Page.template`, `Page.frozen`; `digital.measured_at[]`. | *No composition yet* → "Run initial composition" (§6.2; W6). Thumbnails are not placeholders that look like pages. | Measurement not yet run: thumbnails render **outline + reading order only**, each labelled with its `page_id` and `kind`; never a guessed layout (`D-13`). |
| **Composition Canvas** | Large preview of the selected page or spread, at the plan's own geometry. | Digital plan: page rendered from `Page.spans[]` + prose resolved by `Block.id` from `ms_rev`, in `DesignRevision` geometry, at one reference viewport of the set (`docs/03` §5.1). Print plan: same, at paper trim in `_mm`; per-page fit report. | Blank canvas with the selected plan and viewport stated. | A span whose lines are unmeasured renders **block-granular** (whole blocks, ids visible, no line-level break) and is watermarked "unmeasured — geometry provisional". |
| **Content Inspector** | The text, content blocks and story beats assigned to the selected page (§6.3), plus their lock state. | `Page.spans[]` → `Block.id`, `.type`, `.role`; `Beat.id`, `.block_ids`, `.purpose`, `.emotional_direction`, `.turning_point`; `Lock` intersecting the page. | "No page selected" or (empty page) "This page holds no blocks — insert an approved blank or convert its kind". | Prose is always available (it is the single source of truth, §12.3); only **line ranges** degrade, per Canvas above. |
| **Design Inspector** | Read and select among typography, border, spacing and **permitted layout variations** (§6.3) — i.e. the composition-legal subset, not token authoring. | `DesignRevision.typography`, `.layout` (`text_box_mm`, `density_tolerance`, `safe_area_mm`, `gutter_mm`, `binding_allowance_mm`), `.reader_overrides`; `PageTemplate.regions[]`, `.kind_compatibility[]`. | "No design revision" (project not yet configured — W1 always writes one, `D-13`). | Read-only if the current `dsg_rev` cannot be measured; token edits are **never** offered here (§10, row 2). |
| **Composition Assistant** | Context-aware recommendations for balance, placement and rhythm (§6.3) — density advice (§6.7) and page-turn suggestions (§6.6), each a stored, stateful object. | `CompositionRevision.page_turn_suggestions[]` (`.state ∈ accepted/rejected/modified`); density classification per `composition/density` (`docs/05` §2.4); `Proposal` objects for the two meaning-affecting suggestions. | "No suggestions yet" + a **Generate suggestions** action (a `job_`, `D-17`). | Analysis job not run or stale for the current triple: the pane shows the last job's `state` and a **Run analysis** action; it shows **no** advice rather than stale advice. |
| **Status and Validation Panel** | Warnings and indicators for overflow, excessive density, broken boundaries and print compatibility (§6.3). | `ValidationReport` / `Finding` (`refs.page_id`, `.block_ids`, `.lock_ids`; `severity`; `blocking`); `Approval.state`, `.stale_reason`; `Job` progress. | "Not yet validated for the current revisions." | No `val_rev` for the current `(ms_rev, cmp_rev, dsg_rev)` → the panel says exactly that and offers **Validate**; it does not present a report judged on other revisions (`docs/04` §7.2 `judged{}`). |

**Pane-level invariants**
- Every pane reads from a revision, never from a live AI response (`docs/03` §2 rule).
- The **plan switcher** (Digital plan / Print plan) scopes four of the six panes at once; a pane never silently mixes the two plans' pages (`D-06`; §6.10).
- A blocked condition (`docs/02` §3.4) is displayed in the Status panel and as a persistent header badge; it forbids **publishing**, not editing (`docs/02` §3.4).

### 2.2 Responsive layout (Stephen reviews phone → tablet → desktop first)

Editor breakpoints are **the editor's own**; they are distinct from the reader's spread threshold (facing pages at ≥ 1024×768 `_px_css`, `docs/03` §5.1 / §7.1) and from the reference viewport set. A viewport unit is always `_px_css`.

| Pane | ≥ 1280 `_px_css` (desktop) | 768–1279 `_px_css` (tablet) | < 768 `_px_css` (phone) |
|---|---|---|---|
| Page Navigator | Persistent left rail; vertical thumbnails. | Horizontal filmstrip docked above the canvas. | **Top filmstrip drawer** (collapsed to a page-count header; tap to expand). |
| Composition Canvas | Centre column, occupies remaining width. | Centre column, full width between filmstrip and dock. | **Single full-width column** — the canvas is the default surface. |
| Content Inspector | Right column, stacked with Design Inspector + Assistant as a tab group. | **Right tabbed panel** (one of the three visible). | **Bottom drawer, tab** 1 of 4. |
| Design Inspector | As above, tab. | As above, tab. | **Bottom drawer, tab** 2 of 4. |
| Composition Assistant | As above, tab. | As above, tab. | **Bottom drawer, tab** 3 of 4. |
| Status and Validation | Persistent bottom dock (collapsed to a severity summary bar). | **Bottom sheet**, collapsed to a badge. | **Bottom drawer, tab** 4 of 4, plus a persistent header badge. |

**Responsive rules**
1. The **canvas and Status panel are never hidden** at any width — they are the two surfaces that show whether the book is real. At < 768 `_px_css` the Status panel collapses to a **badge** (count of blocking findings) but the badge is always visible.
2. Below 768 `_px_css` every inspector and the Navigator become **drawers**; a drawer opened to act on a page never covers the whole canvas — the selected page's identity (`page_id`, `kind`, plan) stays visible in a sticky header.
3. The **spread** view (§6.4) is available only when the viewport allows it (§7.1); below the threshold the control is *disabled with a stated reason*, not hidden, so the author learns the reader behaves the same way (§6.10 disclosure duty).
4. Drawer/tab state is **view state**, not a revision (see §3, row 1): opening a drawer never produces an `Action`.
5. Touch is the default pointer at < 1280 `_px_css`; all operations are reachable without a pointer (see §4).

---

## 3. Interaction inventory — every §6.4 operation

`Action.kind` values are the closed set of `docs/04` §5.4: `move, split_page, merge_pages, insert_break, remove_break, create_page, delete_page, convert_page, set_template, lock, unlock, freeze, reopen_pagination, restore_revision, accept_suggestion`. "New `cmp_rev`" means a fresh content-addressed composition revision whose `parent` is the currently open one (`D-10`).

| # | Operation (§6.4) | Trigger | Preconditions | Revision + `Action` record | Validation scope (targeted, `docs/05` §2.7) | Success / failure UI |
|---|---|---|---|---|---|---|
| 1 | **Select a page** | Click/tap thumbnail; `←/→` in Navigator; jump via Status finding. | A `cmp_rev` is open. | **None** — selection is view state; no revision, no `Action`. | None. | Canvas + both inspectors update. Live region announces the page (§4.4). |
| 2 | **View single vs spread** | View toggle; `S`. | Viewport ≥ spread threshold for spread (else disabled). | **None**. | None. | Toggle. Disabled state carries its reason ("spread needs ≥ 1024×768 `_px_css`"). |
| 3 | **Move text blocks between pages** | Drag (optional) **or** the non-drag move command (§4.3). | Destination page not `frozen`; destination would not overflow (hard fit); source/destination in the same plan layer. | New `cmp_rev`; `Action{kind: move, params:{block_ids, from_page, to_page}}`. | Pages losing and receiving the blocks — digital **and** print, independently (`docs/05` §2.7 "One lock"-class locality; measurement cached, `docs/03` §5.1). | **Success:** pages re-render, move announced, undo available, `act_` appended. **Failure:** refused with the *reason* — `PRINT_PAGE_OVERFLOW` on the destination, or "page `pg_9` is frozen; re-open pagination first" (`D-05`). |
| 4 | **Reorder unlocked story beats** | Drag a beat row in Content Inspector; `Alt+↑/↓` on a focused beat. | Beat has no `beat_lock`; the reorder does not place a later beat on an earlier page without an explicit `ordering_override` (`docs/04` §5.1). | **New `ms_rev`** (`beat_order` — `docs/05` §2.7 scopes beat order to `ms_rev.beat_order`) **plus** a re-derived `cmp_rev.logical.beat_order`; `Action{kind: move, params:{beat_ids}}` in composition history. | Beat-span validators for changed beats; re-solve pages holding affected beats (`docs/02` §6.2). | **Success:** order updates, page-turn suggestions referencing moved beats are re-evaluated. **Failure:** a locked beat is not draggable and its row states "beat lock: <reason>"; a contradictory order is refused with `COMP_ORDER_CONTRADICTS_BEAT_ORDER`. |
| 5 | **Split a long page** | "Split at cursor" on the canvas; `K` on a focused block; context menu on a thumbnail. | Page has ≥ 2 spans, or a single block splittable at a line offset (`break_position`, `docs/07` §4.1). | New `cmp_rev`; `Action{kind: split_page, params:{page_id, block_id, line_offset}}`. | The split page only (both plans). | **Success:** two pages; block ids unchanged (a split block keeps the original id on the first part, `docs/05` §1.3). **Failure:** "nothing to split here" when the position is at a page boundary. |
| 6 | **Merge adjacent pages** | "Merge with next/previous". | Pages adjacent **in the same plan**, kind-compatible templates, combined content fits. | New `cmp_rev`; `Action{kind: merge_pages, params:{page_ids}}`. | The merged page **and** the page that follows (its content shifts). | **Success:** one page; union of spans. **Failure:** refused with the overflow magnitude if the union does not fit; a page crossing a `print_page_lock` boundary is refused. |
| 7 | **Insert an intentional page break** | "Insert break before" on a focused block; `B`. | Block is not the first of its page; no break already at that position. | New `cmp_rev`; `Action{kind: insert_break, params:{before_block}}`; may also create an **S2 `page_break_lock`** in the *same* `Action` (§6.6 accept path; `docs/07` §E1). | Pages from the break forward. | **Success:** break marker shown on the canvas; if it is essential, it is disclosed when a viewport cannot honour it (`BREAK_UNSATISFIED`, non-blocking digital). **Failure:** none typical; an infeasible break is *disclosed*, not refused (`§6.10`). |
| 8 | **Remove a page break** | "Remove break" on a break marker. | A break exists at that position; a break inside a frozen print page requires *Re-open pagination* first (`D-05`). | New `cmp_rev`; `Action{kind: remove_break, params:{before_block}}`. | Affected pages; if the break was `essential` and in print scope, the resulting `BREAK_UNSATISFIED` is **blocking for approval** (`docs/07` §5.3). | **Success:** marker removed. **Failure:** frozen-page case is refused with the *Re-open pagination* affordance inline. |
| 9 | **Create a new page** | "Insert page" before/after. | Would not break a `print_page_lock`; would not push `print.page_count` off a multiple of 4 without front/back-matter padding (`D-16`). | New `cmp_rev` + a new `Page` (`pg_`); `Action{kind: create_page, params:{after_page_id, kind, template}}`. | Affected pages; print parity check (`print.page_count % 4`). | **Success:** new page, empty, with a kind picker focused. **Failure:** refused if it would break a `print_page_lock` or force mid-story padding (`COMP_IMPOSITION_PADDED_MIDSTORY`). |
| 10 | **Delete a page** | "Delete page". | Not `frozen`; its spans can be reassigned in the same action; the page is not the sole holder of a locked span. | New `cmp_rev`; `Action{kind: delete_page, params:{page_id, reassign_to}}`. | The deleted page's neighbours. | **Success:** the page is gone and `sum(len(spans))` still equals the block count (no `COMP_BLOCK_LOST` / `COMP_BLOCK_DUPLICATED`). **Failure:** refused while it would drop a block or orphan a lock scope. |
| 11 | **Insert an approved blank page** | "Insert blank". | A `blank_intentional.reason` is supplied **and** placement is at a front/back-matter boundary (`D-16` forbids mid-story padding). | New `cmp_rev`; `Action{kind: create_page, params:{blank_intentional:{reason}}}`. | `COMP_BLANK_UNINTENDED` if no reason; `COMP_IMPOSITION_PADDED_MIDSTORY` if mid-story. | **Success:** a page of `kind: blank` with a visible reason. **Failure:** Submit is disabled until a reason is typed; mid-story placement is refused with the `D-16` explanation. |
| 12 | **Convert a page's kind** | Kind selector (`title`/`dedication`/`story`/`reflection`/`closing`/`quotation`/`scripture`/`discussion`/`contents`/`copyright`/`back`/`blank`). | The page's current template is compatible, or a compatible template is auto-picked from `PageTemplate.kind_compatibility[]`. | New `cmp_rev`; `Action{kind: convert_page, params:{page_id, kind, template}}` — changes `kind` + `template`, **never** prose (`docs/04` §5.2). | That page; `template_mismatch_penalty` recomputed (`docs/07` §4.3). | **Success:** kind + template change, prose untouched. **Failure:** incompatible kind/template pair refused with the allowed kinds listed. |
| 13 | **Assign a layout preset** | Template picker populated from the shipped `tpl_*` set (§6.8). | `tpl_` compatible with the page kind; `border_slot` consistent (perimeter frame preserved, §6.8/§9.2). | New `cmp_rev`; `Action{kind: set_template, params:{page_id, template}}`. | That page; design validators for the template's regions. | **Success:** template applied; perimeter frame is unchanged. **Failure:** incompatible template greyed with the reason. |
| 14 | **Lock selected content placement** | Select blocks in the Content Inspector → `L` / "Lock". | A **non-empty `reason`** (rejected at creation otherwise, `docs/04` §5.3). Type inferred from the selection (`content_lock`, `beat_lock`, `keep_together_lock`, `page_break_lock`). | `Lock` written to `composition/locks.json` (`lck_`); `Action{kind: lock}`; a re-solve emits a new `cmp_rev` (`docs/07` §7 `applyLock`). | **Pages containing the locked scope only** (`docs/05` §2.7). | **Success:** lock badge appears; scope is reversible via `unlock`. **Failure:** unsatisfiable set → hard conflict card (§5.3); a `content_lock` also **refuses a rewrite proposal at creation** (`PROPOSAL_TARGETS_LOCKED_CONTENT`, `D-11`/`docs/07` §E2). |
| 15 | **Lock an entire composed print page** | "Lock print page" on a print thumbnail. | A `reason`; the page exists in the **print** plan (H2, `docs/07` §2). | `print_page_lock` (`lck_`); `Action{kind: lock}`; new `cmp_rev` from the re-solve. | Print pages (`docs/05` §2.7). | **Success:** page shown as frozen-placement. **Failure:** `COMP_LOCK_CONFLICT_HARD` with the minimal conflicting set (§5.3); it is an H2 lock so it may not be auto-dropped (`docs/07` §5.4). |
| 16 | **Preview adjacent pages** | Toggle neighbour preview; `P`. | None. | **None**. | None. | The canvas shows the selected page/spread plus its neighbours in a secondary strip, so a page-turn decision is checked against the turn. |
| 17 | **Compare compositions** | "Compare"; `C`. | ≥ 2 `cmp_rev`s exist. | **None** (read-only diff, §7.1). | None. | Side-by-side, page-aligned diff (never prose, `docs/04` §5.1). |
| 18 | **Undo / redo** | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`. | A prior / later revision exists in the history. | History is append-only: undo emits a new `cmp_rev` recording `Action{kind: restore_revision, params:{to_rev}}` (`docs/04` §5.4). | Pages that differ between the two revisions. | **Success:** the plan reverts; the action is itself undoable (redo). **Failure:** "nothing to undo" at the branch root. |
| 19 | **Restore a previous approved composition** | History panel → an `apr_`-covered `cmp_rev` → "Restore". | An `Approval` referenced that revision (approval records are never deleted, `docs/05` §2.7). | **New** `cmp_rev` whose `parent` is the *current* revision; `Action{kind: restore_revision, params:{from_rev}}`. | **Full composition scope** — the whole plan may differ. | **Success:** the restored plan is a *forward* commit with its own hash; bound scopes go `stale` (the old approval is not resurrected — `docs/04` §7.3). |

### 3.1 Notes on the inventory (gaps reported, not edited)

1. **`delete_page` is not in §6.4's bullet list.** The operation is nonetheless defined by `Action.kind` (`docs/04` §5.4) and is required for parity with `create_page` and `merge_pages`. It is specified here under that authorisation. *Reported, not silently added.*
2. **Beat reorder has no dedicated `Action.kind`.** §6.4 says "reorder unlocked story beats", but the enum has no `reorder_beat`; it is recorded as `kind: move` with `params.beat_ids`. *Reported* — either a `reorder_beats` kind should be minted in `docs/04` §5.4 or this mapping ratified.
3. **Every row 3–15 and 18–19 appends exactly one `Action`** with actor + params — asserted by `T-UXS-021`. Rows 1, 2, 16, 17 append none (view state).
4. **`freeze`** (Action kind) is the print-layer act of fixing assignments, performed from the **Print Preview** workspace (§11.2, W10) and mirrored here as a read-only indicator; it is not a §6.4 editor capability.

### 3.2 Test traceability (`docs/14` §3.16, `UXS` area)

| Ops above | Test ids |
|---|---|
| 1, 2 | `T-UXS-001`, `T-UXS-002` |
| 3, 19 (non-drag parity) | `T-UXS-003`, `T-UXS-019`, `T-UXS-020`, `T-UXS-021` |
| 4 | `T-UXS-004` |
| 5–10 | `T-UXS-005` … `T-UXS-010` |
| 11–13 | `T-UXS-010`, `T-UXS-011`, `T-UXS-012` |
| 14–15 | `T-UXS-013`, `T-UXS-014` |
| 16–17 | `T-UXS-015`, `T-UXS-016` |
| 18–19 | `T-UXS-017`, `T-UXS-018`, `T-UXS-023` |
| all | `T-UXS-022` (survive save + reload, §15.2) |

---

## 4. Accessibility and interaction parity

§6.4: *"Dragging content between pages is optional as an interaction method; accessible move commands must also be available."* Drag is therefore a **convenience layer over a complete command set** — every operation in §3 is reachable without a pointer, and no operation has a pointer-only path (`T-UXS-019`, `T-UXS-020`).

### 4.1 Keyboard map (the complete set)

The editor performs **no in-place prose editing** (`docs/03` §10), so it contains no free-text fields except the mandatory lock/blank `reason`; single-letter shortcuts are therefore safe and are bound only while focus is not in such a field.

| Key | Scope | Action |
|---|---|---|
| `Tab` / `Shift+Tab` | Global | Move focus to the next / previous interactive control within the current pane. |
| `F6` / `Shift+F6` | Global | Cycle focus to the next / previous **pane** (Navigator → Canvas → Inspectors → Assistant → Status). |
| `Esc` | Global | Cancel an in-progress move command; close a drawer/overlay, restoring focus to its opener. |
| `?` | Global | Open the shortcut help sheet. |
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` | Global | Undo / redo (rows 18, §3). |
| `←` / `→` | Navigator focused | Previous / next page in reading order (roving tabindex). |
| `↑` / `↓` | Navigator focused, spread grid | Previous / next thumbnail row. |
| `Home` / `End` | Navigator focused | First / last page of the current plan. |
| `PageUp` / `PageDown` | Global (canvas focus) | Previous / next page or spread — mirrors the reader's keyboard navigation (§7.3). |
| `S` | Global | Toggle single / spread (row 2). |
| `P` | Global | Toggle adjacent-page preview (row 16). |
| `C` | Global | Open composition compare (row 17). |
| `↑` / `↓` | Content Inspector focused | Move between block / beat rows. |
| `Space` | Content Inspector focused | Toggle selection of the focused block. |
| `Shift+Space` | Content Inspector focused | Extend the selection to the focused block. |
| `Ctrl/Cmd+A` | Content Inspector focused | Select all blocks on the current page. |
| `M` | A selection exists in Content Inspector or Canvas | Begin the **non-drag move command** (§4.3). |
| `L` | A selection exists | Open the lock dialog for the selection (row 14). |
| `Ctrl/Cmd+Shift+L` | A lock is focused | Release the focused lock (`unlock`), collecting a note. |
| `B` | A block is focused | Insert an intentional break before it (row 7). |
| `K` | A block is focused | Split the page at that block (`break_position`). |
| `Alt+↑` / `Alt+↓` | A beat row is focused | Reorder the beat earlier / later in `beat_order` (row 4). |
| `Enter` | In move mode / a dialog | Confirm the pending operation. |
| `Delete` / `Backspace` | A break marker or a page is focused | Remove break / delete page (rows 8, 10) — always behind a confirm where blocks would be reassigned. |

### 4.2 Focus model

- Each of the six panes is a **single tab stop** (`F6` cycles between them); inside a pane, `Tab` walks its controls and composite widgets (Navigator thumbnails, block list, suggestion list) use **roving tabindex** so the strip is one stop, navigated with arrows. This keeps the tab order at six panes plus in-pane controls rather than one stop per page.
- **Focus moves with the subject:** selecting a different page moves DOM focus to that page's thumbnail and updates `aria-activedescendant` on the Navigator listbox, so assistive tech tracks the selection without a focus jump.
- **After a mutation the focus returns to the mutated subject** — the moved block, the created page, the changed break — never to the top of the document (§3 "what the user sees on success").
- **Overlays are modal to the pane, not the app:** a lock dialog or conflict card traps focus until dismissed and restores focus to its opener on `Esc`/close.
- The canvas is a single focusable region (`role="region"`, an accessible name carrying `plan`, `page_id`, `kind`), not a set of focusable fragments.

### 4.3 The non-drag move workflow (row 3, parity requirement)

An explicit **four-step command** — focus, command, target, confirm — that is the accessible equivalent of the drag:

1. **Focus** a block (or a block range) in the Content Inspector; `Space` selects it.
2. **Command** — press `M` (or click **Move**). A live region announces: *"Move 2 blocks. Choose a destination page with arrow keys, then press Enter. Escape cancels."* The Canvas enters a **destination-picking** state; every legal destination page is announced with its `page_id`, `kind` and fit headroom, every illegal one with its reason (frozen / would overflow).
3. **Target** — navigate with `←/→`, or type a page number into a "Go to page" field within the command.
4. **Confirm** — `Enter` commits the `move` (new `cmp_rev` + `Action`); `Esc` cancels with no revision. Success is announced and focus lands on the moved block in its new page.

Dragging, where implemented, produces the **identical** revision and `Action` — one code path, two input methods (`T-UXS-021`).

### 4.4 Screen-reader announcements (live regions)

| Event | Region | Politeness | Message shape |
|---|---|---|---|
| Page selection / navigation | Navigator | `polite` | "Page 5 of 16, story page, 2 blocks, density balanced." (plan named: "print page 5 of 16".) |
| Revision created by an operation | Status | `polite` | "Moved 2 blocks to page 6. Composition revision `cmp_4c1b` created. Undo available." |
| **Lock changed** (create/release/edit) | Status | `assertive` | "Content lock added to blocks `blk_stone`–`blk_steps`. Reason: the reveal must not be rewritten." |
| Lock refusal | Lock dialog | `assertive` | "A lock needs a reason to be created." |
| **Hard conflict** | Status | `assertive` | The conflict card's summary line (§5.3), lock `reason`s included. |
| Suggestion appears / changes state | Assistant | `polite` | "Page-turn suggestion on page 7 accepted; break recorded and an essential break lock created." |
| Job progress (measure / suggest / validate) | Status | `polite`, throttled | "Measuring page geometry — step 3 of 6." |
| Approval went stale | Status | `polite` | "Approval is stale: the manuscript revision changed." (§7.3) |

Announcements are **deduplicated** (the same page change announced once) and throttled so rapid arrow navigation does not flood the queue — the final position is always announced.

### 4.5 Minimum target sizes and motor accessibility

- Primary pointer targets (thumbnails, buttons, lock affordances): **≥ 44 × 44 `_px_css`** (WCAG 2.5.5 level AAA target size).
- Secondary/dense controls (inline break markers, template swatches): **≥ 24 × 24 `_px_css`** with **≥ 8 `_px_css`** spacing, **only** where a keyboard equivalent exists (it always does, §4.1).
- No operation depends on a drag distance, a double-click, or a hover-only affordance; hover reveals are duplicated by focus reveals.

### 4.6 Reduced motion where the editor previews reader animation

The canvas may preview the reader's page-turn transitions (§7.2: page curl, fold, slide, fade, instant). Requirements:

- The animation is **nonessential** (§7.2): navigation and every editor operation work with animation absent or failing.
- Under `prefers-reduced-motion: reduce`, all previews default to the **instant** transition and the animation selector is present but inert-by-default; the editor **never** plays a turn animation as feedback for its own navigation (a page change is a state change, not a performance).
- The preview surface exposes the reader's own reduced-motion behaviour, so a §6.10 disclosure ("this viewport cannot reproduce the requested turn") is checked against what the reader will actually see (§7.3 "Accessible navigation").

---

## 5. Lock and conflict UX

### 5.1 Creating, editing and releasing a lock

A `Lock` is a registry entity (`docs/04` §1.2) held in `composition/locks.json`, edited in place, but **every change appends an `Action`** (`docs/04` §5.4; `docs/07` §5.4 rule 1). No automatic process may create, release, weaken or re-scope one.

| Step | Interface | Rules |
|---|---|---|
| **Create** | Selection → `L` → lock dialog. Type is inferred from the selection; `precedence` pre-filled from the type's class (`docs/07` §2); `essential` offered only for `page_break_lock`; `tolerance.lines_over` offered only for `keep_together_lock`. | The **`reason` field is mandatory** — Submit is disabled until non-empty (a lock with no reason is rejected at creation, `docs/04` §5.3). A `precedence` override is offered but requires the reason and is flagged as an **unusual state** (`docs/07` §2). |
| **Edit** | Lock chip → Edit. | Editable: `reason`, the `precedence` override, `essential`, `tolerance`. **Changing the scope is a release + create**, never an in-place mutation of what the lock already protected. |
| **Release** | Lock chip → Release, or `Ctrl/Cmd+Shift+L`. | Sets `state: released`, `released_at`; the record is **never deleted**. Collects a short note (the conflict resolver pre-fills it). `Action{kind: unlock}`. |

**Locked material renders as intentional, not as error.** Distinct semantic states, each carrying an accessible name and a reachable "why" popover exposing the `reason`:

| Class (`docs/07` §2) | Rendered state | Accessible label |
|---|---|---|
| H1 `content_lock` | The block span is marked protected; the inspector states that AI proposals targeting it are refused at creation (`D-11`). | "Content locked — wording protected." |
| H2 `print_page_lock` | The print page carries a frozen-placement indicator. | "Print page locked — placement preserved on this physical page." |
| S1–S4 soft locks | A soft, reported indicator (never the same treatment as hard). | "Beat lock (soft) — grouping preferred, may be reported as unsatisfied." |
| P `design_lock` | The token path is shown read-only **here**; the Design Studio shows it locked against automatic change (`docs/07` §2). | "Design-pinned token — automatic changes blocked, your edit allowed." |

### 5.2 Hard conflict presentation (minimal conflicting set, `docs/07` §5.2)

When the solver finds no satisfiable plan, **no plan is emitted** (`docs/07` §5.4 rule 2) and the Status panel raises a blocking card. The card reproduces the required message shape verbatim in structure — a summary line, the **smallest sufficient** set of locks (each with its mandatory `reason` and its scope), and the resolution choice:

```
Cannot compose print pages.

  lck_01J8a  print_page_lock · page 9 · "the reveal must land on a fresh page"
             assigned blocks: blk_david-stone, blk_david-steps-forward
  lck_01J8b  keep_together_lock · blocks blk_goliath-taunt .. blk_david-stone
             "the taunt and the response must be read together"
             tolerance: 2 lines over

Removing either lock makes a composition possible. Which intent do you want to keep?
  [ Release the keep-together lock ]   [ Release the print page lock ]   [ Open page 9 manually ]
```

Finding: `COMP_LOCK_CONFLICT_HARD`, `severity: critical`, `blocking: true` (`docs/07` §5.3).

### 5.3 The three resolution affordances, and what each does to revisions

| Affordance | Effect on locks | Effect on revisions | Notes |
|---|---|---|---|
| **Release the keep-together lock** | `releaseLock(rev, lck_01J8b, by, note)` → `state: released`. The other lock is untouched. | New `cmp_rev` from the re-solve; `Action{kind: unlock}`. If a path now exists, a plan is emitted; otherwise the card recomputes the *new* minimal set. | The note defaults to "resolved conflict on page 9"; nothing is released without an explicit click (`docs/07` §5.4). |
| **Release the print page lock** | `releaseLock(rev, lck_01J8a, by, note)`. | As above. | The two "Release" buttons are symmetric — **the choice of which intent to keep is the author's**, never the machine's (`docs/02` §9). |
| **Open page 9 manually** | **No lock changes.** Enters direct-placement mode for that page. | On commit, a new `cmp_rev` records the explicit per-page assignment; the result is checked by `checkLocks`, and a remaining H2 violation re-surfaces as `COMP_LOCK_CONFLICT_HARD`. `Action{kind: move}` (or `set_template`) for the block placements made. | This is the affordance to *rearrange within the locks that stay active*. It **cannot commit a page that still violates an active H2 lock** — bypassing the solver does not bypass the locks. |

The card is **not dismissible without a choice**: there is no plan behind it to show, and no "closest possible" fallback exists (`docs/07` §5.4). A user may leave the workspace; the project simply remains without a printable plan for the affected scope, and the Status badge keeps the count.

**Escalated conflict (frozen plan).** In the frozen print plan a violated soft lock is `COMP_FROZEN_LOCK_CONFLICT` / `PRINT_FROZEN_OVERFLOW` (critical, blocking): the affected page **refuses to render** and the plan is not altered. The card offers only *Re-open pagination* (`reopen_pagination`, a user action, `D-05`) or reducing the locked group — never an automatic reflow.

---

## 6. Density and page-turn assistance UX (§6.7, §6.6)

### 6.1 The four density classifications (§6.7)

Density is a function of measurement, never word count (`docs/05` §2.4; §6.7 "Do not use raw word count as the sole indicator"). The classification appears in **three** places, always from the same measured value:

| Location | Form | Note |
|---|---|---|
| Navigator thumbnail | A per-page chip on the thumbnail corner. | Lets the author see rhythm across the whole book at a glance. |
| Canvas page header | The chip, plus the `fill_ratio` and available/used `_lines`. | The number behind the chip, for the author who wants it. |
| Content Inspector page summary | The classification with its contributing factors (`line_factor`, `para_factor`, `visual_factor`, `audience_band`). | Explains *why*, so the suggestion that follows is legible. |

| Classification | Condition (`docs/05` §2.4; `resolved_density_band`) | Semantics in the UI |
|---|---|---|
| **Too sparse** | `fill_ratio < 0.35` on a page that is not `opening`/`reflective`/`reveal` | Informational; sparseness on those three kinds is **intentional** and is never chipped as a problem. |
| **Balanced** | `0.35 ≤ fill_ratio ≤ 0.78` | Neutral. |
| **Dense** | `0.78 < fill_ratio ≤ 1.0` | A hint, not a fault. |
| **Overflowing** | measured height > available height | **Not a classification but a hard fit failure** — renders as a critical `*_PAGE_OVERFLOW` finding in the Status panel, not as a density chip (`docs/05` §2.4). |

**The thresholds are the *resolved* band, not a constant.** `0.35` / `0.78` are this fixture's values; the `Condition` column is *whatever the design revision resolves to*. Every consumer reads `04` §6.1's **`resolved_density_band`** (`09` §4.3) — never the declared `layout.density_tolerance` and never the §6.7 default (`docs/05` §2.4). The `0.88` default is not this book's ceiling: under it `08` §9.4's page would read *balanced* where the resolved band reads *dense*. A revision that resolves differently moves these thresholds.

### 6.2 How each legal suggestion is offered and refused (§6.7 → `docs/05` §2.4)

Each suggestion is offered **only when it is legal**; when it is not, the affordance is present, disabled, and states the reason (so the author learns the constraint, rather than seeing a control vanish).

| §6.7 suggestion | Operation | Offered when | Refused when | Meaning-affecting? |
|---|---|---|---|---|
| Redistribute text | `move` blocks between adjacent **unlocked** pages | Target page unlocked and would not overflow | Target page frozen, or the move would overflow | No |
| Move a paragraph | `move` | As above | As above | No |
| Create a new page | `create_page` + span split | Page count parity can be kept | Would break a `print_page_lock` (`D-07`, `docs/07` §4.4) | No |
| Adjust permitted spacing | tighten/loosen **within** `DesignRevision.layout.spacing_tolerance` | The adjustment stays inside the declared band | It would push another page into overflow (`COMP_SPACING_OUT_OF_BOUNDS`) | No — the only content-neutral edit that may be automatic (§6.7, inside bounds) |
| Expand an underdeveloped beat | `Proposal` to the Content Engine (`D-11`) | The beat is not `content_lock`ed | Beat is `content_lock`ed | **Yes** — offered as a previewable proposal, applied only by the author |
| Condense unnecessary prose | `Proposal` to the Content Engine | As above | As above | **Yes** — as above |

**Editorial changes affecting meaning always require approval** (§6.7): the last two rows are `Proposal`s and are never applied by the editor. They open a proposal preview whose **Apply** action is what creates the new `ms_rev`; the density chip is not the apply button.

### 6.3 Page-turn suggestions — accept, reject, modify (§6.6)

A page-turn suggestion is a stored, stateful object on the `cmp_rev` (`docs/05` §2.5) with `state ∈ {accepted, rejected, modified}`. Each carries its ranked signal(s), its score, and an AI rationale attached **but not used for ranking** (`docs/05` §2.5; `D-04`).

| Action | What is recorded | What is created |
|---|---|---|
| **Accept** | `state: accepted` on the suggestion. | One `Action{kind: accept_suggestion}` creates an `intentional_break {before_block, essential, reason}` **and** an S2 `page_break_lock` (`docs/07` §E1). The break appears on the canvas at the turn. |
| **Reject** | `state: rejected` on the suggestion. | Nothing. The decision is retained as a recorded authorial act (§6.6 "accept, reject, or modify"). |
| **Modify** | `state: modified` with the author's change. | The author moves the break to an adjacent block boundary or toggles `essential`; the **modified** break is what is written, and the original is retained alongside it. |

**Why a rejected suggestion must not be re-offered** (`docs/05` §2.5 invariant 12): the suggestion list is a *record of authorial decisions*, not a to-do list. Re-computing suggestions on the next pass must **not** resurrect a rejected one — that is `COMP_SUGGESTION_REOFFERED` (minor, `docs/05` Part 3 #12). In UI terms: a rejected suggestion is suppressed for that `(beat boundary, block)` pair until the underlying content or the block boundary changes, and the Assistant's empty state says *"no further suggestions here"* rather than re-asking. The rule exists because a nagging assistant trains the author to ignore it, which is worse than no assistant.

**Anti-contrivance is surfaced, not hidden.** When a suggestion is *suppressed* by §6.6's anti-contrivance rules (`docs/05` §2.5: < `min_lines_on_page` on the closing page, a one-sentence page that is not `role: opening|closing`, a beat of < 2 blocks, or a `keep_together_lock`), the Assistant shows a **quiet** note — "a turn here was considered and suppressed (nothing to suspend)" — so the silence is disclosed rather than mysterious.

---

## 7. Revision, history and comparison UX (§6.4 undo/redo, restore approved; §15.2 rollback)

### 7.1 What a composition diff shows

A diff is between two `cmp_rev`s (or between the current revision and a selected historical one) and shows **three aligned layers** (`docs/05` §2.1), never prose:

| Layer | Shown as |
|---|---|
| **Logical** | Added / removed / reordered beats in `logical.beat_order`; changes to `beats_per_page`; added / removed `intentional_breaks` with their `reason` and `essential` flag. |
| **Digital** | Page-alignment column: pages added / removed / split / merged; per page, the **span delta** as `block_id` sets and `from_line`/`to_line` shifts; the `page_count_range` before vs after and the reference viewports. |
| **Print** | Page-alignment column at fixed page numbers; `kind`/`template` changes; `frozen` deltas; the `print.page_count` before vs after and the `% 4` consequence. |
| **Locks** | The set delta on `composition/locks.json`: which `lck_` were active, which are new, which were released, each with its `reason`. |

**The diff never renders prose.** A composition revision contains block identifiers and rules, never text (`docs/04` §1.2, §5.1; §12.3). To compare wording the author uses the **Story Editor** (`ms_rev` diff), which is outside this workspace. A diff view that echoed prose would be the `COMP_REVISION_CONTAINS_PROSE` defect rendered as a feature.

### 7.2 "Restore approved" versus "undo"

They are different operations with different scope and different history semantics:

| | **Undo** | **Restore a previous approved composition** |
|---|---|---|
| Input | The immediately preceding revision in the **current branch**. | Any `cmp_rev` that an `Approval` (`apr_`) referenced — possibly on another branch. |
| Recorded as | `Action{kind: restore_revision, params:{to_rev}}` — history is append-only; undo **is** a forward commit of an older revision. | `Action{kind: restore_revision, params:{from_rev}}`. |
| Reversible by | Redo (`Ctrl/Cmd+Shift+Z`). | Undo, and re-restore. |
| Approval effect | Bound scopes may go `stale` if the plan moved. | Bound scopes go `stale` because the composition revision identity changed (`docs/05` §2.7). |
| Scope | Only the pages that differ between the two revisions are revalidated. | **Full composition scope** — the plan may differ everywhere. |

A "restore approved" is a **forward commit of old material with a new hash** — the old approved revision is not resurrected, and the old `apr_` is not re-validated into `approved` (`docs/04` §7.3; `docs/02` §3.3).

### 7.3 What the UI says when an approval has gone stale (`docs/04` §7.3)

An `Approval` is never deleted and never silently returned to `approved` (`docs/05` §2.7). When a bound pointer moves, the Status panel shows a banner naming the pointer that moved, and the workspace shows **which editing surface fixes it**:

| `stale_reason` | Banner text | Action offered |
|---|---|---|
| `manuscript_revision_changed` | "The approval is stale: the **manuscript revision** changed (`ms_rev`)." | *Go to Story Editor* → re-review → re-approve (W11). |
| `beat_order_changed` | "The approval is stale: the **beat order** changed." | *Go to Blueprint* / *Re-review beats*. |
| `typography_changed` | "The approval is stale: the **design revision** changed (`dsg_rev`) and both plans re-paginated." | *Review composition* → re-approve (`D-13`). |
| `composition_revision_changed` (restore, manual edit) | "The approval is stale: the **composition** changed (`cmp_rev`)." | *Continue composing*. |
| print-freeze overflow (`D-05`) | "A frozen print page no longer holds its content. Rendering is refused." | ***Re-open pagination*** (a user action; `docs/02` T-21). |

The banner states the **consequence**, not just the condition: approval and export are refused while stale (`EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`, critical — `docs/04` §7.3), and the editor says so at the point of the stale state rather than at the export button.

---

## 8. The two-page-count problem in the UI (`D-06`)

`digital_pages` (a **range** plus the reference viewports it was measured at) and `print_pages` (a **single integer**, a multiple of 4 in booklet form) are distinct fields that must never be conflated (`D-06`; §3.3 "Do not equate reading-page count with printable-page count"; §6.10).

**Wording rule: the unqualified word "pages" appears nowhere in this workspace.** Every count is prefixed, and the two are always shown together, never summed or averaged.

| Where | Exactly what is displayed |
|---|---|
| Editor header **counts strip** (always visible, both plans, any breakpoint) | `digital 9–18 pages (360×640 → 1440×900 _px_css_) · print 16 pages` — the `D-06` canonical example (`docs/17` D-06). |
| **Plan switcher** labels | "Digital plan — 9–18 pages" · "Print plan — 16 pages". The tab the author is editing names its own count. |
| **Page Navigator** group header | The current plan's count only, labelled: "Digital plan · 18 pages at 360×640 `_px_css`" or "Print plan · 16 pages · 4 sheets". |
| **Status panel** | Both, as a labelled row, so a validation state is never read against the wrong count. |
| **Compare and History** headers | The two counts of each revision being compared, labelled, side by side. |
| **Export / confirm dialogs** (surfaced from here) | Both counts plus which artifact uses which: the HTML book and reading PDF follow `digital`/reading order; the booklet PDF follows `print`. |

Additional rules:
- The **range never collapses**: even when measurement happens to yield a single value it is shown as `14–14` → no, shown as `digital 14 pages` **only** with its viewport named, so the reader of the number knows it is viewport-derived (§7.4).
- **A range is `${min}–${max}` over the reference viewport set, and its endpoints are viewport-determined, not positional.** In `digital 9–18 pages` the **maximum** is the narrowest reference viewport (`360×640 _px_css_`, single page — the `18` in the Page Navigator label above) and the **minimum** the widest spread (`1440×900`). The parenthetical `(360×640 → 1440×900)` names the viewport span the range covers, in width order; it does **not** assert that the left endpoint belongs to the left viewport. The canonical `D-06` example is this one, **`9–18`** (`docs/17` D-06; `04` §5.1's `measured_at[]` gives `360×640 → 18` and `1440×900 → 9 (spread)`, and `08` §3.8 states the same). The `14–18` figure that appeared here earlier was wrong and is superseded.
- Changing the **viewport** or **typography** moves the digital count and the editor says so at the moment of change ("digital pages now 13–19; print pages unchanged at 16"), which is the `D-06` disclosure duty in §6.10 made concrete.
- A count is **never** used as a progress indicator: the page target **governs** the length (`target_print_pages`, `D-16` as amended) and the word budget is **derived** from it at blueprint time from words-per-page measured on the concrete design revision (`05` §1.6). A count may be a *target*; it is never a meter. A printed page count that misses the target is a reported finding (`PRINT_PAGE_COUNT_OFF_TARGET`), not something to pad toward.

---

## 9. States and errors

All long work is a checkpointed `job_` (`D-17`; `docs/03` §8): the UI is **job-driven** and subscribes to progress; no request blocks for the length of a render. Errors are **findings**, not exceptions (`00-README` §4.5; `docs/07` §5.4).

| State | Entered when | What the editor shows | What it blocks |
|---|---|---|---|
| **Loading / measuring** | Any operation whose geometry must be measured (move, split, merge, new page, density, break feasibility) queues a measure/solve `job_` (`docs/03` §5.1, §8). | The affected pages go to a **provisional** state: the change is applied to the logical layer and shown as a pending overlay with a job progress line ("measuring 2 of 5 pages"); the canvas shows block-granular pending positions. | Nothing is blocked, but the *result* is not asserted until the job's checkpoint lands; the revision is written only when the solve succeeds. **Cost note:** re-running on unchanged inputs returns the identical hash for free (`docs/05` §2.3). |
| **Empty project** | No `cmp_rev` exists; `stage ∈ {project_setup, ideation, blueprint, drafting, review}` (`docs/02` §3.1). | The workspace opens in a single empty state naming the missing prerequisite and the action that produces it: "Composition runs after a manuscript draft is reviewed" (§6.2) — with the prerequisite's workspace linked. | Every §6.4 operation except pane navigation. The Navigator is not a fake strip of blank pages. |
| **Stale approval** | A bound pointer moved (`apr_.state = stale`, `docs/04` §7.3). | The banner of §7.3, naming the pointer. | Approval and export of the bound scopes; **not** editing (`docs/02` §3.4 "the block forbids publishing, not working"). |
| **Blocked render** | A blocking critical finding — `COMP_LOCK_CONFLICT_HARD`, `COMP_FROZEN_LOCK_CONFLICT`, `PRINT_FROZEN_OVERFLOW`, `COMP_BLOCK_UNRESOLVED`, `PROJECT_POINTER_DANGLING` (`docs/02` §3.4). | The conflict card (§5.2) or a critical finding card; the header badge shows the blocking count. | Forward publication: approval, export, archiving (`docs/02` §3.4). Editing continues. |
| **No print plan** | The print layer has not been produced/frozen (before W10), or `stage = digital_preview`. | The Print plan tab exists, is selectable, and states "no print plan yet — produce a print proof" (W10). Print-scope locks and the print count are shown as unavailable, not as zero. | Print-scope operations (print page lock as a frozen plan, print parity, booklet export) — not the digital composition. |
| **No validation for the current triple** | No `val_rev` whose `judged{}` equals the current `(ms_rev, cmp_rev, dsg_rev)` (`docs/04` §7.2). | Status panel: "Not yet validated for the current revisions" + **Validate** (Engine F, a job). | The Status panel presents *no* findings rather than findings judged on other revisions; approval is not offered. |
| **Suggestion analysis not run / stale** | No `page_turn_suggestions[]` for the current triple, or the analysis job has not completed. | Assistant empty/stale state + **Run analysis** (`D-17` job). | Nothing; the pane simply shows no advice (§2.1). |
| **Job failed / abandoned** | A job step exhausted its bounded retries (`docs/03` §8; `docs/17` D-17). | The job panel: failing step, provider id, attempt *n*/*N*, a **Resume** action, and — crucially — **no revision was committed** (applies are atomic per revision, `docs/02` §7). | The interrupted operation only; the pre-crash revision stands. A failed render yields **no** partial artifact that looks complete (`docs/03` §10). |

---

## 10. What the editor deliberately does not do

| Not done here | Where it belongs | Authorised by |
|---|---|---|
| **Edit prose.** The editor never mutates text in place; a wording change is a `Proposal` applied to a revision, and the only prose-adjacent act here is **targeting** a proposal (density "expand/condense", a selection scope). | Story Editor (§11.2, W4/W5); `D-11` | `docs/03` §10 ("No editor that mutates prose in place"); §12.3; `D-10` |
| **Edit design tokens** (font family/size, border thickness/offset/colour, safe area, gutter, binding allowance, line height). | Design Studio (§11.2, W8) | `docs/04` §6.1; §8.1; `docs/02` W8 |
| **Edit page geometry.** The `text_box_mm`, `text_box_ratio`, border geometry and margins are properties of the design revision; the editor consumes them. The only geometry-adjacent act permitted is a **spacing adjustment inside the declared tolerance band** (§6.7). | Design Studio | `docs/04` §6.1; §9.1–9.2; `docs/05` §2.4 ("Adjust permitted spacing" is the only content-neutral automatic edit) |
| **Resolve a hard conflict automatically**, drop or re-scope a lock, or fall back to a "closest possible" plan. | — (never) | §6.9; `docs/07` §5.4; `docs/02` §9 |
| **Reflow a frozen print page.** | — ; requires *Re-open pagination*, a user action | `D-05` |
| **Create an approval.** | Publication Center (§11.2, W11) — user only | §11.3; `D-11`; `docs/02` §3.6 |
| **Change content to change meaning** (expand/condense/rewrite) without approval. | Story Editor (proposal) | §6.7; `docs/02` §4.2 |
| **Introduce contrived cliffhangers** to manufacture page turns. | — | §6.6; `docs/05` §2.5 anti-contrivance rules |
| **Pad mid-story to reach a page count.** | — | `D-16` |
| **Show the two page counts as one number**, or use a page count as a target. | — | `D-06`; `D-16`; §3.3 |
| **Render prose in a composition diff.** | Story Editor (`ms_rev` diff) | `docs/04` §1.2, §5.1; §12.3 |

---

## 11. Finding codes referenced (registry-owner note)

Codes used above — `COMP_LOCK_CONFLICT_HARD`, `COMP_FROZEN_LOCK_CONFLICT`, `LOCK_UNSATISFIED`, `BREAK_UNSATISFIED`, `COMP_ORDER_CONTRADICTS_BEAT_ORDER`, `COMP_BLOCK_LOST`, `COMP_BLOCK_DUPLICATED`, `COMP_BLOCK_UNRESOLVED`, `COMP_BLANK_UNINTENDED`, `COMP_IMPOSITION_PADDED_MIDSTORY`, `COMP_SPACING_OUT_OF_BOUNDS`, `COMP_SUGGESTION_REOFFERED`, `COMP_REVISION_CONTAINS_PROSE`, `PROPOSAL_TARGETS_LOCKED_CONTENT`, `PRINT_FROZEN_OVERFLOW`, `PRINT_PAGE_OVERFLOW`, `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`, `PROJECT_POINTER_DANGLING` — are **owned by `11-validation-strategy.md`** (`00-README` §3.2) and must be registered there before use. This document cites them; it does not mint any. Codes that a validator family does not yet define are reported in §3.1 rather than invented.
