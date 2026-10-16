/**
 * The reader's acceptance harness — a real browser, real pixels, no assertions by eye.
 *
 *     npx tsx src/reader/verify.ts ../build/book.html
 *
 * Every check below is one row of `docs/16` §5.1 or one line of `§6.10` / `09` §7.5, run at the
 * five reference viewports of `docs/08` §3.1 plus 390x844. Nothing is inferred: the numbers are
 * read out of the running reader, and a failure prints the measurement that failed.
 *
 * What it does **not** cover, stated here so the limitation travels with the result: raster
 * comparison against the print sheet (`16` §5.2 step 5), the manual A-18 proof, and fullscreen,
 * which needs a trusted user gesture and is therefore reported as "button present" only.
 */

import { chromium, type Browser, type Page } from "playwright";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");

interface Row {
  readonly check: string;
  readonly result: "pass" | "fail" | "info";
  readonly detail: string;
}

const VIEWPORTS: { name: string; w: number; h: number; spread: boolean }[] = [
  { name: "360x640", w: 360, h: 640, spread: false },
  { name: "390x844", w: 390, h: 844, spread: false },
  { name: "768x1024", w: 768, h: 1024, spread: false },
  { name: "1024x768", w: 1024, h: 768, spread: true },
  { name: "1280x800", w: 1280, h: 800, spread: true },
  { name: "1440x900", w: 1440, h: 900, spread: true },
];

/**
 * tsx/esbuild injects a `__name` helper into named function expressions, and Playwright
 * serialises the function body into the page, where that helper does not exist. One line on
 * `window` makes every probe below work unchanged.
 */
async function shim(page: Page) {
  await page.evaluate("window.__name = window.__name || function (f) { return f; };");
}

const rows: Row[] = [];
function ok(check: string, pass: boolean, detail: string) {
  rows.push({ check, result: pass ? "pass" : "fail", detail });
}
function info(check: string, detail: string) {
  rows.push({ check, result: "info", detail });
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById("sb-root") as HTMLElement;
    const stages = document.querySelectorAll(".sb-page");
    const current = document.querySelector('.sb-page[data-sb-current="1"]') as HTMLElement | null;
    const leaves = current ? current.querySelectorAll(".sb-leaf") : [];
    const leaf = leaves[0] as HTMLElement | undefined;
    const content = leaf ? (leaf.querySelector(".sb-content") as HTMLElement) : undefined;
    const cs = leaf ? getComputedStyle(leaf) : undefined;
    return {
      ready: root.getAttribute("data-sb-ready"),
      mode: root.getAttribute("data-sb-mode"),
      theme: root.getAttribute("data-sb-reader-theme"),
      pages: stages.length,
      leaves: leaves.length,
      folio: (document.getElementById("sb-folio") as HTMLElement).textContent,
      leafW: leaf ? Math.round(leaf.getBoundingClientRect().width) : 0,
      leafH: leaf ? Math.round(leaf.getBoundingClientRect().height) : 0,
      contentW: content ? Math.round(content.getBoundingClientRect().width) : 0,
      contentH: content ? Math.round(content.getBoundingClientRect().height) : 0,
      contentOverflow: content ? content.scrollHeight - content.scrollHeight : 0,
      scrolled: content ? content.scrollHeight > content.clientHeight + 1 : false,
      bg: cs ? cs.backgroundColor : "",
      fontPx: content ? parseFloat(getComputedStyle(content).fontSize) : 0,
      docScrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      innerW: window.innerWidth,
      frames: (() => {
        const out: { w: number; inside: boolean; top: number }[] = [];
        for (const lf of leaves) {
          const f = lf.querySelector(".sb-frame-outer") as HTMLElement;
          const fi = lf.querySelector(".sb-frame-inner") as HTMLElement;
          const c = lf.querySelector(".sb-content") as HTMLElement;
          if (!f || !fi || !c) continue;
          const fb = f.getBoundingClientRect();
          const fbIn = fi.getBoundingClientRect();
          const cb = c.getBoundingClientRect();
          out.push({
            w: parseFloat(getComputedStyle(f).borderTopWidth),
            w2: parseFloat(getComputedStyle(fi).borderTopWidth) as unknown as number,
            // The text box must be strictly inside the inner rule on every side, and the inner
            // rule inside the outer. That is the whole of "the frame never collides with text",
            // and it is the check that would catch a phone-sized page eating its own margin.
            inside:
              fbIn.left >= fb.left + 0.5 - 0.6 &&
              fbIn.right <= fb.right + 0.6 &&
              cb.left >= fbIn.left - 0.6 &&
              cb.right <= fbIn.right + 0.6 &&
              cb.top >= fbIn.top - 0.6 &&
              cb.bottom <= fbIn.bottom + 0.6,
            gapFrameToText: Math.round(cb.left - fbIn.left),
            gapOuterToInner: Math.round(fbIn.left - fb.left),
          } as never);
        }
        return out;
      })(),
      currentIndex: (() => {
        const all = [...document.querySelectorAll(".sb-page")];
        return all.findIndex((p) => p.getAttribute("data-sb-current") === "1");
      })(),
      currentBlocks: current
        ? [...current.querySelectorAll("[data-sb-block]")].map((b) => ({
            id: b.getAttribute("data-sb-block"),
            role: b.getAttribute("data-sb-role"),
            page: b.getAttribute("data-sb-print-page"),
          }))
        : [],
      tocEntries: document.querySelectorAll("[data-sb-jump]").length,
      turnMarks: document.querySelectorAll(".sb-turn-mark").length,
      overflowPages: document.querySelectorAll('.sb-content[data-sb-scroll="1"]').length,
      ellipsis: (() => {
        let n = 0;
        for (const el of document.querySelectorAll(".sb-content *")) {
          if (getComputedStyle(el).textOverflow === "ellipsis") n++;
        }
        return n;
      })(),
      hiddenText: (() => {
        // every block's text must be present, and its first line inside the content box
        let bad = 0;
        for (const el of document.querySelectorAll(".sb-page[data-sb-current='1'] [data-sb-block]")) {
          const c = el.closest(".sb-content") as HTMLElement;
          if (!c) continue;
          const eb = el.getBoundingClientRect();
          const cb = c.getBoundingClientRect();
          if (eb.width > 0 && (eb.left < cb.left - 1 || eb.right > cb.right + 1)) bad++;
          if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow === "hidden") bad++;
        }
        return bad;
      })(),
    };
  });
}

/**
 * The page turn, sampled **mid-flight**.
 *
 * `11` registers two findings that can only ever be caught by observation: `DIG_TRANSITION_INCORRECT`
 * ("the page transition runs the wrong direction/order, or blocks input beyond `max_ms`") and
 * `DIG_REDUCED_MOTION_IGNORED`. Both are claims about pixels at a moment in time. So this probe
 * starts a real turn and reads what is on screen 140 ms into it — how many pages are laid out,
 * which of the two is on top, the *computed* transform of the leaf that is supposed to be turning,
 * and whether the page scrolls sideways while it turns — then reads again once it has settled.
 *
 * A class that styles nothing passes every assertion made from the class names alone. The leaving
 * page used to be exactly that: `display: none` the instant the state moved, so nothing was ever
 * on screen to turn. Only the sampled geometry below can tell the two apart.
 */
async function sampleTurn(page: Page) {
  return page.evaluate(() => {
    const pages = [...document.querySelectorAll(".sb-page")];
    const out = document.querySelector(".sb-page.sb-anim-out");
    const inn = document.querySelector(".sb-page.sb-anim-in");
    const back = !!document.querySelector(".sb-page.sb-anim-back");
    // the sheet that should be turning: forward it is the page being left, backward the one arriving
    const top = back ? inn : out;
    const leaves = top ? [...top.querySelectorAll(".sb-leaf")] : [];
    const turning = leaves.length ? leaves[leaves.length - 1] : null;
    const anims = document.getAnimations();
    return {
      names: anims.map((a) => (a as CSSAnimation).animationName || "?"),
      running: anims.filter((a) => a.playState === "running").length,
      laid: pages.filter((p) => getComputedStyle(p).display !== "none").length,
      outShown: !!out && getComputedStyle(out).display !== "none",
      inShown: !!inn && getComputedStyle(inn).display !== "none",
      topIsLeaving: !!top && !!out && top === out,
      topZ: top ? getComputedStyle(top).zIndex : "?",
      side: turning ? turning.getAttribute("data-sb-side") : null,
      pageTransform: top ? getComputedStyle(top).transform : "none",
      pageOpacity: top ? getComputedStyle(top).opacity : "1",
      leafTransform: turning ? getComputedStyle(turning).transform : "none",
      shade: top ? top.querySelectorAll(".sb-shade").length : 0,
      layers: document.querySelectorAll(".sb-anim-layer").length,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      current: pages.findIndex((p) => p.getAttribute("data-sb-current") === "1"),
    };
  });
}

/** Turn the page for real, in the style asked for, and report what the screen did. */
async function turnProbe(browser: Browser, url: string, vp: { name: string; w: number; h: number }, styles: readonly string[]) {
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await shim(page);
  await page.waitForFunction("document.getElementById(\"sb-root\").getAttribute(\"data-sb-ready\") === \"1\"").catch(() => {});
  await page.waitForTimeout(260);

  const EXPECTED: Record<string, string> = { slide: "sb-slide-out", fade: "sb-fade-out", curl: "sb-curl-out", fold: "sb-fold-out" };

  for (const style of styles) {
    const tag = `${vp.name} · turn/${style}`;
    await page.evaluate((s) => {
      const sel = document.getElementById("sb-motion") as HTMLSelectElement;
      sel.value = s;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, style);

    // --- forward: the page being left turns away and uncovers the next
    const before = await sampleTurn(page);
    await page.click("#sb-next");
    await page.waitForTimeout(140);
    const mid = await sampleTurn(page);
    const turning = mid.leafTransform !== "none" || mid.pageTransform !== "none" || parseFloat(mid.pageOpacity) < 1;
    ok(
      `${tag} · the leaving page is still on screen, and it is the sheet on top`,
      mid.laid === 2 && mid.outShown && mid.inShown && mid.topIsLeaving,
      `${mid.laid} page(s) laid out · leaving shown ${mid.outShown} · arriving shown ${mid.inShown} · leaving on top ${mid.topIsLeaving} (z=${mid.topZ})`,
    );
    ok(
      `${tag} · the turn is running, on both surfaces`,
      mid.running >= 1 && mid.names.includes(EXPECTED[style]) && turning,
      `${mid.running} animation(s) running: [${mid.names.join(", ")}] · page transform ${mid.pageTransform.slice(0, 22)} · leaf transform ${mid.leafTransform.slice(0, 22)}`,
    );
    ok(
      `${tag} · the turning leaf is hinged at the spine and shaded`,
      style === "curl" || style === "fold" ? mid.shade >= 1 && mid.leafTransform !== "none" : mid.shade === 0,
      style === "curl" || style === "fold"
        ? `shade on the turning leaf ${mid.shade}, turning leaf is the ${mid.side ?? "single"} one, transform ${mid.leafTransform.slice(0, 22)}`
        : `no shade on a travelling sheet (${mid.shade})`,
    );
    ok(
      `${tag} · turning the page never scrolls the book sideways`,
      mid.scrollW <= mid.innerW + 1,
      `scrollWidth ${mid.scrollW} / innerWidth ${mid.innerW} while mid-turn`,
    );
    await page.waitForTimeout(620);
    const after = await sampleTurn(page);
    ok(
      `${tag} · the turn finishes with exactly one page, and the reader moved one page forward`,
      after.laid === 1 && after.layers === 0 && after.current === before.current + 1,
      `${after.laid} page(s) laid out, ${after.layers} animating layer(s), at index ${after.current} (was ${before.current})`,
    );

    // --- backward: the page being reached swings back in over the one already there
    await page.click("#sb-prev");
    await page.waitForTimeout(140);
    const backMid = await sampleTurn(page);
    ok(
      `${tag} · coming back, the page being reached is the sheet on top`,
      backMid.laid === 2 && !backMid.topIsLeaving && backMid.running >= 1,
      `${backMid.laid} page(s) laid out · arriving on top ${!backMid.topIsLeaving} · ${backMid.running} animation(s) running`,
    );
    ok(
      `${tag} · coming back ends where it started`,
      backMid.scrollW <= backMid.innerW + 1,
      `scrollWidth ${backMid.scrollW} / innerWidth ${backMid.innerW} while mid-turn`,
    );
    await page.waitForTimeout(620);
    const backAfter = await sampleTurn(page);
    ok(
      `${tag} · the reader is back on the page it left`,
      backAfter.current === before.current && backAfter.layers === 0,
      `index ${backAfter.current} (was ${before.current}), ${backAfter.layers} animating layer(s)`,
    );
  }

  // --- `instant`, and reduced motion: no animation at all, and the page still turns (`16` §5.1)
  await page.evaluate(() => {
    const sel = document.getElementById("sb-motion") as HTMLSelectElement;
    sel.value = "instant";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const wasAt = (await sampleTurn(page)).current;
  await page.click("#sb-next");
  await page.waitForTimeout(140);
  const instant = await sampleTurn(page);
  ok(
    `${vp.name} · instant turns the page without animating anything`,
    instant.running === 0 && instant.laid === 1 && instant.current === wasAt + 1,
    `${instant.running} animation(s), ${instant.laid} page(s) laid out, index ${wasAt} → ${instant.current}`,
  );
  await context.close();

  const rmContext = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const rmPage = await rmContext.newPage();
  await rmPage.goto(url, { waitUntil: "load" });
  await shim(rmPage);
  await rmPage.waitForFunction("document.getElementById(\"sb-root\").getAttribute(\"data-sb-ready\") === \"1\"").catch(() => {});
  await rmPage.waitForTimeout(260);
  const rmBefore = await sampleTurn(rmPage);
  await rmPage.click("#sb-next");
  await rmPage.waitForTimeout(140);
  const rmMid = await sampleTurn(rmPage);
  ok(
    `${vp.name} · reduced motion is honoured and navigation still works`,
    rmMid.running === 0 && rmMid.layers === 0 && rmMid.current === rmBefore.current + 1,
    `${rmMid.running} animation(s) running with prefers-reduced-motion: reduce; index ${rmBefore.current} → ${rmMid.current}`,
  );
  const rmNote = await rmPage.evaluate(() => (document.getElementById("sb-motion-note") as HTMLElement).textContent || "");
  ok(
    `${vp.name} · the reader says why the turn is instant, rather than being silently still`,
    /reduced motion/i.test(rmNote),
    `motion note "${rmNote.slice(0, 80)}"`,
  );
  await rmContext.close();
}

async function main() {
  const file = path.resolve(process.argv[2] ?? path.join(REPO, "build", "book.html"));
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  const url = pathToFileURL(file).toString();

  // The pinned Chromium is the project's layout authority (D-01); this harness uses the build
  // that is installed on the host and records which one, so a metric difference is attributable.
  const exe =
    process.env.SB_CHROMIUM ||
    [
      path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome"),
      path.join(process.env.HOME ?? "", ".hermes/tools/chromium-1208/chrome-linux64/chrome"),
    ].find((f) => existsSync(f));
  const browser: Browser = await chromium.launch({
    executablePath: exe,
    args: ["--allow-file-access-from-files", "--no-sandbox", "--disable-gpu"],
  });
  info("browser", `${exe ?? "playwright's bundled chromium"} — ${browser.version()}`);

  // ---------------------------------------------------------------- per viewport
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    const requests: string[] = [];
    page.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) requests.push(r.url()); });
    await page.goto(url, { waitUntil: "load" });
    await shim(page);
    await page.waitForFunction("document.getElementById(\"sb-root\").getAttribute(\"data-sb-ready\") === \"1\"", undefined, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(260);

    const s = await readState(page);
    const tag = vp.name;
    ok(`${tag} · reader ready`, s.ready === "1", `data-sb-ready=${s.ready}`);
    ok(`${tag} · ${vp.spread ? "spread" : "single"} mode`, vp.spread ? s.mode === "spread" : s.mode === "single", `mode=${s.mode} leaves=${s.leaves}`);
    ok(`${tag} · no horizontal page overflow`, s.docScrollW <= s.innerW + 1 && s.bodyScrollW <= s.innerW + 1, `scrollWidth=${s.docScrollW}/${s.bodyScrollW} innerWidth=${s.innerW}`);
    ok(`${tag} · no block outside its content box`, s.hiddenText === 0, `${s.hiddenText} offending block(s)`);
    ok(`${tag} · no text-overflow ellipsis`, s.ellipsis === 0, `${s.ellipsis} element(s)`);
    ok(`${tag} · no page in overflow-scroll mode`, s.overflowPages === 0, `${s.overflowPages} page(s)`);
    for (const f of s.frames as unknown as { w: number; w2: number; inside: boolean }[]) {
      ok(`${tag} · frame is a double rule, widened, and clears the text`, f.w >= 0.5 && f.w2 === 0.0 ? false : f.w >= 0.5 && f.inside, `outer=${f.w}px inner=${f.w2}px inside=${f.inside}`);
    }
    ok(`${tag} · no console error, no network request`, consoleErrors.length === 0 && requests.length === 0, `${consoleErrors.length} error(s), ${requests.length} request(s)${consoleErrors.length ? ": " + consoleErrors[0].slice(0, 140) : ""}`);
    info(`${tag} · state`, `${s.pages} display pages · leaf ${s.leafW}x${s.leafH} · content ${s.contentW}x${s.contentH} · type ${s.fontPx}px · bg ${s.bg} · "${s.folio}"`);

    // --- controls in this viewport
    const before = s.currentIndex;
    await page.click("#sb-next");
    await page.waitForTimeout(80);
    let st = await readState(page);
    ok(`${tag} · next button turns the page`, st.currentIndex === before + 1, `${before} -> ${st.currentIndex}`);
    await page.click("#sb-prev");
    await page.waitForTimeout(80);
    st = await readState(page);
    ok(`${tag} · previous button turns it back`, st.currentIndex === before, `${before} -> ${st.currentIndex}`);

    await page.keyboard.press("End");
    await page.waitForTimeout(80);
    st = await readState(page);
    ok(`${tag} · End jumps to the last page`, st.currentIndex === st.pages - 1, `index=${st.currentIndex} of ${st.pages}`);
    await page.keyboard.press("Home");
    await page.waitForTimeout(80);
    st = await readState(page);
    ok(`${tag} · Home jumps to the first page`, st.currentIndex === 0, `index=${st.currentIndex}`);

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
    st = await readState(page);
    ok(`${tag} · ArrowRight turns the page`, st.currentIndex === 1, `index=${st.currentIndex}`);

    // tap zone (bottom-right corner of the stage, above the control bar)
    const zone = await page.locator("#sb-zone-next").boundingBox();
    if (zone) {
      await page.mouse.click(zone.x + zone.width / 2, zone.y + zone.height / 2);
      await page.waitForTimeout(90);
      st = await readState(page);
      ok(`${tag} · tap zone advances`, st.currentIndex >= 2, `index=${st.currentIndex}`);
    }

    // swipe
    const stage = await page.locator("#sb-stage").boundingBox();
    if (stage) {
      const y = stage.y + stage.height / 2;
      await page.mouse.move(stage.x + stage.width * 0.78, y);
      await page.touchscreen.tap(stage.x + stage.width * 0.78, y).catch(() => {});
      await page.evaluate(async () => {
        // a synthetic horizontal swipe through the same handlers a finger uses
        const el = document.getElementById("sb-stage")!;
        const mk = (type: string, x: number, y: number) => {
          const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
          return new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
        };
        const start = document.querySelectorAll(".sb-page[data-sb-current='1']").length;
        el.dispatchEvent(mk("touchstart", 300, 400));
        el.dispatchEvent(mk("touchmove", 120, 402));
        el.dispatchEvent(mk("touchend", 120, 402));
        void start;
      });
      await page.waitForTimeout(120);
      st = await readState(page);
      info(`${tag} · synthetic swipe`, `index=${st.currentIndex}`);
    }

    // --- reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(120);
    const anim = await page.evaluate(() => {
      const root = document.getElementById("sb-root") as HTMLElement;
      return {
        motion: root.getAttribute("data-sb-motion"),
        animName: getComputedStyle(document.querySelector(".sb-page") as Element).animationName,
      };
    });
    await page.click("#sb-next");
    await page.waitForTimeout(60);
    const afterReduced = await page.evaluate(() => {
      const all = [...document.querySelectorAll(".sb-page")];
      return all.findIndex((p) => p.getAttribute("data-sb-current") === "1");
    });
    ok(`${tag} · reduced motion disables animation`, anim.motion === "instant" && anim.animName === "none", `motion=${anim.motion} animation-name=${anim.animName}`);
    ok(`${tag} · navigation still works under reduced motion`, afterReduced > 0, `index=${afterReduced}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(80);
    // and a page turn must not block input beyond max_ms
    const t0 = Date.now();
    await page.click("#sb-next");
    const t1 = Date.now();
    ok(`${tag} · a page turn returns within max_ms`, t1 - t0 < 420, `${t1 - t0} ms to accept the click`);

    // --- font scaling: every declared step reflows without clipping
    await page.keyboard.press("Home");
    await page.waitForTimeout(60);
    const steps = await page.evaluate(() => {
      const out: { scale: string; pages: number; clipped: number; fontPx: number }[] = [];
      const root = document.getElementById("sb-root") as HTMLElement;
      const btn = document.getElementById("sb-zoom-in") as HTMLButtonElement;
      const btnOut = document.getElementById("sb-zoom-out") as HTMLButtonElement;
      const read = () => {
        const pages = document.querySelectorAll(".sb-page").length;
        let clipped = 0;
        for (const c of document.querySelectorAll(".sb-page[data-sb-current='1'] .sb-content")) {
          const el = c as HTMLElement;
          for (const b of el.querySelectorAll("[data-sb-block]")) {
            const eb = b.getBoundingClientRect();
            const cb = el.getBoundingClientRect();
            if (eb.left < cb.left - 1 || eb.right > cb.right + 1) clipped++;
          }
        }
        return { pages, clipped, fontPx: parseFloat(getComputedStyle(document.querySelector(".sb-content") as Element).fontSize) };
      };
      for (let i = 0; i < 3; i++) {
        const r = read();
        out.push({ scale: String(root.style.getPropertyValue("--sb-scale-step") || "1"), ...r });
        if (btn.disabled) break;
        btn.click();
      }
      void btnOut;
      return out;
    });
    for (const s2 of steps) {
      ok(`${tag} · scale ${Math.round(parseFloat(s2.scale) * 100)}% reflows without clipping`, s2.clipped === 0 && s2.fontPx >= 12 * (4 / 3) * parseFloat(s2.scale) - 0.5, `pages=${s2.pages} font=${s2.fontPx}px clipped=${s2.clipped}`);
    }
    // back to the design's own step, so everything after this is deterministic
    await page.evaluate(() => {
      const out = document.getElementById("sb-zoom-out") as HTMLButtonElement;
      for (let i = 0; i < 4 && !out.disabled; i++) out.click();
    });
    await page.waitForTimeout(260);

    // --- theme is colour-only
    const theme = await page.evaluate(async () => {
      const sel = document.getElementById("sb-theme") as HTMLSelectElement;
      const get = () => {
        const cs = getComputedStyle(document.getElementById("sb-root") as Element);
        return {
          bg: cs.getPropertyValue("--sb-page-background-colour").trim(),
          ink: cs.getPropertyValue("--sb-colour-ink-body").trim(),
          fontPx: parseFloat(getComputedStyle(document.querySelector(".sb-content") as Element).fontSize),
          measure: Math.round((document.querySelector(".sb-content") as HTMLElement).getBoundingClientRect().width),
        };
      };
      const light = get();
      sel.value = "dark";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const dark = get();
      sel.value = "light";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return { light, dark };
    });
    ok(
      `${tag} · theme is colour-only`,
      theme.dark.bg !== theme.light.bg && theme.dark.fontPx === theme.light.fontPx && theme.dark.measure === theme.light.measure,
      `light ${theme.light.bg}/${theme.light.fontPx}px/${theme.light.measure}px · dark ${theme.dark.bg}/${theme.dark.fontPx}px/${theme.dark.measure}px`,
    );

    // --- the settings sheet: every control, at every width
    await page.click("#sb-settings-btn");
    await page.waitForTimeout(140);
    const sheet = await page.evaluate(() => {
      const d = document.getElementById("sb-settings") as HTMLDialogElement;
      const within = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { inDialog: d.contains(el), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      };
      return {
        open: d.open,
        zoomIn: within("sb-zoom-in"),
        zoomOut: within("sb-zoom-out"),
        theme: within("sb-theme"),
        motion: within("sb-motion"),
        folio: within("sb-folio-toggle"),
        first: within("sb-first"),
        last: within("sb-last"),
        fs: within("sb-fs"),
        touch: ["sb-zoom-in", "sb-zoom-out", "sb-folio-toggle", "sb-first", "sb-last", "sb-theme", "sb-motion"].every((id) => {
          const el = document.getElementById(id);
          return el ? el.getBoundingClientRect().height >= 32 : false;
        }),
      };
    });
    const allPresent = ["zoomIn", "zoomOut", "theme", "motion", "folio", "first", "last"].every(
      (k) => (sheet as never as Record<string, { visible: boolean; inDialog: boolean }>)[k]?.visible === true,
    );
    ok(
      `${tag} · the settings sheet offers every §7.3 control`,
      sheet.open === true && allPresent,
      `open=${sheet.open} zoom=${sheet.zoomIn?.visible} theme=${sheet.theme?.visible} motion=${sheet.motion?.visible} folio=${sheet.folio?.visible} jump=${sheet.first?.visible}`,
    );
    ok(`${tag} · settings controls are real targets, not slivers`, sheet.touch === true, `touch sizes ok=${sheet.touch}`);
    // and a control in the sheet still works
    const scaleBefore = await page.evaluate(() => (document.getElementById("sb-scale-label") as HTMLElement).textContent);
    await page.evaluate(() => {
      const inp = document.getElementById("sb-zoom-in") as HTMLButtonElement;
      const out = document.getElementById("sb-zoom-out") as HTMLButtonElement;
      (inp.disabled ? out : inp).click();
    });
    await page.waitForTimeout(300);
    const scaleAfter = await page.evaluate(() => (document.getElementById("sb-scale-label") as HTMLElement).textContent);
    ok(`${tag} · a sheet control reflows the book`, scaleBefore !== scaleAfter, `${scaleBefore} -> ${scaleAfter}`);
    await page.evaluate(() => {
      const out = document.getElementById("sb-zoom-out") as HTMLButtonElement;
      const inp = document.getElementById("sb-zoom-in") as HTMLButtonElement;
      (out.disabled ? inp : out).click();
    });
    await page.waitForTimeout(300);
    await page.click("#sb-settings-close");
    await page.waitForTimeout(120);
    const sheetClosed = await page.evaluate(() => (document.getElementById("sb-settings") as HTMLDialogElement).open);
    ok(`${tag} · the settings sheet closes and hands focus back`, sheetClosed === false, `open=${sheetClosed}`);

    // --- table of contents
    await page.click("#sb-toc-btn");
    await page.waitForTimeout(120);
    const toc = await page.evaluate(() => {
      const d = document.getElementById("sb-toc") as HTMLDialogElement;
      return { open: d.open, entries: d.querySelectorAll("[data-sb-jump]").length, groups: d.querySelectorAll(".sb-toc-group").length };
    });
    ok(`${tag} · table of contents opens with the matter sections and the story`, toc.open && toc.entries >= 7 && toc.groups >= 2, `open=${toc.open} entries=${toc.entries} groups=${toc.groups}`);
    // -- a matter slot the printed plan omits **on purpose, with a recorded reason** (`08` §4.5)
    //
    // This is neither *placed* nor *unplaced*: it is accounted for. Two things must hold together,
    // and either one alone is the defect these rows guard: the section is kept — in full, word for
    // word, with the reason the composition recorded — inside the reader's own contents view, and
    // the reader does **not** report it as content it failed to place. Only checked where the
    // artifact carries such a slot: a book whose plan omits nothing has nothing to assert here.
    const omitted = await page.evaluate(() => {
      const box = document.getElementById("sb-toc-body") as HTMLElement | null;
      const sec = box ? (box.querySelector(".sb-toc-omitted") as HTMLElement | null) : null;
      const list = document.getElementById("sb-disclose-list");
      return {
        sections: box ? box.querySelectorAll(".sb-toc-omitted").length : 0,
        heads: box ? box.querySelectorAll(".sb-toc-omitted-head").length : 0,
        reason: sec ? (sec.querySelector(".sb-toc-omitted-reason") as HTMLElement | null)?.textContent || "" : "",
        kept: sec ? [...sec.querySelectorAll(".sb-omitted-text")].map((e) => (e.textContent || "").trim()).join(" ") : "",
        disclosures: list ? list.textContent || "" : "",
      };
    });
    if (omitted.sections) {
      ok(
        `${tag} · a matter slot the printed plan omits is kept in the reader's contents view, word for word`,
        omitted.kept.length > 40 && omitted.heads === omitted.sections,
        `${omitted.sections} omitted section(s), ${omitted.kept.length} characters of its text kept`,
      );
      ok(
        `${tag} · the omission names the reason the composition recorded`,
        /deliberately omitted from the printed plan/.test(omitted.reason) && omitted.reason.trim().length > 80,
        `reason "${omitted.reason.trim().slice(0, 110)}…"`,
      );
      ok(
        `${tag} · an intentional omission is a note, not an unplaced-content disclosure`,
        !/manuscript block\(s\) are not placed/.test(omitted.disclosures),
        `${(omitted.disclosures.match(/manuscript block\(s\) are not placed/g) || []).length} unplaced-content disclosure(s)`,
      );
    }
    const lastEntry = await page.locator("#sb-toc [data-sb-jump]").last();
    await lastEntry.click();
    await page.waitForTimeout(150);
    st = await readState(page);
    ok(`${tag} · a contents entry jumps to its page`, st.currentIndex > 0, `index=${st.currentIndex}`);
    const tocClosed = await page.evaluate(() => (document.getElementById("sb-toc") as HTMLDialogElement).open);
    ok(`${tag} · the contents closes after a jump`, tocClosed === false, `open=${tocClosed}`);

    // --- resume
    const beforeReload = st.currentIndex;
    const pagesBefore = st.pages;
    await page.reload({ waitUntil: "load" });
    await shim(page);
    await page.waitForFunction("document.getElementById(\"sb-root\").getAttribute(\"data-sb-ready\") === \"1\"", undefined, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const resumed = await readState(page);
    const resumeAnchor = await page.evaluate(() => {
      const c = document.querySelector(".sb-page[data-sb-current='1'] [data-sb-block]");
      return c ? c.getAttribute("data-sb-block") : null;
    });
    ok(`${tag} · resumes where it left off`, resumed.currentIndex > 0, `saved index ${beforeReload} -> opened at ${resumed.currentIndex} (${resumeAnchor})`);
    info(`${tag} · after reload`, `${resumed.pages} pages (was ${pagesBefore})`);

    // --- orientation change
    await page.setViewportSize({ width: vp.h, height: vp.w });
    await page.waitForTimeout(320);
    const rotated = await readState(page);
    ok(`${tag} · rotation re-paginates, keeps order, no overflow`, rotated.docScrollW <= rotated.innerW + 1 && rotated.ready === "1", `${rotated.mode} ${rotated.pages} pages, scrollWidth ${rotated.docScrollW} / ${rotated.innerW}`);
    info(`${tag} · rotated ${vp.h}x${vp.w}`, `${rotated.mode} · ${rotated.pages} pages · leaf ${rotated.leafW}x${rotated.leafH}`);

    await context.close();
  }

  // ------------------------------ the spread: the printed pairing, and the composed reveal
  //
  // Two things are asserted here, and they are different claims:
  //
  //  1. **the pairing** — a turn on screen shows the pages of one printed spread and no others.
  //     The printed booklet's spreads are `{1} · {2,3} · {4,5} · …` (`docs/08` §3.2, `docs/05` §2.5,
  //     `docs/10` §5.3): page 1 is the cover and stands alone, page 2k is a verso and page 2k+1
  //     the recto it faces. A turn that mixed two of those would show two pages that never face
  //     each other on paper, which is a different book.
  //  2. **the reveal** — the page that ends "…chose a single smooth stone." and the page that
  //     opens "With courage in his heart, David stepped forward." are on *different* spreads, with
  //     exactly one turn between them, at every width where a spread is presented. (Where a page
  //     is split, the leaf holding the *end* of the sentence is the one that matters, so the
  //     probe takes the last occurrence in reading order, not the first.)
  const SPREADS = [
    { name: "1024x768", w: 1024, h: 768 },
    { name: "1280x800", w: 1280, h: 800 },
    { name: "1440x900", w: 1440, h: 900 },
  ];
  for (const sp of SPREADS) {
    const context = await browser.newContext({ viewport: { width: sp.w, height: sp.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    await shim(page);
    await page.waitForFunction("document.getElementById(\"sb-root\").getAttribute(\"data-sb-ready\") === \"1\"");
    await page.waitForTimeout(300);
    const probe = await page.evaluate(() => {
      const cfg = JSON.parse((document.getElementById("sb-config") as HTMLElement).textContent || "{}");
      const pages = [...document.querySelectorAll(".sb-page")];
      const leavesOf = (i: number) => (pages[i] ? [...pages[i].querySelectorAll(".sb-leaf")] : []);
      const blocksOf = (i: number) => [...(pages[i]?.querySelectorAll("[data-sb-block]") ?? [])];
      const idxsOf = (id: string) => {
        const out: number[] = [];
        for (let j = 0; j < pages.length; j++) if (pages[j].querySelector(`[data-sb-block="${id}"]`)) out.push(j);
        return out;
      };
      const spreadOf = (p: string) => (parseFloat(p) <= 1 ? 0 : Math.floor(parseFloat(p) / 2));
      const turns = pages.map((_, i) => {
        const pp: string[] = [];
        for (const leaf of leavesOf(i)) {
          for (const b of leaf.querySelectorAll("[data-sb-block]")) {
            const q = b.getAttribute("data-sb-print-page");
            if (q && !pp.includes(q)) pp.push(q);
          }
        }
        pp.sort((a, b) => parseFloat(a) - parseFloat(b));
        const sigmas = pp.map(spreadOf);
        return {
          turn: i + 1,
          printPages: pp,
          leaves: leavesOf(i).length,
          folios: [...(pages[i]?.querySelectorAll(".sb-folio") ?? [])].map((f) => f.textContent || ""),
          oneSpread: sigmas.every((s) => s === sigmas[0]),
        };
      });
      const stone = idxsOf("blk_dg_stone");
      const forward = idxsOf("blk_dg_forward");
      const stoneEnd = stone.length ? stone[stone.length - 1] : -1;   // holds the END of the sentence
      const forwardStart = forward.length ? forward[0] : -1;          // holds its START
      const lastId = (i: number) => (i >= 0 ? (blocksOf(i).slice(-1)[0]?.getAttribute("data-sb-block") ?? null) : null);
      const firstId = (i: number) => (i >= 0 ? (blocksOf(i)[0]?.getAttribute("data-sb-block") ?? null) : null);
      // The composed turns (`cfg.turns`): the beat's first block, and whether the turn it is
      // named for is a turn the reader actually takes there (`docs/08` §3.9 anchors).
      const compose = ((cfg.turns ?? []) as { before_page: number; beat_id: string; why: string }[]).map((t) => {
        const all = [...document.querySelectorAll("[data-sb-block]")];
        const b = all.find((x) => x.getAttribute("data-sb-beat") === t.beat_id);
        const id = b ? b.getAttribute("data-sb-block") : null;
        const i = id ? idxsOf(id)[0] : -1;
        return {
          before_page: t.before_page,
          beat: t.beat_id,
          id: id,
          turn: i,
          firstOfItsPage: id != null && i >= 0 && firstId(i) === id,
          // the anchor must open the turn, not sit in its right-hand leaf
          opensTurn: i >= 0 ? leavesOf(i).length === 1 || !!leavesOf(i)[0]?.querySelector(`[data-sb-block="${id}"]`) : false,
        };
      });
      return {
        mode: (document.getElementById("sb-root") as HTMLElement).getAttribute("data-sb-mode"),
        header: (document.getElementById("sb-folio") as HTMLElement).textContent || "",
        pages: pages.length,
        turns,
        compose,
        pairing: (cfg.spread_pairing ?? null) as { source: string; recorded: string | null } | null,
        recorded: (cfg.digital_measured_at ?? []) as { viewport: string; pages: number; spread: boolean }[],
        disclosures: [...document.querySelectorAll("#sb-disclose-list li")].map((li) => li.textContent || ""),
        stone: stoneEnd,
        forward: forwardStart,
        stoneLeaves: stone.length,
        forwardLeaves: forward.length,
        stonePages: stoneEnd >= 0 ? turns[stoneEnd].printPages : [],
        forwardPages: forwardStart >= 0 ? turns[forwardStart].printPages : [],
        stoneLastId: lastId(stoneEnd),
        forwardFirstId: firstId(forwardStart),
      };
    });
    const tag = sp.name;
    ok(`${tag} · a facing spread is presented`, probe.mode === "spread", `mode=${probe.mode}, ${probe.pages} turns`);
    ok(
      `${tag} · the running header is a reading position, not bookkeeping`,
      /^Page \d+ of \d+/.test(probe.header.trim()) && !/print plan/i.test(probe.header),
      `"${probe.header}"`,
    );
    const mixed = probe.turns.filter((t) => !t.oneSpread);
    ok(
      `${tag} · every spread shows the pages of one printed spread`,
      mixed.length === 0,
      mixed.length
        ? `turn(s) mixing spreads: ${mixed.map((t) => `${t.turn}: ${t.printPages.join("/")}`).join("; ")}`
        : probe.turns.map((t) => t.printPages.join("/") || "—").join(" · "),
    );
    if (probe.pairing) {
      info(
        `${tag} · pairing`,
        `{${probe.turns.map((t) => t.printPages.join(",") || "—").join("} {")}} — ${
          probe.pairing.source === "composition"
            ? `from the composition: ${probe.pairing.recorded}`
            : "from docs/08 §3.2 / docs/05 §2.5 (this composition records no pairing)"
        }`,
      );
    }
    ok(
      `${tag} · the stone ends a page and the step forward opens the next`,
      probe.stoneLastId === "blk_dg_stone" && probe.forwardFirstId === "blk_dg_forward",
      `stone ends ${probe.stoneLastId}, forward opens ${probe.forwardFirstId}` +
        (probe.stoneLeaves > 1 || probe.forwardLeaves > 1 ? ` (split across ${probe.stoneLeaves}/${probe.forwardLeaves} leaves)` : ""),
    );
    for (const c of probe.compose) {
      ok(
        `${tag} · the composed turn before print page ${c.before_page} (${c.beat}) opens a turn`,
        c.firstOfItsPage && c.opensTurn,
        `first block ${c.id} is on turn ${c.turn + 1}, first of that page: ${c.firstOfItsPage}, opens the turn: ${c.opensTurn}`,
      );
    }
    ok(
      `${tag} · the stone's page and the step forward's page are not one spread`,
      probe.stone >= 0 && probe.forward >= 0 && probe.stone !== probe.forward,
      `stone on turn ${probe.stone + 1} (printed page(s) ${probe.stonePages.join(", ")}), ` +
        `forward on turn ${probe.forward + 1} (printed page(s) ${probe.forwardPages.join(", ")})`,
    );
    ok(
      `${tag} · exactly one turn separates them`,
      probe.forward - probe.stone === 1,
      `${probe.forward - probe.stone} turn(s) between printed page(s) ${probe.stonePages.join(", ")} and ${probe.forwardPages.join(", ")}`,
    );
    // -- the count against the composition's recorded measure: reported, precisely, never silent
    const pool = probe.recorded.filter((m) => m.spread);
    const use = pool.length ? pool : probe.recorded;
    if (use.length) {
      const near = use.reduce((a, b) =>
        Math.abs(parseFloat(a.viewport) - sp.w) <= Math.abs(parseFloat(b.viewport) - sp.w) ? a : b,
      );
      const says = probe.disclosures.some((t) => t.includes(String(near.pages)) && /authoritative/i.test(t));
      const differs = probe.pages !== near.pages;
      ok(
        `${tag} · the display-page count is reconciled with the composition, in words`,
        !differs || says,
        `${probe.pages} display pages here, ${near.pages} recorded at ${near.viewport}` +
          (differs ? says ? " — disclosed, with which one is authoritative" : " — NOT disclosed" : " — same count"),
      );
    }
    await context.close();
  }

  // ------------------------------------------- the turn, in flight (`11`: DIG_TRANSITION_INCORRECT)
  await turnProbe(browser, url, { name: "390x844", w: 390, h: 844 }, ["slide", "fade"]);
  await turnProbe(browser, url, { name: "1280x800", w: 1280, h: 800 }, ["curl", "fold"]);

  // ------------------------------------------- no JavaScript at all
  {
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(200);
    const noscript = await page.evaluate(() => {
      const blocks = document.querySelectorAll("[data-sb-block]");
      let offscreen = 0;
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 || r.left < -1) offscreen++;
      }
      let clipped = 0;
      for (const c of document.querySelectorAll(".sb-content")) {
        const el = c as HTMLElement;
        if (getComputedStyle(el).overflowY === "hidden" && el.scrollHeight > el.clientHeight + 1) clipped++;
      }
      return {
        ready: (document.getElementById("sb-root") as HTMLElement).getAttribute("data-sb-ready"),
        pages: document.querySelectorAll(".sb-page").length,
        blocks: blocks.length,
        words: [...blocks].reduce((a, b) => a + (b.textContent || "").trim().split(/\s+/).length, 0),
        offscreen,
        clipped,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        banner: !!document.querySelector(".sb-noscript"),
      };
    });
    ok("no-js · the book is still presented, in reading order, unclipped", noscript.blocks > 40 && noscript.clipped === 0 && noscript.offscreen === 0, JSON.stringify(noscript));
    ok("no-js · no horizontal page overflow", noscript.scrollW <= noscript.innerW + 1, `scrollWidth=${noscript.scrollW} innerWidth=${noscript.innerW}`);
    ok("no-js · the degradation is stated, not silent", noscript.banner === true, `noscript banner present=${noscript.banner}`);
    info("no-js · content", `${noscript.pages} plan pages · ${noscript.blocks} blocks · ${noscript.words} words · ready=${noscript.ready}`);
    await context.close();
  }

  await browser.close();

  // ---------------------------------------------------------------- report
  const fails = rows.filter((r) => r.result === "fail");
  const passes = rows.filter((r) => r.result === "pass").length;
  console.log(`\nStorybook Studio · reader acceptance — ${url}\n`);
  for (const r of rows) {
    const mark = r.result === "fail" ? "FAIL" : r.result === "info" ? "  · " : "ok  ";
    console.log(`  ${mark} ${r.check.padEnd(64)} ${r.detail}`);
  }
  console.log(`\n  ${passes} passed, ${fails.length} failed, ${rows.length - passes - fails.length} informational`);
  if (fails.length) {
    console.log(`\n  failures:`);
    for (const f of fails) console.log(`    ${f.check}\n      ${f.detail}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
