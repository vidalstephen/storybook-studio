#!/usr/bin/env bash
#
# Storybook Studio — verify the install.
#
#     ./verify.sh
#
# Checks the things that actually have to be true for a book to come out: Node, the dependencies,
# Chromium, the gate, a running studio that answers with a credential, and the MCP handshake your
# Hermes Agent will perform. It starts the studio itself if it is not already up, and leaves it
# alone if it is. It writes nothing into content/ and builds nothing.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
PORT="${PORT:-8787}"
FAIL=0

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32mok\033[0m   %s\n' "$*"; }
bad() { printf '  \033[31m!!\033[0m   %s\n' "$*"; FAIL=1; }

say "node"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  ok "$(node -v)"
else
  bad "node 20+ is required"
fi

say "dependencies"
for d in playwright pdf-lib tsx; do
  [ -d "app/node_modules/$d" ] && ok "$d" || bad "$d missing — run ./install.sh"
done

say "chromium (the solver measures in a real renderer)"
if ( cd app && node -e '
const { join } = require("node:path"), { homedir } = require("node:os"), { existsSync, readdirSync } = require("node:fs");
const root = join(homedir(), ".cache", "ms-playwright");
const ok = existsSync(root) && readdirSync(root).some((n) => /^chromium-\d+$/.test(n));
process.exit(ok ? 0 : 1);' ); then
  ok "a playwright chromium build is cached"
else
  bad "no chromium — run: cd app && npx playwright install chromium"
fi

say "the credential"
if [ -f app/studio/access.json ]; then
  ok "app/studio/access.json exists, mode $(stat -c '%a' app/studio/access.json 2>/dev/null || stat -f '%Lp' app/studio/access.json)"
  TOKEN="$(node -p 'JSON.parse(require("node:fs").readFileSync("app/studio/access.json","utf8")).token' 2>/dev/null)"
else
  bad "no credential — run ./install.sh"
  TOKEN=""
fi

say "a book request, and the gate"
if [ -f content/david-and-goliath.json ]; then
  ok "content/david-and-goliath.json (the reference book)"
else
  bad "the reference book is missing"
fi

say "the studio"
STARTED=0
SRV_PID=""
if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$PORT/api/state" 2>/dev/null \
   || curl -fsS -m 3 -o /dev/null -H "X-Studio-Token: $TOKEN" "http://127.0.0.1:$PORT/api/state" 2>/dev/null; then
  ok "already listening on :$PORT"
else
  # `setsid` puts the server in its own process group, so cleanup can end exactly what was started —
  # never `pkill`, which would take out a studio the user already had running somewhere else.
  setsid env PORT="$PORT" npx tsx app/tools/studio-server.mts >/tmp/ss-verify-server.log 2>&1 &
  SRV_PID=$!
  STARTED=1
  for _ in $(seq 1 25); do
    sleep 1
    curl -fsS -m 3 -o /dev/null -H "X-Studio-Token: $TOKEN" "http://127.0.0.1:$PORT/api/state" 2>/dev/null && break
  done
  if grep -q EADDRINUSE /tmp/ss-verify-server.log 2>/dev/null; then
    bad "something that is not the studio is already on :$PORT — re-run with PORT=<free port> ./verify.sh"
  fi
fi

STATE="$(curl -fsS -m 5 -H "X-Studio-Token: $TOKEN" "http://127.0.0.1:$PORT/api/state" 2>/dev/null)"
if [ -n "$STATE" ]; then
  ok "answers /api/state with the local token ($([ "$STARTED" = 1 ] && echo 'started for this check' || echo 'was already running'))"
  NODE_JSON="$STATE" node -e '
const d = JSON.parse(process.env.NODE_JSON || "{}");
const l = d.llm || {};
console.log("  ok   model: " + (l.model || "(none)") + " on " + (l.provider || "?") + " — " + (l.source || "?"));
console.log("  ok   requests on disk: " + ((d.books || []).length));
if (l.has_key) console.log("  ok   credential for the model: " + l.key_source);
else console.log("  --   no model credential the studio can read; suggestions fall back to a structure (the build still works)");
' 2>/dev/null
  if curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$PORT/api/state" 2>/dev/null; then
    bad "the studio answered WITHOUT a credential — it should refuse. Check app/studio/access.json."
  else
    ok "refuses an unauthenticated request"
  fi
else
  bad "the studio did not answer on :$PORT (see /tmp/ss-verify-server.log)"
fi

say "the MCP handshake your Hermes will do"
# STUDIO_PORT is pinned to the port under test, so this exercises the studio on THIS copy rather than
# silently auto-starting a second one on the default port.
MCP_OUT="$(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
 | STUDIO_PORT="$PORT" node app/tools/studio-mcp.mjs 2>/dev/null)"
TOOLS="$(printf '%s' "$MCP_OUT" | node -e '
let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{
  for (const line of s.split("\n")) { if (!line.trim()) continue;
    try { const d = JSON.parse(line); if (d.id === 2) console.log((d.result.tools||[]).map((t)=>t.name).join(" ")); } catch {} }
});' 2>/dev/null)"
if [ -n "$TOOLS" ]; then
  ok "MCP server speaks the protocol"
  printf '  ok   tools: %s\n' "$TOOLS"
else
  bad "the MCP server did not answer tools/list"
fi

if [ "$STARTED" = 1 ] && [ -n "$SRV_PID" ]; then
  # End the process group that was started here, and nothing else.
  kill -TERM -"$SRV_PID" >/dev/null 2>&1 || kill -TERM "$SRV_PID" >/dev/null 2>&1 || true
  printf '\n  (the studio started for this check has been stopped again)\n'
fi

printf '\n'
if [ "$FAIL" = 0 ]; then
  printf '\033[32mAll checks passed.\033[0m  Open the studio:  cd app && npx tsx tools/studio-server.mts  →  http://127.0.0.1:%s\n' "$PORT"
  printf 'Then connect your agent:  hermes mcp add studio --command node --args %s/app/tools/studio-mcp.mjs\n' "$HERE"
else
  printf '\033[31mSomething above needs attention.\033[0m  ./install.sh is usually the answer.\n'
fi
exit "$FAIL"
