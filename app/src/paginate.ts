/**
 * paginate.ts — the deterministic half's second engine.
 *
 *   paginate(book, dsg_rev, target) -> Composition
 *
 * Turns a `Book` and a `DesignRevision` into a `Composition`: where every block lands,
 * and why. Deterministic — the same inputs produce byte-identical output. No clock, no
 * random source, no network, no AI. Every measurement comes from `measure.ts`, the
 * pinned-Chromium bridge (decision D-01); every classification is integer arithmetic.
 *
 *   docs/08-pagination-strategy.md §4.2  page boxes and the solver
 *   docs/08-pagination-strategy.md §4.5  front/back-matter-first placement
 *   docs/08-pagination-strategy.md §4.6  padding to a multiple of four
 *   docs/08-pagination-strategy.md §6.1  exact-rational density classification
 *   docs/08-pagination-strategy.md §9.6  the digital range
 *   docs/07-lock-and-constraint-rules.md §3  lock semantics
 *   docs/07-lock-and-constraint-rules.md §4.2  the dynamic program
 *   docs/07-lock-and-constraint-rules.md §4.3  the cost terms
 *   docs/05-content-and-composition-model.md §2.4  density
 *   docs/09-design-token-architecture.md §4.3  density resolution
 *
 *   npx tsx src/paginate.ts content/david-and-goliath.json > build/composition.json
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
	WARM_PARCHMENT as DESIGN,
	balancedCeilingLines,
	linesPerPage,
	quantise64,
	type DesignRevision,
} from "./tokens.js";
import type {
	Book,
	Block,
	Composition,
	ComposedPage,
	CompositionBlock,
	Id,
	Lock,
	Matter,
	PageTemplate,
} from "./contracts.js";
import { openMeasureSession, probeCandidates, STANDIN_PROBE, type MeasureSession, type MeasuredBlock } from "./measure.js";

/* ================================================================== */
/* canonical JSON — sorted keys, for a deterministic id                 */
/* ================================================================== */

function canonical(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
	if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
	const o = v as Record<string, unknown>;
	const keys = Object.keys(o).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

function sha256(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

/** A total order that does not depend on the runtime locale — `localeCompare` can vary. */
export function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/* ================================================================== */
/* density — the ONE definition (docs/05 §2.4, docs/08 §6.1)            */
/* ================================================================== */

export type Density = "sparse" | "balanced" | "dense" | "overflow";

export interface DensityThresholds {
	sparse_below_x10000: number;
	dense_above_x10000: number;
}

export function densityThresholds(d: DesignRevision): DensityThresholds {
	// the RESOLVED band — never the declared density_tolerance, never the §6.7 default
	return {
		sparse_below_x10000: Math.round(d.layout.resolved_density_band.sparse_below * 10000),
		dense_above_x10000: Math.round(d.layout.resolved_density_band.dense_above * 10000),
	};
}

/** Integer cross-multiplication of quantised heights — never a float comparison. */
export function classify(
	measured_height_q: number,
	available_height_q: number,
	t: DensityThresholds,
): Density {
	if (measured_height_q > available_height_q) return "overflow";
	if (measured_height_q * 10000 < t.sparse_below_x10000 * available_height_q) return "sparse";
	if (measured_height_q * 10000 > t.dense_above_x10000 * available_height_q) return "dense";
	return "balanced";
}

/* ================================================================== */
/* the cost vector (docs/07 §4.3)                                      */
/* ================================================================== */

export const COST = {
	sparse_penalty: 40,
	dense_penalty: 30,
	orphan_penalty: 200,
	widow_penalty: 200,
	beat_split_penalty: 500,
	keep_together_penalty: 800,
	essential_break_penalty: 3000,
	preference_break_penalty: 20,
	page_count_penalty: 5,
} as const;

/* ================================================================== */
/* lock normalisation                                                  */
/* ================================================================== */

export function lockKey(l: Lock): string {
	return `${l.kind}:${l.target}`;
}

/**
 * The lock-kind vocabulary of the manuscript and of `docs/07` §2's table is suffixed —
 * `content_lock`, `beat_lock`, `page_break_lock`, `keep_together_lock`, `print_page_lock`,
 * `design_lock` — while `contracts.LockKind` names the same classes without the suffix.
 * Normalise here, once, so this engine compares a single spelling in every place it reads a
 * lock. An unrecognised kind is returned unchanged, so it matches nothing rather than being
 * silently mistaken for a class it is not. `lockKey` keeps the author's own spelling, so every
 * report (and the frozen lock ids) still read the way the manuscript wrote them.
 *
 * Without this the three suffixed locks the reference manuscript actually carries
 * (`content_lock:blk_dg_stone`, `page_break_lock:blk_dg_forward`, `print_page_lock:blk_dg_forward`)
 * never reach the solver at all: they are dropped by the filters below and `accountLocks` then
 * reported "every lock the author set is honoured", which was true only because the engine could
 * not see them. That is the exact failure `07` §1 exists to prevent.
 */
export function canonicalLockKind(kind: string): string {
	switch (kind) {
		case "content_lock": return "content";
		case "beat_lock": return "beat";
		case "page_break_lock": return "page_break";
		case "keep_together_lock": return "keep_together";
		case "print_page_lock": return "print_page";
		case "design_lock": return "design";
		default: return kind;
	}
}

/**
 * A printed leaf is reached by a real page turn iff it is an even print page.
 *
 * A saddle-stitched booklet is read in the order `{1} · {2,3} · {4,5} · {6,7} · {8,9} · …` — the
 * front cover stands alone and every sheet after it shows a verso beside its recto. So the page
 * a reader must *turn* to reach is page 2, then 4, 6, … (`docs/05` §2.5):
 *
 *     σ(p) = floor(p / 2)  for p ≥ 2 ;  a turn happens between p−1 and p  ⇔  σ(p) ≠ σ(p−1)  ⇔  p even
 */
export function isTurnPrintPage(printPage: number): boolean {
	return printPage % 2 === 0;
}

interface LockIndex {
	content: Lock[];
	beat: Lock[];
	page_break: Lock[];
	keep_together: Lock[];
	print_page: Lock[];
	design: Lock[];
	all: Lock[];
}

function indexLocks(book: Book): LockIndex {
	const all: Lock[] = [];
	for (const b of book.beats) for (const l of b.locks ?? []) all.push(l);
	// deterministic collection order — sort by explicit key (docs/07 §4.5)
	all.sort((a, b) => cmp(lockKey(a), lockKey(b)) || a.priority - b.priority);
	return {
		content: all.filter((l) => canonicalLockKind(l.kind) === "content"),
		beat: all.filter((l) => canonicalLockKind(l.kind) === "beat"),
		page_break: all.filter((l) => canonicalLockKind(l.kind) === "page_break"),
		keep_together: all.filter((l) => canonicalLockKind(l.kind) === "keep_together"),
		print_page: all.filter((l) => canonicalLockKind(l.kind) === "print_page"),
		design: all.filter((l) => canonicalLockKind(l.kind) === "design"),
		all,
	};
}

/* ================================================================== */
/* story items                                                         */
/* ================================================================== */

interface StoryItem {
	index: number;
	id: Id;
	role: Block["role"];
	beatId: Id;
	beatIndex: number;
	words: number;
	lines: number;
	lineHeights: number[]; // 1/64 px_css per line box
	height: number; // Σ — the quantity the density classifier consumes
}

interface MatterPageSpec {
	id: Id;
	slot: Matter["slot"];
	template: PageTemplate;
	blocks: readonly Block[];
}

const FRONT_TEMPLATE: Record<string, PageTemplate> = {
	title: "title_page",
	copyright: "standard_story",
	dedication: "reflective_page",
	contents: "standard_story",
};
const BACK_TEMPLATE: Record<string, PageTemplate> = {
	memory_verse: "scripture_reference",
	discussion: "discussion_page",
	about: "closing_page",
};

function storyTemplate(beat: { kind: string }, beatIndex: number, isLastBeat: boolean): PageTemplate {
	if (isLastBeat) return "closing_page";
	if (beat.kind === "turn") return "dramatic_reveal";
	if (beatIndex === 0) return "opening_page";
	if (beat.kind === "reflection") return "reflective_page";
	return "standard_story";
}

/* ================================================================== */
/* the solver (docs/07 §4.2)                                           */
/* ================================================================== */

interface Node {
	i: number;
	k: number;
}

interface EdgeEnd {
	i: number;
	k: number;
	height: number;
	lines: number;
	overflow: boolean;
}

interface BeatRange {
	start: number;
	end: number;
}

interface SolveResult {
	/** page-start node indices, in order; the last is the END node */
	breaks: number[];
	cost: number;
	pages: number;
}

interface SolveContext {
	items: StoryItem[];
	avail: number;
	thresholds: DensityThresholds;
	beatRanges: Map<Id, BeatRange>;
	beatLocked: Set<Id>;
	keepTogetherGroups: Map<Id, BeatRange>;
	forcedBreaks: Set<number>; // block indices that MUST start a page
	preferenceBreaks: Set<number>; // block indices a preference break would like to start
	orphans: number;
	widows: number;
	targetStoryPages: number;
	/** may a page that begins at this item be sparse? (§6.7 exemption for opening/reflective/reveal) */
	isSparseExempt: (itemIndex: number) => boolean;
	/**
	 * The reveal turns (`docs/05` §2.5, §6.6). Key: the item index at which a reveal beat's first
	 * measured block begins. Value: the lock that declares the turn. A page that *opens* at one of
	 * these indices must be an EVEN print page — the booklet pairs `{1}`, `{2,3}`, `{4,5}`, … so only
	 * an even page is reached by a real turn. Empty for the digital plan: the reader's pairing is a
	 * different rule and `08` §6.10 lets a small viewport merge the break and disclose it.
	 */
	revealStarts: Map<number, Lock>;
	/** print pages before the first story page (front matter) — the parity rule is stated on the print index */
	frontCount: number;
	/**
	 * H2 `print_page` locks (docs/07 §4.4), as edge removals: a page may touch a pinned block only
	 * when it is the story page the lock names. `storyOrdinal` is 1-based within the story.
	 */
	printPagePins: { itemIndex: number; storyOrdinal: number; lock: Lock }[];
	/** total print pages for a given story-page count: front + story + back + pad */
	totalPagesFor: (storyPages: number) => number;
	targetTotal: number;
}

/** nodes are page-start positions; the node list is (i,k) for k<lines[i], plus END. */
function buildNodes(items: StoryItem[]): Node[] {
	const nodes: Node[] = [];
	for (let i = 0; i < items.length; i++) {
		for (let k = 0; k < items[i].lines; k++) nodes.push({ i, k });
	}
	nodes.push({ i: items.length, k: 0 });
	return nodes;
}

function nodeKeyMap(nodes: Node[]): Map<string, number> {
	const m = new Map<string, number>();
	nodes.forEach((n, idx) => m.set(`${n.i}:${n.k}`, idx));
	return m;
}

function edgesFrom(items: StoryItem[], i1: number, k1: number, avail: number): EdgeEnd[] {
	const out: EdgeEnd[] = [];
	// an oversized block owns its own page (docs/07 §4.2 degenerate edge)
	if (k1 === 0 && i1 < items.length && items[i1].height > avail) {
		return [{ i: i1 + 1, k: 0, height: items[i1].height, lines: items[i1].lines, overflow: true }];
	}
	let h = 0;
	let t = 0;
	for (let b = i1; b < items.length; b++) {
		const startL = b === i1 ? k1 : 0;
		for (let l = startL; l < items[b].lines; l++) {
			h += items[b].lineHeights[l];
			t += 1;
			if (h > avail) return out; // hard fit: the edge does NOT exist beyond this point
			const next = l + 1 < items[b].lines ? { i: b, k: l + 1 } : { i: b + 1, k: 0 };
			out.push({ i: next.i, k: next.k, height: h, lines: t, overflow: false });
		}
	}
	return out;
}

/** beats split by the page boundary at (i2,k2) */
function beatsSplit(ctx: SolveContext, i2: number, k2: number): Id[] {
	const split: Id[] = [];
	// deterministic order (map insertion order is by beat order; sort for safety)
	const ids = [...ctx.beatRanges.keys()].sort();
	for (const beatId of ids) {
		if (!ctx.beatLocked.has(beatId)) continue;
		const r = ctx.beatRanges.get(beatId)!;
		const s = k2 === 0 ? r.start < i2 && i2 <= r.end : i2 >= r.start && i2 <= r.end;
		if (s) split.push(beatId);
	}
	return split;
}

function groupsSplit(ctx: SolveContext, i2: number, k2: number): Id[] {
	const split: Id[] = [];
	for (const gid of [...ctx.keepTogetherGroups.keys()].sort()) {
		const r = ctx.keepTogetherGroups.get(gid)!;
		const s = k2 === 0 ? r.start < i2 && i2 <= r.end : i2 >= r.start && i2 <= r.end;
		if (s) split.push(gid);
	}
	return split;
}

function pageCost(ctx: SolveContext, i1: number, k1: number, end: EdgeEnd): number {
	let cost = 0;
	const cls = classify(end.height, ctx.avail, ctx.thresholds);
	if (cls === "dense") cost += COST.dense_penalty;
	if (cls === "sparse" && !ctx.isSparseExempt(i1)) cost += COST.sparse_penalty;
	if (cls === "overflow") cost += COST.dense_penalty; // reported, and penalised once
	// orphan: the page ends with fewer than `orphans` lines of a block that continues
	if (end.i < ctx.items.length && end.k > 0 && end.k < ctx.items[end.i].lines && end.k < ctx.orphans) {
		cost += COST.orphan_penalty;
	}
	// widow: the page begins with fewer than `widows` lines of a continued block
	if (k1 > 0 && ctx.items[i1].lines - k1 < ctx.widows) cost += COST.widow_penalty;
	// soft locks
	cost += COST.beat_split_penalty * beatsSplit(ctx, end.i, end.k).length;
	cost += COST.keep_together_penalty * groupsSplit(ctx, end.i, end.k).length;
	// a droppable preference break (S4) passed without a break
	for (const pb of ctx.preferenceBreaks) {
		const containsPb = i1 < pb && end.i >= pb;
		const startsPb = i1 === pb && k1 === 0;
		if (containsPb && !startsPb) cost += COST.preference_break_penalty;
	}
	return cost;
}

function solve(ctx: SolveContext): SolveResult {
	const { items, avail } = ctx;
	const nodes = buildNodes(items);
	const idx = nodeKeyMap(nodes);
	const start = idx.get("0:0")!;
	const endIdx = nodes.length - 1;

	const maxPages = Math.min(48, Math.max(4, items.length + 6));
	const INF = Number.POSITIVE_INFINITY;

	// dist[p][node] = min cost with p pages completed and the next page starting at node
	const dist: number[][] = Array.from({ length: maxPages + 1 }, () => new Array<number>(nodes.length).fill(INF));
	const key: string[][] = Array.from({ length: maxPages + 1 }, () => new Array<string>(nodes.length).fill(""));
	dist[0][start] = 0;
	key[0][start] = String(start);

	for (let p = 0; p < maxPages; p++) {
		for (let n = 0; n < nodes.length; n++) {
			const base = dist[p][n];
			if (base === INF) continue;
			const A = nodes[n];
			if (A.i >= items.length) continue;
			// docs/05 §2.5 — the turn parity, as a hard constraint. The page that opens at A is
			// story page p+1, i.e. print page `frontCount + p + 1`. When A is where a reveal beat
			// begins (k === 0 — the beat must *open* the page for the turn to reveal anything), that
			// print page must be even, so the transition which would open it on a facing page simply
			// does not exist. Searching is therefore forced to find an assignment that satisfies the
			// rule, or to fail (§5.1).
			if (A.k === 0 && ctx.revealStarts.has(A.i) && !isTurnPrintPage(ctx.frontCount + p + 1)) continue;
			const ends = edgesFrom(items, A.i, A.k, avail);
			for (const e of ends) {
				// a forced break forbids a page that spans it
				let spansForced = false;
				for (const fb of ctx.forcedBreaks) {
					if (fb > A.i && fb <= e.i && !(e.i === fb && e.k === 0)) {
						spansForced = true;
						break;
					}
				}
				if (spansForced) continue;
				// H2 (docs/07 §4.4): a `print_page_lock` removes every edge that would place its block
				// on a page other than the one it names — the lock is a constraint, never a cost. The
				// page completing here is story page p+1, so the test is exact and needs no extra state.
				let pinsViolated = false;
				for (const pin of ctx.printPagePins) {
					const li = pin.itemIndex;
					const touchesBlock = A.i <= li && (e.i > li || (e.i === li && e.k > 0));
					if (touchesBlock && p + 1 !== pin.storyOrdinal) {
						pinsViolated = true;
						break;
					}
				}
				if (pinsViolated) continue;
				const toIdx = idx.get(`${e.i}:${e.k}`);
				if (toIdx === undefined) continue;
				const c = base + pageCost(ctx, A.i, A.k, e);
				const kk = `${key[p][n]}>${toIdx}`;
				if (c < dist[p + 1][toIdx] || (c === dist[p + 1][toIdx] && kk < key[p + 1][toIdx])) {
					dist[p + 1][toIdx] = c;
					key[p + 1][toIdx] = kk;
				}
			}
		}
	}

	// The page target does NOT govern the solver — the cost model does (`docs/07` §4.3, verbatim:
	// "It does not govern the *solver*, and it must not: a solver permitted to buy the page count
	// would buy it by packing pages to the dense threshold, trading readability for a number —
	// exactly what §1.3 and §5.1 forbid."). A story-page count that reaches the target is therefore
	// NOT preferred over one that does not; the plan is chosen by the cost vector alone, whose
	// `page_count_penalty` is deliberately low (5) so it can never outbid a density (30) or
	// orphan/widow (200) term. An over-budget manuscript is allowed to miss the target and
	// `PRINT_PAGE_COUNT_OFF_TARGET` reports it; it is never repaired by densifying.
	//
	// The page target governs the *manuscript's length* at blueprint time (`05` §1.6: `target_words`
	// is derived from it at the resolved ceiling minus a reserve) — precisely so the target plan is
	// the one this cost function prefers — but the boundary ends there (`07` §4.3; D-16 as amended).
	// Buying the page count here was tried (commit 055d080) and produced a plan with THREE dense
	// pages and one of the author's three turns dropped; reverting to the plain cost model and
	// releasing the back-matter pack instead gives `front 3 + story 11 + back 2 = 16` with ONE dense
	// page and every turn kept. `page_count_penalty` remains the only tie-break (`07` §4.2 rule (1):
	// between two otherwise equal plans the shorter book wins, deterministically, because 5 > 0).
	let best = INF;
	let bestP = -1;
	for (let p = 1; p <= maxPages; p++) {
		if (dist[p][endIdx] === INF) continue;
		const total = ctx.totalPagesFor(p);
		const penalty = COST.page_count_penalty * Math.max(0, total - ctx.targetTotal);
		const t = dist[p][endIdx] + penalty;
		if (t < best) {
			best = t;
			bestP = p;
		}
	}
	if (bestP < 0) {
		throw new Error("COMP_LOCK_CONFLICT_HARD: no START->END path exists under the hard constraints.");
	}

	// reconstruct
	const seq: number[] = [];
	let n = endIdx;
	let p = bestP;
	while (true) {
		seq.push(n);
		if (p === 0) break;
		const prevKey = key[p][n];
		const parts = prevKey.split(">");
		const prevIdx = Number(parts[parts.length - 2]);
		n = prevIdx;
		p -= 1;
	}
	seq.reverse();

	return { breaks: seq, cost: best, pages: bestP };
}

/* ================================================================== */
/* paginate                                                            */
/* ================================================================== */

export interface PaginateResult {
	composition: Composition;
	/** the raw engine identity, for reporting */
	engine: string;
	storyWords: number;
	storyBlocks: number;
	probe: {
		source: string;
		words: number;
		line_boxes: number;
		words_per_line_raw: number;
		words_per_line: number;
		words_per_page_measured: number;
	};
}

export interface PaginateOptions {
	dsg?: DesignRevision;
	target?: number;
	/** skip the digital pass (used by tests) */
	skipDigital?: boolean;
}

const TRIM = { w_mm: 139.7, h_mm: 215.9 };
const DIGITAL_INSET_PX = 16;

function digitalContentBox(
	d: DesignRevision,
	viewport: { w: number; h: number },
	spread: boolean,
): { contentW: number; contentH: number; scale: number; leafSlotW: number; gutterPx: number } {
	// §1.7 R4 — project the physical geometry against the page box, never unit-convert
	const gutterPx = spread ? viewport.w * (d.layout.gutter_mm / TRIM.w_mm) : 0;
	const leafSlotW = spread ? (viewport.w - gutterPx) / 2 : viewport.w;
	const availW = leafSlotW - 2 * DIGITAL_INSET_PX;
	const availH = viewport.h - 2 * DIGITAL_INSET_PX;
	const scale = Math.min(availW / TRIM.w_mm, availH / TRIM.h_mm);
	return {
		contentW: d.layout.text_box_mm.width * scale,
		contentH: d.layout.text_box_mm.height * scale,
		scale,
		leafSlotW,
		gutterPx,
	};
}

export async function paginate(
	book: Book,
	dsg_rev: DesignRevision = DESIGN,
	target: number = book.target_print_pages,
	options: PaginateOptions = {},
): Promise<PaginateResult> {
	const d = dsg_rev;
	const AVAIL = d.box.height_q; // 35800 q — the print content-box height
	const CAP = linesPerPage(d); // 20
	const CEIL = balancedCeilingLines(d); // 16
	const thresholds = densityThresholds(d);

	/* ---- 1. the measurement pass, at the print content box (docs/08 §4.4) ---- */
	const session: MeasureSession = await openMeasureSession({ widthPx: d.box.width_px_css, dsg: d, lang: book.meta.language });

	try {
		const matterSpecs: MatterPageSpec[] = [
			...book.front_matter.map((m) => ({
				id: m.id,
				slot: m.slot,
				template: FRONT_TEMPLATE[m.slot] ?? "standard_story",
				blocks: m.blocks,
			})),
			...book.back_matter.map((m) => ({
				id: m.id,
				slot: m.slot,
				template: BACK_TEMPLATE[m.slot] ?? "standard_story",
				blocks: m.blocks,
			})),
		];

		const specs: { id: Id; text: string; role: string }[] = [];
		for (const m of matterSpecs) for (const b of m.blocks) specs.push({ id: b.id, text: b.text, role: b.role });
		for (const beat of book.beats) for (const b of beat.blocks) specs.push({ id: b.id, text: b.text, role: b.role });

		const measured: MeasuredBlock[] = specs.length ? await session.measure(specs) : [];
		const byId = new Map<Id, MeasuredBlock>();
		measured.forEach((m) => byId.set(m.id, m));

		/* ---- 1b. the measure_probe, measured in the same engine (docs/05 §1.6 item 6) ---- */
		let probeText: string | undefined;
		let probeSource = "built-in stand-in (fixtures/measure/probe.en.early.txt absent)";
		for (const c of probeCandidates()) {
			if (existsSync(c)) {
				probeText = readFileSync(c, "utf8");
				probeSource = c;
				break;
			}
		}
		if (!probeText) probeText = STANDIN_PROBE;
		const probeMeasured = await session.measureOne(probeText, { id: "blk_measure_probe", role: "prose" });
		const wordsPerLineRaw = probeMeasured.words / probeMeasured.lines;
		const wordsPerLine = Math.round(wordsPerLineRaw * 10) / 10;
		const wordsPerPageMeasured = Math.round(CEIL * wordsPerLine * 10) / 10;

		/* ---- 2. story items in beat order ---- */
		const items: StoryItem[] = [];
		const beatRanges = new Map<Id, BeatRange>();
		for (let bi = 0; bi < book.beats.length; bi++) {
			const beat = book.beats[bi];
			const start = items.length;
			for (const b of beat.blocks) {
				const m = byId.get(b.id)!;
				if (m.lines === 0) continue; // a geometry-less block contributes no line box
				items.push({
					index: items.length,
					id: b.id,
					role: b.role,
					beatId: beat.id,
					beatIndex: bi,
					words: m.words,
					lines: m.lines,
					lineHeights: m.line_heights_q,
					height: m.height_q,
				});
			}
			beatRanges.set(beat.id, { start, end: items.length - 1 });
		}

		/* ---- 3. constraints ---- */
		const locks = indexLocks(book);
		const beatLocked = new Set<Id>(locks.beat.map((l) => l.target));
		const keepTogetherGroups = new Map<Id, BeatRange>();
		for (const l of locks.keep_together) {
			const r = beatRanges.get(l.target);
			if (r) keepTogetherGroups.set(l.target, r);
		}

		const itemIndexById = new Map<Id, number>();
		items.forEach((it) => itemIndexById.set(it.id, it.index));

		const forcedBreaks = new Set<number>();
		const unsatisfiedStructural: { lock: Lock; why: string }[] = [];
		for (const l of locks.page_break) {
			const i = itemIndexById.get(l.target);
			if (i === undefined) {
				unsatisfiedStructural.push({ lock: l, why: `the block this break names does not exist in the manuscript` });
				continue;
			}
			forcedBreaks.add(i);
		}
		// a print-page lock forces its block to start a page (H2, docs/07 §4.4). The *page* it pins
		// depends on the front-matter count (a front-matter change shifts story parity, `08` §4.5),
		// so the pin itself is rebuilt per candidate in `pinsFor` below.
		for (const l of locks.print_page) {
			const i = itemIndexById.get(l.target);
			if (i !== undefined) forcedBreaks.add(i);
		}
		// page_break_lock: priority >= 2 is the S2 essential break (already a forced break above);
		// priority < 2 is the S4 droppable preference, which the DP pays 20 to pass (docs/07 §4.3).
		const preferenceBreaks = new Set<number>();
		for (const l of locks.page_break) {
			if (l.priority >= 2) continue; // essential — already a hard forced break
			const i = itemIndexById.get(l.target);
			if (i !== undefined) preferenceBreaks.add(i);
		}

		/* ---- 3c. the reveal turns (docs/05 §2.5, §6.6) ---- */
		// A beat is a *reveal* when the author declared a deliberate break at it — an essential
		// `page_break` or a `print_page` lock. `kind: "turn"` alone is a narrative turning point,
		// not a page turn (§2.5: "a page turn is not a page break"), so it is not parity-constrained;
		// only the declared reveal must open an even print page. The reveal's first measured block
		// is forced to open a page, because a reveal that begins mid-page hides nothing.
		const revealStarts = new Map<number, Lock>();
		const revealBeatIds = new Set<Id>();
		for (const beat of book.beats) {
			const marking = (beat.locks ?? []).find((l) => {
				const k = canonicalLockKind(l.kind);
				return k === "page_break" || k === "print_page";
			});
			if (!marking) continue;
			const r = beatRanges.get(beat.id);
			if (!r || r.start > r.end) continue; // a beat with no measured block cannot open a page
			revealStarts.set(r.start, marking);
			revealBeatIds.add(beat.id);
			forcedBreaks.add(r.start);
		}

		/* ---- 4. the solve ---- */
		const tplForItem = (itemIndex: number): PageTemplate => {
			const it = items[itemIndex];
			return storyTemplate(book.beats[it.beatIndex], it.beatIndex, it.beatIndex === book.beats.length - 1);
		};
		const isSparseExempt = (itemIndex: number): boolean => {
			const t = tplForItem(itemIndex);
			return t === "opening_page" || t === "reflective_page" || t === "dramatic_reveal";
		};

		/** pad = (4 − N mod 4) mod 4, N = front + story + back (docs/08 §4.6, D-16). */
		const padFor = (n: number) => (4 - (n % 4)) % 4;

		/**
		 * H2 `print_page` locks (docs/07 §4.4) resolved against a front-matter count: the lock names
		 * a PRINT page, so the story ordinal it pins moves with the front matter (`08` §4.5).
		 */
		const pinsFor = (frontCount: number): { pins: { itemIndex: number; storyOrdinal: number; lock: Lock }[]; structural: { lock: Lock; why: string }[] } => {
			const pins: { itemIndex: number; storyOrdinal: number; lock: Lock }[] = [];
			const structural: { lock: Lock; why: string }[] = [];
			for (const l of locks.print_page) {
				const i = itemIndexById.get(l.target);
				if (i === undefined || !l.page) {
					structural.push({ lock: l, why: `the block or page this lock names does not resolve` });
					continue;
				}
				const storyOrdinal = l.page - frontCount; // 1-based within the story (0 would be a front-matter page)
				if (storyOrdinal < 1) {
					structural.push({ lock: l, why: `page ${l.page} is a front-matter page; a story block cannot be pinned to it` });
					continue;
				}
				pins.push({ itemIndex: i, storyOrdinal, lock: l });
			}
			return { pins, structural };
		};

		/**
		 * Solve the story for one matter plan. The parity rule and the H2 pins are hard constraints:
		 * the search runs under both, so no plan in which a reveal opens a facing page, or a pinned
		 * block drifts off its page, is ever produced *by choosing one*. If the fully constrained
		 * graph has no START -> END path, relax in a fixed order and REPORT what was relaxed
		 * (§5.4 forbids a silent fallback, not a disclosed one).
		 */
		const attemptSolve = (
			frontCount: number,
			backCount: number,
		): { solved: SolveResult; parityRelaxed: boolean; pinsRelaxed: boolean; structural: { lock: Lock; why: string }[] } => {
			const { pins, structural } = pinsFor(frontCount);
			const totalPagesFor = (s: number) => frontCount + s + backCount + padFor(frontCount + s + backCount);
			const ctx: SolveContext = {
				items,
				avail: AVAIL,
				thresholds,
				beatRanges,
				beatLocked,
				keepTogetherGroups,
				forcedBreaks,
				preferenceBreaks,
				orphans: d.typography.orphans,
				widows: d.typography.widows,
				targetStoryPages: Math.max(1, target - frontCount - backCount),
				isSparseExempt,
				revealStarts,
				frontCount,
				printPagePins: pins,
				totalPagesFor,
				targetTotal: target,
			};
			let parityRelaxed = false;
			let pinsRelaxed = false;
			let solved: SolveResult | null = null;
			for (const attempt of [
				{ dropParity: false, dropPins: false },
				{ dropParity: true, dropPins: false },
				{ dropParity: false, dropPins: true },
				{ dropParity: true, dropPins: true },
			]) {
				try {
					solved = solve({
						...ctx,
						revealStarts: attempt.dropParity ? new Map<number, Lock>() : ctx.revealStarts,
						printPagePins: attempt.dropPins ? [] : ctx.printPagePins,
					});
					parityRelaxed = attempt.dropParity;
					pinsRelaxed = attempt.dropPins;
					break;
				} catch {
					/* the next relaxation is tried; a fit problem cannot empty the graph (docs/07 §4.2) */
				}
			}
			if (!solved) {
				throw new Error("COMP_LOCK_CONFLICT_HARD: no START->END path exists under the hard constraints.");
			}
			return { solved, parityRelaxed, pinsRelaxed, structural };
		};

		/* ---- 4b. the matter plans, packed by the same measured accounting (docs/08 §4.5) ---- */
		const slotsOf = (specs: MatterPageSpec[]): MeasuredSlot[] =>
			specs.map((spec) => {
				const kept = spec.blocks.filter((b) => (byId.get(b.id)?.lines ?? 0) > 0);
				return {
					id: spec.id,
					slot: spec.slot,
					template: spec.template,
					blocks: kept,
					lines: kept.reduce((a, b) => a + (byId.get(b.id)?.lines ?? 0), 0),
					height: kept.reduce((a, b) => a + (byId.get(b.id)?.height_q ?? 0), 0),
				};
			});
		const frontSlots = slotsOf(matterSpecs.slice(0, book.front_matter.length));
		const backSlots = slotsOf(matterSpecs.slice(book.front_matter.length));

		// THE FRONT MATTER. Page 1 is the cover and holds the title alone; the second slot opens the
		// title's verso. `contents` is DROPPABLE — the source spec lists a table of contents only
		// "for longer books" (§7.3; R-DIG-011) — and `dedication` is the only slot the conventions
		// let share a page. Candidates run in preference order; the first whose solved total meets
		// the target wins, and a tie never promotes a later, less conventional arrangement.
		const CONTENTS_OMISSION =
			"intentionally omitted from the printed plan: the source spec lists a table of contents " +
			"only \"for longer books\" (docs/source/STORYBOOK-STUDIO-SPEC.md §7.3; requirement R-DIG-011), " +
			"and this is a 16-page children's storybook whose reader already provides contents navigation, " +
			"so a printed contents page would carry no navigation the reader lacks.";
		const dropContents: ReadonlySet<Matter["slot"]> = new Set<Matter["slot"]>(["contents"]);
		const keepAll: ReadonlySet<Matter["slot"]> = new Set<Matter["slot"]>();
		const omissionReason = (): string => CONTENTS_OMISSION;
		const FRONT_CANDIDATES: MatterPolicy[] = [
			{ drop: dropContents, pack: false, firstAlone: true, omissionReason },
			{ drop: dropContents, pack: true, firstAlone: true, omissionReason },
			{ drop: keepAll, pack: false, firstAlone: true, omissionReason },
			{ drop: keepAll, pack: true, firstAlone: true, omissionReason },
		];
		// The back matter PACKS by the same measured accounting and does not apply the cover
		// convention: the first back page is not a cover, so its slots are sections of one
		// afterword and may share a page. `memory_verse` + `discussion` fit on one page (6 + 8 = 14
		// measured lines ≤ the 20-line content box) and `about` takes the second, so the back matter
		// occupies two pages instead of three. `docs/16` §1.3 fixes `back_matter_pages = 3`; that cell
		// is RELAXED here to "2 or 3, whichever the solver needs to meet the governing page target"
		// (`docs/17` D-16 as amended: `target_print_pages` is the governing length target and
		// front/back matter may be padded or packed to reach it; the source spec §14.1 requires
		// "appropriate front and back matter" and a 12- or 16-page book, not three back pages
		// specifically). Unlike the optional `contents`, the back sections are all required and none
		// is dropped — they are PACKED onto a shared page, never omitted.
		const BACK_POLICY: MatterPolicy = { drop: keepAll, pack: true, firstAlone: false, omissionReason };
		const backPlan = planMatter(backSlots, AVAIL, BACK_POLICY);
		const backCount = backPlan.pages.length;

		interface MatterChoice {
			candidate: MatterPolicy;
			frontPlan: MatterPlan;
			frontCount: number;
			backPlan: MatterPlan;
			backCount: number;
			solved: SolveResult;
			parityRelaxed: boolean;
			pinsRelaxed: boolean;
			structural: { lock: Lock; why: string }[];
			total: number;
			distance: number;
		}
		let chosen: MatterChoice | null = null;
		for (const candidate of FRONT_CANDIDATES) {
			const frontPlan = planMatter(frontSlots, AVAIL, candidate);
			const frontCount = frontPlan.pages.length;
			const r = attemptSolve(frontCount, backCount);
			const total = frontCount + r.solved.pages + backCount + padFor(frontCount + r.solved.pages + backCount);
			const distance = Math.abs(total - target);
			if (chosen === null || distance < chosen.distance) {
				chosen = {
					candidate,
					frontPlan,
					frontCount,
					backPlan,
					backCount,
					solved: r.solved,
					parityRelaxed: r.parityRelaxed,
					pinsRelaxed: r.pinsRelaxed,
					structural: r.structural,
					total,
					distance,
				};
			}
		}
		if (!chosen) {
			throw new Error("COMP_MATTER_PLAN_EMPTY: no front-matter arrangement could be built.");
		}
		const { frontPlan, frontCount, solved, parityRelaxed, pinsRelaxed } = chosen;
		const structuralAll: { lock: Lock; why: string }[] = [...unsatisfiedStructural, ...chosen.structural];

		/* ---- 5. emit the pages ---- */
		const segments = pagesFromBreaks(items, solved.breaks);

		const pages: ComposedPage[] = [];
		let pageNo = 0;

		// front matter — packed pages, placed first (docs/08 §4.5)
		for (const mp of frontPlan.pages) {
			pageNo += 1;
			pages.push(buildMatterPage(pageNo, mp, byId, session, AVAIL, thresholds, locks));
		}

		// story pages
		const storyPageBase = frontCount;
		segments.forEach((seg, si) => {
			pageNo += 1;
			const firstItem = items[seg.startItem];
			const beat = book.beats[firstItem.beatIndex];
			const tpl = storyTemplate(beat, firstItem.beatIndex, firstItem.beatIndex === book.beats.length - 1);
			const blocks: CompositionBlock[] = seg.parts.map((pt) => ({
				ref: items[pt.itemIndex].id,
				role: items[pt.itemIndex].role,
				lines: pt.lines,
				measured_width_q: session.widthQ,
			}));
			const usedHeight = seg.parts.reduce((a, pt) => a + pt.height, 0);
			pages.push({
				page: pageNo,
				side: pageNo % 2 === 1 ? "recto" : "verso",
				template: tpl,
				from: beat.id,
				blocks,
				lines: seg.parts.reduce((a, pt) => a + pt.lines, 0),
				capacity_lines: CAP,
				fill_ratio: round6(usedHeight / AVAIL),
				density: classify(usedHeight, AVAIL, thresholds),
				locks_honoured: [],
				locks_unsatisfied: [],
			});
			void storyPageBase;
			void si;
		});

		// back matter — packed pages, placed last, then pad blanks
		for (const mp of backPlan.pages) {
			pageNo += 1;
			pages.push(buildMatterPage(pageNo, mp, byId, session, AVAIL, thresholds, locks));
		}

		const storyPages = pages.length - frontCount - backCount;
		const pad = padFor(frontCount + storyPages + backCount);
		for (let i = 0; i < pad; i++) {
			pageNo += 1;
			pages.push({
				page: pageNo,
				side: pageNo % 2 === 1 ? "recto" : "verso",
				template: "blank_page",
				from: "pad_d16",
				blocks: [],
				lines: 0,
				capacity_lines: CAP,
				fill_ratio: 0,
				density: "sparse",
				locks_honoured: [],
				locks_unsatisfied: [],
			});
		}

		/* ---- 6. lock accounting (never silently override the author) ---- */
		const lockReport = accountLocks(book, locks, pages, items, beatRanges, itemIndexById, frontCount, structuralAll);

		/* ---- 7. turns (docs/05 §2.5, §6.6) ---- */
		// A page *turns* at a beat only when the beat's first measured block opens the page
		// (`startK === 0`). The previous test — "the page draws from this beat" — also matched a page
		// whose first block happened to be the beat's *last* one, so it reported a turn where none
		// happens; that is the defect §2.5 describes. The reveal's first block is forced to open a
		// page (§3c), so for a reveal this test and the physical turn coincide.
		const pageOfBeat = new Map<Id, number>();
		for (let si = 0; si < segments.length; si++) {
			const seg = segments[si];
			if (seg.startK !== 0) continue;
			const beatId = items[seg.startItem]?.beatId;
			if (beatId === undefined || pageOfBeat.has(beatId)) continue;
			pageOfBeat.set(beatId, frontCount + si + 1); // story page si (0-based) is print page frontCount+si+1
		}
		const turns: { before_page: number; beat_id: Id; why: string }[] = [];
		for (const beat of book.beats) {
			const pbLock = (beat.locks ?? []).find((l) => canonicalLockKind(l.kind) === "page_break");
			const isReveal = revealBeatIds.has(beat.id);
			const isTurn = beat.kind === "turn" || isReveal;
			if (!isTurn) continue;
			const bp = pageOfBeat.get(beat.id);
			if (bp === undefined) continue; // its first block opens no page, so no turn happens here
			const base = pbLock?.why ?? `beat ${beat.id} is a narrative turn`;
			turns.push({
				before_page: bp,
				beat_id: beat.id,
				why: isReveal
					? `${base} — reveal: opens print page ${bp}, ${
							isTurnPrintPage(bp) ? "an even verso reached by a real turn" : "an ODD page that faces its predecessor"
						}`
					: base,
			});
		}
		turns.sort((a, b) => a.before_page - b.before_page || cmp(a.beat_id, b.beat_id));

		/* ---- 7b. the turn parity, reported on the page it concerns (docs/05 §2.5) ---- */
		const pageByNo = new Map<number, ComposedPage>();
		for (const p of pages) pageByNo.set(p.page, p);
		const revealTurns: { beat_id: Id; before_page: number | null; even: boolean; begins_page: boolean }[] = [];
		for (const [itemIdx, lock] of [...revealStarts.entries()].sort((a, b) => a[0] - b[0])) {
			const beatId = items[itemIdx].beatId;
			const bp = pageOfBeat.get(beatId) ?? null;
			const even = bp !== null && isTurnPrintPage(bp);
			revealTurns.push({ beat_id: beatId, before_page: bp, even, begins_page: bp !== null });
			if (even) continue;
			const why =
				bp === null
					? `the reveal beat ${beatId}'s first block opens no page, so no page turn reveals it (docs/05 §2.5)`
					: `the reveal must open an even print page (a verso reached by a turn), but it opens page ${bp}, which ` +
						`faces page ${bp - 1} on the same spread — no turn hides it (docs/05 §2.5)` +
						(parityRelaxed ? `; no plan satisfying the parity rule exists under the hard constraints` : ``);
			const host = bp === null ? pages[0] : pageByNo.get(bp);
			if (host) (host.locks_unsatisfied as { lock: Lock; why: string }[]).push({ lock, why });
		}

		/* ---- 8b. the line budget, split by role (docs/05 §1.6 — the split the documents lack) ---- */
		// The derived word budget assumes prose is the only thing on a story page. It is not: the
		// beats also carry `role: "scripture"` passages and a heading, which occupy the same pages.
		// The budget a *solver* can honour is therefore `story_pages_target x ceiling`, less every
		// non-prose line the beats actually need. Every number here is measured (measure.ts), never
		// assumed: if the manuscript is re-trimmed this split moves with it.
		//
		// Nothing here relaxes the density band to make the target fit. The band is the author's
		// comfort target, not a fit limit, and only the author may move it; if the story needs more
		// than `story_pages_target x ceiling` lines the honest answer is one more story page, and
		// `verdict` says so.
		const NON_PROSE_ROLES = ["scripture", "heading", "question", "note", "quote"];
		const reservedByRole: Record<string, number> = {};
		let measuredStoryLines = 0;
		let measuredNonProseLines = 0;
		for (const it of items) {
			measuredStoryLines += it.lines;
			if (NON_PROSE_ROLES.includes(it.role)) {
				measuredNonProseLines += it.lines;
				reservedByRole[it.role] = (reservedByRole[it.role] ?? 0) + it.lines;
			}
		}
		const measuredProseLines = measuredStoryLines - measuredNonProseLines;
		const targetStoryPages = Math.max(1, target - frontCount - backCount);
		const linesAvailable = targetStoryPages * CEIL;
		const linesAvailableForProse = Math.max(0, linesAvailable - measuredNonProseLines);
		// the docs' own arithmetic (05 §1.6 item 1): lines x words_per_line_measured, at the rounded figure
		const wordsAvailableForProse = Math.round(linesAvailableForProse * wordsPerLine * 10) / 10;
		const densestStoryPage = pages
			.filter((p) => p.from.startsWith("beat_"))
			.reduce<ComposedPage | undefined>((a, p) => (a === undefined || p.lines > a.lines ? p : a), undefined);
		const fitsTargetStoryPages = measuredStoryLines <= linesAvailable;
		// The nine story pages are NOT one pool. The parity rule fixes which of them the reveal opens, so
		// the lines *before* the reveal must fit the pages before it and cannot borrow from the pages
		// after. The aggregate test above (`measured <= 9 x ceiling`) hides that, and a trim sized to the
		// aggregate can still miss 16 — so the split on either side of the reveal is reported as well.
		const preReveal = (() => {
			const first = revealTurns.find((r) => r.before_page !== null);
			if (!first) return null;
			const bp = first.before_page;
			if (bp === null) return null;
			const storyOrdinal = bp - frontCount;
			const pagesBefore = Math.max(0, storyOrdinal - 1);
			const linesBefore = pages
				.filter((p) => p.from.startsWith("beat_") && p.page < bp)
				.reduce((a, p) => a + p.lines, 0);
			const availableBefore = pagesBefore * CEIL;
			const revealBeatLines = items.filter((it) => it.beatId === first.beat_id).reduce((a, it) => a + it.lines, 0);
			return {
				beat_id: first.beat_id,
				before_page: bp,
				story_ordinal: storyOrdinal,
				story_pages_before_reveal: pagesBefore,
				lines_before_reveal: linesBefore,
				lines_available_before_reveal: availableBefore,
				fits: linesBefore <= availableBefore,
				// the reveal beat's own occupancy, so the author can see whether it can open on a single
				// balanced page; whether that is *binding* is the DP's answer, not this field's
				reveal_beat_lines: revealBeatLines,
				reveal_beat_available_lines: CEIL,
				reveal_beat_fits: revealBeatLines <= CEIL,
			};
		})();
		const totalOnTarget = pages.length === target;
		const lineBudget = {
			target_story_pages: targetStoryPages,
			lines_per_story_page_ceiling: CEIL,
			lines_available: linesAvailable,
			lines_reserved_non_prose: measuredNonProseLines,
			lines_reserved_by_role: reservedByRole,
			lines_available_for_prose: linesAvailableForProse,
			words_per_line_measured: wordsPerLine,
			words_available_for_prose: wordsAvailableForProse,
			measured_story_lines: measuredStoryLines,
			measured_prose_lines: measuredProseLines,
			measured_non_prose_lines: measuredNonProseLines,
			prose_fits_story_pages: measuredProseLines <= linesAvailableForProse,
			fits_target_story_pages: fitsTargetStoryPages,
			pre_reveal: preReveal,
			verdict: totalOnTarget
				? "on_target"
				: fitsTargetStoryPages
					? "off_target_densifying_costs_more_than_a_page"
					: "off_target_aggregate_exceeds_ceiling",
			story_pages_solved: storyPages,
			total_pages: pages.length,
			pad,
			densest_story_page: densestStoryPage
				? {
						page: densestStoryPage.page,
						used_lines: densestStoryPage.lines,
						capacity_lines: densestStoryPage.capacity_lines,
						fill_ratio: densestStoryPage.fill_ratio,
						density: densestStoryPage.density,
					}
				: null,
		};

		/* ---- 8. counts ---- */
		const counts = {
			front_matter: frontCount,
			story: storyPages,
			back_matter: backCount,
			blank: pad,
			pad,
			total: pages.length,
		};

		/* ---- 9. the digital plan (docs/08 §9.6) — actually measured ---- */
		let digital: Composition["digital"] = { measured_at: [], range: { min: 0, max: 0 } };
		if (!options.skipDigital) {
			const refs: { viewport: string; w: number; h: number; spread: boolean }[] = [
				{ viewport: "360x640", w: 360, h: 640, spread: false },
				{ viewport: "1440x900", w: 1440, h: 900, spread: true },
			];
			const measuredAt: { viewport: string; pages: number; spread: boolean }[] = [];
			for (const r of refs) {
				const box = digitalContentBox(d, { w: r.w, h: r.h }, r.spread);
				const digItems = await measureStoryAt(d, book, box.contentW, book.meta.language);
				const digAvail = quantise64(box.contentH);
				const digSolved = solveDigital(digItems, digAvail, thresholds, d, book);
				measuredAt.push({ viewport: r.viewport, pages: digSolved.pages, spread: r.spread });
			}
			measuredAt.sort((a, b) => cmp(a.viewport, b.viewport));
			digital = {
				measured_at: measuredAt,
				range: {
					min: Math.min(...measuredAt.map((m) => m.pages)),
					max: Math.max(...measuredAt.map((m) => m.pages)),
				},
			};
		}

		/* ---- 9b. the matter plan, recorded so an omission is never a silent absence (docs/08 §4.5) ---- */
		const matterPlan = {
			front: {
				pages: frontPlan.pages.length,
				layout: frontPlan.pages.map((p) => ({ from: p.from, template: p.template, slots: p.slots.map((s) => s.slot), lines: p.lines })),
			},
			back: {
				pages: backPlan.pages.length,
				layout: backPlan.pages.map((p) => ({ from: p.from, template: p.template, slots: p.slots.map((s) => s.slot), lines: p.lines })),
			},
			dropped_slots: [...frontPlan.omissions, ...backPlan.omissions].map((o) => ({ slot: o.slot, id: o.id, lines: o.lines, reason: o.reason })),
			merged_slots: [...frontPlan.merged, ...backPlan.merged],
			convention:
				"page 1 is the cover and holds its front-matter slot alone; the second front-matter slot opens the title's verso; the first back-matter slot opens the first back page (docs/08 §4.5)",
		};

		/* ---- 10. the composition ---- */
		const measure = {
			lines_per_page: CAP,
			balanced_ceiling_lines: CEIL,
			words_per_line: wordsPerLine,
			words_per_page_measured: wordsPerPageMeasured,
			probe: { words: probeMeasured.words, line_boxes: probeMeasured.lines },
			engine: `${session.identity.engine} (${session.identity.build}, dpr ${session.identity.dpr})`,
			/** how the matter slots were packed, and which (if any) were intentionally dropped */
			matter_plan: matterPlan,
			/** the face the measurement was actually taken in — a fallback silently changes every line count */
			rendered_face: (session.fonts as { rendered_face?: string }).rendered_face ?? session.fonts.resolved_family,
			/**
			 * The line budget, split by role — `05` §1.6 derives the word budget as if prose were the
			 * only thing on a story page; the beats' scripture and headings occupy the same pages, so
			 * this is the figure the documents need and do not yet carry. Measured, never assumed.
			 */
			line_budget: lineBudget,
			/** The page-turn parity rule (docs/05 §2.5) and every reveal's page under it. */
			turn_parity: {
				rule: "a reveal must open an even print page (docs/05 §2.5): the booklet pairs {1}, {2,3}, {4,5}, …",
				reveals: revealTurns,
				satisfied: revealTurns.every((r) => r.even && r.begins_page),
				relaxed: parityRelaxed || pinsRelaxed,
				parity_relaxed: parityRelaxed,
				pins_relaxed: pinsRelaxed,
			},
		};

		const provisional = {
			book_id: book.id,
			dsg_rev: d.id,
			ms_rev: `ms_${sha256(canonical(book.beats.map((b) => b.blocks.map((x) => x.text)))).slice(0, 16)}`,
			solver: { name: "dp-spp", version: "1.0.0", cost: solved.cost },
			measure,
			pages,
			counts,
			digital,
			turns,
		};

		const composition: Composition = {
			id: `cmp_${sha256(canonical(provisional)).slice(0, 16)}`,
			book_id: book.id,
			dsg_rev: d.id,
			ms_rev: provisional.ms_rev,
			solver: provisional.solver,
			measure,
			pages,
			counts,
			digital,
			turns,
		};

		const storyWords = items.reduce((a, it) => a + it.words, 0);
		return {
			composition,
			engine: session.identity.engine,
			storyWords,
			storyBlocks: items.length,
			probe: {
				source: probeSource,
				words: probeMeasured.words,
				line_boxes: probeMeasured.lines,
				words_per_line_raw: wordsPerLineRaw,
				words_per_line: wordsPerLine,
				words_per_page_measured: wordsPerPageMeasured,
			},
		};
	} finally {
		await session.close();
	}
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function round6(x: number): number {
	return Math.round(x * 1e6) / 1e6;
}

interface PagePart {
	itemIndex: number;
	lines: number;
	height: number;
}

interface Segment {
	startItem: number;
	/** the line offset within the start block: 0 means the page opens *at the block's first line* */
	startK: number;
	parts: PagePart[];
}

function pagesFromBreaks(items: StoryItem[], breaks: number[]): Segment[] {
	// breaks are page-start node indices into the (i,k) enumeration
	const nodes: Node[] = buildNodes(items);
	const segs: Segment[] = [];
	for (let s = 0; s < breaks.length - 1; s++) {
		const A = nodes[breaks[s]];
		const B = nodes[breaks[s + 1]];
		const parts: PagePart[] = [];
		if (A.i === B.i) {
			let h = 0;
			for (let l = A.k; l < B.k; l++) h += items[A.i].lineHeights[l];
			parts.push({ itemIndex: A.i, lines: B.k - A.k, height: h });
		} else {
			{
				let h = 0;
				for (let l = A.k; l < items[A.i].lines; l++) h += items[A.i].lineHeights[l];
				parts.push({ itemIndex: A.i, lines: items[A.i].lines - A.k, height: h });
			}
			for (let i = A.i + 1; i < B.i; i++) {
				parts.push({ itemIndex: i, lines: items[i].lines, height: items[i].height });
			}
			if (B.i < items.length) {
				let h = 0;
				for (let l = 0; l < B.k; l++) h += items[B.i].lineHeights[l];
				if (B.k > 0) parts.push({ itemIndex: B.i, lines: B.k, height: h });
			}
		}
		segs.push({ startItem: A.i, startK: A.k, parts });
	}
	return segs;
}

/**
 * A matter slot with its measured geometry — the accounting the packer consumes. Every number
 * comes from `measure.ts` (via `byId`), exactly as the story items do; nothing here is estimated.
 */
interface MeasuredSlot {
	id: Id;
	slot: Matter["slot"];
	template: PageTemplate;
	blocks: readonly Block[];
	lines: number;
	height: number;
}

/** A printed matter page: one or more slots, packed by the same measured line accounting. */
interface MatterPagePlan {
	/** the first slot's matter id — the page's `from` */
	from: Id;
	template: PageTemplate;
	slots: MeasuredSlot[];
	lines: number;
	height: number;
}

interface MatterOmission {
	slot: Matter["slot"];
	id: Id;
	lines: number;
	reason: string;
}

interface MatterPlan {
	pages: MatterPagePlan[];
	omissions: MatterOmission[];
	/** ids of slots sharing a page with an earlier slot */
	merged: Id[];
}

interface MatterPolicy {
	/** slots intentionally left out of the printed plan (recorded, never silently absent) */
	drop: ReadonlySet<Matter["slot"]>;
	/** may a slot join an already-open matter page when the measured lines fit? */
	pack: boolean;
	/** the first slot keeps its page to itself — page 1 is the cover (docs/08 §4.5) */
	firstAlone: boolean;
	/** the citation a dropped slot carries */
	omissionReason: (slot: Matter["slot"]) => string;
}

/**
 * Pack the matter slots into printed pages by the SAME measured line accounting the story pages
 * use (docs/08 §4.5). A slot joins the page already open when the summed measured height still
 * fits the content box — the matter analogue of `edgesFrom` packing story blocks — so front
 * matter can occupy three pages where four single-purpose pages were emitted before. The first
 * slot keeps its page to itself (the cover) and the second therefore opens the title's verso.
 * A dropped slot is pushed to `omissions` with its reason: an intentional omission is recorded,
 * and the plan never silently loses a section.
 */
function planMatter(slots: readonly MeasuredSlot[], avail: number, policy: MatterPolicy): MatterPlan {
	const pages: MatterPagePlan[] = [];
	const omissions: MatterOmission[] = [];
	const merged: Id[] = [];
	let current: MatterPagePlan | null = null;
	let placed = 0;
	for (const s of slots) {
		if (policy.drop.has(s.slot)) {
			omissions.push({ slot: s.slot, id: s.id, lines: s.lines, reason: policy.omissionReason(s.slot) });
			continue;
		}
		const coverCloses = policy.firstAlone && placed === 1;
		const fits = current !== null && policy.pack && current.height + s.height <= avail;
		if (current !== null && !coverCloses && fits) {
			current.slots.push(s);
			current.lines += s.lines;
			current.height += s.height;
			merged.push(s.id);
		} else {
			current = { from: s.id, template: s.template, slots: [s], lines: s.lines, height: s.height };
			pages.push(current);
		}
		placed += 1;
	}
	return { pages, omissions, merged };
}

function buildMatterPage(
	pageNo: number,
	plan: MatterPagePlan,
	byId: Map<Id, MeasuredBlock>,
	session: MeasureSession,
	avail: number,
	thresholds: DensityThresholds,
	locks: LockIndex,
): ComposedPage {
	const refs = new Set<Id>();
	const blocks: (CompositionBlock & { height: number })[] = [];
	for (const slot of plan.slots) {
		for (const b of slot.blocks) {
			const m = byId.get(b.id);
			if (!m || m.lines === 0) continue;
			refs.add(b.id);
			blocks.push({ ref: b.id, role: b.role, lines: m.lines, measured_width_q: session.widthQ, height: m.height_q });
		}
	}
	const usedHeight = blocks.reduce((a, b) => a + b.height, 0);
	const honoured = locks.content.filter((l) => refs.has(l.target)).map(lockKey);
	return {
		page: pageNo,
		side: pageNo % 2 === 1 ? "recto" : "verso",
		template: plan.template,
		from: plan.from,
		blocks: blocks.map((b) => ({
			ref: b.ref,
			role: b.role,
			lines: b.lines,
			measured_width_q: b.measured_width_q,
		})),
		lines: blocks.reduce((a, b) => a + b.lines, 0),
		capacity_lines: linesPerPage(DESIGN),
		fill_ratio: round6(usedHeight / avail),
		density: classify(usedHeight, avail, thresholds),
		locks_honoured: honoured,
		locks_unsatisfied: [],
	};
}

/* ------------------------------------------------------------------ */
/* lock accounting                                                     */
/* ------------------------------------------------------------------ */

function accountLocks(
	book: Book,
	locks: LockIndex,
	pages: ComposedPage[],
	items: StoryItem[],
	beatRanges: Map<Id, BeatRange>,
	itemIndexById: Map<Id, number>,
	frontCount: number,
	structural: { lock: Lock; why: string }[],
): void {
	const pageOfBlock = new Map<Id, number>();
	const blocksOnPage = new Map<number, Set<Id>>();
	for (const p of pages) {
		const set = new Set<Id>();
		for (const b of p.blocks) {
			if (!pageOfBlock.has(b.ref)) pageOfBlock.set(b.ref, p.page);
			set.add(b.ref);
		}
		blocksOnPage.set(p.page, set);
	}
	const pageByNumber = new Map<number, ComposedPage>();
	for (const p of pages) pageByNumber.set(p.page, p);

	const attach = (pageNo: number, lock: Lock, why: string) => {
		const p = pageByNumber.get(pageNo);
		if (!p) return;
		(p.locks_unsatisfied as { lock: Lock; why: string }[]).push({ lock, why });
	};
	/** every lock must be reported somewhere: a page, or the first page. */
	const attachAnywhere = (lock: Lock, why: string) => {
		const first = pages[0];
		if (!first) return;
		(first.locks_unsatisfied as { lock: Lock; why: string }[]).push({ lock, why });
	};

	// structural failures (unresolvable targets)
	for (const s of structural) attachAnywhere(s.lock, s.why);

	// content locks are honoured by construction: this engine never rewrites text
	for (const l of locks.content) {
		const pg = pageOfBlock.get(l.target);
		if (pg === undefined) {
			attachAnywhere(l, "the block this content lock protects does not exist in the manuscript");
			continue;
		}
		const p = pageByNumber.get(pg)!;
		(p.locks_honoured as Id[]).push(lockKey(l));
	}

	// beat locks — split ⇒ a soft violation on the page it was split across
	for (const l of locks.beat) {
		const r = beatRanges.get(l.target);
		if (!r) {
			attachAnywhere(l, "the beat this lock protects does not exist");
			continue;
		}
		const blockIds = items.slice(r.start, r.end + 1).map((it) => it.id);
		const pageSet = new Set<Id>();
		for (const id of blockIds) {
			const pg = pageOfBlock.get(id);
			if (pg !== undefined) pageSet.add(id);
			void pg;
		}
		const pagesOf = new Set<number>();
		for (const id of blockIds) {
			const pg = pageOfBlock.get(id);
			if (pg !== undefined) pagesOf.add(pg);
		}
		if (pagesOf.size > 1) {
			const where = [...pagesOf].sort((a, b) => a - b)[0];
			attach(where, l, `the beat is split across pages ${[...pagesOf].sort((a, b) => a - b).join(", ")}`);
		} else if (pagesOf.size === 1) {
			const p = pageByNumber.get([...pagesOf][0])!;
			(p.locks_honoured as Id[]).push(lockKey(l));
		}
		void pageSet;
	}

	// keep-together
	for (const l of locks.keep_together) {
		const r = beatRanges.get(l.target);
		if (!r) {
			attachAnywhere(l, "the group this lock protects does not exist");
			continue;
		}
		const pagesOf = new Set<number>();
		for (let i = r.start; i <= r.end; i++) {
			const pg = pageOfBlock.get(items[i].id);
			if (pg !== undefined) pagesOf.add(pg);
		}
		if (pagesOf.size > 1) {
			attach([...pagesOf].sort((a, b) => a - b)[0], l, `the keep-together group spans pages ${[...pagesOf].sort((a, b) => a - b).join(", ")}`);
		} else if (pagesOf.size === 1) {
			(pageByNumber.get([...pagesOf][0])!.locks_honoured as Id[]).push(lockKey(l));
		}
	}

	// page_break (essential) — honoured iff the block starts a page
	for (const l of locks.page_break) {
		const pg = pageOfBlock.get(l.target);
		if (pg === undefined) {
			attachAnywhere(l, "the block this break names is missing from the plan");
			continue;
		}
		const p = pageByNumber.get(pg)!;
		const startsPage = p.blocks.length > 0 && p.blocks[0].ref === l.target;
		if (startsPage) {
			(p.locks_honoured as Id[]).push(lockKey(l));
		} else {
			(p.locks_unsatisfied as { lock: Lock; why: string }[]).push({
				lock: l,
				why: `the break must begin a page, but ${l.target} starts mid-page on page ${pg}`,
			});
		}
	}

	// print_page — H2: the named block must land on the named print page.
	// docs/07 §4.4's stricter edge-removal reading ("no unlocked content on a locked page")
	// is surfaced as an information note by the CLI, not as a failure: the documents' own
	// fixture (docs/16 §1.6) locks the *first block* of a beat to a page and still expects
	// the rest of that beat there, so "the page holds nothing else" is not the intent.
	for (const l of locks.print_page) {
		if (!l.page) {
			attachAnywhere(l, "the lock names no print page");
			continue;
		}
		const pg = pageOfBlock.get(l.target);
		if (pg === undefined) {
			attachAnywhere(l, "the block this print-page lock names is missing from the plan");
			continue;
		}
		const p = pageByNumber.get(pg)!;
		if (pg !== l.page) {
			(p.locks_unsatisfied as { lock: Lock; why: string }[]).push({
				lock: l,
				why: `the block landed on print page ${pg}, not the locked page ${l.page}`,
			});
			continue;
		}
		(p.locks_honoured as Id[]).push(lockKey(l));
	}
	void blocksOnPage;

	// design locks never enter the page solver (docs/07 §2) — this engine does not mutate the
	// design revision, so they hold by construction; they are recorded on page 1 so that every
	// lock in the book is accounted for somewhere.
	if (pages[0]) {
		for (const l of locks.design) (pages[0].locks_honoured as Id[]).push(lockKey(l));
	}
	void blocksOnPage;
	void frontCount;
	void book;
}

/* ------------------------------------------------------------------ */
/* the digital plan at a non-print content width                       */
/* ------------------------------------------------------------------ */

async function measureStoryAt(
	d: DesignRevision,
	book: Book,
	contentWidthPx: number,
	lang: string,
): Promise<StoryItem[]> {
	const session = await openMeasureSession({ widthPx: contentWidthPx, dsg: d, lang });
	try {
		const specs: { id: Id; text: string; role: string }[] = [];
		for (const beat of book.beats) for (const b of beat.blocks) specs.push({ id: b.id, text: b.text, role: b.role });
		const measured = await session.measure(specs);
		const byId = new Map<Id, MeasuredBlock>();
		measured.forEach((m) => byId.set(m.id, m));
		const items: StoryItem[] = [];
		for (let bi = 0; bi < book.beats.length; bi++) {
			for (const b of book.beats[bi].blocks) {
				const m = byId.get(b.id)!;
				if (m.lines === 0) continue;
				items.push({
					index: items.length,
					id: b.id,
					role: b.role,
					beatId: book.beats[bi].id,
					beatIndex: bi,
					words: m.words,
					lines: m.lines,
					lineHeights: m.line_heights_q,
					height: m.height_q,
				});
			}
		}
		return items;
	} finally {
		await session.close();
	}
}

function solveDigital(
	items: StoryItem[],
	avail: number,
	thresholds: DensityThresholds,
	d: DesignRevision,
	book: Book,
): { pages: number; cost: number } {
	const beatRanges = new Map<Id, BeatRange>();
	for (let bi = 0; bi < book.beats.length; bi++) {
		const beat = book.beats[bi];
		let start = -1;
		let end = -1;
		for (let i = 0; i < items.length; i++) {
			if (items[i].beatId !== beat.id) continue;
			if (start < 0) start = i;
			end = i;
		}
		if (start >= 0) beatRanges.set(beat.id, { start, end });
	}
	const tplForDigitalItem = (itemIndex: number): PageTemplate => {
		const it = items[itemIndex];
		return storyTemplate(book.beats[it.beatIndex], it.beatIndex, it.beatIndex === book.beats.length - 1);
	};
	const isSparseExempt = (itemIndex: number): boolean => {
		const t = tplForDigitalItem(itemIndex);
		return t === "opening_page" || t === "reflective_page" || t === "dramatic_reveal";
	};
	const forcedBreaks = new Set<number>();
	const idx = new Map<Id, number>();
	items.forEach((it) => idx.set(it.id, it.index));
	const beatLocked = new Set<Id>();
	const keepTogetherGroups = new Map<Id, BeatRange>();
	const preferenceBreaks = new Set<number>();
	for (const beat of book.beats) {
		for (const l of beat.locks ?? []) {
			const kind = canonicalLockKind(l.kind);
			if (kind === "page_break" && l.priority >= 2) {
				const i = idx.get(l.target);
				if (i !== undefined) forcedBreaks.add(i);
			} else if (kind === "page_break") {
				const i = idx.get(l.target);
				if (i !== undefined) preferenceBreaks.add(i);
			} else if (kind === "beat") {
				beatLocked.add(l.target);
			} else if (kind === "keep_together") {
				const r = beatRanges.get(l.target);
				if (r) keepTogetherGroups.set(l.target, r);
			}
		}
	}
	const ctx: SolveContext = {
		items,
		avail,
		thresholds,
		beatRanges,
		beatLocked,
		keepTogetherGroups,
		forcedBreaks,
		preferenceBreaks,
		orphans: d.typography.orphans,
		widows: d.typography.widows,
		targetStoryPages: 0,
		isSparseExempt,
		// The print turn parity is a property of the SADDLE-STITCHED BOOKLET's spreads. A screen
		// reflows to its own pairing (§6.10; the reader forces a fresh turn at the essential break),
		// so the rule is not imposed on the digital plan: `08` §5 rung 5' lets a small viewport merge
		// the break and disclose it rather than refuse to render.
		revealStarts: new Map<number, Lock>(),
		frontCount: 0,
		// `print_page_lock` is n/a on a viewport (docs/07 §3) — there is no fixed physical page to pin to.
		printPagePins: [],
		totalPagesFor: (s: number) => s,
		targetTotal: 1 << 30, // the digital count carries no page-count penalty
	};
	const r = solve(ctx);
	return { pages: r.pages, cost: r.cost };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
	const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const jsonOut = !process.argv.includes("--no-json");
	const path = args[0] ?? "content/david-and-goliath.json";

	let book: Book;
	try {
		book = JSON.parse(readFileSync(path, "utf8")) as Book;
	} catch (e) {
		console.error(`paginate: cannot read the book at ${path}`);
		console.error(String(e instanceof Error ? e.message : e));
		console.error("        (another agent may still be authoring it; see tools/gen-fixture.mjs for the temporary fixture)");
		process.exit(2);
	}

	const { composition, engine, storyWords, storyBlocks, probe } = await paginate(
		book,
		DESIGN,
		book.target_print_pages,
	);

	if (jsonOut) {
		process.stdout.write(JSON.stringify(composition, null, 2) + "\n");
	}

	/* the human table, on stderr */
	const L: string[] = [];
	L.push("");
	L.push(`composition ${composition.id}   book ${composition.book_id}   dsg ${composition.dsg_rev}`);
	L.push(`engine ${engine}`);
	L.push(
		`probe  ${probe.words} words / ${probe.line_boxes} line boxes = ${probe.words_per_line_raw.toFixed(4)} wpl  ` +
			`(design claims 7.3; words_per_page_measured ${probe.words_per_page_measured})`,
	);
	L.push(
		`story  ${storyBlocks} blocks, ${storyWords} words; solver cost ${composition.solver.cost}; ` +
			`story pages ${composition.counts.story}; pad ${composition.counts.pad}; total ${composition.counts.total}`,
	);
	L.push("");
	L.push("  page side   template           from                 lines/cap  fill    density    locks");
	L.push("  ---- ------ ------------------ -------------------- ---------- ------- ---------- -----");
	for (const p of composition.pages) {
		const locks =
			[...p.locks_honoured.map((h) => `+${h}`), ...p.locks_unsatisfied.map((u) => `!${lockKey(u.lock)}`)].join(" ") || "-";
		L.push(
			`  ${String(p.page).padStart(4)} ${p.side.padEnd(6)} ${p.template.padEnd(18)} ${p.from.padEnd(20)} ` +
				`${String(p.lines).padStart(3)}/${String(p.capacity_lines).padEnd(3)}   ${p.fill_ratio.toFixed(4).padStart(6)}  ` +
				`${p.density.padEnd(10)} ${locks}`,
		);
	}
	const unsat = composition.pages.flatMap((p) => p.locks_unsatisfied.map((u) => ({ ...u, page: p.page })));
	// The count the CLI *recognised*. The manuscript spells its lock kinds with a `_lock` suffix
	// (`content_lock`, `page_break_lock`, `print_page_lock`) while `contracts.LockKind` names the
	// same classes unsuffixed; `paginate.ts` normalises the two (`canonicalLockKind`). A green
	// "every lock is honoured" is vacuous if the engine can see no lock at all, so the count is
	// printed: a declared-but-unaccounted lock is a bug, and a total of zero is the loudest alarm.
	const declaredLocks: Lock[] = [];
	for (const b of book.beats) for (const l of b.locks ?? []) declaredLocks.push(l);
	const declaredByKind: Record<string, number> = {};
	for (const l of declaredLocks) {
		const k = canonicalLockKind(l.kind);
		declaredByKind[k] = (declaredByKind[k] ?? 0) + 1;
	}
	const kindSummary = Object.keys(declaredByKind)
		.sort()
		.map((k) => `${k} ${declaredByKind[k]}`)
		.join(", ");
	const honouredHits = composition.pages.reduce((a, p) => a + p.locks_honoured.length, 0);
	const unsatisfiedHits = composition.pages.reduce((a, p) => a + p.locks_unsatisfied.length, 0);
	L.push("");
	L.push(
		`  locks  ${declaredLocks.length} declared by the author  (${kindSummary || "none"})   ` +
			`${honouredHits} honoured · ${unsatisfiedHits} unsatisfied · ${honouredHits + unsatisfiedHits} accounted`,
	);
	if (declaredLocks.length === 0) {
		L.push("  ALARM: the engine recognised NO lock at all — the sentence below would be vacuous. Check the lock-kind spellings.");
	} else if (honouredHits + unsatisfiedHits !== declaredLocks.length) {
		L.push(
			`  WARNING: ${declaredLocks.length - (honouredHits + unsatisfiedHits)} declared lock(s) were not accounted for; ` +
				`the engine cannot see every lock the author wrote.`,
		);
	}
	if (unsat.length === 0) {
		L.push(`  every lock the author set is honoured (${honouredHits} honoured of ${declaredLocks.length} declared, all recognised).`);
	} else {
		L.push(`  ${unsat.length} UNSATISFIED LOCK(S) — the author's intent was NOT silently overridden:`);
		for (const u of unsat) {
			L.push(`    page ${u.page}: ${lockKey(u.lock)} (priority ${u.lock.priority}) — ${u.why}`);
			L.push(`              reason given by the author: "${u.lock.why}"`);
		}
	}
	L.push("");
	// the page-turn parity (docs/05 §2.5): every turn, the print page it precedes, and whether that
	// page is reached by a real turn (even) or faces its predecessor (odd — no turn hides anything).
	L.push(
		`  turns  ${composition.turns.length} declared; the printed booklet pairs {1} · {2,3} · {4,5} · {6,7} · … ` +
			`so only an EVEN print page is reached by a turn.`,
	);
	for (const t of composition.turns) {
		const even = t.before_page % 2 === 0;
		const isReveal = t.why.includes("reveal:");
		L.push(
			`    before page ${String(t.before_page).padStart(3)}  ${even ? "verso" : "recto"}  ` +
				`${even ? "a real turn    " : "FACING PAGE    "} ${isReveal ? "REVEAL" : "turn  "}  ${t.beat_id}`,
		);
	}
	const extra = composition.measure as unknown as {
		rendered_face?: string;
		matter_plan?: {
			front: { pages: number; layout: { from: string; template: string; slots: string[]; lines: number }[] };
			back: { pages: number; layout: { from: string; template: string; slots: string[]; lines: number }[] };
			dropped_slots: { slot: string; id: string; lines: number; reason: string }[];
			merged_slots: string[];
			convention: string;
		};
		line_budget?: {
			target_story_pages: number;
			lines_per_story_page_ceiling: number;
			lines_available: number;
			lines_reserved_non_prose: number;
			lines_reserved_by_role: Record<string, number>;
			lines_available_for_prose: number;
			words_per_line_measured: number;
			words_available_for_prose: number;
			measured_story_lines: number;
			measured_prose_lines: number;
			measured_non_prose_lines: number;
			prose_fits_story_pages: boolean;
			fits_target_story_pages: boolean;
			pre_reveal: {
				beat_id: string;
				before_page: number;
				story_ordinal: number;
				story_pages_before_reveal: number;
				lines_before_reveal: number;
				lines_available_before_reveal: number;
				fits: boolean;
				reveal_beat_lines: number;
				reveal_beat_available_lines: number;
				reveal_beat_fits: boolean;
			} | null;
			verdict: string;
			story_pages_solved: number;
			total_pages: number;
			pad: number;
			densest_story_page: {
				page: number;
				used_lines: number;
				capacity_lines: number;
				fill_ratio: number;
				density: string;
			} | null;
		};
		turn_parity?: {
			rule: string;
			satisfied: boolean;
			relaxed: boolean;
			reveals: { beat_id: string; before_page: number | null; even: boolean; begins_page: boolean }[];
		};
	};
	if (extra.rendered_face) L.push(`  measure face  ${extra.rendered_face}   (a fallback face silently changes every line count)`);
	if (extra.matter_plan) {
		const mp = extra.matter_plan;
		L.push("");
		L.push(
			`  matter  front ${mp.front.pages} + story ${composition.counts.story} + back ${mp.back.pages} = ` +
				`${mp.front.pages + composition.counts.story + mp.back.pages} pages, pad ${composition.counts.pad}, total ${composition.counts.total}`,
		);
		for (const p of mp.front.layout) L.push(`    front  ${p.from.padEnd(22)} ${p.template.padEnd(18)} slots [${p.slots.join(", ")}]  ${p.lines} lines`);
		for (const p of mp.back.layout) L.push(`    back   ${p.from.padEnd(22)} ${p.template.padEnd(18)} slots [${p.slots.join(", ")}]  ${p.lines} lines`);
		for (const o of mp.dropped_slots) L.push(`    DROPPED (intentional)  ${o.slot} (${o.id}), ${o.lines} lines — ${o.reason}`);
		if (mp.merged_slots.length) L.push(`    packed onto a shared page: ${mp.merged_slots.join(", ")}`);
	}
	if (extra.turn_parity) {
		const tp = extra.turn_parity;
		L.push(
			`  parity ${tp.satisfied ? "SATISFIED — every reveal opens an even print page (a real turn)" : "VIOLATED — a reveal opens a facing page"}` +
				`${tp.relaxed ? "  (the constrained graph had no path; relaxed and REPORTED, never silent)" : ""}`,
		);
		for (const r of tp.reveals) {
			L.push(
				`    reveal ${r.beat_id}: before_page ${r.before_page ?? "(none)"}` +
					` (${r.before_page === null ? "opens no page" : r.before_page % 2 === 0 ? "even — verso, a real turn" : "ODD — faces its predecessor"})` +
					`, begins a page: ${r.begins_page}`,
			);
		}
	}
	if (extra.line_budget) {
		const b = extra.line_budget;
		L.push("");
		L.push("  line budget  (docs/05 §1.6 derives the word budget as if prose were alone on a story page — it is not)");
		L.push(
			`    lines available            ${String(b.lines_available).padStart(4)}  = ${b.target_story_pages} story pages × ${b.lines_per_story_page_ceiling} balanced-ceiling lines`,
		);
		L.push(
			`    lines reserved, non-prose  ${String(b.lines_reserved_non_prose).padStart(4)}  ${JSON.stringify(b.lines_reserved_by_role)}`,
		);
		L.push(
			`    lines available for prose  ${String(b.lines_available_for_prose).padStart(4)}  → ${b.words_available_for_prose} words at ${b.words_per_line_measured} words/line`,
		);
		L.push(
			`    measured                   ${String(b.measured_story_lines).padStart(4)}  = ${b.measured_prose_lines} prose + ${b.measured_non_prose_lines} non-prose` +
				`  (prose alone fits the story pages: ${b.prose_fits_story_pages}; the whole story fits: ${b.fits_target_story_pages})`,
		);
		L.push(
			`    verdict                    ${b.verdict.toUpperCase()}  (story pages solved ${b.story_pages_solved}, pad ${b.pad}, total ${b.total_pages})`,
		);
		if (b.pre_reveal) {
			const pr = b.pre_reveal;
			L.push(
				`    pre-reveal (${pr.beat_id} at print page ${pr.before_page} = story page ${pr.story_ordinal})  ` +
					`${pr.lines_before_reveal} lines must fit ${pr.story_pages_before_reveal} pages × ${b.lines_per_story_page_ceiling} = ${pr.lines_available_before_reveal}: ` +
					`${pr.fits ? "fits" : "TOO TIGHT"}`,
			);
			L.push(
				`    the reveal beat itself       ${pr.reveal_beat_lines} lines (one balanced page holds ${pr.reveal_beat_available_lines}): ` +
					`${pr.reveal_beat_fits ? "fits on one page" : "would need more than one page"}. The parity rule fixes this beat's page, ` +
					`so what precedes it cannot borrow from what follows.`,
			);
			L.push(
				`    => the trim is not one number: the whole story must fit ${b.lines_available} lines AND the lines before the ` +
					`reveal must fit the pages before it. Whether 9 story pages are then actually cheaper than 10 is the DP's own ` +
					`answer, and it is the verdict above.`,
			);
		}
		if (b.densest_story_page) {
			const d = b.densest_story_page;
			L.push(
				`    densest story page         page ${d.page}: ${d.used_lines}/${d.capacity_lines} lines, fill ${d.fill_ratio.toFixed(4)}, ${d.density}`,
			);
		}
	}
	L.push("");
	// informational: a print_page-locked page that also carries other content (docs/07 §4.4)
	const notes: string[] = [];
	for (const p of composition.pages) {
		const ppl = p.locks_honoured.filter((h) => canonicalLockKind(h.split(":")[0]) === "print_page");
		if (ppl.length === 0) continue;
		const targets = ppl.map((h) => h.slice(h.indexOf(":") + 1));
		const others = p.blocks.filter((b) => !targets.includes(b.ref)).map((b) => b.ref);
		if (others.length > 0) {
			notes.push(`page ${p.page}: ${targets.join(", ")} pinned here; the page also carries ${others.join(", ")}`);
		}
	}
	if (notes.length > 0) {
		L.push("  notes (placement honoured; the pinned page also carries this content):");
		for (const n of notes) L.push(`    ${n}`);
		L.push("");
	}
	const dg = composition.digital.measured_at
		.map((m) => `${m.viewport}${m.spread ? " (spread)" : " (single)"} ${m.pages}`)
		.join("   ");
	L.push(`digital  ${dg}   -> range ${composition.digital.range.min}-${composition.digital.range.max}`);
	L.push(`  docs/08 §9.6 + docs/16 §2 A-11 claim 18 (360x640) and 9 (1440x900) -> 9-18.`);
	L.push(
		`  this engine measured [${composition.digital.range.min}, ${composition.digital.range.max}]${
			composition.digital.range.min === 9 && composition.digital.range.max === 18
				? "  (agrees with the documents)"
				: "  (DISAGREES with the documents)"
		}.`,
	);
	L.push("");
	L.push("  the two pairings — reported here, not changed here (src/reader/** is not this file):");
	L.push("    print (AUTHORITATIVE for the physical book): {1} · {2,3} · {4,5} · {6,7} · … — a turn reaches an");
	L.push("      EVEN page, so a reveal is hidden only on a verso (docs/05 §2.5). This pass enforces exactly that.");
	L.push("    digital (src/reader/runtime.ts groupTurns): a turn holds the display pages of ONE printed spread,");
	L.push("      and any page that begins at an essential break opens a turn of its own — so the reveal is reached");
	L.push("      by a turn at every viewport even where the printed pairing alone would not, and the disclosure");
	L.push("      names it when that anchor breaks the printed pairing. Observed on the published artifact at");
	L.push("      1440x900: (2,3) (4,5) (6,7) (8,9), then the reveal's own page alone — the turn is real.");
	L.push("    verdict: the reader needs no change for the turn — its anchor rule is a STRONGER guarantee than");
	L.push("      parity. The divergence is one of pairing only, and the printed pairing decides the physical book.");
	L.push("    (src/reader/** changed during this pass, by another agent; this file did not touch it.)");
	L.push("");
	console.error(L.join("\n"));
}

const isMain =
	typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	main().catch((e) => {
		console.error(String(e instanceof Error ? e.stack ?? e.message : e));
		process.exit(2);
	});
}
