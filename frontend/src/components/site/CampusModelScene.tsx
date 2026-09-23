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
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, ContactShadows, Html, useGLTF } from "@react-three/drei";
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

export interface SceneProps {
  /** Roles currently ON, e.g. {"ch2_spray"}. Empty when the feed is stale. */
  active: Set<string>;
  /** Developer aid: click a part to report `role__bodyNumber`. */
  pickMode?: boolean;
  onPick?: (partName: string) => void;
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

export default function CampusModelScene({ active, pickMode, onPick }: SceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <Canvas
      // A static model has no reason to run at 60 fps forever. OrbitControls
      // invalidates on interaction, and the highlight effect invalidates on
      // channel change, so nothing is ever missed.
      frameloop="demand"
      dpr={[1, 2]}
      // A (1, 0.75, 1) direction is the three-quarter view CAD is normally
      // presented in. Bounds sets the distance; only the direction matters here.
      camera={{ position: [12, 9, 12], fov: 40, near: 0.1, far: 300 }}
      gl={{ antialias: true }}
      style={{ background: "transparent" }}
    >
      {/* Lights fill in shape and give the shadows direction; the environment
          above does the actual work on these metallic materials. Deliberately
          not drei's <Environment> or <Stage>, which fetch an HDR from a CDN. */}
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#ffffff", "#9ca3af", 0.35]} />
      <directionalLight position={[8, 12, 6]} intensity={0.9} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />

      <StudioEnvironment />

      <Suspense fallback={<Loading />}>
        {/* Bounds measures the real bounding box, so the model's offset from
            the origin and its true size are both handled without hardcoding
            either — a re-export at a different scale still frames correctly. */}
        <Bounds fit clip observe margin={1.2}>
          {/* SolidWorks is Z-up, glTF and three are Y-up, and the Open Cascade
              export did not convert. Without this the rig lies on its side and
              the default camera ends up under the floor looking at the back of
              the wall — which is exactly how it first appeared. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Backdrop />
            <Parts active={active} pickMode={pickMode} onPick={onPick} />
          </group>
        </Bounds>
        <ContactShadows position={[0, -0.01, 0]} opacity={0.3} scale={30} blur={2.4} far={12} />
      </Suspense>

      <OrbitControls
        ref={controls}
        makeDefault
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
