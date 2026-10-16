#!/usr/bin/env python3
"""Independent requirement<->test traceability check (C1/C2).

Written against the raw files rather than reusing the generator's parser, so it
can falsify the generator's clean run rather than echo it.

  C1  a requirement names a T- id that docs/14 declares nowhere
  C2  the row whose FIRST CELL is that test id does not cite the requirement back

Exit 0 only when both are zero.
"""
import collections, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
reqs = json.loads((ROOT / "spec" / "requirements.json").read_text())
lines = (ROOT / "docs" / "14-test-plan.md").read_text().splitlines()

definition, mentioned = {}, set()
for line in lines:
    s = line.strip()
    if not s.startswith("|"):
        continue
    cells = [c.strip() for c in s.strip("|").split("|")]
    ids = re.findall(r"\bT-[A-Z]{3}-\d{3}[a-z]?\b", s)
    mentioned.update(ids)
    if cells and (m := re.fullmatch(r"T-[A-Z]{3}-\d{3}", cells[0])):
        definition.setdefault(m.group(0), set()).update(re.findall(r"\bR-[A-Z]{3}-\d{3}\b", s))

# C7: every test id cited ANYWHERE in docs/ must have a definition row
cited_anywhere = collections.defaultdict(set)
for p in sorted((ROOT / "docs").glob("*.md")):
    if p.name.startswith("14-"):
        continue
    for t in set(re.findall(r"\bT-[A-Z]{3}-\d{3}[a-z]?\b", p.read_text())):
        cited_anywhere[t].add(p.name[:2])
c7 = {t: sorted(f) for t, f in cited_anywhere.items() if t not in definition}

c1 = [r for r in reqs if r["verification"] not in mentioned]
c2 = [r for r in reqs if r["verification"] in mentioned
      and r["id"] not in definition.get(r["verification"], set())]

print(f"requirements: {len(reqs)}   declared test ids: {len(mentioned)}   test definition rows: {len(definition)}")
print(f"C1 (named test not declared)                    : {len(c1)}")
print(f"C2 (definition row does not cite the requirement): {len(c2)}")
real = len(reqs) - len(c1) - len(c2)
print(f"bidirectionally traced requirements              : {real} / {len(reqs)}")
print(f"C7 (cited in docs but no definition row)      : {len(c7)}")
for t, files in sorted(c7.items()):
    print(f"  {t:<14} cited by: {', '.join(files)}")
if c2:
    print("\nsample C2 (requirement -> test):")
    for r in c2[:8]:
        print(f"  {r['id']:<14} -> {r['verification']}")
sys.exit(0 if not (c1 or c2 or c7) else 1)
