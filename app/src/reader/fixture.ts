/**
 * A sample `Book` + `Composition`, used when the real pair is not on disk yet.
 *
 * This is **not** the reference manuscript: it is a small, contract-conforming fixture whose
 * shape matches `docs/16` §1 so the emitter can be run end to end. It carries the things the
 * reader has to get right:
 *
 *   - front matter in the fixture's four slots, back matter in its three (`16` §1.3)
 *   - eleven beats, so the story section of the table of contents has something to name
 *   - the composed turn: `beat_dg_7` ends on print page 9 (recto) and `beat_dg_8` opens print
 *     page 10 (verso) after an **essential** page break — `16` §1.6's `lck_dg_stone` /
 *     `lck_dg_forward` pair, which is the page 9 -> 10 reveal the reader must land
 *   - a `scripture` block with a real `ScriptureRef`, a `question` block, a `note`, a `quote`
 *   - sixteen print pages, pages 1–4 front, 5–13 story, 14–16 back (`16` §1.6)
 *   - one block the composition does not place, and one reference the manuscript does not
 *     contain, so the disclosures have something to say and the reader's behaviour on both is
 *     exercised rather than assumed
 *
 * The prose is written here only because a reader cannot be judged against no text at all.
 * When the real `content/david-and-goliath.json` and `build/composition.json` appear, the emitter
 * prefers them and this file is unused.
 */

import type { Block, Book, Composition, ComposedPage, Lock, Matter, ScriptureRef } from "../contracts.js";

const WEB = "WEB";
const ref = (chapter: number, verse_from: number, verse_to?: number): ScriptureRef => ({
  book: "1 Samuel",
  chapter,
  verse_from,
  verse_to,
  translation: WEB,
});

const p = (id: string, text: string): Block => ({ id, role: "prose", text });
const h = (id: string, text: string): Block => ({ id, role: "heading", text });
const sc = (id: string, text: string, r: ScriptureRef): Block => ({ id, role: "scripture", text, scripture_ref: r });
const q = (id: string, text: string): Block => ({ id, role: "question", text });
const note = (id: string, text: string): Block => ({ id, role: "note", text });

const FRONT: Matter[] = [
  {
    id: "mat_dg_title",
    slot: "title",
    blocks: [h("blk_dg_title", "David and Goliath"), p("blk_dg_subtitle", "A Story of Courage and Faith")],
  },
  {
    id: "mat_dg_copyright",
    slot: "copyright",
    blocks: [
      p(
        "blk_dg_copyright",
        "This retelling of 1 Samuel 17 is adapted from the World English Bible, a public-domain translation. Text set in the Warm Parchment design revision.",
      ),
    ],
  },
  { id: "mat_dg_dedication", slot: "dedication", blocks: [p("blk_dg_dedication", "For every reader who has ever felt too small.")] },
  {
    id: "mat_dg_contents",
    slot: "contents",
    blocks: [
      h("blk_dg_contents_h", "Contents"),
      p("blk_dg_contents_p", "The story runs from page 5 to page 13. The memory verse, the discussion questions and the closing note are at the back of the book."),
    ],
  },
];

function beat(
  n: number,
  kind: Book["beats"][number]["kind"],
  summary: string,
  blocks: Block[],
  locks?: Lock[],
): Book["beats"][number] {
  return { id: `beat_dg_${n}`, kind, summary, blocks, locks };
}

const BREAK_REVEAL: Lock = {
  kind: "page_break_lock",
  target: "blk_dg_forward",
  page: 10,
  priority: 3000, // the essential class of `07` §2 / `09` §5.3
  why: "The reveal must be reached only by turning the page — the author's S2 break. It names blk_dg_forward, the block that opens the plan page, exactly as 16 §1.6 records it.",
};
const CONTENT_REVEAL: Lock = {
  kind: "content_lock",
  target: "blk_dg_stone",
  priority: 9000,
  why: "The wording of the stone and the step forward is approved (H1).",
};
const PRINT_REVEAL: Lock = {
  kind: "print_page_lock",
  target: "blk_dg_forward",
  page: 10,
  priority: 8000,
  why: "Frozen onto the verso pg_dg_10, where the parity rule puts it (H2).",
};

const BEATS: Book["beats"] = [
  beat(1, "scene", "The valley and the two camps", [
    h("blk_dg_story_h", "The Valley of Elah"),
    p("blk_dg_hook", "The valley lay quiet between the two hills, and on both sides an army waited."),
    p("blk_dg_camp", "Every morning the soldiers of Israel stood in their lines and looked across at the Philistine camp, and every morning nobody moved."),
  ]),
  beat(2, "scene", "A champion steps out", [
    p("blk_dg_champion", "Then a champion came out of the Philistine lines: a man named Goliath, taller than any soldier in the valley."),
  ]),
  beat(3, "turn", "The taunt", [
    p("blk_dg_goliath_taunt", "\u201cChoose a man for yourselves,\u201d he called across the valley, \u201cand let him come down to me.\u201d"),
    p("blk_dg_fear", "Nobody in the camp of Israel answered him, and the silence went on for forty days."),
  ]),
  beat(4, "scene", "A shepherd is sent", [
    p("blk_dg_jesse", "Far from the valley, a man named Jesse sent his youngest son with bread and cheese for his brothers at the front."),
    p("blk_dg_arrives", "The boy's name was David, and he arrived at the camp while the champion was shouting as he did every morning."),
  ]),
  beat(5, "scene", "David asks", [
    p("blk_dg_asks", "David asked the men standing near him what would be done for the man who answered the challenge. They told him."),
  ]),
  beat(6, "turn", "Saul's armour", [
    p("blk_dg_volunteer", "\u201cLet no man's heart fail because of him,\u201d David said to the king. \u201cYour servant will go and fight with this Philistine.\u201d"),
    p("blk_dg_saul_armour", "Saul dressed him in his own armour and put a bronze helmet on his head, but David could not walk in it, and he took it off again."),
  ]),
  beat(7, "scene", "Five smooth stones", [
    p("blk_dg_brook", "He took his staff in his hand and went down to the brook, with his sling in the other."),
    p("blk_dg_stone", "The young shepherd reached into his bag and chose a single smooth stone."),
  ], [CONTENT_REVEAL]),
  beat(8, "turn", "David steps forward", [
    p("blk_dg_forward", "With courage in his heart, David stepped forward."),
    p("blk_dg_words", "\u201cYou come to me with a sword and with a spear,\u201d he said, \u201cbut I come to you in the name of the Lord of hosts.\u201d"),
  ], [BREAK_REVEAL, PRINT_REVEAL]),
  beat(9, "scene", "The giant falls", [
    p("blk_dg_giant_falls", "The stone flew, and the champion of the Philistines fell forward on his face to the earth."),
    p("blk_dg_armies_flee", "When the Philistines saw their champion was dead, they turned and ran, and the shouting in the valley changed sides."),
  ]),
  beat(10, "reflection", "The quiet after", [
    p("blk_dg_after", "The valley was quiet again by evening, and the two hills were still the same two hills."),
  ]),
  beat(11, "lesson", "What David knew", [
    p("blk_dg_lesson", "David did not win because he was strong. He won because he trusted, and because he was willing to step forward when everyone else stood still."),
  ]),
];

const BACK: Matter[] = [
  {
    id: "mat_dg_memory_verse",
    slot: "memory_verse",
    blocks: [
      h("blk_dg_memory_h", "Memory verse"),
      sc("blk_dg_memory_verse", "\u201cI come to thee in the name of the LORD of hosts, the God of the armies of Israel, whom thou hast defied.\u201d", ref(17, 45)),
    ],
  },
  {
    id: "mat_dg_discussion",
    slot: "discussion",
    blocks: [
      h("blk_dg_discussion_h", "Things to talk about"),
      q("blk_dg_discussion_q1", "David's brothers were angry with him. Why do you think they were?"),
      q("blk_dg_discussion_q2", "What did David take into the valley, and what did he leave behind?"),
      note("blk_dg_discussion_note", "These questions retell the story in the reader's own words; the verses behind them are listed at 1 Samuel 17."),
    ],
  },
  {
    id: "mat_dg_about",
    slot: "about",
    blocks: [
      h("blk_dg_about_h", "About this book"),
      p("blk_dg_about", "A sixteen-page retelling for readers of six to ten, composed for the Warm Parchment design revision and published as a responsive HTML storybook."),
      sc("blk_dg_verse2", "\u201cAnd all this assembly shall know that the LORD saveth not with sword and spear: for the battle is the LORD's.\u201d", ref(17, 47)),
    ],
  },
];

export const SAMPLE_BOOK: Book = {
  id: "book_dg_sample_v1",
  meta: {
    title: "David and Goliath",
    subtitle: "A Story of Courage and Faith",
    author: "Storybook Studio",
    audience: { age_from: 6, age_to: 10, reading_pt: "early" },
    publication_type: "biblical",
    language: "en",
    copyright: "Text adapted from the World English Bible (public domain).",
  },
  target_print_pages: 16,
  budget: {
    target_words: 1022,
    lower_floor_words: 869,
    reserve_words: 29,
    derived_from: "9 story pages x 16 balanced lines x 7.3 words per line - 29.2 reserve",
  },
  front_matter: FRONT,
  beats: BEATS,
  back_matter: BACK,
  scripture: [ref(17, 45), ref(17, 47), ref(17, 38, 51)],
};

// ---------------------------------------------------------------------------------------------
// The composition: sixteen print pages, front 1–4, story 5–13, back 14–16, with the reveal at the
// 9 -> 10 turn. Line counts are plausible for the design revision (a story page holds 16 balanced
// lines of 7.3 measured words); the real solver measures them, this sample states them.
// ---------------------------------------------------------------------------------------------

interface Placement {
  readonly page: number;
  readonly template: ComposedPage["template"];
  readonly from: string;
  readonly refs: readonly string[];
  readonly lines: number;
  readonly fill: number;
  readonly locks?: readonly Lock[];
}

const PLACEMENTS: readonly Placement[] = [
  { page: 1, template: "title_page", from: "mat_dg_title", refs: ["blk_dg_title", "blk_dg_subtitle"], lines: 4, fill: 0.2 },
  { page: 2, template: "closing_page", from: "mat_dg_copyright", refs: ["blk_dg_copyright"], lines: 3, fill: 0.18 },
  { page: 3, template: "quotation_page", from: "mat_dg_dedication", refs: ["blk_dg_dedication"], lines: 1, fill: 0.06 },
  { page: 4, template: "standard_story", from: "mat_dg_contents", refs: ["blk_dg_contents_h", "blk_dg_contents_p"], lines: 4, fill: 0.25 },
  { page: 5, template: "opening_page", from: "beat_dg_1", refs: ["blk_dg_story_h", "blk_dg_hook", "blk_dg_camp"], lines: 10, fill: 0.625 },
  { page: 6, template: "standard_story", from: "beat_dg_2", refs: ["blk_dg_champion", "blk_dg_goliath_taunt"], lines: 12, fill: 0.75 },
  { page: 7, template: "standard_story", from: "beat_dg_3", refs: ["blk_dg_fear", "blk_dg_jesse", "blk_dg_arrives"], lines: 14, fill: 0.875 },
  { page: 8, template: "standard_story", from: "beat_dg_4", refs: ["blk_dg_asks", "blk_dg_volunteer", "blk_dg_saul_armour"], lines: 15, fill: 0.9375 },
  { page: 9, template: "standard_story", from: "beat_dg_7", refs: ["blk_dg_brook", "blk_dg_stone"], lines: 9, fill: 0.5625, locks: [CONTENT_REVEAL] },
  {
    page: 10,
    template: "dramatic_reveal",
    from: "beat_dg_8",
    refs: ["blk_dg_forward", "blk_dg_words"],
    lines: 10,
    fill: 0.625,
    locks: [BREAK_REVEAL, PRINT_REVEAL],
  },
  { page: 11, template: "standard_story", from: "beat_dg_9", refs: ["blk_dg_giant_falls", "blk_dg_armies_flee"], lines: 14, fill: 0.875 },
  { page: 12, template: "reflective_page", from: "beat_dg_10", refs: ["blk_dg_after"], lines: 6, fill: 0.375 },
  { page: 13, template: "reflective_page", from: "beat_dg_11", refs: ["blk_dg_lesson"], lines: 7, fill: 0.4375 },
  { page: 14, template: "scripture_reference", from: "mat_dg_memory_verse", refs: ["blk_dg_memory_h", "blk_dg_memory_verse"], lines: 8, fill: 0.5 },
  {
    page: 15,
    template: "discussion_page",
    from: "mat_dg_discussion",
    refs: ["blk_dg_discussion_h", "blk_dg_discussion_q1", "blk_dg_discussion_q2", "blk_dg_discussion_note"],
    lines: 11,
    fill: 0.6875,
  },
  { page: 16, template: "closing_page", from: "mat_dg_about", refs: ["blk_dg_about_h", "blk_dg_about", "blk_dg_verse2"], lines: 12, fill: 0.75 },
];

export const SAMPLE_COMPOSITION: Composition = {
  id: "cmp_dg_sample_v1",
  book_id: SAMPLE_BOOK.id,
  dsg_rev: "dsg_dg_v1",
  ms_rev: "ms_dg_sample_v1",
  solver: { name: "sample", version: "0", cost: 0 },
  measure: {
    lines_per_page: 20,
    balanced_ceiling_lines: 16,
    words_per_line: 7.3,
    words_per_page_measured: 116.8,
    probe: { words: 197, line_boxes: 27 },
    engine: "pinned chromium (the real plan records its build here)",
  },
  pages: PLACEMENTS.map<ComposedPage>((pl) => ({
    page: pl.page,
    side: pl.page % 2 === 1 ? "recto" : "verso",
    template: pl.template,
    from: pl.from,
    blocks: pl.refs.map((r) => ({ ref: r, role: findRole(r), lines: Math.max(1, Math.round(pl.lines / pl.refs.length)), measured_width_q: 23221 })),
    lines: pl.lines,
    capacity_lines: 20,
    fill_ratio: pl.fill,
    density: pl.fill < 0.35 ? "sparse" : pl.fill > 0.78 ? "dense" : "balanced",
    locks_honoured: (pl.locks ?? []).map((l) => l.target),
    locks_unsatisfied: [],
  })),
  counts: { front_matter: 4, story: 9, back_matter: 3, blank: 0, pad: 0, total: 16 },
  digital: {
    measured_at: [
      { viewport: "360x640", pages: 18, spread: false },
      { viewport: "414x896", pages: 16, spread: false },
      { viewport: "768x1024", pages: 13, spread: false },
      { viewport: "1280x800", pages: 9, spread: true },
      { viewport: "1440x900", pages: 9, spread: true },
    ],
    range: { min: 9, max: 18 },
  },
  turns: [
    {
      before_page: 10,
      beat_id: "beat_dg_8",
      why: "The stone is chosen on the recto, and the step forward is only reached by turning the leaf.",
    },
  ],
};

function findRole(id: string): Block["role"] {
  const all: Block[] = [
    ...FRONT.flatMap((m) => m.blocks),
    ...BEATS.flatMap((b) => b.blocks),
    ...BACK.flatMap((m) => m.blocks),
  ];
  return all.find((b) => b.id === id)?.role ?? "prose";
}

/** One block the composition does not place and one reference it cannot resolve: on purpose. */
export const SAMPLE_COMPOSITION_WITH_DEFECTS: Composition = {
  ...SAMPLE_COMPOSITION,
  pages: SAMPLE_COMPOSITION.pages.map((pg, i) =>
    i === 7
      ? {
          ...pg,
          blocks: [
            ...pg.blocks,
            // a reference the manuscript does not contain — `COMP_BLOCK_UNRESOLVED`
            { ref: "blk_dg_does_not_exist", role: "prose" as const, lines: 1, measured_width_q: 23221 },
          ],
        }
      : pg,
  ),
};
