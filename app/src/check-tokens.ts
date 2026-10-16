/**
 * Execute the design revision's own arithmetic and compare it with the design documents.
 * Non-zero exit if the build and the design disagree.
 *
 *   npx tsx src/check-tokens.ts
 */
import { WARM_PARCHMENT as D, selfCheck, formatChecks, linesPerPage, balancedCeilingLines } from "./tokens.js";

const checks = selfCheck(D, { words: 197, lineBoxes: 27 });
console.log(`design revision ${D.id}  theme ${D.theme}  paper ${D.paper}`);
console.log(`  trim          ${139.7} x ${215.9} mm   (half-letter, folded once)`);
console.log(`  text box      ${D.layout.text_box_mm.width} x ${D.layout.text_box_mm.height} mm declared, shifted ${D.shift_mm} mm outward`);
console.log(`  text edges    fore ${D.text_edge.fore_mm} mm / spine ${D.text_edge.spine_mm} mm   (side margin ${D.margin.side_mm} mm)`);
console.log(`  margins       side ${D.margin.side_mm} / head ${D.margin.head_mm} / foot ${D.margin.foot_mm} mm`);
console.log(`  box in css px ${D.box.width_px_css.toFixed(4)} x ${D.box.height_px_css.toFixed(4)}  = ${D.box.width_q} x ${D.box.height_q} q`);
console.log(`  border        ${D.layout.border.style}, band to ${D.border_band_mm.to.toFixed(4)} mm, clearance ${D.border_clearance_mm.toFixed(4)} mm`);
console.log(`  capacity      ${linesPerPage(D)} lines/page, balanced ceiling ${balancedCeilingLines(D)} lines`);
console.log(`  density band  resolved ${D.layout.resolved_density_band.sparse_below}/${D.layout.resolved_density_band.dense_above} (declared ${D.layout.density_tolerance.sparse_below}/${D.layout.density_tolerance.dense_above})`);
console.log("");
console.log(formatChecks(checks));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
