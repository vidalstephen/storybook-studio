# Storybook Studio — the build

The specification set lives in `../docs/`. This directory is the implementation of it.
Nothing here invents a number: **every geometric or typographic value traces to a line of
`../docs/`, and `src/check-tokens.ts` executes the specification's own arithmetic and fails
if the code and the documents disagree.**

```bash
npm install
npx tsx src/check-tokens.ts        # 18/18 — the design revision reproduces the documents
npx tsx src/measure.ts             # the measure probe, taken in pinned Chromium
npx tsx src/paginate.ts ../content/david-and-goliath.json > ../build/composition.json
npx tsx src/render-html.ts         # ../build/book.html — the self-contained reader
npx tsx src/reader/verify.ts       # 269 checks in a real browser at six viewports, plus no-JS and the turn
npx tsx tools/studio-server.mts    # the request studio — http://127.0.0.1:8787, and on the tailnet
```

## The request studio

`tools/studio-server.mts` is a dependency-free HTTP server over the pipeline above: configure a
request, take a suggestion, accept a manuscript, build, read the book. It adds no page logic of its
own — a build **is** the two commands, run for you:

```
Book (content/<id>.json)  ->  paginate  ->  Composition (build/studio/<id>-composition.json)
                          ->  render-html ->  the book (build/studio/<id>.html), served at /books/<id>.html
```

It never writes `build/book.html` or `build/composition.json`: the release pair belongs to the
release pipeline and to whatever is serving it. Four things it is careful about:

| | |
|---|---|
| **A suggestion is a proposal** | `POST /api/suggest` returns a concept and it is *not* applied. Accepting it fills the request form; drafting and writing are separate actions (`docs/02` W2, D-11: no AI layer mutates state). |
| **The AI step is optional and never faked** | Point `SB_LLM_BASE_URL` / `SB_LLM_MODEL` / `SB_LLM_API_KEY` at any OpenAI-compatible endpoint. With no model answering, the suggestion falls back to a *structure* from the passage index and says so in `source` — the build itself never needs a model. |
| **The gate is a gate, not a review** | `POST /api/draft` checks the shape and the configuration — ids, roles, matter slots, scripture references, the age-band/length fit (`R-WIZ-013`) — and refuses to write a book that fails it. Prose quality and scripture fidelity are the layers of `docs/02` W4/W5, and they are not here. |
| **A model's draft is checked, not trusted** | The draft is gated against the contract and offered one repair round with its own failures quoted back. Nothing is written unless the gate passes. |

## The one architectural claim

Everything visual is a deterministic function of four inputs:

```
Composition = paginate(Book, CompositionSettings, DesignRevision, target)
```

Everything creative is an AI call that returns data and changes nothing. If a component
needs the network to decide where a page break goes, it is in the wrong layer.

| File | Role | Spec |
|---|---|---|
| `src/tokens.ts` | The design revision — geometry, typography, the density band, the border. Derived quantities are computed, and `selfCheck()` re-derives them against the documents. | `04` §6.1, `09` §4/§7, `08` §4.2 |
| `src/contracts.ts` | `Book` (content) and `Composition` (layout). The composition references manuscript blocks **by id** and never copies the prose. | `05`, `04` §1.2 |
| `src/measure.ts` | The measurement engine. Pinned Chromium is the single layout authority (D-01): line boxes are counted in a real renderer. | `08` §3, `09` §1.5 |
| `src/paginate.ts` | The solver: beats → pages, by dynamic program, honouring locks. A page that cannot fit is an **absent edge**, never a clipped one. | `08` §5, `07` |
| `src/render-html.ts` | The interactive HTML storybook: mobile-first, offline, reflowing. | spec §7 |
| `src/reader/*` | The reader, in eight parts: `design` (tokens → `--sb-*`), `content` (Book + Composition → the flow), `markup`, `styles`, `runtime` (the shipped script), `pack` (one self-contained file), `fixture` (a sample `Book`+`Composition` when `../content` has none), `verify` (the browser acceptance harness). | §7, `09` §3.5/§7.5, `16` §5 |
| `tools/studio-server.mts` + `studio/index.html` | The request studio: a request (`Book`) in, a built book out, over the same two commands. One button runs the three gated actions in sequence; the step-by-step path is still there behind *Fine-tune*. | §3.1–§3.3, `02` W1–W4 |
| `tools/studio-mcp.mjs` | The same suite as MCP tools for Hermes Agent (`studio_state` / `_suggest` / `_draft` / `_build` / `_make` / `_job`), registered under `mcp_servers.studio`. A thin client of the server above — it starts it if nothing is listening — so a request can be taken from a conversation. | `02` W1–W4, D-11 |
| `tools/studio-passwd.mts` | Sets or rotates the studio's access credential (`studio/access.json`, mode 600, gitignored): the passcode hashed with scrypt, plus a random token for local automation. The server re-reads it per request, so a rotation needs no restart. | `14` §… (access control) |
| `tools/studio-models.mts` | Which model the studio drafts with, and why. Reads Hermes' own provider catalogue and default, so the studio offers the models Hermes offers and defaults to the model Hermes is running. Keys are read from Hermes for one request and never returned, logged or written. | `02` W2 |

## The model

The studio has no opinion about models: it uses **Hermes'**. The picker in the page lists the models
Hermes itself lists (its `provider_models_cache.json`), grouped by provider, and the default is the
model Hermes is running (`model.provider` / `model.default` in `~/.hermes/config.yaml`). The choice is
stored in `studio/model.json`, so it survives a restart and applies to the MCP tools too:

```bash
npx tsx tools/studio-models.mts                      # what it found, what it can call, and what it would use
curl -s -X POST -H "X-Studio-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"provider":"ollama-cloud","model":"deepseek-v4.1-pro"}' http://127.0.0.1:8787/api/model
```

An OpenAI-compatible endpoint it holds a credential for is callable (`ollama-cloud`, a local Ollama,
OpenAI, OpenRouter). A provider Hermes reaches through OAuth or through its own adapter — Anthropic,
Copilot, the Codex sign-in, the Nous Portal — is **listed but marked *Hermes only***, with the reason:
the studio will not grow a second auth stack, and `/api/model` refuses such a pick at the moment of
choosing rather than failing at the first draft. `SB_LLM_BASE_URL` / `SB_LLM_MODEL` / `SB_LLM_API_KEY`
still override everything, and with no key the studio says so and falls back to a structure rather
than inventing prose.

## Putting it on a network

The studio can be published for other people to use. It is a small HTTP server, so any reverse proxy
or tunnel works; the pattern that was used here:

- one hostname → `127.0.0.1:8787` (a Cloudflare tunnel ingress rule, or nginx, or Caddy), and
- **basic auth on every route**, which the server does itself as soon as a credential exists —
  the page, its API and every built book under `/books/`.

```bash
npx tsx tools/studio-passwd.mts --user studio --pass YOUR-SHARE-CODE
```

Two properties worth keeping when you set that up: the credential file is where the *choice* lives
(not in a config), so rotating it needs no restart; and with no credential file at all the server
binds loopback only, so a fresh clone cannot be exposed to a network by accident. Wrong passcodes are
throttled per client, keyed on the client the proxy names (`cf-connecting-ip` / `X-Forwarded-For`),
never on the socket address — behind a tunnel every visitor arrives from loopback, and a socket-keyed
counter would let one attacker lock out everybody.

```bash
npx tsx tools/studio-passwd.mts --user studio          # set or change the passcode (prompts, hidden)
npx tsx tools/studio-passwd.mts --show                 # what is set — never the secrets
npx tsx tools/studio-passwd.mts --rotate-token         # the token local automation uses
```

The passcode is stored only as a scrypt hash; the `token` beside it is what the MCP server and local
scripts send as `X-Studio-Token`, so no plaintext passcode is ever written into a config file.

## What is deliberately not here yet

- `src/render-print.ts` — fixed-page PDF and the imposed booklet (Phases 6–7). `pdf-lib` is installed for the imposition.
- Illustration, narration, translation (Versions 2–4).
