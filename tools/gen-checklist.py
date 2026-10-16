#!/usr/bin/env python3
"""gen-checklist.py — deterministic generator for docs/15-development-checklist.md.

Implements spec §16 item 17 ("the development checklist should track each
requirement as planned, in progress, implemented, validated, or deferred") as a
generated traceability matrix over the 219 requirements of spec/requirements.json.

Reads
-----
  spec/requirements.json       the requirement index  (R-<AREA>-<nnn>, owned by docs/01)
  spec/checklist-status.json   the mutable status store, one entry per requirement
                               (THE source of truth; the markdown is a view)
  docs/14-test-plan.md         the owner of T-<AREA>-<nnn> ids (the declared test set)
  docs/*.md                    every document, scanned by C7 for cited test ids

Writes (replacing the content between explicit marker-comment pairs in
docs/15-development-checklist.md; every other byte of that file is hand-owned)
------------------------------------------------------------------------------
  <!-- GEN:AREA-MATRICES -->        one table per AREA
  <!-- GEN:PHASE-VIEW -->           the nine §17 phases and the ids each closes
  <!-- GEN:ORPHANS -->              requirements with no test / no phase / no doc
  <!-- GEN:DELIVERABLE-COVERAGE --> the eighteen §16 deliverables -> covering file

Determinism
-----------
Identical inputs produce byte-identical output. No network, no third-party
dependencies, no wall-clock timestamp inside a generated region.

Checks (all enforced; see exit codes)
-------------------------------------
  S1  a requirement has no status entry                     -> fatal
  S2  a status entry has no requirement (or is duplicated)  -> fatal
  S3  a status value is not one of the five                 -> fatal
  S4  a `deferred` entry has an empty note                  -> fatal
  S5  a marker pair is missing from the target              -> fatal
  C1  a requirement's `verification` id is not declared in  -> defect (recorded)
      docs/14 (uncovered), or is empty
  C2  a requirement names test T, but the docs/14 row that  -> defect (recorded)
      DECLARES T carries no `R-` back-reference naming the
      requirement (the mapping is one-directional: the test
      is declared, but it verifies a different subject)
  C3  a requirement has no phase                            -> defect (recorded)
  C4  a requirement has no owning document                  -> defect (recorded)
  C5  a `must` requirement is deferred                      -> defect (recorded)
  C6  a §16 deliverable's covering file does not exist      -> defect (recorded)
  C7  a `T-<AREA>-<nnn>` id is CITED anywhere in docs/*.md  -> defect (recorded)
      but docs/14 declares no definition row for it: a
      document names a test that does not exist. Reported
      with the id and the file(s) that cite it.

What "declared" means (C1 and C2 share this one definition)
----------------------------------------------------------
  A test id is *declared* by docs/14 only when it appears as the FIRST CELL of
  a catalogue row (`| T-CMP-001 | dp-optimality | unit | ... |`). A row that
  merely MENTIONS the id — an acceptance-mapping row (`| A-01 | Generate a
  story blueprint | via stub | T-IDE-001, T-IDE-002 |`), a phase-coverage row,
  or prose — does not declare it. C1 asks "is there a definition row for this
  id?"; C2 asks "does that definition row carry this requirement's `R-` id?".
  A set can be C1-clean and still fail C2: the id is declared, but the test
  that declares it is about a different subject. Both must be zero.

Exit codes
----------
  0  ok        all checks pass; no orphans and no gaps
  1  fatal     an S-check failed: NOTHING was written, because the document would
               be meaningless. (Also the exit code of --strict, which turns any
               defect into a fatal abort with no write.)
  2  defects   the document WAS written, but the set contains recorded defects
               (C1..C7). A C-defect is a property of the requirement set that the
               document exists to record (docs/14 §10.1: "an uncovered, unmarked
               requirement is a defect in docs/15"), so the generator records it
               and signals non-zero rather than refusing to produce the record.
               C1 and C2 are the two halves of requirement→test traceability:
               C1 non-zero means a named test is not declared, C2 non-zero means
               a declared test carries no `R-` back-reference, so the traceability
               is apparent rather than real. C7 is the third side of the same
               rule, one level out: a test id *cited by a document* (docs/12 §6,
               docs/16 §6, any docs/*.md) must also have a definition row in
               docs/14, or the citing document names a test that does not exist.
               Any one of C1, C2 or C7 alone is exit 2.

Why a C-defect writes and an S-defect does not
----------------------------------------------
An S-defect means the status store cannot be reconciled with the index at all, so
no correct table can be rendered — the run must not emit a misleading document.
A C-defect means the store is fine but the *set* is incomplete; the checklist's
entire job is to make that visible, so it is written and the run fails loudly with
exit 2. `--strict` collapses the two: any defect aborts with exit 1 and no write.

Usage
-----
  python3 tools/gen-checklist.py            # record defects, write, exit 2 if any
  python3 tools/gen-checklist.py --strict   # abort on any defect (exit 1, no write)
  python3 tools/gen-checklist.py --check    # validate + report only; never write
"""

from __future__ import annotations

import json
import os
import re
import sys

# --------------------------------------------------------------------------- #
# Constants — §17 phase text and the §16 deliverable map are frozen by the spec,
# so they are pinned here rather than read from a drifting source.
# --------------------------------------------------------------------------- #

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIREMENTS = os.path.join(ROOT, "spec", "requirements.json")
STATUS_STORE = os.path.join(ROOT, "spec", "checklist-status.json")
TEST_PLAN = os.path.join(ROOT, "docs", "14-test-plan.md")
TARGET = os.path.join(ROOT, "docs", "15-development-checklist.md")
DOCS_DIR = os.path.join(ROOT, "docs")

# Canonical AREA order (docs/00 §3.1, spec §1..§13).
AREAS: list[tuple[str, str]] = [
    ("VSN", "vision and foundational principles (spec §1)"),
    ("PUB", "publication types (spec §2)"),
    ("WIZ", "creation wizard and configuration (spec §3)"),
    ("IDE", "ideation and story blueprint (spec §4)"),
    ("GEN", "content generation and editorial (spec §5)"),
    ("CMP", "page composition (spec §6)"),
    ("DIG", "interactive HTML reader (spec §7)"),
    ("DSN", "design system (spec §8)"),
    ("PRT", "print production and booklets (spec §9)"),
    ("QAS", "quality assurance (spec §10)"),
    ("UXS", "studio workspace and UX (spec §11)"),
    ("ARC", "architecture, data, providers (spec §12)"),
    ("OPS", "operational requirements (spec §13 V1 ops, §15.5)"),
]

# The five statuses of spec §16 item 17, in lifecycle order.
STATUSES: list[str] = ["planned", "in_progress", "implemented", "validated", "deferred"]

# The nine §17 phases: number, name, §17 objective (verbatim), docs/13 section cite.
PHASES: list[tuple[int, str, str, str]] = [
    (1, "Content Foundation",
     "project configuration, story blueprints, manuscript editing, and basic content validation",
     "§3.1"),
    (2, "Structured Composition",
     "story beats, logical page boundaries, composition metadata, and basic page allocation",
     "§3.2"),
    (3, "Interactive HTML Reader",
     "a functioning responsive storybook with page transitions and navigation",
     "§3.3"),
    (4, "Page Composition Editor",
     "visual page navigation, page splitting, content redistribution, composition rules, locks, and revision tracking",
     "§3.4"),
    (5, "Shared Design System",
     "typography templates, page borders, decorative elements, and responsive styling",
     "§3.5"),
    (6, "Print Renderer",
     "deterministic page layout, print previews, border validation, and standard PDF generation",
     "§3.6"),
    (7, "Booklet Publishing",
     "booklet imposition, sheet previews, print instructions, and booklet PDF export",
     "§3.7"),
    (8, "Automated Quality Assurance",
     "robust overflow detection, composition validation, layout correction, and publication audits",
     "§3.8"),
    (9, "End-to-End Validation",
     "produce, approve, export, print, fold, and inspect the first complete reference storybook",
     "§3.9"),
]

# The eighteen §16 deliverables and the file that covers each (docs/00 §2).
DELIVERABLES: list[tuple[int, str, str]] = [
    (1, "Product requirements specification", "docs/01-product-requirements.md"),
    (2, "End-to-end workflow specification", "docs/02-workflow-specification.md"),
    (3, "Technical architecture", "docs/03-technical-architecture.md"),
    (4, "Project data schema", "docs/04-project-data-schema.md"),
    (5, "Story blueprint and content model", "docs/05-content-and-composition-model.md"),
    (6, "Story beat and composition model", "docs/05-content-and-composition-model.md"),
    (7, "Page Composition Editor interface design", "docs/06-composition-editor-ux.md"),
    (8, "Composition constraint and lock rules", "docs/07-lock-and-constraint-rules.md"),
    (9, "Responsive digital pagination strategy", "docs/08-pagination-strategy.md"),
    (10, "Fixed print pagination strategy", "docs/08-pagination-strategy.md"),
    (11, "Shared typography and design-token architecture", "docs/09-design-token-architecture.md"),
    (12, "Booklet imposition specification", "docs/10-booklet-imposition-spec.md"),
    (13, "Content and rendering validation strategy", "docs/11-validation-strategy.md"),
    (14, "Publication approval and versioning workflow", "docs/12-approval-and-versioning-workflow.md"),
    (15, "Incremental development roadmap", "docs/13-incremental-roadmap.md"),
    (16, "Automated test plan", "docs/14-test-plan.md"),
    (17, "Development checklist", "docs/15-development-checklist.md"),
    (18, "Initial reference-story acceptance tests", "docs/16-reference-story-acceptance-tests.md"),
]

MARKERS: list[str] = ["AREA-MATRICES", "PHASE-VIEW", "ORPHANS", "DELIVERABLE-COVERAGE"]

TEST_ID_RE = re.compile(r"\bT-[A-Z]{3}-\d{3}[a-z]?\b")
REQ_ID_RE = re.compile(r"^R-[A-Z]{3}-\d{3}$")
ANY_REQ_ID_RE = re.compile(r"\bR-[A-Z]{3}-\d{3}\b")


# --------------------------------------------------------------------------- #
# Load / extract
# --------------------------------------------------------------------------- #

def load_json(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def declared_definitions() -> dict[str, str]:
    """Map each T-<AREA>-<nnn> docs/14 *declares* -> the definition row itself.

    A definition row is a catalogue row whose FIRST CELL is the test id itself
    (`| T-CMP-001 | dp-optimality | unit | ... |`). A row that merely mentions a
    test id — an acceptance-mapping row (`| A-01 | ... | T-IDE-001 |`), a
    phase-coverage row, or prose — does NOT declare it. Keyed by first
    occurrence so a duplicated id is reported once from a stable row.
    """
    out: dict[str, str] = {}
    with open(TEST_PLAN, "r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip().startswith("|"):
                continue
            first = line.strip().strip("|").split("|", 1)[0].strip()
            if TEST_ID_RE.fullmatch(first) and first not in out:
                out[first] = line.rstrip("\n")
    return out


def declared_tests() -> set[str]:
    """The set of T-<AREA>-<nnn> ids docs/14 actually declares (definition rows)."""
    return set(declared_definitions())


def cited_test_ids() -> dict[str, list[str]]:
    """Map every T-<AREA>-<nnn> id *cited* in docs/*.md -> the citing file basenames.

    "Cited" is any occurrence of the id anywhere in any markdown document under
    docs/ (prose, an acceptance-mapping row, a phase-coverage row, or a definition
    row of docs/14 itself) — unlike C1/C2, this is a *mention*, not a definition.
    docs/15-development-checklist.md is included on the next run: because it is
    generated from the requirements' `verification` ids, it can only cite ids
    that are already declared, so it does not create offenders of its own.
    """
    out: dict[str, set[str]] = {}
    for name in sorted(os.listdir(DOCS_DIR)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(DOCS_DIR, name), "r", encoding="utf-8") as fh:
            text = fh.read()
        for m in TEST_ID_RE.finditer(text):
            out.setdefault(m.group(0), set()).add(name)
    return {tid: sorted(files) for tid, files in out.items()}


def find_undeclared_citations(definitions: dict[str, str]) -> dict[str, list[str]]:
    """C7: cited test ids with no definition row in docs/14 -> the citing files.

    A `T-` id a document cites must be declared by docs/14 (a row whose first cell
    is that id). This is the reverse of C1: C1 asks whether a requirement's named
    test exists; C7 asks whether a test a *document* names exists. An offender is
    a document that cites a test which does not exist.
    """
    cited = cited_test_ids()
    return {tid: files for tid, files in sorted(cited.items()) if tid not in definitions}


def find_unbackreferenced(reqs: list[dict],
                          definitions: dict[str, str]) -> list[tuple[str, str]]:
    """C2: (requirement id, test id) pairs whose mapping is one-directional.

    A pair is one-directional when the requirement names a test whose *definition
    row* carries no `R-` back-reference naming the requirement. A requirement
    whose id is not declared at all is a C1 defect and is NOT double-reported
    here.
    """
    out: list[tuple[str, str]] = []
    for r in reqs:
        ver = (r.get("verification") or "").strip()
        row = definitions.get(ver)
        if row is None:                       # C1's problem, not C2's
            continue
        if r["id"] not in ANY_REQ_ID_RE.findall(row):
            out.append((r["id"], ver))
    return out


# --------------------------------------------------------------------------- #
# Rendering helpers
# --------------------------------------------------------------------------- #

def esc(value: str) -> str:
    """Escape a value for a markdown table cell (pipe + newline)."""
    return (value or "").replace("|", "\\|").replace("\n", " ").strip()


def short(text: str, limit: int = 110) -> str:
    """Deterministically shorten requirement prose for a table cell."""
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    cut = text.rfind(" ", 0, limit)
    if cut <= 0:
        cut = limit
    return text[:cut].rstrip(",;: ") + " …"


def render_area_matrices(reqs: list[dict], status: dict[str, dict], tests: set[str]) -> str:
    lines: list[str] = []
    lines.append("_Generated by `tools/gen-checklist.py` from `spec/requirements.json`, "
                 "`spec/checklist-status.json` and `docs/14-test-plan.md`. Do not edit by hand._")
    lines.append("")
    lines.append("Legend: a `Verifying test` value marked **⚠ unmapped** is not declared by "
                 "`docs/14-test-plan.md`; it is recorded as an orphan in §5.")
    lines.append("")
    for area, title in AREAS:
        rows = [r for r in reqs if r["area"] == area]
        rows.sort(key=lambda r: int(r["id"].rsplit("-", 1)[1]))
        lines.append(f"#### {area} — {title}")
        lines.append("")
        lines.append("| ID | Requirement (short) | Spec cite | Priority | Phase | Verifying test | Status | Note |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for r in rows:
            ver = r.get("verification") or ""
            if ver and ver in tests:
                ver_cell = f"`{esc(ver)}`"
            elif ver:
                ver_cell = f"`{esc(ver)}` ⚠ unmapped"
            else:
                ver_cell = "— ⚠ unmapped"
            st = status.get(r["id"], {})
            note = esc(st.get("note", "")) or "—"
            lines.append(
                "| {id} | {text} | {cite} | {pri} | {phase} | {ver} | {status} | {note} |".format(
                    id=r["id"],
                    text=esc(short(r.get("text", ""))),
                    cite=esc(r.get("spec_cite", "")),
                    pri=esc(r.get("priority", "")),
                    phase=r.get("phase", "—"),
                    ver=ver_cell,
                    status=esc(st.get("status", "")),
                    note=note,
                )
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_phase_view(reqs: list[dict]) -> str:
    lines: list[str] = []
    lines.append("_Generated by `tools/gen-checklist.py`. Exit criteria are **owned by "
                 "`docs/13-incremental-roadmap.md`** and cited, not restated here (`docs/13` §3). "
                 "Every phase also passes the two gates of `docs/13` §5._")
    lines.append("")
    lines.append("| Phase | §17 objective (short) | Requirement ids closed by this phase | Count | Exit gate (owned by `docs/13`) |")
    lines.append("|---|---|---|---|---|")
    for num, name, objective, cite in PHASES:
        ids = sorted((r["id"] for r in reqs if r.get("phase") == num),
                     key=lambda x: (x.split("-")[1], int(x.rsplit("-", 1)[1])))
        ids_cell = ", ".join(ids) if ids else "—"
        lines.append(
            f"| **{num} — {name}** | {esc(objective)} | {ids_cell} | {len(ids)} | "
            f"`docs/13` {cite} (exit criteria); both gates `docs/13` §5 |"
        )
    total = sum(1 for r in reqs if r.get("phase"))
    lines.append("")
    lines.append(f"**{total} of {len(reqs)}** requirements carry a phase 1–9 "
                 "(a requirement is implemented where it first becomes buildable, `docs/01` §5).")
    return "\n".join(lines).rstrip() + "\n"


def find_orphans(reqs: list[dict], tests: set[str]) -> list[tuple[str, str, str]]:
    """Return (id, kind, detail) for every requirement failing an integrity check."""
    out: list[tuple[str, str, str]] = []
    for r in reqs:
        ver = (r.get("verification") or "").strip()
        if not ver:
            out.append((r["id"], "no test", "`verification` field is empty"))
        elif ver not in tests:
            out.append((r["id"], "no test",
                        f"`{ver}` is not declared by `docs/14-test-plan.md`"))
        if not r.get("phase"):
            out.append((r["id"], "no phase", "`phase` field is empty"))
        doc = (r.get("doc") or "").strip()
        if not doc:
            out.append((r["id"], "no owning document", "`doc` field is empty"))
        elif not os.path.exists(os.path.join(ROOT, doc)):
            out.append((r["id"], "no owning document", f"`{doc}` does not exist"))
    return out


def missing_deliverables() -> list[tuple[int, str, str]]:
    return [(n, name, path) for n, name, path in DELIVERABLES
            if not os.path.exists(os.path.join(ROOT, path))]


def render_orphans(reqs: list[dict], tests: set[str]) -> str:
    orphans = find_orphans(reqs, tests)
    missing = missing_deliverables()
    kinds = ["no test", "no phase", "no owning document"]
    counts = {k: sum(1 for _, kind, _ in orphans if kind == k) for k in kinds}

    lines: list[str] = []
    lines.append("_Generated by `tools/gen-checklist.py`. Every row is a defect in the set, "
                 "not a note (`docs/00` §3, `docs/14` §10.1)._")
    lines.append("")
    if not orphans:
        lines.append("**No orphan requirements.** Every requirement carries a phase, an owning "
                     "document and a `verification` id declared by `docs/14-test-plan.md`.")
    else:
        lines.append("**Orphan requirement counts by kind** "
                     f"(total {len(orphans)} rows over "
                     f"{len({o[0] for o in orphans})} distinct requirements): "
                     + " · ".join(f"{k} = {counts[k]}" for k in kinds) + ".")
        lines.append("")
        lines.append("| ID | Kind | Detail |")
        lines.append("|---|---|---|")
        order = {k: i for i, k in enumerate(kinds)}
        for rid, kind, detail in sorted(orphans, key=lambda o: (order[o[1]], o[0])):
            lines.append(f"| {rid} | {kind} | {esc(detail)} |")
    lines.append("")
    if missing:
        lines.append("**Set-level gap — §16 deliverables with no covering file** "
                     f"({len(missing)} of {len(DELIVERABLES)}):")
        lines.append("")
        lines.append("| §16 # | Deliverable | Expected file |")
        lines.append("|---|---|---|")
        for n, name, path in missing:
            lines.append(f"| {n} | {esc(name)} | `{esc(path)}` |")
    else:
        lines.append("**No deliverable gap.** All eighteen §16 deliverables have a covering file.")
    return "\n".join(lines).rstrip() + "\n"


def render_deliverable_coverage() -> str:
    lines: list[str] = []
    lines.append("_Generated by `tools/gen-checklist.py` from the §16 deliverable list, "
                 "cross-referencing `docs/00-README.md` §2. `Present` is the result of an "
                 "`os.path.exists` check at generation time._")
    lines.append("")
    lines.append("| §16 # | Deliverable (§16) | Covering file | Present |")
    lines.append("|---|---|---|---|")
    for n, name, path in DELIVERABLES:
        ok = "yes" if os.path.exists(os.path.join(ROOT, path)) else "**no**"
        lines.append(f"| {n} | {esc(name)} | `{esc(path)}` | {ok} |")
    return "\n".join(lines).rstrip() + "\n"


# --------------------------------------------------------------------------- #
# Marker splice + main
# --------------------------------------------------------------------------- #

def splice(text: str, name: str, body: str) -> str:
    open_m = f"<!-- GEN:{name} -->"
    close_m = f"<!-- /GEN:{name} -->"
    if text.count(open_m) != 1 or text.count(close_m) != 1:
        raise MissingMarker(name)
    start = text.index(open_m) + len(open_m)
    end = text.index(close_m)
    if end < start:
        raise MissingMarker(name)
    return text[:start] + "\n" + body.rstrip() + "\n" + text[end:]


class MissingMarker(Exception):
    pass


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    check_only = "--check" in argv

    reqs = load_json(REQUIREMENTS)
    store = load_json(STATUS_STORE)
    definitions = declared_definitions()
    tests = set(definitions)

    fatal: list[str] = []

    # --- store integrity (S-checks) --------------------------------------- #
    req_ids = [r["id"] for r in reqs]
    req_id_set = set(req_ids)
    if len(req_id_set) != len(req_ids):
        fatal.append("S1: spec/requirements.json contains duplicate requirement ids")

    seen: dict[str, str] = {}
    for entry in store:
        eid = entry.get("id")
        if eid in seen:
            fatal.append(f"S2: status entry `{eid}` appears more than once")
        seen[eid] = entry.get("status")

    store_ids = set(seen)
    for rid in sorted(req_id_set - store_ids):
        fatal.append(f"S1: requirement `{rid}` has no status entry in spec/checklist-status.json")
    for sid in sorted(store_ids - req_id_set):
        fatal.append(f"S2: status entry `{sid}` has no matching requirement")

    for entry in store:
        st = entry.get("status")
        if st not in STATUSES:
            fatal.append(f"S3: `{entry.get('id')}` has status `{st}`, not one of {STATUSES}")
        if st == "deferred" and not (entry.get("note") or "").strip():
            fatal.append(f"S4: `{entry.get('id')}` is `deferred` with an empty note "
                         "(a deferral must name its reason and the authorising spec §/D-nn)")

    # --- target markers (S5) ---------------------------------------------- #
    target_text = ""
    if os.path.exists(TARGET):
        with open(TARGET, "r", encoding="utf-8") as fh:
            target_text = fh.read()
        for name in MARKERS:
            if target_text.count(f"<!-- GEN:{name} -->") != 1 or \
               target_text.count(f"<!-- /GEN:{name} -->") != 1:
                fatal.append(f"S5: marker pair GEN:{name} is missing or duplicated in {TARGET}")
    else:
        fatal.append(f"S5: target {TARGET} does not exist")

    if fatal:
        _loud("FATAL — the checklist was NOT written (exit 1):", fatal)
        return 1

    # --- content defects (C-checks) --------------------------------------- #
    status_map = {e["id"]: e for e in store}
    orphans = find_orphans(reqs, tests)
    missing = missing_deliverables()
    uncovered = sorted({o[0] for o in orphans if o[1] == "no test"})
    unbacked = find_unbackreferenced(reqs, definitions)
    undeclared = find_undeclared_citations(definitions)

    defects: list[str] = []
    if uncovered:
        defects.append(f"C1: {len(uncovered)} requirement(s) name a `verification` id that "
                       "docs/14-test-plan.md does not declare (uncovered)")
    for rid, ver in unbacked:
        defects.append(f"C2: `{rid}` names `{ver}`, but the docs/14 row declaring `{ver}` "
                       f"carries no `{rid}` back-reference — the mapping is one-directional")
    for kind, label in (("no phase", "C3"), ("no owning document", "C4")):
        n = sum(1 for _, k, _ in orphans if k == kind)
        if n:
            defects.append(f"{label}: {n} requirement(s) have {kind}")

    priority = {r["id"]: r.get("priority") for r in reqs}
    deferred_must = sorted(e["id"] for e in store
                           if e.get("status") == "deferred" and priority.get(e["id"]) == "must")
    if deferred_must:
        defects.append("C5: a `must` requirement is `deferred` (docs/01 §8 forbids it): "
                       + ", ".join(deferred_must))
    if missing:
        defects.append(f"C6: {len(missing)} §16 deliverable(s) have no covering file: "
                       + ", ".join(f"D{n} -> {p}" for n, _, p in missing))
    for tid, files in undeclared.items():
        defects.append(f"C7: `{tid}` is cited by {', '.join(files)} but docs/14-test-plan.md "
                       "declares no definition row for it — a document names a test that does not exist")

    # --- render ----------------------------------------------------------- #
    bodies = {
        "AREA-MATRICES": render_area_matrices(reqs, status_map, tests),
        "PHASE-VIEW": render_phase_view(reqs),
        "ORPHANS": render_orphans(reqs, tests),
        "DELIVERABLE-COVERAGE": render_deliverable_coverage(),
    }

    if check_only:
        _summary(len(reqs), reqs, tests, status_map, orphans, missing, defects, unbacked, undeclared)
        if defects:
            print("\n".join(defects), file=sys.stderr)
        return 2 if defects else 0

    if defects and strict:
        _loud("FATAL (--strict) — the checklist was NOT written (exit 1):", defects)
        return 1

    new_text = target_text
    for name in MARKERS:
        new_text = splice(new_text, name, bodies[name])

    if new_text != target_text:
        with open(TARGET, "w", encoding="utf-8") as fh:
            fh.write(new_text)

    _summary(len(reqs), reqs, tests, status_map, orphans, missing, defects, unbacked, undeclared)
    if defects:
        print("\n".join(defects), file=sys.stderr)
        return 2
    return 0


def _summary(n_req, reqs, tests, status_map, orphans, missing, defects, unbacked, undeclared) -> None:
    status_counts: dict[str, int] = {s: 0 for s in STATUSES}
    for e in status_map.values():
        status_counts[e["status"]] = status_counts.get(e["status"], 0) + 1
    covered = sum(1 for r in reqs if (r.get("verification") or "") in tests)
    backed = covered - len(unbacked)
    kinds = ["no test", "no phase", "no owning document"]
    print(f"requirements:              {n_req}")
    print(f"covered by a declared test:{covered}")
    print(f"C1 uncovered requirements: {len(reqs) - covered}")
    print(f"C2 unback-referenced pairs:{len(unbacked)}")
    print(f"bidirectionally traced:    {backed}")
    print(f"C7 undeclared cited ids:   {len(undeclared)}")
    print("status counts:             " + ", ".join(f"{k}={status_counts[k]}" for k in STATUSES))
    print("orphan rows:               " + ", ".join(
        f"{k}={sum(1 for _, kk, _ in orphans if kk == k)}" for k in kinds))
    print(f"distinct orphan reqs:      {len({o[0] for o in orphans})}")
    print(f"missing §16 deliverables:  {len(missing)}")
    print(f"defects:                   {len(defects)}")


def _loud(headline: str, items: list[str]) -> None:
    print(headline, file=sys.stderr)
    for it in items:
        print("  - " + it, file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
