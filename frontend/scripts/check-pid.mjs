/**
 * Fail if anything on the process diagram overlaps anything else.
 *
 *   node scripts/check-pid.mjs
 *
 * Hand-placed SVG coordinates drift. A tag gains a character, an element moves
 * thirty units, and a label ends up sitting on a tank — which looks careless
 * and, on a control screen, can hide a value. This makes that a failing
 * command instead of something spotted in a screenshot afterwards.
 *
 * Imports the layout table directly: Node strips the type annotations itself,
 * so there is no build step and no second copy of the coordinates to drift.
 */
import { boxes, collisions } from "../src/components/hmi2/pidLayout.ts";

const bad = collisions();
if (bad.length === 0) {
  console.log(`OK — ${boxes().length} boxes on the diagram, none overlapping.`);
  process.exit(0);
}
console.log(`${bad.length} overlapping pair(s) on the process diagram:\n`);
for (const [a, b] of bad) console.log(`  ${a.padEnd(16)} <->  ${b}`);
console.log("\nEdit src/components/hmi2/pidLayout.ts and run this again.");
process.exit(1);
