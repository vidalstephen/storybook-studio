# `fixtures/measure/` — the `measure_probe`

## What this is

`docs/05-content-and-composition-model.md` §1.6 item 6 defines the `measure_probe` as **one
fixed passage per (language, audience band), version-controlled in the repository and hashed
into the design revision as `measure_probe_hash`**, drawn from the WEB translation, with a
fixed recorded word count of **197 words**, against the reference page box (`96 mm` measure →
`362.8346 px_css` = `23221/64 q`).

`probe.en.early.txt` is that passage. **It did not exist before 2026-10-15.** The documents
named the file and derived the entire length model from a figure —
`round(197 ÷ 27, 1) = 7.296 → 7.3 words/line` — that no artefact in the repository produced.
That is the defect this file closes.

## Provenance

| | |
|---|---|
| Source | **World English Bible**, 1 Samuel 17:1–16 (public domain) |
| Fetched | 2026-10-15, `https://bible-api.com/1 Samuel 17:1-16?translation=web` |
| Words | **197** (the design's fixed `probe_words`; the passage is truncated at exactly 197) |
| Register | narrative WEB — the same translation and register the reference book's prose follows (Q-05, D-08) |
| Licence | public domain; no new licence obligations (the reason §1.6 item 6 chose WEB) |
| Built by | `app/tools/measure-book.ts` — re-derives this file from the source, so it is reproducible, not hand-typed |

## The measurement

Taken in pinned Chromium against the clean reference box (`app/src/measure.ts`, no padding,
margin or border — a container that applies any of those is `DESIGN_MEASURE_BOX_DIVERGENCE`),
**in the face the book ships** (`app/assets/fonts`, Lora):

```
probe words          197
probe line boxes      25
words / line         197 / 25 = 7.880000  →  round(_, 1) = 7.9

the documents claim    7.3      (197 / 27 = 7.296296)  — nothing produced the 27
a first correction     7.9      (197 / 25 = 7.880000)  — fragment rects, not line boxes
a second correction    8.6      (197 / 23 = 8.565217)  — right instrument, wrong face
the figure that stands 7.9      (197 / 25 = 7.880000)  — right instrument, right face
```

### Three wrong generations, and why each was wrong

1. **`7.3` (`197 / 27`) — nothing had measured the probe.** The file this README documents had
   never been created, so the `27` was produced by nothing in the repository.
2. **`7.9` (`197 / 25`) — the first correction, taken by the wrong instrument.** `Range.getClientRects()`
   returns one rect per line *fragment*, so a line containing an inline element yields several;
   counting them gave `25` rects. The rect count is not the line count.
3. **`8.6` (`197 / 23`) — the right instrument, run in the wrong face.** The line count *is* the
   element's height divided by the line pitch, exactly
   `round(quantise64(element.getBoundingClientRect().height) ÷ line_height_q)` — but the harness
   called `document.fonts.load('18px "Lora, \'Iowan Old Style\', Georgia, serif"')`, the **whole
   quoted stack**. That matches no face, so the promise resolved immediately, no webfont was
   fetched, and Chromium silently rendered a **fallback** while `document.fonts.check()` still
   answered "available". The `23` was the fallback's line count.

**The face is therefore asserted, not assumed.** A width comparison against a family that cannot
exist (`sbs-face-assertion-canary-does-not-exist`) decides which face rendered, because
`document.fonts.check()` reports an *unavailable* family as available and a `load()` of a whole
quoted stack loads nothing — neither can be trusted (`docs/08` §2.6.1). The measurement bridge and
the emitter read the **same** directory, `app/assets/fonts` (`docs/09` §6, §6.1a), which carries the
real **Lora** and **Cinzel** `woff2` subsets, both SIL OFL 1.1 and embedded as base64 in the book.

### Corroboration, independent of the probe

The reference book's own prose measures the same way:

```
manuscript prose       122 line boxes for 1008 words
words / line           1008 / 122 = 8.26
```

The manuscript's own prose measures 8.26 words/line against the probe's 7.88 — close, and far from
the documents' 7.3, which is ~14 % low for this register.

## What it changes

`words_per_line_measured` is an input to the whole length model, so the derived figures move:

| Quantity | Documents | Measured | Arithmetic |
|---|---|---|---|
| `words_per_line_measured` | 7.3 | **7.9** | `197 / 25 = 7.880000 → 7.9` |
| `words_per_page_measured` | 116.8 | **126.4** | `16 × 7.9` |
| `reserve_words` | 29.2 | **31.6** | `4 lines × 7.9` |
| `target_words` | 1022 | **1106** | `9 × 16 × 7.9 − 31.6 = 1137.6 − 31.6`, i.e. `140 balanced lines × 7.9` |
| lower band floor | 869 | **940** | `0.85 × 1106 = 940.1` |

**The `8.6` / `137.6` / `34.4` / `1204` / `1023` set was the third generation — the right
instrument in a fallback face — and is superseded here.** The `7.9` / `1106` set was also
generation 2's, which reached the same numbers by counting fragments; only this generation
measured in the book's own type, so only this one stands (`docs/05` §1.6 item 6 records all four).

**Why the documents were wrong, three times.** First because the probe they named had never been
created, so `7.3` was a number nothing had produced. Then because the first real measurement
counted fragment rects rather than line boxes. Then because the instrument was finally right and
the **font was not loaded**. `docs/09` §1.7 supplies the root cause of the last two: the model
divided a character count by an *assumed* advance instead of measuring one in the face that ships.

### And the budget is not the whole page — the line budget is split

The length model also never reserved lines for the beat's `role: "scripture"` displays, so the nine
story pages are not all available to prose (`docs/05` §1.6 item 7; `R-WIZ-017`, verified by `T-WIZ-018`):

```
lines on nine story pages        16 × 9 = 144
reserved: verses                  26
reserved: headings                 1
available for prose              117
  ⇒ effective prose budget      117 × 7.9 = 924 _words_   (not 1106)
```

That is why the reference book composes to **20 printed pages** rather than 16, and why a
`977`-word manuscript is still `14` lines over: reserving the non-prose lines shrinks the prose
budget by `27 × 7.9 = 213 _words_` against the total-line figure.

**`measure_probe_hash`**: `sha256:4d0bb74d435ea5a044b1817ce8ce8eef6b366fc82c7a089ae051390888f998d0` — the value `docs/05`
§1.6 item 6 requires the design revision to carry. Recorded here because before today there was no
file to hash; `T-WIZ-017` pins it together with the rendered-face assertion.
