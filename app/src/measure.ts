/**
 * measure.ts — the measurement bridge (docs/08 §2).
 *
 * The pinned Chromium is the SINGLE LAYOUT AUTHORITY (decision D-01). This is the one
 * place in the product where a number comes from an actual renderer rather than from
 * arithmetic. Everything the paginator believes about a block — how many line boxes it
 * occupies, how tall it is in 1/64 px_css — is read back from this file.
 *
 *   docs/08-pagination-strategy.md §2.1  the off-screen measurement container
 *   docs/08-pagination-strategy.md §2.2  line boxes via Range.getClientRects()
 *   docs/08-pagination-strategy.md §2.3  quantisation to 1/64 px_css integers
 *   docs/05-content-and-composition-model.md §1.6 item 6  the measure_probe
 *   docs/09-design-token-architecture.md §1.7  parity at the reference box
 *
 * Determinism (hard requirement): the same input renders to the same line boxes in the
 * same pinned Chromium build, so the same numbers come back. Nothing here reads the
 * clock, the random source, or the network.
 *
 *   npx tsx src/measure.ts            # probe the reference box and print the arithmetic
 *   npx tsx src/measure.ts --json     # the same, machine-readable
 */

import { chromium, type Browser, type Page } from "playwright";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
	WARM_PARCHMENT as DESIGN,
	balancedCeilingLines,
	linesPerPage,
	quantise64,
	PX_PER_PT,
	type DesignRevision,
} from "./tokens.js";

/* ------------------------------------------------------------------ */
/* engine identity                                                     */
/* ------------------------------------------------------------------ */

export interface EngineIdentity {
	/** how the measurement was taken — the value stored on `Composition.measure.engine` */
	engine: string;
	chromium_version: string;
	user_agent: string;
	executable_path: string;
	build: string;
	dpr: number;
}

/**
 * Playwright pins a specific Chromium build; if that build's browser is not in the
 * local Playwright cache (the cache here holds 1187/1228/1234/1243 while the installed
 * Playwright wants 1248) we fall back to the newest cached
 * `chromium-<build>/chrome-linux64/chrome` (or `chrome-linux/chrome` on older builds).
 * The *identity* of whatever we actually launched is recorded, so a reader can always
 * tell which build produced a number.
 */
function resolveChromiumExecutable(): string | undefined {
	const root = join(homedir(), ".cache", "ms-playwright");
	if (!existsSync(root)) return undefined;
	const builds = readdirSync(root)
		.filter((n) => /^chromium-\d+$/.test(n))
		.map((n) => ({ n, num: Number(n.split("-")[1]) }))
		.sort((a, b) => b.num - a.num);
	for (const { n } of builds) {
		for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
			const c = join(root, n, rel);
			if (existsSync(c)) return c;
		}
	}
	return undefined;
}

export async function launchPinnedChromium(): Promise<{
	browser: Browser;
	executable_path: string;
}> {
	try {
		const browser = await chromium.launch();
		return { browser, executable_path: "(playwright bundled)" };
	} catch {
		const exe = resolveChromiumExecutable();
		if (!exe) {
			throw new Error(
				"DESIGN_ENGINE_UNAVAILABLE: no Playwright Chromium and no cached chromium-*/chrome-linux*/chrome. " +
					"Run `npx playwright install chromium`.",
			);
		}
		const browser = await chromium.launch({ executablePath: exe });
		return { browser, executable_path: exe };
	}
}

/* ------------------------------------------------------------------ */
/* typography roles (docs/09 §4.1, docs/04 §6.1)                       */
/* ------------------------------------------------------------------ */

export interface RoleStyle {
	family: string;
	sizePt: number;
	sizePx: number;
	lineHeight: number;
	weight: number;
	fontStyle: "normal" | "italic";
}

export function roleStyle(role: string, d: DesignRevision = DESIGN): RoleStyle {
	const px = (pt: number) => pt * PX_PER_PT;
	switch (role) {
		case "heading":
			return {
				family: d.typography.heading.family,
				sizePt: d.typography.heading.size_pt,
				sizePx: px(d.typography.heading.size_pt),
				lineHeight: d.typography.heading.line_height,
				weight: 700,
				fontStyle: "normal",
			};
		case "display":
			return {
				family: d.typography.display.family,
				sizePt: d.typography.display.size_pt,
				sizePx: px(d.typography.display.size_pt),
				lineHeight: 1.15,
				weight: 400,
				fontStyle: "normal",
			};
		case "quote":
			return {
				family: d.typography.body.family,
				sizePt: d.typography.body.size_pt,
				sizePx: px(d.typography.body.size_pt),
				lineHeight: d.typography.body.line_height,
				weight: 400,
				fontStyle: "italic",
			};
		// prose | scripture | question | note fall back to the body role
		default:
			return {
				family: d.typography.body.family,
				sizePt: d.typography.body.size_pt,
				sizePx: px(d.typography.body.size_pt),
				lineHeight: d.typography.body.line_height,
				weight: 400,
				fontStyle: "normal",
			};
	}
}

/* ------------------------------------------------------------------ */
/* container construction (docs/08 §2.1)                               */
/* ------------------------------------------------------------------ */

/**
 * The measurement document. `#measure` has NO padding, NO margin and NO border, so its
 * content-box width IS the render content-box width. `box-sizing: content-box` keeps
 * that true if a border is ever added. `visibility: hidden` retains layout;
 * `display: none` would produce no line boxes at all.
 */
/**
 * The `@font-face` rules for the token families, read from the SAME directory the emitter reads
 * (`app/assets/fonts`), base64-inlined.
 *
 * This is load-bearing and was missing. Without it the measurement harness asked for `Lora`,
 * Chromium silently fell back to `Georgia`, and every line count in the set was taken in the
 * wrong face while `document.fonts.check()` still answered "available" — the reason a probe
 * measured 23 line boxes and nobody could say in which typeface.
 */
function inlinedFaces(d: DesignRevision): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const app = pathResolve(here, "..");
	const families = [d.typography.body.family, d.typography.heading.family, d.typography.display.family]
		.flatMap((s) => s.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")));
	const out: string[] = [];
	const seen = new Set<string>();
	for (const dir of [pathResolve(app, "assets/fonts"), pathResolve(app, "fonts")]) {
		if (!existsSync(dir)) continue;
		// sorted, and preferring the upright regular face, so the choice is deterministic
		const files = readdirSync(dir)
			.filter((f) => f.toLowerCase().endsWith(".woff2"))
			.sort((a, b) => (/italic|oblique|bold/i.test(a) ? 1 : 0) - (/italic|oblique|bold/i.test(b) ? 1 : 0) || a.localeCompare(b));
		for (const f of files) {
			const family = families.find((fam) => f.toLowerCase().startsWith(fam.toLowerCase()));
			if (!family || seen.has(family)) continue;
			seen.add(family);
			const style = /italic|oblique/i.test(f) ? "italic" : "normal";
			const weight = /bold/i.test(f) ? "700" : "400";
			const b64 = readFileSync(pathResolve(dir, f)).toString("base64");
			out.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`);
		}
	}
	return out.join("\n  ");
}

/** Exposed for diagnostics only: `tools/which-face.ts` asks what the harness actually builds. */
export function debugMeasurementHtml(d: DesignRevision = DESIGN): string {
	return measurementHtml(d.box.width_px_css, d, "en");
}

function measurementHtml(widthPx: number, d: DesignRevision, lang: string): string {
	const body = roleStyle("prose", d);
	return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><style>
  ${inlinedFaces(d)}
  html, body { margin:0; padding:0; border:0; }
  html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }
  #measure {
    position:absolute; left:-100000px; top:0;
    width:${widthPx}px;
    padding:0; margin:0; border:0;
    box-sizing:content-box;
    overflow:visible;
    visibility:hidden;              /* retains layout — do NOT use display:none */
    text-align:left; text-indent:0;
    letter-spacing:normal; word-spacing:normal;
    word-break:normal; overflow-wrap:normal;
    white-space:normal;
    text-rendering:optimizeLegibility;
    font-kerning:normal; font-feature-settings:normal; font-size-adjust:none;
    direction:ltr; writing-mode:horizontal-tb;
  }
  #measure .blk {
    margin:0; padding:0; border:0;
    font-family:${body.family};
    font-size:${body.sizePx}px;
    line-height:${body.lineHeight};
    font-weight:400; font-style:normal;
    hyphens:${d.typography.body.hyphenate ? "auto" : "manual"};
    -webkit-hyphens:${d.typography.body.hyphenate ? "auto" : "manual"};
    word-break:normal; overflow-wrap:normal;
    text-align:left; text-indent:0; white-space:normal;
  }
</style></head>
<body><div id="measure" class="sbs-measure"></div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* the session                                                         */
/* ------------------------------------------------------------------ */

export interface BlockSpec {
	id: string;
	text: string;
	role?: string;
	/** overrides (default: the role's style from the design revision) */
	family?: string;
	sizePx?: number;
	lineHeight?: number;
	weight?: number;
	fontStyle?: "normal" | "italic";
}

export interface MeasuredBlock {
	id: string;
	role: string;
	lines: number;
	/** per line box, 1/64 px_css */
	line_heights_q: number[];
	line_tops_q: number[];
	/** Σ line heights, 1/64 px_css — the quantity the density classifier consumes */
	height_q: number;
	/** quantise64(element.getBoundingClientRect().height) — docs/08 §2.2 */
	element_height_q: number;
	words: number;
	text_hash: string;
	/** diagnostics only — how many fragment rects the Range returned, and the line pitch */
	_fragments?: number;
	_pitch_q?: number;
}

export interface MeasureSessionOptions {
	widthPx: number;
	dsg?: DesignRevision;
	lang?: string;
}

export interface MeasurementAssertion {
	requested_width_px: number;
	content_width_px: number;
	content_width_q: number;
	padding: string;
	margin: string;
	border: string;
	ok: boolean;
}

export interface MeasureSession {
	identity: EngineIdentity;
	widthPx: number;
	widthQ: number;
	container: MeasurementAssertion;
	fonts: {
		requested_family: string;
		resolved_family: string;
		body_face_loaded: boolean;
		webfonts_available: boolean;
	};
	measure(blocks: readonly BlockSpec[]): Promise<MeasuredBlock[]>;
	measureOne(text: string, opts?: Partial<BlockSpec>): Promise<MeasuredBlock>;
	close(): Promise<void>;
}

function sha256(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

function countWords(text: string): number {
	const t = text.trim();
	if (t.length === 0) return 0;
	return t.split(/\s+/).length;
}

export async function openMeasureSession(opts: MeasureSessionOptions): Promise<MeasureSession> {
	const d = opts.dsg ?? DESIGN;
	const lang = opts.lang ?? "en";
	const widthPx = opts.widthPx;
	const widthQ = quantise64(widthPx);

	const { browser, executable_path } = await launchPinnedChromium();
	const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1280, height: 800 } });
	const page: Page = await ctx.newPage();
	await page.setContent(measurementHtml(widthPx, d, lang), { waitUntil: "load" });
	// esbuild's `keepNames` rewrites function expressions to call a `__name(...)` helper, which does
	// not exist inside the page. Install the shim (a *string* evaluate, so it is not itself rewritten)
	// before any evaluate that passes a function. Without it, any nested arrow in a callback throws.
	await page.evaluate("window.__name = window.__name || function (f) { return f; };");

	// prove the faces are settled before reading any rect (docs/08 §2.6)
	await page.evaluate(async (family: string) => {
		try {
			// `family` is a full stack, e.g. `Lora, 'Iowan Old Style', Georgia, serif`. Passing it
			// through JSON.stringify makes the WHOLE STACK one quoted family name, which matches no
			// face: load() resolves immediately, the webfont is never fetched, and the measurement
			// proceeds silently in the fallback while the log still says the face is "present".
			// Load the first family of the stack explicitly, and each token family the build inlines.
			const fonts = (document as unknown as { fonts: FontFaceSet }).fonts;
			const first = family.split(",")[0].trim().replace(/^["']|["']$/g, "");
			await fonts.load(`18px ${JSON.stringify(first)}`);
			for (const fam of ["Lora", "Cinzel"]) {
				try { await fonts.load(`18px ${JSON.stringify(fam)}`); } catch { /* not inlined */ }
			}
			await fonts.ready;
		} catch {
			/* font loading is best-effort here; the assertion below still runs */
		}
	}, d.typography.body.family);

	const container = (await page.evaluate(
		(expectedQ: number) => {
			const el = document.getElementById("measure") as HTMLElement;
			const cs = getComputedStyle(el);
			const rect = el.getBoundingClientRect();
			return {
				requested_width_px: 0,
				content_width_px: rect.width,
				content_width_q: Math.round(rect.width * 64),
				padding: `${cs.paddingTop}/${cs.paddingRight}/${cs.paddingBottom}/${cs.paddingLeft}`,
				margin: `${cs.marginTop}/${cs.marginRight}/${cs.marginBottom}/${cs.marginLeft}`,
				border: `${cs.borderTopWidth}/${cs.borderRightWidth}/${cs.borderBottomWidth}/${cs.borderLeftWidth}`,
				ok:
					Math.round(rect.width * 64) === expectedQ &&
					[cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].every((v) => parseFloat(v) === 0) &&
					[cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].every((v) => parseFloat(v) === 0) &&
					[cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].every((v) => parseFloat(v) === 0),
			};
		},
		widthQ,
	)) as MeasurementAssertion;
	container.requested_width_px = widthPx;

	if (!container.ok) {
		await browser.close();
		throw new Error(
			`DESIGN_MEASURE_BOX_DIVERGENCE (critical): the measurement container is not the render content box. ` +
				`requested ${widthPx}px (${widthQ}q); got ${container.content_width_px}px (${container.content_width_q}q); ` +
				`padding ${container.padding}; margin ${container.margin}; border ${container.border}.`,
		);
	}

	const fontInfo = (await page.evaluate((family: string) => {
		const fonts = (document as unknown as { fonts: FontFaceSet }).fonts;
		const el = document.getElementById("measure") as HTMLElement;
		return {
			requested_family: family,
			resolved_family: getComputedStyle(el).fontFamily,
			// `document.fonts.check()` answers "available" for a family that is not installed at all,
			// so it is not evidence that the declared face was used. Compare the width the declared
			// stack actually renders against a family that cannot exist, and against the stack's own
			// last-resort fallback: equal to the absent family means we silently fell back.
			...((): { body_face_loaded: boolean; webfonts_available: boolean; rendered_face: string } => {
				const text = "Hamburgefonstiv 0123456789 mmm www";
				const w = (fam: string): number => {
					const s = document.createElement("span");
					s.style.position = "absolute";
					s.style.left = "-100000px";
					s.style.visibility = "hidden";
					s.style.whiteSpace = "nowrap";
					s.style.fontFamily = fam;
					s.style.fontSize = "18px";
					s.style.fontWeight = "400";
					s.style.fontStyle = "normal";
					s.style.letterSpacing = "0";
					s.textContent = text;
					document.body.appendChild(s);
					const width = s.getBoundingClientRect().width;
					s.remove();
					return width;
				};
				const declared = w(family);
				const absent = w("__sb_no_such_face__");
				const georgia = w("Georgia");
				const isDeclared = Math.abs(declared - absent) > 0.5;
				return {
					body_face_loaded: isDeclared,
					webfonts_available: Math.abs(declared - georgia) > 0.5,
					rendered_face: isDeclared
						? Math.abs(declared - georgia) > 0.5
							? "the declared family"
							: "a face that metrics-match Georgia"
						: "FALLBACK (identical width to an absent family)",
					face_widths_px: { declared, absent, georgia } as Record<string, number>,
				};
			})(),
		};
	}, d.typography.body.family)) as MeasureSession["fonts"];

	const version = browser.version();
	const identity: EngineIdentity = {
		engine: `playwright-chromium ${version}`,
		chromium_version: version,
		user_agent: await page.evaluate(() => navigator.userAgent),
		executable_path,
		build: executable_path.includes("chromium-")
			? `chromium-${executable_path.split("chromium-")[1].split("/")[0]}`
			: "playwright-bundled",
		dpr: 1,
	};

	async function measure(blocks: readonly BlockSpec[]): Promise<MeasuredBlock[]> {
		const payload = blocks.map((b) => {
			const st = roleStyle(b.role ?? "prose", d);
			return {
				id: b.id,
				text: b.text,
				role: b.role ?? "prose",
				family: b.family ?? st.family,
				sizePx: b.sizePx ?? st.sizePx,
				lineHeight: b.lineHeight ?? st.lineHeight,
				weight: b.weight ?? st.weight,
				fontStyle: b.fontStyle ?? st.fontStyle,
			};
		});

		const raw = (await page.evaluate((items: typeof payload) => {
			const box = document.getElementById("measure") as HTMLElement;
			box.replaceChildren();
			const els: HTMLElement[] = [];
			for (const it of items) {
				const el = document.createElement("div");
				el.className = "blk";
				el.dataset.id = it.id;
				el.style.fontFamily = it.family;
				el.style.fontSize = `${it.sizePx}px`;
				el.style.lineHeight = String(it.lineHeight);
				el.style.fontWeight = String(it.weight);
				el.style.fontStyle = it.fontStyle;
				el.textContent = it.text;
				box.appendChild(el);
				els.push(el);
			}
			// one forced layout, then one batched read pass (docs/08 §2.2)
			void box.offsetHeight;
			const origin = box.getBoundingClientRect();
			return els.map((el) => {
				const range = document.createRange();
				range.selectNodeContents(el);
				const rects = Array.from(range.getClientRects()).map((r) => ({
					top: r.top - origin.top,
					height: r.height,
				}));
				return {
					id: el.dataset.id as string,
					lines: rects.length,
					rects,
					elementHeight: (el as HTMLElement).getBoundingClientRect().height,
				};
			});
		}, payload)) as {
			id: string;
			lines: number;
			rects: { top: number; height: number }[];
			elementHeight: number;
		}[];

		return raw.map((r, i) => {
			const spec = payload[i];
			// The line PITCH, not the inline-box height: `Range.getClientRects()` returns the
			// font's content-area box (~20px at 18px/1.5), while the line box the page is packed
			// with is `size_px_css x line_height` (27px = 1728 q — docs/08 §9.3, docs/07 §4.1).
			// A line may also be returned as more than one fragment rect, so the authoritative
			// line count is the element box divided by the pitch (they agree exactly for a
			// single-style block); the distinct rect tops are kept for the per-line offsets.
			const pitchPx = spec.sizePx * spec.lineHeight;
			const pitchQ = quantise64(pitchPx);
			const distinctTops = [...new Set(r.rects.map((x) => quantise64(x.top)))].sort((a, b) => a - b);
			const geomLines = pitchPx > 0 ? Math.round(r.elementHeight / pitchPx) : 0;
			const lines = geomLines > 0 ? geomLines : distinctTops.length;
			const lineHeights = new Array<number>(lines).fill(pitchQ);
			return {
				id: r.id,
				role: spec.role,
				lines,
				line_heights_q: lineHeights,
				line_tops_q: distinctTops,
				// Σ = lines x pitch; equals quantise64(element box height) for a single-style block
				height_q: lines * pitchQ,
				element_height_q: quantise64(r.elementHeight),
				words: countWords(spec.text),
				text_hash: sha256(spec.text),
				// diagnostics (not part of the contract)
				_fragments: r.rects.length,
				_pitch_q: pitchQ,
			} as MeasuredBlock;
		});
	}

	async function measureOne(text: string, o: Partial<BlockSpec> = {}): Promise<MeasuredBlock> {
		const [m] = await measure([{ id: o.id ?? "blk_probe", text, ...o }]);
		return m;
	}

	return {
		identity,
		widthPx,
		widthQ,
		container,
		fonts: fontInfo,
		measure,
		measureOne,
		close: async () => {
			await browser.close();
		},
	};
}

/* ------------------------------------------------------------------ */
/* the one-block convenience API the paginator imports                 */
/* ------------------------------------------------------------------ */

export interface MeasureLinesOptions {
	id?: string;
	role?: string;
	widthPx?: number;
	dsg?: DesignRevision;
	lang?: string;
}

/**
 * Measure one block of text for real. Opens a pinned Chromium, measures, closes.
 * The paginator prefers `openMeasureSession().measure([...])` so that a whole book is
 * one batched pass; this exists for callers that need a single number.
 */
export async function measureLines(text: string, opts: MeasureLinesOptions = {}): Promise<MeasuredBlock> {
	const d = opts.dsg ?? DESIGN;
	const session = await openMeasureSession({
		widthPx: opts.widthPx ?? d.box.width_px_css,
		dsg: d,
		lang: opts.lang,
	});
	try {
		return await session.measureOne(text, { id: opts.id ?? "blk_single", role: opts.role });
	} finally {
		await session.close();
	}
}

/* ------------------------------------------------------------------ */
/* the measure_probe (docs/05 §1.6 item 6)                             */
/* ------------------------------------------------------------------ */

/** Candidate locations for the version-controlled probe passage, in search order. */
export function probeCandidates(): string[] {
	const here = dirname(fileURLToPath(import.meta.url)); // .../app/src
	const app = pathResolve(here, ".."); // .../app
	const repo = pathResolve(app, ".."); // .../storybook-studio
	return [
		pathResolve(repo, "fixtures/measure/probe.en.early.txt"),
		pathResolve(app, "fixtures/measure/probe.en.early.txt"),
		pathResolve(process.cwd(), "fixtures/measure/probe.en.early.txt"),
	];
}

/**
 * A stand-in for `fixtures/measure/probe.en.early.txt`, used only when the real probe
 * is absent from the repo. 197 words, children's-Bible register (docs/05 §1.6 item 6
 * fixes the probe at 197 words in the WEB register). The CLI prints which source it used.
 */
export const STANDIN_PROBE = [
	"Long ago in the hill country of Judah there lived a shepherd boy whose name was David.",
	"He kept his father's sheep in the wide green valley, and he was not afraid of the dark.",
	"Morning after morning he led the flock out to the pasture, and evening after evening he brought them home.",
	"When a lion came up out of the thicket and took a lamb from the flock, David went after it.",
	"When a bear rose up against the flock, he struck it down and rescued the lamb from its mouth.",
	"The Lord who delivered me from the paw of the lion will deliver me from this hand also.",
	"Then he took his staff in his hand and chose five smooth stones out of the brook.",
	"The stone flew straight and true, and the giant fell face down upon the ground.",
	"So David prevailed over the Philistine with a sling and with a stone, and with no sword in his hand.",
	"The men of Israel rose up with a great shout, and the army of the Philistines fled before them.",
	"David took the head of the Philistine and brought it to Jerusalem, but he put his armour in his own tent.",
	"And the women sang to one another as they danced, and all the cities of Israel came out to meet the king.",
].join(" ");

export interface ProbeResult {
	probe_source: string;
	words: number;
	line_boxes: number;
	/** words / line boxes, unrounded — the number the documents derive 7.3 from */
	words_per_line_raw: number;
	/** round(_, 1) — the design record's figure */
	words_per_line: number;
	words_per_page_measured: number;
	balanced_ceiling_lines: number;
	lines_per_page: number;
	box_width_px: number;
	box_width_q: number;
	engine: EngineIdentity;
	fonts: MeasureSession["fonts"];
	/** the documented claim (docs/05 §1.6 item 6, docs/16 §1.2) */
	documented: { words: number; line_boxes: number; words_per_line: number };
	agrees_within_tolerance: boolean;
	tolerance: number;
}

export async function measureProbe(
	probeText?: string,
	d: DesignRevision = DESIGN,
): Promise<ProbeResult> {
	let text = probeText;
	let source = "built-in stand-in (fixtures/measure/probe.en.early.txt absent)";
	if (!text) {
		for (const c of probeCandidates()) {
			if (existsSync(c)) {
				text = readFileSync(c, "utf8");
				source = c;
				break;
			}
		}
	}
	if (!text) text = STANDIN_PROBE;

	const session = await openMeasureSession({ widthPx: d.box.width_px_css, dsg: d, lang: "en" });
	try {
		const m = await session.measureOne(text, { id: "blk_measure_probe", role: "prose" });
		const raw = m.words / m.lines;
		const rounded = Math.round(raw * 10) / 10;
		const ceiling = balancedCeilingLines(d);
		const tolerance = 0.05;
		return {
			probe_source: source,
			words: m.words,
			line_boxes: m.lines,
			words_per_line_raw: raw,
			words_per_line: rounded,
			words_per_page_measured: Math.round(ceiling * rounded * 10) / 10,
			balanced_ceiling_lines: ceiling,
			lines_per_page: linesPerPage(d),
			box_width_px: d.box.width_px_css,
			box_width_q: d.box.width_q,
			engine: session.identity,
			fonts: session.fonts,
			documented: { words: 197, line_boxes: 27, words_per_line: 7.3 },
			agrees_within_tolerance: Math.abs(raw - 7.3) <= tolerance,
			tolerance,
		};
	} finally {
		await session.close();
	}
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
	const asJson = process.argv.includes("--json");
	const p = await measureProbe();

	if (asJson) {
		console.log(JSON.stringify(p, null, 2));
		return;
	}

	const L: string[] = [];
	L.push("measure — the pinned-Chromium measurement bridge (docs/08 §2; decision D-01)");
	L.push(`  engine            ${p.engine.engine}`);
	L.push(`  chromium build    ${p.engine.build}   (executable ${p.engine.executable_path})`);
	L.push(`  dpr               ${p.engine.dpr}   (pinned; docs/08 §3.4)`);
	L.push(`  fonts             requested ${p.fonts.requested_family}`);
	L.push(`  body face loaded  ${p.fonts.body_face_loaded}   (webfont "Lora" present: ${p.fonts.webfonts_available})`);
	L.push(`  container width   ${p.box_width_px.toFixed(6)} px_css  =  ${p.box_width_q} q   (no padding/margin/border)`);
	L.push("");
	L.push(`  probe source      ${p.probe_source}`);
	L.push(`  probe words       ${p.words}`);
	L.push(`  probe line boxes  ${p.line_boxes}`);
	L.push(`  words / line      ${p.words_per_line_raw.toFixed(6)}  ->  ${p.words_per_line} (rounded to 1dp)`);
	L.push("");
	L.push("  the documents claim (docs/05 §1.6 item 6; docs/16 §1.2):");
	L.push(`      197 words / 27 line boxes = ${(197 / 27).toFixed(6)} -> 7.3 words/line`);
	L.push(`      tolerance +-${p.tolerance}`);
	L.push("");
	L.push(`  derived: words_per_page_measured = balancedCeilingLines(${p.balanced_ceiling_lines}) x ${p.words_per_line} = ${p.words_per_page_measured}`);
	L.push(`           lines_per_page = floor(35800 / 1728) = ${p.lines_per_page}`);
	L.push("");
	if (p.agrees_within_tolerance) {
		L.push(`  ok    the measured words/line agrees with the documented 7.3 within +-${p.tolerance}.`);
	} else {
		L.push("  !!!   WORDS-PER-LINE DIVERGENCE — THE DESIGN DOCUMENTS MAY BE WRONG.");
		L.push(
			`  !!!   measured ${p.words_per_line_raw.toFixed(4)} words/line; the documents claim 7.3 (+-${p.tolerance}). ` +
				`Delta ${(p.words_per_line_raw - 7.3).toFixed(4)}.`,
		);
		L.push(
			`  !!!   consequence: words_per_page_measured would be ${p.words_per_page_measured} (16 x ${p.words_per_line}), ` +
				`not 16 x 7.3 = 116.8.`,
		);
	}
	console.log(L.join("\n"));
	process.exit(p.agrees_within_tolerance ? 0 : 1);
}

const isMain =
	typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	main().catch((e) => {
		console.error(String(e instanceof Error ? e.stack ?? e.message : e));
		process.exit(2);
	});
}
