# Approval and Versioning Workflow
**Implements:** spec §6.11 (composition approval), §12.2 (structured project data), §12.5 (efficient processing), §15.5 (operational quality), §14 (demonstrations 17–18), §1.2, §1.3, §3.1 (mode 9), §9.3, §9.4, §18
**Deliverable covered:** D14 (per §16)
**Inherits:** `docs/00-README.md`, `docs/03-technical-architecture.md`, `docs/04-project-data-schema.md`, `docs/05-content-and-composition-model.md`, `docs/07-lock-and-constraint-rules.md`, `docs/14-test-plan.md`, `docs/17-decisions-and-open-questions.md`

This document is the authority for what "approved" means, how an approval record lives and dies, what a freeze forbids, what a change invalidates, how revisions and editions are named, what an artifact manifest must contain for §15.5's "reproducible", what an archive holds, how §14's demonstration 18 is recorded, and what a reviewer can reconstruct from the project directory alone.

It owns: the export predicate (§1), the `Approval` lifecycle (§2), freeze semantics (§3), the invalidation matrix (§4), the versioning/edition model (§5), the artifact manifest (§6), archives (§7), the manual-proof record (§8), the audit surface (§9), and the anti-patterns (§10). Additions and contradictions are reported in §11, not edited into other documents.

---

## 1. What "approved" means

### 1.1 The predicate

"Approved" is not a flag; it is a **decidable predicate over the project directory**. It is evaluated at export time (W12, `02` §2.2), re-derived from the pointer documents and the live environment, and never read from a cached boolean.

Terms:
- `p` = the `Project` document (`04` §3). `p.pointers` = `{manuscript_revision, composition_revision, design_revision, validation_report, approvals[]}`.
- `env(engine)` = the environment the running engine actually has, re-read at the instant of evaluation. Its **shape is owned by §6.1** (`environment{}`), which is the single owner of the environment/manifest field list (`17` D-14): `{engine_version, chromium, chromium_playwright_revision, node_version, fonts_hash, theme_token_hash, imposition_spec_version, hyphenation_dictionary_hash, pdf_assembly_lib{name, version}}` (D-01, D-04, D-09, D-14). `04` §7.3's `Approval.environment` records **the same set, field-for-field**; until it does, this conjunct compares two differently shaped objects (§11.6).
- `flags(c)` = the two blocking flags of code `c`'s registry row (`11` §2, the `blk` column): `flags(c).A` (blocks approval) and `flags(c).E` (blocks export). Registry data, **not** a persisted field of a `Finding`.
- `waived_by(a, f)` = `11` §1.4 W4's relation: `∃ w ∈ a.waivers : w.finding_id = f.id ∨ (w.code = f.code ∧ w.scope covers f)` (W5). The single `Waiver` shape is defined once in `11` §1.4 and is referenced here, never re-spelled.
- `report(v)` = the `ValidationReport` at hash `v`; `report.findings[]` carries `code`, `severity`, `blocking` (`04` §7.2).
- `locks[l]` = the `Lock` registry record (`04` §5.3).
- `K` = the requested artifact `kind` (`04` §7.4).
- `MS/BO/PT/DC/PC/DS/PV` = the seven §6.11 scopes, spelled `manuscript`, `beat_order`, `page_turns`, `digital_composition`, `print_composition`, `design`, `previews`.

```
GOVERNING(a) :=
      a ∈ p.pointers.approvals
  ∧   a.state = "approved"                        // 04 §7.3 — never derived, never cached
  ∧   a.revoked = null                            // §2.7 (annotation field, see §11)
  ∧   a.superseded_by = null                      // §2.6

SOUND(a) :=                                        // a's claims are still true of the project
      a.revisions.ms_rev  = p.pointers.manuscript_revision
  ∧   a.revisions.cmp_rev = p.pointers.composition_revision
  ∧   a.revisions.dsg_rev = p.pointers.design_revision
  ∧   a.revisions.val_rev = p.pointers.validation_report
  ∧   a.environment       = env(engine)            // §6.1's environment{} field-for-field (D-14)
  ∧   ∀ l ∈ a.frozen.content_lock_ids : locks[l].state = "active"    // §3.2
  ∧   ¬∃ f ∈ report(p.pointers.validation_report).findings :
            effective_blocking_approval(f, a)      // B3 · B6 — under a's OWN waivers[], never on the
                                                   // finding alone: a waived `A` finding is not a blocker

REQUIRED_SCOPES(K) :=                              // §1.4
      K ∈ {reading_pdf, booklet_pdf}      → {MS, BO, PT, PC, DS, PV}
      K = html_storybook                  → {MS, BO, PT, DC, DS, PV}
      K = print_guide                     → {PC}
      K ∈ {proof_sheet, page_png}         → {PC, DS}
      K = manifest                        → REQUIRED_SCOPES(the artifact it accompanies)

GOVERNING_APPROVAL(p, K) :=
      the a ∈ p.pointers.approvals with GOVERNING(a) ∧ SOUND(a) ∧ REQUIRED_SCOPES(K) ⊆ a.scope
      that is maximal by (|a.scope|, a.at)         // deterministic tie-break; if none exists: ⊥

BLOCKING_APPROVAL(f) := f.severity = "critical" ∨ (f.severity = "major" ∧ flags(f.code).A)   // 11 §1.3 B2-B3
BLOCKING_EXPORT(f)   := f.severity = "critical" ∨ (f.severity = "major" ∧ flags(f.code).E)   // 11 §1.3 B2-B4
                       // a `critical` also blocks render, so every render block is already an export block
                       // (11 §1.3 B2); hence  f.blocking = BLOCKING_APPROVAL(f) ∨ BLOCKING_EXPORT(f)

effective_blocking_approval(f, a) := BLOCKING_APPROVAL(f) ∧ ¬waived_by(a, f)    // the approval gate, B6
effective_blocking_export(f, a)   := BLOCKING_EXPORT(f)   ∧ ¬waived_by(a, f)    // the export gate, B6
effective_blocking(f, a)          := f.blocking           ∧ ¬waived_by(a, f)    // 04 §7.2's single boolean

a* := GOVERNING_APPROVAL(p, K)

EXPORTABLE(p, K) :=
      a* ≠ ⊥                                       // one covering approval; SOUND(a*) already asserts
                                                   // ¬∃ f : effective_blocking_approval(f, a*)
  ∧   ¬∃ f ∈ report(p.pointers.validation_report).findings :
            effective_blocking_export(f, a*)       // the E gate proper: `major · E` codes and every critical
```

**The predicate takes the `Approval` as an argument.** `effective_blocking_approval`, `effective_blocking_export` and `effective_blocking` all take `a` — the approval under test — because a waiver is a relation to an approval (`11` §1.4 W4), not a property of a finding. It cannot be evaluated without one. There is no `Finding.waived` property and no `Finding.blocking.approval`; the two sub-flags come from `11` §1.3's `deriveBlocking`, and `04` §7.2's `Finding.blocking` is their disjunction.

**What blocks what (`11` §1.3 rules B2–B7, stated identically here and in `11` §1.3).** A finding blocks **approval** iff it is flagged `A` and not waived under the approval being tested, or it is `critical` (**never** waivable). A finding blocks **export** iff it is flagged `E` and not waived under that approval, or it is `critical`. A flagged-but-waived finding blocks nothing. An unflagged finding blocks nothing. All four flag combinations therefore have a defined effect on each gate (`11` §1.3's truth table).

Three properties of this predicate are load-bearing and each is a stated requirement:

1. **It is recomputed, never remembered.** `a.state` is one conjunct among seven; an approval whose state file says `approved` but whose `revisions` no longer equal the pointers is not governing. This is the mechanism behind `04` §7.3 ("an artifact may only cite an `Approval` with `state: approved` **and** revisions equal to the current pointers **and** `environment` equal to the engine's actual environment") and §15.5 ("Exported files match the approved revision").
2. **It quantifies over a *single* covering approval.** `04` §7.4 gives `Artifact.approval_id` as a scalar, so the export must be covered by one approval whose scope contains `REQUIRED_SCOPES(K)`. Partial approvals are legal records (§2.3) but must be consolidated by supersession before an export (§2.6).
3. **A waiver lifts a flag; it never rewrites the finding.** Only a `major` whose §2 row carries a block flag (`A` and/or `E`) is waivable, and only with a recorded, non-empty reason (`11` §1.4 W1–W2). A `critical` is **never** waivable — §10.5 states it directly: "A publication cannot receive a final approved status while unresolved critical rendering problems remain." A `major` with no flag has nothing to lift and is `waivable: false`. A waiver never clears the finding and never changes `f.blocking` (W3); it is read only through `waived_by(a, f)`, i.e. through `effective_blocking_*(f, a)` (B6).

   The earlier wording here — "Waivers cover non-blocking findings only. A blocking finding is never waivable." — was **false** and is deleted. It contradicted `11` §1.4 case 1 and it is what dragged unflagged `major`s into the export gate (§1.1 conjunct 3, also deleted): `PRINT_GUTTER_INSUFFICIENT`, `PRINT_PAGE_COUNT_OFF_TARGET` and `SCRIPTURE_CHRONOLOGY_REORDERED` are blocking-for-approval **and** waivable, which is the whole point of §6.9's "identify the conflict rather than silently overriding".

### 1.2 The refusal

When `EXPORTABLE(p, K)` is false, the export is refused with the single critical code already named by `04` §7.3:

| Field | Value |
|---|---|
| `code` | **`EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`** |
| `family` | `ops` |
| `severity` | `critical` |
| `blocking` | `true` (a critical is always blocking, `04` §7.2) |
| `correction` | never automatic; `11` §`10.5` ladder steps 6–8 only |

The code is one; the failed conjunct is disambiguated by a machine-readable `refusal.reason` (closed set, deterministic ordering — first match wins):

```
reason ∈ {
  "no_approval",                              // GOVERNING_APPROVAL = ⊥
  "state_stale",
  "state_revoked",
  "superseded",
  "revision_mismatch:ms" | ":cmp" | ":dsg" | ":val",
  "environment_mismatch:engine_version" | ":chromium" | ":fonts_hash"
      | ":theme_token_hash" | ":imposition_spec_version",
  "frozen_lock_released:lck_…",
  "validation_blocking_findings:find_…",
  "scope_not_covered:design",
  "unwaived_major_finding:CODE"
}
```

Which finding conjunct failed is named by `reason`: `unwaived_major_finding:CODE` is the approval gate (`a* = ⊥`, because an un-waived `A` finding falsifies `SOUND`), and `validation_blocking_findings:find_…` is the export gate (`a* ≠ ⊥` but an un-waived `E` finding or a `critical` remains). The two are different gates on the same predicate (`11` §1.3 B3–B6) and are never conflated.

No second code is introduced for the environment or validation conjuncts: `04` §7.3 folds all three into this one critical, and `14` §3.13 `T-OPS-014`/`T-OPS-015` assert exactly that. A refusal emits **nothing** — no partial file, no "closest possible" artifact (`03` §10, `07` §5.4 rule 2).

The *act* of approving has its own preconditions and its own refusals (§2.2), which are distinct from the export refusal.

### 1.3 What is deliberately not in the predicate

| Not a conjunct | Why |
|---|---|
| `manual_proof` present | §14 demo 18 is not machine-verifiable and is excluded from the automated gate (`17` Part C; §8) |
| `p.stage = "approved"` | `stage` is a fast-UI cache whose validator recomputes it (`04` §3 invariant); the predicate must not trust it |
| `cmp_rev.approval_state = "approved"` | a mirror field (`04` §5.1); the mirror may lag; the predicate reads the `Approval` records |
| A "page count" | two counts exist and are never conflated (`D-06`) |

### 1.4 Why `REQUIRED_SCOPES` is what it is

| Scope in the set | Basis |
|---|---|
| `manuscript`, `design` (all three deliverables) | §1.2 "All three outputs must derive from one approved manuscript and a shared design specification"; §6.11 "Approved composition settings should be associated with a specific manuscript and design revision" |
| `beat_order`, `page_turns` | §15.2 "Explicit page breaks are preserved when feasible", "Page-turn decisions remain narratively coherent" — both are §6.11 approval scopes |
| `digital_composition` for `html_storybook`; `print_composition` for the PDFs | medium-specific; §6.10 makes the two plans legally different (`D-06`) |
| `previews` for every deliverable | §6.11 "The final rendered previews"; bound to `val_rev` + artifacts, and the only scope invalidated by a browser/engine change (`05` §2.7) |

---

## 2. The approval record lifecycle

### 2.1 State diagram

```
                      ┌───────────────────────────────────────────────┐
                      │  no Approval exists for this revision triple   │
                      └───────────────────────┬───────────────────────┘
                                              │ approve(scope[])                       T-17
                                              │ §3.6: USER ONLY, never autonomous      02 §3.6
                                              ▼
   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │  GOVERNING     state = "approved" · revoked = null · superseded_by = null         │
   │                exportable ⇔ EXPORTABLE(p, K)  (§1.1)                              │
   └──┬────────────────────────────┬─────────────────────────────┬────────────────────┘
      │ pointer_move(class)        │ revoke(reason)              │ approve(scope')        T-17
      │ or env(engine) drift       │ (USER)                      │ scope' ⊇ scope,        USER
      │ AUTO  (§2.5)               │                             │ same triple (§2.6)     (same T-17)
      ▼                            ▼                             ▼
  ┌──────────┐               ┌──────────────┐             ┌──────────────────┐
  │  STALE   │               │  REVOKED     │             │  SUPERSEDED      │
  │ state =  │               │ state =      │             │ state =          │
  │ "stale"  │               │ "stale"      │             │ "approved"       │
  │ stale_   │               │ revoked ≠    │             │ superseded_by =  │
  │ reason   │               │ null         │             │ apr_…            │
  └────┬─────┘               └──────────────┘             └──────────────────┘
       │
       │ revalidate(scope, §4) then approve(new scope[])        T-17, USER ONLY
       ▼
  (a NEW apr_ is created. The stale apr_ is NEVER edited, revived, or deleted — 05 §2.7, 02 §3.3.)
```

**Persisted vs derived.** `Approval.state` keeps the binding two-value enum of `04` §7.3 (`approved | stale`); `revoked` and `superseded_by` are annotation fields (§11). The four-value lifecycle label above is derived, not stored:

```
lifecycle(a) := a.revoked ≠ null       → "revoked"       (state must be "stale")
              | a.superseded_by ≠ null → "superseded"
              | a.state = "stale"      → "stale"
              | otherwise              → "governing"
```

This keeps `04` §7.3's schema and `02` §3.3's two-state machine intact while giving revocation and supersession a representation that is decidable and auditable.

### 2.2 Creation, and the preconditions on the act

Approval is transition **T-17** (`approval_ready` → `approved`), **user-initiated only** (`02` §3.2, §3.6). No `auto` transition, and no autonomous mode, may create, restore or amend an `Approval` (§11.3; `17` Part C; `02` §4.2).

The act is refused (and no `apr_` is written) when either holds:

| Refusal precondition | Code | Basis |
|---|---|---|
| A blocking finding is unresolved in the publication-scope report | `OPS_APPROVAL_BLOCKED_BY_CRITICAL` (new, §11) | §10.5 final sentence; `14` `T-QAS-009` |
| An `A`-flagged finding in the judged `val_rev` is un-waived under the record being written (`effective_blocking_approval(f, a)` true, §1.1) — an `E`-only `major` blocks export, not the act | `OPS_APPROVAL_UNWAIVED_MAJOR` (new, §11) | §6.9 "identify the conflict rather than silently overriding"; §15.1 "Approved text is not silently altered" |

On success the record is written with all of: `id` (`apr_` ULID), `at`, `by`, `scope[]`, `revisions{ms_rev, cmp_rev, dsg_rev, val_rev}`, `environment{…}` (`env(engine)` at the instant of approval), `frozen{print_pages[], content_lock_ids[]}`, `state: "approved"`, `stale_reason: null`, `revoked: null`, `superseded_by: null`, `waivers: []`, `manual_proof: null`.

### 2.3 Scope selection — the seven §6.11 scopes

Each scope is bound to a specific revision or field, so "which scope" is not a labelling choice but a pointer identity (`05` §2.7):

| §6.11 scope | `scope[]` value | Bound to | Invalidated by |
|---|---|---|---|
| Complete manuscript | `manuscript` | `ms_rev` | any new `ms_rev` |
| Story beat order | `beat_order` | `ms_rev.beat_order` | reordering beats |
| Preferred page-turn locations | `page_turns` | `cmp_rev.logical.intentional_breaks` | adding/removing a break |
| Digital reading composition | `digital_composition` | `cmp_rev.digital` + the reference viewport set | typography or viewport-set change |
| Fixed print composition | `print_composition` | `cmp_rev.print` (frozen) | **`Re-open pagination` only** (`05` §2.7) |
| Visual design | `design` | `dsg_rev` | any token change; may invalidate print pagination (`D-13`) |
| Final rendered previews | `previews` | `val_rev` + artifacts | any of the above, plus browser/engine change |

### 2.4 Partial approvals are legal; split-coverage exports are not

**Decision: a partial approval is a legal record. A publication may not be exported on split scope coverage.**

| | Rule | Justification |
|---|---|---|
| Legal | `scope[]` may be any non-empty subset of the seven. §6.11 says "Allow the user to approve: …" — each bullet is an available object of approval, not a bundle. | §6.11 |
| Consequence | Approving the manuscript but not the design leaves a governing `manuscript`-only approval; the project is not exportable (`REQUIRED_SCOPES` unmet). | §1.2 "All three outputs must derive from one approved manuscript **and a shared design specification**" |
| Not legal | Exporting under two or more partial approvals whose scopes *jointly* cover `REQUIRED_SCOPES(K)`. | `04` §7.4 gives `Artifact.approval_id` as a scalar; a split-coverage artifact would need a schema change, and "this publication was approved by this decision" must name one decision |
| Resolution | Consolidate by **supersession** (§2.6): approve a successor whose `scope' ⊇ ⋃ scopes` on the same triple. The successor is the one cover. | §6.11; `04` §7.3 |

The practical flow: approve the manuscript early (it stabilises first), approve the design when it stabilises, and approve print composition + previews last — at which point the successor's scope is the union and the earlier records are superseded, not deleted.

### 2.5 Staleness, with a named cause

**Staleness is event-based and value-checked — both, deliberately.**

```
on pointer_move(class, from, to) where from ≠ to :          // §2.5.2
      ∀ a ∈ p.pointers.approvals :
            a.state        := "stale"
            a.stale_reason := stale_reason_for(class)

on env_drift(component, from, to) where from ≠ to :          // §6.5
      ∀ a ∈ p.pointers.approvals : a.state := "stale"
                                   a.stale_reason := "environment_changed"
```

`stale_reason` is drawn from a **closed set, and this table is its single owner** — the enum is defined here and nowhere else. `04` §7.3 must list exactly these eleven values: its per-component spellings `engine_changed`, `chromium_changed`, `fonts_changed`, `pdf_assembly_lib_changed` and `imposition_spec_changed` collapse into `environment_changed`, because a `stale_reason` names *which pointer or environment component moved*, and the component-level detail belongs to the refusal reason `environment_mismatch:<component>` (§1.2), which is a different closed set. It names **which pointer moved** (`05` §2.7: "set to `stale` with a `stale_reason` naming which pointer moved") plus the named geometric causes of `02` §6:

| `stale_reason` | Set by |
|---|---|
| `manuscript_revision_changed` | `ms_rev` pointer move |
| `beat_order_changed` | a beat reorder / blueprint `progression[]` change |
| `composition_revision_changed` | `cmp_rev` pointer move (template assignment, lock effect, front/back matter re-materialisation) |
| `design_revision_changed` | `dsg_rev` pointer move (non-typographic token) |
| `typography_changed` | a `dsg_rev` move that changed geometry (size, line height, font metrics, viewport set) |
| `hyphenation_changed` | `dsg_rev.hyphenation` / `dsg_rev.lang` move (`D-04`) |
| `validation_report_changed` | `val_rev` pointer move |
| `content_lock_released` | a lock in `a.frozen.content_lock_ids` was released (§3.2) |
| `print_reopened` | `Re-open pagination` (§3.3) |
| `environment_changed` | `env(engine) ≠ a.environment` for any component (`D-14`) |
| `revoked_by_user` | §2.7 |

**The `apr_` is never deleted and never silently re-validated into `approved`** (`05` §2.7; `04` §7.3). A stale record is immutable history; re-approval creates a new `apr_`.

#### 2.5.1 No-op changes produce no revision and no staleness

Because revisions are content-addressed (`D-10`), a "change" that does not alter the canonical content hash **is not a change**: no revision is written, no pointer moves, no `Action` is appended as a revision-producing event, and no approval goes stale. Examples: applying a lock whose effect does not alter the solve output; a whitespace-only manuscript edit below `text_hash` normalisation (NFC + collapsed whitespace + trimmed, `04` §4.2); a `dsg_rev` edit that lands the token back on its prior value. `02` §6.1 states the manuscript case: "If the edit does not change the block's occupied lines, the plan is byte-identical and the `cmp_rev` hash does not move — no invalidation at all."

#### 2.5.2 Why staleness is event-based and not only value-based

A value-only check (`a.revisions = pointers`) would allow an anti-pattern: **rollback to a previously approved triple would resurrect the old approval**, because the values would again be equal. `15.2` requires composition history rollback ("Composition history supports rollback") and `04` §5.4 makes `restore_revision` a pointer move to an existing hash. Therefore staleness is triggered by the *move event*, so a rollback stales every approval in the chain even if the destination hash was once approved. The value check (`SOUND`) is retained as the second conjunct because it catches a hand-forged or migrated record. Neither check alone is sufficient; both are required.

### 2.6 Supersession

**Supersession is recorded at the moment a successor is created** — a user action (T-17), not a background process, so it never violates `02` §3.6's "no `auto` transition may alter an approval".

```
approve(scope')  where  scope' ⊇ scope(a₁)  ∧  revisions' = revisions(a₁)   // same triple
   ├─ write apr_new
   └─ for each a with same triple and scope(a) ⊆ scope' : a.superseded_by := apr_new.id
```

| Rule | Value |
|---|---|
| Supersession domain | only approvals on the **same** revision triple and the **same** environment. An approval on a different triple is already `stale`; supersession adds nothing and would be misleading. |
| Effect | the superseded record keeps `state: "approved"` (it *was* a genuine approval) but is non-governing ⇒ `EXPORTABLE` ignores it (`GOVERNING` requires `superseded_by = null`) |
| Chain | `superseded_by` edges form a chain per `(triple, environment)`; the last element is the cover for the union of all scopes approved on that triple |
| Never deleted | a superseded record remains readable history, and its `frozen`/`manual_proof` remain attached to *its* triple |

### 2.7 Amendment and revocation

**Amendment** — there is no in-place edit of an `apr_` (anti-pattern 3, §10). An amendment is: create a successor by T-17 (§2.6), which supersedes the predecessor. Any "correction" to a wrong approval (wrong scope, a decision reversed) is a new record plus a supersession edge, and the wrong record is also **revoked** if it must be withdrawn rather than merely superseded.

**Revocation** — a user action that withdraws an approval outright, for the case where it is not superseded by anything:

```
revoke(apr, reason)  — USER ONLY
   apr.revoked      := { at, by: <name>, reason: <non-empty> }
   apr.state        := "stale"                    // keeps the 04 §7.3 enum
   apr.stale_reason := "revoked_by_user"
```

| Property | Value |
|---|---|
| Who may revoke | the author, by name; never `auto`, never `autonomous` |
| Reason | mandatory and non-empty — mirroring the `Lock.reason` rule (`04` §5.3: "A lock with no reason is rejected at creation"), because an approval decision must be intentional for the same reason a composition decision is |
| A revoked approval is never revived | even if its triple is re-entered. Recovery is a new approval after revalidation. |
| Revocation ≠ staleness | staleness is "the world moved"; revocation is "the author changed their mind". Both are non-governing; only the reason differs. |

### 2.8 Transition table

| # | From → To | Trigger | Initiator | Writes | Rule |
|---|---|---|---|---|---|
| A-01 | *(none)* → `governing` | approve(scope) on `approval_ready` | **user only** | new `apr_`; `frozen{}` populated (§3) | T-17; §3.6 |
| A-02 | `governing` → `stale` | pointer move (any of `ms/cmp/dsg/val`) | `auto` | `state`, `stale_reason` | `05` §2.7; `02` T-19 |
| A-03 | `governing` → `stale` | `env(engine)` drift (engine/Chromium/fonts/imposition) | `auto` | `state = stale`, `stale_reason = environment_changed` | `D-14`; `04` §7.3 |
| A-04 | `governing` → `stale` | a frozen content lock released | `user` (the release) | `state`, `stale_reason = content_lock_released` | §3.2, `07` §5.4 |
| A-05 | `governing` → `stale` | a frozen print page would overflow after a change | `auto` | `state`, `stale_reason = print_reopened` **or** `composition_revision_changed`; `stage := composition_stale` | `D-05`; `02` T-20 |
| A-06 | `governing` → `superseded` | a successor with `scope' ⊇ scope` on the same triple | `user` (T-17) | `superseded_by` | §2.6 |
| A-07 | `governing` → `revoked` (`stale`) | `revoke(reason)` | **user only** | `revoked{}`, `state`, `stale_reason` | §2.7 |
| A-08 | `stale` → *(new)* `governing` | revalidate (scoped, §4) then approve(new scope) | **user only** | **new** `apr_`; the old stays `stale` forever | `05` §2.7; `02` §3.3 |
| A-09 | `superseded` → *(anything)* | — | — | — | terminal; a superseded record never changes again |
| A-10 | `revoked` → *(anything)* | — | — | — | terminal |
| A-11 | `stale` → `stale` (reason refined) | a second pointer moves before re-approval | `auto` | `stale_reason` | the **earliest** invalidated stage governs (`02` §3.2 T-19 rule) |

No transition writes an `Approval` except A-01 and A-08, both `user` only.

---

## 3. Freeze semantics (`D-05`)

### 3.1 What is frozen

| Frozen thing | Recorded in | Value |
|---|---|---|
| Print page assignments | `Approval.frozen.print_pages[]` **and** `cmp_rev.print.pages[].frozen = true` | the set of `pg_`-bearing print page ordinals frozen at approval (fixture: story pages `5…13` — front matter `1–4`, story `5–13`, back matter `14–16`, M = 16 with no padding; `14` §4.1, `16` §1.2.1) |
| Print page count | `cmp_rev.print.page_count` | a multiple of 4 for saddle-stitch (`04` §5.1 invariant) |
| Content locks in force | `Approval.frozen.content_lock_ids[]` | the `lck_` ids of every `content_lock` active at approval — the *set*, so a later release is detectable (§3.2) |
| Design revision | `Approval.revisions.dsg_rev` | the exact design that produced the frozen geometry (`D-13`) |
| Environment | `Approval.environment{}` | `engine_version`, `chromium`, `fonts_hash`, `theme_token_hash`, `imposition_spec_version` (`D-14`) |

`frozen{}` does **not** duplicate the design revision or the environment: `D-05`'s "design revision" and `D-14`'s environment are bound at the record level (`revisions.dsg_rev`, `environment{}`), so they cannot disagree with a copy. The `frozen{}` object records only what has no other home (page assignments) and what must be *live-checked* (§3.2).

### 3.2 The frozen lock set is live-checked

A released lock is not visible in the revision triple (locks live in `composition/locks.json`, a registry — `04` §2, `03` §6). Therefore `SOUND(a)` carries the conjunct `∀ l ∈ a.frozen.content_lock_ids : locks[l].state = "active"`, and releasing such a lock stales the approval (A-04). Without this conjunct, an approved publication could have a released content lock while its approval still claimed the lock protected the frozen pages — a quiet lie about an intentional decision, exactly what §6.9 forbids.

### 3.3 What a frozen plan refuses to do

| A frozen plan refuses to … | Emitted as | Basis |
|---|---|---|
| reflow a page to make content fit | `PRINT_FROZEN_OVERFLOW` (against the affected page) — **no reflow, ever** | `D-05` step 3; `03` §5.2 step 4 |
| re-solve while a soft lock (S1–S3) would be violated beyond tolerance | `COMP_FROZEN_LOCK_CONFLICT` (critical); the render of the affected page is refused and the plan is not altered | `07` §5.1, §5.3 |
| silently change the approved page assignment | the approved `cmp_rev` is immutable (`04` §1.2) and the pointer cannot move without a new revision | `D-05`; §15.2 |
| re-freeze itself on new content | a new freeze requires a new `cmp_rev` and a new approval | `D-05` step 3 |
| pad mid-story to absorb a change | padding is permitted only at front/back matter boundaries | `D-16`; `COMP_IMPOSITION_PADDED_MIDSTORY` |
| approximate on overflow | a refused render emits nothing | `07` §5.4 rule 2; `03` §10 |

When a frozen page cannot hold its content the project moves to `composition_stale` (`02` §3.1, T-20) and every publishing step is refused until the author acts.

### 3.4 The single action that re-opens pagination

There is exactly one: **`Re-open pagination`** — a user action (`D-05` step 3; `02` §3.2 T-21; `03` §5.2 step 1 "frozen plan if `cmp_rev` is approved"). It is listed among the studio operations (`03` §4 `reopen_pagination`) and in the `Action` op set (`04` §5.4).

| Effect | Value |
|---|---|
| Revision created | a **new** `cmp_rev`, child of the frozen revision, `reason: "reopen_pagination"`, with `print.pages[].frozen = false` and the frozen page count released. The frozen revision **remains in history forever** (`D-05` step 3; `14` `T-PRT-029`) |
| `Action` appended | `{ kind: "reopen_pagination", from_rev: <frozen cmp_>, to_rev: <new cmp_>, actor: <user> }` |
| Approval effect | every approval in the chain → `stale`, `stale_reason: "print_reopened"` (A-05). No approval is deleted; no approval is edited |
| Stage | `composition_stale` → `composing` (`02` T-21) |
| After re-freeze | the author re-freezes when satisfied; the project returns to `approval_ready` and a **new** `apr_` is required. The old `apr_` never returns to `approved` |
| Content of the re-opened plan | re-solved freely (unfrozen), and a frozen page that had overflowed is either satisfied by the re-solve or the author changes the content/design |

`Re-open pagination` is **never** performed automatically, in any state, under any mode (`02` §4.2, §9). A frozen plan that overflows therefore has exactly two lawful exits: fix the content/design so the frozen plan holds again, or re-open, which requires a new approval.

---

## 4. Invalidation matrix

**This is the authoritative table.** It is exhaustive over the edits a user can make, and it is a *data-driven test table* — every row is a case asserted by `14` `T-OPS-011` (existing) and `T-OPS-055` (new, §11).

**Columns.** "Written" = the revision or identity the edit produces (none = a no-op, §2.5.1). "Record" = the approval transition and `stale_reason`. "Scopes" = the §6.11 decisions whose *inputs* changed and which must therefore be re-made or re-checked before re-approval — the letters are `MS` `BO` `PT` `DC` `PC` `DS` `PV`. "Revalidation" = the targeted scope that runs (`§12.5` "targeted revalidation"; §6.11). "Print pagination" ∈ `recompute` (re-solved, pre-freeze) · `recompute → re-freeze` · `retain` (the plan is unchanged) · `refuse` (frozen; the render is refused, `D-05`).

> **Read `PC` carefully.** `05` §2.7 binds `print_composition` to `cmp_rev.print` (frozen) and states it is invalidated by **`Re-open pagination` only**. A change to any *other* input stales the *record* (§2.5) and may make the frozen plan unrenderable (`→ composition_stale`), but it does not by itself alter the frozen decision. Where the table shows `PC` set, the print plan is **unfrozen** and the decision is genuinely re-made; where the print is frozen and the plan is retained, `PC` is deliberately absent.

| # | Edit | Written | Record | `stale_reason` | Scopes | Revalidation | Print pagination |
|---|---|---|---|---|---|---|---|
| 1 | **Block text edit** (in place; block id unchanged, `text_hash` moves) | new `ms_rev` (none if canonical hash unchanged) | → `stale` | `manuscript_revision_changed` | `MS`, `PV`; `+DC +PC +PT` iff the block's occupied line count changed | the block's page(s) in each plan; content validators for `blk_x` only; `MS_TEXT_HASH_DRIFT`, layout validators for affected pages | `recompute` if unfrozen · `retain` if the frozen fit is unchanged · `refuse` (`PRINT_FROZEN_OVERFLOW` + `composition_stale`) if a frozen page no longer holds it |
| 2 | **Block split** | new `ms_rev`; new `blk_` for the tail; original id on the head (`05` §1.3) | → `stale` | `manuscript_revision_changed` | `MS`, `DC`, `PC`, `PV`; `+PT` if the split point is a break position | the page(s) at the split point; `BEAT_UNASSIGNED_BLOCK` for the tail; beat-span validators if the tail joins another beat | `recompute → re-freeze` if unfrozen · `refuse` if a frozen page's contents change |
| 3 | **Block merge** (survivor keeps its id; retires rest into `absorbed_ids[]`) | new `ms_rev` | → `stale` | `manuscript_revision_changed` | `MS`, `DC`, `PC`, `PV`; `+PT` if a break's `before_block` was absorbed | `COMP_BLOCK_UNRESOLVED` (critical → `blocked`) for every `cmp_rev` referencing an absorbed id, forcing re-apply; survivor's page(s) | `refuse` until re-applied (blocking) · then `recompute → re-freeze` if unfrozen · `refuse` if frozen pages affected |
| 4 | **Beat reorder** | new `ms_rev` (`beat_order`) + new `cmp_rev` (`logical.beat_order`) | → `stale` | `beat_order_changed` | `BO`, `MS`, `DC`, `PC`, `PT`, `PV` | `COMP_ORDER_CONTRADICTS_BEAT_ORDER`; beat-span validators for changed beats; re-solve pages holding affected beats | `recompute → re-freeze` if unfrozen · `refuse` if a frozen page's beat assignment changes |
| 5 | **Blueprint change** (`progression[]` add/remove/reorder) | new `blueprint@<hash>`; `deriveBeats()` re-run; new `ms_rev` if `beat_order` moves; new `beat_` for added entries | → `stale` | `beat_order_changed` | `BO`, `MS`, `DC`, `PC`, `PT`, `PV` | `BEAT_ORPHANED_BLOCKS` (blocks are **not** deleted, `05` §1.3), `BEAT_UNASSIGNED_BLOCK`; page-turn suggestions for removed beats invalidated | `recompute → re-freeze` if unfrozen · `refuse` if frozen pages affected |
| 6 | **Page template assignment** (`set_template`) or **`convert_page` kind** | new `cmp_rev` + `Action{set_template\|convert_page}` | → `stale` | `composition_revision_changed` | `DC`, `PC`, `PV` | the affected page in each plan; `§6.8` kind/template compatibility; `border_slot: "perimeter"` invariant (`04` §6.2) | `recompute → re-freeze` if unfrozen · `refuse` if the page is frozen (its template is part of the frozen assignment) |
| 7 | **Page template definition edit** (`design/templates/<tpl_>.json`) | new `dsg_rev` — the design revision pins the template set by `templates_hash` (**gap flagged**, §11) | → `stale` | `design_revision_changed` | `DS`, `DC`, `PC`, `PV` | every page using the template; region maxima and perimeter-frame consistency (`§6.8`/`§9.2`) | `recompute → re-freeze` if unfrozen · `refuse` if a frozen page uses the template and its fit changes |
| 8 | **Design token change** (border geometry, gutter, safe area, background, accent) | new `dsg_rev` | → `stale` | `design_revision_changed` | `DS`, `DC`, `PC`, `PV` | **both plans, all pages** (geometry is global, `D-13`); content validators **not** re-run (`05` §2.7) | `recompute → re-freeze` if unfrozen · `refuse` (`PRINT_FROZEN_OVERFLOW` + `composition_stale`) if any frozen page overflows |
| 9 | **Typography change** (`size_pt`/`size_px_css`, `line_height`, `scale_steps`, `orphans`, `widows`) | new `dsg_rev` | → `stale` | `typography_changed` | `DS`, `DC`, `PC`, `PV` | **both plans, all pages**; content validators **not** re-run | `recompute → re-freeze` if unfrozen · `refuse` if frozen |
| 10 | **Font family / metrics change** (family swap ⇒ metrics move) | new `dsg_rev`; `env.fonts_hash` moves | → `stale` | `typography_changed` | `DS`, `DC`, `PC`, `PV` | all pages; `DESIGN_FONT_UNLICENSED` (`D-09`), `PRINT_FONT_NOT_EMBEDDABLE`; assert PDF embedding succeeded (`D-09`) | `recompute → re-freeze` if unfrozen · `refuse` if frozen |
| 11 | **Font file / licence change, family name and metrics unchanged** | **no revision**; only `env.fonts_hash` moves | → `stale` | `environment_changed` | `PV` (the affected scope's artifacts change) | design validators (licence, embedding); re-render + byte-compare (`§6.4`) to prove whether the plan moved | `retain`; artifacts regenerate ⇒ new `art_`; export blocked until re-approval on the new environment |
| 12 | **Lock added** | new `lck_`; new `cmp_rev` **iff** the solve output changes (`§2.5.1`) | → `stale` **only if the hash moved** | `composition_revision_changed` | `DC`, `PC` if the plan moved; `+PT` if a `page_break_lock`; `+DS` if a `design_lock`; `PV` | pages containing the locked scope only (`05` §2.7) | `recompute → re-freeze` if unfrozen · `refuse` (`COMP_FROZEN_LOCK_CONFLICT`, critical) if the lock would move a frozen page |
| 13 | **Lock released / re-scoped** | new `cmp_rev` if the plan moves; `locks.json` `state := released`; `Action{unlock}` | → `stale` | `content_lock_released` if it was in `frozen.content_lock_ids`, else `composition_revision_changed` | `DC`, `PC`; `+PT`/`+DS` for the corresponding lock type; `PV` | pages of the released scope only | `retain` the plan; the freeze's lock claim is void ⇒ **re-freeze and re-approval required**; `refuse` if the re-solve would move a frozen page |
| 14 | **Front matter change** (title/copyright/dedication/contents added or removed) | new `ms_rev` (blocks) or new `cmp_rev` (matter re-materialised); a bare `config.front_matter[]` edit must be materialised as one of these | → `stale` | `manuscript_revision_changed` or `composition_revision_changed` | `MS` if blocks changed; `DC`, `PC`, `PV` | print pages `1..k_matter` + the parity check (`PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR`); the digital matter pages | `recompute → re-freeze` if unfrozen · **`refuse`** if frozen — matter renumbering voids every frozen page assignment ⇒ `Re-open pagination` required |
| 15 | **Back matter change** (memory verse, discussion questions, about, closing) | new `ms_rev` or new `cmp_rev` | → `stale` | `manuscript_revision_changed` or `composition_revision_changed` | `MS` if blocks changed; `DC`, `PC`, `PV` | print pages `n−j..n` + parity; `COMP_IMPOSITION_PADDED_MIDSTORY`; deliberate blank reasons (`COMP_BLANK_UNINTENDED`) | `recompute → re-freeze` if unfrozen · **`refuse`** if frozen |
| 16 | **Language change** (`config.language` BCP-47 → `dsg_rev.lang`) | new `dsg_rev` | → `stale` | `design_revision_changed` | `DS`, `DC`, `PC`, `PV` | all pages of both plans (line breaking is language-dependent); font `language_coverage` against `fonts/registry.json` (`D-09`) | `recompute → re-freeze` if unfrozen · `refuse` if frozen |
| 17 | **Hyphenation change** (`dsg_rev.hyphenation`) | new `dsg_rev` | → `stale` | `hyphenation_changed` | `DS`, `DC`, `PC`, `PV` | all pages of both plans (`D-04`, `17` Part C) | `recompute → re-freeze` if unfrozen · `refuse` if frozen |
| 18 | **Spelling convention change** (`config.spelling_convention` us\|uk ⇒ prose changes) | new `ms_rev` | → `stale` | `manuscript_revision_changed` | `MS`, `DC`, `PC`, `PV` | the blocks whose text changed; reading-level and stats validators; `MS_TEXT_HASH_DRIFT` | `recompute` if unfrozen · `refuse` if a frozen page overflows |
| 19 | **Engine upgrade** (`engine_version` moves) | none; `env.engine_version` moves | → `stale` | `environment_changed` | `PV` always; `+DC +PC` **iff the upgrade is layout-affecting** (`§6.5`) | the `D-14` reproducibility check; re-render + byte/hash compare | `retain`; artifacts become `reproducible: false` until regenerated on the new environment and re-approved |
| 20 | **Chromium upgrade** (build id moves) | none; `env.chromium` moves | → `stale` | `environment_changed` | `DC`, `PC`, `PV` (Chromium is the sole layout authority — `D-01`) | re-measure at the reference viewport set **and** the print trim; compare the golden plan hash; re-solve only if it moved | `recompute` if unfrozen (measurements moved) · `refuse` if frozen — the frozen plan is re-measured and honoured only if the fit is identical |
| 21 | **Imposition spec change** (`imposition/spec.json` `spec_version` moves) | none; `env.imposition_spec_version` moves | → `stale` | `environment_changed` | `PC`, `PV` | the imposition arithmetic property test; re-impose; `PRINT_IMPOSITION_SPEC_MISMATCH` if any manifest's recorded version differs (`04` §8) | `retain` the *page plan* — imposition only reorders existing pages; the booklet PDF reassembles ⇒ new `art_` ⇒ new approval |

**Rows 14 and 15 are the ones implementations get wrong.** A front-matter edit is not "just a page one is looking at"; it renumbers the whole story and therefore voids the frozen assignment. The correct behaviour is a refusal plus a `Re-open pagination`, never a silent renumber.

---

## 5. Versioning model

### 5.1 How revisions accumulate

Each revision class (`ManuscriptRevision`, `CompositionRevision`, `DesignRevision`, `ValidationReport`) accumulates as a **per-class DAG**: every revision document carries `parent` and `reason` (`04` §4.2, §5.1, §6.1). Because identity is the content hash (`D-10`), the DAG is a pure function of content — two editing paths that converge on identical content share one node, and a "change" that changes nothing adds no node (§2.5.1).

| Property | Value | Basis |
|---|---|---|
| Identity | `sha256` of canonical JSON; the hash is the filename and the pointer value | `D-10`, `04` §1.1 |
| Immutability | a revision document is never modified | `04` §1.2 |
| Provenance | `parent`, `reason`, `created_at`, `created_by ∈ {human, autonomous}` | `04` §4.2; `02` §4.3 |
| Event log | composition edits are `Action` records in `composition/history.json`, append-only ("undo" restores an earlier revision, it does not delete an action) | `04` §5.4; `03` §6 |
| Derived fields | `summary`, `stats` are caches and a validator reports drift rather than trusting them | `04` §4.2 invariants |

### 5.2 History: presentation and navigation

| Surface | Shows | Read from |
|---|---|---|
| Project Dashboard (§11.1) | pipeline stage, manuscript/composition/design/preview/print/approval status, export availability | `project.json`, the current triple, the governing `apr_` |
| Composition history (§6.4 undo/redo, §15.2 rollback) | the ordered `cmp_rev` list with the `Action` that produced each; rollback = `restore_revision` | `composition/history.json` |
| Publication Center (§11.2) | validation results, **approval history** (the `apr_` chain with lifecycle labels), export availability | `approvals/*.json`, `validation/*.json` |
| Revision navigator | any class by label, by hash, or by triple; a canonical-JSON diff between two revisions of the same class | `revisions.json` (§5.4) + the revision documents |

Navigation is always by hash underneath. A label is a convenience that resolves to a hash; the moment a label and a hash disagree, the hash wins and the disagreement is a `PROJECT_POINTER_DANGLING`-class defect (`04` §3 invariant).

### 5.3 Editions

**Definition.** An **Edition** is a project that reuses another project's design revision and template set while owning its own manuscript, composition and approvals. It is the operational meaning of §3.1 mode 9, "Create a new edition using an existing design".

| Aspect | Value |
|---|---|
| Realisation | a **new** `prj_` (mode 9, `02` §5 row 9) whose `pointers.design_revision` initially equals the source project's `dsg_rev`, and which records a source edge `source: { kind: "edition_of", prj: <source>, dsg_rev: <pinned hash> }` |
| It reuses | the `dsg_rev` and the `design/templates/*` set; the profile and theme |
| It owns | its own `ms_rev`, `cmp_rev`, `val_rev`, `locks.json`, `approvals/*`, `artifacts/*` |
| Its identity | the `prj_` id + the **pinned** `dsg_rev` hash. Not a monotonic "edition number" — a number can be reused by a restore, a hash cannot (`D-10` reasoning) |
| `BookMetadata.edition` | a publication-facing display string ("First Edition") rendered on the title page (`04` §3.2). **Not** the edition's identity |
| Design drift | because the edition pins a hash, a change to the source design lineage does not move the edition's pointer. Re-pointing the design is an explicit user action → new `dsg_rev` in the edition → the edition's approval goes `stale` (`design_revision_changed`) |
| Approvals | per edition: the edition's approval binds the edition's triple. There is **no shared approval** across editions, because the manuscript differs |
| Artifacts | per edition: `art_.approval_id` names an approval in the edition's chain. Two editions' artifacts are reproducible from the same `dsg_rev` but carry different `ms_rev`/`cmp_rev` in their manifests |
| Spec basis | §3.1 mode 9; §12.2 "Approved editions"; §1.3 "Every project must be recoverable, editable, and version-controlled" |

`docs/04` has no `Edition` entity; the source edge is a proposed `Project.source` field (§11). An edition is *not* a sub-directory of its source: it is a sibling project directory, because `D-03` makes a project a directory and two deliverables from one source must remain separately openable.

### 5.4 Human-facing labels: aliases over content hashes (`D-10`)

```
label  ::= <class>-<nnn>            // ms-003, cmp-007, dsg-001, val-004; zero-padded to 3
```

**Store** (proposed addition to the `03` §6 layout; §11): `revisions.json` at the project root.

```jsonc
{
  "ms":  [ { "label": "ms-003",  "hash": "ms_9f3a…",  "at": "…", "by": "stephen" } ],
  "cmp": [ { "label": "cmp-007", "hash": "cmp_4c1b…", "at": "…", "by": "stephen" } ],
  "dsg": [ { "label": "dsg-001", "hash": "dsg_77e0…", "at": "…", "by": "stephen" } ],
  "val": [ { "label": "val-004", "hash": "val_2ab9…", "at": "…", "by": "autonomous" } ]
}
```

**Invariants.**

| # | Invariant | Why |
|---|---|---|
| L1 | A label resolves to exactly one hash | a label is an alias, never an identity (`D-10`) |
| L2 | A hash carries at most one label of its class | avoids two names for one thing |
| L3 | Labels are **never reused** inside a project; a retired label stays retired | mirrors the ULID non-reuse rule (`D-18`); a reused `ms-003` would make a past conversation about a revision ambiguous |
| L4 | The hash is the identity in **every** machine-readable field | a counter can be reset, forked or reused by a restore; a hash cannot (`D-10`) |
| L5 | Labels are monotonic per class per project | the nth revision of a class is decidable from the label, which matters for the human reading the history |
| L6 | A display alias (free text, e.g. "manuscript after line edit") carries **no** identity and may change freely | keeps a human-friendly name distinct from a stable one |

**Edition labels.** An edition carries its own label space; `ms-003` in edition A is a different revision from `ms-003` in edition B. A cross-edition reference always uses the hash.

---

## 6. Reproducibility

### 6.1 The artifact manifest, in full

The manifest is the *only* thing that makes §15.5's "Approved publications are reproducible" checkable. It extends `04` §7.4's `{revisions, environment, files[], reproducible}` and `D-14`'s required components (engine version, Chromium build id, font file hashes, theme token hash, imposition spec version, **the pinned PDF assembly library**, revision triple).

**This section is the single owner of the environment/manifest field list.** `17` D-14 states *what must be recorded*; this section states *where*, and the `environment{}` object above is the one authoritative shape. `12` §1.1's `env(engine)`, `04` §7.3's `Approval.environment` and `04` §7.4's `Artifact.manifest` all **reference** it and must match it **field-for-field** — including `chromium_playwright_revision`, `node_version`, `theme_token_hash`, `hyphenation_dictionary_hash` and `pdf_assembly_lib`. A copy that omits a field is a defect, not a variant: `SOUND`'s `a.environment = env(engine)` conjunct (§1.1) compares the two objects component by component, and two differently shaped objects can never be equal.

```jsonc
{
  "manifest_version": 1,
  "artifact_id": "art_01J…",                    // ULID, assigned before rendering starts
  "kind": "reading_pdf",                       // 04 §7.4 enum
  "created_at": "…",
  "created_by": "human" | "autonomous",        // 02 §4.3
  "job_id": "job_01J…",                        // the checkpointed job that produced it (D-17)
  "approval_id": "apr_01J…",                   // the single governing approval (§1.2)

  "revisions": { "ms_rev": "ms_…", "cmp_rev": "cmp_…", "dsg_rev": "dsg_…", "val_rev": "val_…" },

  "environment": {
    "engine_version": "0.1.0",
    "chromium": "141.0.7390.54",               // build id — the sole layout authority (D-01)
    "chromium_playwright_revision": "…",
    "node_version": "22.14.0",
    "fonts_hash": "sha256:…",                  // over sorted (family, file_sha256, metrics_hash)     (D-09)
    "theme_token_hash": "sha256:…",            // sha256(canonical_json(dsg.tokens))
    "imposition_spec_version": 1,              // imposition/spec.json                                 (D-14)
    "hyphenation_dictionary_hash": "sha256:…", // lang + hyphenation are pagination inputs (D-04)
    "pdf_assembly_lib": {                      // D-14 — the booklet assembler. It typesets nothing: the
      "name": "pdf-lib",                       //   imposed PDF places already-rendered Chromium pages 2-up
      "version": "<pinned>"                    //   and never re-renders (10 §8.2), so a different library
    }                                          //   version is a different byte stream. The value is copied
                                               //   from the repository lockfile at build time; `17` D-14 names
                                               //   the *field*, not the number — the pin is a build input, not
                                               //   a design decision, and a number written into a spec is stale
                                               //   the day it is written.
  },

  "inputs": {
    "paper": "half_letter",                    // or { "width_mm": …, "height_mm": … }
    "trim_mm": { "width_mm": 139.7, "height_mm": 215.9 },
    "print_page_count": 16,                    // multiple of 4 for saddle_stitch
    "digital_viewports_px_css": ["360x640","414x896","768x1024","1280x800","1440x900"],
    "device_scale_factor": 1,                  // DPR pinned to 1 (reproducibility over fidelity)
    "imposition": { "sheets": 4, "duplex_flip_edge": "long" }
  },

  "generator": { "command": "sbx export --kind reading_pdf", "tool": "storybook-studio", "tool_version": "0.1.0" },

  "files": [ { "path": "reading.pdf", "bytes": 482139, "sha256": "…" } ],

  "manifest_sha256": "…",                      // sha256(canonical_json(this, minus this field))
  "reproducible": true,
  "unreproducible_reason": null
}
```

| Field group | Required | Source of the value |
|---|---|---|
| `artifact_id`, `kind`, `created_at` | yes | `04` §7.4 |
| `job_id` | yes | `D-17`; `03` §8 — the checkpointed job that produced it |
| `approval_id` | yes | §1.1 `GOVERNING_APPROVAL`; `04` §7.4 |
| `revisions{}` | yes | the current pointer triple at render time; must equal the cited approval's triple (`§1.1 SOUND`) |
| `environment{}` | yes | `env(engine)` read at render time (`D-14`) |
| `inputs{}` | yes | paper/trim from `cmp_rev.print`, viewports from the reference set (`03` §5.1), DPR pinned |
| `generator{}` | yes | the CLI/server command and tool version — makes the *procedure* reproducible, not only the inputs |
| `files[]` | yes | one entry per produced file, with `bytes` and `sha256` |
| `manifest_sha256` | yes | self-hash; detects a manifest edited in place (`T-OPS-053`, new) |
| `reproducible`, `unreproducible_reason` | yes | `04` §7.4; `D-14` |

### 6.2 How it is generated

1. Engine G assigns the `art_` ULID **before** rendering, so a partial output from a crashed job is discardable and can never be published (whole-or-nothing, `03` §10).
2. The render job (Engine D/E, chunked per page — `03` §8) writes each file and computes its `sha256` as it streams.
3. `manifest.json` is written last; then `manifest_sha256` is computed over the canonical serialisation minus that field and stored. Canonicalisation is the same rule that gives `D-10` its hashes (`04` §1: sorted keys, no insignificant whitespace, arrays in documented sort order).
4. `reproducible` is set by the writer: `true` only if every environment component resolved to a pinned artefact (a Chromium build id, font files whose hashes are in `fonts/registry.json`, `imposition/spec.json` at a version). Any failure to pin ⇒ `false` with a reason.

### 6.3 How a later reviewer re-derives an artifact

| Command | Does | Proves |
|---|---|---|
| `sbx artifact verify art_…` | recomputes every `files[].sha256` on disk and `manifest_sha256` | the artifact has not been altered in place (`T-OPS-053`, `T-OPS-054`, new) |
| `sbx artifact reproduce art_…` | restores the recorded environment (Chromium build id, fonts by `fonts_hash`, `imposition/spec.json` by `spec_version`), re-runs `generator.command` on the recorded triple, and byte-compares | §15.5 "Approved publications are reproducible" (`T-OPS-051`, new; `D-14`) |
| `sbx artifact provenance art_…` | prints the manifest, the cited approval, the `proposals/` trail and the job record | §9's audit surface, from artifacts alone |

A `reproduce` that yields **different** bytes sets `reproducible: false` and records the reason. It never overwrites the artifact, never re-baselines a golden, and never edits the manifest (`14` `T-OPS-034`: "the determinism suite refuses to update a golden/baseline automatically; drift is a failure").

### 6.4 The byte-identity claim

> For a fixed revision triple and a fixed environment, `render(kind)` is a pure function: two runs produce **byte-identical** files, and their manifests carry equal `files[].sha256`.

Basis: one pinned Chromium does all measurement and rendering (`D-01`); pagination is a pure function with no network call (`D-04`); all measurement is quantised to 1/64 px integers and no float weights enter the solver (`07` §4.5); collections are iterated in ULID order (`07` §4.5); PDF assembly is single-threaded because output ordering feeds page numbers (`03` §9).

| Test id | Name | Layer | Asserts | Cite |
|---|---|---|---|---|
| `T-OPS-030` | identical-input-same-hash | determinism | re-running `paginate` on the same triple yields the identical `PagePlan` hash | (existing) `D-04`, `07` §4.5 |
| `T-OPS-031` | identical-input-same-bytes | determinism | two renders of the same triple produce byte-identical PDFs | (existing) `D-04`, `D-14` |
| `T-OPS-033` | environment-drift-detected | determinism | a changed Chromium build id, font hash or imposition spec version changes the manifest and fails equality | (existing) `D-14` |
| `T-OPS-034` | no-auto-rebaseline | determinism | the determinism suite refuses to auto-update a golden | (existing) `docs/00` §4.3 |
| `T-OPS-035` | cache-disposability | determinism | deleting `.cache/` and re-running reproduces identical bytes | (existing) `03` §6 |
| **`T-OPS-050`** | manifest-fields-complete | unit | every field of §6.1 is present; a missing field is a schema error (`additionalProperties: false` both ways) | (new) `04` §7.4, `D-14`, §6.1 |
| **`T-OPS-051`** | manifest-reproduces-artifact | integration | `reproduce` from a manifest on its recorded environment yields byte-identical files | (new) `D-14`, `§15.5` |
| **`T-OPS-052`** | unreproducible-not-valid | unit | an artifact whose environment cannot be reproduced is `reproducible: false` and is refused as the citation of a publication or archive | (new) `D-14`, §6.5, §7.3 |
| **`T-OPS-053`** | manifest-hash-self-consistency | unit | `manifest_sha256` recomputes; an edited manifest fails verification | (new) §6.1, §6.3 |
| **`T-OPS-054`** | artifact-immutable | unit | an exported file edited on disk fails `sbx artifact verify` | (new) `04` §1.2 |
| **`T-OPS-055`** | invalidation-matrix-v2 | unit | each §4 row invalidates exactly the named scopes and produces the named `stale_reason` and print-pagination behaviour (data-driven table test) | (new) §4, `05` §2.7 |

`T-OPS-050…055` are additions for `docs/14` to absorb (§11). **Absorbed:** `docs/14` §3.24 declares `T-OPS-050`…`T-OPS-056` with their `R-` back-references, and `docs/14` check `C7` now enforces that every test id cited in `docs/*.md` has a definition row there. `T-OPS-055` extends, and does not replace, the existing `T-OPS-011`.

### 6.5 What `reproducible: false` means

An artifact with `reproducible: false` is **not a valid publication** (`D-14`: "An artifact whose manifest cannot be reproduced on the recorded environment is reported as `unreproducible`, not as valid"). It is set, never inferred, in exactly these cases:

| Case | Set when | Reason recorded |
|---|---|---|
| Unpinned environment at generation | a font resolved to a file whose hash is not in `fonts/registry.json`; the Chromium build id is unavailable; `imposition/spec.json` is absent | `unpinned:<component>` |
| Failed re-derivation | `sbx artifact reproduce` produced different bytes | `bytes_differ:<path>` |
| Recorded environment unavailable | the recorded Chromium build id cannot be installed on the host running the reproduction | `environment_unavailable:chromium` |
| Missing input | the recorded `val_rev` (or another referenced document) is absent | `missing_input:val_rev` |

`reproducible: false` is **never** used to suppress a failure silently: it is a visible, blocking status, and an archive refuses to cite such an artifact (§7.3). New code `OPS_ARTIFACT_UNREPRODUCIBLE` (flagged, §11).

### 6.6 Behaviour under environment drift (Chromium or font version changed)

1. `env(engine)` is recomputed at every project open and every export (`04` §7.3).
2. If `env(engine) ≠ approval.environment` for **any** component, the approval is `stale` (`environment_changed`, A-03) and export is refused with `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (`reason: "environment_mismatch:<component>"`).
3. **Classification of the drift matters.** A component change that *can* move geometry (Chromium build id, font file hash, hyphenation dictionary, imposition spec) invalidates the affected composition scopes per §4 rows 19–21. A component change that cannot move geometry (a patch bump to `engine_version` with a `layout_affecting: false` flag) invalidates only `previews`/reproducibility — the plans are retained (`§6.5`).
4. Existing artifacts are re-verified. Drift does not by itself flip `reproducible` (the recorded environment may still be installable); it flips when a re-derivation is attempted and fails, or when the recorded component cannot be materialised.
5. A **startup assertion** refuses to run the studio or CI on a Chromium build id other than the pinned one, because "a green suite on the wrong browser would be a false pass" (`14` §…; `D-01`, `D-14`).
6. The silent-drift case is a font file change with an unchanged family name: `dsg_rev` does not move, but `fonts_hash` does, so §4 row 11 stales the approval and blocks export until re-approval on the new environment. This is exactly the case `D-14` exists for — "the same markup typesets differently under a different Chromium build or a substituted font."

---

## 7. Archive and retention

### 7.1 What an approved publication archive contains

§1.3 requires that every project be "recoverable, editable, and version-controlled"; §18 lists "Archive the final approved publication"; §15.5 requires approved publications to be reproducible and exports to match the approved revision. The archive is what makes all four true *after the fact*, from a directory alone.

| Member | Why it is required |
|---|---|
| `archive.json` | the index: `{archive_version, at, by, approval_id, revisions{}, environment{}, manual_proof, artifact_ids[], members[{path, bytes, sha256}], root_sha256}` |
| `project.json` (read-only snapshot) | identity, config, profile, and the pointers as they stood at approval |
| `manuscript/blocks.json` + `manuscript/revisions/<ms_rev>.json` | the approved prose, exactly one copy (§12.3) |
| `structure/blueprint.json`, `structure/beats.json`, `structure/sources.json` | the structure the prose was paced by; scripture provenance (`04` §4.5) |
| `composition/revisions/<cmp_rev>.json` + `composition/locks.json` + `composition/history.json` | the approved page assignment, the locks in force (§3.2), and the actions that produced them |
| `design/revisions/<dsg_rev>.json` + `design/templates/*` | the approved visual identity (`D-13`) |
| `validation/<val_rev>.json` | the report the approval was judged against (`04` §7.2) |
| `approvals/<apr_…>.json` + the supersession chain | the decision, its scope, its freeze, its waivers, its manual proof (or `null`) |
| `artifacts/<art_…>/` | every artifact: `html_storybook`, `reading_pdf`, `booklet_pdf`, `print_guide`, `proof_sheet`, `page_png` + each manifest |
| `licenses.json` | translation and font licences actually used (`D-08`, `D-09`; `OPS_LICENSE_MISSING`) |
| `environment/` | `chromium.buildid`, `fonts.sha256`, `imposition.spec.json`, `theme.sha256` — the pin, materialised |
| `manual_proof/` | the A-18 record and its evidence files (§8) |
| `proposals/` | every `prop_` referenced by the archived revisions, so AI provenance survives with the publication (`D-11`) |

An archive **never** contains `<project>/.cache/` — see §7.4.

### 7.2 Where it lives on disk

`03` §6's project layout has no `archive/`; this document adds it (flagged, §11):

```
<project>/
├── archive/
│   └── <apr_…>/          sealed publication archives — immutable, human-readable, never under .cache/
```

It sits outside `.cache/`, alongside the other committed-able documents, so that "everything outside `.cache/` is human-readable, diffable and committed-able" (`03` §6) holds for the archive too. One archive directory per approving `apr_`, named by that id.

### 7.3 What is guaranteed restorable

| Guarantee | Mechanism |
|---|---|
| Any archived revision triple opens **read-only** | the triple's documents are copied in; `sbx open <archive>/project.json --read-only` |
| The triple re-renders **byte-identically** on the recorded environment | `D-14`; `sbx archive reproduce <dir>` re-runs the generator and byte-compares (§6.3) |
| The archive is **verifiable** without the app | `sbx archive verify <dir>` recomputes every member's `sha256` and `root_sha256`; a mismatch is a defect |
| The archive is **immutable** | written once, at archive time, from the approved triple; restoring never mutates the archive or the project |
| Retention | never garbage-collected by the tool; deleting an archive is a user action recorded as an event |

An archive that cannot satisfy "re-renders byte-identically" is refused at creation (`OPS_ARCHIVE_INCOMPLETE`, flagged §11): a sealed archive that cannot reproduce its own publication is worse than no archive, because it certifies a lie.

### 7.4 The rule that an archive never contains a cached measurement

> **An archive must contain no content from `<project>/.cache/` — no cached measurements, no cached manuscript summaries, no cached provider responses.**

Justification, stated as the reason the rule exists: measurement results are cached keyed by `(revision triple, viewport)` (`03` §5.1) and are *disposable and reproducible by contract* (`03` §6: "Everything inside `.cache/` is reproducible and may be deleted at any time"; `14` `T-OPS-035`). If a cached measurement travelled inside an archive, a re-render from that archive would satisfy its plan from the **cache** rather than from the **recorded environment**. Under environment drift (a new Chromium build, a substituted font) that would reproduce the *approved bytes* on a machine that could no longer produce them — masking precisely the drift the archive exists to detect (§6.6, `D-14`). The archive must depend on exactly two things: the revision triple, and the recorded environment.

| Enforcement | Value |
|---|---|
| Writer | excludes any path resolving under `.cache/` |
| Verifier | `sbx archive verify` fails with `OPS_ARCHIVE_CONTAINS_CACHE` (new, §11) if any member path resolves under `.cache/` |
| Test | `T-OPS-056` archive-excludes-cache (new) |

---

## 8. Manual proofs (spec §14 demonstration 18)

> **Correction to the commissioning brief, reported not edited.** The brief for this document attributes the manual physical proof to `D-16`. The binding register says otherwise: `17` Part C states that §14 demonstration 18 is **A-18**, that it is "a manual sign-off record, explicitly excluded from automated gates", and explicitly that "D-16 of Part A is not this". `D-16` is *length targets are word budgets and beat counts*. `13` §9 carries the same correction as a reported contradiction. **This document follows the register: the manual proof is A-18, recorded via `Approval.manual_proof`.**

### 8.1 The record

`04` §7.3 gives `manual_proof: {kind: "printed_booklet", at, photo_hash, notes}`. The full record:

```jsonc
"manual_proof": {
  "kind": "printed_booklet",                        // 04 §7.3
  "at": "…",
  "by": "stephen",                                  // the signer, by name — a human actor
  "approved_triple": { "ms_rev": "ms_…", "cmp_rev": "cmp_…", "dsg_rev": "dsg_…" },
  "artifact_id": "art_…",                           // the booklet_pdf actually printed
  "booklet_pdf_sha256": "…",                        // must equal that artifact manifest's file hash
  "environment": { "engine_version": "…", "chromium": "…", "imposition_spec_version": 1 },
  "printer": {
    "paper": "half_letter", "scale": "actual_size",
    "duplex": true, "flip_edge": "long", "sheets": 4
  },
  "assembly": {
    "folded": true, "bound": "saddle_stitch",
    "folds_correct": true, "sheet_order_correct": true,
    "borders_visible_after_trim": true, "margins_clear": true
  },
  "evidence": [ { "kind": "photo", "path": "photo_01.jpg", "sha256": "…", "bytes": 2312331 } ],
  "notes": "…"
}
```

`photo_hash` (`04` §7.3) is retained as `evidence[0].sha256`; the schema field name stays valid.

### 8.2 Who signs, and what evidence is attached

| Aspect | Rule | Basis |
|---|---|---|
| Signer | the author, **by name** in `by`. Never `created_by: "autonomous"`; never an `auto` transition | `02` §4.2, §9 ("Signing off … is never automated") |
| Which artifact was printed | `booklet_pdf_sha256` must equal the cited `art_`'s manifest hash — so the proof is bound to the exact approved artifact, not to "a booklet" | §6.1; §15.5 |
| Which publication | `approved_triple` must equal the cited approval's `revisions` | `D-10`; §1.1 |
| Evidence | at least one photograph (`evidence[0]`) of the folded, stapled booklet; the record is attached to the approval and copied into the archive (`§7.1`) | §14 demo 18; `14` `T-OPS-016` |
| Non-transferability | if the triple later changes, `approved_triple` no longer matches the pointers ⇒ the proof is **stale evidence** and the booklet must be printed again. It is not carried forward by a successor approval | `D-05` reasoning (the physical object exists for *that* triple) |

### 8.3 It is not part of the automated gate — stated explicitly

> **A-18 is not machine-verifiable and is excluded from the automated gate** (`17` Part C; `13` §9). Recording a `manual_proof` **satisfies no `T-` test** and is **not** a conjunct of `EXPORTABLE` (§1.3). Its absence never blocks approval or export; `manual_proof: null` is the normal state for a publication that has not been physically produced. The fixture's approved state carries "a `manual_proof` slot for A-18" (`14` §4.1) — a slot, not a gate.

Consequences that follow, and that an implementation must respect:

| Consequence | Value |
|---|---|
| Approving ≠ proving | §14 demo 17 (approval) and demo 18 (physical print) are separate records with separate lifecycles |
| A proof does not make an artifact valid | validity is `reproducible ∧ EXPORTABLE`; a printed booklet with a failed re-derivation is still `reproducible: false` |
| A proof cannot be forged into the gate | there is no `T-A18`; adding one would contradict `17` Part C |

---

## 9. Audit: what a reviewer determines from the project directory alone

Every state change in this product writes a document (`02` W-1). The SQLite database is a disposable index (`D-03`); `.cache/` may be absent. Therefore the following are all answerable by reading the directory, with no server, no network and no AI call.

| Reviewer question | Read | Fields that answer it |
|---|---|---|
| Which AI calls were **made**? | `proposals/*.json` (every proposal ever returned, applied or not — `D-11`) | `task`, `target{kind, refs[]}`, `change`, `rationale`, `provenance{provider, model, prompt_hash, input_hashes, tokens, latency_ms}`, `state`, `applied_as` |
| Which AI calls were **refused**, and why? | `proposals/*.json` | `refusal{code, reason}` — e.g. `PROPOSAL_TARGETS_LOCKED_CONTENT` (`D-11`; `07` §E2), `SCRIPTURE_DIALOGUE_UNMARKED`, `SCRIPTURE_TEXT_MISMATCH` (`04` §7.1; `D-08`) |
| Which locks existed, when, created or released **by whom**? | `composition/locks.json` + `composition/history.json` | `type`, `scope`, `reason`, `created_by/at`, `state`, `released_at`; `Action{kind: lock\|unlock, actor, at, params}` |
| Which composition edits happened, and by whom? | `composition/history.json` (append-only — `04` §5.4) | `Action{kind, from_rev, to_rev, params, actor, at}` over the full op set (`move`, `split_page`, `merge_pages`, `insert_break`, `remove_break`, `create_page`, `delete_page`, `convert_page`, `set_template`, `lock`, `unlock`, `freeze`, `reopen_pagination`, `restore_revision`, `accept_suggestion`) |
| Which revisions were **approved**, by whom, when, in what environment? | `approvals/*.json` | `at`, `by`, `scope[]`, `revisions{}`, `environment{}`, `frozen{}`, `state`, `stale_reason`, `revoked`, `superseded_by`, `waivers[]`, `manual_proof` |
| Which approvals were **invalidated**, and by what? | `approvals/*.json` | `state: "stale"` + `stale_reason` (closed set, §2.5) — the reason *names the pointer that moved* |
| Which **exports** were made, from which approval, on which environment? | `artifacts/<id>/manifest.json` | `approval_id`, `revisions{}`, `environment{}`, `files[]` (path/bytes/sha256), `reproducible` |
| Were exports reproducible? | `artifacts/*/manifest.json` | `reproducible`, `unreproducible_reason` |
| Which **validations** ran, and against what? | `validation/<val_rev>.json` | `judged{ms_rev, cmp_rev, dsg_rev, engine_version, chromium}`, `generated_at`, `summary`, `findings[]{code, family, severity, blocking, refs, evidence}` |
| Which **migrations** were applied? | `project.json` (`schema_version`), `src/project/migrations/`, the retained `project.json.pre-vN` | the migration function + its before/after fixture pair (`04` §9.2–9.3) |
| Which jobs ran, failed, resumed? | `jobs/*.json` | `kind`, `state`, `steps[{name, state, attempts, checkpoint, result_hash}]`, `resumes`, `error` (`D-17`) |
| Which **mode** produced a revision? | every revision | `created_by ∈ {human, autonomous}` — immutable (`02` §4.3 invariant) |
| Which publication is archived, and does it verify? | `archive/<apr_…>/archive.json` | `root_sha256`, `members[].sha256`, `approval_id`, `manual_proof` (§7) |

**The negative space is also decidable.** "No `prop_` with `task: rewrite` targets `blk_x`" is a fact about the directory; so is "no `Action{kind: release}` exists for `lck_y`". Because every refusal is written (`D-11`), a reviewer can distinguish *the AI was never asked* from *the AI was asked and blocked* — which is the whole point of the `refusal` field, and the reason the refusal is recorded where the intent is formed rather than where it would land (`07` §E2).

---

## 10. Anti-patterns this workflow forbids

| # | Anti-pattern | Prevented by | Code / predicate |
|---|---|---|---|
| 1 | **Approving twice with drift between** (two `approved` records whose triples differ, one presented as current) | (a) any pointer move flips **every** approval in the chain to `stale` — event-based, so a later edit cannot leave an earlier approval looking current (§2.5, §2.5.2); (b) `SOUND(a)` requires `a.revisions = current pointers` for **every** governing conjunct, so an approval minted on `T₁` cannot be governing while `T₂` is current; (c) supersession is recorded only between approvals on the **same** triple (§2.6), so it never launders a triple difference | `SOUND` (§1.1); `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` |
| 2 | **Exporting from a stale approval** | `EXPORTABLE` requires `GOVERNING(a) ∧ SOUND(a)`; `state: "stale"` fails `GOVERNING`, a moved pointer fails `SOUND`. No artifact can be written without it | `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` (critical) — `T-OPS-014` |
| 3 | **"Approving" by editing a state file** | (a) no code path sets `Approval.state := "approved"` except T-17, and it is user-only (`02` §3.6); (b) `approvals/<id>.json` is content-hashed into the project tree (the `FIXTURE.lock.json` pattern, `14` §4.3) and a hand edit fails verification; (c) the predicate **re-derives** `env(engine)` and the pointers at export time, so a forged `state` field with mismatched `revisions`/`environment` still fails `SOUND` | `OPS_APPROVAL_TAMPERED` (new, §11); `SOUND` |
| 4 | **Re-freezing a plan to hide a conflict** | (a) a frozen plan is released only by the explicit `Re-open pagination` user action, which writes a **new** `cmp_rev` and stales the approval (`D-05` step 3, §3.4); (b) the approved revision is immutable and stays in history (`04` §1.2); (c) re-freezing the same content is a no-op (content-addressed, §2.5.1) and cannot alter the recorded plan; (d) `EXPORTABLE` requires the approval to cite the *current* `cmp_rev`, so a re-freeze necessarily requires a new approval | `D-05`; `PRINT_FROZEN_OVERFLOW`; `COMP_FROZEN_LOCK_CONFLICT`; `T-PRT-029` |
| 5 | **Regenerating an artifact and calling it the same publication** | (a) an artifact cites `approval_id` + the triple; a different triple is a **different** artifact with a new `art_` id; (b) byte-identity is a tested property (§6.4); (c) a re-render under a drifted environment yields `reproducible: false` and cannot be cited by an archive (§7.3, §7.4) | `T-OPS-031`, `T-OPS-033`; `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION` |
| 6 | **Waiving a `critical`** — or using a waiver where a fix is owed, so a critical is treated as dischargeable | a waiver is only ever read through `waived_by(a, f)` inside `effective_blocking_*(f, a)` (§1.1), and only a `major` carrying an `A`/`E` flag is waivable at all (`11` §1.4 W1). A `critical` is always blocking (`04` §7.2, rule B2) and is never waivable, so no waiver can lift it — §10.5's final sentence is absolute. Waiving a **flagged `major`** is, by contrast, the intended, legal mechanism (§2.2) | `OPS_APPROVAL_BLOCKED_BY_CRITICAL` (new, §11); `11` §1.4 W1; §1.1 |
| 7 | **Approving in the same action as an edit** | an edit moves a pointer and stales; approval is minted after revalidation, never before. `02` §3.5 forbids editing-and-approving in one action from `approval_ready` | `02` §3.5; §2.5 |
| 8 | **Restoring an approved revision to revive its approval** | staleness is event-based (§2.5.2): the rollback *move* stales the chain even though the destination hash was once approved; `restore_revision` records an `Action` and never edits an `apr_` | §2.5.2; `04` §5.4 |
| 9 | **Silently reviving a stale approval on revalidation** | revalidation recomputes findings; it does not change `Approval.state`. Only a new `apr_` can be governing | `05` §2.7; `T-OPS-013` |
| 10 | **Shipping an archive whose reproduction depends on the cache** | the archive excludes `.cache/` by construction and `sbx archive verify` rejects a member under it | `OPS_ARCHIVE_CONTAINS_CACHE` (new, §11); §7.4; `T-OPS-056` |

---

## 11. Additions and contradictions — for the owning documents to absorb

Reported here rather than edited elsewhere (`00` §4.1).

### 11.1 New finding codes (for `docs/11`, the registry owner)

| Code | Family | Severity | Flags (`11` §2 `blk`) | When |
|---|---|---|---|---|
| `OPS_APPROVAL_BLOCKED_BY_CRITICAL` | `ops` | critical | `A·E·R` | approval refused while a critical finding is unresolved (§2.2; §10.5) |
| `OPS_APPROVAL_UNWAIVED_MAJOR` | `ops` | major | `A` (never waivable, `11` §1.4 W6) | an `A`-flagged finding is neither resolved nor waived when the approval act is attempted (§2.2) |
| `OPS_APPROVAL_TAMPERED` | `ops` | critical | `A·E·R` | an `approvals/<id>.json` fails its content-hash check, or its `state`/`revisions` disagree with the tree (§10 anti-pattern 3) |
| `OPS_ARTIFACT_UNREPRODUCIBLE` | `ops` | critical | `A·E·R` | `reproducible: false` (§6.5; `D-14`) |
| `OPS_FROZEN_LOCK_RELEASED` | `ops` | major | `none` | a lock in `Approval.frozen.content_lock_ids` is released while the approval is governing (§3.2) |
| `OPS_ARCHIVE_INCOMPLETE` | `ops` | critical | `A·E·R` | a sealed archive cannot reproduce its publication, or lacks a required member (§7.3) |
| `OPS_ARCHIVE_CONTAINS_CACHE` | `ops` | critical | `A·E·R` | an archive member path resolves under `.cache/` (§7.4) |

Also requested of `docs/11`: a per-code `waivable` boolean, so `EXPORTABLE`'s waiver clause is data-driven rather than a hard-coded list (§1.1).

Existing codes this document relies on and does **not** redefine: `EXPORT_FROM_UNAPPROVED_OR_STALE_REVISION`, `PRINT_FROZEN_OVERFLOW`, `COMP_FROZEN_LOCK_CONFLICT`, `PRINT_PAGE_COUNT_NOT_MULTIPLE_OF_FOUR`, `COMP_IMPOSITION_PADDED_MIDSTORY`, `PRINT_IMPOSITION_SPEC_MISMATCH`, `PROPOSAL_TARGETS_LOCKED_CONTENT`, `SCRIPTURE_DIALOGUE_UNMARKED`, `DESIGN_FONT_UNLICENSED`, `PRINT_FONT_NOT_EMBEDDABLE`, `OPS_LICENSE_MISSING`, `PROJECT_POINTER_DANGLING`.

### 11.2 New test ids (for `docs/14`)

`T-OPS-050` … `T-OPS-056` (§6.4, §7.4). The **waiver and gate** obligations are separately owed: `11` §10.1 now tabulates them (`code | scenario | asserted outcome`) for `14` to declare, because no row of `14` covers any waiver case, the `E` flag, or `effective_blocking`. They extend `T-OPS-010…018` and `T-OPS-030…035`; none renumbers an existing case. **Absorbed:** declared in `docs/14` §3.24 — six as new rows and `T-OPS-052` as a second verifier of `R-OPS-012` (whose `verification` test remains the existing `T-PRT-068`, since `T-PRT-068` asserts the core claim and `T-OPS-052` adds this document's §7.3 archive-refusal consequence). No requirement's `verification` id changed.

### 11.3 Schema additions (for `docs/04`)

| Entity | Field | Why |
|---|---|---|
| `Approval` (`04` §7.3) | `revoked: null \| {at, by, reason}` | revocation with a named cause, without adding a value to the binding `state` enum (§2.1, §2.7) |
| `Approval` | `superseded_by: null \| apr_` | supersession by a later approval (§2.6) |
| `Approval` | `waivers: Waiver[]` — **the shape defined once in `11` §1.4**, `{id, finding_id, code, waived_by, reason, scope, created_at}`, adopted verbatim and never re-spelled | makes `waived_by(a, f)` computable, hence `effective_blocking_*(f, a)` a conjunct of `EXPORTABLE` (§1.1); §6.11's "allow the user to approve" is meaningless if accepted major findings are invisible. **The `scope` field is required** — `11` §1.4 W5's scope-coverage rule depends on it. This document's earlier spelling `{finding_code, finding_ids[], reason, by, at}` and `04` §7.3's `{code, finding_id, reason, by, at}` (which cites a **non-existent** "`11` §1.6") are both superseded |
| `DesignRevision` (`04` §6.1) | `templates_hash` | **required for `D-04` purity.** `cmp_rev.print.pages[].template` references a `tpl_`, but `PageTemplate` is a *mutable registry* entity (`04` §2). Unless the design revision pins the template set by hash, `paginate` is not a function of the revision triple alone and §4 row 7 cannot be deterministic. Flagged as a **gap**, not a contradiction |
| `Project` (`04` §3) | `source: null \| {kind: "edition_of", prj, dsg_rev}` | the edition edge of §3.1 mode 9 and §12.2's "Approved editions" (§5.3) |

### 11.4 Layout additions (for `docs/03` §6)

| Path | Contents |
|---|---|
| `<project>/archive/<apr_…>/` | sealed publication archives (§7.2) |
| `<project>/revisions.json` | human-facing label → content-hash aliases for `ms`, `cmp`, `dsg`, `val` (§5.4) |

### 11.5 Contradictions

1. **"Manual proof = D-16" (this document's brief) vs the register.** `17` Part C states the manual physical proof is **A-18** and that "D-16 of Part A is not this"; `13` §9 reports the same correction. `D-16` is *length targets are word budgets and beat counts*. **This document follows the register** (§8); the brief's attribution is wrong.
2. **`D-05` "design revision and environment frozen at approval" vs `04` §7.3 `frozen{}` shape.** `04` §7.3's `frozen` object holds `{print_pages, content_lock_ids}` only. This document records "design revision" and "environment" as bound at the *record* level (`revisions.dsg_rev`, `environment{}`) and does not duplicate them into `frozen{}`, because a duplicate can disagree with its original. No change to `04` is required; the reconciliation is stated in §3.1.
3. **`Approval.state` two-value enum vs a four-value lifecycle.** Resolved without schema conflict by making `revoked`/`superseded_by` annotation fields and deriving the lifecycle label (§2.1), preserving `04` §7.3 and `02` §3.3.
4. **`docs/11-validation-strategy.md` is absent from the repository** (present: `00`, `02`, `03`, `04`, `05`, `07`, `13`, `14`, `17`, and the source spec). Every code is referenced by name; the new `OPS_` codes above are proposed for it to absorb, per `00` §3.2.
5. **`05` §2.7 binds `print_composition` to "`Re-open pagination` only."** Read together with `04` §7.3's record-level `stale`-on-any-pointer-move, this means a manuscript or design change stales the *record* and may refuse the *render*, but never re-makes the *frozen decision*. §4's "Read `PC` carefully" note applies this reading; it is not a contradiction, but it is the single most misreadable rule in the set.

---

### 11.6 The adopted gate rule, and the changes other documents owe

**The rule — stated identically here and in `11` §1.3.** A finding blocks **approval** iff it is flagged `A` and not waived under the approval being tested, or it is `critical` (**never** waivable). A finding blocks **export** iff it is flagged `E` and not waived under that approval, or it is `critical`. A flagged-but-waived finding blocks nothing. An unflagged finding blocks nothing. `waived_by(a, f)` is a relation to an approval (`11` §1.4 W4), so the predicates take the `Approval` as an argument and read that approval's `waivers[]`; there is no `Finding.waived` property and no `Finding.blocking.approval`. All four flag combinations (`A`, `E`, `A·E`, neither) have a defined effect on each gate (`11` §1.3).

**The one `Waiver` shape** — defined in `11` §1.4, referenced by `04` §7.3 and §11.3 above, never re-spelled:

```ts
type Waiver = Readonly<{
  id: string;             // wv_
  finding_id: FindingId;  // find_
  code: FindingCode;
  waived_by: string;      // actor
  reason: string;         // REQUIRED, non-empty — same rule as a Lock (04 §5.3)
  scope: ApprovalScope;   // the §6.11 scope it applies to (W5) — load-bearing, do not drop
  created_at: string;     // ISO-8601 UTC
}>;
```

| Owner | What it must change |
|---|---|
| `04` §7.3 | adopt the `Waiver` shape **verbatim** (its `{code, finding_id, reason, by, at}` and its citation of a **non-existent** "`11` §1.6`" are both wrong; the shape is defined in `11` §1.4, the waiver rules in W1–W6). Adopt `12` §2.5's `stale_reason` closed set (eleven values; the five per-component `*_changed` spellings collapse into `environment_changed`). Extend `Approval.environment` to match §6.1 **field-for-field** — it is missing `theme_token_hash`, `chromium_playwright_revision`, `node_version` and `hyphenation_dictionary_hash`, so `SOUND`'s environment conjunct currently compares two differently shaped objects |
| `04` §7.4 | same: reference §6.1's field list, including `pdf_assembly_lib` |
| `05` §1.4 | its claim is **correct** under the adopted rule and needs no reversal — but it should be stated in these terms: `SCRIPTURE_INTERPRETATION_FLAGGED` (`major · E`) blocks **export** until the finding is waived or a human sets `verification.state` to `verified`/`disputed` with a note. "Blocking for export" is right; it is not a blocker of *approval* |
| `16` A-17 | still refuses approval on *any* "un-waived major". Only an `A`-flagged finding does; the `E`-only code blocks export and never approval |
| `08` §5 rung 6 | says a `minor` `CONTENT_*` finding "blocks approval while unresolved" — `minor` blocks nothing (rule B5, `11` §1.3) |
| `10` §6.5 | still writes `PRINT_BORDER_TEXT_COLLISION` "(major)"; `09` §7.4 (C2) and `08` §5 (rung 1) own it as `critical`, and `11` §2 now registers it `critical · A·E·R` (G7) |
| `13` §3.1, `14` §3.x | `effective_blocking` is attributed to `T-QAS-007`, which tests something else (the no-direct-write static guard). `11` §10.1 tabulates the waiver/gate tests that are owed |

---

## 12. Traceability

| Requirement cluster | Where this document answers it |
|---|---|
| §1.2 three deliverables from one approved manuscript + shared design | §1.4 `REQUIRED_SCOPES`; §5.3 editions |
| §1.3 protected approved material, recoverable/version-controlled projects | §2.5, §5.1, §7 |
| §3.1 mode 9 (new edition using an existing design) | §5.3 |
| §6.11 seven approval scopes, associated with a manuscript + design revision, targeted revalidation | §2.3, §2.4, §4 |
| §9.3 print overflow → request revision | §3.3, §3.4 |
| §9.4 deliberate blanks, multiple-of-four, two downloads | §3.1, §4 rows 14–15; §6.1 |
| §10.5 critical errors block approval | §1.1, §2.2, §10 anti-pattern 6 |
| §12.2 sixteen record kinds, stable identifiers | §2, §5 |
| §12.5 targeted revalidation, versioned composition data | §4 |
| §14 demonstrations 17 and 18 | §2.2; §8 |
| §15.2 print assignments stable after approval | §3 |
| §15.5 reproducible, exports match the approved revision | §1, §6 |
| §18 archive the final approved publication | §7 |
