/**
 * Mount the viewer's part-setup logic repeatedly over ONE cached scene, the
 * way remounting the 3D view does, and report anything that grows or drifts.
 *
 *   node scripts/audit-model-remount.mjs
 *
 * Why this exists. useGLTF caches and shares the loaded scene, so every
 * mutation CampusModelScene makes to it survives unmount and is seen again on
 * the next mount. Three bugs have now come from that one fact:
 *
 *   - the condenser fan reparented twice and orbited instead of spinning
 *   - a highlight colour was recorded as a part's own colour and stuck
 *   - reparenting DURING scene.traverse skipped two nozzle bodies on the
 *     first mount, so they could not light up until you navigated away and
 *     came back
 *
 * The last one is the reason this is a script. It was invisible to anyone
 * testing by reloading the page, because a reload is a fresh scene and a
 * remount is not. Counting materials across six mounts found it in seconds.
 *
 * Exits non-zero if anything leaks, so it can gate a change to that file.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

const PARTS = "public/models/campus-parts.glb";
const MOTION = { "ch4_cool__255": 1, "ch4_cool__280": 1 };
const GLOW = { ch2_spray: "#0ea5e9", ch4_cool: "#06b6d4", ch1_enable: "#22c55e" };
const PASSES = 6;

// GLTFLoader cannot read Draco without fetching a decoder, so strip it here.
const io = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
});
const doc = await io.read(PARTS);
doc.createExtension(KHRDracoMeshCompression).dispose();
const glb = await new NodeIO().registerExtensions([]).writeBinary(doc);

/** Mirrors the setup in CampusModelScene's `parts` memo. Keep in step with it. */
function mount(scene) {
  const partNodes = [];
  scene.traverse((o) => { if ((o.name || "").includes("__")) partNodes.push(o); });

  const parts = [];
  for (const obj of partNodes) {
    const name = obj.name;
    const materials = [], original = [];
    obj.traverse((child) => {
      if (!child.isMesh) return;
      const wasArray = Array.isArray(child.material);
      const list = wasArray ? child.material : [child.material];
      const clones = list.map((m) => {
        if (m.userData?.pristine) {
          materials.push(m);
          original.push({ color: m.userData.pristine.color.clone(), metalness: m.userData.pristine.metalness });
          return m;
        }
        const c = m.clone();
        c.userData = { ...c.userData, pristine: { color: c.color.clone(), metalness: c.metalness } };
        materials.push(c);
        original.push({ color: c.color.clone(), metalness: c.metalness });
        return c;
      });
      child.material = wasArray ? clones : clones[0];
    });
    if (MOTION[name] && obj.parent && !obj.parent.userData?.motionPivot) {
      const box = new THREE.Box3();
      obj.traverse((c) => {
        if (!c.isMesh || !c.geometry) return;
        c.geometry.computeBoundingBox();
        if (c.geometry.boundingBox) box.union(c.geometry.boundingBox);
      });
      if (!box.isEmpty()) {
        const centre = box.getCenter(new THREE.Vector3());
        const g = new THREE.Group();
        g.userData.motionPivot = true;
        g.position.copy(centre);
        obj.parent.add(g);
        g.add(obj);
        obj.position.sub(centre);
      }
    }
    parts.push({ role: name.split("__")[0], name, materials, original });
  }
  return parts;
}

function highlight(parts, roles) {
  for (const p of parts) {
    const on = roles.has(p.role);
    const glow = GLOW[p.role];
    p.materials.forEach((m, i) => {
      if (on && glow) { m.color = new THREE.Color(glow); m.metalness = 0.05; }
      else { m.color = p.original[i].color.clone(); m.metalness = p.original[i].metalness; }
    });
  }
}

function census(scene) {
  const mats = new Set();
  let nodes = 0, meshes = 0, pivots = 0;
  scene.traverse((o) => {
    nodes++;
    if (o.userData?.motionPivot) pivots++;
    if (!o.isMesh) return;
    meshes++;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
  });
  return { nodes, meshes, materials: mats.size, pivots };
}

const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
new GLTFLoader().parse(ab, "", (gltf) => {
  const rows = [];
  let pristine = null, partCount = null;
  for (let pass = 1; pass <= PASSES; pass++) {
    const parts = mount(gltf.scene);
    // Leave a channel highlighted on odd passes, so an unmount-while-lit is
    // exercised rather than assumed not to happen.
    highlight(parts, new Set(pass % 2 ? ["ch4_cool", "ch2_spray"] : []));
    const tank = parts.find((p) => p.name === "ch4_cool__121");
    if (pristine === null) { pristine = tank.original[0].color.getHexString(); partCount = parts.length; }
    rows.push({ pass, ...census(gltf.scene), parts: parts.length,
                pristineNow: tank.original[0].color.getHexString() });
  }

  console.log("pass  parts  nodes  meshes  materials  pivots  tank pristine");
  for (const r of rows)
    console.log(`  ${r.pass}    ${String(r.parts).padStart(3)}  ${String(r.nodes).padStart(5)}  ` +
                `${String(r.meshes).padStart(6)}  ${String(r.materials).padStart(9)}  ` +
                `${String(r.pivots).padStart(6)}  #${r.pristineNow}`);

  const first = rows[0], last = rows.at(-1);
  const problems = [];
  for (const k of ["parts", "nodes", "meshes", "materials", "pivots"])
    if (last[k] !== first[k]) problems.push(`${k} ${first[k]} -> ${last[k]}`);
  if (rows.some((r) => r.pristineNow !== pristine))
    problems.push("pristine colour drifted");
  if (rows.some((r) => r.parts !== partCount))
    problems.push("part count varies between mounts");

  console.log("");
  if (problems.length) {
    console.log("LEAK across remounts: " + problems.join("; "));
    console.log("Anything written into the cached scene survives unmount. Make it idempotent.");
    process.exit(1);
  }
  console.log(`Stable across ${PASSES} remounts: nothing grows, pristine colours hold.`);
}, (e) => { console.error("parse failed:", e); process.exit(1); });
