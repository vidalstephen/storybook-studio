/**
 * Which face is the measurement actually taken in?
 *
 * `document.fonts.check()` answers "available" for families that are not installed, and the
 * `font` shorthand silently drops a family list it cannot parse — so a boolean is not evidence,
 * and neither is a width comparison against a family that happens to be missing too. This prints
 * what the harness builds, then measures the same sentence in each face.
 *
 *   npx tsx tools/which-face.ts
 */
import { openMeasureSession, debugMeasurementHtml } from "../src/measure.js";
import { WARM_PARCHMENT as D } from "../src/tokens.js";

const html = debugMeasurementHtml();
console.log("  --- what the harness builds ---");
console.log("  html bytes           :", html.length);
console.log("  @font-face rules     :", (html.match(/@font-face/g) || []).length);
console.log("  data:font/woff2 URIs :", (html.match(/data:font\/woff2/g) || []).length);
const i = html.indexOf("@font-face");
console.log("  first rule           :", i >= 0 ? html.slice(i, i + 120) : "(NO @font-face AT ALL)");
console.log("  stylesheet head      :", html.slice(html.indexOf("<style>") + 7, html.indexOf("<style>") + 110).replace(/\s+/g, " "));

const s = await openMeasureSession({ widthPx: D.box.width_px_css, dsg: D, lang: "en" });
console.log("\n  --- what the page says ---");
console.log("  requested family :", s.fonts.requested_family);
console.log("  resolved family  :", s.fonts.resolved_family);
console.log("  body_face_loaded :", s.fonts.body_face_loaded);
console.log("  rendered_face    :", (s.fonts as unknown as { rendered_face?: string }).rendered_face ?? "(not reported)");
console.log(
  "  widths_px        :",
  JSON.stringify((s.fonts as unknown as { face_widths_px?: unknown }).face_widths_px ?? "(not reported)"),
);

// the same question asked a second way: the SAME sentence, once per face
console.log("\n  --- the same sentence, measured in each face ---");
const probe = "The young shepherd reached into his bag and chose a single smooth stone.";
for (const [label, fam] of [
  ["declared stack", D.typography.body.family],
  ["Lora only", "Lora"],
  ["Georgia", "Georgia"],
  ["an absent family", "__sb_no_such_face__"],
] as [string, string][]) {
  const m = await s.measureOne(probe, { id: "p", role: "prose", family: fam });
  console.log(`  ${label.padEnd(18)} ${String(m.lines).padStart(3)} line boxes`);
}

await s.close();
