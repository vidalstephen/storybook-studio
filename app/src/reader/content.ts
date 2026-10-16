/**
 * Book + Composition  ->  the ordered flow the reader renders.
 *
 * The two rules this module exists to hold:
 *
 *  1. **Prose appears exactly once** (`05` §1.1). The `Book` is the only source of text; the
 *     `Composition` is the plan. A composition block whose `ref` the book does not contain is
 *     reported (`COMP_BLOCK_UNRESOLVED`) and never guessed at; a book block the composition does
 *     not place is still rendered, unplaced, because dropping prose is `COMP_BLOCK_LOST` —
 *     **unless** the composition records that block's matter slot as *intentionally omitted, with
 *     a reason* (`measure.matter_plan.dropped_slots`, `08` §4.5). A recorded omission is a decision
 *     the print pass took, not content the reader failed to place: it is disclosed as an
 *     informational note naming the reason, and it is not rendered as a page the printed book does
 *     not have (`R-DIG-011`). Only a block the plan neither places **nor** accounts for is
 *     unplaced content — and that case keeps the `major` disclosure below, unchanged.
 *  2. **Logical beat order is always preserved** (`§6.10`, `16` §5.1 "DOM order equals
 *     logical.beat_order"). The flow is emitted front matter -> beats -> back matter, in the
 *     book's own array order. A plan that would invert two blocks is disclosed as
 *     `DIG_READING_ORDER_WRONG` rather than followed.
 *
 * The composition's page boundaries are carried as *hints* on each block; the runtime decides
 * where a display page ends (`docs/08` §3.9's `ReaderReflow` contract), and honours the plan's
 * essential breaks absolutely.
 */

import type { Block, Book, Composition, ComposedPage, Id, Lock, Matter, PageTemplate, ScriptureRef } from "../contracts.js";

/** docs/09 §5.3: an essential break's weight is 3000 — a hard anchor the reader may never move. */
export const ESSENTIAL_BREAK_PRIORITY = 3000;

export type Section = "front_matter" | "story" | "back_matter";

export interface FlowBlock {
  readonly id: Id;
  readonly role: Block["role"];
  readonly text: string;
  readonly scripture_ref?: ScriptureRef;
  readonly section: Section;
  readonly matterId?: Id;
  readonly matterSlot?: Matter["slot"];
  readonly beatId?: Id;
  readonly beatIndex?: number;      // 1-based, for the announcement
  readonly beatKind?: Book["beats"][number]["kind"];
  /** The plan's page for this block, when the composition places it. 1-based print page. */
  readonly printPage?: number;
  readonly template?: PageTemplate;
  readonly side?: ComposedPage["side"];
  readonly density?: ComposedPage["density"];
  readonly fillRatio?: number;
  /** A `page_break_lock` with essential precedence: a display page MUST begin here. */
  readonly hardAnchor: boolean;
  /** Any other planned break (a soft lock, or a print-page boundary): a preference, not a rule. */
  readonly softBreak: boolean;
  /** The author's reason, surfaced when a boundary could not be reproduced (`Lock.why`). */
  readonly breakWhy?: string;
  readonly locks: readonly Id[];
  /** Set on the last block of a plan page whose next page the author marked as a turn. */
  readonly turnBefore?: { beatId: Id; why: string };
}

export interface OmittedMatter {
  /** the matter slot the printed plan drops (e.g. `contents`) */
  readonly slot: Matter["slot"];
  readonly matterId: Id;
  /** what the slot is called: its own heading block, else the slot's furniture label */
  readonly label: string;
  /** every block the slot holds — the heading named by `label` included, in manuscript order */
  readonly blockIds: readonly Id[];
  /** the slot's remaining blocks, in manuscript order: the text the printed book has no page for */
  readonly body: readonly Block[];
  /** the lines this slot measured, as the composition recorded them */
  readonly lines: number;
  /** the composer's recorded reason. Its presence is what makes the omission intentional. */
  readonly reason: string;
}

export interface TocEntry {
  readonly label: string;
  readonly kind: "front_matter" | "story" | "back_matter";
  readonly blockId: Id;
  readonly printPage?: number;
  readonly note?: string;
  readonly isTurn: boolean;
}

export type Severity = "info" | "major" | "critical";

export interface Disclosure {
  /**
   * A finding code. **Optional, and usually absent.** `docs/11` owns every code, and the reader
   * may not mint one (`05` §3: an unregistered code is `OPS_REGISTRY_CODE_UNKNOWN`), so a reader
   * note that has no code registered for it carries none and is labelled as a note instead. Only
   * codes this build has read in the documents appear here.
   */
  readonly code?: string;
  readonly severity: Severity;
  readonly text: string;
}

export interface Flow {
  readonly sections: readonly { section: Section; blocks: readonly FlowBlock[] }[];
  readonly blocks: readonly FlowBlock[];
  readonly toc: readonly TocEntry[];
  readonly disclosures: readonly Disclosure[];
  /**
   * Matter the composition **dropped from the printed plan with a recorded reason**. These are
   * neither placed nor unplaced: they are accounted for. The reader does not raise an
   * unplaced-content disclosure for them and invents no page for them; the reader's own contents
   * navigation is where a contents list belongs in a digital edition (`R-DIG-011`, `08` §4.5).
   */
  readonly intentionallyOmitted: readonly OmittedMatter[];
  readonly counts: {
    front_matter: number;
    story: number;
    back_matter: number;
    total: number;
    planned: number;
    /** blocks the plan dropped with a recorded reason — rendered nowhere, and named in a note */
    intentionally_omitted: number;
    /** `total` + `intentionally_omitted`: every block the manuscript holds */
    manuscript: number;
  };
  readonly planPages: readonly number[];
  /** How many planned pages each section of the book occupies, and how many carry no text. */
  readonly planPagesBySection: { front: number; story: number; back: number; blank: number; total: number };
  /**
   * The printed booklet's spread pairing — which pages face each other on paper. Taken from the
   * composition where the composition records it (`measure.turn_parity.rule`, which the print
   * pass writes), and from the two documents that own the convention where it does not. The
   * reader must not invent this: it is the difference between a turn on screen and a turn on
   * paper (`08` §3.2, `05` §2.5).
   */
  readonly pairing: {
    readonly source: "composition" | "docs";
    readonly recorded: string | null;
    readonly rule: string;
  };
  readonly turns: readonly { before_page: number; beat_id: Id; why: string }[];
  readonly digitalRange?: Composition["digital"]["range"];
  readonly digitalMeasuredAt: Composition["digital"]["measured_at"];
  readonly wordsPerLine: number;
  readonly linesPerPage: number;
  readonly balancedCeilingLines: number;
}

/** Furniture labels for the matter slots. Generated by the build — never authored prose. */
const SLOT_LABEL: Record<Matter["slot"], string> = {
  title: "Title page",
  copyright: "Copyright",
  dedication: "Dedication",
  contents: "Contents",
  memory_verse: "Memory verse",
  discussion: "Discussion questions",
  about: "About this book",
};

function indexBook(book: Book) {
  const byId = new Map<Id, { block: Block; section: Section; matterId?: Id; matterSlot?: Matter["slot"]; beatId?: Id; beatIndex?: number; beatKind?: Book["beats"][number]["kind"] }>();
  const order: Id[] = [];
  const push = (b: Block, meta: Omit<ReturnType<typeof byId.get> extends never ? never : NonNullable<ReturnType<typeof byId.get>>, "block">) => {
    if (byId.has(b.id)) return;                 // a duplicated id is a content defect, not two blocks
    byId.set(b.id, { block: b, ...meta });
    order.push(b.id);
  };
  for (const m of book.front_matter) for (const b of m.blocks) push(b, { section: "front_matter", matterId: m.id, matterSlot: m.slot });
  book.beats.forEach((beat, i) =>
    beat.blocks.forEach((b) => push(b, { section: "story", beatId: beat.id, beatIndex: i + 1, beatKind: beat.kind })),
  );
  for (const m of book.back_matter) for (const b of m.blocks) push(b, { section: "back_matter", matterId: m.id, matterSlot: m.slot });
  return { byId, order };
}

/** Every lock the book declares, flattened, so a block can name the locks that bear on it. */
function lockIndex(book: Book): { byBlock: Map<Id, Lock[]>; all: Lock[] } {
  const byBlock = new Map<Id, Lock[]>();
  const all: Lock[] = [];
  for (const beat of book.beats) {
    for (const lock of beat.locks ?? []) {
      all.push(lock);
      for (const b of beat.blocks) {
        if (lock.target === b.id || lock.target === beat.id) {
          byBlock.set(b.id, [...(byBlock.get(b.id) ?? []), lock]);
        }
      }
    }
  }
  return { byBlock, all };
}

export function buildFlow(book: Book, cmp: Composition): Flow {
  const { byId, order } = indexBook(book);
  const locks = lockIndex(book);
  const disclosures: Disclosure[] = [];

  // -- 0. what the print pass deliberately left out (`08` §4.5) --------------------------------
  //
  // The composition records its own matter plan: each packed page, and every slot it **dropped,
  // with a reason** (`measure.matter_plan.dropped_slots`, written by the print pass). A recorded
  // drop is an editorial decision — `05` §7.3 / `R-DIG-011` reserve a table of contents for
  // "longer books", and in a 16-page children's storybook the page it would take is the page the
  // book does not have. It is therefore **not** the same thing as content the reader failed to
  // place, and the two must not be reported as one:
  //
  //   * **placed**             — the plan assigns it a printed page; render it there.
  //   * **intentionally omitted** — the plan drops it *and records why*: no page is invented for
  //                             it, no unplaced-content disclosure is raised, and the omission is
  //                             disclosed as an informational note naming the reason. What the
  //                             slot carried (a contents list) stays reachable where a contents
  //                             list belongs in a digital edition: the reader's own contents view.
  //   * **unplaced, no reason** — the genuine defect: rendered unplaced, and the `major`
  //                             disclosure below fires exactly as it always did.
  //
  // The record is matched on the matter **id** the composition names *and* the slot it names; a
  // drop whose reason is absent or blank is not a recorded decision and stays in the third state.
  const matterPlan = (
    cmp.measure as unknown as {
      matter_plan?: {
        dropped_slots?: readonly { slot?: string; id?: string; lines?: number; reason?: string }[];
      };
    }
  )?.matter_plan;
  const recordedDrop = new Map<Id, { slot: Matter["slot"]; lines: number; reason: string }>();
  for (const drop of matterPlan?.dropped_slots ?? []) {
    if (!drop || typeof drop.id !== "string") continue;
    if (typeof drop.reason !== "string" || !drop.reason.trim()) continue;   // no reason, no decision
    if (typeof drop.slot !== "string") continue;
    recordedDrop.set(drop.id, {
      slot: drop.slot as Matter["slot"],
      lines: typeof drop.lines === "number" ? drop.lines : 0,
      reason: drop.reason.trim(),
    });
  }
  const intentionallyOmitted: OmittedMatter[] = [];
  const omittedBlockIds = new Set<Id>();
  for (const m of [...book.front_matter, ...book.back_matter]) {
    const drop = recordedDrop.get(m.id);
    if (!drop) continue;
    if (drop.slot !== m.slot) continue;      // the record must name *this* slot, not merely this id
    const all = m.blocks;
    for (const b of all) omittedBlockIds.add(b.id);
    // The slot's own heading names it; where it has none, the build's furniture label does
    // (`SLOT_LABEL` is generated, never authored prose). The heading is lifted out of `body` so it
    // is not printed twice, once as the section's name and once as its first line.
    const heading = all.findIndex((b) => b.role === "heading");
    intentionallyOmitted.push({
      slot: m.slot,
      matterId: m.id,
      label: heading >= 0 ? all[heading].text : SLOT_LABEL[m.slot],
      blockIds: all.map((b) => b.id),
      body: all.filter((_, i) => i !== heading),
      lines: drop.lines,
      reason: drop.reason,
    });
  }

  // -- 1. flatten the plan -------------------------------------------------------------------
  const planSeq: Id[] = [];
  const placed = new Map<Id, { page: ComposedPage }>();
  const carriedOver: { ref: Id; from: number; to: number }[] = [];
  const unresolved: Id[] = [];
  for (const page of cmp.pages) {
    for (const cb of page.blocks) {
      if (!byId.has(cb.ref)) {
        unresolved.push(cb.ref);
        continue;
      }
      planSeq.push(cb.ref);
      // A `CompositionBlock` may appear on two consecutive pages: the paragraph that continues
      // across the break is listed on both, which is how a typeset plan records a page boundary
      // that falls *inside* a paragraph (`docs/08` §4.4). The block therefore belongs to the page
      // where it **starts** — the first occurrence — and the next page begins with the block after
      // it. Taking the last occurrence instead would move the whole pacing by one page; taking
      // neither (dropping the repeat) would silently lose text. This is the one decision that
      // makes the composed page boundaries reproducible at all.
      if (!placed.has(cb.ref)) placed.set(cb.ref, { page });
      else {
        const prev = placed.get(cb.ref)!.page.page;
        carriedOver.push({ ref: cb.ref, from: prev, to: page.page });
      }
    }
  }
  if (unresolved.length) {
    disclosures.push({
      code: "COMP_BLOCK_UNRESOLVED",
      severity: "critical",
      text:
        `${unresolved.length} composition reference(s) do not resolve to a manuscript block: ` +
        `${unresolved.slice(0, 8).join(", ")}${unresolved.length > 8 ? ` (+${unresolved.length - 8} more)` : ""}. ` +
        `The composition is not re-applied here and nothing is guessed at; the affected pages render short.`,
    });
  }

  // -- 2. reading order: the plan's own sequence must not invert the manuscript's -------------
  const rankInBook = new Map<Id, number>(order.map((id, i) => [id, i]));
  const inversions: string[] = [];
  for (let i = 1; i < planSeq.length; i++) {
    const a = rankInBook.get(planSeq[i - 1])!;
    const b = rankInBook.get(planSeq[i])!;
    if (b < a) inversions.push(`${planSeq[i - 1]} -> ${planSeq[i]}`);
  }
  if (inversions.length) {
    disclosures.push({
      code: "DIG_READING_ORDER_WRONG",
      severity: "major",
      text:
        `The plan sequences ${inversions.length} block pair(s) against the manuscript ` +
        `(${inversions.slice(0, 3).join("; ")}${inversions.length > 3 ? " …" : ""}). ` +
        `Logical beat order wins: the reader renders in manuscript order, and the affected breaks are re-derived.`,
    });
  }

  // -- 3. the flow, in manuscript order --------------------------------------------------------
  const turns = cmp.turns ?? [];
  const turnByPage = new Map<number, { beatId: Id; why: string }>();
  for (const t of turns) turnByPage.set(t.before_page, { beatId: t.beat_id, why: t.why });

  const hardByBlock = new Set<Id>();
  const softByBlock = new Set<Id>();
  for (const lock of locks.all) {
    if (lock.kind !== "page_break_lock") continue;
    if (!byId.has(lock.target)) continue;               // an unresolvable target is reported above
    (lock.priority >= ESSENTIAL_BREAK_PRIORITY ? hardByBlock : softByBlock).add(lock.target);
  }
  for (const l of locks.all) {
    if (l.kind === "keep_together" && byId.has(l.target)) softByBlock.add(l.target);
  }
  // A beat named by a composed turn is an essential boundary too: the author asked for the turn
  // (`composition.turns[].before_page`), and §6.10 says essential breaks are preserved where feasible.
  const turnBeatIds = new Set(turns.map((t) => t.beat_id));

  const blocks: FlowBlock[] = [];
  const planned = new Set(placed.keys());
  let softSeen = 0;
  // A recorded omission is lifted out of the flow: it is neither rendered on a page the printed
  // book does not have, nor re-ordered. Every other block keeps its manuscript order, so DOM
  // order still equals the logical beat order (`§6.10`, `16` §5.1). What the omitted slot carried
  // remains reachable in the reader's own contents navigation (`toc`, below, plus the note).
  const renderedOrder = order.filter((id) => !omittedBlockIds.has(id));
  for (let i = 0; i < renderedOrder.length; i++) {
    const id = renderedOrder[i];
    const hit = byId.get(id)!;
    const p = placed.get(id);
    const isFirstOfPrintPage = !!p && (i === 0 || placed.get(renderedOrder[i - 1])?.page.page !== p.page.page);
    const blockLocks = locks.byBlock.get(id) ?? [];
    const hard = hardByBlock.has(id) || (hit.beatId !== undefined && turnBeatIds.has(hit.beatId) && isFirstOfPrintPage);
    const beatLocks = hit.beatId ? (book.beats.find((b) => b.id === hit.beatId)?.locks ?? []) : [];
    const turn = p ? turnByPage.get(p.page.page + 1) : undefined;
    const breakWhy =
      blockLocks.find((l) => l.kind === "page_break_lock")?.why ??
      beatLocks.find((l) => l.kind === "keep_together")?.why ??
      (hard ? turn?.why : undefined);
    blocks.push({
      id,
      role: hit.block.role,
      text: hit.block.text,
      scripture_ref: hit.block.scripture_ref,
      section: hit.section,
      matterId: hit.matterId,
      matterSlot: hit.matterSlot,
      beatId: hit.beatId,
      beatIndex: hit.beatIndex,
      beatKind: hit.beatKind,
      printPage: p?.page.page,
      template: p?.page.template,
      side: p?.page.side,
      density: p?.page.density,
      fillRatio: p?.page.fill_ratio,
      hardAnchor: hard,
      softBreak: !hard && (isFirstOfPrintPage || softByBlock.has(id)),
      breakWhy,
      locks: [...blockLocks, ...(beatLocks.filter((l) => l.kind === "keep_together"))].map((l) => `${l.kind}:${l.target}`),
      turnBefore: undefined,
    });
    if (isFirstOfPrintPage) softSeen++;
  }
  // The turn marker belongs on the block that *ends* the plan page: that is the leaf the reader
  // turns away from. `lck_dg_print_reveal` freezes `blk_dg_forward` onto the verso after it.
  for (const t of turns) {
    for (let i = blocks.length - 2; i >= 0; i--) {
      if (blocks[i].printPage === t.before_page - 1) {
        (blocks[i] as { turnBefore?: FlowBlock["turnBefore"] }).turnBefore = { beatId: t.beat_id, why: t.why };
        break;
      }
    }
  }

  // A turn the plan does not put at a page start is a plan the reader cannot reproduce exactly:
  // the essential break wins, and the page it splits is named (`§6.10`, D-06).
  for (const t of turns) {
    const beat = book.beats.find((b) => b.id === t.beat_id);
    const opener = beat ? blocks.find((b) => b.beatId === beat.id) : undefined;
    if (!opener) continue;
    const idx = blocks.indexOf(opener);
    const prev = idx > 0 ? blocks[idx - 1] : undefined;
    if (prev && prev.printPage === opener.printPage && opener.printPage !== undefined) {
      disclosures.push({
        code: "DIG_READER_REPLANNED",
        severity: "major",
        text:
          `The composed turn before print page ${t.before_page} names ${t.beat_id}, whose first block ` +
          `${opener.id} is not the first block of print page ${opener.printPage}: the plan puts the turn ` +
          `inside a page. An essential break is honoured absolutely (docs/08 §3.9), so the reader's page ` +
          `boundary does not correspond to a planned one there, on every viewport. Nothing is moved and ` +
          `nothing is dropped; the plan should place the turn at a page start.`,
      });
    }
  }

  const unplanned = blocks.filter((b) => b.printPage === undefined);
  if (carriedOver.length) {
    disclosures.push({
      severity: "info",
      text:
        `${carriedOver.length} block(s) the plan lists on two consecutive pages are rendered once, on the page ` +
        `where each starts (${carriedOver.slice(0, 4).map((c) => `${c.ref}: ${c.from}→${c.to}`).join(", ")}` +
        `${carriedOver.length > 4 ? ", …" : ""}). That is how a plan records a break inside a paragraph; repeating ` +
        `the block would duplicate text, and dropping the repeat would lose it. The composed boundary is ` +
        `reproduced, and no paragraph is broken across a page.`,
    });
  }
  if (unplanned.length && cmp.pages.length) {
    disclosures.push({
      severity: "major",
      text:
        `${unplanned.length} manuscript block(s) are not placed by this composition ` +
        `(${unplanned.slice(0, 6).map((b) => b.id).join(", ")}${unplanned.length > 6 ? " …" : ""}). ` +
        `They are rendered in reading order on pages of their own — text is never dropped, and a plan ` +
        `that does not cover the manuscript is reported rather than silently completed.`,
    });
  }
  // The other two states of a matter slot, said in the reader's own terms. A slot the plan dropped
  // with a recorded reason is a decision, and it is *reported as a note, never as a fault*: the
  // reader does not raise an unplaced-content disclosure for it and invents no printed page for it.
  // The note names the reason, in the composer's own words, and says where the section stays
  // reachable. A block the plan neither places nor accounts for is untouched above and still
  // raises the `major` disclosure.
  if (intentionallyOmitted.length) {
    const howMany = intentionallyOmitted.reduce((a, m) => a + m.blockIds.length, 0);
    disclosures.push({
      severity: "info",
      text:
        `${howMany} manuscript block(s) are deliberately not placed in the printed plan — ` +
        `${intentionallyOmitted
          .map((m) => `${m.label} (${m.matterId}: ${m.blockIds.join(", ")} — ${m.lines} line(s))`)
          .join("; ")}. ` +
        `The composition records the decision and its reason: ${intentionallyOmitted
          .map((m) => `“${m.reason}”`)
          .join(" ")} ` +
        `This is not content the reader failed to place, so no page is invented for it: the slot is ` +
        `omitted from the printed booklet by design (docs/08 §4.5). The section itself — its text ` +
        `kept word for word — is under “Not printed in this booklet”, below the contents entries, ` +
        `which the omission does not change.`,
    });
  }

  // -- 4. the plan's own failures, carried up to the reader -------------------------------------
  for (const page of cmp.pages) {
    for (const bad of page.locks_unsatisfied ?? []) {
      disclosures.push({
        severity: "major",
        text: `Print page ${page.page}: the ${bad.lock.kind} on ${bad.lock.target} could not be satisfied — ${bad.why}. Author's reason: ${bad.lock.why}.`,
      });
    }
    if (page.density === "overflow") {
      disclosures.push({
        code: "DIG_PAGE_OVERFLOW",
        severity: "critical",
        text: `Print page ${page.page} is planned as \`overflow\` (${page.lines} lines against ${page.capacity_lines} of capacity). The reader splits it at a line boundary and never clips it (§6.10).`,
      });
    }
  }

  // -- 5. the table of contents: the 4 + 3 matter pages, then whatever the story names ---------
  const toc: TocEntry[] = [];
  const firstBlockOf = (pick: (b: FlowBlock) => boolean): FlowBlock | undefined => blocks.find(pick);
  const labelForMatter = (slot: Matter["slot"], matterId?: Id) => {
    const heading = firstBlockOf((b) => b.matterId === matterId && b.role === "heading");
    return heading ? heading.text : SLOT_LABEL[slot];
  };
  const pushMatter = (m: Matter, kind: Section) => {
    const first = firstBlockOf((b) => b.matterId === m.id);
    if (!first) return;
    toc.push({ label: labelForMatter(m.slot, m.id), kind, blockId: first.id, printPage: first.printPage, isTurn: false, note: SLOT_LABEL[m.slot] });
  };
  book.front_matter.forEach((m) => pushMatter(m, "front_matter"));

  const headingBeats = book.beats
    .map((beat, i) => ({ beat, index: i + 1, heading: beat.blocks.find((b) => b.role === "heading") }))
    .filter((e) => !!e.heading);
  if (headingBeats.length) {
    for (const e of headingBeats) {
      const first = blocks.find((b) => b.id === e.heading!.id)!;
      const turn = turns.find((t) => t.beat_id === e.beat.id);
      toc.push({
        label: e.heading!.text,
        kind: "story",
        blockId: first.id,
        printPage: first.printPage,
        isTurn: !!turn,
        note: turn ? `pacing turn — ${turn.why}` : `story beat ${e.index}`,
      });
    }
  } else {
    const firstStory = blocks.find((b) => b.section === "story");
    if (firstStory) toc.push({ label: "Story", kind: "story", blockId: firstStory.id, printPage: firstStory.printPage, isTurn: turns.length > 0, note: `${book.beats.length} beats` });
  }
  for (const t of turns) {
    if (toc.some((e) => e.kind === "story" && e.isTurn)) continue;
    // A turn whose beat has no heading still deserves an entry, labelled by its print position.
    const beat = book.beats.find((b) => b.id === t.beat_id);
    const first = beat ? blocks.find((b) => b.beatId === beat.id) : undefined;
    if (!first) continue;
    toc.push({
      label: `Story, print page ${first.printPage ?? "—"}`,
      kind: "story",
      blockId: first.id,
      printPage: first.printPage,
      isTurn: true,
      note: `pacing turn — ${t.why}`,
    });
  }
  book.back_matter.forEach((m) => pushMatter(m, "back_matter"));

  // -- 6. what the plan is made of, and which pages face each other on paper --------------------
  // The reader's own display pages are not the plan's pages (it merges and splits between the
  // plan's boundaries, `08` §3.9), so a page count read out of the reader and a count read out of
  // the composition are two different quantities unless the composition says what it measured.
  // This is that accounting, carried so the reader can be precise instead of alarming.
  const planPagesBySection = { front: 0, story: 0, back: 0, blank: 0, total: cmp.pages.length };
  const pageSeen = new Set<number>();
  for (const b of blocks) {
    if (b.printPage == null || pageSeen.has(b.printPage)) continue;
    pageSeen.add(b.printPage);
    if (b.section === "front_matter") planPagesBySection.front++;
    else if (b.section === "story") planPagesBySection.story++;
    else planPagesBySection.back++;
  }
  planPagesBySection.blank = Math.max(0, cmp.pages.length - pageSeen.size);

  // The spread pairing, taken from the composition where it records one. The print pass writes
  // `measure.turn_parity` (the rule and every reveal's page under it); a composition built before
  // that existed carries nothing, and then the convention comes from the two documents that own
  // it — `08` §3.2 ("page 2k is a verso, page 2k+1 a recto") and `05` §2.5 (the spreads, listed).
  const recordedParity = (cmp.measure as unknown as { turn_parity?: { rule?: string } } | undefined)?.turn_parity;
  const DOCS_RULE =
    "the reading-order spreads are {1} · {2,3} · {4,5} · … : page 1 is the cover and stands alone, " +
    "page 2k is a verso and page 2k+1 the recto it faces (docs/08 §3.2; docs/05 §2.5)";
  const pairing = {
    source: recordedParity?.rule ? ("composition" as const) : ("docs" as const),
    recorded: recordedParity?.rule ?? null,
    rule: recordedParity?.rule ?? DOCS_RULE,
  };

  return {
    sections: [
      { section: "front_matter", blocks: blocks.filter((b) => b.section === "front_matter") },
      { section: "story", blocks: blocks.filter((b) => b.section === "story") },
      { section: "back_matter", blocks: blocks.filter((b) => b.section === "back_matter") },
    ],
    blocks,
    toc,
    disclosures,
    intentionallyOmitted,
    counts: {
      front_matter: blocks.filter((b) => b.section === "front_matter").length,
      story: blocks.filter((b) => b.section === "story").length,
      back_matter: blocks.filter((b) => b.section === "back_matter").length,
      total: blocks.length,
      planned: planned.size,
      intentionally_omitted: intentionallyOmitted.reduce((a, m) => a + m.blockIds.length, 0),
      manuscript: blocks.length + intentionallyOmitted.reduce((a, m) => a + m.blockIds.length, 0),
    },
    planPages: [...new Set(cmp.pages.map((p) => p.page))].sort((a, b) => a - b),
    planPagesBySection,
    pairing,
    turns,
    digitalRange: cmp.digital?.range,
    digitalMeasuredAt: cmp.digital?.measured_at ?? [],
    wordsPerLine: cmp.measure?.words_per_line ?? 7.3,
    linesPerPage: cmp.measure?.lines_per_page ?? 20,
    balancedCeilingLines: cmp.measure?.balanced_ceiling_lines ?? 16,
  };
}
