#!/usr/bin/env bash
#
# Storybook Studio — install.
#
#     ./install.sh
#
# Idempotent: it checks each step and only does what is missing, so running it again after a
# `git pull` is safe. It never overwrites a studio passcode you already set.
#
# What it does, in order:
#   1. Node 20+                     (the app is TypeScript, run through tsx — nothing to compile)
#   2. npm install in app/          (playwright + pdf-lib, and tsx itself)
#   3. Playwright's Chromium        (the solver measures every line in a real renderer)
#   4. A studio passcode            (scrypt hashed; created only if you do not have one)
#   5. Prints the one Hermes command to connect your agent.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32mok\033[0m   %s\n' "$*"; }
no()  { printf '  \033[31m!!\033[0m   %s\n' "$*"; }

say "1/5  Node"
if ! command -v node >/dev/null 2>&1; then
  no "node is not on PATH. Install Node 20 or newer (https://nodejs.org) and run this again."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  no "Node $(node -v) is too old. This needs 20 or newer."
  exit 1
fi
ok "node $(node -v)"

say "2/5  Dependencies"
if [ -d app/node_modules/playwright ]; then
  ok "already installed (delete app/node_modules to force a reinstall)"
else
  # tsx and typescript are dev dependencies, and they are what actually runs this app — so the
  # install must include dev dependencies. Never swap this for a production-only install.
  ( cd app && npm install --include=dev --no-audit --no-fund )
  ok "installed playwright + pdf-lib + tsx"
fi

say "3/5  Chromium for the solver"
if ( cd app && npx playwright install chromium 2>&1 | tail -3 ); then
  ok "playwright chromium present"
else
  no "could not install Chromium automatically. Try:  cd app && npx playwright install chromium"
  no "On a bare Linux box you may also need:  npx playwright install --with-deps chromium  (needs sudo)"
fi

say "4/5  The studio passcode"
if [ -f app/studio/access.json ]; then
  ok "a credential already exists — left alone"
  ( cd app && npx tsx tools/studio-passwd.mts --show ) || true
else
  # A random share-code. Only its scrypt hash is stored; the plaintext is printed exactly once
  # and is not recoverable afterwards, which is the point.
  PASS="$(node -e 'const a="abcdefghijkmnopqrstuvwxyz23456789";let s="";for(let i=0;i<4;i++){s+=a[Math.floor(Math.random()*a.length)]}console.log(s+"-"+a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)]+"-"+a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)]+a[Math.floor(Math.random()*a.length)])')"
  ( cd app && npx tsx tools/studio-passwd.mts --user studio --pass "$PASS" >/dev/null )
  ok "created app/studio/access.json (mode 600, gitignored)"
  printf '\n  \033[1mYour studio passcode: %s\033[0m\n' "$PASS"
  printf '  Write it down. It is stored hashed and cannot be read back; change it any time with\n'
  printf '  cd app && npx tsx tools/studio-passwd.mts --user studio\n'
fi

say "5/5  Connect your Hermes Agent"
MCP="$HERE/app/tools/studio-mcp.mjs"
printf '  Run this:\n\n'
printf '    \033[1mhermes mcp add studio --command node --args %s\033[0m\n\n' "$MCP"
printf '  Answer "yes" to enabling all 6 tools, then:\n\n'
printf '    hermes mcp list          # studio should be enabled\n'
printf '    hermes mcp test studio   # connects and lists its tools\n'
printf '    hermes config set mcp_servers.studio.timeout 300\n\n'
printf '  The tools appear in your NEXT session (/reload-mcp in an open one). Then just ask it for a book.\n'

printf '\n\033[1mDone.\033[0m  Check it end to end with:  ./verify.sh\n'
