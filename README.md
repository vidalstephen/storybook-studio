# Storybook Studio

Turn a passage into a printed picture book — with your own Hermes Agent driving it.

You tell it what the book is about. It proposes a concept, drafts the manuscript, and typesets the
pages: the solver measures every line in a real Chromium, composes the page breaks, and writes one
self-contained HTML book you can open, read and print. Nothing is written and nothing is built unless
the request passes the gate, and the reader tells you what the build did — including anything it
could not do.

```
your Hermes Agent  ──MCP──▶  studio  ──▶  concept ──▶ manuscript ──▶ gate ──▶ printed book (HTML)
                              ▲
                    a web page, if you want one
```

**Node 20 or newer. No cloud account, no API key required to build.** The AI step is optional: with
no model answering, the studio still answers with a structure drawn from its own passage index, and
says so rather than pretending. The build itself never needs a model.

---

## 1. Install (one command)

```bash
git clone <this repo> storybook-studio && cd storybook-studio
./install.sh
```

`install.sh` checks Node, installs the two runtime dependencies (`playwright`, `pdf-lib`), installs
the Chromium the solver measures with, and sets a studio passcode (it asks; it never stores a
plaintext one). It is idempotent — run it again after a `git pull` and it only does what is missing.

Then open the studio:

```bash
cd app && npx tsx tools/studio-server.mts      # http://127.0.0.1:8787
```

Type what the book should be about, pick a length, press **Make the book**. Expect about two minutes:
a concept, a manuscript, then the printed pages. Everything else — page count, ages, reading level,
front and back matter, the three steps one at a time, importing a manuscript you already have — is
behind *Fine-tune it, or do it step by step*.

## 2. Connect it to Hermes Agent

One command, from anywhere:

```bash
hermes mcp add studio --command node --args /absolute/path/to/storybook-studio/app/tools/studio-mcp.mjs
```

It asks *"Enable all 6 tools?"* — answer **yes**. Then:

```bash
hermes mcp list                  # studio should show as enabled
hermes mcp test studio           # connects and lists its tools
hermes config set mcp_servers.studio.timeout 300   # a cold build takes ~2 minutes
```

Six tools appear in your **next session** (`/reload-mcp` in an open one):

| Tool | What it does |
|---|---|
| `studio_make` | **The whole thing in one call** — propose, draft, gate, build. Give it a passage and it returns the finished book. |
| `studio_state` | What requests exist, whether each passes the gate, what is built, which model it will draft with |
| `studio_suggest` | The concept only (title, premise, beat outline, memory verse, questions) — a proposal, never applied |
| `studio_draft` | The manuscript only; the gate's verdict; writes only when you pass `write:true` |
| `studio_build` | Typeset an existing request into a book |
| `studio_job` | Follow a build or a make that is still running |

Then just ask, in plain words:

> *"Make me a picture book about the good samaritan, about 16 pages, for a four year old."*

The MCP server starts the studio itself if nothing is listening, so that is the only setup you need.
You never have to start the studio by hand — the web page is optional.

**Where the model comes from.** The studio does not have a model of its own: it asks *your* Hermes.
It reads your provider catalogue and your default model, offers exactly the models Hermes offers, and
drafts with the one Hermes is running — so nothing to configure, and no second key to keep. Providers
Hermes reaches by OAuth or through a non-OpenAI API (Anthropic, Copilot, the Codex sign-in, the Nous
Portal) are listed but marked *Hermes only*, and the studio refuses that pick with the reason instead
of failing at the first draft. Keys are read from Hermes, used for one request, and never returned in
a response, logged, or written to disk.

Want a different model? Pick it in the page, or:

```bash
npx tsx app/tools/studio-models.mts         # what it found, what it can call, what it would use
```

## 3. Teach your Hermes the workflow (optional)

`hermes/skills/storybook-studio-request/` is a skill for the agent itself — when to reach for which
tool, and the pitfalls (a suggestion is never applied by itself; a build takes two minutes, so give
the tool call a 300 s timeout).

```bash
cp -r hermes/skills/storybook-studio-request ~/.hermes/skills/software-development/
hermes skills list | grep storybook
```

## What you get back

Every build lands in `build/studio/<request>.html` — one self-contained file, no network at any
point, opens straight from `file://`, and readable on a phone. The studio also serves it at
`/books/<request>.html`.

The reader includes what a build *actually* did, at three levels: **placed** content, matter slots
**deliberately omitted with a recorded reason** (an informational note — a print decision, not a
failure), and anything genuinely **unplaced** (a major disclosure, if it ever happens). Read the
notes; they are the honest part.

## Requirements, honestly

| | |
|---|---|
| Node | 20+ (the repo is TypeScript run through `tsx`; nothing to compile) |
| Chromium | installed by `install.sh` via `npx playwright install chromium` — the solver measures in a real renderer, which is the whole point |
| Model | optional for building, needed for AI drafting. Comes from your Hermes; nothing to set up |
| Disk | ~400 MB with Chromium; the books are ~180 KB each |
| OS | Linux and macOS are what this was built on. Windows: Node and Playwright are fine, `install.sh` is a bash script — run the four commands in it by hand |

## Layout

| Path | What it is |
|---|---|
| `app/src/` | The pipeline: contracts, measurement, the solver (`paginate.ts`), the emitter (`render-html.ts`), and the reader (`reader/`) |
| `app/tools/` | The studio (web page + HTTP server), the MCP server, the model resolver, the credential tool |
| `app/studio/` | The studio page itself |
| `content/` | Book requests. `david-and-goliath.json` is the reference book the specs were written against |
| `docs/`, `spec/`, `adr/` | The design record — spec, decision log, acceptance tests. The code cites these (`docs/08 §4.5` and so on), which is why they ship. They are the *specification*, not configuration: you do not need to read them to run anything |
| `tools/` | Repo-level checks: traceability, imposition, scripture verification |
| `hermes/skills/` | The skill for your agent (section 3) |

## Notes for whoever receives this

- **This is a snapshot, and the design record names its author** (Stephen Vidal) — the docs are the
  specification he wrote for this project, addressed to himself. Read them as a spec, not as setup.
- **No credentials are in this repo.** The studio's access file (`app/studio/access.json`) holds a
  scrypt hashed passcode plus an automation token, is created by `install.sh`, is gitignored, and is
  never committed. Your first run makes your own.
- Hostnames, addresses and host facts were stripped for shipping; the only paths in the shipped code
  are ones you create.
- The books' scripture text is the **World English Bible** (public domain). The bundled fonts are
  SIL Open Font License — check `docs/` before commercial distribution.

## Licence

Not set by this package. The design record's own position (`docs/17` Q-02) is that the codebase
should stay *publishable* — no secrets, licence-clean assets — with the licence decision left open
to the author. Ask before you ship it commercially.
