/**
 * The reader runtime — **this file is the artifact's script.**
 *
 * The emitter reads this file, strips the types with esbuild (`keepNames: false`, so no helper
 * is injected), and inlines the result into the artifact between `(function () {` and `})()`.
 * So the JavaScript a reader runs is this source, compiled once, with nothing between it and
 * the page: there is no second copy of the reader to drift from this one.
 *
 * It has no imports and no dependencies. Everything it knows arrives in `#sb-config`, a JSON
 * block the emitter writes out of `Book` + `Composition` + the design revision.
 *
 * What it implements, and where the requirement comes from:
 *
 *   §7.1  fullscreen reading; one page at a time on a narrow viewport, two facing pages when
 *         space allows; never a spread that compromises readability; survives rotation
 *   §7.2  five transitions, switchable at runtime, never required for navigation, reduced motion
 *         honoured — and honoured even if this script fails, by the stylesheet's media query
 *   §7.3  prev/next, tap and click, tap zones, swipe, keyboard, fullscreen, progress, optional
 *         page numbers, the 4+3 matter TOC, font size from the effective scale ladder, theme,
 *         resume, jump to first/last, and navigation that is accessible, not merely clickable
 *   §7.4  docs/08 §3.9's ReaderReflow contract: the plan's essential breaks are fixed page starts
 *         the reader may never move; between them it may merge or split; it never reorders,
 *         alters or drops text; it never re-plans the book and never writes anything back
 *   §6.10 reflow, never clip: a block taller than the leaf takes the leaf to itself and the leaf
 *         scrolls, with that page named in the disclosures
 *
 * `"use strict";` is the first statement so that it survives into the compiled function body.
 */
"use strict";
"use strict";

/**
 * `__name` is the helper a TypeScript-to-JavaScript bundler may inject when it preserves
 * function names. The emitter ships this function's *source*, and a per-file helper cannot
 * come with it, so the artifact defines one. It only sets a function's `name` property, so it
 * cannot change behaviour; where no helper was injected this line is dead code. Declaring it
 * inside the function also means the artifact never depends on how the emitter was run.
 */
var __name = function (target: unknown, value: string) {
  try {
    Object.defineProperty(target as object, "name", { value: value, configurable: true });
  } catch (e) { /* a non-configurable name is not worth failing a page turn over */ }
  return target;
};

var cfg = JSON.parse(document.getElementById("sb-config").textContent || "{}");
var root = document.getElementById("sb-root");
var pagesEl = document.getElementById("sb-pages");
var stageEl = document.getElementById("sb-stage");
var measureEl = document.getElementById("sb-measure");
var measureBlocks = document.getElementById("sb-measure-blocks");
var liveEl = document.getElementById("sb-live");
var folioEl = document.getElementById("sb-folio");
var progressFill = document.getElementById("sb-progress-fill");
var progressEl = document.getElementById("sb-progress");
var prevBtn = document.getElementById("sb-prev");
var nextBtn = document.getElementById("sb-next");
var firstBtn = document.getElementById("sb-first");
var lastBtn = document.getElementById("sb-last");
var zonePrev = document.getElementById("sb-zone-prev");
var zoneNext = document.getElementById("sb-zone-next");
var tocBtn = document.getElementById("sb-toc-btn");
var tocDialog = document.getElementById("sb-toc");
var tocBody = document.getElementById("sb-toc-body");
var tocClose = document.getElementById("sb-toc-close");
var settingsBtn = document.getElementById("sb-settings-btn");
var settingsDialog = document.getElementById("sb-settings");
var settingsClose = document.getElementById("sb-settings-close");
var scaleOutBtn = document.getElementById("sb-zoom-out");
var scaleInBtn = document.getElementById("sb-zoom-in");
var scaleLabel = document.getElementById("sb-scale-label");
var themeSelect = document.getElementById("sb-theme");
var motionSelect = document.getElementById("sb-motion");
var motionNote = document.getElementById("sb-motion-note");
var fsBtn = document.getElementById("sb-fs");
var focusBtn = document.getElementById("sb-focus");
var folioToggle = document.getElementById("sb-folio-toggle");
var toastEl = document.getElementById("sb-toast");
var toastText = document.getElementById("sb-toast-text");
var toastBtn = document.getElementById("sb-toast-btn");
var discloseList = document.getElementById("sb-disclose-list");
var discloseCount = document.getElementById("sb-disclose-count");

// ---------------------------------------------------------------------------------------
// runtime disclosures. Codes are `docs/11`'s; the reader mints none (`05` §3).
// ---------------------------------------------------------------------------------------
var extra = [];
/**
 * Add a disclosure. `code` may be `null`: `docs/11` owns every finding code and the reader may
 * not mint one (`05` §3 — an unregistered code is OPS_REGISTRY_CODE_UNKNOWN), so a note that has
 * no registered code carries none and reads as a reader note.
 *
 * `key` names the *subject* of the note. Every disclosure this reader derives from the current
 * build (the page count, the splits, the overflow leaves, the anchor turns) carries one, so that
 * a reflow **replaces** what it said before instead of stacking a second, contradictory copy of
 * it: a reader that reports "38 display pages" and then "35 display pages" for the same page on
 * the same screen is telling its reader nothing they can act on. `withdraw` takes one back when
 * the condition it described has gone.
 */
function disclose(code, severity, text, key) {
  var entry = { code: code, severity: severity, text: text, key: key || null };
  function same(d) { return key ? d.key === key : d.code === code && d.text === text; }
  for (var i = 0; i < extra.length; i++) {
    if (same(extra[i])) {
      if (extra[i].text === text && extra[i].code === code && extra[i].severity === severity) return;
      extra[i] = entry;
      renderDisclosures();
      return;
    }
  }
  extra.push(entry);
  renderDisclosures();
}
function withdraw(key) {
  var kept = [];
  for (var i = 0; i < extra.length; i++) if (extra[i].key !== key) kept.push(extra[i]);
  if (kept.length !== extra.length) { extra = kept; renderDisclosures(); }
}
/** Every note `build()` derives from this pass. Each rebuild owns all of them, so a viewport that
 *  no longer splits a page stops being described as though it did. */
var BUILD_NOTES = ["spread-refused", "page-overflow", "page-range", "anchor-turns", "splits", "frame-dropped", "small-viewport"];
function keepOnlyBuildNotes(kept) {
  var out = [];
  for (var i = 0; i < extra.length; i++) {
    var k = extra[i].key;
    if (k && BUILD_NOTES.indexOf(k) >= 0 && !kept[k]) continue;
    out.push(extra[i]);
  }
  if (out.length !== extra.length) { extra = out; renderDisclosures(); }
}
function sevClass(s) { return s === "critical" ? "sb-sev-critical" : s === "major" ? "sb-sev-major" : "sb-sev-info"; }
function renderDisclosures() {
  var all = (cfg.disclosures || []).concat(extra);
  discloseCount.textContent = all.length === 0
    ? "Nothing to disclose — the plan reproduced at this viewport."
    : all.length + (all.length === 1 ? " disclosure" : " disclosures");
  var html = "";
  for (var i = 0; i < all.length; i++) {
    html += '<li class="' + sevClass(all[i].severity) + '"><span class="sb-code">' +
      (all[i].code ? esc(all[i].code) + " \u00b7 " : "reader note \u00b7 ") + esc(all[i].severity) + "</span><br>" +
      esc(all[i].text) + "</li>";
  }
  discloseList.innerHTML = html || '<li class="sb-sev-info">No disclosures.</li>';
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------------------
// preferences and reading position — local only, never written back to the project (§5.5)
// ---------------------------------------------------------------------------------------
var KEY = "sb.reader.v1." + cfg.book_id + "." + cfg.cmp_id;
var prefs = {
  scale: 1, theme: "light", motion: "slide",
  folio: true, focus: false, block: null, ratio: 0, index: 0
};
function load() {
  try {
    var raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    var got = JSON.parse(raw);
    if (got && typeof got === "object") {
      if (typeof got.scale === "number") prefs.scale = got.scale;
      if (typeof got.theme === "string") prefs.theme = got.theme;
      if (typeof got.motion === "string") prefs.motion = got.motion;
      if (typeof got.folio === "boolean") prefs.folio = got.folio;
      if (typeof got.focus === "boolean") prefs.focus = got.focus;
      if (typeof got.block === "string") prefs.block = got.block;
      if (typeof got.ratio === "number") prefs.ratio = got.ratio;
      if (typeof got.index === "number") prefs.index = got.index;
      return got.block != null || got.index > 0;
    }
  } catch (e) { /* a private-mode or full store simply means no resume */ }
  return false;
}
var saveTimer = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }, 220);
}
function saveNow() {
  try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------
// motion
// ---------------------------------------------------------------------------------------
var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function reducedMotion() { return !!(mq && mq.matches); }
function wantedMotion() { return reducedMotion() ? "instant" : prefs.motion; }

// ---------------------------------------------------------------------------------------
// geometry: the leaf, the content box and the measure — all by ratio (`09` §7.5)
// ---------------------------------------------------------------------------------------
var css = getComputedStyle(root);
var RATIO = parseFloat(css.getPropertyValue("--sb-page-ratio-trim-width")) || (139.7 / 215.9);
var MEASURE_RATIO = parseFloat(css.getPropertyValue("--sb-page-ratio-measure")) || (96 / 139.7);
var INSET_X = parseFloat(css.getPropertyValue("--sb-page-ratio-inset-x")) || (21.85 / 139.7);
var INSET_Y = parseFloat(css.getPropertyValue("--sb-page-ratio-inset-y")) || (33.95 / 215.9);
var GUTTER = parseFloat(css.getPropertyValue("--sb-page-ratio-gutter")) || (4 / 139.7);
var BAND_TO = parseFloat(css.getPropertyValue("--sb-page-ratio-border-band-to")) || (10.0292 / 139.7);
var TEXT_GAP_MIN_PX = parseFloat(css.getPropertyValue("--sb-layout-border-text-gap-min-px-css")) || 11;
var REF_W = parseFloat(css.getPropertyValue("--sb-page-ref-box-width-px-css")) || 528;
var REF_H = parseFloat(css.getPropertyValue("--sb-page-ref-box-height-px-css")) || 816;
var BODY_PX = parseFloat(css.getPropertyValue("--sb-type-body-size-px-css")) || 18;
var LINE_HEIGHT = parseFloat(css.getPropertyValue("--sb-type-body-line-height")) || 1.5;
var ORPHANS = parseInt(css.getPropertyValue("--sb-type-orphans"), 10) || 2;
var WIDOWS = parseInt(css.getPropertyValue("--sb-type-widows"), 10) || 2;
var MIN_MEASURE = parseFloat(css.getPropertyValue("--sb-type-readability-min-measure-px-css")) || 245;
var SPARSE_BELOW = parseFloat(css.getPropertyValue("--sb-layout-resolved-density-sparse-below")) || 0.35;
var MAX_MS = cfg.max_ms || 420;

/** What the stage actually offers, with nothing invented: negative slack is not a size. */
function stageBox() {
  var rect = stageEl.getBoundingClientRect();
  var stageStyle = getComputedStyle(stageEl);
  var padX = parseFloat(stageStyle.paddingLeft) || 0;
  var padY = parseFloat(stageStyle.paddingTop) || 0;
  return {
    w: Math.min(rect.width || 0, window.innerWidth || 0) - padX * 2,
    h: Math.min(rect.height || 0, window.innerHeight || 0) - padY * 2,
  };
}

/**
 * A page box can only be derived from a stage that has been laid out. In a phone browser the
 * layout viewport is not settled until after the meta viewport has been applied, and a stage with
 * no height at all is what that looks like from here — so the reader waits for a plausible size
 * instead of *inventing* one. Clamping a missing box up to a minimum is how a reader ends up
 * rendering a page the design never described: there is no minimum, there is only "not yet".
 */
function layoutSettled() {
  var s = stageBox();
  return s.w >= 160 && s.h >= 180;
}

function leafBox() {
  // The stage is laid out by the document; the leaf is fitted into whatever is left, so a
  // control can never overlap the frame or the text (`DIG_FRAME_CONTROL_COLLISION`).
  // The spread decision is the viewport's (`docs/08` §3.2): >= 1024 x 768, both dimensions.
  var vw = window.innerWidth || 360;
  var vh = window.innerHeight || 640;
  var wide = vw >= cfg.spread_min_w && vh >= cfg.spread_min_h;
  var s = stageBox();
  var availW = Math.floor(s.w);
  var availH = Math.floor(s.h);
  // Two leaves plus the design's own gutter: w x (2 + gutter_ratio) <= availW, and the leaf
  // keeps the trim's proportion, so h = w / aspect. Solved exactly, so the pair is centred
  // inside the stage with no horizontal overflow at any width.
  var w = wide ? Math.min(availW / (2 + GUTTER), availH * RATIO) : Math.min(availW, availH * RATIO);
  w = Math.min(w, REF_W);
  var h = w / RATIO;
  if (h > availH) { h = availH; w = h * RATIO; }
  // Rounded, not floored: at the reference width this reproduces the trim to the pixel
  // (528 x 816 px_css), the box 09 §1.7's print/digital parity is stated at.
  var wi = Math.min(Math.round(w), Math.round(REF_W));
  var hi = Math.min(Math.round(wi / RATIO), Math.round(REF_H));
  return { w: wi, h: hi, wide: wide, gutter: Math.round(GUTTER * wi) };
}

function scalePx() { return BODY_PX * prefs.scale; }
function pitchPx() { return scalePx() * LINE_HEIGHT; }
function contentHeightPx(box) { return Math.max(0, box.h * (1 - 2 * INSET_Y)); }
function capacityLines(box) { return Math.max(1, Math.floor(contentHeightPx(box) / pitchPx())); }
function measureWidthPx(box) { return Math.max(80, box.w * MEASURE_RATIO); }

// ---------------------------------------------------------------------------------------
// the flow: every block, in reading order, measured at the live measure
// ---------------------------------------------------------------------------------------
var allBlocks = [];          // Element[] in DOM (== logical) order, before reflow
var units = [];              // plan units: a print page's blocks, split at essential breaks
var view = { pages: [], index: 0, box: null, mode: "single", splitCount: 0, overflowPages: [], anchorTurns: [], retries: 0 };

function gather() {
  var found = document.querySelectorAll("[data-sb-block]");
  allBlocks = [];
  for (var i = 0; i < found.length; i++) allBlocks.push(found[i]);
  buildUnits();
}

/**
 * The height a block occupies on the page, **including its bottom margin** — the space the
 * flow actually consumes. `getBoundingClientRect` reports the border box, so a paragraph's
 * margin would otherwise be invisible to the packer and the page would be over-filled.
 * The final margin of a page is counted too: the estimate is one margin conservative, which
 * is the safe direction (a page may be a few pixels short, never over).
 */
function heightOf(el) {
  measureBlocks.appendChild(el);
  var h = el.getBoundingClientRect().height;
  var mb = parseFloat(getComputedStyle(el).marginBottom);
  return h + (isFinite(mb) && mb > 0 ? mb : 0);
}

/**
 * Split `el` so that the first part fits `maxPx`, at a word boundary, keeping every character.
 * Returns `[head, tail]` or `null` when the whole block fits.
 */
function splitBlock(el, maxPx) {
  var span = el.querySelector("[data-sb-text]");
  if (!span) return null;
  var full = span.textContent || "";
  if (full.length < 8) return null;
  var head = el.cloneNode(true);
  var tail = el.cloneNode(true);
  var headSpan = head.querySelector("[data-sb-text]");
  var tailSpan = tail.querySelector("[data-sb-text]");
  var probe = el.cloneNode(true);
  var probeSpan = probe.querySelector("[data-sb-text]");
  var cite = head.querySelector(".sb-ref");
  if (cite) cite.parentNode.removeChild(cite);
  var lo = 1, hi = full.length, best = 0;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    probeSpan.textContent = full.slice(0, mid);
    measureBlocks.appendChild(probe);
    var h = probe.getBoundingClientRect().height;
    if (h <= maxPx) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (best <= 0) return null;
  var cut = full.lastIndexOf(" ", best);
  if (cut < best * 0.7) cut = best;
  var headText = full.slice(0, cut);
  var tailText = full.slice(cut);
  if (probe.parentNode) probe.parentNode.removeChild(probe);   // never leave a probe behind
  if (!headText.trim() || !tailText.trim()) return null;
  headSpan.textContent = headText;
  tailSpan.textContent = tailText;
  head.setAttribute("data-sb-split", "head");
  tail.setAttribute("data-sb-split", "tail");
  // The original is now carried by the two halves. Leaving it in the document would keep a
  // second copy of the same text in the DOM — invisible, but it doubles what a block count or a
  // "is every word present" check sees, and it is text the page no longer owns.
  if (el.parentNode) el.parentNode.removeChild(el);
  return [head, tail];
}

function leafOf(blocks, meta) {
  var leaf = document.createElement("div");
  leaf.className = "sb-leaf";
  leaf.setAttribute("data-sb-side", meta && meta.side ? meta.side : "single");
  leaf.setAttribute("data-sb-template", (meta && meta.template) || "standard_story");
  if (meta && meta.mixed) leaf.setAttribute("data-sb-mixed", "1");
  if (meta && meta.frame) leaf.setAttribute("data-sb-frame", meta.frame);
  var fo = document.createElement("div");
  fo.className = "sb-frame sb-frame-outer";
  var fi = document.createElement("div");
  fi.className = "sb-frame sb-frame-inner";
  var content = document.createElement("div");
  content.className = "sb-content";
  var wrap = document.createElement("div");
  wrap.className = "sb-blocks";
  content.appendChild(wrap);
  leaf.appendChild(fo); leaf.appendChild(fi); leaf.appendChild(content);
  for (var i = 0; i < blocks.length; i++) wrap.appendChild(blocks[i]);
  if (meta && meta.folio != null && cfg.show_folio !== false) {
    var f = document.createElement("div");
    f.className = "sb-folio";
    f.setAttribute("aria-hidden", "true");
    f.textContent = String(meta.folio);
    leaf.appendChild(f);
  }
  return leaf;
}

function displayPage(leaves, meta) {
  var p = document.createElement("section");
  p.className = "sb-page";
  p.setAttribute("role", "group");
  p.setAttribute("aria-roledescription", "page");
  p.setAttribute("data-sb-mode", leaves.length > 1 ? "spread" : "single");
  p.setAttribute("data-sb-current", "0");
  p.setAttribute("data-sb-template", (meta && meta.template) || "standard_story");
  p.setAttribute("data-sb-index", String(view.pages.length + 1));
  for (var i = 0; i < leaves.length; i++) p.appendChild(leaves[i]);
  if (meta && meta.label) p.setAttribute("aria-label", meta.label);
  return p;
}

/** Group the flow into plan units: one print page's blocks, never crossing an essential break. */
function buildUnits() {
  units = [];
  var cur = null;
  for (var i = 0; i < allBlocks.length; i++) {
    var el = allBlocks[i];
    var pp = el.getAttribute("data-sb-print-page");
    var hard = el.getAttribute("data-sb-anchor") === "1";
    var tmpl = el.getAttribute("data-sb-template") || "standard_story";
    var coverTemplate = tmpl === "title_page";
    if (!cur || pp !== cur.page || hard) {
      cur = {
        page: pp,
        blocks: [],
        template: tmpl,
        side: el.getAttribute("data-sb-side") || null,
        hard: hard,
        // `sparse` is the plan's own density class (05 §2.4): the pages that carry pacing are the
        // balanced and dense ones, and the sparse ones are the furniture that a small screen may
        // merge forward without moving a beat (`§6.10`).
        sparse: el.getAttribute("data-sb-density") === "sparse",
        cover: coverTemplate,
      };
      units.push(cur);
    }
    cur.blocks.push(el);
  }
  return units.filter(function (u) { return u.blocks.length > 0; });
}

// ---------------------------------------------------------------------------------------
// packing. Single mode packs at the live capacity, preferring a planned boundary whenever a
// page's content fits; spread mode uses the physical pairing, so the composed centre spread
// and the page 9 -> 10 turn are reproduced exactly where they were composed.
// ---------------------------------------------------------------------------------------
function measureUnits(box) {
  var cap = capacityLines(box);
  var out = [];
  for (var u = 0; u < units.length; u++) {
    var hs = [];
    for (var b = 0; b < units[u].blocks.length; b++) hs.push(heightOf(units[u].blocks[b]));
    var total = 0;
    for (var k = 0; k < hs.length; k++) total += hs[k];
    out.push({ unit: units[u], heights: hs, total: total, lines: hs.map(function (h) { return Math.max(1, Math.round(h / pitchPx())); }) });
  }
  return { cap: cap, items: out };
}

/**
 * Pack the flow into display pages.
 *
 * The plan's page boundaries are the **pacing**, so they are honoured wherever they can be:
 * every plan page starts its own display page unless it is one the plan itself classifies as
 * `sparse` (a dedication, a copyright notice) — furniture whose own page is worth nothing to a
 * reader and whose merge moves no beat. A plan page that does not fit is split at a measured
 * line boundary instead (`§7.4`). And an essential break is not a preference at all: it always
 * starts a fresh page, at every viewport, which is what keeps the composed reveal a *turn* on a
 * phone as much as on a desktop (`docs/08` §3.9 anchors).
 *
 * `mergeSparse` is off in spread mode, where the turns are the physical pairing of the plan and
 * an extra merge would put every later turn on the wrong side of the spine.
 */
function packSingle(box, mergeSparse) {
  var m = measureUnits(box);
  var pitch = pitchPx();
  var capH = contentHeightPx(box);
  var pages = [];
  var acc = [];             // block elements for the current display page
  var accH = 0;
  var frags = [];
  var startsHard = false;
  function flush() {
    if (acc.length) {
      pages.push({ blocks: acc, frags: frags, startsHard: startsHard, isCover: templateOf(acc) === "title_page" });
      acc = []; accH = 0; frags = []; startsHard = false;
    }
  }
  for (var i = 0; i < m.items.length; i++) {
    var it = m.items[i];
    // A new display page begins here, unless this plan page is sparse and may merge forward
    // into the page already open.
    // A sparse plan page may merge forward — unless the page already open is the cover, which
    // stands alone on paper and should stand alone here.
    var mayMerge = !!mergeSparse && it.unit.sparse && acc.length > 0 && !it.unit.hard && !it.unit.cover &&
      templateOf(acc) !== "title_page";
    if (!mayMerge) flush();
    if (acc.length === 0) startsHard = !!(it.unit.hard || it.unit.cover);
    var avail = capH - accH;
    if (it.total <= avail) {
      for (var b = 0; b < it.unit.blocks.length; b++) { acc.push(it.unit.blocks[b]); frags.push({ page: it.unit.page, first: b === 0, part: it.unit.blocks.length }); }
      accH += it.total;
      continue;
    }
    // It does not fit whole. Fill the remainder only when the remainder is worth filling: a
    // strip below the resolved band's sparse floor is the page the design exists to avoid, and
    // the composed boundary is worth more than two stray lines at the foot of a page.
    if (acc.length && avail < SPARSE_BELOW * capH) { flush(); i--; continue; }
    var remaining = it.unit.blocks.slice();
    var guard = 0;
    // Which display page of this plan page we are filling. Only the **first** one begins at the
    // plan's break: a continuation leaf is the rest of a page the reader has already started, and
    // it must not claim an anchor of its own, or one printed page would take two screen turns
    // around a single essential break.
    var unitPart = 0;
    while (remaining.length && guard++ < 64) {
      avail = capH - accH;
      if (acc.length === 0) startsHard = unitPart === 0 && !!it.unit.hard;
      var h0 = heightOf(remaining[0]);
      if (h0 <= avail) {
        acc.push(remaining[0]); frags.push({ page: it.unit.page, first: frags.length === 0, part: 1 });
        accH += h0; remaining.shift();
        continue;
      }
      var headLines = Math.max(0, Math.floor(avail / pitch));
      var frag = headLines >= Math.max(ORPHANS, 1) ? splitBlock(remaining[0], avail) : null;
      if (!frag) {
        // Either no room worth using, or an unbreakable block: start a new page. If the block
        // is taller than a whole empty page it takes the page to itself and the leaf scrolls,
        // and the page is reported (`§7.4`; `DIG_PAGE_OVERFLOW` — never truncated).
        if (acc.length) { flush(); unitPart++; continue; }
        acc.push(remaining[0]);
        frags.push({ page: it.unit.page, first: true, part: 1, overflow: h0 > capH });
        accH = h0; remaining.shift();
        continue;
      }
      // A tail with fewer lines than `widows` is a widow: move the whole block instead (`09` §5.3).
      var tailH = heightOf(frag[1]);
      if (Math.round(tailH / pitch) < WIDOWS && frags.length === 0) {
        acc.push(remaining[0]);
        frags.push({ page: it.unit.page, first: true, part: 1, overflow: h0 > capH });
        accH = h0; remaining.shift(); continue;
      }
      var headH = heightOf(frag[0]);          // measure before the element joins the page
      accH += headH;
      acc.push(frag[0]); frags.push({ page: it.unit.page, first: true, part: 2, split: true });
      view.splitCount++;
      remaining[0] = frag[1];
      flush();
      unitPart++;
    }
    flush();
  }
  flush();
  return pages;
}

/**
 * σ(p) — the printed spread a print page is on.
 *
 * The convention is the composition's, not the reader's: `docs/08` §3.2 — "a spread plan is a plan
 * of *facing pages*: page 2k is a verso, page 2k+1 a recto" — and `docs/05` §2.5 lists it as
 * `{1} · {2,3} · {4,5} · …`. Page 1 is the cover and stands alone; every later spread is a verso
 * and the recto it faces, and a turn happens between pages p−1 and p exactly when p is even. The
 * reader reads this from `cfg.spread_pairing`, which carries the composition's own
 * `measure.turn_parity.rule` when the composition records one, and the two documents' rule when it
 * does not — so the reader never invents the pairing and never silently disagrees with the plan.
 */
function spreadOfPrintPage(p) {
  var n = parseFloat(p);
  if (!isFinite(n)) return null;
  return n <= 1 ? 0 : Math.floor(n / 2);            // σ(1) = 0: the cover, alone
}

/** The plan pages a packed display page carries (one page per display page in spread mode). */
function printPagesOf(pg) {
  var out = [];
  for (var i = 0; i < pg.frags.length; i++) {
    var q = pg.frags[i].page;
    if (q == null) continue;
    var k = String(q);
    if (out.indexOf(k) < 0) out.push(k);
  }
  return out;
}

/** The spread a display page belongs to, or `null` when it does not carry exactly one. */
function spreadOfDisplayPage(pg) {
  var ps = printPagesOf(pg);
  if (!ps.length) return null;
  var s = spreadOfPrintPage(ps[0]);
  if (s === null) return null;
  for (var i = 1; i < ps.length; i++) if (spreadOfPrintPage(ps[i]) !== s) return null;
  return s;
}

/**
 * Spread mode: **one turn per printed spread**, so that a turn on screen is a turn on paper.
 *
 * The reader's display pages are not the plan's pages — it merges sparse furniture forward and
 * splits a page that will not fit — so they cannot simply be dealt out two at a time: after the
 * first split, every later pair is out of step with the printed book and the spread that reveals
 * a beat stops being the spread the author composed (`docs/08` §3.2, §3.9). A turn therefore holds
 * the display pages of **one** spread and never those of two: the cover alone; then, for each
 * printed spread, its verso and its recto — or, where a page had to be split, that page's two
 * parts, which take the two leaves of the spread they belong to rather than leaking into the
 * next one. A display page carries no spread at all (an unplaced block) gets a turn of its own.
 *
 * The one thing that outranks the pairing is an **anchor**: a display page that begins at a
 * planned essential break opens a turn (`docs/08` §3.9 — the anchors are fixed page starts the
 * reader may never move), even where the printed booklet faces the page before it. That is what
 * makes the composed reveal survive every viewport rather than only the one it was composed at,
 * and the reader says so in its disclosures when it happens.
 */
function groupTurns(pages) {
  var out = [];
  var cur = [];
  var curSpread = null;
  var brokeForAnchor = [];
  function close() { if (cur.length) { out.push(cur); cur = []; curSpread = null; } }
  for (var i = 0; i < pages.length; i++) {
    var pg = pages[i];
    // The cover is a recto of its own: pairing it with page 2 would put every later turn one page
    // out of step with the printed book.
    if (pg.isCover) { close(); out.push([pg]); continue; }
    var s = spreadOfDisplayPage(pg);
    if (pg.startsHard && cur.length) {
      // The plan's own turn. Honoured absolutely; and if the printed booklet faces this page with
      // one already on screen, the two editions disagree about one turn and the reader says which
      // one it kept (`docs/08` §3.9 wins — an anchor is not movable).
      if (s !== null && s === curSpread) brokeForAnchor.push(printPagesOf(pg).join("/"));
      close();
    }
    if (cur.length && (s === null || curSpread === null || s !== curSpread || cur.length >= 2)) close();
    if (!cur.length) curSpread = s;
    cur.push(pg);
  }
  close();
  view.anchorTurns = brokeForAnchor;
  return out;
}

// ---------------------------------------------------------------------------------------
// build: measure, pack, render atomically, publish the count
// ---------------------------------------------------------------------------------------
function build(box) {
  view.box = box;
  view.splitCount = 0;
  view.overflowPages = [];
  view.anchorTurns = [];
  root.style.setProperty("--sb-leaf-width", box.w + "px");
  root.style.setProperty("--sb-leaf-height", box.h + "px");
  // The measurement container must have the *same* content box as the leaf, or every height the
  // packer reasons about belongs to a box no renderer uses (DESIGN_MEASURE_BOX_DIVERGENCE).
  measureEl.style.width = measureWidthPx(box) + "px";
  // `09` §7.5: at a viewport too small to hold the frame plus a readable measure the frame is
  // dropped and reported. The test is arithmetic: does the band's far edge, plus the declared
  // frame-to-text minimum, still clear the text edge?
  var clearancePx = (INSET_X - BAND_TO) * box.w - TEXT_GAP_MIN_PX;
  view.droppedFrame = clearancePx < 4;
  root.setAttribute("data-sb-frame", view.droppedFrame ? "none" : "shown");
  var spreadWanted = box.wide;
  var spreadRefused = "";
  if (spreadWanted && measureWidthPx(box) < MIN_MEASURE) {
    spreadWanted = false;
    spreadRefused = "A leaf's measure would be " + Math.round(measureWidthPx(box)) + " px, below the " +
      Math.round(MIN_MEASURE) + " px at which " + Math.round(cfg.chars_per_line || 32) + " characters per line still fit; " +
      "a two-page spread here would compromise readability, so single pages are presented (\u00a77.1).";
  }
  var frameStyle = view.droppedFrame ? "none" : (cfg.frame_style || "double_rule");
  var packed = packSingle(box, !spreadWanted);
  var turns = spreadWanted ? groupTurns(packed) : packed.map(function (p) { return [p]; });
  var pages = turns.map(function (turn) {
    var leaves = [];
    for (var t2 = 0; t2 < turn.length; t2++) {
      var pg = turn[t2];
      var folios = {};
      var onlyWhole = true;
      var overflow = false;
      for (var f = 0; f < pg.frags.length; f++) {
        if (pg.frags[f].page != null) folios[pg.frags[f].page] = true;
        if (pg.frags[f].split) onlyWhole = false;
        if (pg.frags[f].overflow) overflow = true;
      }
      var keys = Object.keys(folios);
      var tmpl = templateOf(pg.blocks);
      // The leaf's side is its *printed* side, from the plan's own parity (odd = recto, the
      // right-hand page; even = verso), so the folio sits where the printed one would and a leaf
      // can never be labelled a verso while it holds a recto. A merged leaf carries more than one
      // page and only then falls back to its position in the turn.
      var ownPage = keys.length === 1 ? parseFloat(keys[0]) : NaN;
      var side = isFinite(ownPage)
        ? (ownPage % 2 === 1 ? "recto" : "verso")
        : turn.length > 1 ? (t2 === 0 ? "verso" : "recto") : "single";
      var leaf = leafOf(pg.blocks, {
        folio: keys.length === 1 ? keys[0] : null,
        template: tmpl,
        side: side,
        mixed: keys.length > 1 || !onlyWhole,
        frame: frameStyle
      });
      if (overflow) {
        // One block is taller than a whole page. It gets the page to itself and the page
        // scrolls: \u00a77.4 — reflow it rather than clipping it. Reported, never truncated.
        var content = leaf.querySelector(".sb-content");
        content.setAttribute("data-sb-scroll", "1");
        content.setAttribute("tabindex", "0");
        content.setAttribute("role", "region");
        content.setAttribute("aria-label", "A page longer than the viewport; it scrolls so that no text is hidden");
        view.overflowPages = view.overflowPages.concat([keys.length ? keys.join("/") : "unplaced"]);
      }
      leaves.push(leaf);
    }
    // What the turn is, said in the reader's own terms: the pages of the printed book it shows.
    // (The plan's page *count* is furniture and lives in the contents colophon, not here.)
    var printed = [];
    for (var t3 = 0; t3 < turn.length; t3++) {
      var pk = printPagesOf(turn[t3]);
      for (var k3 = 0; k3 < pk.length; k3++) if (printed.indexOf(pk[k3]) < 0) printed.push(pk[k3]);
    }
    printed.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    var label = printed.length === 0 ? "Unplaced text"
      : printed.length === 1 ? "Printed page " + printed[0]
      : "Printed pages " + printed.join(" and ");
    return displayPage(leaves, { template: templateOf(turn[0].blocks), label: label });
  });
  view.mode = spreadWanted ? "spread" : "single";
  view.spreadRefused = spreadRefused;
  // Everything below describes *this* build, so each note carries the key of its subject and the
  // set is re-owned here: a rebuild replaces its own notes and drops the ones whose condition has
  // gone (`keepOnlyBuildNotes` at the end), instead of stacking a second, contradictory copy.
  var notes = {};
  if (spreadRefused) {
    notes["spread-refused"] = true;
    disclose("DIG_RESPONSIVE_LAYOUT_BROKEN", "major", spreadRefused, "spread-refused");
  }
  if (view.overflowPages.length) {
    notes["page-overflow"] = true;
    disclose("DIG_PAGE_OVERFLOW", "critical",
      "Page(s) " + view.overflowPages.join(", ") + " hold a block taller than this viewport's page. " +
      "They take the page to themselves and it scrolls — no glyph is clipped and no text is hidden (§7.4, §6.10).",
      "page-overflow");
  }
  // The count against the composition's recorded digital measure (`docs/08` §3.8/§9.6; D-06):
  // reported, never hidden — and reported **precisely**, because the reader's count and the
  // composition's recorded count are not the same quantity and a difference between them is not
  // by itself a fault. The recorded figure is the *story* re-solved by the engine at its own
  // digital page box; this reader lays out the whole plan, boundaries and all (`§3.9`).
  var dg = cfg.digital_measured_at || [];
  if (dg.length && pages.length) {
    var leafCount = 0;
    for (var t4 = 0; t4 < turns.length; t4++) leafCount += turns[t4].length;
    var sec = cfg.plan_pages_by_section || { front: 0, story: 0, back: 0, blank: 0, total: cfg.plan_pages };
    // Compare with the recorded viewport in the *same* mode and closest in width: a spread and a
    // single page are not comparable measures of the same page (`§3.2`).
    var pool = dg.filter(function (m) { return !!m.spread === !!spreadWanted; });
    if (!pool.length) pool = dg;
    var near = pool[0], bestD = Infinity;
    for (var d2 = 0; d2 < pool.length; d2++) {
      var wpx = parseFloat(String(pool[d2].viewport).split("x")[0]) || 0;
      var dist = Math.abs(wpx - (window.innerWidth || 0));
      if (dist < bestD) { bestD = dist; near = pool[d2]; }
    }
    var range = cfg.digital_range || { min: near.pages, max: near.pages };
    var outside = pages.length < range.min || pages.length > range.max;
    if (outside || pages.length !== near.pages) {
      notes["page-range"] = true;
      disclose(outside ? "DIG_RESPONSIVE_LAYOUT_BROKEN" : null, outside ? "major" : "info",
        "This viewport reflows the book into " + pages.length + " display pages (" + leafCount +
        " leaves); the composition's recorded measure for the closest reference viewport (" + near.viewport +
        (near.spread ? ", a spread" : ", a single page") + ") is " + near.pages + " pages" +
        (outside ? ", and the whole recorded range is " + range.min + "\u2013" + range.max : "") + ". " +
        "The two count different things, so they are not expected to agree: the recorded figure is the " +
        "*story* re-solved by the composition engine at its own digital page box \u2014 no front matter, no " +
        "back matter, no padding blank, and none of the plan's own page boundaries \u2014 while this reader is " +
        "showing the whole plan: " + sec.front + " front-matter + " + sec.story + " story + " + sec.back +
        " back-matter" + (sec.blank ? " + " + sec.blank + " blank" : "") + " = " + sec.total + " planned pages, " +
        "with every planned boundary and every essential break kept (`docs/08` §3.9). " +
        "**Which is authoritative:** for what is on this screen, this reader's count \u2014 it is measured " +
        "here, in this browser, from the same plan and the same text, and it is the number the pages you " +
        "are turning actually have; for the published range the dashboard carries (`docs/08` §9.6, D-06), " +
        "the recorded " + range.min + "\u2013" + range.max + " stands, and reading the book does not change it. " +
        "The plan's story is " + sec.story + " printed pages against the recorded " + near.pages + ", so the " +
        "recorded number is a story-only figure and not a display-page count to check this one against. " +
        (view.splitCount ? view.splitCount + " planned page(s) held more than this viewport's leaf and were " +
          "split at a measured line boundary \u2014 a reflow between planned boundaries, disclosed below (§7.4). " : "") +
        "No text is truncated, reordered or dropped by the difference.", "page-range");
    }
  }
  var anchorTurns = view.anchorTurns || [];
  if (anchorTurns.length) {
    notes["anchor-turns"] = true;
    disclose(null, "info",
      "The composition records a turn that the printed booklet does not have: print page(s) " +
      anchorTurns.join(", ") + " open a new turn here because the plan marks an essential break there, " +
      "and an essential break is a fixed page start the reader may never move (`docs/08` §3.9). In the " +
      "printed booklet that page faces the page before it (the spreads are {1} · {2,3} · {4,5} · …, " +
      (cfg.spread_pairing && cfg.spread_pairing.source === "composition" ? "the rule this composition records" : "docs/08 §3.2, since this composition records no pairing") +
      "), so this is the one place where a turn on screen is not a turn on paper \u2014 and it is the turn the " +
      "reveal is composed on. The plan, not the reader, is where it would be settled.", "anchor-turns");
  }
  if (view.splitCount) {
    notes["splits"] = true;
    disclose(null, "info",
      view.splitCount + " planned page(s) held more than this viewport can carry, so they were split at a measured line " +
      "boundary rather than clipped (`§7.4`, " + Math.round(pitchPx()) + " px leading at " + Math.round(prefs.scale * 100) + "%). " +
        "Every planned boundary is still a reader boundary: the reader's break positions are a superset of the plan's, so none is lost.",
      "splits");
  }
  if (view.droppedFrame) {
    notes["frame-dropped"] = true;
    disclose("DIG_FRAME_DROPPED_SMALL_VIEWPORT", "major",
      "The viewport is too small to hold the perimeter frame at a readable measure, so the frame is dropped and reported (`09` §7.5).",
      "frame-dropped");
  }
  if (view.box.w < 0.55 * REF_W) {
    // A very short viewport (a phone held sideways) cannot hold the trim's proportion at full
    // size. The type size is unchanged — it is never derived from the page box (09 §5.6, L1 vs
    // L2) — so the page simply holds fewer lines, and how many is stated rather than implied.
    notes["small-viewport"] = true;
    disclose(null, "info",
      "The page is presented at " + view.box.w + " x " + view.box.h + " px, " +
      Math.round((view.box.w / REF_W) * 100) + "% of the " + Math.round(REF_W) + " x " + Math.round(REF_H) +
      " reference box, because this viewport is too short to hold the trim's proportion any larger. " +
      "The type size is unchanged (" + Math.round(scalePx()) + " px at " + Math.round(prefs.scale * 100) + "%), so a page holds " +
      capacityLines(view.box) + " lines against " + Math.round((REF_H * (1 - 2 * INSET_Y)) / pitchPx()) +
      " at the reference box: more pages, and no clipped text (09 §5.6, §7.5).", "small-viewport");
  }
  keepOnlyBuildNotes(notes);
  return pages;
}
function templateOf(blocks) { return blocks.length ? (blocks[0].getAttribute("data-sb-template") || "standard_story") : "standard_story"; }

function render(pages) {
  var frag = document.createDocumentFragment();
  for (var i = 0; i < pages.length; i++) frag.appendChild(pages[i]);
  view.pages = [];
  for (var j = 0; j < pages.length; j++) view.pages.push(pages[j]);
  pagesEl.textContent = "";
  pagesEl.appendChild(frag);
  var box = view.box;
  var width = box.w * (view.mode === "spread" ? 2 : 1) + (view.mode === "spread" ? GUTTER * box.w : 0);
  pagesEl.style.width = Math.ceil(width) + "px";
  pagesEl.style.height = Math.ceil(box.h) + "px";
  stageEl.setAttribute("data-sb-wide", box.wide ? "1" : "0");
  root.setAttribute("data-sb-ready", "1");
  root.setAttribute("data-sb-mode", view.mode);
}

// ---------------------------------------------------------------------------------------
// the page model in the UI
// ---------------------------------------------------------------------------------------
function clamp(i) { return Math.max(0, Math.min(view.pages.length - 1, i)); }
function anchorOf(index) {
  var pg = view.pages[index];
  if (!pg) return null;
  var first = pg.querySelector("[data-sb-block]");
  return first ? first.getAttribute("data-sb-block") : null;
}
function indexOfBlock(id) {
  if (!id) return -1;
  for (var i = 0; i < view.pages.length; i++) if (view.pages[i].querySelector('[data-sb-block="' + id + '"]')) return i;
  return -1;
}
function label(pg) {
  var l = pg && pg.getAttribute("aria-label");
  if (l) return l;
  var t = pg && pg.getAttribute("data-sb-template");
  return t ? t.replace(/_/g, " ") : "";
}

function paint(announce) {
  for (var i = 0; i < view.pages.length; i++) view.pages[i].setAttribute("data-sb-current", i === view.index ? "1" : "0");
  var pg = view.pages[view.index];
  var total = view.pages.length;
  var printPages = {};
  if (pg) {
    var folios = pg.querySelectorAll(".sb-folio");
    for (var f = 0; f < folios.length; f++) printPages[folios[f].textContent] = true;
  }
  var keys = Object.keys(printPages).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
  // The status answers the reader's question — *where am I?* — and says nothing else. How many
  // pages the print plan holds is bookkeeping: it belongs in the contents colophon, where a
  // reader who wants it can find it, not on every page of the book a child is reading.
  var printed = keys.length
    ? (keys.length === 1 ? "printed page " + keys[0] : "printed pages " + keys.join("\u2013"))
    : "";
  folioEl.textContent = "Page " + (view.index + 1) + " of " + total + (printed ? "  ·  " + printed : "");
  var pct = total <= 1 ? 100 : Math.round((view.index / (total - 1)) * 100);
  progressFill.style.width = pct + "%";
  progressEl.setAttribute("aria-valuenow", String(pct));
  progressEl.setAttribute("aria-valuetext", "Page " + (view.index + 1) + " of " + total);
  prevBtn.disabled = view.index <= 0; zonePrev.disabled = view.index <= 0;
  nextBtn.disabled = view.index >= total - 1; zoneNext.disabled = view.index >= total - 1;
  firstBtn.disabled = view.index <= 0; lastBtn.disabled = view.index >= total - 1;
  if (announce) {
    var bit = label(pg);
    liveEl.textContent = "";
    window.setTimeout(function () {
      liveEl.textContent = "Page " + (view.index + 1) + " of " + total + (bit ? ", " + bit : "") +
        ". " + (view.mode === "spread" ? "Two facing pages." : "Single page.");
    }, 40);
  }
  updateTocCurrent();
}

function positionOf(index) {
  // Where the reader is inside the current display page, kept across a reflow or a rotation.
  var pg = view.pages[index];
  var id = anchorOf(index), ratio = 0;
  if (pg) {
    var content = pg.querySelector(".sb-content");
    var rect = content ? content.getBoundingClientRect() : null;
    if (rect) ratio = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height)));
  }
  return { id: id, ratio: ratio, index: index };
}
function restorePosition(pos) {
  if (!pos) return 0;
  var i = pos.id ? indexOfBlock(pos.id) : -1;
  if (i < 0) i = clamp(pos.index || 0);
  var pg = view.pages[i];
  if (pg) {
    var content = pg.querySelector(".sb-content");
    if (content && pos.ratio) content.scrollTop = Math.max(0, pos.ratio * content.scrollHeight - content.clientHeight);
  }
  return i;
}

// ---------------------------------------------------------------------------------------
// navigation. State first, always; the animation is an overlay that can fail harmlessly.
// ---------------------------------------------------------------------------------------
var animTimer = null;
function stopAnim() {
  if (animTimer) { clearTimeout(animTimer); animTimer = null; }
  var layers = pagesEl.querySelectorAll(".sb-anim-layer");
  for (var i = 0; i < layers.length; i++) {
    layers[i].classList.remove("sb-anim-layer", "sb-anim-in", "sb-anim-out", "sb-anim-back", "sb-anim-slide", "sb-anim-fade", "sb-anim-curl", "sb-anim-fold");
    var shade = layers[i].querySelector(".sb-shade");
    if (shade && shade.parentNode) shade.parentNode.removeChild(shade);
  }
}
function go(index, opts) {
  opts = opts || {};
  var target = clamp(index);
  var from = view.index;
  if (target === view.index && !opts.force) return;
  var style = wantedMotion();
  view.index = target;
  try { paint(true); } catch (e) { /* painting must never block navigation */ }
  prefs.index = target;
  var pos = positionOf(target);
  prefs.block = pos.id; prefs.ratio = pos.ratio;
  save();
  if (style === "instant" || opts.instant) { stopAnim(); return; }
  try { animate(from, target, style); } catch (e) { stopAnim(); }
}
/**
 * A turn. Both surfaces are on screen for the length of it — the class below is what keeps the
 * leaving page laid out at all (`.sb-anim-layer`) — and the sheet **on top** is the one that moves:
 * forward that is the page being left, which lifts and uncovers the page beneath; backward it is
 * the page being reached, swinging back in over the one already there. `sb-anim-back` carries that
 * difference into the stylesheet; nothing here decides what the motion looks like.
 */
function animate(from, target, style) {
  stopAnim();
  if (from === target) return;
  var incoming = view.pages[target];
  var outgoing = view.pages[from];
  var back = target < from;
  var cls = "sb-anim-" + style;
  incoming.classList.add("sb-anim-layer", "sb-anim-in", cls);
  if (back) incoming.classList.add("sb-anim-back");
  if (outgoing) {
    outgoing.classList.add("sb-anim-layer", "sb-anim-out", cls);
    if (back) outgoing.classList.add("sb-anim-back");
  }
  if (style === "curl" || style === "fold") {
    // The shade belongs to the leaf that turns: the top page's last leaf, whose hinge is the
    // gutter. In single mode the page has one leaf and that is the one.
    var top = back ? incoming : outgoing;
    var leaves = top ? top.querySelectorAll(".sb-leaf") : [];
    var turning = leaves.length ? leaves[leaves.length - 1] : null;
    if (turning) {
      var shade = document.createElement("div");
      shade.className = "sb-shade";
      turning.appendChild(shade);
    }
  }
  animTimer = setTimeout(function () { stopAnim(); }, MAX_MS + 60);
}
function next() { go(view.index + 1); }
function prev() { go(view.index - 1); }
function first() { go(0); }
function last() { go(view.pages.length - 1); }
function jumpToBlock(id) {
  var i = indexOfBlock(id);
  if (i < 0) { toast("That section is not in this composition's flow."); return; }
  go(i);
  var pg = view.pages[i];
  if (pg) {
    var tgt = pg.querySelector('[data-sb-block="' + id + '"]');
    var content = pg.querySelector(".sb-content");
    if (tgt && content) {
      var shift = tgt.getBoundingClientRect().top - content.getBoundingClientRect().top;
      if (shift > 8) content.scrollTop = Math.max(0, content.scrollTop + shift);
    }
  }
}

// ---------------------------------------------------------------------------------------
// the table of contents
// ---------------------------------------------------------------------------------------
function updateTocCurrent() {
  var items = tocBody.querySelectorAll("[data-sb-jump]");
  for (var i = 0; i < items.length; i++) {
    var at = items[i].getAttribute("data-sb-at");
    var hit = at ? indexOfBlock(at) : -1;
    items[i].setAttribute("aria-current", hit >= 0 && hit <= view.index ? "true" : "false");
  }
}
function openToc() {
  updateTocCurrent();
  if (tocDialog && typeof tocDialog.showModal === "function") {
    if (!tocDialog.open) tocDialog.showModal();
    var cur = tocBody.querySelector('[aria-current="true"]');
    if (cur && cur.focus) cur.focus();
  } else if (tocDialog) {
    tocDialog.setAttribute("open", "open");
  }
}
/** The second sheet: every §7.3 control the bar has no room for, reachable at every width. */
function openSettings() {
  if (settingsDialog && typeof settingsDialog.showModal === "function") {
    if (!settingsDialog.open) settingsDialog.showModal();
  } else if (settingsDialog) settingsDialog.setAttribute("open", "open");
}
function closeSettings() {
  if (settingsDialog && typeof settingsDialog.close === "function" && settingsDialog.open) settingsDialog.close();
  else if (settingsDialog) settingsDialog.removeAttribute("open");
  if (settingsBtn && settingsBtn.focus) settingsBtn.focus();
}
function closeToc() {
  if (tocDialog && typeof tocDialog.close === "function" && tocDialog.open) tocDialog.close();
  else if (tocDialog) tocDialog.removeAttribute("open");
  if (tocBtn && tocBtn.focus) tocBtn.focus();
}

// ---------------------------------------------------------------------------------------
// the little things the reader says
// ---------------------------------------------------------------------------------------
var toastTimer = null;
function toast(msg, actionLabel, action) {
  toastText.textContent = msg;
  if(actionLabel) { toastBtn.textContent = actionLabel; toastBtn.style.display = ""; toastBtn.onclick = action; }
  else { toastBtn.style.display = "none"; toastBtn.onclick = null; }
  toastEl.setAttribute("data-sb-show", "1");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.setAttribute("data-sb-show", "0"); }, 9000);
}

// ---------------------------------------------------------------------------------------
// preferences in the UI
// ---------------------------------------------------------------------------------------
function applyScale(step, announce) {
  prefs.scale = step;
  root.style.setProperty("--sb-scale-step", String(step));
  scaleLabel.textContent = Math.round(step * 100) + "%";
  var idx = cfg.scale_steps.indexOf(step);
  scaleOutBtn.disabled = idx <= 0;
  scaleInBtn.disabled = idx >= cfg.scale_steps.length - 1;
  if (announce && idx < 0) {
    disclose("DIG_SCALE_LADDER_TRUNCATED", "info",
      "A " + Math.round(step * 100) + "% step is not on this design revision's effective ladder (" +
      cfg.scale_steps.map(function (s) { return Math.round(s * 100) + "%"; }).join(", ") + "); the nearest offered step is used. " +
      (cfg.dropped_steps && cfg.dropped_steps.length
        ? "The ladder is floored at minimum_readable_pt " + cfg.minimum_readable_pt + " pt, which removes " +
          cfg.dropped_steps.map(function (s) { return Math.round(s * 100) + "%"; }).join(", ") + " (`09` §4.2)."
        : ""));
  }
  save();
}
function applyTheme(id) {
  prefs.theme = id;
  root.setAttribute("data-sb-theme", id);
  root.setAttribute("data-sb-reader-theme", id);
  if (themeSelect) themeSelect.value = id;
  save();
}
function applyMotion(id) {
  prefs.motion = id;
  root.setAttribute("data-sb-motion", wantedMotion());
  if (motionSelect) motionSelect.value = id;
  if (motionNote) {
    motionNote.textContent = reducedMotion()
      ? "Your system asks for reduced motion, so page turns are instant. Navigation is unaffected."
      : "";
  }
  save();
}

// ---------------------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------------------
var lastPos = { id: null, ratio: 0, index: 0 };
function relayout() {
  // A resize can catch the stage mid-change; defer instead of deriving a page box from a box that
  // is not there yet.
  if (!layoutSettled() && view.retries++ < 20) {
    window.setTimeout(function () { relayout(); }, 60);
    return;
  }
  // The stage is measured **before** anything is cleared: in the no-script layout the stage's
  // height *is* its content, so emptying the pages would make it zero and every page box derived
  // afterwards would be a phantom. Measure first, then rebuild.
  var box = leafBox();
  if (box.w < 120 || box.h < 120) {
    if (view.retries++ < 20) {
      window.setTimeout(function () { relayout(); }, 60);
      return;
    }
  }
  var keep = positionOf(view.index);
  // Start from a clean slate: the previous display pages and any fragment a previous split made
  // are discarded, and the authoritative original blocks (captured once, in reading order) are
  // put back where the measurement can see them. A relayout is therefore idempotent: the same
  // inputs give the same pages, however many times the viewport is resized.
  pagesEl.textContent = "";
  measureBlocks.textContent = "";
  for (var i = 0; i < allBlocks.length; i++) measureBlocks.appendChild(allBlocks[i]);
  stopAnim();
  var pages;
  try {
    pages = build(box);
  } catch (e) {
    root.setAttribute("data-sb-ready", "0");
    disclose("READER_RUNTIME_REFLOW_FAILED", "critical",
      "The reader could not reflow at this viewport (" + (e && e.message ? e.message : String(e)) +
      "). The book is shown as a continuous column in reading order instead: nothing is hidden, nothing is clipped.");
    return;
  }
  render(pages);
  view.index = restorePosition(keep);
  paint(false);
}

var resizeTimer = null;
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () { saveNow(); relayout(); }, 140);
}

function onKey(e) {
  if ((tocDialog && tocDialog.open) || (settingsDialog && settingsDialog.open)) return;
  var t = e.target;
  if (t && (t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  var k = e.key;
  if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " && !e.shiftKey) { next(); e.preventDefault(); }
  else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === " " && e.shiftKey) { prev(); e.preventDefault(); }
  else if (k === "Home") { first(); e.preventDefault(); }
  else if (k === "End") { last(); e.preventDefault(); }
  else if (k === "f" || k === "F") { toggleFullscreen(); }
  else if (k === "t" || k === "T" || k === "c" || k === "C") { openToc(); }
  else if (k === "+" || k === "=") { stepScale(1); }
  else if (k === "-" || k === "_") { stepScale(-1); }
  else if (k === "z" || k === "Z") { toggleFocus(); }
}
function stepScale(dir) {
  var idx = cfg.scale_steps.indexOf(prefs.scale);
  if (idx < 0) idx = cfg.scale_steps.indexOf(1) >= 0 ? cfg.scale_steps.indexOf(1) : 0;
  var want = Math.max(0, Math.min(cfg.scale_steps.length - 1, idx + dir));
  if (want === idx) return;
  applyScale(cfg.scale_steps[want], false);
  relayout();
}
function toggleFocus() {
  prefs.focus = !prefs.focus;
  root.setAttribute("data-sb-focus", prefs.focus ? "1" : "0");
  focusBtn.setAttribute("aria-pressed", prefs.focus ? "true" : "false");
  focusBtn.setAttribute("aria-label", prefs.focus ? "Show the reading controls" : "Focus mode: hide the controls");
  save();
  relayout();
}
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      var p = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() :
        (document.documentElement.webkitRequestFullscreen ? document.documentElement.webkitRequestFullscreen() : null);
      if (p && p.catch) p.catch(function () { toast("Fullscreen was refused by the browser — the reader works without it."); });
    } else if (document.exitFullsheet || document.exitFullscreen) {
      document.exitFullscreen();
    }
    setTimeout(syncFullscreenLabel, 120);
  } catch (e) { toast("Fullscreen is not available here — the reader works without it."); }
}
function syncFullscreenLabel() {
  var on = !!document.fullscreenElement;
  fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
  fsBtn.setAttribute("aria-label", on ? "Leave fullscreen" : "Fullscreen");
}
function onSwipe() {
  var sx = 0, sy = 0, active = false, moved = false;
  stageEl.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { active = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; active = true; moved = false;
  }, { passive: true });
  stageEl.addEventListener("touchmove", function () { moved = true; }, { passive: true });
  stageEl.addEventListener("touchend", function (e) {
    if (!active) return;
    active = false;
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.1) return;   // a vertical drag is a scroll
    if (dx < 0) next(); else prev();
  }, { passive: true });
}
function onTapAdvance() {
  var down = null;
  stageEl.addEventListener("pointerdown", function (e) {
    if (e.target && e.target.closest && e.target.closest("button, select, a, summary, dialog, .sb-toast")) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  stageEl.addEventListener("pointerup", function (e) {
    if (!down) return;
    var d = down; down = null;
    if (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10) return;   // a drag, not a tap
    if (Date.now() - d.t > 700) return;
    if (e.target && e.target.closest && e.target.closest("button, select, a, summary, dialog, .sb-toast")) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.toString && sel.toString().length) return;                        // selecting text
    var inContent = e.target && e.target.closest && e.target.closest(".sb-content");
    if (inContent && inContent.scrollHeight > inContent.clientHeight + 2) {
      // A page that scrolls gets a tap in its middle for reading, not for turning.
      var r = inContent.getBoundingClientRect();
      var frac = (e.clientY - r.top) / r.height;
      if (frac > 0.25 && frac < 0.85) return;
    }
    next();
  });
}

// ---------------------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------------------
function init() {
  var resumed = load();
  var layoutTries = 0;
  applyTheme(cfg.theme_ids.indexOf(prefs.theme) >= 0 ? prefs.theme : "light");
  applyMotion(cfg.motion_ids.indexOf(prefs.motion) >= 0 ? prefs.motion : "slide");
  var step = cfg.scale_steps.indexOf(prefs.scale) >= 0 ? prefs.scale : cfg.scale_steps.indexOf(1) >= 0 ? 1 : cfg.scale_steps[0];
  root.style.setProperty("--sb-scale-step", String(step));
  prefs.scale = step;
  root.setAttribute("data-sb-folio", prefs.folio ? "1" : "0");
  root.setAttribute("data-sb-focus", prefs.focus ? "1" : "0");
  focusBtn.setAttribute("aria-pressed", prefs.focus ? "true" : "false");
  if (folioToggle) {
    folioToggle.setAttribute("aria-pressed", prefs.folio ? "true" : "false");
    folioToggle.textContent = prefs.folio ? "Page numbers: on" : "Page numbers: off";
  }
  renderDisclosures();
  if (!document.fullscreenEnabled && !document.documentElement.webkitRequestFullscreen) {
    fsBtn.style.display = "none";
  }
  gather();

  /**
   * The first pass runs after the browser has laid the reader out — two frames, so that a
   * viewport still being resolved reports its final size — and only then is the reader declared
   * ready, which is what switches the stylesheet from the no-script column to the paged view.
   */
  var firstPassDone = false;
  function firstPass() {
    if (firstPassDone) return;
    // Claim the pass first: a timer and a frame callback can arrive together, and two builds
    // racing over the same DOM is how a reader ends up measuring its own half-built layout.
    firstPassDone = true;
    if (!layoutSettled() && layoutTries++ < 20) {
      firstPassDone = false;
      window.setTimeout(firstPass, 50);
      return;
    }
    view.retries = 0;
    relayout();
    applyScale(prefs.scale, false);
    // Where to open is a question about *pages*, so it is answered once there are pages: the
    // saved anchor block is looked up in the flow the build just produced.
    var start = resumed ? (prefs.block ? indexOfBlock(prefs.block) : clamp(prefs.index || 0)) : 0;
    go(start < 0 ? 0 : start, { force: true, instant: true });
    root.setAttribute("data-sb-ready", "1");
    saveNow();
    // Said here, not before the first pass: a "resumed at page 1 of 0" is a sentence the reader
    // can see and cannot use, and until this build has run there is no page count to say.
    if (resumed) {
      toast("Resumed at page " + (view.index + 1) + " of " + view.pages.length + ".",
        "Start at the beginning", function () { go(0); toastEl.setAttribute("data-sb-show", "0"); });
    } else if (view.pages.length > 1) {
      toast("Turn the page with a tap, a swipe, or the arrow keys.", "Got it", function () {
        toastEl.setAttribute("data-sb-show", "0");
      });
    }
    if (view.pages.length === 1) { nextBtn.disabled = true; prevBtn.disabled = true; }
    saveNow();
  }
  // Two frames is the quickest a settled layout can be measured in a visible tab; the timer is
  // the path that still runs when frames do not — a tab in the background, or a browser that
  // throttles `requestAnimationFrame`. Whichever arrives first wins, once.
  window.requestAnimationFrame(function () { window.requestAnimationFrame(firstPass); });
  window.setTimeout(firstPass, 150);
  // the font fallback disclosure (`09` §6.5) — a substitution the reader must not make silently.
  // Probed **after** the document's fonts have settled. An embedded `data:` face is not loaded at
  // parse time, so a probe that runs with the first paint reports every inlined family as missing
  // and tells the reader the design's faces are not in use when they are — a disclosure that is
  // false is worse than none. The probe replaces or withdraws its own note as the truth arrives.
  function fontProbe() {
    try {
      if (!(window.FontFace && document.fonts && document.fonts.check)) return;
      var names = (cfg.fonts_inlined && cfg.fonts_inlined.length)
        ? cfg.fonts_inlined
        : [(cfg.font_family_body || "").split(",")[0].replace(/['"]/g, "").trim(),
           (cfg.font_family_display || "").split(",")[0].replace(/['"]/g, "").trim()];
      var missing = [];
      for (var i = 0; i < names.length; i++) {
        if (!names[i]) continue;
        if (!document.fonts.check('16px "' + names[i] + '"')) missing.push(names[i]);
      }
      if (missing.length) {
        disclose("DIG_FONT_FALLBACK_APPLIED", "info",
          "The font family the design revision names is not available in this browser (" + missing.join(", ") +
          "), so the token's declared fallback chain is in use. Metrics differ from the primary family, so the line breaks " +
          "differ from the plan and the display page count is re-derived and re-reported (`09` §6.5, DIG_FONT_FALLBACK_METRIC_DRIFT).",
          "font-fallback");
      } else {
        withdraw("font-fallback");
      }
    } catch (e) { /* a font probe must never stop the reader */ }
  }
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    try { document.fonts.ready.then(fontProbe); } catch (e) { fontProbe(); }
  } else { fontProbe(); }
  window.setTimeout(fontProbe, 800);
  // a wide unbreakable token would be `DIG_UNBREAKABLE_WRAP_APPLIED` (`09` §5.4) — detect, report
  try {
    var prose = document.querySelectorAll(".sb-content [data-sb-text]");
    var wrapped = 0;
    for (var i = 0; i < prose.length; i++) if (prose[i].scrollWidth > prose[i].clientWidth + 1) wrapped++;
    if (wrapped) disclose("DIG_UNBREAKABLE_WRAP_APPLIED", "info", wrapped + " text run(s) are wider than the measure and were broken with `overflow-wrap` rather than allowed to overflow (`09` §5.4).");
  } catch (e) { /* ignore */ }
}

// wiring
prevBtn.addEventListener("click", prev);
nextBtn.addEventListener("click", next);
firstBtn.addEventListener("click", first);
lastBtn.addEventListener("click", last);
zonePrev.addEventListener("click", prev);
zoneNext.addEventListener("click", next);
tocBtn.addEventListener("click", openToc);
tocClose.addEventListener("click", closeToc);
settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
tocBody.addEventListener("click", function (e) {
  var btn = e.target && e.target.closest ? e.target.closest("[data-sb-jump]") : null;
  if (!btn) return;
  var id = btn.getAttribute("data-sb-jump");
  closeToc();
  jumpToBlock(id);
  if (stageEl.focus) stageEl.focus();
});
scaleOutBtn.addEventListener("click", function () { stepScale(-1); });
scaleInBtn.addEventListener("click", function () { stepScale(1); });
themeSelect.addEventListener("change", function () { applyTheme(themeSelect.value); });
motionSelect.addEventListener("change", function () { applyMotion(motionSelect.value); });
fsBtn.addEventListener("click", toggleFullscreen);
focusBtn.addEventListener("click", toggleFocus);
if (folioToggle) folioToggle.addEventListener("click", function () {
  prefs.folio = !prefs.folio;
  root.setAttribute("data-sb-folio", prefs.folio ? "1" : "0");
  folioToggle.setAttribute("aria-pressed", prefs.folio ? "true" : "false");
  folioToggle.textContent = prefs.folio ? "Page numbers: on" : "Page numbers: off";
  save();
});
document.addEventListener("keydown", onKey);
document.addEventListener("fullscreenchange", syncFullscreenLabel);
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);
window.addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", function () { if (document.hidden) saveNow(); });
if (window.ResizeObserver) {
  var ro = new ResizeObserver(onResize);
  ro.observe(stageEl);
}
if (mq) {
  if (mq.addEventListener) mq.addEventListener("change", function () { applyMotion(prefs.motion); });
  else if (mq.addListener) mq.addListener(function () { applyMotion(prefs.motion); });
}
onSwipe();
onTapAdvance();

try {
  init();
} catch (e) {
  root.setAttribute("data-sb-ready", "0");
  if (liveEl) liveEl.textContent = "The reading view could not start; the book is shown as a continuous column in reading order.";
}
