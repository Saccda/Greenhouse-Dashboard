"use client";
/**
 * CampusModelScene — the Three.js half of the campus 3D model.
 *
 * Kept in its own file and only ever reached through a dynamic import, because
 * three + fiber + drei is roughly 250 KB of JavaScript. Nothing outside this
 * page should pay for it, and it cannot server-render: WebGL needs a real
 * canvas, so `ssr: false` is required rather than merely preferred.
 *
 * On the model itself (public/models/campus.glb):
 *   - 2.76 MB, Draco-compressed, one draw call. The 41.8 MB Open Cascade export
 *     it came from is gitignored; see the commit that added it.
 *   - The Draco decoder is served from /draco/ rather than Google's CDN, so the
 *     page keeps working on a rural connection that cannot reach gstatic.
 *   - Geometry arrives in metres and offset from the origin, so nothing here
 *     assumes a centred model: <Bounds fit> measures the real bounding box and
 *     frames it. That also means a re-exported model of a different size still
 *     appears correctly without touching this file.
 *
 * Binding live channel state (CH2 on -> the misting line lights up) is not here
 * yet, and deliberately so: this build merges every part into a single mesh, so
 * there is nothing individually addressable to light. That needs a
 * parts-preserving model plus a mapping of node -> role. The structure below
 * leaves room for it — the model sits in its own component, so per-part
 * materials become a change inside <CampusModel> rather than a rewrite.
 */
import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Bounds, ContactShadows, Html, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const MODEL_URL = "/models/campus.glb";
const DRACO_PATH = "/draco/";

function CampusModel() {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH);
  // `scene` is cached and shared by useGLTF, so it is used directly rather than
  // cloned — there is only ever one viewer on the page.
  return <primitive object={scene} />;
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

export default function CampusModelScene() {
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <Canvas
      // demand rather than always: a static model does not need 60 fps forever.
      // OrbitControls invalidates on interaction, so it stays responsive while
      // costing nothing when nobody is touching it.
      frameloop="demand"
      dpr={[1, 2]}
      shadows
      camera={{ position: [9, 6, 9], fov: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      style={{ background: "transparent" }}
    >
      {/* Deliberately plain lights rather than drei's <Environment> or <Stage>,
          both of which fetch an HDR from a CDN at runtime. A grey CAD model
          reads fine on a three-point setup and the page stays self-contained. */}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#334155", 0.6]} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-8, 5, -6]} intensity={0.5} />

      <Suspense fallback={<Loading />}>
        {/* Bounds measures the real bounding box and frames it, so the model's
            offset from the origin and its true size are both handled without
            hardcoding either. */}
        <Bounds fit clip observe margin={1.15}>
          <CampusModel />
        </Bounds>
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.35}
          scale={30}
          blur={2.4}
          far={12}
        />
      </Suspense>

      <OrbitControls
        ref={controls}
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={60}
        // Stop below the floor: looking up through the ground plane at a rig
        // that has no underside modelled just shows the inside of the mesh.
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}

// Warm the cache as soon as this chunk is parsed, so the download starts while
// React is still mounting the canvas rather than after it.
useGLTF.preload(MODEL_URL, DRACO_PATH);
