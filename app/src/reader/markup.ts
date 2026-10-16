/**
 * The reader's HTML: chrome, the table of contents, the disclosures, and the flow.
 *
 * The flow is written **once** and in reading order (`16` §5.1: "DOM order equals
 * logical.beat_order"), grouped into the plan's print pages so that the artifact is a usable,
 * scrolled book even before — or without — the runtime. The runtime then re-parents the same
 * block elements into its own display pages; it never creates prose and never reorders.
 *
 * Every word a reader sees inside a page comes from `Book`. Everything else in this file is
 * furniture: a control label, a folio, a disclosure. The emitter writes no prose.
 */

import type { Book, Block } from "../contracts.js";
import type { Flow, FlowBlock, OmittedMatter, TocEntry, Disclosure } from "./content.js";
import { CHROME, type CssOptions } from "./styles.js";
import type { FontPlan, TransitionStyle } from "./design.js";
import { REFERENCE_VIEWPORTS } from "./design.js";

export interface BodyInput {
  readonly book: Book;
  readonly flow: Flow;
  readonly fonts: FontPlan;
  readonly transitions: readonly { id: TransitionStyle; label: string; note: string }[];
  readonly scaleSteps: readonly number[];
  readonly droppedSteps: readonly number[];
  readonly themeIds: readonly string[];
  readonly themeOptions: readonly { id: string; label: string }[];
  readonly cfg: Record<string, unknown>;
  readonly buildBanner: readonly string[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON safe for an inline `<script type="application/json">` block. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, (m) => (m === "\u2028" ? "\\u2028" : "\\u2029"));
}

const ROLE_CLASS: Record<FlowBlock["role"], string> = {
  prose: "sb-p sb-role-prose",
  heading: "sb-h",
  scripture: "sb-role-scripture",
  quote: "sb-role-quote sb-p",
  question: "sb-p sb-role-question",
  note: "sb-role-note sb-p",
};

const DISPLAY_TEMPLATES = new Set(["title_page", "dramatic_reveal", "quotation_page", "opening_page"]);

function attr(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  return ` ${name}="${esc(String(value))}"`;
}

/**
 * One block. The prose is wrapped in a single `[data-sb-text]` span so that the runtime can
 * split it at a measured line boundary without touching anything else in the element, and so
 * that a split is provably lossless: the head's text plus the tail's text is the original.
 */
export function blockHtml(b: FlowBlock): string {
  const tag = b.role === "heading" && b.template && DISPLAY_TEMPLATES.has(b.template) ? "h2" : b.role === "heading" ? "h2" : "p";
  const isQuote = b.role === "scripture" || b.role === "quote";
  const el = isQuote ? "blockquote" : b.role === "note" ? "aside" : tag;
  const cls = b.role === "heading" && b.template && DISPLAY_TEMPLATES.has(b.template) ? "sb-display" : ROLE_CLASS[b.role];
  const ref =
    b.scripture_ref && (b.role === "scripture" || b.role === "quote")
      ? `<cite class="sb-ref">${esc(b.scripture_ref.book)} ${b.scripture_ref.chapter}:${b.scripture_ref.verse_from}${
          b.scripture_ref.verse_to && b.scripture_ref.verse_to !== b.scripture_ref.verse_from ? `–${b.scripture_ref.verse_to}` : ""
        } (${esc(b.scripture_ref.translation)})</cite>`
      : "";
  return (
    `<${el} class="${cls}"` +
    attr("data-sb-block", b.id) +
    attr("data-sb-role", b.role) +
    attr("data-sb-section", b.section) +
    attr("data-sb-template", b.template) +
    attr("data-sb-print-page", b.printPage) +
    attr("data-sb-side", b.side) +
    attr("data-sb-anchor", b.hardAnchor ? 1 : 0) +
    attr("data-sb-soft", b.softBreak ? 1 : 0) +
    attr("data-sb-density", b.density) +
    attr("data-sb-locks", b.locks.length ? b.locks.join(" ") : "") +
    attr("data-sb-beat", b.beatId) +
    attr("data-sb-matter", b.matterId) +
    attr("data-sb-turn", b.turnBefore ? `${b.turnBefore.beatId}: ${b.turnBefore.why}` : "") +
    `><span data-sb-text>${esc(b.text)}</span>${ref}</${el}>`
  );
}

/** The flow, grouped into the plan's print pages — the no-script book, in reading order. */
function flowHtml(flow: Flow): string {
  const out: string[] = [];
  let leaf: string[] = [];
  let open: number | undefined;
  let head: FlowBlock | undefined;
  const flush = () => {
    if (!leaf.length || !head) return;
    const tmpl = head.template ?? "standard_story";
    const side = head.side ?? (open != null && open % 2 === 1 ? "recto" : "verso");
    out.push(
      `<section class="sb-page" data-sb-fallback="1" data-sb-mode="single" data-sb-current="1" data-sb-template="${esc(tmpl)}">` +
        `<div class="sb-leaf" data-sb-side="${esc(side)}" data-sb-template="${esc(tmpl)}"${attr("data-sb-folio", open)}>` +
        `<div class="sb-frame sb-frame-outer"></div><div class="sb-frame sb-frame-inner"></div>` +
        `<div class="sb-content"><div class="sb-blocks">${leaf.join("")}</div></div>` +
        (open != null ? `<div class="sb-folio" aria-hidden="true">${open}</div>` : "") +
        `</div></section>`,
    );
    leaf = [];
    head = undefined;
  };
  for (const b of flow.blocks) {
    if (open !== b.printPage && leaf.length) flush();
    open = b.printPage;
    if (!head) head = b;
    leaf.push(blockHtml(b));
  }
  flush();
  return out.join("\n");
}

function tocHtml(toc: readonly TocEntry[]): string {
  const groups: { key: TocEntry["kind"]; title: string; items: TocEntry[] }[] = [
    { key: "front_matter", title: "Front matter", items: [] },
    { key: "story", title: "The story", items: [] },
    { key: "back_matter", title: "Back matter", items: [] },
  ];
  for (const e of toc) {
    const g = groups.find((x) => x.key === e.kind);
    if (g) g.items.push(e);
  }
  return groups
    .filter((g) => g.items.length)
    .map(
      (g) =>
        `<div class="sb-toc-group"><h3>${esc(g.title)}</h3><ul class="sb-toc-list">` +
        g.items
          .map(
            (e) =>
              `<li><button type="button" class="sb-toc-item" data-sb-jump="${esc(e.blockId)}" data-sb-at="${esc(e.blockId)}" aria-current="false">` +
              `<span class="sb-toc-label">${esc(e.label)}${
                e.isTurn ? ` <span class="sb-turn-mark" title="${esc(e.note ?? "")}">◆ pacing turn</span>` : ""
              }</span>` +
              `<span class="sb-toc-note">${esc(e.note ?? "")}</span>` +
              `<span class="sb-toc-folio">${e.printPage != null ? `p. ${e.printPage}` : "—"}</span>` +
              `</button></li>`,
          )
          .join("") +
        `</ul></div>`,
    )
    .join("");
}

/**
 * The matter the printed plan **deliberately drops, with a reason recorded on the composition**
 * (`measure.matter_plan.dropped_slots`, `08` §4.5). It gets no page of its own — the printed book
 * does not have one, and inventing a page for it is the defect this replaces. It lives here, in
 * the reader's own contents view, because that is where a contents list belongs in a digital
 * edition (`R-DIG-011`): the section is kept in full, word for word, beside the reason it was
 * dropped, and the contents entries above are untouched by it.
 *
 * These blocks carry no `data-sb-block`: they are not part of the reading flow, and nothing that
 * measures or paginates the book may mistake them for a block to place.
 */
function omittedHtml(omitted: readonly OmittedMatter[]): string {
  if (!omitted.length) return "";
  const section = (m: OmittedMatter): string =>
    `<div class="sb-toc-omitted" data-sb-omitted="${esc(m.matterId)}">` +
    `<h3 class="sb-toc-omitted-head">Not printed in this booklet</h3>` +
    `<p class="sb-toc-omitted-reason"><strong>${esc(m.label)}</strong> is deliberately omitted from the printed plan. ` +
    `Recorded on the composition: “${esc(m.reason)}”</p>` +
    m.body
      .map((b: Block) => {
        const el = b.role === "heading" ? "h4" : b.role === "scripture" || b.role === "quote" ? "blockquote" : b.role === "note" ? "aside" : "p";
        return `<${el} class="${ROLE_CLASS[b.role]} sb-omitted-text" data-sb-source-block="${esc(b.id)}">${esc(b.text)}</${el}>`;
      })
      .join("") +
    `</div>`;
  return omitted.map(section).join("");
}

function disclosureHtml(list: readonly Disclosure[]): string {
  const items = list.length
    ? list
        .map(
          (d) =>
            `<li class="sb-sev-${d.severity}"><span class="sb-code">${
              d.code ? `${esc(d.code)} · ` : "reader note · "
            }${esc(d.severity)}</span><br>${esc(d.text)}</li>`,
        )
        .join("")
    : `<li class="sb-sev-info">No disclosures.</li>`;
  return `<details class="sb-disclose" id="sb-disclose"><summary id="sb-disclose-count">${list.length} disclosure${
    list.length === 1 ? "" : "s"
  }</summary><ul class="sb-disclose-list" id="sb-disclose-list">${items}</ul></details>`;
}

export function readerBody(input: BodyInput): string {
  const { book, flow, cfg, fonts } = input;
  const title = book.meta.title;
  const subtitle = book.meta.subtitle ?? "";
  const scaleOptions = input.scaleSteps
    .map((s) => Math.round(s * 100) + "%")
    .join(", ");

  return `<a class="sb-skip" href="#sb-stage">Skip to the story</a>

<header class="sb-bar sb-bar-top" role="banner">
  <span class="sb-title" id="sb-book-title">${esc(title)}</span>${
    subtitle
      ? `<span class="sb-sep sb-hide-narrow"> — </span><span class="sb-subtitle sb-hide-narrow">${esc(subtitle)}</span>`
      : ""
  }
  <span class="sb-spacer"></span>
  <!-- The status is filled by the runtime. Left empty on purpose: with no script there are no
       display pages, so the stylesheet writes what the mode really is there instead of a
       page count that describes nothing. -->
  <span class="sb-status" id="sb-folio" aria-hidden="true"></span>
</header>

<main class="sb-stage" id="sb-stage" tabindex="-1" role="region" aria-roledescription="storybook" aria-label="${esc(
    title,
  )} — reading pages">
  <div class="sb-pages" id="sb-pages">
${flowHtml(flow)}
  </div>
  <div class="sb-zone sb-zone-prev" id="sb-zone-prev" aria-hidden="true" tabindex="-1"></div>
  <div class="sb-zone sb-zone-next" id="sb-zone-next" aria-hidden="true" tabindex="-1"></div>
  <div class="sb-toast" id="sb-toast" role="status">
    <span id="sb-toast-text"></span>
    <button type="button" id="sb-toast-btn"></button>
  </div>
</main>

<nav class="sb-bar sb-bar-bottom" aria-label="Reader controls">
  <button type="button" id="sb-prev" aria-label="Previous page" title="Previous page (Left arrow)"><span aria-hidden="true">‹</span> Prev</button>
  <button type="button" id="sb-next" aria-label="Next page" title="Next page (Right arrow or space)">Next <span aria-hidden="true">›</span></button>

  <span class="sb-progress" id="sb-progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="sb-progress-fill" id="sb-progress-fill"></span></span>

  <button type="button" id="sb-toc-btn" aria-label="Table of contents" aria-haspopup="dialog" title="Contents (t)"><span aria-hidden="true">☰</span></button>
  <button type="button" id="sb-settings-btn" aria-label="Reading settings: text size, theme, page turns" aria-haspopup="dialog" title="Reading settings"><span aria-hidden="true">Aa</span></button>
  <button type="button" id="sb-focus" aria-label="Focus mode: hide the controls" aria-pressed="false" title="Focus mode (z)"><span aria-hidden="true">◎</span></button>
</nav>

<!-- Every control §7.3 asks for is reachable at every width: the bar above carries only what a
     reader uses while reading, and the rest lives here. A bar wide enough for all of them is
     wider than a phone, and a control bar that overflows its own screen is a control that is not
     there. -->
<dialog class="sb-sheet" id="sb-settings" aria-label="Reading settings">
  <div class="sb-toc-head">
    <h2 class="sb-toc-title">Reading settings</h2>
    <button type="button" id="sb-settings-close" aria-label="Close reading settings">Close</button>
  </div>
  <div class="sb-toc-body">
    <div class="sb-field">
      <span class="sb-field-label" id="sb-scale-field">Text size</span>
      <div class="sb-row">
        <button type="button" id="sb-zoom-out" aria-label="Smaller text" aria-describedby="sb-scale-field">A−</button>
        <span class="sb-status" id="sb-scale-label" aria-live="polite">100%</span>
        <button type="button" id="sb-zoom-in" aria-label="Larger text" aria-describedby="sb-scale-field">A+</button>
      </div>
      <p class="sb-hint">From this design revision's effective ladder (${esc(scaleOptions)})${
        input.droppedSteps.length
          ? `, floored at minimum_readable_pt ${esc(String(cfg.minimum_readable_pt))} pt, which removes ${input.droppedSteps
              .map((s) => Math.round(s * 100) + "%")
              .join(", ")}`
          : ""
      }. The reader reflows and says so if a planned page no longer fits.</p>
    </div>
    <div class="sb-field">
      <label class="sb-field-label" for="sb-theme">Reading theme</label>
      <select id="sb-theme">${input.themeOptions.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}</select>
      <p class="sb-hint">Colour only. A theme never changes a metric, so it never moves a page.</p>
    </div>
    <div class="sb-field">
      <label class="sb-field-label" for="sb-motion">Page-turn animation</label>
      <select id="sb-motion">${input.transitions.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}</select>
      <p class="sb-hint" id="sb-motion-note"></p>
      <p class="sb-hint">Navigation never depends on the animation: if it is disabled or fails, the pages still turn.</p>
    </div>
    <div class="sb-field">
      <span class="sb-field-label">Page numbers</span>
      <button type="button" id="sb-folio-toggle" aria-label="Show or hide page numbers" aria-pressed="true">Page numbers: on</button>
      <p class="sb-hint">The folio is the plan's own page number where a display page is a whole plan page.</p>
    </div>
    <div class="sb-field">
      <span class="sb-field-label">Jump, and the screen</span>
      <div class="sb-row">
        <button type="button" id="sb-first" aria-label="Jump to the beginning">Beginning</button>
        <button type="button" id="sb-last" aria-label="Jump to the end">End</button>
        <button type="button" id="sb-fs" aria-label="Fullscreen" aria-pressed="false" title="Fullscreen (f)">Fullscreen</button>
      </div>
    </div>
  </div>
  <div class="sb-toc-foot">
    <span class="sb-code">${esc(book.id)} · ${esc(String(cfg.cmp_id))} · ${esc(String(cfg.dsg_rev))}</span>
    <span class="sb-code">${esc(fonts.inlined.length ? `fonts inlined: ${fonts.inlined.join(", ")}` : "font: declared fallback chain")}</span>
  </div>
</dialog>

<dialog class="sb-toc" id="sb-toc" aria-label="Table of contents">
  <div class="sb-toc-head">
    <h2 class="sb-toc-title">Contents</h2>
    <button type="button" id="sb-toc-close" aria-label="Close the table of contents">Close</button>
  </div>
  <div class="sb-toc-body" id="sb-toc-body">
${tocHtml(flow.toc)}
    ${omittedHtml(flow.intentionallyOmitted)}
    ${disclosureHtml(flow.disclosures)}
  </div>
  <div class="sb-toc-foot">
    <span>${esc(title)}${subtitle ? ` — ${esc(subtitle)}` : ""} · ${esc(book.meta.author)}</span>
    <span class="sb-code">book ${esc(book.id)} · composition ${esc(String(cfg.cmp_id))} · design ${esc(
      String(cfg.dsg_rev),
    )}</span>
    <span class="sb-code">printed book ${flow.planPages.length} pages · this screen reflows to its own pages</span>
  </div>
</dialog>

<p class="sb-sr" id="sb-live" role="status" aria-live="polite" aria-atomic="true"></p>

<!-- The measurement container. position:fixed with a zero height: it contributes nothing to
     the document's scrollable overflow at any width, and it is never painted, so it can never
     cause horizontal page overflow at any width. -->
<div class="sb-measure" id="sb-measure" aria-hidden="true"><div class="sb-content"><div class="sb-blocks" id="sb-measure-blocks"></div></div></div>

<script type="application/json" id="sb-config">${jsonForScript(cfg)}</script>`;
}

export function noscriptHtml(): string {
  return `<noscript><p class="sb-noscript"><strong>Reading without JavaScript.</strong>
The book is below as one continuous column, in reading order, grouped by the print pages the
composition planned — every word is present and nothing is cut off. The page-turn controls,
the table of contents — which also holds the section the printed booklet deliberately omits —
font size and resume are not available, and the decorative perimeter frame is not drawn in this
mode.</p></noscript>`;
}

export const CHROME_META = { ...CHROME, spreadViewports: REFERENCE_VIEWPORTS };
export type { CssOptions };
