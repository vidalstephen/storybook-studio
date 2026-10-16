#!/usr/bin/env node
/**
 * validate.mjs — shape + scripture-fidelity checks for content/david-and-goliath.json
 *
 * Plain Node.js, no dependencies.  Run from anywhere:
 *
 *     node content/validate.mjs
 *
 * Hard checks (a failure sets a non-zero exit code):
 *   1. the file parses, and the Book shape is complete (contracts.ts)
 *   2. exactly 9 beats, ids beat_dg_*, 2-5 blocks each, ids blk_dg_*
 *   3. exactly 4 front-matter slots (title, copyright, dedication, contents)
 *      and exactly 3 back-matter slots (memory_verse, discussion, about)
 *   4. every role:"scripture" block carries a scripture_ref
 *   5. the load-bearing page 9 -> 10 pin:
 *        beat_dg_5 ends on   "The young shepherd reached into his bag and chose a single smooth stone."
 *        beat_dg_6 begins on "With courage in his heart, David stepped forward."
 *
 * Reported, never failed (per the task brief):
 *   6. any word in a scripture block that does not appear in the WEB verses
 *      its scripture_ref points at (a fidelity smell, not a hard error)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BOOK_PATH = join(here, "david-and-goliath.json");

// --- WEB (World English Bible, public domain) 1 Samuel 17:45-50, verbatim ---
// Used only to check that a role:"scripture" block's words actually come from
// the verses it cites.  Punctuation is normalised before comparison.
const WEB_1SAM17 = {
  45: "Then David said to the Philistine, “You come to me with a sword, with a spear, and with a javelin; but I come to you in the name of Yahweh of Armies, the God of the armies of Israel, whom you have defied.",
  46: "Today, Yahweh will deliver you into my hand. I will strike you, and take your head from off you. I will give the dead bodies of the army of the Philistines today to the birds of the sky, and to the wild animals of the earth; that all the earth may know that there is a God in Israel,",
  47: "and that all this assembly may know that Yahweh doesn’t save with sword and spear; for the battle is Yahweh’s, and he will give you into our hand.”",
  48: "When the Philistine arose, and walked and came near to meet David, David hurried, and ran toward the army to meet the Philistine.",
  49: "David put his hand in his bag, took a stone, and slung it, and struck the Philistine in his forehead. The stone sank into his forehead, and he fell on his face to the earth.",
  50: "So David prevailed over the Philistine with a sling and with a stone, and struck the Philistine, and killed him; but there was no sword in the hand of David.",
};

const STONE_SENTENCE = "The young shepherd reached into his bag and chose a single smooth stone.";
const FORWARD_SENTENCE = "With courage in his heart, David stepped forward.";

const FRONT_SLOTS = ["title", "copyright", "dedication", "contents"];
const BACK_SLOTS = ["memory_verse", "discussion", "about"];

// --- small helpers ---------------------------------------------------------
const failures = [];
const reports = [];
const ok = [];
const fail = (m) => failures.push(m);
const note = (m) => reports.push(m);

// for the scripture subset test: apostrophes and quotes become spaces
const normalise = (s) =>
  s.replace(/[\u2018\u2019\u201C\u201D"']/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
// for counting: an apostrophe inside a word ("weaver's") is part of the word, not a split
const countWords = (s) =>
  s.replace(/[^\p{L}\p{N}'\u2019\s]/gu, " ").split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
const words = (s) => normalise(s).split(" ").filter(Boolean);
const sentences = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

// --- load ------------------------------------------------------------------
let book;
try {
  book = JSON.parse(readFileSync(BOOK_PATH, "utf8"));
} catch (e) {
  console.error(`FATAL: cannot read/parse ${BOOK_PATH}\n  ${e.message}`);
  process.exit(1);
}

// --- 1. required Book shape (contracts.ts) ---------------------------------
const need = (cond, msg) => { cond ? ok.push(msg) : fail(msg); };

need(typeof book.id === "string" && book.id.length > 0, "book.id is a non-empty string");
need(book.meta && typeof book.meta === "object", "book.meta is an object");
if (book.meta) {
  need(typeof book.meta.title === "string" && book.meta.title.length > 0, "meta.title present");
  need(typeof book.meta.author === "string", "meta.author present");
  need(book.meta.audience && Number.isInteger(book.meta.audience.age_from) && Number.isInteger(book.meta.audience.age_to), "meta.audience.{age_from,age_to} are integers");
  need(typeof book.meta.audience?.reading_pt === "string", "meta.audience.reading_pt present");
  need(typeof book.meta.publication_type === "string", "meta.publication_type present");
  need(typeof book.meta.language === "string", "meta.language present");
  need(typeof book.meta.copyright === "string", "meta.copyright present");
}
need(Number.isInteger(book.target_print_pages), "target_print_pages is an integer");
need(book.budget && typeof book.budget === "object", "budget is an object");
if (book.budget) {
  need(Number.isFinite(book.budget.target_words), "budget.target_words is a number");
  need(Number.isFinite(book.budget.lower_floor_words), "budget.lower_floor_words is a number");
  need(Number.isFinite(book.budget.reserve_words), "budget.reserve_words is a number");
  need(typeof book.budget.derived_from === "string" && book.budget.derived_from.length > 0, "budget.derived_from present");
}
need(Array.isArray(book.front_matter), "front_matter is an array");
need(Array.isArray(book.beats), "beats is an array");
need(Array.isArray(book.back_matter), "back_matter is an array");
need(Array.isArray(book.scripture), "scripture is an array");

// --- 2. beats ---------------------------------------------------------------
const beats = Array.isArray(book.beats) ? book.beats : [];
need(beats.length === 9, `exactly 9 beats (found ${beats.length})`);
const seenBeatIds = new Set();
const seenBlockIds = new Set();
const allBlocks = [];
let storyProseWords = 0;

beats.forEach((b, i) => {
  const tag = `beats[${i}] (${b && b.id})`;
  need(typeof b?.id === "string" && b.id.startsWith("beat_dg_"), `${tag}: id is beat_dg_*`);
  if (seenBeatIds.has(b?.id)) fail(`${tag}: duplicate beat id`);
  seenBeatIds.add(b?.id);
  need(typeof b?.kind === "string", `${tag}: kind present`);
  need(typeof b?.summary === "string" && b.summary.trim().length > 0, `${tag}: author-facing summary non-empty`);
  const blocks = Array.isArray(b?.blocks) ? b.blocks : [];
  need(blocks.length >= 2 && blocks.length <= 5, `${tag}: between 2 and 5 blocks (found ${blocks.length})`);
  blocks.forEach((blk, j) => {
    const btag = `${tag}.blocks[${j}] (${blk && blk.id})`;
    need(typeof blk?.id === "string" && blk.id.startsWith("blk_dg_"), `${btag}: id is blk_dg_*`);
    if (seenBlockIds.has(blk?.id)) fail(`${btag}: duplicate block id`);
    seenBlockIds.add(blk?.id);
    need(typeof blk?.role === "string", `${btag}: role present`);
    need(typeof blk?.text === "string" && blk.text.trim().length > 0, `${btag}: text non-empty`);
    if (blk?.role === "scripture") {
      need(!!blk.scripture_ref && typeof blk.scripture_ref === "object",
        `${btag}: scripture block carries a scripture_ref`);
      if (blk.scripture_ref) {
        const r = blk.scripture_ref;
        need(typeof r.book === "string" && Number.isInteger(r.chapter) && Number.isInteger(r.verse_from),
          `${btag}: scripture_ref has book/chapter/verse_from`);
        need(typeof r.translation === "string", `${btag}: scripture_ref.translation present`);
      }
    }
    if (blk?.role === "prose") storyProseWords += countWords(blk.text);
    allBlocks.push(blk);
  });
});
ok.push(`beats: ${beats.length} beats, ${seenBlockIds.size} blocks`);

// --- 3. matter slots --------------------------------------------------------
function checkMatter(list, slots, label) {
  const arr = Array.isArray(list) ? list : [];
  need(arr.length === slots.length, `${label}: exactly ${slots.length} slots (found ${arr.length})`);
  const got = arr.map((m) => m?.slot);
  slots.forEach((s) => need(got.includes(s), `${label}: has a "${s}" slot`));
  arr.forEach((m, i) => {
    need(typeof m?.id === "string" && m.id.length > 0, `${label}[${i}]: id present`);
    need(Array.isArray(m?.blocks) && m.blocks.length > 0, `${label}[${i}] (${m?.slot}): has blocks`);
    (m?.blocks || []).forEach((blk) => allBlocks.push(blk));
  });
}
checkMatter(book.front_matter, FRONT_SLOTS, "front_matter");
checkMatter(book.back_matter, BACK_SLOTS, "back_matter");

// --- 4. the page 9 -> 10 pin ------------------------------------------------
const beat5 = beats.find((b) => b.id === "beat_dg_5");
const beat6 = beats.find((b) => b.id === "beat_dg_6");
const lastProse = (b) => [...(b?.blocks || [])].reverse().find((x) => x.role === "prose");
const firstBlock = (b) => (b?.blocks || [])[0];
const b5 = lastProse(beat5);
const b6 = firstBlock(beat6);
if (!b5) fail("beat_dg_5 has no prose block to end the beat");
else {
  const lastSentence = sentences(b5.text).slice(-1)[0] || "";
  need(normalise(lastSentence) === normalise(STONE_SENTENCE),
    `beat_dg_5 ends on the stone sentence ("${lastSentence.slice(0, 48)}...")`);
}
if (!b6) fail("beat_dg_6 has no opening block");
else {
  const firstSentence = sentences(b6.text)[0] || "";
  need(normalise(firstSentence) === normalise(FORWARD_SENTENCE),
    `beat_dg_6 opens on the step-forward sentence ("${firstSentence.slice(0, 48)}...")`);
  need(b6.id === "blk_dg_forward", "beat_dg_6 opens with blk_dg_forward");
}

// --- 5. scripture text vs the cited WEB verses (report only) ---------------
const scriptureBlocks = allBlocks.filter((b) => b?.role === "scripture");
scriptureBlocks.forEach((blk) => {
  const r = blk.scripture_ref;
  if (!r) return; // already failed above
  if (r.book !== "1 Samuel" || r.chapter !== 17) {
    note(`${blk.id}: no embedded WEB text for ${r.book} ${r.chapter}:${r.verse_from} — subset check skipped`);
    return;
  }
  const from = r.verse_from, to = r.verse_to ?? r.verse_from;
  const refWords = new Set();
  for (let v = from; v <= to; v++) (WEB_1SAM17[v] ? words(WEB_1SAM17[v]) : []).forEach((w) => refWords.add(w));
  const missing = [...new Set(words(blk.text).filter((w) => !refWords.has(w)))];
  if (missing.length) note(`${blk.id} (1 Samuel 17:${from}-${to}): words not found in the WEB verses — ${missing.join(", ")}`);
  else ok.push(`${blk.id}: all words resolve against WEB 1 Samuel 17:${from}-${to}`);
});

// --- summary ----------------------------------------------------------------
const story = book.beats.map((b) => {
  const w = (b.blocks || []).filter((x) => x.role === "prose").reduce((n, x) => n + countWords(x.text), 0);
  return `${b.id}: ${w}`;
});
const minutes = Math.round((storyProseWords / 150) * 10) / 10;

console.log("validate.mjs — content/david-and-goliath.json");
console.log("");
ok.forEach((m) => console.log("  ok   " + m));
console.log("");
console.log(`  info story prose words (beats, role=prose) = ${storyProseWords}`);
console.log(`  info per beat: ${story.join("  |  ")}`);
console.log(`  info reading time at 150 wpm = round(${storyProseWords} / 150, 1) = ${minutes} min`);
console.log(`  info budget.target_words = ${book.budget?.target_words}, lower floor = ${book.budget?.lower_floor_words}`);
const inBand = storyProseWords >= 980 && storyProseWords <= 1040;
console.log(`  info story prose within 980-1040 = ${inBand}`);
console.log("");
if (reports.length) {
  console.log("  NOTES (reported, not failures):");
  reports.forEach((m) => console.log("    ! " + m));
  console.log("");
}
if (failures.length) {
  console.log(`  ${failures.length} CHECK(S) FAILED:`);
  failures.forEach((m) => console.log("    X " + m));
  console.log("");
  console.log(`  RESULT: FAIL (${failures.length} failed, ${reports.length} noted)`);
  process.exit(1);
}
console.log(`  RESULT: PASS (${ok.length} checks passed, ${reports.length} noted)`);
