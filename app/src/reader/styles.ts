/**
 * The reader stylesheet.
 *
 * One rule governs this file: **every value is either a `--sb-*` custom property projected from
 * the design revision, or a chrome dimension the design does not speak to.** The page box, the
 * frame, the measure and the type all come from tokens (`docs/09` §3.1, §7.5); the toolbar's
 * height and the control colours do not exist in the token set because they are not page
 * geometry. Type is composed by a declared scale step and nothing else (§3.5, §5.6 L2).
 *
 * Non-negotiables encoded here:
 *   - no `overflow: hidden` on any prose container; a leaf that cannot hold its content scrolls
 *     instead of clipping (`§6.10`, `DIG_TEXT_CLIPPED`)
 *   - no fixed pixel height on prose, no `text-overflow: ellipsis` anywhere
 *   - the frame is drawn from ratios, so it scales with the page and stays inside the text edge
 *     at every viewport (`§7.5`), and a rule below 0.5 px is widened to 0.5 px, never dropped
 *   - the chrome is laid out in flow and the leaf is fitted into what is left, so a control can
 *     never overlap the frame or the text (`DIG_FRAME_CONTROL_COLLISION`, `DIG_TEXT_OVERLAP`)
 */

import { MOTION, SPREAD_MIN_HEIGHT_PX, SPREAD_MIN_WIDTH_PX, themeVariantCss } from "./design.js";

/** The chrome's own numbers. Stated once so the layout can subtract them from the viewport. */
export const CHROME = {
  bar_px: 46,
  /** Touch targets: 44 px is the documented minimum; nothing here is smaller. */
  target_px: 44,
  gap_px: 8,
  /** The stage's own breathing room around the leaf, at its narrowest. */
  pad_narrow_px: 6,
  pad_wide_px: 20,
} as const;

export interface CssOptions {
  /** The `:root` block, already projected from the design revision. */
  readonly vars: string;
}

export function readerCss(o: CssOptions): string {
  return `/* =====================================================================================
   Storybook Studio — the interactive reader.  Generated; do not edit.
   Page geometry, the double-rule frame and the type scale are projected from the design
   revision (docs/09 §3.1, §7.5). The reader composes values; it derives none (§3.3).
   ===================================================================================== */
:root {
${o.vars}
  /* --- the reader's composition state (L2/L1). These are the only knobs §7.3 grants. --- */
  --sb-scale-step: 1;
  --sb-spread: 0;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  /* The chrome sits on the warm paper, so the surround is the paper darkened, not black. */
  background: var(--sb-colour-chrome-bg);
  color: var(--sb-colour-ink-body);
  font-family: var(--sb-type-body-family);
  -webkit-text-size-adjust: 100%;
}

body { overflow: hidden; }

/* --- the root shell ------------------------------------------------------------------- */

.sb-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: var(--sb-type-body-family);
}

.sb-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: ${CHROME.gap_px}px;
  min-height: ${CHROME.bar_px}px;
  padding: 2px max(6px, env(safe-area-inset-left)) 2px max(6px, env(safe-area-inset-right));
  background: var(--sb-colour-chrome-bg);
  color: var(--sb-colour-ink-body);
}
.sb-bar-top { border-bottom: 1px solid color-mix(in srgb, var(--sb-colour-rule) 45%, transparent); }
.sb-bar-bottom { border-top: 1px solid color-mix(in srgb, var(--sb-colour-rule) 45%, transparent); padding-bottom: max(2px, env(safe-area-inset-bottom)); }

.sb-root[data-sb-focus="1"] .sb-bar { display: none; }

.sb-title {
  font-family: var(--sb-type-heading-family);
  font-size: clamp(13px, 2.6vw, 15px);
  line-height: 1.2;
  font-weight: 600;
  white-space: nowrap;
  overflow: visible;
  flex: 1 1 auto;
  min-width: 0;
}
.sb-subtitle { font-size: 12px; opacity: 0.8; white-space: nowrap; }
/* The separator between the book's title and its subtitle. It is a text node, not a margin, so
   the two strings cannot run together when the header is read as text ("David and Goliath — A
   Story of Courage and Faith"), and it is hidden with the subtitle it separates on a phone. */
.sb-sep { font-size: 12px; opacity: 0.8; white-space: pre; }
.sb-spacer { flex: 1 1 auto; }

/* --- controls -------------------------------------------------------------------------- */

button, select, .sb-btn {
  font: inherit;
  font-size: 13px;
  min-height: ${CHROME.target_px}px;
  min-width: ${CHROME.target_px}px;
  padding: 0 10px;
  color: var(--sb-colour-ink-body);
  background: color-mix(in srgb, var(--sb-page-background-colour) 82%, var(--sb-colour-rule));
  border: 1px solid color-mix(in srgb, var(--sb-colour-rule) 65%, transparent);
  border-radius: 3px;
  cursor: pointer;
}
button:hover, select:hover { background: color-mix(in srgb, var(--sb-page-background-colour) 68%, var(--sb-colour-rule)); }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, select:focus-visible, [tabindex]:focus-visible {
  outline: 3px solid var(--sb-colour-focus);
  outline-offset: 2px;
}
.sb-btn-icon { font-size: 16px; padding: 0 8px; }
.sb-labelled { display: inline-flex; align-items: center; gap: 5px; }
.sb-status { font-size: 12px; white-space: nowrap; opacity: 0.9; }
.sb-hint { font-size: 12px; line-height: 1.4; opacity: .78; margin: 4px 0 0 0; }
.sb-status strong { font-weight: 600; }

/* --- progress ------------------------------------------------------------------------- */

.sb-progress { flex: 1 1 auto; min-width: 40px; height: 6px; background: color-mix(in srgb, var(--sb-colour-rule) 30%, transparent); border-radius: 3px; overflow: visible; }
.sb-progress-fill { display: block; height: 6px; width: 0%; background: var(--sb-colour-accent); border-radius: 3px; }

/* --- the stage: the leaf is fitted into what the chrome leaves over ------------------- */

.sb-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: ${CHROME.pad_narrow_px}px;
}
.sb-stage[data-sb-wide="1"] { padding: ${CHROME.pad_wide_px}px; }

.sb-pages { position: relative; display: flex; align-items: center; justify-content: center; gap: 0; }

/* A display page. In single mode it holds one leaf; in spread mode, two facing leaves. */
.sb-page { position: relative; display: none; align-items: stretch; justify-content: center; }
.sb-page[data-sb-current="1"] { display: flex; }

.sb-leaf {
  position: relative;
  flex: 0 0 auto;
  width: var(--sb-leaf-width);
  height: var(--sb-leaf-height);
  aspect-ratio: 139.7 / 215.9;
  background: var(--sb-page-background-colour);
  border-radius: 1px;
  box-shadow: 0 1px 2px rgba(0,0,0,.28), 0 10px 28px rgba(0,0,0,.18);
}
/* The gutter between two facing leaves is the design's own layout.gutter_mm projection. */
.sb-page[data-sb-mode="spread"] .sb-leaf + .sb-leaf {
  margin-left: calc(var(--sb-page-ratio-gutter) * var(--sb-leaf-width));
}

/* --- the perimeter frame: two rules, by ratio (docs/09 §7.5) ------------------------ */

.sb-frame { position: absolute; pointer-events: none; border-style: solid; border-color: var(--sb-colour-rule); }
.sb-frame-outer {
  inset: calc(var(--sb-page-ratio-border-offset) * var(--sb-leaf-width));
  border-width: max(0.5px, calc(var(--sb-page-ratio-border-outer-thickness) * var(--sb-leaf-width)));
}
.sb-frame-inner {
  inset: calc(var(--sb-page-ratio-border-band-to) * var(--sb-leaf-width));
  border-width: max(0.5px, calc(var(--sb-page-ratio-border-inner-thickness) * var(--sb-leaf-width)));
}
.sb-leaf[data-sb-frame="none"] .sb-frame { display: none; }
/* style: none is a legal approved specification (09 §7.2), and ribbon is not a V1 style. */
.sb-leaf[data-sb-frame="single_rule"] .sb-frame-inner { display: none; }

/* --- the content box ------------------------------------------------------------------- */

.sb-content {
  position: absolute;
  left: calc(var(--sb-page-ratio-inset-x) * var(--sb-leaf-width));
  right: calc(var(--sb-page-ratio-inset-x) * var(--sb-leaf-width));
  top: calc(var(--sb-page-ratio-inset-y) * var(--sb-leaf-height));
  bottom: calc(var(--sb-page-ratio-inset-y) * var(--sb-leaf-height));
  /* NEVER overflow: hidden — a container that cannot hold its content scrolls (§6.10). */
  overflow: visible;
  overflow-wrap: break-word;
  font-size: calc(var(--sb-type-body-size-px-css) * var(--sb-scale-step));
  line-height: var(--sb-type-body-line-height);
  font-family: var(--sb-type-body-family);
  color: var(--sb-colour-ink-body);
  hyphens: auto;
  -webkit-hyphens: auto;
  text-align: left;
  text-wrap: pretty;
}
/* Applied by the runtime only to a leaf whose single block is taller than the page. */
.sb-content[data-sb-scroll="1"] { overflow-y: auto; overscroll-behavior: contain; }

/* The measurement container (docs/08 §3.9's reflow needs one). It is position:fixed so it
   contributes no scrollable overflow to the document at any width, and visibility:hidden so it
   is never painted — while still being laid out, because a box that is not laid out has no line
   boxes and therefore no measurement. Same content box, same type scale: the measure the plan
   was taken against is the measure the reader reflows against. */
.sb-measure { position: fixed; left: 0; top: 0; height: 0; visibility: hidden; pointer-events: none; z-index: -1; }
.sb-measure .sb-content { position: static; height: auto; bottom: auto; right: auto; width: 100%; }

/* --- the type hierarchy: display 31.5 / heading 22.5 / body 13.5 pt -------------------- */

.sb-h {
  font-family: var(--sb-type-heading-family);
  font-size: calc(var(--sb-type-heading-size-px-css) * var(--sb-scale-step));
  line-height: var(--sb-type-heading-line-height);
  font-weight: 600;
  margin: 0 0 0.5em 0;
  /* Never hyphenate a heading (09 §5.4: a hyphen in a 30 px title is a visible defect). */
  hyphens: none;
  -webkit-hyphens: none;
  text-wrap: balance;
}
.sb-display {
  font-family: var(--sb-type-display-family);
  font-size: calc(var(--sb-type-display-size-px-css) * var(--sb-scale-step));
  line-height: 1.15;
  letter-spacing: 0.04em;
  font-weight: 500;
  margin: 0 0 0.4em 0;
  hyphens: none;
  -webkit-hyphens: none;
  text-wrap: balance;
}
.sb-p { margin: 0 0 0.62em 0; }
/* No block may be wider than the box it is set in, at any scale. A centred block in a centred
   template is sized by its content, and at a large scale step a long line is a few pixels wider
   than the measure — which is text outside its own page box, however small the overhang. The
   cap makes the wrap the thing that gives, never the margin. It carries no metric of its own:
   the margins stay the ones each role declares. */
.sb-blocks > * { max-width: 100%; }
.sb-blocks > *:last-child { margin-bottom: 0; }
.sb-role-question { padding-left: 1.5em; position: relative; }
.sb-role-question::before {
  content: "";
  position: absolute;
  left: 0.35em; top: 0.72em;
  width: 0.5em; height: 0.5em;
  border: 1px solid var(--sb-colour-accent);
  border-radius: 50%;
}
/* A note (a subtitle, a copyright line, a contents list, the back-matter notes) is set in the
   softer ink, smaller. It carries **no rule**: docs/09 §2.2 puts a divider in rule.section_divider
   and nothing else, so a bar beside a note is a rule the design revision does not own — and on
   the title page it drew a 2 px upright to the left of a *centred* subtitle, aligned with
   nothing. A note is distinguished by its ink and its size, which is what the tokens carry. */
.sb-role-note {
  font-size: 0.92em;
  color: var(--sb-colour-ink-soft);
}
.sb-role-quote, .sb-role-scripture {
  margin: 0 0 0.8em 0;
  padding: 0;
  border: 0;
  font-size: 1em;
}
.sb-role-scripture { font-style: italic; }
.sb-ref {
  display: block;
  margin-top: 0.5em;
  font-size: 0.82em;
  font-style: normal;
  letter-spacing: 0.06em;
  color: var(--sb-colour-accent);
  hyphens: none;
}
.sb-role-heading { page-break-after: avoid; }

/* The matter pages are single-purpose: they centre their short block, and the title page is
   the book's face. No invented prose is added — only the composition's own blocks.
   align-items: stretch is deliberate: the *text* is centred, the block still fills the measure,
   so a long line wraps inside the box instead of stretching it (the max-width above is the belt to
   this brace, and the two together are what keeps a large scale step inside the page). */
.sb-leaf[data-sb-template="title_page"] .sb-content,
.sb-leaf[data-sb-template="closing_page"] .sb-content {
  display: flex; flex-direction: column; justify-content: center; align-items: stretch; text-align: center;
}
.sb-leaf[data-sb-template="opening_page"] .sb-content { display: flex; flex-direction: column; justify-content: flex-start; }
/* The composed centre spread: the reveal lands on the turn, so the recto before it ends a page
   and the verso after it begins one. The template drives a deeper top gap on the reveal. */
.sb-leaf[data-sb-template="dramatic_reveal"] .sb-content { display: flex; flex-direction: column; justify-content: center; }
.sb-leaf[data-sb-template="quotation_page"] .sb-content { display: flex; flex-direction: column; justify-content: center; }
.sb-leaf[data-sb-template="blank_page"] .sb-blocks:empty::after { content: ""; }

/* --- the folio ------------------------------------------------------------------------ */

.sb-folio {
  position: absolute;
  bottom: calc(var(--sb-page-ratio-border-offset) * var(--sb-leaf-width) * 0.55);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--sb-colour-ink-body) 62%, var(--sb-page-background-colour));
  pointer-events: none;
}
.sb-leaf[data-sb-side="verso"] .sb-folio { left: 0; right: calc(var(--sb-page-ratio-inset-x) * var(--sb-leaf-width)); text-align: left; padding-left: calc(var(--sb-page-ratio-inset-x) * var(--sb-leaf-width) * 0.5); }
.sb-leaf[data-sb-side="recto"] .sb-folio { right: 0; left: calc(var(--sb-page-ratio-inset-x) * var(--sb-leaf-width)); text-align: right; padding-right: calc(var(--sb-page-ratio-inset-x) * var(--sb-leaf-width) * 0.5); }
.sb-root[data-sb-folio="0"] .sb-folio { display: none; }

/* --- tap zones (§7.3 tap / click navigation) ----------------------------------------- */
/* Presentational only: they are not focusable and carry no label, so a screen reader or a
   keyboard user reaches the real, labelled buttons in the bars and never a duplicate tab stop. */
.sb-zone {
  position: absolute;
  top: 0; bottom: 0;
  width: 22%;
  z-index: 2;
  cursor: pointer;
  border: 0;
  padding: 0;
  background: transparent;
  color: transparent;
  font-size: 0;
}
.sb-zone-prev { left: 0; }
.sb-zone-next { right: 0; }
.sb-zone[disabled] { cursor: default; }

/* --- page-turn animation (§7.2). Never required for navigation. -------------------- */
/*
 * A turn has to show *both* surfaces. A page that is on its way out is 'display: none' the
 * instant the state moves — which is what made every style below a dissolve: only the arriving
 * page was ever on screen, so nothing turned. Two things fix that, and they are the whole of this
 * block:
 *
 *   1. '.sb-anim-layer' keeps the leaving page laid out for the length of the transition, and the
 *      pages are stacked in one grid cell so they occupy the same place on the screen.
 *   2. the sheet **on top** is the one that turns — forward that is the page being left, which
 *      lifts and uncovers the page beneath it; backward it is the page being reached, swinging
 *      back in over the one already there. 'sb-anim-back' is the only difference between them.
 *
 * A leaf hinges at the spine, and the spine is always the leaf's own left edge: on a single page
 * that edge is the book's spine, in a spread it is the gutter. So the turning leaf is the last
 * leaf of the page on top, in both modes. The other leaf of a spread (never a lone leaf, hence
 * ':not(:last-child)') is what a turned leaf leaves behind, and it fades on its own clock.
 *
 * Everything is scoped to [data-sb-ready="1"]: with no script there is no page stacking, and the
 * book must still read as one continuous column (the noscript copy above says so).
 */
.sb-root[data-sb-ready="1"] .sb-pages { display: grid; grid-template: 1fr / 1fr; place-items: center; }
.sb-root[data-sb-ready="1"] .sb-page { grid-area: 1 / 1; }

.sb-anim-layer { display: flex; }
.sb-anim-out          { z-index: 3; }
.sb-anim-in           { z-index: 1; }
.sb-anim-out.sb-anim-back { z-index: 1; }
.sb-anim-in.sb-anim-back  { z-index: 3; }

.sb-anim-in .sb-leaf:last-child,
.sb-anim-out .sb-leaf:last-child { transform-origin: left center; backface-visibility: hidden; }

/* The other leaf of a spread (never a lone leaf, hence ':not(:last-child)') is what a turned leaf
   leaves behind. Which page carries it depends on the direction — forward it belongs to the page
   being left and fades out; backward it belongs to the page being reached and fades in with the
   leaf that covers it. Getting this backwards blanks a page for the length of the turn. */
.sb-anim-out:not(.sb-anim-back).sb-anim-curl .sb-leaf:first-child:not(:last-child),
.sb-anim-out:not(.sb-anim-back).sb-anim-fold .sb-leaf:first-child:not(:last-child) {
  animation: sb-verso-out calc(var(--sb-motion-duration-ms) * .45) linear both;
}
.sb-anim-in.sb-anim-back.sb-anim-curl .sb-leaf:first-child:not(:last-child),
.sb-anim-in.sb-anim-back.sb-anim-fold .sb-leaf:first-child:not(:last-child) {
  /* No delay: this leaf is the page being reached, and a page that waits half a turn to appear
     leaves the page being left sitting there on its own for that half — which reads as a fault,
     not as a turn. It comes in as the leaf that covers it comes across. */
  animation: sb-verso-in calc(var(--sb-motion-duration-ms) * .45) linear both;
}

/* slide — the sheet travels: the leaving sheet is on top, so the next is uncovered behind it. */
.sb-page.sb-anim-slide.sb-anim-out { animation: sb-slide-out var(--sb-motion-duration-ms) var(--sb-motion-easing) both; }
.sb-page.sb-anim-slide.sb-anim-in  { animation: sb-slide-in  var(--sb-motion-duration-ms) var(--sb-motion-easing) both; }
.sb-page.sb-anim-slide.sb-anim-out.sb-anim-back { animation-name: sb-slide-out-back; }
.sb-page.sb-anim-slide.sb-anim-in.sb-anim-back  { animation-name: sb-slide-in-back; }
/* fade — no travel at all: the sheet on top dissolves and hands the page to the one beneath. */
.sb-page.sb-anim-fade.sb-anim-out { animation: sb-fade-out var(--sb-motion-duration-ms) ease-in both; }
.sb-page.sb-anim-fade.sb-anim-in  { animation: sb-fade-in  var(--sb-motion-duration-ms) ease-out both; }
/* curl — the leaf lifts at the spine and is gone before it would have to show its back. */
.sb-anim-curl.sb-anim-out .sb-leaf:last-child { animation: sb-curl-out var(--sb-motion-duration-ms) var(--sb-motion-easing) both; }
.sb-anim-curl.sb-anim-in  .sb-leaf:last-child { animation: sb-curl-in  var(--sb-motion-duration-ms) var(--sb-motion-easing) both; }
/* fold — the leaf turns over on the gutter. Past ninety degrees there is nothing to show but the
   back of the paper, which is not written here: the leaf hides its own backface, so the turn is
   finished for the eye by the time it is finished for the geometry. */
.sb-anim-fold.sb-anim-out .sb-leaf:last-child { animation: sb-fold-out var(--sb-motion-duration-ms) var(--sb-motion-easing) both; }
.sb-anim-fold.sb-anim-in  .sb-leaf:last-child { animation: sb-fold-in  var(--sb-motion-duration-ms) var(--sb-motion-easing) both; }

/* The shade is a child of the leaf that turns, so the light crosses the paper rather than the
   screen, and it is oriented away from the hinge. */
.sb-shade {
  position: absolute; inset: 0; z-index: 4; pointer-events: none; opacity: 0;
  background: linear-gradient(to right, rgba(58,46,31,.34), rgba(58,46,31,0) 62%);
  animation: sb-shade var(--sb-motion-duration-ms) var(--sb-motion-easing) both;
}
.sb-page { perspective: 1600px; }

@keyframes sb-slide-out      { from { transform: none; opacity: 1; } to { transform: translateX(-18%); opacity: 0; } }
@keyframes sb-slide-out-back { from { transform: none; opacity: 1; } to { transform: translateX(18%);  opacity: 0; } }
@keyframes sb-slide-in       { from { transform: translateX(9%);  opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sb-slide-in-back  { from { transform: translateX(-9%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sb-fade-out       { from { opacity: 1; } to { opacity: 0; } }
@keyframes sb-fade-in        { from { opacity: 0; } to { opacity: 1; } }
@keyframes sb-verso-out      { from { opacity: 1; } to { opacity: 0; } }
@keyframes sb-verso-in       { from { opacity: 0; } to { opacity: 1; } }
@keyframes sb-curl-out       { 0% { transform: rotateY(0deg); opacity: 1; } 70% { transform: rotateY(-${MOTION.curl_deg}deg); opacity: 1; } 100% { transform: rotateY(-${(MOTION.curl_deg + 6).toFixed(0)}deg); opacity: 0; } }
@keyframes sb-curl-in        { 0% { transform: rotateY(-${(MOTION.curl_deg + 6).toFixed(0)}deg); opacity: 0; } 30% { transform: rotateY(-${MOTION.curl_deg}deg); opacity: 1; } 100% { transform: rotateY(0deg); opacity: 1; } }
@keyframes sb-fold-out       { 0% { transform: rotateY(0deg); } 58% { transform: rotateY(-${MOTION.fold_deg}deg); } 100% { transform: rotateY(-${MOTION.fold_deg}deg); } }
@keyframes sb-fold-in        { 0% { transform: rotateY(-${MOTION.fold_deg}deg); } 58% { transform: rotateY(0deg); } 100% { transform: rotateY(0deg); } }
@keyframes sb-shade          { from { opacity: .9; } to { opacity: 0; } }

/* §7.2 and 16 §5.1: with reduced motion set, animation is off and navigation still works.
   Both the media query and the attribute are honoured, so a runtime change and a first paint
   agree, and neither depends on the script having run. */
@media (prefers-reduced-motion: reduce) {
  .sb-anim-in, .sb-anim-out, .sb-shade { animation: none !important; transition: none !important; }
}
.sb-root[data-sb-motion="instant"] .sb-anim-in,
.sb-root[data-sb-motion="instant"] .sb-anim-out,
.sb-root[data-sb-motion="instant"] .sb-shade { animation: none !important; }
.sb-root[data-sb-motion="instant"] .sb-page { perspective: none; }

/* --- the table of contents ------------------------------------------------------------ */

dialog.sb-toc {
  border: 0;
  padding: 0;
  max-width: min(560px, calc(100vw - 16px));
  max-height: calc(100vh - 24px);
  width: 100%;
  background: var(--sb-page-background-colour);
  color: var(--sb-colour-ink-body);
  border-radius: 4px;
  box-shadow: 0 20px 60px rgba(0,0,0,.35);
  overflow: visible;
}
dialog.sb-toc::backdrop { background: rgba(23,21,18,.55); }
.sb-toc-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--sb-colour-rule) 45%, transparent);
}
.sb-toc-title { font-family: var(--sb-type-heading-family); font-size: 18px; margin: 0; flex: 1 1 auto; }
.sb-toc-body { padding: 6px 4px 12px 4px; max-height: calc(100vh - 140px); overflow-y: auto; }
.sb-toc-group { margin: 4px 0 8px 0; }
.sb-toc-group > h3 {
  font-family: var(--sb-type-heading-family);
  font-size: 13px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--sb-colour-accent); margin: 10px 12px 4px 12px;
}
.sb-toc-list { list-style: none; margin: 0; padding: 0; }
.sb-toc-list li { margin: 0; }
.sb-toc-item {
  display: flex; align-items: baseline; gap: 8px;
  width: 100%;
  min-height: ${CHROME.target_px}px;
  padding: 6px 12px;
  text-align: left;
  background: transparent;
  border: 0; border-radius: 0;
  font-size: 15px;
}
.sb-toc-item:hover { background: color-mix(in srgb, var(--sb-colour-rule) 18%, transparent); }
.sb-toc-item[aria-current="true"] { background: color-mix(in srgb, var(--sb-colour-accent) 16%, transparent); font-weight: 600; }
.sb-toc-label { flex: 1 1 auto; }
.sb-toc-note { font-size: 12px; opacity: .78; }
.sb-toc-folio { font-size: 12px; min-width: 3.5em; text-align: right; color: var(--sb-colour-accent); }
.sb-turn-mark { color: var(--sb-colour-accent); font-size: 12px; }
/* --- matter the printed plan drops on purpose, kept in the contents view (08 §4.5) --- */
/* No clipping and no fixed height here either: the section is prose, and prose is never cut. */
.sb-toc-omitted {
  margin: 10px 12px 4px 12px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--sb-colour-rule) 45%, transparent);
}
.sb-toc-omitted-head {
  font-family: var(--sb-type-heading-family);
  font-size: 13px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--sb-colour-accent); margin: 0 0 4px 0;
}
.sb-toc-omitted-reason { font-size: 12px; line-height: 1.5; opacity: .85; margin: 0 0 6px 0; overflow-wrap: anywhere; }
.sb-omitted-text { overflow-wrap: anywhere; }
.sb-toc-foot {
  border-top: 1px solid color-mix(in srgb, var(--sb-colour-rule) 45%, transparent);
  padding: 8px 12px; font-size: 12px; opacity: .85;
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
}

/* --- disclosures: the reader says what it could not reproduce (§6.10, D-06) -------- */

.sb-disclose { font-size: 12px; margin: 0; }
.sb-disclose > summary { min-height: 32px; display: list-item; padding: 4px 12px; cursor: pointer; }
.sb-disclose-list { margin: 4px 12px 12px 12px; padding-left: 18px; max-height: 40vh; overflow-y: auto; }
.sb-disclose-list li { margin: 0 0 8px 0; line-height: 1.45; }
.sb-sev-critical { border-left: 3px solid #8a2b2b; padding-left: 8px; }
.sb-sev-major { border-left: 3px solid var(--sb-colour-accent); padding-left: 8px; }
.sb-sev-info { border-left: 3px solid color-mix(in srgb, var(--sb-colour-rule) 60%, transparent); padding-left: 8px; }
.sb-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; opacity: .9; }
.sb-empty { padding: 8px 12px; }

/* --- the toast: resume, and anything transient ---------------------------------------- */

.sb-toast {
  position: absolute;
  left: 50%; bottom: 12px; transform: translateX(-50%);
  z-index: 6;
  display: none;
  align-items: center; gap: 10px;
  max-width: min(520px, calc(100vw - 24px));
  padding: 8px 12px;
  font-size: 13px;
  background: color-mix(in srgb, var(--sb-page-background-colour) 92%, var(--sb-colour-ink-body));
  color: var(--sb-colour-ink-body);
  border: 1px solid color-mix(in srgb, var(--sb-colour-rule) 60%, transparent);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,.25);
}
.sb-toast[data-sb-show="1"] { display: flex; }
.sb-toast button { min-height: 32px; font-size: 12px; }

/* --- the no-script fallback and the reader-only notices -------------------------------- */

.sb-sr {
  position: absolute !important;
  width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: visible; clip-path: inset(50%); white-space: nowrap; border: 0;
}
.sb-noscript {
  margin: 0; padding: 12px 16px;
  background: var(--sb-page-background-colour); color: var(--sb-colour-ink-body);
  border-bottom: 1px solid color-mix(in srgb, var(--sb-colour-rule) 45%, transparent);
  font-size: 14px;
}
.sb-skip {
  position: absolute; left: 8px; top: -60px; z-index: 9;
  background: var(--sb-page-background-colour); color: var(--sb-colour-ink-body);
  padding: 8px 12px; border-radius: 3px; border: 1px solid var(--sb-colour-rule);
}
.sb-skip:focus { top: 8px; }

/* --- if the script never runs, the book is still readable: one column, in order ------ */
.sb-root[data-sb-ready="0"] { position: static; }
.sb-root[data-sb-ready="0"] body { overflow: auto; }
/* Without the script there are no display pages, so a "Page 1 of 1" in the bar would be a
   number that describes nothing. The status says what the mode actually is instead. */
.sb-root[data-sb-ready="0"] #sb-folio:empty::after { content: "One column, in reading order"; }
.sb-root[data-sb-ready="0"] .sb-stage { display: block; padding: 0; }
.sb-root[data-sb-ready="0"] .sb-page { display: block; margin: 0 auto 14px auto; }
.sb-root[data-sb-ready="0"] .sb-pages { display: block; }
.sb-root[data-sb-ready="0"] .sb-leaf { width: min(100%, 528px); height: auto; aspect-ratio: 139.7 / 215.9; position: relative; margin: 0 auto; }
.sb-root[data-sb-ready="0"] .sb-content { position: static; padding: calc(var(--sb-page-ratio-inset-y) * 20vw) calc(var(--sb-page-ratio-inset-x) * 20vw); }
.sb-root[data-sb-ready="0"] .sb-frame { display: none; }
.sb-root[data-sb-ready="0"] .sb-zone { display: none; }

/* --- print: the reader's pages, without the chrome ------------------------------------ */
@media print {
  .sb-bar, .sb-zone, .sb-toast, .sb-noscript, .sb-skip { display: none !important; }
  .sb-root, .sb-stage { position: static; display: block; padding: 0; }
  .sb-page { display: block !important; break-after: page; }
  .sb-leaf { box-shadow: none; margin: 0 auto; }
  body { overflow: visible; }
}

@media (max-width: 639px) {
  /* On a phone the page should be the width of the phone. At this width the leaf is *width*-bound
     — the trim's proportion fixes its height from its width — so every pixel of stage padding is
     a fraction of a line of text, and the title bar carries no touch target and needs no 46 px.
     That is the difference between reproducing the plan's page count at 360 px and missing it by
     a page or two. Nothing about the page's geometry changes: the type size still does not scale
     with the box (09 §5.6), and the frame still clears the text by ratio (09 §7.5). */
  .sb-bar-top { min-height: 30px; }
  .sb-stage, .sb-stage[data-sb-wide="1"] { padding: 0; }
  /* The subtitle and its separator have no room in a 360 px bar next to the title and the page
     status: three nowrap runs and a progress bar do not fit, and the one that would be pushed
     off is the title. Nothing is lost — the subtitle is on the title page, which the reader
     shows — and the class is the one reader/markup.ts already writes on the span. */
  .sb-hide-narrow { display: none; }
}

/* --- wide viewports: the facing spread (docs/08 §3.2: >= ${SPREAD_MIN_WIDTH_PX} x ${SPREAD_MIN_HEIGHT_PX}) --- */
/* --- the settings sheet: everything §7.3 asks for that the bar has no room for --------- */

dialog.sb-sheet {
  border: 0; padding: 0; width: 100%;
  max-width: min(520px, calc(100vw - 16px));
  max-height: calc(100vh - 24px);
  background: var(--sb-page-background-colour);
  color: var(--sb-colour-ink-body);
  border-radius: 4px; box-shadow: 0 20px 60px rgba(0,0,0,.35);
  overflow: visible;
}
dialog.sb-sheet::backdrop { background: rgba(23,21,18,.55); }
.sb-field { margin: 0 0 14px 0; padding: 0 12px; }
.sb-field-label { display: block; font-family: var(--sb-type-heading-family); font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--sb-colour-accent); margin: 0 0 6px 0; }
.sb-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sb-field select { min-height: 44px; max-width: 100%; }
@media (min-width: 900px) {
  .sb-bar { padding-left: max(10px, env(safe-area-inset-left)); padding-right: max(10px, env(safe-area-inset-right)); }
  .sb-toc-item { font-size: 16px; }
  /* The chrome must not be what decides the page's size. At a viewport this wide the leaf can be
     the reference box exactly — 528 x 816 px_css — which is the box the plan's page boundaries were
     composed at, the box print and digital parity is stated at (09 §1.7, §7.4), and therefore the
     only box at which the composed pacing is reproduced line for line. A slimmer title bar (it
     carries no touch target) and no vertical padding is the difference between that and a page
     four per cent narrower than the one the author approved. */
  .sb-bar-top { min-height: 30px; }
  .sb-stage, .sb-stage[data-sb-wide="1"] { padding: 0 20px; }
}
${themeVariantCss()}
`;
}
