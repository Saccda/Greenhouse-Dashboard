"use client";
/**
 * Water moving through the misting run, and mist leaving the nozzles.
 *
 * Both are driven by CH2 and shown only while CH2 is actually on, so this is
 * not decoration: it is the one state the rig exists to produce, drawn as the
 * thing itself rather than as a colour change. A visitor who knows nothing
 * about the dashboard can see the system spraying.
 *
 * That is a deliberate departure from the rule the operator screens follow,
 * where nothing moves unless it needs attention. The rule is about attention
 * economics on a panel someone is monitoring; this view's job is explanation,
 * and for explanation showing the process beats describing it. The P&ID next
 * door still shows flow as a static brightness change, which is right there.
 *
 * GEOMETRY IS DERIVED, NOT TYPED IN. The rail paths and nozzle positions are
 * computed from the model's own nozzle bodies at load: heads are deduplicated
 * (each is modelled as two bodies ~70 mm apart), then grouped into rails. A
 * re-export that moves a rail moves the water with it, and a hardcoded path
 * would quietly describe a rig that no longer exists.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const PARTS_URL = "/models/campus-parts.glb";
const DRACO_PATH = "/draco/";

/** Two bodies of one head sit ~70 mm apart; anything closer than this is one head. */
const HEAD_MERGE_M = 0.15;
/** How far mist falls before it has dispersed. Not to the floor — mist does not rain. */
const MIST_FALL_M = 1.25;
const MIST_PER_HEAD = 10;
const FLOW_PER_RAIL = 14;

interface Rail { y: number; z: number; x0: number; x1: number }

export default function SprayEffects({ active }: { active: boolean }) {
  const { scene } = useGLTF(PARTS_URL, DRACO_PATH);
  const invalidate = useThree((s) => s.invalidate);

  const { heads, rails } = useMemo(() => {
    // Every nozzle body's centre, in the model's own coordinates.
    const centres: THREE.Vector3[] = [];
    scene.traverse((obj) => {
      if (!(obj.name ?? "").startsWith("ch2_spray__")) return;
      const box = new THREE.Box3();
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
      });
      if (!box.isEmpty()) centres.push(box.getCenter(new THREE.Vector3()));
    });

    // Merge each head's two bodies into one emitter.
    const heads: THREE.Vector3[] = [];
    for (const c of centres) {
      if (!heads.some((h) => h.distanceTo(c) < HEAD_MERGE_M)) heads.push(c);
    }

    // Rails run along X, so heads sharing a Y are on one rail.
    const byRail = new Map<string, THREE.Vector3[]>();
    for (const h of heads) {
      const key = h.y.toFixed(1);
      const list = byRail.get(key) ?? [];
      list.push(h);
      byRail.set(key, list);
    }
    const rails: Rail[] = [];
    for (const list of byRail.values()) {
      if (list.length < 2) continue;
      const xs = list.map((v) => v.x);
      rails.push({
        y: list[0].y,
        z: list[0].z,
        // Extend past the outermost heads so water is seen arriving and leaving
        // rather than appearing at the first nozzle.
        x0: Math.min(...xs) - 0.4,
        x1: Math.max(...xs) + 0.4,
      });
    }
    return { heads, rails };
  }, [scene]);

  // ── Mist ────────────────────────────────────────────────────────────────
  const mistRef = useRef<THREE.Points>(null);
  const mist = useMemo(() => {
    const n = heads.length * MIST_PER_HEAD;
    const positions = new Float32Array(n * 3);
    // Each particle keeps its own phase and sideways drift so the heads do not
    // pulse in unison, which reads as a machine rather than as water.
    const phase = new Float32Array(n);
    const drift = new Float32Array(n * 2);
    let i = 0;
    for (const h of heads) {
      for (let k = 0; k < MIST_PER_HEAD; k++) {
        positions[i * 3] = h.x;
        positions[i * 3 + 1] = h.y;
        positions[i * 3 + 2] = h.z;
        phase[i] = Math.random();
        drift[i * 2] = (Math.random() - 0.5) * 0.22;
        drift[i * 2 + 1] = (Math.random() - 0.5) * 0.22;
        i++;
      }
    }
    return { positions, phase, drift, count: n };
  }, [heads]);

  // ── Flow along the rails ────────────────────────────────────────────────
  const flowRef = useRef<THREE.Points>(null);
  const flow = useMemo(() => {
    const n = rails.length * FLOW_PER_RAIL;
    const positions = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    let i = 0;
    for (const r of rails) {
      for (let k = 0; k < FLOW_PER_RAIL; k++) {
        positions[i * 3] = r.x0;
        positions[i * 3 + 1] = r.y;
        positions[i * 3 + 2] = r.z;
        phase[i] = k / FLOW_PER_RAIL;
        i++;
      }
    }
    return { positions, phase, count: n, rails };
  }, [rails]);

  useFrame((state) => {
    if (!active) return;
    const t = state.clock.elapsedTime;

    const mp = mistRef.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (mp) {
      let i = 0;
      for (const h of heads) {
        for (let k = 0; k < MIST_PER_HEAD; k++) {
          // 0..1 through the fall, looping. Mist leaves the nozzle downward,
          // which is +Z here: the export is Z-down, so the model's up is -Z.
          const u = (t * 0.85 + mist.phase[i]) % 1;
          mp.setXYZ(
            i,
            h.x + mist.drift[i * 2] * u,
            h.y + mist.drift[i * 2 + 1] * u,
            h.z + u * MIST_FALL_M,
          );
          i++;
        }
      }
      mp.needsUpdate = true;
    }

    const fp = flowRef.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (fp) {
      let i = 0;
      for (const r of flow.rails) {
        for (let k = 0; k < FLOW_PER_RAIL; k++) {
          const u = (t * 0.30 + flow.phase[i]) % 1;
          fp.setXYZ(i, r.x0 + (r.x1 - r.x0) * u, r.y, r.z);
          i++;
        }
      }
      fp.needsUpdate = true;
    }

    // frameloop is "demand": ask for the next frame only while something is
    // moving, so a still model costs nothing.
    invalidate();
  });

  if (!active || heads.length === 0) return null;

  return (
    <group>
      {/* Mist: soft, fading with the fall, additive so it reads as water in
          light rather than as grey dots. */}
      <points ref={mistRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[mist.positions, 3]}
            count={mist.count}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          sizeAttenuation
          color="#bfe9ff"
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Flow: brighter, smaller, opaque — these are meant to be read as
          discrete markers moving along a line, not as a haze. */}
      <points ref={flowRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[flow.positions, 3]}
            count={flow.count}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.07}
          sizeAttenuation
          color="#38bdf8"
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
