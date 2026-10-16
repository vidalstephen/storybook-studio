#!/usr/bin/env python3
"""Reproducible check of the docs/10 §3 imposition arithmetic.

Generates the sheet grid from the formulas of
docs/10-booklet-imposition-spec.md §3.2 for the worked sizes and asserts the
four invariants of §3.4, plus §3.3's inverse mapping against the forward grid.
This is the script §3.6 refers to (the claim "a script was run" was previously
not reproducible because no such script was checked in).

  V1  the panels are exactly the multiset {1..M} -- no duplicate, no omission
  V2  every odd page lands on a right panel; every even page on a left panel
  V3  front_right(1) == 1 and front_left(1) == M  (page 1 is the cover recto)
  V4  for every even p in [2, M-2], p and p+1 are a facing pair: p on a left
      panel, p+1 on a right panel, on the same nesting sheet or on immediately
      adjacent sheets (never more than one sheet index apart)

Exit 0 only when every check passes.
"""
import sys

SIZES = (8, 12, 16)
EXPECTED_FLAT = {
    8: "8,1,2,7,6,3,4,5",
    12: "12,1,2,11,10,3,4,9,8,5,6,7",
    16: "16,1,2,15,14,3,4,13,12,5,6,11,10,7,8,9",
}


def grid(m):
    """docs/10 §3.2: sheet i (1-indexed, outermost first) -> four panel pages."""
    if m % 4:
        raise SystemExit(f"M={m} is not a multiple of 4")
    sheets = m // 4
    rows = []
    for i in range(1, sheets + 1):
        rows.append((i, "front", "L", m - 2 * (i - 1)))          # front_left
        rows.append((i, "front", "R", 2 * (i - 1) + 1))          # front_right
        rows.append((i, "back", "L", 2 * (i - 1) + 2))           # back_left
        rows.append((i, "back", "R", m - 2 * (i - 1) - 1))       # back_right
    return rows


def pos(m):
    """page -> (sheet, side, panel) via the forward grid."""
    return {p: (i, s, pan) for (i, s, pan, p) in grid(m)}


def inverse(m, p):
    """docs/10 §3.3 inverse mapping (page -> position), with the p<=M/2 guard."""
    q = p if p <= m / 2 else m - p + 1
    if q % 2 == 1:
        return ((q + 1) // 2, "front", "R" if p <= m / 2 else "L")
    return (q // 2, "back", "L" if p <= m / 2 else "R")


def flat_sequence(m):
    return ",".join(str(p) for (_i, _s, _pan, p) in grid(m))


def check_v1(m, rows):
    pages = sorted(p for (_i, _s, _pan, p) in rows)
    return pages == list(range(1, m + 1))


def check_v2(rows):
    for (_i, _s, pan, p) in rows:
        if p % 2 == 1 and pan != "R":
            return False
        if p % 2 == 0 and pan != "L":
            return False
    return True


def check_v3(m, rows):
    front1 = {pan: p for (i, s, pan, p) in rows if i == 1 and s == "front"}
    return front1.get("R") == 1 and front1.get("L") == m


def check_v4(m, rows):
    """Facing pairs: for even p, p on L and p+1 on R, on <=1 sheet apart."""
    where = {p: (i, s, pan) for (i, s, pan, p) in rows}
    for p in range(2, m - 1, 2):  # p even, p+1 <= M-1
        i_p, _s_p, pan_p = where[p]
        i_q, _s_q, pan_q = where[p + 1]
        if pan_p != "L" or pan_q != "R":
            return False
        if abs(i_p - i_q) > 1:
            return False
    return True


def check_inverse(m):
    """§3.3 inverse must agree with §3.2 forward for every page."""
    forward = pos(m)
    for p in range(1, m + 1):
        if inverse(m, p) != forward[p]:
            return False
    return True


def main():
    ok = True
    print(f"{'M':>3} {'S':>2} {'V1':>6} {'V2':>6} {'V3':>6} {'V4':>6} "
          f"{'inv':>6} {'flat seq':<40} {'matches §3.5':>12}")
    for m in SIZES:
        rows = grid(m)
        res = {
            "V1": check_v1(m, rows),
            "V2": check_v2(rows),
            "V3": check_v3(m, rows),
            "V4": check_v4(m, rows),
            "inv": check_inverse(m),
        }
        flat = flat_sequence(m)
        seq_ok = flat == EXPECTED_FLAT[m]
        ok = ok and all(res.values()) and seq_ok
        print(f"{m:>3} {m // 4:>2} "
              + " ".join(f"{('pass' if res[k] else 'FAIL'):>6}"
                         for k in ("V1", "V2", "V3", "V4"))
              + f" {('pass' if res['inv'] else 'FAIL'):>6} "
              + f"{flat:<40} {('pass' if seq_ok else 'FAIL'):>12}")

    print("\nV2 is the discriminating check: a mirrored back side "
          "(back_left = M-2(i-1)-1, back_right = 2(i-1)+2) still satisfies V1 "
          "and V3 and is caught by V2 alone.")
    mirrored = {8: True, 12: True, 16: True}
    for m in SIZES:
        bad = [(i, s, pan, p) for (i, s, pan, p) in grid(m)]
        # apply the mirror to the back side
        bad = [(i, s,
                pan,
                m - 2 * (i - 1) - 1 if (s == "back" and pan == "L") else
                (2 * (i - 1) + 2 if (s == "back" and pan == "R") else p))
               for (i, s, pan, p) in bad]
        mirrored[m] = not check_v2(bad) and check_v1(m, bad)
    print("mirrored back side: V1 still holds and V2 fails for all sizes -> "
          + str(mirrored))
    ok = ok and all(mirrored.values())

    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
