/**
 * The contracts the build is written against.
 *
 *   Book          the approved manuscript + its beats + its matter   (content, human/AI authored)
 *   Composition   where every block lands, and why                   (deterministic, from Book + DesignRevision)
 *
 * The separation is the whole architecture: the creative half produces a `Book` and can
 * never move a page; the deterministic half produces a `Composition` and can never write a word.
 * `05-content-and-composition-model.md` defines both; `07-lock-and-constraint-rules.md`
 * defines the lock semantics; `08-pagination-strategy.md` defines how a Composition is solved.
 */

/** A stable id, never renumbered across revisions (`04` §1.2). */
export type Id = string;

/** A block of prose. The atom of the manuscript. */
export interface Block {
  readonly id: Id;                 // blk_*
  readonly role: "prose" | "heading" | "scripture" | "quote" | "question" | "note";
  readonly text: string;
  readonly scripture_ref?: ScriptureRef;
}

/** Bible book / chapter / verse, with translation. `§4.3` — verifiable references only. */
export interface ScriptureRef {
  readonly book: string;           // "1 Samuel"
  readonly chapter: number;
  readonly verse_from: number;
  readonly verse_to?: number;
  readonly translation: string;   // "WEB" | "KJV" | ...
}

/** A beat is a unit of narrative progression that must not be split by accident (`§6.5`). */
export interface Beat {
  readonly id: Id;                 // beat_*
  readonly kind: "scene" | "turn" | "reflection" | "lesson";
  readonly summary: string;        // author-facing, never rendered
  readonly blocks: readonly Block[];
  readonly locks?: readonly Lock[];
}

export type LockKind = "content" | "beat" | "page_break" | "keep_together" | "print_page" | "design";

export interface Lock {
  readonly kind: LockKind;
  readonly target: Id;             // a block id, a beat id, or a page id
  readonly page?: number;          // page_break / print_page: the 1-based print page it refers to
  readonly priority: number;       // higher wins when two locks cannot both hold (07 §3)
  readonly why: string;            // the author's reason — surfaced when a lock cannot be honoured
}

/** A section of the book outside the story proper. */
export interface Matter {
  readonly id: Id;
  readonly slot:
    | "title" | "copyright" | "dedication" | "contents"
    | "memory_verse" | "discussion" | "about";
  readonly blocks: readonly Block[];
}

export interface Book {
  readonly id: Id;
  readonly meta: {
    readonly title: string;
    readonly subtitle?: string;
    readonly author: string;
    readonly audience: { readonly age_from: number; readonly age_to: number; readonly reading_pt: string };
    readonly publication_type: string;
    readonly language: string;         // BCP-47
    readonly copyright: string;
  };
  readonly target_print_pages: number;
  /** The derived budget: `05` §1.6. Present so the build can check it rather than trust it. */
  readonly budget: {
    readonly target_words: number;
    readonly lower_floor_words: number;
    readonly reserve_words: number;
    readonly derived_from: string;
  };
  readonly front_matter: readonly Matter[];
  readonly beats: readonly Beat[];
  readonly back_matter: readonly Matter[];
  /** Scripture the retelling leans on, for the fidelity check (§4.3). */
  readonly scripture: readonly ScriptureRef[];
}

export type PageTemplate =
  | "title_page" | "standard_story" | "opening_page" | "dramatic_reveal"
  | "reflective_page" | "quotation_page" | "scripture_reference"
  | "discussion_page" | "closing_page" | "blank_page";

export interface CompositionBlock {
  readonly ref: Id;                // the Block id — the composition references content, never copies it
  readonly role: Block["role"];
  readonly lines: number;         // measured, not estimated
  readonly measured_width_q: number;
}

export interface ComposedPage {
  readonly page: number;           // 1-based, print page
  readonly side: "recto" | "verso";  // odd = recto
  readonly template: PageTemplate;
  readonly from: Id;               // the matter id or beat id this page draws from
  readonly blocks: readonly CompositionBlock[];
  readonly lines: number;
  readonly capacity_lines: number;
  readonly fill_ratio: number;
  readonly density: "sparse" | "balanced" | "dense" | "overflow";
  readonly locks_honoured: readonly Id[];
  readonly locks_unsatisfied: readonly { lock: Lock; why: string }[];
}

export interface Composition {
  readonly id: Id;                 // cmp_*
  readonly book_id: Id;
  readonly dsg_rev: string;
  readonly ms_rev: string;
  readonly solver: { readonly name: string; readonly version: string; readonly cost: number };
  readonly measure: {
    readonly lines_per_page: number;
    readonly balanced_ceiling_lines: number;
    readonly words_per_line: number;
    readonly words_per_page_measured: number;
    readonly probe: { readonly words: number; readonly line_boxes: number };
    readonly engine: string;       // how the measurement was taken (pinned Chromium + version)
  };
  readonly pages: readonly ComposedPage[];
  readonly counts: {
    readonly front_matter: number;
    readonly story: number;
    readonly back_matter: number;
    readonly blank: number;
    readonly pad: number;
    readonly total: number;
  };
  readonly digital: {
    /** Viewport -> page count, measured in the same engine the reader will use. */
    readonly measured_at: readonly { readonly viewport: string; readonly pages: number; readonly spread: boolean }[];
    readonly range: { readonly min: number; readonly max: number };
  };
  /** The turns the author cares about, and the page each reveal lands on. */
  readonly turns: readonly { readonly before_page: number; readonly beat_id: Id; readonly why: string }[];

  /**
   * How the story pages' line budget divides. The word budget is derived from
   * `lines_available_for_prose`, NOT from `lines_available`: the beats carry `scripture`
   * displays and headings which occupy the same pages, and a budget that ignores them is
   * measuring a book in which the verses do not exist (`05` §1.6).
   */
  readonly line_budget?: {
    readonly lines_available: number;
    readonly lines_reserved_non_prose: number;
    readonly lines_reserved_by_role?: Readonly<Record<string, number>>;
    readonly lines_available_for_prose: number;
    readonly words_available_for_prose: number;
    /** What the manuscript actually occupies, and whether it exceeds the ceiling. */
    readonly measured_lines?: number;
    readonly verdict?: string;
    readonly pre_reveal?: { readonly lines: number; readonly pages_available: number; readonly holds: boolean };
    readonly densest_story_page?: { readonly page: number; readonly lines: number; readonly fill_ratio: number };
  };

  /**
   * The page-turn parity of each reveal, against the PRINTED booklet's pairing — page 1 recto
   * alone, then `2|3`, `4|5`, `6|7` … A reveal is only hidden by a turn if it opens an EVEN
   * print page; the screen must pair pages the same way or a turn on screen is not a turn on
   * paper (`05` §2.5, `§6.10`).
   */
  readonly turn_parity?: {
    readonly pairing: string;
    readonly satisfied: boolean;
    readonly reveals: readonly { readonly beat_id: Id; readonly before_page: number; readonly even: boolean }[];
  };
}
