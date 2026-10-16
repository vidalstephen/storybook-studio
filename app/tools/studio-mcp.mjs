#!/usr/bin/env node
/**
 * studio-mcp — the Storybook Studio request suite as tools Hermes Agent can call.
 *
 *     node app/tools/studio-mcp.mjs            # an MCP server on stdio, not a program you run by hand
 *
 * Hermes registers the tools below as `mcp_studio_*` once this file is configured under
 * `mcp_servers` (see `hermes mcp add studio --command node --args <this file>`), which is what makes
 * "start a book request" something the agent can do in a conversation rather than something a
 * person does in a browser.
 *
 * It is a **thin client of the studio server**, which owns the pipeline:
 *
 *     this  →  HTTP  →  tools/studio-server.mts  →  tsx src/paginate.ts   (the solver)
 *                                               →  tsx src/render-html.ts (one self-contained book)
 *
 * Nothing about page composition lives here, and no step is faked:
 *
 *   * a **suggestion** is a proposal and is never applied (docs/02 W2, D-11);
 *   * a **draft** is gated against the `Book` contract before it can be written;
 *   * a **build** is the real solver in pinned Chromium, and its report is returned as it printed;
 *   * if no AI model answers, the suggestion says so and falls back to a structure — the build
 *     itself never needs a model.
 *
 * If the studio server is not up, this starts it (detached) and waits for it, so a cold machine can
 * still take a request. If even that fails, the error names the exact command to run.
 *
 * Zero dependencies, plain Node: it must start in milliseconds, because the MCP client dials it at
 * agent startup.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(APP, "..");
const PORT = Number(process.env.STUDIO_PORT ?? 8787);
const BASE = (process.env.STUDIO_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const LAUNCH = `cd ${APP} && PORT=${PORT} npx tsx tools/studio-server.mts`;

const log = (...a) => console.error("[studio-mcp]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The passcode on the door is hashed and this process cannot derive it — which is the point. The
 * `token` beside it is for exactly this: automation on the machine that holds the file, sent as
 * `X-Studio-Token`. Read per call so a `--rotate-token` takes effect without restarting Hermes.
 */
function token() {
  try {
    return JSON.parse(readFileSync(join(APP, "studio", "access.json"), "utf8")).token ?? "";
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------------------ talking to it */

async function api(path, body, timeoutMs = 30000) {
  const t = token();
  const r = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(t ? { "X-Studio-Token": t } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned ${r.status} and not JSON: ${text.slice(0, 200)}`);
  }
  return json;
}

/** The studio server, started here if nothing is listening. */
async function studio() {
  try {
    return await api("/api/state", undefined, 4000);
  } catch (first) {
    const tsx = join(APP, "node_modules", "tsx", "dist", "cli.mjs");
    if (!existsSync(tsx)) {
      throw new Error(`the studio server is not answering at ${BASE} (${first.message}) and ${tsx} is missing; run: ${LAUNCH}`);
    }
    log(`not answering at ${BASE} — starting it`);
    const child = spawn(process.execPath, [tsx, "tools/studio-server.mts"], {
      cwd: APP,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(PORT) },
    });
    child.unref();
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      try {
        return await api("/api/state", undefined, 4000);
      } catch {
        /* still coming up */
      }
    }
    throw new Error(`the studio server did not come up at ${BASE} within 30s; run it yourself: ${LAUNCH}`);
  }
}

const config = (a) => ({
  pages: a.pages ?? 16,
  beats: a.beats ?? 8,
  age_from: a.age_from ?? 4,
  age_to: a.age_to ?? 8,
  reading_pt: a.reading_pt ?? "early",
  language: a.language ?? "en",
  publication_type: a.publication_type ?? "biblical",
  title: a.title ?? "",
  subtitle: a.subtitle ?? "",
  author: a.author ?? "Storybook Studio",
});

const bullets = (list, mark = "-") => (list ?? []).map((x) => `${mark} ${x}`).join("\n");

/* ------------------------------------------------------------------------------------ the tools */

const TOOLS = [
  {
    name: "studio_state",
    description:
      "The Storybook Studio request suite: every book request on disk, whether it passes the build gate, and which ones have a built book. Also reports the AI drafting endpoint's reachability. Call this first to see what exists before starting anything.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "studio_suggest",
    description:
      "Propose a book concept for a configuration: title, premise, a beat outline, a memory verse and discussion questions. This is a PROPOSAL and is never applied by itself — show it to the user and let them accept it. If an AI model is reachable it drafts the concept; if none answers, it answers with a structure drawn from the passage index and says so in the 'source' line.",
    inputSchema: {
      type: "object",
      properties: {
        passage: { type: "string", description: "the passage or subject to retell, e.g. 'the good samaritan' or 'a story about a lost sheep'" },
        note: { type: "string", description: "anything else the suggestion must honour (tone, characters, what to leave out)" },
        pages: { type: "integer", description: "printed pages; the page target governs. 16/20/24/32 are the presets" },
        beats: { type: "integer", description: "number of story beats (5-14)" },
        age_from: { type: "integer" },
        age_to: { type: "integer" },
        reading_pt: { type: "string", description: "reading proficiency: early | confident | fluent" },
        language: { type: "string", description: "BCP-47 tag, default en" },
        publication_type: { type: "string", description: "e.g. biblical | original" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "studio_draft",
    description:
      "Turn an accepted concept into a whole manuscript (a Book: beats of prose with locks), or import a manuscript you already have. Either way it is gated against the Book contract — ids, roles, matter slots, scripture references, age/length fit — and NOTHING is written unless the gate passes and write:true is set. A model's draft is offered one repair round with its own failures quoted back.",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "object", description: "the request configuration (pages, beats, ages, reading_pt, language, publication_type, title, subtitle, author)" },
        concept: { type: "object", description: "the accepted suggestion's concept, if you have one" },
        manuscript: { type: "object", description: "a Book to import instead of drafting one (R-WIZ-007 import mode)" },
        key: { type: "string", description: "the file name under content/ (hyphenated slug); defaults to the title" },
        write: { type: "boolean", description: "write content/<key>.json once the gate passes (default false — show the gate result first)" },
        overwrite: { type: "boolean", description: "replace content/<key>.json if it exists (default false)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "studio_build",
    description:
      "Build a request into a self-contained book: the solver measures every block in pinned Chromium and composes the pages, then the emitter writes one offline HTML file. Returns the solver's own report and where the book landed. Takes up to ~2 minutes on a cold start; if it is still running after wait_seconds the job id comes back and studio_job polls it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "the request key — the file name under content/, without .json" },
        wait_seconds: { type: "integer", description: "how long to wait for the build before handing back a job id (default 150)" },
        force: { type: "boolean", description: "build even though the gate failed (default false)" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "studio_make",
    description:
      "One call for a whole book: propose a concept, draft the manuscript, and build it — the same three gated actions, run in order. Stops with the gate's own words if the manuscript is refused, and never writes or builds anything that did not pass. Use this when the user asked for a book and does not need to inspect the concept first; use studio_suggest/studio_draft/studio_build when they do. Takes up to ~3 minutes; if still running after wait_seconds the job id comes back and studio_job polls it.",
    inputSchema: {
      type: "object",
      properties: {
        passage: { type: "string", description: "the passage or subject to retell, e.g. 'the good samaritan'" },
        note: { type: "string", description: "anything else to honour (tone, audience, a character)" },
        config: { type: "object", description: "the request configuration: pages, beats, age_from, age_to, reading_pt, publication_type, language" },
        id: { type: "string", description: "the file name to write under content/ (hyphenated slug); defaults to the title" },
        front: { type: "array", items: { type: "string" }, description: "front matter slots, in order (default title, copyright, dedication, contents)" },
        back: { type: "array", items: { type: "string" }, description: "back matter slots, in order (default memory_verse, discussion, about)" },
        wait_seconds: { type: "integer", description: "how long to wait before handing back a job id (default 180)" },
      },
      required: ["passage"],
      additionalProperties: false,
    },
  },
  {
    name: "studio_job",
    description: "The state and the log tail of a build that is still running.",
    inputSchema: {
      type: "object",
      properties: { job: { type: "string", description: "the job id studio_build returned" } },
      required: ["job"],
      additionalProperties: false,
    },
  },
];

async function call(name, a) {
  if (name === "studio_state") {
    const s = await studio();
    const rows = (s.books ?? []).map(
      (b) =>
        `- ${b.id} — "${b.title}"${b.subtitle ? ` (${b.subtitle})` : ""}: ${b.pages ?? "?"} pages, ${b.beats ?? "?"} beats, ${b.blocks ?? "?"} blocks · gate ${b.gate?.ok ? "PASS" : `FAIL (${b.gate?.failures?.length ?? "?"})`} · ${b.built ? `built at ${b.built}` : "not built"}`,
    );
    return [
      `Storybook Studio — ${REPO}`,
      `design ${s.design ?? "?"} · transitions ${(s.transitions ?? []).map((t) => t.id).join("/")} · themes ${(s.themes ?? []).map((t) => t.id).join("/")}`,
      `ai drafting endpoint ${s.llm?.base_url}: ${s.llm?.reachable ? `${(s.llm.models ?? []).length} model(s) offered` : `unreachable (${s.llm?.error ?? "no models"})`}`,
      ``,
      `requests on disk:`,
      rows.join("\n") || "- (none)",
      ``,
      `A build writes build/studio/<id>.html and never touches the release pair build/book.html + build/composition.json.`,
    ].join("\n");
  }

  if (name === "studio_suggest") {
    await studio();
    const s = await api("/api/suggest", { config: config(a), brief: { passage: a.passage ?? "", note: a.note ?? "" } }, 240000);
    const c = s.concept ?? {};
    return [
      s.source === "model" ? `SUGGESTION (drafted by a model, ${s.provenance})` : `SUGGESTION (structure only — no model answered, ${s.provenance})`,
      ``,
      `${c.title}${c.subtitle ? ` — ${c.subtitle}` : ""}`,
      c.premise,
      c.passage ? `${c.passage.book} ${c.passage.chapter}:${c.passage.verse_from}-${c.passage.verse_to} (${c.passage.translation})` : "",
      ``,
      `beats (${(c.beats ?? []).length}):`,
      bullets((c.beats ?? []).map((b) => `[${b.kind}] ${b.summary}`)),
      c.memory_verse ? `\nmemory verse: ${c.memory_verse}` : "",
      (c.discussion ?? []).length ? `\ndiscussion:\n${bullets(c.discussion)}` : "",
      s.notes?.length ? `\n${bullets(s.notes, "note:")}` : "",
      ``,
      `Nothing has been applied. This is a proposal: accept it, edit it, or ask for another.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (name === "studio_draft") {
    await studio();
    const body = { config: a.config ?? config(a), concept: a.concept ?? {}, manuscript: a.manuscript, key: a.key, write: !!a.write, overwrite: !!a.overwrite };
    const d = await api("/api/draft", body, 600000);
    const g = d.gate ?? { ok: false, failures: [d.error ?? "no gate result"] };
    const head = g.ok
      ? `GATE: PASS — the request is buildable${d.written ? ` and was written to ${d.written}` : " (nothing written: write:false)"}`
      : `GATE: FAIL — nothing was written`;
    return [
      head,
      g.failures?.length ? `\nfailures:\n${bullets(g.failures)}` : "",
      g.notes?.length ? `\nnotes:\n${bullets(g.notes)}` : "",
      d.notes?.length ? `\n${bullets(d.notes, "note:")}` : "",
      d.conflict ? `\n${d.conflict}` : "",
      d.hint ? `\n${d.hint}` : "",
      d.key ? `\nrequest key: ${d.key}` : "",
      d.book ? `\nThe manuscript is in the tool result's JSON block — show it to the user before writing it.` : "",
      d.book ? `\n\`\`\`json\n${JSON.stringify(d.book).slice(0, 100000)}\n\`\`\`` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (name === "studio_build") {
    await studio();
    const id = String(a.id ?? "");
    if (!id) return { isError: true, text: "studio_build needs the request key, e.g. id: 'david-and-goliath'" };
    const started = await api("/api/build", { id, force: !!a.force }, 30000);
    if (!started.job) return { isError: true, text: `the studio refused the build: ${JSON.stringify(started).slice(0, 400)}` };
    const deadline = Date.now() + Math.min(240, Math.max(5, a.wait_seconds ?? 150)) * 1000;
    let job = started;
    while (Date.now() < deadline) {
      await sleep(3000);
      job = await api(`/api/job/${started.job}`, undefined, 20000);
      if (job.state !== "running") break;
    }
    const tail = (job.log ?? []).slice(-14).join("\n");
    if (job.state === "running") {
      return `still building after ${Math.round((Date.now() - (deadline - Math.min(240, a.wait_seconds ?? 150) * 1000)) / 1000)}s — job ${started.job}\n\nlast lines:\n${tail}\n\ncall studio_job with job: "${started.job}" to follow it.`;
    }
    const r = job.result ?? {};
    return [
      job.state === "done" ? `BUILT — ${r.html}` : `BUILD FAILED (exit ${r.exit}) — the log says why:`,
      ``,
      `print pages ${r.pages ?? "?"} · major/critical disclosures ${r.disclosures ?? "?"}`,
      `composition ${r.composition || "(none)"}`,
      ``,
      `the solver's own report, last lines:`,
      tail,
      ``,
      job.state === "done"
        ? `the book is at ${r.html ?? ""} (open the file, or serve it) and the studio serves it in a browser at ${BASE}/books/${id}.html`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (name === "studio_make") {
    await studio();
    const passage = String(a.passage ?? "").trim();
    if (!passage) return { isError: true, text: "studio_make needs a passage, e.g. passage: 'the good samaritan'" };
    const started = await api(
      "/api/make",
      {
        brief: { passage, note: a.note ? String(a.note) : "" },
        config: a.config ?? {},
        id: a.id ? String(a.id) : undefined,
        front: a.front,
        back: a.back,
      },
      30000,
    );
    if (!started.job) return { isError: true, text: `the studio refused the request: ${JSON.stringify(started).slice(0, 400)}` };
    const wait = Math.min(280, Math.max(5, a.wait_seconds ?? 180));
    const deadline = Date.now() + wait * 1000;
    let job = started;
    while (Date.now() < deadline) {
      await sleep(4000);
      job = await api(`/api/job/${started.job}`, undefined, 20000);
      if (job.state !== "running") break;
    }
    const steps = (job.steps ?? []).map((s, i) => `  ${i + 1}. ${s.name}: ${s.state}${s.detail ? ` — ${s.detail}` : ""}`);
    if (job.state === "running") {
      return [
        `still working after ${wait}s — job ${started.job}`,
        ...steps,
        ``,
        (job.log ?? []).slice(-10).join("\n"),
        ``,
        `call studio_job with job: "${started.job}" to follow it.`,
      ].join("\n");
    }
    const r = job.result ?? {};
    const failed = (job.steps ?? []).filter((s) => s.state === "failed").map((s) => s.detail || s.name);
    return [
      job.state === "done" && r.html
        ? `MADE — ${r.html} (${r.pages ?? "?"} pages, ${r.disclosures ?? 0} major/critical disclosures)`
        : `STOPPED — ${failed[0] ?? "no artifact was written"}`,
      ``,
      ...steps,
      ``,
      `the studio's own log, last lines:`,
      (job.log ?? []).slice(-12).join("\n"),
      ``,
      job.state === "done" && r.html
        ? `the book is at ${r.html} and the studio serves it at ${BASE}/books/${job.book}.html`
        : "nothing was written and nothing was built: the request is still on disk for studio_draft to retry, and the gate's words above are the reason.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (name === "studio_job") {
    const job = await api(`/api/job/${String(a.job ?? "")}`, undefined, 20000);
    return [
      `job ${job.id}: ${job.state}`,
      job.result ? `result: ${JSON.stringify(job.result)}` : "",
      ``,
      (job.log ?? []).slice(-20).join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return { isError: true, text: `no such tool: ${name}` };
}

/* -------------------------------------------------------------------------- MCP over stdio */

const PROTOCOL_FALLBACK = "2024-11-05";
let buf = "";
/**
 * A client that closes stdin may still be waiting for an answer to the call it just made (a build
 * takes a minute; a probe piping a request in and closing the pipe is the common case). So the
 * process ends when stdin closes **and** nothing is in flight, not the moment the pipe shuts.
 */
let inflight = 0;
let ended = false;
const maybeExit = () => {
  if (ended && inflight === 0) process.exit(0);
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handle(line);
  }
});
process.stdin.on("end", () => {
  ended = true;
  maybeExit();
});

const out = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

async function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    log("ignoring a line that is not JSON:", e.message);
    return;
  }
  const { id, method, params } = msg;
  if (method && method.startsWith("notifications/")) return;          // no reply to a notification
  try {
    if (method === "initialize") {
      out({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_FALLBACK,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "storybook-studio", version: "1.0.0" },
          instructions:
            "The Storybook Studio request suite. studio_make does the whole thing in one call (propose, draft, gate, build). " +
            "To keep the operator in the loop, use studio_state, then studio_suggest, then studio_draft, then studio_build — " +
            "a suggestion is a proposal and is never applied by itself; nothing is written unless the gate passes and write:true is set. " +
            "The model is Hermes' own (the studio reads the choice and the key from Hermes); it never returns a credential to a caller.",
        },
      });
      return;
    }
    if (method === "ping") return void out({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return void out({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const name = params?.name;
      inflight += 1;
      try {
        const res = await call(name, params?.arguments ?? {});
        const text = typeof res === "string" ? res : res.text;
        const isError = typeof res === "object" && res.isError;
        out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) } });
      } finally {
        inflight -= 1;
        maybeExit();
      }
      return;
    }
    out({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log("call failed:", text);
    if (id !== undefined) out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } });
  }
}

log(`ready · studio ${BASE} · app ${APP}`);
