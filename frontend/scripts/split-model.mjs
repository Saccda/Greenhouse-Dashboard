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
  // Every nozzle head is modelled as TWO bodies ~70 mm apart — the head and its
  // tip — which is why they appear to overlap when picked in SolidWorks. Derived
  // geometrically rather than by clicking: every body under 350 mm sitting in
  // the nozzle plane (Z -6.9..-6.2, Y above 8.0). That yields 68 bodies = 34
  // heads across the rail runs, at a clean 7 per rail, which matches the count
  // from the drawing. Picking 34 heads by hand would have been error-prone; the
  // geometry states the pattern plainly.
  ch2_spray: [
    2, 4, 5, 6, 7, 12, 13, 17, 23, 34, 37, 42, 57, 58, 63, 68, 73, 75, 79, 87,
    89, 100, 102, 120, 122, 129, 131, 132, 133, 135, 137, 141, 144, 146, 151,
    154, 161, 164, 166, 176, 178, 182, 186, 187, 188, 194, 196, 210, 213, 214,
    215, 218, 219, 220, 222, 223, 242, 256, 259, 264, 268, 270, 272, 287, 291,
    295, 305, 309,
  ],
  // The chilled-water tank, the copper coil inside it, and the wire running in.
  //
  // Identified from the model rather than picked by eye. [121] is a 646 x 630 x
  // 600 mm white body on the skid; [153] sits INSIDE it, is 208,692 triangles
  // for 95 litres, and is the ONLY body in all 313 whose sole material colour
  // is copper rgb(87,36,8) — a tube coiled in a vessel has exactly that
  // signature, and nothing else in the model does.
  //
  // The previous set was [126, 119, 282] and was close to arbitrary: [119] is
  // one slat out of seventeen identical 192 x 514 x 25 mm bodies, and [282] is
  // a black panel. Only [126], the 15 x 15 x 129 mm wire, was right, which is
  // why the channel appeared to light the wiring and nothing else.
  ch4_cool: [121, 153, 126],
  // 24 x 24 x 60 mm on the wall panel: an indicator lamp, which is exactly the
  // right thing to light for "system enabled".
  ch1_enable: [50],
  // Context only, never bound: the water storage tank.
  storage: [35],
};

// Bodies originally supplied as CH2 whose position argues against it: they sit
// within ~2 m of each other at the cooling skid rather than running along the
// rig. Parked rather than discarded, pending a look through the viewer's
// preview control.
const UNVERIFIED = [
  294, 258, 253, 244, 245, 239, 221, 208, 207, 183, 157, 149, 140, 125,
  110, 84, 81, 74, 72, 71, 15,
  // end-of-rail fittings, not nozzle heads: they sit at the rail end and do not
  // fit the two-body pattern
  76, 80, 115,
  // dropped from CH4: [119] is one of seventeen identical slats and [282] is a
  // panel, neither of which is cooling plant
  119, 282,
  // Ruled out by eye once the preview actually rendered — previously bound to
  // CH2 on the farm team's say-so, which was worth more than my inference until
  // it could be checked visually. The measurements are emphatic: all 68 real
  // nozzles sit in a 1 cm band on the rail axis, while these two are 3.1 and
  // 3.2 m off it, 7.6x and 13x the largest nozzle dimension, and 690x and
  // 1808x the mean nozzle volume. They are plant near the cooling skid.
  46, 116,
];

/**
 * Retune the materials the CAD exporter wrote.
 *
 * SolidWorks writes every surface as metallicFactor 1.0 / roughnessFactor 0.21
 * — a near-mirror metal — regardless of what the part actually is. That is what
 * made the model render black before an environment map was added, and it is
 * also why fine form is illegible: a mirror shows you its surroundings, not its
 * own shape, so a 20 mm shell rim on the water tank has essentially no shading
 * contrast and the tank reads as a featureless cylinder.
 *
 * Dropping metallic and raising roughness restores a diffuse response, so the
 * directional lights actually model the geometry. These are painted tanks,
 * plastic pipe and powder-coated frame, none of which are bare polished metal
 * in life either.
 */
function retuneMaterials(doc) {
  let n = 0;
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setMetallicFactor(0.35);
    mat.setRoughnessFactor(0.6);
    n++;
  }
  return n;
}

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
  const tuned = retuneMaterials(doc);
  await doc.transform(prune(), dedup(), weld(), draco());
  const glb = await io.writeBinary(doc);
  writeFileSync(OUT_PARTS, glb);
  console.log(`           ${tuned} materials retuned`);
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
  const tuned = retuneMaterials(doc);
  await doc.transform(prune(), dedup(), flatten(), join(), weld(), draco());
  const glb = await io.writeBinary(doc);
  writeFileSync(OUT_BACKDROP, glb);
  console.log(`           ${tuned} materials retuned`);
  console.log(`backdrop : ${dropped} bodies removed -> ${OUT_BACKDROP} (${(glb.length / 1e6).toFixed(2)} MB)`);
}

writeFileSync(OUT_MAP, JSON.stringify({ parts: PARTS, unverified: UNVERIFIED }, null, 2) + "\n");
console.log(`mapping  : ${OUT_MAP}`);
