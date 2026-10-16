/**
 * Independent scripture verification.
 *
 * `content/validate.mjs` checks the manuscript's scripture blocks against a WEB text it
 * carries inline. That is circular: it proves the manuscript matches the validator, not that
 * either matches the World English Bible. This fetches the verses from an outside source and
 * compares — the only way to test the claim "quoted verbatim from WEB".
 *
 *   node tools/verify-scripture.mjs [content/<book>.json]
 *
 * The book comes from the argument, or from the reference book in this repo — never from a path
 * belonging to whoever first wrote the file.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bookPath = resolve(REPO, process.argv[2] ?? "content/david-and-goliath.json");
const BOOK = JSON.parse(readFileSync(bookPath, "utf8"));
console.log(`  book             ${bookPath.slice(REPO.length + 1)}`);

const norm = (s) =>
  s.replace(/[\u2018\u2019']/g, "'")
   .replace(/[\u201c\u201d"]/g, '"')
   .replace(/\s+/g, " ")
   .trim()
   .toLowerCase();

const words = (s) => norm(s).replace(/[^a-z0-9' ]/g, " ").split(" ").filter(Boolean);

async function fetchRef(from, to) {
  const url = `https://bible-api.com/1%20Samuel%2017:${from}-${to}?translation=web`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

const refs = [
  { from: 45, to: 47 },
  { from: 48, to: 50 },
];

const fetched = {};
for (const { from, to } of refs) {
  const j = await fetchRef(from, to);
  fetched[`${from}-${to}`] = j;
  console.log(`\n  fetched ${j.reference}  [${j.translation_name}]`);
  for (const v of j.verses) console.log(`    v${v.verse}: ${v.text.trim().slice(0, 118)}`);
}

// Every word the manuscript prints as scripture must occur in the corresponding fetched verses,
// and every word of the fetched verses must occur in the manuscript — i.e. a real match, not a subset.
const blocks = BOOK.beats.flatMap((b) => b.blocks).filter((k) => k.role === "scripture" && k.scripture_ref.chapter === 17);
let verdict = "PASS";

for (const blk of blocks) {
  const key = `${blk.scripture_ref.verse_from}-${blk.scripture_ref.verse_to}`;
  const j = fetched[key];
  if (!j) { console.log(`\n  ${blk.id}: no fetched text for ${key} — skipped`); verdict = "INCOMPLETE"; continue; }
  const set = new Set(words(j.verses.map((v) => v.text).join(" ")));
  const mine = words(blk.text);
  const missing = mine.filter((w) => !set.has(w));
  const setWords = words(j.verses.map((v) => v.text).join(" "));
  const mineSet = new Set(mine);
  const extra = [...new Set(setWords.filter((w) => !mineSet.has(w)))];
  const coverage = ((mine.length - missing.length) / mine.length * 100).toFixed(1);
  console.log(`\n  ${blk.id}  (1 Samuel 17:${key})`);
  console.log(`    manuscript words : ${mine.length}`);
  console.log(`    verse words      : ${setWords.length}`);
  console.log(`    coverage         : ${coverage}% of the manuscript's words appear in WEB`);
  console.log(`    NOT in WEB       : ${missing.length ? missing.join(" ") : "(none)"}`);
  console.log(`    WEB words absent : ${extra.length ? extra.slice(0, 30).join(" ") : "(none)"}`);
  if (missing.length) verdict = "FAIL";
}

console.log(`\n  VERDICT: ${verdict}`);
console.log("  (coverage near 100% with no manuscript word missing means the quotation is genuine WEB;");
console.log("   a long 'WEB words absent' list is expected where the block is a selected passage, not a full run.)");
process.exit(verdict === "FAIL" ? 1 : 0);
