/**
 * Split the campus CAD export into two models: a merged backdrop and the
 * handful of parts that need to light up.
 *
 *   node scripts/split-model.mjs
 *
 * Why split at all. The Open Cascade export is 313 nodes / 18,903 primitives.
 * Merging everything gives 2.76 MB in one draw call but leaves nothing
 * addressable; keeping everything separate preserves addressability at 17.7 MB
 * and ~19,000 draw calls, which is far worse for framerate than the download is
 * for patience. Neither is shippable.
 *
 * So: the bodies named in PARTS stay separate and keep a role in their name;
 * everything else merges into a single mesh. Two files, a few dozen draw calls,
 * and the only parts we can actually bind to live channel state are the ones we
 * ever wanted to bind.
 *
 * Body numbers come from SolidWorks. The STEP was imported as a multibody part,
 * so its 312 solid bodies are auto-named "...STEP[N]" with no component names —
 * but they export in order, so SolidWorks body [N] is the Nth child of the root
 * node. That mapping was verified from both ends: body [35] is the 1.9 x 1.9 x
 * 2.2 m cylinder standing alone at one end, which is the water storage tank in
 * the renders and nothing else in the model.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, join, flatten, prune, draco } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { writeFileSync } from "node:fs";

const SRC = "public/Zone E Engineering Learning Workspace.glb";
const OUT_PARTS = "public/models/campus-parts.glb";
const OUT_BACKDROP = "public/models/campus-backdrop.glb";
const OUT_MAP = "src/components/site/campusParts.json";

// SolidWorks body numbers, grouped by the channel they should respond to.
// Deliberately data rather than code: correcting a mis-picked body is an edit
// here and a re-run, not a change to the viewer.
const PARTS = {
  // Distributed along the rig at one height, 10 x 35 x 35 mm each — a nozzle run.
  ch2_spray: [23, 57, 144, 176, 270, 309, 291, 210, 76],
  // Tank panel, plate and rod on the cooling skid.
  ch4_cool: [126, 119, 282],
  // 24 x 24 x 60 mm on the wall panel — an indicator lamp, which is exactly the
  // right thing to light for "system enabled".
  ch1_enable: [50],
  // Context only, never bound: the water storage tank.
  storage: [35],
};

// Bodies supplied as CH2 that are clustered at the cooling skid rather than
// distributed along the rig, several far too large to be nozzles (up to
// 489 x 1200 x 500 mm). Held here rather than silently dropped so they can be
// reinstated once identified in the viewer.
const UNVERIFIED = [
  294, 258, 253, 244, 245, 239, 221, 208, 207, 183, 157, 149, 140, 125, 116,
  110, 84, 81, 74, 72, 71, 46, 15,
];

const io = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.encoder": await draco3d.createEncoderModule(),
  "draco3d.decoder": await draco3d.createDecoderModule(),
});

const keep = new Map();
for (const [role, ids] of Object.entries(PARTS)) for (const id of ids) keep.set(id, role);

function rootChildren(doc) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const top = scene.listChildren();
  // One root ("Zone E assembly") holding all 312 bodies as direct children.
  return top.length === 1 && top[0].listChildren().length > 1
    ? { parent: top[0], children: top[0].listChildren() }
    : { parent: scene, children: top };
}

// ── Pass 1: the addressable parts ───────────────────────────────────────────
{
  const doc = await io.read(SRC);
  const { children } = rootChildren(doc);
  let kept = 0;
  children.forEach((node, i) => {
    const body = i + 1;                       // SolidWorks body [N] = Nth child
    const role = keep.get(body);
    if (!role) { node.dispose(); return; }
    node.setName(`${role}__${body}`);         // role and body number both survive
    kept++;
  });
  await doc.transform(prune(), dedup(), weld(), draco());
  const glb = await io.writeBinary(doc);
  writeFileSync(OUT_PARTS, glb);
  console.log(`parts    : ${kept} bodies -> ${OUT_PARTS} (${(glb.length / 1e6).toFixed(2)} MB)`);
}

// ── Pass 2: everything else, merged flat ────────────────────────────────────
{
  const doc = await io.read(SRC);
  const { children } = rootChildren(doc);
  let dropped = 0;
  children.forEach((node, i) => {
    if (keep.has(i + 1)) { node.dispose(); dropped++; }
  });
  // join+flatten is exactly what we do NOT want for the parts file and exactly
  // what we do want here: the backdrop is never interacted with.
  await doc.transform(prune(), dedup(), flatten(), join(), weld(), draco());
  const glb = await io.writeBinary(doc);
  writeFileSync(OUT_BACKDROP, glb);
  console.log(`backdrop : ${dropped} bodies removed -> ${OUT_BACKDROP} (${(glb.length / 1e6).toFixed(2)} MB)`);
}

writeFileSync(OUT_MAP, JSON.stringify({ parts: PARTS, unverified: UNVERIFIED }, null, 2) + "\n");
console.log(`mapping  : ${OUT_MAP}`);
