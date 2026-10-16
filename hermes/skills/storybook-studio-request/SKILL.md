---
name: storybook-studio-request
description: "Use when asked to generate or build a Storybook Studio book."
version: 1.0.0
author: Hermes Agent + Stephen Vidal
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [storybook-studio, book, generation, mcp, pipeline]
    related: [hermes-agent]
---

# Storybook Studio — taking a book request

## When to Use

Use when the user asks to generate, request, draft or build a picture book or storybook; when a
`mcp_studio_*` tool appears or errors; or when the studio server needs starting, moving or debugging.
Not for editing the reader or the solver — those are `app/src/**` inside the studio repo.

A book request **is** a `Book` file (`content/<key>.json`), and building one is two commands the repo
already owns. Everything here is a client of that, not a second pipeline.

## The four states, and who may move between them

```
configuration  ->  suggestion  ->  manuscript (Book)  ->  built book
 (the request)     (a proposal)     (gated, then written)     (solver + emitter)
```

- **A suggestion is a proposal.** It is never applied by the tool that produced it. Show it; the
  operator accepts, edits, or asks again (D-11: no AI layer mutates state).
- **Nothing is written until the gate passes.** The gate is a shape and configuration check — ids,
  roles, matter slots, scripture references, the age/length fit. It is **not** an editorial review:
  prose quality and scripture fidelity are separate layers and are not in it. Say so when you report
  a gate pass; a pass does not mean the prose is good.
- **A build is the real solver** in pinned Chromium. It takes 40–120 s cold; a tool call must wait or
  hand back a job id.
- **A recorded omission is not a fault.** The print pass may drop a matter slot *with a reason*; the
  reader keeps that section in its contents view and raises an informational note, not a disclosure.
  Only an unplaced block with **no** reason is a defect.

## The tools

| tool | does |
|---|---|
| `studio_make` | **The whole thing in one call**: propose → draft → gate → build. Stops with the gate's words if the manuscript is refused. Use when the user just wants a book. |
| `studio_state` | requests on disk, gate result each, what is built, which model it will draft with |
| `studio_suggest` | a concept proposal (title, premise, beats, verse, questions) — never applied |
| `studio_draft` | draft a whole `Book` from config+concept, or import one; gate; write only if `write:true` |
| `studio_build` | the solver + emitter; returns the report and where the book landed |
| `studio_job` | state + log tail of a build (or a make) still running |

Use the step-by-step tools when the operator wants to see the concept *before* prose is written; use
`studio_make` when they asked for a finished book and do not care to inspect the middle.

Registered as `mcp_studio_*`, served by `app/tools/studio-mcp.mjs` (plain Node, zero deps). It starts
the studio server itself if nothing is listening, so a cold machine still takes a request.

```bash
hermes mcp add studio --command node --args /abs/path/to/storybook-studio/app/tools/studio-mcp.mjs
hermes config set mcp_servers.studio.timeout 300      # a cold make/build needs ~2–3 minutes
hermes mcp list && hermes mcp test studio
```

New tools appear in a **new session** (`/reload-mcp` for an open one). If the repo moves, re-register:
the argument is an absolute path.

## Where the model comes from

**The studio uses this machine's own Hermes model** — it reads the provider catalogue and the default
model, offers exactly those, and drafts with the one Hermes is running. The pick is stored in
`app/studio/model.json` and applies to the MCP tools too, not just the web page.

- `npx tsx app/tools/studio-models.mts` prints what it found, what it can call, and what it would use.
- Keys are read from Hermes (`$HERMES_HOME/.env`, its credential pool), used for one request, and are
  never returned in a response, logged or written. `/api/state.llm` reports `has_key`, never the key.
- A provider Hermes reaches by OAuth or through a non-OpenAI API (Anthropic, Copilot, the Codex
  sign-in, the Nous Portal) is listed as **Hermes only** and refused at the moment of choosing, with
  the reason. Do not "fix" that by storing OAuth tokens in the studio.
- With no model reachable, a suggestion falls back to a *structure* from the passage index and says
  `structure` as its source — never present that as drafted prose. The build never needs a model.

## Artifacts and blast radius

- A build writes `build/studio/<key>.html` (self-contained, offline, `file://`-openable) and
  `build/studio/<key>-composition.json`. The web page serves it at `/books/<key>.html`.
- The solver **composes what the request supports**, which is not always the page count that was
  asked for. Report both numbers when they differ ("12 pages (asked for 16)") rather than letting the
  request's number stand.
- A book can carry a `keep_together` lock the solver cannot honour; that ships as a **disclosed broken
  promise**, not a silent one. If a book comes back with a major disclosure, read it out — that is the
  reader doing its job, and it is usually a lock the author asked for that the page count cannot pay.
- The studio server must be listening for anything but a cold start: `cd app && PORT=8787 npx tsx
  tools/studio-server.mts`. `/books/*` and the API sit behind basic auth once a credential exists
  (`app/studio/access.json`, mode 600, gitignored — `tools/studio-passwd.mts` sets it).

## Pitfalls

- **Give a make or a build a 300 s tool timeout.** A 110 s build inside one tool call is cut
  otherwise, while the job carries on unseen — poll it with `studio_job`.
- **Never hand-edit `~/.hermes/config.yaml`** — `hermes mcp add` / `hermes config set` only.
- **Do not judge a page turn from a single still.** Freeze it first (`getAnimations().pause()` +
  `currentTime`) or a 420 ms turn photographs as a still and you will "fix" something that works.
- **A browser probe of the page needs `window.__name` shimmed** before any `page.evaluate` with a
  named function inside: tsx/esbuild injects that helper and the page does not have it.
- **Probe the web page with `waitUntil: "domcontentloaded"` plus a readiness wait on the app's own
  DOM**, not `waitUntil: "load"` — an injected analytics beacon (or any third-party script) can hold
  `load` open for 30 s and time the navigation out.
- **The studio can be published, and then the client key matters.** Throttling keys on the client the
  proxy names (`cf-connecting-ip` / `X-Forwarded-For`), never `req.socket.remoteAddress`: behind a
  tunnel every visitor arrives from loopback, so a socket-keyed failure counter lets one attacker lock
  out everybody.
