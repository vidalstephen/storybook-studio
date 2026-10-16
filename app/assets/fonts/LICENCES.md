# Fonts in this build

Two families, both under the **SIL Open Font License 1.1**, which permits embedding and
redistribution in a document (the OFL's own FAQ covers web/print embedding; the licence
requires the font not be sold on its own and that the copyright notice be preserved — both
met here, since they are embedded in a book, not distributed as fonts).

| File | Family | Upstream | Licence | Fetched |
|---|---|---|---|---|
| `Lora-400.woff2` | Lora (regular, upright) | Google Fonts — Cyreal | OFL-1.1 | 2026-10-15, latin subset |
| `Cinzel-400.woff2` | Cinzel (regular) | Google Fonts — Natanael Gama | OFL-1.1 | 2026-10-15, latin subset |

## Why they live here and not in a CDN link

1. **The book must work offline and from `file://`** — it is one self-contained HTML file with
   zero network requests at read time. A CDN `@font-face` would break that, and would also mean
   the book renders differently depending on whether the reader is online.
2. **The measurement and the book must use the same face.** `app/src/measure.ts` (the pinned
   Chromium bridge) and `app/src/render-html.ts` (the emitter) both read *this directory*. If they
   read different sources, the measured line breaks cannot match the shipped ones — which is
   exactly how the length model came to be derived twice from a typeface the product never used.
3. **This is the single source of truth for the face.** A token family (`Lora`, `Cinzel`) is
   resolved by filename here; a family with no file falls back through the declared stack, and the
   build discloses that rather than pretending.

## The rule this directory exists to enforce

> A measurement must **assert the face it rendered in**. `document.fonts.check("18px Lora")`
> answers *available* for a family that is not installed, and `document.fonts.load()` given a whole
> quoted font stack (`"Lora, 'Iowan Old Style', Georgia, serif"`) resolves immediately **without
> loading anything**. Both were true in this build, and the result was a length model measured in a
> fallback face while every log line said the font was present.

The bridge now loads the first family of the stack explicitly and asserts the rendered face by
comparing widths against a family that cannot exist (`tools/which-face.ts` prints the evidence).
