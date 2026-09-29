"use client";
/**
 * CampusModelScene — the Three.js half of the campus digital twin.
 *
 * Reached only through a dynamic import: three + fiber + drei is ~250 KB and
 * cannot server-render, since WebGL needs a real canvas.
 *
 * TWO MODELS, deliberately. The CAD export is 313 bodies / 18,903 primitives.
 * Merging it all gives one cheap draw call but nothing addressable; keeping it
 * all separate keeps addressability at 17.7 MB and ~19,000 draw calls, which
 * costs far more framerate than the download costs patience. So
 * scripts/split-model.mjs produces:
 *
 *   campus-backdrop.glb  everything we never touch, merged flat   2.73 MB
 *   campus-parts.glb     the bodies that light up, kept separate   0.92 MB
 *
 * About a thousand draw calls against 18,903 unsplit, and the only parts we can
 * address are the only ones we ever wanted to. The exact body list lives in
 * scripts/split-model.mjs, which is also what campusParts.json records.
 *
 * Part names carry their role and their SolidWorks body number — "ch2_spray__23"
 * — so a mis-picked body can be traced back to the CAD without guesswork, and
 * the picker below reports exactly that string.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, useBounds, ContactShadows, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import SprayEffects from "./SprayEffects";

const BACKDROP_URL = "/models/campus-backdrop.glb";
const PARTS_URL = "/models/campus-parts.glb";
const DRACO_PATH = "/draco/";

/** Colour each role glows when its channel is running. */
/**
 * What a running channel looks like.
 *
 * `base` replaces the part's own colour and `emissive` makes it glow. Emissive
 * alone was not enough: these materials are metallic, so an emissive tint sat
 * UNDER a grey reflection and the highlight read as a faint sheen rather than
 * "this is the part that is running". Recolouring the body as well is what
 * produces the saturated blue of a vendor's twin, where a highlighted machine
 * is unmistakably a different object from its neighbours.
 *
 * Metalness is also dropped on a highlighted part — a mirror shows its
 * surroundings rather than its own colour, so a metallic part cannot look blue
 * however blue you paint it.
 */
const ROLE_GLOW: Record<string, { base: string; emissive: string }> = {
  ch2_spray:  { base: "#0ea5e9", emissive: "#38bdf8" },   // water
  ch4_cool:   { base: "#06b6d4", emissive: "#22d3ee" },   // chilled water
  ch1_enable: { base: "#22c55e", emissive: "#4ade80" },   // system enabled
};

/**
 * Parts that MOVE, keyed by their `role__body` name.
 *
 * A digital twin should move where the real thing moves and nowhere else.
 * Spinning something that is bolted down would be a lie told for decoration,
 * so this list is short on purpose: the condenser fan is the only part of the
 * campus system that rotates and is separately modelled.
 *
 * `axis` is in the model's own coordinates, where the fan's thin dimension —
 * and therefore its shaft — runs along X.
 */
/**
 * Which equipment page a body belongs to, by SolidWorks body number.
 *
 * The process diagram already opens a detail page when you click an item; the
 * model did not, so the two were separate pictures of the same plant rather
 * than one twin. Clicking the pump here now lands on the same page clicking
 * the pump there does.
 *
 * Keyed by body number rather than by role, because a role can span several
 * pieces of equipment: ch4_cool covers the chilled tank, its coil and the
 * condenser fan, which are two different things to read about.
 *
 * F-01 and FM-01 are absent on purpose — the filter and the meter are not
 * separately modelled, so they have no body to click. They stay reachable
 * from the diagram, which is the honest answer rather than pointing some
 * nearby body at them.
 */
const BODY_TAG: Record<number, string> = {
  35: "T-01",                     // storage tank
  121: "T-02", 153: "T-02",       // chilled tank and the coil inside it
  255: "CH-01", 280: "CH-01",     // condenser fan
  126: "CH-01",                   // the wire feeding the cooling unit
  90: "CP-01",                    // control panel
};

/** Every nozzle body belongs to the misting run. */
const ROLE_TAG: Record<string, string> = { ch2_spray: "N-01" };

function tagForPart(partName: string): string | null {
  const [role, body] = partName.split("__");
  return BODY_TAG[Number(body)] ?? ROLE_TAG[role] ?? null;
}

const MOTION: Record<string, { axis: [number, number, number]; rpm: number }> = {
  // 90 rpm is a DISPLAY speed, not the real one. A condenser fan runs nearer a
  // thousand, which at 60 frames a second is roughly a quarter turn per frame —
  // past the point where the eye resolves rotation, so it aliases into a
  // strobe and can appear to turn backwards. The twin's job here is to say
  // "this is running", and a speed that reads as rotation says it better than
  // a number nobody can see.
  "ch4_cool__255": { axis: [1, 0, 0], rpm: 90 },
  "ch4_cool__280": { axis: [1, 0, 0], rpm: 90 },
};

/**
 * Camera directions, in the rotated frame where +Y is up and +X runs the length
 * of the model. Bounds computes the distance, so only the direction matters —
 * which keeps these correct if the model is ever re-exported at another scale.
 */
export const VIEWS = {
  // The classic isometric direction is simply (1, 1, 1): azimuth 45, elevation
  // 35.26 (atan of 1/sqrt 2). That is exactly what SolidWorks calls Isometric,
  // which is the reference this is meant to match.
  //
  // Everything before this was tuned against a broken mapping — see
  // ViewController — so the numbers that came out of that tuning described an
  // angle nobody was actually looking at. Starting again from the textbook
  // value, which the viewer's az/el readout now agrees with exactly.
  iso:   [1, 1, 1],
  front: [0, 0.18, 1],
  side:  [1, 0.18, 0],
  top:   [0.01, 1, 0.01],
} as const;
export type ViewName = keyof typeof VIEWS;

export interface SceneProps {
  /** Roles currently ON, e.g. {"ch2_spray"}. Empty when the feed is stale. */
  active: Set<string>;
  /** Developer aid: click a part to report `role__bodyNumber`. */
  pickMode?: boolean;
  onPick?: (partName: string) => void;
  /** Called with an equipment tag when a mapped part is clicked outside pick mode. */
  onSelectTag?: (tag: string) => void;
  /** Which preset to frame from, and a nonce so re-picking the same one re-fits. */
  view?: ViewName;
  viewNonce?: number;
  /** Live camera angles in degrees, so a preset can be found by eye. */
  onCamera?: (azimuth: number, elevation: number) => void;
}

/**
 * Every material in the CAD export is metallicFactor 1.0 — SolidWorks writes
 * everything as metal. A metal surface has no diffuse response: it can only
 * reflect its surroundings, so with no environment map it renders BLACK no
 * matter how many lights are in the scene. That is why the model arrived as a
 * silhouette.
 *
 * RoomEnvironment is generated procedurally inside three, so this gives the
 * metal something to reflect without fetching an HDR from a CDN — which is the
 * usual fix and the one this project cannot use.
 */
function StudioEnvironment() {
  const { scene, gl } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    // RoomEnvironment is a brightly lit white box, which on fully metallic
    // materials washes the model out. Scaling it back keeps the reflections
    // that make the metal legible without bleaching the surfaces.
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);
  return null;
}

function Backdrop() {
  const { scene } = useGLTF(BACKDROP_URL, DRACO_PATH);
  return <primitive object={scene} />;
}

function Parts({ active, pickMode, onPick, onSelectTag }: SceneProps) {
  const { scene } = useGLTF(PARTS_URL, DRACO_PATH);
  const invalidate = useThree((s) => s.invalidate);

  // Materials are cloned once per part, and the clone carries its own pristine
  // colour in userData. useGLTF caches and shares the loaded scene, so anything
  // written here survives unmount and is seen again on the next mount — which
  // makes every mutation in this block a place where state can leak forward.
  // Both bugs found so far came from exactly that: the fan reparented twice,
  // and a highlight colour recorded as a part's own colour.
  const parts = useMemo(() => {
    const found: {
      role: string;
      name: string;
      node: THREE.Object3D;
      materials: THREE.MeshStandardMaterial[];
      /** The part's own colour and metalness, so the highlight can be undone. */
      original: { color: THREE.Color; metalness: number }[];
      /** Present only for parts in MOTION: the group they spin about. */
      pivot?: THREE.Object3D;
    }[] = [];
    // TWO PHASES, and the separation is load-bearing.
    //
    // This loop REPARENTS motion parts into pivot groups. Doing that inside
    // scene.traverse mutates the children array three.js is iterating, which
    // makes it skip siblings: on the very first mount, ch2_spray__256 and
    // ch2_spray__287 were never visited, so they never got cloned materials
    // and could not light up. They worked only after a remount, once the
    // reparenting was already done and the traverse ran clean — which is a
    // bug that hides from anyone who reloads the page to check.
    //
    // Collect first, mutate second.
    const partNodes: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if ((obj.name ?? "").includes("__")) partNodes.push(obj);
    });

    for (const obj of partNodes) {
      const name = obj.name ?? "";
      const role = name.split("__")[0];
      const materials: THREE.MeshStandardMaterial[] = [];
      const original: { color: THREE.Color; metalness: number }[] = [];
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Put the material back in the SHAPE it arrived in. three renders an
        // array material only through geometry.groups, and every mesh here is a
        // single-material glTF primitive with no groups at all — so an array of
        // one draws nothing whatsoever. That is not a subtle degradation: it
        // made all 75 addressable bodies invisible, which is why the channel
        // preview appeared to do nothing.
        const wasArray = Array.isArray(mesh.material);
        const list = wasArray ? (mesh.material as THREE.Material[]) : [mesh.material];
        const clones = list.map((m) => {
          const mat = m as THREE.MeshStandardMaterial;
          // Reuse our own clone if this mesh already has one. The clones are
          // written back into the SHARED cached scene, so on a remount `list`
          // holds the previous mount's clones, not the asset's own materials.
          // Cloning those again captured whatever colour the part happened to
          // be wearing at unmount — leave the page with CH4 previewed and the
          // chilled tank's "original" colour was recorded as blue, so it came
          // back blue and stayed blue for good.
          //
          // The pristine values are therefore stored ON the material the first
          // time we ever touch it, and always restored from there.
          if (mat.userData?.pristine) {
            const p = mat.userData.pristine as { color: THREE.Color; metalness: number };
            materials.push(mat);
            original.push({ color: p.color.clone(), metalness: p.metalness });
            return mat;
          }
          const clone = mat.clone();
          clone.userData = {
            ...clone.userData,
            pristine: { color: clone.color.clone(), metalness: clone.metalness },
          };
          materials.push(clone);
          original.push({ color: clone.color.clone(), metalness: clone.metalness });
          return clone;
        });
        mesh.material = wasArray ? clones : clones[0];
      });
      // A part that spins needs a pivot at its own centre: rotating the node
      // directly turns it about the model's ORIGIN and swings the fan across
      // the room instead of spinning it in place.
      //
      // MUST be idempotent. useGLTF caches and shares the loaded scene — the
      // same warning the material cloning above carries — so this memo re-runs
      // on the SAME objects every time the viewer remounts, which happens
      // whenever someone switches HMI tabs and comes back. Building the pivot
      // unconditionally reparented the fan a second time and subtracted its
      // centre again, leaving it displaced by twice the offset and orbiting.
      // That is what "it should not rotate like that" looked like.
      let pivot: THREE.Object3D | undefined;
      if (MOTION[name]) {
        if (obj.parent?.userData?.motionPivot) {
          // Already built on an earlier mount; reuse it untouched.
          pivot = obj.parent;
        } else if (obj.parent) {
          const box = new THREE.Box3();
          obj.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh || !mesh.geometry) return;
            mesh.geometry.computeBoundingBox();
            if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
          });
          if (!box.isEmpty()) {
            const centre = box.getCenter(new THREE.Vector3());
            const parent = obj.parent;
            const group = new THREE.Group();
            group.userData.motionPivot = true;
            group.position.copy(centre);
            parent.add(group);
            group.add(obj);
            obj.position.sub(centre);
            pivot = group;
          }
        }
      }
      found.push({ role, name, node: obj, materials, original, pivot });
    }
    return found;
  }, [scene]);

  useEffect(() => {
    for (const { role, materials, original } of parts) {
      const on = active.has(role);
      const glow = ROLE_GLOW[role];
      materials.forEach((m, i) => {
        if (on && glow) {
          m.color = new THREE.Color(glow.base);
          m.emissive = new THREE.Color(glow.emissive);
          m.emissiveIntensity = 2.2;
          // A mirror shows its surroundings, not its own colour, so a metallic
          // part cannot look blue however blue it is painted.
          m.metalness = 0.05;
        } else {
          m.color = original[i].color.clone();
          m.emissive = new THREE.Color("#000000");
          m.emissiveIntensity = 0;
          m.metalness = original[i].metalness;
        }
        m.needsUpdate = true;
      });
    }
    // frameloop is "demand", so a state change that only alters materials would
    // otherwise never be drawn.
    invalidate();
  }, [parts, active, invalidate]);

  /**
   * Spin whatever is both in MOTION and currently running.
   *
   * invalidate() is called from inside the frame because the canvas runs
   * frameloop="demand": without it the scene draws once and the fan freezes
   * mid-turn. Asking for the next frame only while something is actually
   * turning means a still model costs nothing, which is the whole reason the
   * canvas is on demand in the first place.
   */
  useFrame((_, delta) => {
    let moving = false;
    for (const { role, name, pivot } of parts) {
      if (!pivot || !active.has(role)) continue;
      const spec = MOTION[name];
      if (!spec) continue;
      const radians = (spec.rpm / 60) * Math.PI * 2 * delta;
      pivot.rotateOnAxis(new THREE.Vector3(...spec.axis).normalize(), radians);
      moving = true;
    }
    if (moving) invalidate();
  });

  return (
    <primitive
      object={scene}
      onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        // Pick mode is the developer aid and keeps priority: it reports the
        // body number so a mis-assigned part can be traced back to the CAD.
        // Outside it, a click opens that item's detail page.
        if (!pickMode) {
          if (!onSelectTag) return;
          e.stopPropagation();
          let node: THREE.Object3D | null = e.object;
          while (node && !(node.name ?? "").includes("__")) node = node.parent;
          const tag = node ? tagForPart(node.name) : null;
          if (tag) onSelectTag(tag);
          return;
        }
        if (!onPick) return;
        e.stopPropagation();
        // Walk up to the named part: the click lands on a mesh, which may be a
        // child of the node carrying the role__body name.
        let o: THREE.Object3D | null = e.object;
        while (o && !(o.name ?? "").includes("__")) o = o.parent;
        if (o) onPick(o.name);
      }}
    />
  );
}

/**
 * Re-frames the model along a preset direction.
 *
 * The direction MUST be applied relative to the model's bounding-box centre,
 * not the world origin. Bounds.reset() — which fit() delegates to for a
 * perspective camera — recovers the direction it will use as
 * `camera.position - boxCentre`. This model's centre sits 13.6 m from the
 * origin, so positioning the camera at `direction * distance` from the origin
 * fed Bounds a completely different direction from the one asked for: VIEWS.iso
 * at azimuth 22 / elevation 45 came out as -12 / 79, very nearly top-down.
 *
 * It was also unstable. The old code took its distance from
 * `camera.position.length()`, which changes after every fit, so each press of a
 * preset produced a different wrong angle — which is why the mount-time framing
 * and the ISO button disagreed.
 *
 * Anchoring to the centre makes VIEWS mean exactly what it says, and match the
 * azimuth/elevation readout in the viewer, which was always measured from the
 * orbit target and so was right all along.
 */
function ViewController({ view, nonce }: { view: ViewName; nonce: number }) {
  const bounds = useBounds();
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const [x, y, z] = VIEWS[view];
    const dir = new THREE.Vector3(x, y, z).normalize();
    bounds.refresh();
    const { center, distance } = bounds.getSize();
    camera.position.copy(center).addScaledVector(dir, distance || 20);
    camera.lookAt(center);
    bounds.fit();
  }, [view, nonce, bounds, camera]);
  return null;
}

function Loading() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
        <p className="text-[11px] text-slate-200 whitespace-nowrap">Loading model…</p>
      </div>
    </Html>
  );
}

export default function CampusModelScene({
  active, pickMode, onPick, onSelectTag, view = "iso", viewNonce = 0, onCamera,
}: SceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  // Last reported pair, so a drag does not fire a React render per frame.
  const lastAngles = useRef<[number, number]>([0, 0]);

  /**
   * Convert the camera's offset from the orbit target into the same azimuth and
   * elevation that VIEWS above is written in, so a angle found by dragging can
   * be typed straight back into the preset. Getting this view right has taken
   * several blind guesses; a readout costs a few lines and ends that.
   */
  const reportCamera = useCallback(() => {
    const c = controls.current;
    if (!c || !onCamera) return;
    const v = c.object.position.clone().sub(c.target);
    const az = THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z));
    const el = THREE.MathUtils.radToDeg(Math.atan2(v.y, Math.hypot(v.x, v.z)));
    const [pa, pe] = lastAngles.current;
    if (Math.abs(az - pa) < 0.5 && Math.abs(el - pe) < 0.5) return;
    lastAngles.current = [az, el];
    onCamera(az, el);
  }, [onCamera]);

  return (
    <Canvas
      // A static model has no reason to run at 60 fps forever. OrbitControls
      // invalidates on interaction, and the highlight effect invalidates on
      // channel change, so nothing is ever missed.
      frameloop="demand"
      dpr={[1, 2]}
      // fov 14. CAD isometrics are ORTHOGRAPHIC — parallel edges stay parallel —
      // whereas a wide fov splays the floor slab outward and reads as though
      // shot from much higher up. A narrow fov with the camera correspondingly
      // further back approximates orthographic while staying a perspective
      // camera, which behaves better than a true ortho camera under orbit and
      // zoom.
      //
      // Why this is 14 and not 24: Bounds fits the model to the frame, so the
      // MARGIN sets apparent size and the FOV sets perspective splay — they are
      // independent. Tightening the margin to fill the enlarged panel pulled
      // the camera physically closer, which increased the splay and undid the
      // isometric look. Narrowing the fov pushes it back out at the same
      // apparent size. Zoom and projection pull against each other here; this
      // pair is the balance.
      camera={{ position: [12, 9, 12], fov: 14, near: 0.1, far: 800 }}
      // One honest global brightness control, applied after lighting rather
      // than by dimming each light and hoping they stay in balance.
      gl={{ antialias: true, toneMappingExposure: 0.78 }}
      style={{ background: "transparent" }}
    >
      {/* Lights fill in shape and give the shadows direction; the environment
          above does the actual work on these metallic materials. Deliberately
          not drei's <Environment> or <Stage>, which fetch an HDR from a CDN. */}
      <ambientLight intensity={0.22} />
      <hemisphereLight args={["#ffffff", "#8a94a6", 0.28]} />
      <directionalLight position={[8, 12, 6]} intensity={0.75} />
      <directionalLight position={[-8, 5, -6]} intensity={0.28} />

      <StudioEnvironment />

      <Suspense fallback={<Loading />}>
        {/* Bounds measures the real bounding box, so the model's offset from
            the origin and its true size are both handled without hardcoding
            either — a re-export at a different scale still frames correctly. */}
        {/* margin 0.95, not drei's default 1.2. The model is long and low, so a
            20% pad around its bounding box left the model floating small in
            the middle of the panel. Under 1 fits tighter than exactly, which
            reads as filling the frame; the narrow fov above is what keeps the
            closer camera from reintroducing perspective splay. */}
        <Bounds fit clip observe margin={0.85}>
          {/* The export is Z-DOWN: the floor sits at Z = -2.97 and the model rises
              toward Z = -8.25. Proven from the model rather than assumed — the
              water tank's base is 0.09 m from the Z maximum and its 2 x 2 m
              platform slab sits right at it, and a tank stands on the floor.
              So "up" is -Z, and the conversion to three's Y-up is +90 degrees
              about X. Rotating -90 (the usual Z-up conversion) is what stood it
              on its head. */}
          <group rotation={[Math.PI / 2, 0, 0]}>
            <Backdrop />
            <Parts active={active} pickMode={pickMode} onPick={onPick} onSelectTag={onSelectTag} />
            {/* Inside the rotated group on purpose: the effects work in the
                model's own coordinates, derived from the nozzle bodies, so
                they move with the model rather than needing the rotation
                applied to them by hand. */}
            <SprayEffects active={active.has("ch2_spray")} />
          </group>
          <ViewController view={view} nonce={viewNonce} />
        </Bounds>
        <ContactShadows position={[0, -0.01, 0]} opacity={0.3} scale={30} blur={2.4} far={12} />
      </Suspense>

      <OrbitControls
        ref={controls}
        makeDefault
        onChange={reportCamera}
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={80}
        // Stop at the floor: looking up through a model with no modelled underside
        // just shows the inside of the mesh.
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}

useGLTF.preload(BACKDROP_URL, DRACO_PATH);
useGLTF.preload(PARTS_URL, DRACO_PATH);
