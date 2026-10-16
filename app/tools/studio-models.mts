/**
 * studio-models — where the studio's model comes from.
 *
 * Hermes Agent already holds the choices and the keys, so the studio asks **it** instead of being
 * pointed somewhere by hand. The picker offers the models Hermes itself offers (its
 * `provider_models_cache.json`), and the default is the model Hermes is running right now
 * (`model.provider` / `model.default` in `~/.hermes/config.yaml`).
 *
 * The point of that: a studio left pointing at `http://127.0.0.1:11434/v1` silently drafts with
 * whichever local model happens to sort first — a *local* tag while Hermes is on a *cloud* provider.
 * The studio should not have its own opinion about models; it should use the machine's.
 *
 * Credentials
 * ------------
 * A key is read, used for one request, and never returned, logged or written anywhere. Nothing in
 * this file puts a key in a response body: `/api/state` reports `has_key`, never the key. An endpoint
 * that could hand a Hermes credential back over HTTP would be a hole in a page that is served on the
 * public internet.
 *
 * Sources, in order:
 *   1. `SB_LLM_API_KEY` / `SB_LLM_BASE_URL` / `SB_LLM_MODEL`  — an explicit endpoint still wins
 *   2. `~/.hermes/.env`                                    — e.g. `OLLAMA_API_KEY`
 *   3. `~/.hermes/auth.json` credential pool               — only where a plain `api_key` is stored
 *
 * Which providers are callable
 * ----------------------------
 * Only **OpenAI-compatible** ones. Anthropic's API is a different shape, Copilot needs a GitHub token
 * exchange, and the Codex provider mints short-lived OAuth tokens Hermes refreshes per request — a
 * studio that tried to hold those would be a second, worse auth stack. Those are listed, marked
 * `ready: false`, and the page says *Hermes only* rather than failing at the first draft.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const HERMES = process.env.HERMES_HOME ?? path.join(homedir(), ".hermes");
const PICK_FILE = path.join(APP, "studio", "model.json");

export interface Pick {
  provider: string;
  model: string;
}

export interface Provider {
  id: string;
  label: string;
  /** The OpenAI-compatible base URL, or "" when the studio cannot call this provider at all. */
  base_url: string;
  models: string[];
  /** A short phrase for where the key comes from — never the key. */
  key_source: string | null;
  /** True when the studio can actually complete a request here. */
  ready: boolean;
  /** Why not, when it cannot. */
  note: string | null;
}

/**
 * The providers the studio knows how to reach. A provider Hermes has but this table does not is
 * still *listed* (from the cache) as Hermes-only, so the picker never hides a real option.
 */
const KNOWN: Record<string, Omit<Provider, "models">> = {
  "ollama-cloud": {
    id: "ollama-cloud",
    label: "Ollama Cloud",
    base_url: "https://ollama.com/v1",
    key_source: "OLLAMA_API_KEY in ~/.hermes/.env",
    ready: true,
    note: null,
  },
  "ollama-launch": {
    id: "ollama-launch",
    label: "Ollama (this machine)",
    base_url: "http://127.0.0.1:11434/v1",
    key_source: null,
    ready: true,
    note: "the local daemon — no key, and no cloud tags unless it is signed in",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    key_source: "OPENAI_API_KEY in ~/.hermes/.env",
    ready: true,
    note: null,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    key_source: "OPENROUTER_API_KEY in ~/.hermes/.env",
    ready: true,
    note: null,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    base_url: "",
    key_source: null,
    ready: false,
    note: "Anthropic's API is not OpenAI-compatible; Hermes reaches it through its own adapter",
  },
  copilot: {
    id: "copilot",
    label: "GitHub Copilot",
    base_url: "",
    key_source: null,
    ready: false,
    note: "needs a GitHub token exchange Hermes does per session",
  },
  "openai-codex": {
    id: "openai-codex",
    label: "OpenAI (Codex sign-in)",
    base_url: "",
    key_source: null,
    ready: false,
    note: "short-lived OAuth tokens Hermes refreshes per request — it would be a second auth stack here",
  },
  "opencode-free": {
    id: "opencode-free",
    label: "opencode (free tier)",
    base_url: "",
    key_source: null,
    ready: false,
    note: "no OpenAI-compatible endpoint published for it",
  },
  nous: {
    id: "nous",
    label: "Nous Portal",
    base_url: "",
    key_source: null,
    ready: false,
    note: "OAuth — run `hermes proxy start --provider nous` and point SB_LLM_BASE_URL at it",
  },
};

const read = (p: string): string | null => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

/** `~/.hermes/.env` as a map. Read here, used for one request, never returned. */
function hermesEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = read(path.join(HERMES, ".env"));
  if (!raw) return out;
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** The providers and models Hermes offers, from the cache it keeps for its own picker. */
function hermesCatalogue(): Record<string, string[]> {
  const raw = read(path.join(HERMES, "provider_models_cache.json"));
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    const out: Record<string, string[]> = {};
    for (const [id, v] of Object.entries<any>(j)) if (Array.isArray(v?.models)) out[id] = v.models;
    return out;
  } catch {
    return {};
  }
}

/** The provider and model Hermes is running — the studio's default. */
export function hermesCurrent(): Pick | null {
  const raw = read(path.join(HERMES, "config.yaml"));
  if (!raw) return null;
  const block = /^model:\n((?:[ \t]+.*\n?)*)/m.exec(raw)?.[1] ?? "";
  const pick = (k: string) => new RegExp(`^[ \\t]+${k}:\\s*(\\S+)`, "m").exec(block)?.[1] ?? "";
  const provider = pick("provider");
  const model = pick("default");
  return provider || model ? { provider, model } : null;
}

/** The stored pick, so the choice survives a restart. */
export function readPick(): Pick | null {
  const raw = read(PICK_FILE);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j.provider && j.model ? { provider: String(j.provider), model: String(j.model) } : null;
  } catch {
    return null;
  }
}

export function writePick(p: Pick): Pick {
  mkdirSync(path.dirname(PICK_FILE), { recursive: true });
  writeFileSync(PICK_FILE, JSON.stringify({ ...p, updated: new Date().toISOString() }, null, 2), { mode: 0o600 });
  return p;
}

/** The key for a provider, or `null`. Callers must never put the returned value in a response. */
export function keyFor(provider: string): { key: string; source: string } | null {
  if (process.env.SB_LLM_API_KEY) return { key: process.env.SB_LLM_API_KEY, source: "SB_LLM_API_KEY" };
  const env = hermesEnv();
  const envName = { "ollama-cloud": "OLLAMA_API_KEY", openai: "OPENAI_API_KEY", openrouter: "OPENROUTER_API_KEY" }[provider];
  if (envName && env[envName]) return { key: env[envName], source: `${envName} in ~/.hermes/.env` };
  // The pool stores most secrets as fingerprints only; a plain `api_key` is taken when it is there.
  const raw = read(path.join(HERMES, "auth.json"));
  if (raw) {
    try {
      const entries = JSON.parse(raw)?.credential_pool?.[provider];
      for (const e of Array.isArray(entries) ? entries : []) {
        const k = e?.api_key ?? e?.key ?? e?.secret;
        if (typeof k === "string" && k) return { key: k, source: `credential pool (${e.label ?? e.id ?? provider})` };
      }
    } catch {
      /* an unreadable pool is not a reason to fail: the env or the explicit override may still work */
    }
  }
  return null;
}

/** The endpoint for a provider: an explicit override wins, then the table. */
export function baseUrlFor(provider: string): string {
  if (process.env.SB_LLM_BASE_URL) return process.env.SB_LLM_BASE_URL;
  return KNOWN[provider]?.base_url ?? "";
}

/** One provider, as the picker sees it. */
function provider(id: string, models: string[]): Provider {
  const k = KNOWN[id] ?? {
    id,
    label: id,
    base_url: "",
    key_source: null,
    ready: false,
    note: "Hermes offers it; the studio has no endpoint or credential for it",
  };
  const base = baseUrlFor(id);
  const key = keyFor(id);
  const needsKey = !/127\.0\.0\.1|localhost/.test(base);
  const ready = Boolean(k.ready && base) && (!needsKey || Boolean(key));
  return {
    ...k,
    base_url: base,
    models,
    key_source: key?.source ?? k.key_source,
    ready,
    note: ready ? k.note : (k.note ?? (needsKey && !key ? "no credential the studio can read for it" : null)),
  };
}

/** Every provider, with the live model list for the ones that are callable and the cache for the rest. */
export async function catalogue(): Promise<Provider[]> {
  const cache = hermesCatalogue();
  const ids = [...new Set([...Object.keys(KNOWN), ...Object.keys(cache)])].filter((id) => id !== "ollama-launch" || cache[id]);
  const out: Provider[] = [];
  for (const id of ids) {
    let models = cache[id] ?? [];
    const base = baseUrlFor(id);
    if ((KNOWN[id]?.ready ?? false) && base) {
      const live = await liveModels(base, keyFor(id)?.key);
      if (live.ok && live.models.length) models = live.models;
    }
    out.push(provider(id, models));
  }
  // Ready first, then the ones Hermes has models for, then the rest — the picker's first entry is
  // the model the studio will use when nothing has been chosen.
  out.sort((a, b) => Number(b.ready) - Number(a.ready) || b.models.length - a.models.length || a.id.localeCompare(b.id));
  return out;
}

export async function liveModels(
  base_url: string,
  api_key?: string,
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  if (!base_url) return { ok: false, models: [], error: "no endpoint for this provider" };
  try {
    const r = await fetch(`${base_url.replace(/\/$/, "")}/models`, {
      headers: api_key ? { Authorization: `Bearer ${api_key}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j: any = await r.json();
    return { ok: true, models: (j.data ?? []).map((m: any) => String(m.id)) };
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What the studio should use, resolved: the stored pick, else Hermes' own current provider/model,
 * else whatever callable provider has models. Returns the key for the call and says where it came
 * from — the caller must keep that key out of every response body.
 */
export async function resolve(pick?: Partial<Pick> | null): Promise<{
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  key_source: string | null;
  source: string;
  ready: boolean;
  note: string | null;
}> {
  const chosen = { ...(readPick() ?? {}), ...(pick ?? {}) } as Partial<Pick>;
  const current = hermesCurrent();
  const explicitModel = process.env.SB_LLM_MODEL ?? "";
  const explicitUrl = process.env.SB_LLM_BASE_URL ?? "";

  const providerId = chosen.provider || current?.provider || (explicitUrl ? "explicit" : "ollama-cloud");
  const base_url = baseUrlFor(providerId) || explicitUrl;
  const key = keyFor(providerId);

  let model = chosen.model || "";
  if (!model) {
    if (explicitModel) model = explicitModel;
    else if (providerId === current?.provider && current.model) model = current.model;
  }
  if (!model) {
    const live = await liveModels(base_url, key?.key);
    model = live.models[0] ?? "";
  }
  const source = chosen.provider
    ? "chosen in the studio"
    : providerId === current?.provider
      ? "the model Hermes is running"
      : "the first model this endpoint offers";
  return {
    provider: providerId,
    model,
    base_url,
    api_key: key?.key ?? "",
    key_source: key?.source ?? null,
    source,
    ready: Boolean(base_url && model),
    note: KNOWN[providerId]?.note ?? null,
  };
}

/* ------------------------------------------------------------------- run directly, to see the list */

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const cur = hermesCurrent();
  console.log(`Hermes runs: ${cur?.model ?? "?"} on ${cur?.provider ?? "?"}`);
  console.log(`Hermes home: ${HERMES}`);
  const picked = readPick();
  console.log(`Studio pick: ${picked ? `${picked.model} on ${picked.provider}` : "(none yet — follows Hermes)"}`);
  for (const p of await catalogue()) {
    const mark = p.ready ? "ready" : "Hermes only";
    console.log(`\n${p.id}  [${mark}]  ${p.models.length} models${p.key_source ? `  key: ${p.key_source}` : ""}`);
    if (p.note) console.log(`  ${p.note}`);
    console.log(`  ${p.models.slice(0, 6).join(", ")}${p.models.length > 6 ? ", …" : ""}`);
  }
  const r = await resolve();
  console.log(`\nresolved: ${r.model} on ${r.provider} (${r.source}) -> ${r.base_url}  key: ${r.key_source ?? "none"}`);
}
