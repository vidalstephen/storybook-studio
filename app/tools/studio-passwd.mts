/**
 * studio-passwd — set or rotate the studio's access credential.
 *
 *     npx tsx tools/studio-passwd.mts --user studio          # prompts, hidden (what you want)
 *     npx tsx tools/studio-passwd.mts --pass 'some passcode' # non-interactive (a pipe, a script)
 *     npx tsx tools/studio-passwd.mts --show                 # what is set, never the secrets
 *     npx tsx tools/studio-passwd.mts --rotate-token         # the token local automation uses
 *
 * It writes `studio/access.json` (mode 600, gitignored, next to this repo's studio UI):
 *
 *     { user, salt, hash, kdf:{...}, token, updated }
 *
 * The **passcode is stored hashed** (scrypt) and the studio server verifies it in constant time, so
 * the file cannot be read back into a password. The **token** is a separate random secret in the
 * clear, for automation on this machine only — the studio's own MCP server and any local script use
 * it as `X-Studio-Token`, so no plaintext passcode has to be written into a config file.
 *
 * The server re-reads this file on every request (by mtime), so a rotation takes effect on the next
 * request: no restart, and no window in which the old passcode is still accepted after the write.
 */
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const FILE = join(APP, "studio", "access.json");

/** The parameters are recorded in the file so a future reader never has to guess them. */
const KDF = { name: "scrypt", n: 16384, r: 8, p: 1, keylen: 64 } as const;

export interface Access {
  user: string;
  salt: string;
  hash: string;
  kdf: typeof KDF;
  token: string;
  updated: string;
}

export function hashPasscode(pass: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(pass, salt, KDF.keylen, { N: KDF.n, r: KDF.r, p: KDF.p });
  return { salt, hash: hash.toString("hex") };
}

/** Constant time, and it never says which of the two it was that did not match. */
export function verifyPasscode(pass: string, a: Access): boolean {
  try {
    const want = Buffer.from(a.hash, "hex");
    const got = scryptSync(pass, a.salt, a.kdf?.keylen ?? KDF.keylen, {
      N: a.kdf?.n ?? KDF.n,
      r: a.kdf?.r ?? KDF.r,
      p: a.kdf?.p ?? KDF.p,
    });
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

export function readAccess(): Access | null {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Access;
  } catch {
    return null;
  }
}

function write(access: Access) {
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(access, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, FILE);
  chmodSync(FILE, 0o600);
}

function hidden(prompt: string): Promise<string> {
  return new Promise((done) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // No terminal (a pipe, a cron, an agent): take the line as given.
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (c: string) => (buf += c));
      stdin.on("end", () => done(buf.replace(/\r?\n$/, "")));
      return;
    }
    process.stderr.write(prompt);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (c: string) => {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(!!wasRaw);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          return done(buf);
        }
        if (ch === "\u0003") {
          process.stderr.write("\n");
          process.exit(130);           // Ctrl-C
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const val = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
  };
  const existing = readAccess();

  if (argv.includes("--show") || argv.includes("-s")) {
    if (!existing) {
      console.log(`no credential at ${FILE}`);
      console.log(`the studio is therefore not accessible off this machine. set one with:`);
      console.log(`  npx tsx tools/studio-passwd.mts --user studio`);
      process.exit(1);
    }
    console.log(`credential   ${FILE}  (mode 600, gitignored)`);
    console.log(`  user       ${existing.user}`);
    console.log(`  updated    ${existing.updated}`);
    console.log(`  passcode   scrypt n=${existing.kdf?.n} r=${existing.kdf?.r} p=${existing.kdf?.p} — stored hashed, cannot be read back`);
    console.log(`  token      ${existing.token ? `${existing.token.length} hex chars (local automation: X-Studio-Token)` : "none"}`);
    return;
  }

  if (argv.includes("--rotate-token")) {
    if (!existing) throw new Error(`no credential at ${FILE}; set a passcode first`);
    write({ ...existing, token: randomBytes(32).toString("hex"), updated: new Date().toISOString() });
    console.log(`rotated the local token in ${FILE}. Restart anything holding the old one (the studio MCP server reads it per call).`);
    return;
  }

  const user = val("--user") ?? existing?.user ?? "studio";
  let pass = val("--pass") ?? val("-p");
  if (!pass) {
    pass = await hidden(`passcode for "${user}": `);
    const again = await hidden(`again: `);
    if (pass !== again) throw new Error("the two passcodes differ; nothing was written");
  }
  if (!pass.trim()) throw new Error("an empty passcode would lock the studio; nothing was written");
  if (pass.length < 6) console.warn(`warning: ${pass.length} characters is short for a page on the public internet`);

  const { salt, hash } = hashPasscode(pass);
  write({
    user,
    salt,
    hash,
    kdf: KDF,
    token: existing?.token ?? randomBytes(32).toString("hex"),
    updated: new Date().toISOString(),
  });
  console.log(`${existsSync(FILE) ? "updated" : "created"} ${FILE}`);
  console.log(`  user       ${user}`);
  console.log(`  passcode   set (scrypt, hashed — not recoverable from this file)`);
  console.log(`  applies    on the next request; the server re-reads this file by mtime, no restart`);
}

const isMain = typeof process.argv[1] === "string" && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  });
}
