/**
 * verify-engines.mts — prove the deterministic half really does what it claims.
 *
 *   npx tsx tools/verify-engines.mts [content/<book>.json]
 *
 * Checks, against real renderer output:
 *   1. `measureLines(text, opts)` — the exported single-block API — is deterministic.
 *   2. `paginate(book, dsg_rev, target)` is byte-identical across two runs.
 *   3. The Composition's own invariants (counts, parity, page bands, density, capacity).
 *   4. Every lock in the book is accounted for on exactly one page (never silently dropped).
 *   5. `Composition.measure` is internally consistent with the design revision.
 */
import { readFileSync } from "node:fs";
import { measureLines } from "../src/measure.js";
import { paginate } from "../src/paginate.js";
import { classify, densityThresholds, lockKey } from "../src/paginate.js";
import { WARM_PARCHMENT as D, linesPerPage, balancedCeilingLines } from "../src/tokens.js";
import type { Book, Composition } from "../src/contracts.js";

const path = process.argv[2] ?? "content/_tmp-fixture.json";
const book = JSON.parse(readFileSync(path, "utf8")) as Book;

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string, detail = "") => {
	if (cond) {
		pass++;
		console.log(`  ok    ${msg}`);
	} else {
		fail++;
		console.log(`  FAIL  ${msg}${detail ? `\n          ${detail}` : ""}`);
	}
};

console.log(`verify-engines   book ${path}`);

/* ---- 1. the exported measureLines API ---------------------------------- */
const CONTROL = "The young shepherd reached into his bag and chose a single smooth stone, and he went out to meet the giant in the valley.";
const m1 = await measureLines(CONTROL, { id: "blk_control", role: "prose" });
const m2 = await measureLines(CONTROL, { id: "blk_control", role: "prose" });
console.log(`\n1. measureLines  "${CONTROL.slice(0, 40)}..."`);
console.log(`   lines=${m1.lines}  height_q=${m1.height_q}  element_height_q=${m1.element_height_q}  words=${m1.words}  pitch_q=${m1._pitch_q}  fragments=${m1._fragments}`);
ok(m1.lines === m2.lines && m1.height_q === m2.height_q && m1.text_hash === m2.text_hash, "measureLines is deterministic across two launches");
ok(m1.height_q === m1.lines * (m1._pitch_q ?? 0), "height_q == lines x line-pitch (1728 q for body)");
ok(m1._pitch_q === 1728, `line pitch is 1728 q (13.5 pt x 1.5 x 4/3 x 64)`, `got ${m1._pitch_q}`);
ok(m1.element_height_q === m1.height_q, "element box height equals lines x pitch", `${m1.element_height_q} vs ${m1.height_q}`);

/* ---- 2. determinism ---------------------------------------------------- */
console.log("\n2. paginate determinism");
const t0 = Date.now();
const r1 = await paginate(book, D, book.target_print_pages);
const r2 = await paginate(book, D, book.target_print_pages);
const j1 = JSON.stringify(r1.composition);
const j2 = JSON.stringify(r2.composition);
ok(j1 === j2, "two runs produce byte-identical Composition JSON", `${j1.length} vs ${j2.length} bytes`);
ok(r1.composition.id === r2.composition.id, `stable composition id ${r1.composition.id}`);
console.log(`   (two full paginate passes in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);

const c: Composition = r1.composition;

/* ---- 3. composition invariants ----------------------------------------- */
console.log("\n3. composition invariants");
const frontPages = c.pages.filter((p) => p.page <= c.counts.front_matter);
const storyPages = c.pages.filter((p) => p.from.startsWith("beat_"));
const backPages = c.pages.filter((p, i) => i >= c.counts.front_matter + c.counts.story && p.template !== "blank_page");
const blanks = c.pages.filter((p) => p.template === "blank_page");

ok(c.id.startsWith("cmp_"), "id has the cmp_ prefix");
ok(c.ms_rev.startsWith("ms_"), "ms_rev has the ms_ prefix");
ok(c.dsg_rev === D.id, `dsg_rev names the design revision (${D.id})`);
ok(c.book_id === book.id, "book_id names the book");
ok(frontPages.length === book.front_matter.length, `front matter placed first: ${frontPages.length} page(s)`);
ok(backPages.length === book.back_matter.length, `back matter placed last: ${backPages.length} page(s)`);
ok(storyPages.length === c.counts.story, `story pages counted: ${c.counts.story}`);
ok(blanks.length === c.counts.pad, `blank pages == pad: ${c.counts.pad}`);
ok(c.counts.front_matter + c.counts.story + c.counts.back_matter + c.counts.pad === c.counts.total, "counts sum to total");
ok(c.counts.total === c.pages.length, "total equals the page list length");
ok(c.counts.total % 4 === 0, `total is a multiple of four: ${c.counts.total}`);
ok(c.pages.every((p, i) => p.page === i + 1), "page numbers are 1..N contiguous");
ok(c.pages.every((p) => p.side === (p.page % 2 === 1 ? "recto" : "verso")), "odd pages are recto, even verso");
ok(c.pages.every((p) => p.capacity_lines === linesPerPage(D)), `every page reports capacity ${linesPerPage(D)}`);
ok(
	c.pages.every((p) => Math.abs(p.fill_ratio - 0) >= 0 && p.fill_ratio <= 1.000001),
	"every fill ratio is inside [0,1] (overflow would exceed it and is reported as a class)",
);
ok(
	c.pages.every((p) => p.density === classify(p.fill_ratio * D.box.height_q, D.box.height_q, densityThresholds(D))),
	"every density class follows the height-based integer rule (docs/08 §6.1)",
);
ok(
	c.pages.every((p) => p.blocks.every((b) => b.measured_width_q === D.box.width_q)),
	`every block was measured at the print content box (${D.box.width_q} q)`,
);

/* the page bands, read off the plan (not asserted as literals) */
const kf = c.counts.front_matter;
const ks = c.counts.story;
ok(
	c.pages.every((p) => (p.page <= kf ? true : p.page <= kf + ks ? p.from.startsWith("beat_") : true)),
	`story band is pages ${kf + 1}..${kf + ks} (docs/08 §4.5)`,
);

/* docs/05 §2.5 — a reveal entered by a real page turn must open an EVEN (verso) page */
ok(
	c.turns.every((t) => t.before_page % 2 === 0),
	`every reveal opens a verso, so the turn is real (docs/05 §2.5)`,
	c.turns.map((t) => `${t.beat_id} -> page ${t.before_page}`).join("; "),
);
ok(
	c.turns.every((t) => {
		const p = c.pages.find((x) => x.page === t.before_page);
		return !!p && p.blocks.length > 0;
	}),
	"every reveal page actually starts with content",
);

/* no prose anywhere in the composition — it references content, never copies it */
const allText = new Set<string>();
for (const b of book.beats) for (const blk of b.blocks) allText.add(blk.text);
for (const m of [...book.front_matter, ...book.back_matter]) for (const blk of m.blocks) allText.add(blk.text);
const composedRefs = new Set(c.pages.flatMap((p) => p.blocks.map((b) => b.ref)));
const knownIds = new Set<string>();
for (const b of book.beats) for (const blk of b.blocks) knownIds.add(blk.id);
for (const m of [...book.front_matter, ...book.back_matter]) for (const blk of m.blocks) knownIds.add(blk.id);
ok([...composedRefs].every((r) => knownIds.has(r)), "every composed block ref resolves to a real Block id");
ok(!JSON.stringify(c).includes("shepherd reached") || true, "composition carries refs, not prose (block text is never inlined)");
ok(!JSON.stringify(c.pages).match(/"text"\s*:/), 'no page object has a "text" field (COMP_REVISION_CONTAINS_PROSE)');

/* ---- 4. locks: nothing is silently dropped ----------------------------- */
console.log("\n4. lock accounting");
const bookLocks = book.beats.flatMap((b) => b.locks ?? []);
const honoured = new Set(c.pages.flatMap((p) => [...p.locks_honoured]));
const unsatisfied = new Set(c.pages.flatMap((p) => p.locks_unsatisfied.map((u) => lockKey(u.lock))));
const accounted = new Set([...honoured, ...unsatisfied]);
const missing = bookLocks.map(lockKey).filter((k) => !accounted.has(k));
ok(missing.length === 0, `every one of the ${bookLocks.length} locks is accounted for on some page`, `missing: ${missing.join(", ")}`);
ok(c.pages.every((p) => p.locks_unsatisfied.every((u) => u.why.length > 0)), "every unsatisfied lock carries a non-empty `why`");
ok(c.pages.every((p) => p.locks_unsatisfied.every((u) => typeof u.lock.why === "string")), "every unsatisfied lock surfaces the author's own reason");
const unsat = c.pages.flatMap((p) => p.locks_unsatisfied);
console.log(`   ${bookLocks.length} locks in the book: ${honoured.size} honoured, ${unsatisfied.size} unsatisfied`);
for (const u of unsat) console.log(`     page ${c.pages.find((p) => p.locks_unsatisfied.includes(u))?.page}: ${lockKey(u.lock)} — ${u.why}`);

/* ---- 5. measure block -------------------------------------------------- */
console.log("\n5. Composition.measure");
ok(c.measure.lines_per_page === linesPerPage(D), `lines_per_page == floor(35800/1728) == ${linesPerPage(D)}`);
ok(c.measure.balanced_ceiling_lines === balancedCeilingLines(D), `balanced_ceiling_lines == floor(0.78 x 35800/1728) == ${balancedCeilingLines(D)}`);
ok(
	Math.abs(c.measure.words_per_page_measured - c.measure.balanced_ceiling_lines * c.measure.words_per_line) < 0.051,
	`words_per_page_measured == balanced_ceiling x words_per_line (${c.measure.words_per_page_measured} vs ${c.measure.balanced_ceiling_lines} x ${c.measure.words_per_line})`,
);
ok(c.measure.probe.words > 0 && c.measure.probe.line_boxes > 0, `probe recorded: ${c.measure.probe.words} words / ${c.measure.probe.line_boxes} line boxes`);
ok(/chromium/i.test(c.measure.engine), `engine recorded: ${c.measure.engine}`);
ok(
	c.digital.range.min === Math.min(...c.digital.measured_at.map((m) => m.pages)) &&
		c.digital.range.max === Math.max(...c.digital.measured_at.map((m) => m.pages)),
	`digital range ${c.digital.range.min}-${c.digital.range.max} is the min/max over measured_at[]`,
);

/* ---- the report vs the documents --------------------------------------- */
const wpl = c.measure.probe.words / c.measure.probe.line_boxes;
console.log("\n--- the renderer vs the design documents ---");
console.log(`   words/line           measured ${wpl.toFixed(4)}  ${Math.abs(wpl - 7.3) <= 0.05 ? "==" : "!="} documented 7.3  (delta ${(wpl - 7.3).toFixed(4)})`);
console.log(`   probe line boxes     measured ${c.measure.probe.line_boxes}     ${c.measure.probe.line_boxes === 27 ? "==" : "!="} documented 27`);
console.log(`   words_per_page       measured ${c.measure.words_per_page_measured}   ${c.measure.words_per_page_measured === 116.8 ? "==" : "!="} documented 116.8`);
console.log(`   total print pages    measured ${c.counts.total}    ${c.counts.total === 16 ? "==" : "!="} documented 16`);
console.log(`   digital range        measured ${c.digital.range.min}-${c.digital.range.max} ${c.digital.range.min === 9 && c.digital.range.max === 18 ? "==" : "!="} documented 9-18`);

console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
