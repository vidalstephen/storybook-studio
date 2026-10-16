/**
 * studio-server — the Storybook Studio request surface.
 *
 *     npx tsx tools/studio-server.mts            # http://127.0.0.1:8787
 *     PORT=9000 npx tsx tools/studio-server.mts
 *
 * What this is: a small, dependency-free HTTP server over the **existing** pipeline. It adds no
 * page logic, no measurement and no prose: a request is a `Book` (content/<id>.json), and building
 * one is exactly the two commands the README documents —
 *
 *     tsx src/paginate.ts   <book>              > <composition>
 *     tsx src/render-html.ts --book <book> --composition <composition> --out <book.html>
 *
 * It never writes `build/book.html` or `build/composition.json`: the release pair belongs to the
 * release pipeline and to whatever is serving it. Everything the studio builds lands under
 * `build/studio/` and is served from `/books/<id>.html`.
 *
 * What this deliberately is not: the editor of `docs/06`, the review layers of `docs/02` W5, or a
 * print pass. Two states of a request are modelled — *suggested* and *built* — and every AI answer
 * is a proposal the operator accepts by hand (`docs/02` W2, D-11: no AI layer mutates state).
 *
 * The AI step is optional and configurable, and it is never faked. **The model comes from Hermes**:
 * the picker offers the models Hermes itself offers and defaults to the model Hermes is running, so
 * the studio cannot drift onto some other endpoint and quietly draft with the wrong model.
 *
 *     studio/model.json  the pick, so it survives a restart          (POST /api/model {provider, model})
 *     SB_LLM_BASE_URL / SB_LLM_MODEL / SB_LLM_API_KEY                an explicit endpoint still wins
 *
 * Keys are read from Hermes (`~/.hermes/.env`, its credential pool), used for one request, and never
 * returned in a response, logged or written to disk — `/api/state` reports `has_key`, never the key.
 * `tools/studio-models.mts` has the full account of what is reachable and what is not.
 *
 * With no model answering, `POST /api/suggest` still answers — with a *structure* derived from the
 * request and the passage index below, and it says so in `source`. A suggestion that could not be
 * sourced is reported as such rather than passed off as the model's.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readAccess, verifyPasscode, type Access } from "./studio-passwd.mjs";
import { catalogue, liveModels, readPick, resolve, writePick, type Pick } from "./studio-models.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const REPO = path.resolve(APP, "..");
const CONTENT = path.join(REPO, "content");
const BUILD = path.join(REPO, "build");
const STUDIO_OUT = path.join(BUILD, "studio");
const PORT = Number(process.env.PORT ?? 8787);

/* ------------------------------------------------------------------ the vocabulary of the build */

/**
 * The options the *build* actually offers, read out of the build's own modules so the studio can
 * never offer a value the pipeline does not know. Only the transition list is duplicated here as a
 * fallback — if `src/reader/design.ts` cannot be read, the studio says so instead of inventing one.
 */
async function vocabulary() {
  const src = readFileSync(path.join(APP, "src", "reader", "design.ts"), "utf8");
  const transitions = [...src.matchAll(/\{ id: "(curl|fold|slide|fade|instant)", label: "([^"]+)", note: "([^"]+)"/g)].map((m) => ({
    id: m[1],
    label: m[2],
    note: m[3],
  }));
  const themes = [...src.matchAll(/\{ id: "(light|sepia|dark)", label: "([^"]+)"/g)].map((m) => ({ id: m[1], label: m[2] }));
  const tokens = readFileSync(path.join(APP, "src", "tokens.ts"), "utf8");
  const design = /id:\s*"(dsg_[a-z0-9_]+)"/.exec(tokens)?.[1] ?? null;
  const target = /target_print_pages:\s*(\d+)/.exec(readFileSync(path.join(REPO, "content", "david-and-goliath.json"), "utf8"))?.[1];
  return { transitions, themes, design, reference_target: target ? Number(target) : 16 };
}

/** `Matter.slot` — the slots a `Book` may carry (`contracts.ts`, `04` §1.2). */
const FRONT_SLOTS = ["title", "copyright", "dedication", "contents"] as const;
const BACK_SLOTS = ["memory_verse", "discussion", "about"] as const;
const ROLES = ["prose", "heading", "scripture", "quote", "question", "note"] as const;

/**
 * Length presets. `docs/01` R-WIZ-004: a preset fixes a **governing page count** and a beat count;
 * it never fixes a word budget. The word budget is derived from the page target by the build
 * (R-WIZ-015) and is recorded on the request so the build can check it rather than trust it.
 *
 * `balanced_lines_per_page` and `words_per_line` are the measured figures the reference book ships
 * with (`build/composition.json`: 16 lines, 7.9 words/line). They are copied here as *suggested*
 * values for a request that has not been measured yet, and `derived_from` says exactly that.
 */
const PRESETS = [
  { id: "picture_16", short: "16 pages · ages 4–8", label: "16 pages · ages 4–8 · 7–9 beats · early", pages: 16, beats: 8, age_from: 4, age_to: 8, reading_pt: "early" },
  { id: "early_20", short: "20 pages · ages 6–10", label: "20 pages · ages 6–10 · 9–11 beats · early", pages: 20, beats: 9, age_from: 6, age_to: 10, reading_pt: "early" },
  { id: "middle_24", short: "24 pages · ages 8–12", label: "24 pages · ages 8–12 · 11–13 beats · confident", pages: 24, beats: 11, age_from: 8, age_to: 12, reading_pt: "confident" },
  { id: "older_32", short: "32 pages · ages 10–14", label: "32 pages · ages 10–14 · 13–16 beats · fluent", pages: 32, beats: 14, age_from: 10, age_to: 14, reading_pt: "fluent" },
];

/**
 * The passage index the *structure* suggestion is drawn from, when no model answers. Every entry is
 * a well-known narrative that carries a full arc on its own, with the WEB references the retelling
 * would lean on (`docs/04` §4.3: verifiable references only; WEB is public domain).
 */
const PASSAGES = [
  { key: "good_samaritan", title: "The Good Samaritan", subtitle: "Who Is My Neighbour?", ref: { book: "Luke", chapter: 10, verse_from: 25, verse_to: 37, translation: "WEB" },
    beats: ["A question on the road", "The road down to Jericho", "Robbed and left", "A priest passes by", "A Levite passes by", "A Samaritan stops", "Oil, wine and a donkey", "Two coins and a promise", "Which one was a neighbour?"] },
  { key: "lost_sheep", title: "The Lost Sheep", subtitle: "One Out of a Hundred", ref: { book: "Luke", chapter: 15, verse_from: 3, verse_to: 7, translation: "WEB" },
    beats: ["A hundred sheep", "One wanders off", "The shepherd counts", "Ninety-nine safe", "Searching in the dark", "The far-off cry", "Carried home on his shoulders", "The rejoicing", "There is joy in heaven"] },
  { key: "feeding_5000", title: "Five Loaves and Two Fish", subtitle: "A Boy's Lunch, Shared", ref: { book: "John", chapter: 6, verse_from: 1, verse_to: 14, translation: "WEB" },
    beats: ["A crowd on the hillside", "The day grows late", "Where shall we buy bread?", "A boy with a lunch", "Five loaves, two fish", "Sit down in the grass", "Broken and given", "Everyone ate", "Twelve baskets left over"] },
  { key: "storm_stilled", title: "Peace, Be Still", subtitle: "The Storm on the Lake", ref: { book: "Mark", chapter: 4, verse_from: 35, verse_to: 41, translation: "WEB" },
    beats: ["Evening on the lake", "A great windstorm", "Waves beating the boat", "The disciples wake him", "Do you not care?", "He rebukes the wind", "A great calm", "Why are you afraid?", "Who then is this?"] },
  { key: "zacchaeus", title: "Zacchaeus Climbs a Tree", subtitle: "The Man in the Sycamore", ref: { book: "Luke", chapter: 19, verse_from: 1, verse_to: 10, translation: "WEB" },
    beats: ["The chief tax collector", "Too short to see", "Up the sycamore", "He looked up", "Come down today", "Grumbling in the crowd", "Half to the poor", "Fourfold restored", "The Son of Man came to seek"] },
  { key: "prodigal", title: "The Son Who Came Home", subtitle: "The Father Who Ran", ref: { book: "Luke", chapter: 15, verse_from: 11, verse_to: 24, translation: "WEB" },
    beats: ["Two sons", "Give me my share", "The far country", "Famine and want", "Feeding the pigs", "I will arise and go", "While he was far off", "The father ran", "A robe, a ring, a feast"] },
  { key: "daniel_lions", title: "Daniel in the Den", subtitle: "Faithful in the Dark", ref: { book: "Daniel", chapter: 6, verse_from: 10, verse_to: 23, translation: "WEB" },
    beats: ["A new law", "Daniel prays as before", "The men accuse him", "The king's sorrow", "Cast into the den", "A stone on the mouth", "A night without sleep", "God sent his angel", "No hurt found"] },
  { key: "creation", title: "In the Beginning", subtitle: "The World God Made", ref: { book: "Genesis", chapter: 1, verse_from: 1, verse_to: 31, translation: "WEB" },
    beats: ["The earth without form", "Let there be light", "The firmament", "Dry land and green things", "Sun, moon and stars", "Fish and birds", "Living creatures and man", "Very good", "The seventh day"] },
];

/* ------------------------------------------------------------------------------------ the gate */

/**
 * The **request gate**. This is a shape and configuration check on a `Book` — the things that make
 * a request buildable at all. It is not an editorial review and it says so: prose quality, factual
 * fidelity and scripture accuracy are the layers of `docs/02` W4/W5, and they are not here.
 *
 * `R-WIZ-013`: a configuration whose age range, reading proficiency and length preset cannot all
 * hold together is rejected with an actionable message, rather than accepted and discovered later.
 */
function gate(book: any): { ok: boolean; failures: string[]; notes: string[] } {
  const failures: string[] = [];
  const notes: string[] = [];
  const bad = (m: string) => failures.push(m);

  if (!book || typeof book !== "object") return { ok: false, failures: ["the request is not an object"], notes };
  if (typeof book.id !== "string" || !/^[a-z0-9_]+$/.test(book.id)) bad("id must be a slug of [a-z0-9_] (it becomes the file name)");
  const meta = book.meta ?? {};
  for (const f of ["title", "author", "publication_type", "language", "copyright"]) {
    if (typeof meta[f] !== "string" || !meta[f].trim()) bad(`meta.${f} is required`);
  }
  const aud = meta.audience ?? {};
  if (typeof aud.age_from !== "number" || typeof aud.age_to !== "number") bad("meta.audience.age_from / age_to must be numbers");
  else {
    if (aud.age_to <= aud.age_from) bad("meta.audience.age_to must be greater than age_from");
    if (aud.age_to - aud.age_from > 8) bad(`an age band of ${aud.age_to - aud.age_from} years is wider than a single book can pitch (R-WIZ-013)`);
    if (typeof aud.reading_pt !== "string" || !aud.reading_pt.trim()) bad("meta.audience.reading_pt is required");
  }
  const pages = book.target_print_pages;
  if (typeof pages !== "number" || pages < 8) bad("target_print_pages must be a number >= 8");
  else if (pages % 4 !== 0) notes.push(`target_print_pages ${pages} is not a multiple of four; the print pass must pad it (docs/10 §9.4)`);

  const budget = book.budget ?? {};
  for (const f of ["target_words", "lower_floor_words", "reserve_words", "derived_from"]) {
    if (budget[f] === undefined) bad(`budget.${f} is required (docs/05 §1.6; R-WIZ-015)`);
  }

  const seen = new Set<string>();
  const checkMatter = (list: any[], allowed: readonly string[], label: string) => {
    if (!Array.isArray(list)) return bad(`${label} must be an array`);
    for (const m of list) {
      if (!allowed.includes(m?.slot)) bad(`${label} slot "${m?.slot}" is not one of ${allowed.join(", ")}`);
      if (typeof m?.id !== "string" || !m.id) bad(`${label} entry needs an id`);
      if (!Array.isArray(m?.blocks) || !m.blocks.length) bad(`${label} ${m?.slot} has no blocks`);
      if (m?.id) {
        if (seen.has(m.id)) bad(`duplicate matter id ${m.id}`);
        seen.add(m.id);
      }
    }
  };
  checkMatter(book.front_matter, FRONT_SLOTS, "front_matter");
  checkMatter(book.back_matter, BACK_SLOTS, "back_matter");

  const beats = book.beats;
  if (!Array.isArray(beats) || beats.length < 5) bad("a book needs at least five beats (docs/05 §1.2: >= 5 progression beats)");
  const blockIds = new Set<string>();
  (Array.isArray(beats) ? beats : []).forEach((b: any, i: number) => {
    if (typeof b?.id !== "string" || !b.id.startsWith("beat_")) bad(`beat ${i + 1}: id must be beat_*`);
    if (!["scene", "turn", "reflection", "lesson"].includes(b?.kind)) bad(`beat ${b?.id}: kind must be scene|turn|reflection|lesson`);
    if (typeof b?.summary !== "string" || !b.summary.trim()) bad(`beat ${b?.id}: summary is required (author-facing, never rendered)`);
    if (!Array.isArray(b?.blocks) || !b.blocks.length) return bad(`beat ${b?.id} has no blocks`);
    for (const bl of b.blocks) {
      if (typeof bl?.id !== "string" || !bl.id.startsWith("blk_")) bad(`beat ${b.id}: block id must be blk_*`);
      if (blockIds.has(bl?.id)) bad(`duplicate block id ${bl?.id}`);
      blockIds.add(bl?.id);
      if (!ROLES.includes(bl?.role)) bad(`${bl?.id}: role "${bl?.role}" is not one of ${ROLES.join(", ")}`);
      if (typeof bl?.text !== "string" || !bl.text.trim()) bad(`${bl?.id}: text is empty`);
      if (bl?.role === "scripture" && !bl?.scripture_ref) bad(`${bl?.id}: a scripture block must carry a scripture_ref (docs/04 §4.3)`);
      if (bl?.scripture_ref) {
        const r = bl.scripture_ref;
        if (!r.book || typeof r.chapter !== "number" || typeof r.verse_from !== "number" || !r.translation) {
          bad(`${bl?.id}: scripture_ref needs {book, chapter, verse_from, translation}`);
        }
      }
      for (const l of b.locks ?? []) {
        if (!l?.why || !l.why.trim()) bad(`beat ${b.id}: a lock with no reason is refused at creation (docs/07 §3)`);
      }
    }
  });

  const matterSlots = [...(book.front_matter ?? []), ...(book.back_matter ?? [])].map((m: any) => m?.slot);
  if (!matterSlots.includes("memory_verse")) notes.push("no memory_verse in the back matter: the reader will have no verse to memorise");
  if (!matterSlots.includes("discussion")) notes.push("no discussion slot: the reading guide will have no questions");
  if (!Array.isArray(book.scripture) || !book.scripture.length) bad("scripture[] must list the passages the retelling leans on (docs/04 §4.3)");
  return { ok: failures.length === 0, failures, notes };
}

/* ------------------------------------------------------------------------------- length derive */

/**
 * `R-WIZ-015` / `R-WIZ-017`: the request's own page target derives the budgets. The arithmetic is
 * the documents' formula with the reference book's *measured* figures — `words_per_line` is a
 * measurement, and this studio cannot take one without a browser, so it uses the figure the
 * measured composition ships with and records where it came from. The solver re-measures for real
 * when the book is built and says what it found.
 */
function deriveBudget(pages: number, beats: number, wordsPerLine = 7.9, linesPerPage = 16) {
  const frontPages = 4;
  const backPages = 3;
  const storyPages = Math.max(1, pages - frontPages - backPages);
  const linesAvailable = storyPages * linesPerPage;
  const reserveWords = 4 * wordsPerLine;
  const targetWords = Math.round(linesAvailable * wordsPerLine - reserveWords);
  const nonProse = 27; // 26 scripture + 1 heading on the reference book; scaled by beat count here
  const scaled = Math.round((nonProse / 9) * beats);
  const proseLines = Math.max(1, linesAvailable - scaled);
  return {
    target_words: targetWords,
    lower_floor_words: Math.round(targetWords * 0.85),
    reserve_words: +reserveWords.toFixed(1),
    effective_prose_budget_words: Math.round(proseLines * wordsPerLine),
    derived_from:
      `${storyPages} story pages x ${linesPerPage} balanced lines/page x ${wordsPerLine} words/line - ${reserveWords.toFixed(1)}-word reserve ` +
      `(4 lines x ${wordsPerLine}), the reference composition's measured words/line and the balanced ceiling of its density band. ` +
      `The effective PROSE budget is ${Math.round(proseLines * wordsPerLine)} = (${linesAvailable} - ${scaled} non-prose) x ${wordsPerLine}, ` +
      `because the beats' verse displays and headings occupy lines on the same pages (R-WIZ-017). ` +
      `words_per_line is a measurement, not an authored number: it is taken on the version-controlled probe in the shipped face.`,
  };
}

/* ------------------------------------------------------------------------------ the suggestion */

interface Suggestion {
  readonly source: "model" | "structure";
  readonly provenance: string;
  readonly concept: {
    readonly title: string;
    readonly subtitle: string;
    readonly premise: string;
    readonly passage: { book: string; chapter: number; verse_from: number; verse_to: number; translation: string } | null;
    readonly beats: readonly { readonly id: string; readonly kind: string; readonly summary: string }[];
    readonly memory_verse: string;
    readonly discussion: readonly string[];
  };
  readonly notes: readonly string[];
}

/** What the request already says, so the structure suggestion answers *this* request. */
function structureSuggestion(brief: any, notes: string[]): Suggestion {
  const wanted = String(brief?.passage ?? brief?.subject ?? "").toLowerCase();
  const hits = PASSAGES.map((p) => ({
    p,
    score: [p.key, p.title, p.subtitle, p.ref.book].reduce((a, s) => a + (wanted.includes(s.toLowerCase()) ? 2 : 0), 0) +
      p.beats.reduce((a, b) => a + (wanted.includes(b.toLowerCase().slice(0, 12)) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const pick = hits[0].score > 0 ? hits[0].p : PASSAGES[(String(brief?.title ?? "x").length + (brief?.pages ?? 16)) % PASSAGES.length];
  const want = Math.max(5, brief?.beats ?? 9);
  const beats: { id: string; kind: string; summary: string }[] = [];
  for (let i = 0; i < want; i++) {
    const title = pick.beats[Math.min(pick.beats.length - 1, Math.round((i * (pick.beats.length - 1)) / Math.max(1, want - 1)))];
    const kind = i === 0 ? "scene" : i === want - 1 ? "lesson" : i === Math.round(want / 2) ? "turn" : i >= want - 2 ? "reflection" : "scene";
    beats.push({ id: `beat_${i + 1}`, kind, summary: `${title} — ${kind === "turn" ? "the turn the book is built around" : kind}` });
  }
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
  notes.push("no model answered, so this is a structure drawn from the request and the passage index — not drafted prose. The premise and the beat titles are a plan to draft against; accept it, edit it, or point SB_LLM_BASE_URL at a model that can draft.");
  return {
    source: "structure",
    provenance: `the passage index in tools/studio-server.mts, matched on the request ("${wanted || "no passage named"}")`,
    concept: {
      title: pick.title,
      subtitle: pick.subtitle,
      premise: `${pick.title}: a retelling of ${pick.ref.book} ${pick.ref.chapter}:${pick.ref.verse_from}–${pick.ref.verse_to} (${pick.ref.translation}) for ages ${brief?.age_from ?? 4}–${brief?.age_to ?? 8}, in ${want} beats, at ${brief?.pages ?? 16} printed pages.`,
      passage: pick.ref,
      beats,
      memory_verse: `${pick.ref.book} ${pick.ref.chapter}:${pick.ref.verse_from} (${pick.ref.translation})`,
      discussion: ["What did the person in this story want at the start?", "What changed for them, and what changed it?", "What would you have done, in their place?"],
    },
    notes,
  };
}

/* ------------------------------------------------------------------------------ the model door */

/**
 * A resolved model call. `m` carries the key for exactly this request — it is never serialised into
 * a response, never logged and never written to disk. `studio-models.mts` says where it came from.
 */
type Resolved = Awaited<ReturnType<typeof resolve>>;

/**
 * The model state as the page may see it: **no key, ever**. `has_key` is a yes/no, and `key_source`
 * is the phrase for where it came from, because a page served on the public internet must not be a
 * way to read a Hermes credential back out of the machine.
 */
async function modelState(pick?: Partial<Pick>) {
  const m = await resolve(pick ?? null);
  const providers = await catalogue();
  const live = await liveModels(m.base_url, m.api_key);
  return {
    provider: m.provider,
    model: m.model,
    base_url: m.base_url,
    source: m.source,
    key_source: m.key_source,
    has_key: Boolean(m.api_key),
    ready: m.ready,
    note: m.note,
    reachable: live.ok,
    models: live.ok && live.models.length ? live.models : (providers.find((p) => p.id === m.provider)?.models ?? []),
    error: live.error ?? null,
    providers,
  };
}

async function llmChat(m: Resolved, system: string, user: string, model?: string): Promise<string> {
  const r = await fetch(`${m.base_url.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(m.api_key ? { Authorization: `Bearer ${m.api_key}` } : {}) },
    body: JSON.stringify({
      model: model || m.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(Number(process.env.SB_LLM_TIMEOUT_MS ?? 120000)),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  const j: any = JSON.parse(text);
  return j.choices?.[0]?.message?.content ?? "";
}

function jsonFrom(text: string): any {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("the model returned no JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

const SUGGEST_SYSTEM = `You plan children's picture books that are printed at a fixed page count.
Answer with one JSON object and nothing else:
{"title":string,"subtitle":string,"premise":string (<=60 words),"beats":[{"summary":string}],"memory_verse":string,"discussion":[string,string,string]}
Rules: exactly the requested number of beats, each summary one line; the beat list must carry a
complete arc (setup, rising, a turn, a resolution, a closing reflection); the premise must name the
passage it retells; no prose, no dialogue, no illustrations.`;

/* ------------------------------------------------------------------------------------ the jobs */

interface Job {
  id: string;
  book: string;
  state: "running" | "done" | "failed";
  log: string[];
  started: number;
  ended?: number;
  result?: { composition: string; html: string; pages?: number; disclosures?: number; exit: number };
  /** For a chained make: where each of the three operator actions got to. */
  steps?: { name: string; state: "waiting" | "running" | "done" | "failed"; detail?: string }[];
}
const jobs = new Map<string, Job>();

type Line = (l: string) => void;

/** Line-split a stream that arrives in arbitrary chunks. */
function lineSplitter(sink: Line): (chunk: Buffer) => void {
  let rest = "";
  return (chunk) => {
    rest += chunk.toString("utf8");
    const parts = rest.split("\n");
    rest = parts.pop() ?? "";
    for (const l of parts) if (l.trim()) sink(l);
  };
}

function run(cmd: string, args: string[], cwd: string, onOut: (chunk: Buffer) => void, onErr: Line): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
    p.stdout.on("data", onOut);
    p.stderr.on("data", lineSplitter(onErr));
    p.on("error", (e) => {
      onErr(`spawn failed: ${e.message}`);
      resolve(-1);
    });
    p.on("close", (code) => resolve(code ?? -1));
  });
}

function newJob(book: string): Job {
  const job: Job = { id: `${book}-${Date.now().toString(36)}`, book, state: "running", log: [], started: Date.now() };
  jobs.set(job.id, job);
  return job;
}

/**
 * Build one request. `tsx src/paginate.ts` writes the composition to **stdout** (pretty-printed
 * JSON) and its whole report to stderr; `tsx src/render-html.ts` writes the artifact and prints its
 * own report to stdout. So stdout is captured raw for the solver — a per-line join would lose the
 * newlines that make the JSON valid — and line-split into the log for the emitter.
 */
async function buildBook(job: Job) {
  const id = job.book;
  const say = (l: string) => {
    job.log.push(l);
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
  };
  const bookPath = path.join(CONTENT, `${id}.json`);
  const cmpPath = path.join(STUDIO_OUT, `${id}-composition.json`);
  const outPath = path.join(STUDIO_OUT, `${id}.html`);
  mkdirSync(STUDIO_OUT, { recursive: true });
  say(`book       ${path.relative(REPO, bookPath)}`);
  say(`solvers    tsx src/paginate.ts (measured in pinned Chromium), then tsx src/render-html.ts`);
  let stdout = "";
  const code1 = await run("npx", ["tsx", "src/paginate.ts", bookPath], APP, (c) => (stdout += c.toString("utf8")), say);
  if (code1 !== 0) {
    job.state = "failed";
    job.ended = Date.now();
    job.result = { composition: "", html: "", exit: code1 };
    say(`the solver exited ${code1} — no composition emitted, and nothing was written`);
    return job;
  }
  let composition: any;
  try {
    composition = JSON.parse(stdout);
  } catch (e) {
    job.state = "failed";
    job.ended = Date.now();
    job.result = { composition: "", html: "", exit: 0 };
    say(`the solver's stdout was not a composition (${(e as Error).message})`);
    return job;
  }
  writeFileSync(cmpPath, stdout.endsWith("\n") ? stdout : stdout + "\n", "utf8");
  say(`composition ${path.relative(REPO, cmpPath)}  ·  ${composition.pages.length} print pages, ${composition.counts.front_matter} front + ${composition.counts.story} story + ${composition.counts.back_matter} back + ${composition.counts.pad} pad`);
  const code2 = await run(
    "npx",
    ["tsx", "src/render-html.ts", "--book", bookPath, "--composition", cmpPath, "--out", outPath],
    APP,
    lineSplitter(say),
    say,
  );
  const disclosures = existsSync(outPath) ? (readFileSync(outPath, "utf8").match(/<li class="sb-sev-major">|<li class="sb-sev-critical">/g) ?? []).length : 0;
  job.state = code2 === 0 ? "done" : "failed";
  job.ended = Date.now();
  job.result = { composition: path.relative(REPO, cmpPath), html: path.relative(REPO, outPath), pages: composition.pages.length, disclosures, exit: code2 };
  say(`book       ${path.relative(REPO, outPath)}  ·  ${disclosures === 0 ? "no major or critical disclosure" : `${disclosures} major/critical disclosure(s)`}`);
  return job;
}

/* ------------------------------------------------------------------------------------- the books */

function projects() {
  if (!existsSync(CONTENT)) return [];
  return readdirSync(CONTENT)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      const id = f.replace(/\.json$/, "");
      let book: any = null;
      try {
        book = JSON.parse(readFileSync(path.join(CONTENT, f), "utf8"));
      } catch {
        return { id, broken: true };
      }
      const g = gate(book);
      const studioHtml = path.join(STUDIO_OUT, `${id}.html`);
      return {
        id,
        title: book.meta?.title ?? id,
        subtitle: book.meta?.subtitle ?? "",
        pages: book.target_print_pages,
        audience: book.meta?.audience,
        publication_type: book.meta?.publication_type,
        beats: Array.isArray(book.beats) ? book.beats.length : 0,
        blocks: (book.beats ?? []).reduce((a: number, b: any) => a + (b.blocks?.length ?? 0), 0) + (book.front_matter ?? []).reduce((a: number, m: any) => a + (m.blocks?.length ?? 0), 0) + (book.back_matter ?? []).reduce((a: number, m: any) => a + (m.blocks?.length ?? 0), 0),
        gate: g,
        built: existsSync(studioHtml) ? `/books/${id}.html` : null,
        built_at: existsSync(studioHtml) ? statSyncSafe(studioHtml) : null,
        release: existsSync(path.join(BUILD, "book.html")) && id === "david-and-goliath" ? "../build/book.html" : null,
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function statSyncSafe(p: string): string | null {
  try {
    return new Date(statSync(p).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------ the server */

function send(res: ServerResponse, code: number, body: string, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}
function sendJson(res: ServerResponse, code: number, v: unknown) {
  send(res, code, JSON.stringify(v, null, 1));
}
async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw };
  }
}

/* ------------------------------------------------------------------------------------ the door */

const ACCESS_FILE = path.join(APP, "studio", "access.json");

/**
 * The credential, re-read whenever the file changes (by mtime) so a rotation takes effect on the
 * next request — no restart, and no window in which the old passcode still works after the write.
 */
let accessCache: { mtime: number; access: Access | null } | null = null;
function access(): Access | null {
  let mtime = 0;
  try {
    mtime = statSync(ACCESS_FILE).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (!accessCache || accessCache.mtime !== mtime) accessCache = { mtime, access: readAccess() };
  return accessCache.access;
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * A page on the public internet gets guessed at. Failures are counted **per client**, and a request
 * that carries the right passcode is never throttled — the count only ever gates failures.
 *
 * The client is the one Cloudflare names, NOT `req.socket.remoteAddress`: the request arrives from
 * the tunnel connector on loopback, so every visitor looks like `127.0.0.1` and one attacker (or one
 * person mistyping) would lock out everybody for the window.
 */
const failures = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 10;
const client = (req: IncomingMessage): string => {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const xff = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return xff || req.socket.remoteAddress || "?";
};
function throttle(who: string): boolean {
  const now = Date.now();
  if (failures.size > 512) for (const [k, v] of failures) if (!v.some((t) => now - t < WINDOW_MS)) failures.delete(k);
  const hits = (failures.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(who, hits);
  return hits.length >= MAX_FAILURES;
}
const noteFailure = (who: string) => failures.set(who, [...(failures.get(who) ?? []), Date.now()]);
const isLoopback = (req: IncomingMessage) => {
  const a = req.socket.remoteAddress ?? "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
};

/**
 * Two ways in, and no third:
 *
 *   * `Authorization: Basic <user:passcode>` — what a person types into the browser's dialog. The
 *     passcode is verified against the scrypt hash in `studio/access.json`, in constant time.
 *   * `X-Studio-Token: <token>` — the random token in the same file, mode 600, for automation on
 *     this machine (the studio's own MCP server, a script, a test). No plaintext passcode is ever
 *     written into a config for a machine to use.
 *
 * With **no** credential file the server binds loopback only (see the listen call) and lets loopback
 * through, so local work is unaffected and nothing off this machine can reach it.
 */
function authorised(req: IncomingMessage): { ok: boolean; who: string } {
  const a = access();
  if (!a) return { ok: isLoopback(req), who: isLoopback(req) ? "loopback (no credential set)" : "" };
  const token = req.headers["x-studio-token"];
  if (typeof token === "string" && a.token && same(token, a.token)) return { ok: true, who: `${a.user} (local token)` };
  const m = /^Basic\s+(.+)$/i.exec(String(req.headers.authorization ?? ""));
  if (m) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const i = decoded.indexOf(":");
    const user = i < 0 ? decoded : decoded.slice(0, i);
    const pass = i < 0 ? "" : decoded.slice(i + 1);
    if (user === a.user && verifyPasscode(pass, a)) return { ok: true, who: `${a.user} (passcode)` };
  }
  return { ok: false, who: "" };
}

function unauthorised(res: ServerResponse, throttled: boolean) {
  res.writeHead(throttled ? 429 : 401, {
    "WWW-Authenticate": 'Basic realm="Storybook Studio", charset="UTF-8"',
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...(throttled ? { "Retry-After": "300" } : {}),
  });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>Storybook Studio</title>` +
      `<p style="font:16px/1.5 system-ui;margin:4rem auto;max-width:32rem">` +
      (throttled
        ? `Too many failed attempts from this address. Try again in a few minutes.`
        : `This is a private storybook studio. It asks for the passcode, and it is not the one you sent.`) +
      `</p>`,
  );
}

/**
 * A request with the first preset's defaults filled in. The page always sends every field, but an API
 * or MCP caller may send only what it cares about — and a missing `reading_pt` reaches the model as an
 * absent field, which the gate then refuses as `meta.audience.reading_pt is required`. Filling the
 * defaults here keeps "just tell it what the book is about" true for callers too.
 */
function withDefaults(config: any): Record<string, any> {
  const p = PRESETS[0];
  const base = {
    pages: p.pages,
    beats: p.beats,
    age_from: p.age_from,
    age_to: p.age_to,
    reading_pt: p.reading_pt,
    language: "en",
    publication_type: "biblical",
  };
  const given = Object.fromEntries(
    Object.entries(config ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  return { ...base, ...given };
}

/**
 * The chained path — one button, the three operator actions in order.
 *
 * It is not a shortcut around the discipline: it **is** the three actions, called one after another
 * over the studio's own API, each still gated — a concept is proposed, a manuscript is drafted, the
 * gate decides whether it is written, and only a request that passes is built. What it removes is the
 * ceremony of pressing three buttons in the right order, which is what "make this simpler" asked for.
 * What it keeps is that the gate decides: a failure stops the chain with the gate's own words, never
 * with a plausible-looking book.
 */
async function makeBook(
  job: Job,
  o: { brief: any; config: any; provider?: string; model?: string; front?: string[]; back?: string[] },
) {
  const say = (l: string) => {
    job.log.push(l);
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
  };
  const steps: NonNullable<Job["steps"]> = [
    { name: "propose a concept", state: "waiting" },
    { name: "draft the manuscript", state: "waiting" },
    { name: "build the book", state: "waiting" },
  ];
  job.steps = steps;
  const set = (i: number, state: "running" | "done" | "failed", detail?: string) => {
    steps[i].state = state;
    if (detail) steps[i].detail = detail;
  };
  /** The chain calls the studio's own routes: the same actions, with the same gates. */
  const call = async (route: string, body: any) => {
    const token = access()?.token ?? "";
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Studio-Token": token } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    const text = await r.text();
    try {
      return { status: r.status, json: JSON.parse(text) };
    } catch {
      return { status: r.status, json: { error: text.slice(0, 300) } };
    }
  };

  set(0, "running");
  say("1/3  a concept — a proposal to draft against, not a manuscript");
  const s = await call("/api/suggest", { brief: o.brief, config: o.config, provider: o.provider, model: o.model });
  const concept = s.json?.concept;
  if (!concept) {
    set(0, "failed", s.json?.error ?? "nothing came back");
    job.state = "failed";
    job.ended = Date.now();
    say("no concept came back — nothing was written");
    return job;
  }
  set(0, "done", s.json.source === "model" ? s.json.provenance : "no model answered, so this is a structure");
  say(`     ${concept.title}${concept.subtitle ? ` — ${concept.subtitle}` : ""} · ${concept.beats?.length ?? 0} beats`);

  set(1, "running");
  say("2/3  the manuscript, and the gate decides whether it is written");
  const d = await call("/api/draft", {
    config: o.config,
    concept,
    front: o.front,
    back: o.back,
    write: true,
    provider: o.provider,
    model: o.model,
  });
  if (!d.json?.gate?.ok) {
    const why = (d.json?.gate?.failures ?? [d.json?.error ?? "the gate refused"]).slice(0, 3);
    set(1, "failed", why[0]);
    job.state = "failed";
    job.ended = Date.now();
    why.forEach((f: string) => say(`     ${f}`));
    say("the gate refused, so nothing was written and nothing was built");
    return job;
  }
  const written = String(d.json.written ?? "");
  // `written` is already relative to the repo root (the draft reports it that way), so it is shown as
  // it is: running path.relative over it again resolves it against this process's cwd and invents a
  // path that does not exist.
  set(1, "done", `gate passed · ${written || "not written"}`);
  if (!written) {
    set(2, "failed", "there is no request file to build");
    job.state = "failed";
    job.ended = Date.now();
    return job;
  }

  set(2, "running");
  say("3/3  the solver measures it in pinned Chromium, then the emitter writes one file");
  job.book = path.basename(written, ".json");
  await buildBook(job);
  // The solver composes what the request supports, which is not always the page count that was asked
  // for — say both numbers rather than letting "16 pages" be assumed from the preset.
  const asked = Number(o.config?.pages ?? 0);
  const composed = job.result?.pages;
  set(
    2,
    job.state === "failed" ? "failed" : "done",
    composed
      ? `${composed} pages${asked && asked !== composed ? ` (asked for ${asked})` : ""} · ${job.result?.disclosures ?? 0} major disclosures`
      : undefined,
  );
  job.ended = job.ended ?? Date.now();
  return job;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const p = url.pathname;
  const ip = client(req);
  try {
    // The door, before any route: the studio can write files and run builds, so nothing is served
    // unauthenticated except on a machine that has no credential and is therefore loopback-only.
    const who = authorised(req);
    if (!who.ok) {
      const throttled = throttle(ip);
      if (!throttled) noteFailure(ip);
      console.log(`  401 ${ip} ${req.method} ${p}${throttled ? " (throttled)" : ""}`);
      return unauthorised(res, throttled);
    }
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      return send(res, 200, readFileSync(path.join(APP, "studio", "index.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && p.startsWith("/books/")) {
      const f = path.join(STUDIO_OUT, path.basename(p));
      if (!existsSync(f)) return send(res, 404, "no such book", "text/plain");
      return send(res, 200, readFileSync(f, "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && p === "/api/state") {
      const v = await vocabulary();
      const llm = await modelState();
      return sendJson(res, 200, {
        repo: REPO,
        design: v.design,
        transitions: v.transitions,
        themes: v.themes,
        front_slots: FRONT_SLOTS,
        back_slots: BACK_SLOTS,
        roles: ROLES,
        presets: PRESETS,
        passages: PASSAGES.map((x) => ({ key: x.key, title: x.title, ref: x.ref })),
        target_words_per_line: 7.9,
        llm,
        books: projects(),
      });
    }
    /**
     * Choose the model. The pick is stored (`studio/model.json`) and everything downstream uses it —
     * the page, the MCP tools, a build — because a model chosen in the page that only applied to the
     * page would be a lie the moment a draft was asked for some other way.
     *
     * A provider the studio cannot call is refused here, with the reason, rather than accepted and
     * then failed at the first draft: "Hermes only" has to mean something at the moment of choosing.
     */
    if (req.method === "POST" && p === "/api/model") {
      const body = await readBody(req);
      const providers = await catalogue();
      const provider = String(body.provider ?? "");
      const model = String(body.model ?? "");
      const known = providers.find((x) => x.id === provider);
      if (!provider || !model) return sendJson(res, 400, { error: "provider and model are both required" });
      if (!known) return sendJson(res, 404, { error: `unknown provider ${provider}`, providers: providers.map((x) => x.id) });
      if (!known.ready) {
        return sendJson(res, 409, {
          error: `${provider} is not callable from the studio: ${known.note}`,
          hint: "Hermes can still draft with it — ask Hermes, or run `hermes proxy start` and point SB_LLM_BASE_URL at the proxy.",
        });
      }
      if (known.models.length && !known.models.includes(model)) {
        return sendJson(res, 409, { error: `${model} is not one of the ${known.models.length} models ${provider} offers`, models: known.models });
      }
      writePick({ provider, model });
      return sendJson(res, 200, { picked: readPick(), llm: await modelState() });
    }
    if (req.method === "POST" && p === "/api/suggest") {
      const body = await readBody(req);
      const notes: string[] = [];
      const brief = body.brief ?? {};
      const cfg = withDefaults(body.config);
      /**
       * The model is resolved per request and may be overridden by the caller (`provider`, `model`)
       * or by the pick stored in `studio/model.json`. The default is the model **Hermes itself is
       * running** — the studio has no opinion of its own about models.
       */
      const m = await resolve({ provider: body.provider, model: body.model });
      const model = m.model;
      if (m.ready && model) {
        try {
          const user =
            `Passage to retell: ${brief.passage || "choose one that suits the configuration"}\n` +
            `Publication type: ${cfg.publication_type ?? "biblical"}\nAudience: ages ${cfg.age_from ?? 4}-${cfg.age_to ?? 8}, reading proficiency ${cfg.reading_pt ?? "early"}\n` +
            `Printed pages: ${cfg.pages ?? 16} (front matter ${4}, back matter ${3}, so ${Math.max(1, (cfg.pages ?? 16) - 7)} story pages)\n` +
            `Number of beats: ${cfg.beats ?? 8}\nLanguage: ${cfg.language ?? "en"}\n` +
            (brief.note ? `The operator adds: ${brief.note}\n` : "");
          const text = await llmChat(m, SUGGEST_SYSTEM, user, model);
          const raw = jsonFrom(text);
          const beats = (raw.beats ?? []).map((b: any, i: number) => ({
            id: `beat_${i + 1}`,
            kind: i === 0 ? "scene" : i === (raw.beats ?? []).length - 1 ? "lesson" : i === Math.round((raw.beats ?? []).length / 2) ? "turn" : i >= (raw.beats ?? []).length - 2 ? "reflection" : "scene",
            summary: String(b?.summary ?? b ?? "").slice(0, 200),
          }));
          if (beats.length < 5) throw new Error(`the model returned ${beats.length} beat(s); five is the gate`);
          notes.push(`drafted by ${model} at ${m.base_url} (${m.source}). Nothing has been written: accepting this suggestion is a separate action (D-11).`);
          return sendJson(res, 200, {
            source: "model",
            provenance: `${model} via ${m.base_url}`,
            concept: {
              title: String(raw.title ?? "").slice(0, 80),
              subtitle: String(raw.subtitle ?? "").slice(0, 80),
              premise: String(raw.premise ?? "").slice(0, 400),
              passage: null,
              beats,
              memory_verse: String(raw.memory_verse ?? ""),
              discussion: (raw.discussion ?? []).map((d: any) => String(d).slice(0, 200)).slice(0, 5),
            },
            notes,
          });
        } catch (e) {
          notes.push(`the model (${model} at ${m.base_url}) did not answer with a usable proposal: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        notes.push(`no model the studio can call for ${m.provider}: ${m.note ?? "no endpoint or credential it can read"} — a structure is offered instead`);
      }
      return sendJson(res, 200, structureSuggestion({ ...brief, ...cfg }, notes));
    }
    /**
     * Draft (or import) the manuscript, gate it, and — only if the operator asked — write it.
     *
     *     { config, concept, manuscript? }   manuscript: a Book pasted by the operator (R-WIZ-007
     *                                        import mode) — no model involved at all
     *
     * With no `manuscript`, the model is asked for the whole `Book` (docs/02 W4) and its answer is
     * gated. One repair round is allowed, with the gate's own failures quoted back. The model is
     * never trusted to have obeyed the contract, and nothing is written unless the gate passes.
     */
    if (req.method === "POST" && p === "/api/draft") {
      const body = await readBody(req);
      const notes: string[] = [];
      let book: any = body.manuscript ?? null;
      if (book) notes.push("imported: the manuscript came from the operator, not from a model (R-WIZ-007).");
      if (!book) {
        const m = await resolve({ provider: body.provider, model: body.model });
        const model = m.model;
        if (!m.ready || !model) {
          return sendJson(res, 503, {
            gate: { ok: false, failures: [`no model the studio can call for ${m.provider}: ${m.note ?? "no endpoint or credential it can read"}`], notes },
            written: null,
            hint: "POST { manuscript } to import a manuscript instead — the build does not need a model, only the drafting step does.",
          });
        }
        const cfg = withDefaults(body.config);
        const concept = body.concept ?? {};
        const pages = cfg.pages ?? 16;
        const budget = deriveBudget(pages, (concept.beats ?? []).length || cfg.beats || 8);
        const shape = `{"id":"<slug>","meta":{"title","subtitle","author","audience":{"age_from","age_to","reading_pt"},"publication_type","language","copyright"},"target_print_pages":${pages},"budget":${JSON.stringify(budget)},"front_matter":[{"id":"matter_<slug>_title","slot":"title","blocks":[{"id":"blk_<slug>_title","role":"heading","text":...}]}],"beats":[{"id":"beat_<slug>_1","kind":"scene|turn|reflection|lesson","summary":...,"blocks":[{"id":"blk_<slug>_...","role":"prose|heading|scripture|question|note","text":...,"scripture_ref":{"book","chapter","verse_from","verse_to","translation"}}],"locks":[{"kind":"keep_together","target":"beat_<slug>_1","priority":1000,"why":...}]}],"back_matter":[...],"scripture":[{"book","chapter","verse_from","verse_to","translation"}]}`;
        const user =
          `Write the manuscript for this book as one JSON object, nothing else.\n\n` +
          `Configuration: ages ${cfg.age_from}-${cfg.age_to}, reading proficiency ${cfg.reading_pt}, ${pages} printed pages, language ${cfg.language ?? "en"}, publication type ${cfg.publication_type ?? "biblical"}.\n` +
          `Matter the request asks for — front, in this order: ${(body.front ?? ["title", "copyright", "dedication", "contents"]).join(", ")}. Back: ${(body.back ?? ["memory_verse", "discussion", "about"]).join(", ")}. Every one of those slots must appear in the manuscript, with the ids the shape below gives.\n` +
          `Concept: ${JSON.stringify(concept).slice(0, 2000)}\n` +
          `Budget: ${budget.effective_prose_budget_words} words of prose across the beats; ${budget.target_words} words is the whole-story ceiling. Stay under it — the page target governs and the solver will not expand a page to fit prose.\n\n` +
          `Shape (follow it exactly, fill every field, use the requested ids):\n${shape}\n\n` +
          `Rules: 5-14 beats; every beat 2-5 blocks; ids unique; a "scripture" block quotes the cited verse verbatim and carries scripture_ref; front_matter is title, copyright, dedication and contents; back_matter is memory_verse, discussion (3 questions) and about; scripture[] lists every reference used; every lock carries a why. Use keep_together sparingly and only for a group that genuinely fits one page — a lock the solver cannot honour ships as a disclosed broken promise, so do not lock a scene that is simply long.`;
        const DRAFT_SYSTEM = `You are drafting a children's picture-book manuscript as strict JSON for a typesetting pipeline.
The text is what a child reads aloud. Short sentences. Concrete nouns. No illustrations, no stage directions, no headers.
Answer with the JSON object only.`;
        let text = await llmChat(m, DRAFT_SYSTEM, user, model);
        let g = { ok: false, failures: [] as string[], notes: [] as string[] };
        for (let round = 0; round < 2; round++) {
          try {
            book = jsonFrom(text);
          } catch (e) {
            g = { ok: false, failures: [`the model returned no parseable JSON object: ${e instanceof Error ? e.message : String(e)}`], notes: [] };
            book = null;
          }
          if (book) {
            book.id = String(book.id ?? cfg.id ?? "book").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
            g = gate(book);
          }
          if (g.ok) break;
          if (round === 0) {
            notes.push(`first draft did not pass the gate: ${g.failures.slice(0, 6).join("; ")} — asked ${model} once more, quoting its own failures back.`);
            const repair = await llmChat(
              m,
              DRAFT_SYSTEM,
              `${user}\n\nYour previous answer was rejected by the gate. The failures were:\n- ${g.failures.join("\n- ")}\n\nAnswer again with the complete corrected JSON object, nothing else.`,
              model,
            );
            text = repair;
          }
        }
        if (!g.ok) {
          return sendJson(res, 422, { gate: g, written: null, source: model, note: "the draft was not written: the gate must pass first" });
        }
        notes.push(`drafted by ${model} at ${m.base_url} (${m.source}); gate passed on the ${g.failures.length === 0 ? "first" : "repaired"} draft.`);
      }
      const g = gate(book);
      if (!g.ok) return sendJson(res, 422, { gate: g, written: null });
      // The request key is the *file* stem under content/ — `david-and-goliath.json` for a book whose
      // own `id` is `book_dg`. It is taken from the operator, then the book's title, then its id;
      // the Book's own `id` stays the slug the contract asks for, and the two are not conflated.
      const slugify = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      const key = slugify(body.key || book.meta?.title || book.id) || slugify(book.id) || "book";
      const file = path.join(CONTENT, `${key}.json`);
      if (existsSync(file) && !body.overwrite) {
        return sendJson(res, 409, { gate: g, written: null, key, conflict: `content/${key}.json already exists — POST overwrite:true to replace it` });
      }
      if (body.write) writeFileSync(file, JSON.stringify(book, null, 2) + "\n", "utf8");
      return sendJson(res, 200, { gate: g, notes, key, written: body.write ? path.relative(REPO, file) : null, book: body.write ? undefined : book });
    }
    /**
     * One button: propose, draft, gate, build. Returns a job id at once (a cold build is a minute or
     * two) and reports the three steps as they happen, so the page can show where it is.
     *
     *     { brief: {passage, note}, config: {...}, provider?, model?, front?, back? }
     */
    if (req.method === "POST" && p === "/api/make") {
      const body = await readBody(req);
      const brief = body.brief ?? {};
      const config = withDefaults(body.config);
      if (!brief.passage && !brief.note) {
        return sendJson(res, 400, { error: "say what the book is about — a passage, or a note in your own words" });
      }
      const job = newJob("make");
      void makeBook(job, {
        brief,
        config,
        provider: body.provider,
        model: body.model,
        front: body.front,
        back: body.back,
      }).catch((e) => {
        job.state = "failed";
        job.ended = Date.now();
        job.log.push(`unhandled: ${e instanceof Error ? e.message : String(e)}`);
      });
      return sendJson(res, 202, { job: job.id, state: job.state, steps: job.steps });
    }
    if (req.method === "POST" && p === "/api/build") {
      const body = await readBody(req);
      // the request key is the *file* stem under content/ (david-and-goliath.json); the Book's own
      // `id` is its own slug. Both are checked, and neither is guessed from the other.
      const id = String(body.id ?? "");
      const file = path.join(CONTENT, `${id}.json`);
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(id) || !existsSync(file)) return sendJson(res, 404, { error: `no content/${id}.json` });
      const g = gate(JSON.parse(readFileSync(file, "utf8")));
      if (!g.ok && !body.force) return sendJson(res, 422, { error: "the request does not pass the gate", gate: g });
      // Returns at once with a job id: the solver measures in pinned Chromium and takes a minute or
      // two, and a request that hangs for two minutes is a request nobody can watch.
      const job = newJob(id);
      void buildBook(job).catch((e) => {
        job.state = "failed";
        job.log.push(`unhandled: ${e instanceof Error ? e.message : String(e)}`);
      });
      return sendJson(res, 202, { job: job.id, state: job.state });
    }
    if (req.method === "GET" && p.startsWith("/api/job/")) {
      const job = jobs.get(p.slice("/api/job/".length));
      if (!job) return sendJson(res, 404, { error: "no such job" });
      // `book` is the request key the artifact belongs to — a client needs it to link to the built
      // book at /books/<key>.html, and for a chained make it is only known once the draft is written.
      return sendJson(res, 200, { id: job.id, book: job.book, state: job.state, log: job.log.slice(-200), result: job.result ?? null, steps: job.steps ?? null });
    }
    return sendJson(res, 404, { error: `no route ${p}` });
  } catch (e) {
    return sendJson(res, 500, { error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
});

/**
 * The bind address follows the credential: with one set the studio can be put behind a public
 * hostname (it enforces auth on every request), and with none it is reachable only from this
 * machine. `STUDIO_HOST` overrides, and the log always says which it chose.
 */
const HAS_CREDENTIAL = access() !== null;
const HOST = process.env.STUDIO_HOST ?? (HAS_CREDENTIAL ? "0.0.0.0" : "127.0.0.1");

server.listen(PORT, HOST, async () => {
  console.log(`Storybook Studio · request studio — http://127.0.0.1:${PORT}`);
  console.log(`  repo      ${REPO}`);
  console.log(`  books     content/*.json  ->  build/studio/<id>.html  (the release build/book.html is never touched)`);
  console.log(
    HAS_CREDENTIAL
      ? `  access    basic auth as "${access()!.user}" + a local token (studio/access.json, mode 600) — every route, including /books/*`
      : `  access    NO CREDENTIAL SET — bound to ${HOST} only, so it is not reachable off this machine. set one with:\n            npx tsx tools/studio-passwd.mts --user studio`,
  );
  console.log(`  listening ${HOST}:${PORT}${HOST === "0.0.0.0" ? " (all interfaces: tailnet + the tunnel)" : ""}`);
  const m = await resolve(readPick());
  console.log(`  model     ${m.model || "(none)"} on ${m.provider} — ${m.source}`);
  console.log(`            ${m.base_url}${m.api_key ? `  key: ${m.key_source}` : "  (no credential the studio can read)"}`);
  if (!readPick()) console.log(`            following Hermes; pick another in the page or POST /api/model {provider, model}`);
});
