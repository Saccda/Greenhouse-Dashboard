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
 *   campus-backdrop.glb  everything we never touch, merged flat   2.72 MB
 *   campus-parts.glb     the 75 bodies that light up, separate    0.96 MB
 *
 * 1,025 draw calls total against 18,903 unsplit, and the only parts we can
 * address are the only ones we ever wanted to.
 *
 * Part names carry their role and their SolidWorks body number — "ch2_spray__23"
 * — so a mis-picked body can be traced back to the CAD without guesswork, and
 * the picker below reports exactly that string.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, useBounds, ContactShadows, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const BACKDROP_URL = "/models/campus-backdrop.glb";
const PARTS_URL = "/models/campus-parts.glb";
const DRACO_PATH = "/draco/";

/** Colour each role glows when its channel is running. */
const ROLE_GLOW: Record<string, string> = {
  ch2_spray:  "#38bdf8",   // water — sky
  ch4_cool:   "#22d3ee",   // chilled water — cyan
  ch1_enable: "#4ade80",   // system enabled — green
};

/**
 * Camera directions, in the rotated frame where +Y is up and +X runs the length
 * of the rig. Bounds computes the distance, so only the direction matters —
 * which keeps these correct if the model is ever re-exported at another scale.
 */
export const VIEWS = {
  // 30 degrees azimuth, 45 elevation. Arrived at by eye against the reference
  // CAD view, not from theory. This pair was very nearly right before the panel
  // was enlarged; what spoiled it was the tighter Bounds margin pulling the
  // camera in, not the angle, so the angle is restored here and the fov below
  // compensates instead. Only the y component controls the elevation; x and z
  // fix the azimuth and should stay put.
  //
  // The readout in the viewer's bottom bar reports these two angles live, so a
  // better pair can be found by orbiting rather than by guessing from here.
  iso:   [0.80, 1.60, 1.39],
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

function Parts({ active, pickMode, onPick }: SceneProps) {
  const { scene } = useGLTF(PARTS_URL, DRACO_PATH);
  const invalidate = useThree((s) => s.invalidate);

  // Materials are cloned once per part. useGLTF caches and shares the loaded
  // scene, so mutating a material in place would leak the highlight into any
  // other consumer of the same asset — and back into this one after a remount.
  const parts = useMemo(() => {
    const found: { role: string; node: THREE.Object3D; materials: THREE.MeshStandardMaterial[] }[] = [];
    scene.traverse((obj) => {
      const name = obj.name ?? "";
      if (!name.includes("__")) return;
      const role = name.split("__")[0];
      const materials: THREE.MeshStandardMaterial[] = [];
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = list.map((m) => {
          const clone = (m as THREE.MeshStandardMaterial).clone();
          materials.push(clone);
          return clone;
        });
        if (!Array.isArray(mesh.material)) mesh.material = mesh.material[0];
      });
      found.push({ role, node: obj, materials });
    });
    return found;
  }, [scene]);

  useEffect(() => {
    for (const { role, materials } of parts) {
      const on = active.has(role);
      const glow = ROLE_GLOW[role];
      for (const m of materials) {
        if (on && glow) {
          m.emissive = new THREE.Color(glow);
          m.emissiveIntensity = 1.4;
        } else {
          m.emissive = new THREE.Color("#000000");
          m.emissiveIntensity = 0;
        }
        m.needsUpdate = true;
      }
    }
    // frameloop is "demand", so a state change that only alters materials would
    // otherwise never be drawn.
    invalidate();
  }, [parts, active, invalidate]);

  return (
    <primitive
      object={scene}
      onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        if (!pickMode || !onPick) return;
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
 * Re-frames the model along a preset direction. Bounds owns the distance, so
 * this only sets where the camera looks FROM and asks Bounds to refit — the
 * alternative, computing a distance here, would have to duplicate the bounding
 * box maths and would drift out of step with the model.
 */
function ViewController({ view, nonce }: { view: ViewName; nonce: number }) {
  const bounds = useBounds();
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const [x, y, z] = VIEWS[view];
    const len = Math.hypot(x, y, z) || 1;
    const dist = camera.position.length() || 20;
    camera.position.set((x / len) * dist, (y / len) * dist, (z / len) * dist);
    bounds.refresh().fit();
  }, [view, nonce, bounds, camera]);
  return null;
}

function Loading() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
        <p className="text-[11px] text-slate-400 whitespace-nowrap">Loading model…</p>
      </div>
    </Html>
  );
}

export default function CampusModelScene({
  active, pickMode, onPick, view = "iso", viewNonce = 0, onCamera,
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
        {/* margin 0.95, not drei's default 1.2. The rig is long and low, so a
            20% pad around its bounding box left the model floating small in
            the middle of the panel. Slightly under 1 fits the bounding sphere
            a touch tighter than exactly, which reads as filling the frame. */}
        <Bounds fit clip observe margin={0.95}>
          {/* The export is Z-DOWN: the floor sits at Z = -2.97 and the rig rises
              toward Z = -8.25. Proven from the model rather than assumed — the
              water tank's base is 0.09 m from the Z maximum and its 2 x 2 m
              platform slab sits right at it, and a tank stands on the floor.
              So "up" is -Z, and the conversion to three's Y-up is +90 degrees
              about X. Rotating -90 (the usual Z-up conversion) is what stood it
              on its head. */}
          <group rotation={[Math.PI / 2, 0, 0]}>
            <Backdrop />
            <Parts active={active} pickMode={pickMode} onPick={onPick} />
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
        // Stop at the floor: looking up through a rig with no modelled underside
        // just shows the inside of the mesh.
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}

useGLTF.preload(BACKDROP_URL, DRACO_PATH);
useGLTF.preload(PARTS_URL, DRACO_PATH);
