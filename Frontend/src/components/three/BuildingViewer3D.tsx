"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingModel, BuildingSurface, Vector3 } from "@/lib/api";

/**
 * Renders the exact BuildingModel M2 solved against (real vertex-level wall/roof/floor
 * polygons, not an approximation) — see backend/routes/pipeline.py GET .../designs/{design_id}.
 * BuildingModel is Z-up (height along z); three.js is Y-up, so every point is remapped
 * (x, z, y) -> three (x, y, z) once, here, and nowhere else in this file.
 */
function toThree(v: Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, v.y);
}

const MATERIAL_COLORS: Record<string, string> = {
  mat_stone: "#9a9a92",
  mat_concrete: "#b9b9b9",
  mat_plywood: "#c9a06a",
  mat_puf: "#f2e9c9",
};
const DEFAULT_COLOR = "#c7cdd6";

function assemblyColor(building: BuildingModel, assemblyId: string): string {
  const asm = building.assemblies[assemblyId];
  const materialId = asm?.layers[0]?.material_id;
  return (materialId && MATERIAL_COLORS[materialId]) || DEFAULT_COLOR;
}

/** Fan-triangulates the (planar, convex) surface polygon into a BufferGeometry. */
function surfaceGeometry(vertices: Vector3[]): THREE.BufferGeometry {
  const pts = vertices.map(toThree);
  const positions: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    positions.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function surfaceCenter(vertices: Vector3[]): THREE.Vector3 {
  const pts = vertices.map(toThree);
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  return c.divideScalar(pts.length);
}

function surfaceNormal(vertices: Vector3[]): THREE.Vector3 {
  const pts = vertices.map(toThree);
  const e1 = new THREE.Vector3().subVectors(pts[1], pts[0]);
  const e2 = new THREE.Vector3().subVectors(pts[2], pts[0]);
  // toThree() swaps y/z, an orientation-reversing transform — it flips cross-product handedness,
  // so the raw cross product here points INWARD relative to the vertex winding in BuildingModel's
  // original (right-handed, Z-up) space. Negate to get the true outward normal.
  return new THREE.Vector3().crossVectors(e1, e2).normalize().negate();
}

function SurfaceMesh({ surface, color }: { surface: BuildingSurface; color: string }) {
  const geometry = useMemo(() => (surface.vertices ? surfaceGeometry(surface.vertices) : null), [surface.vertices]);
  if (!geometry) return null;
  const isInterior = surface.boundary_type === "adjacent_zone" || surface.surface_type === "partition";
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        transparent={isInterior}
        opacity={isInterior ? 0.28 : 1}
        roughness={0.85}
      />
    </mesh>
  );
}

function OpeningMesh({ surface, ratio, kind }: { surface: BuildingSurface; ratio: number; kind: "window" | "door" }) {
  const geometry = useMemo(() => {
    if (!surface.vertices) return null;
    const pts = surface.vertices.map(toThree);
    const center = surfaceCenter(surface.vertices);
    const normal = surfaceNormal(surface.vertices);
    const shrink = Math.min(0.9, Math.sqrt(Math.max(ratio, 0.05)));
    const scaled = pts.map((p) => center.clone().add(p.clone().sub(center).multiplyScalar(shrink)));
    const offset = normal.clone().multiplyScalar(0.015);
    const positions: number[] = [];
    for (let i = 1; i < scaled.length - 1; i++) {
      const a = scaled[0].clone().add(offset);
      const b = scaled[i].clone().add(offset);
      const c = scaled[i + 1].clone().add(offset);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [surface.vertices, ratio]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={kind === "window" ? "#7ec8e3" : "#5a3d24"}
        side={THREE.DoubleSide}
        transparent={kind === "window"}
        opacity={kind === "window" ? 0.55 : 1}
        metalness={kind === "window" ? 0.2 : 0}
        roughness={kind === "window" ? 0.1 : 0.9}
      />
    </mesh>
  );
}

function ZoneLabel({ building, zoneId, floorElevation }: { building: BuildingModel; zoneId: string; floorElevation: number }) {
  const zone = building.floors.flatMap((f) => f.zones).find((z) => z.id === zoneId);
  if (!zone) return null;
  const cx = zone.origin_m.x + zone.size_m.length_m / 2;
  const cy = zone.origin_m.y + zone.size_m.width_m / 2;
  const cz = floorElevation + zone.size_m.height_m + 0.15;
  return (
    <Text position={[cx, cz, cy]} fontSize={0.28} color="#1f2937" anchorX="center" anchorY="bottom">
      {zone.type}
    </Text>
  );
}

function Scene({ building }: { building: BuildingModel }) {
  const extentM = useMemo(() => {
    const xs = building.surfaces.flatMap((s) => s.vertices?.map((v) => v.x) ?? []);
    const ys = building.surfaces.flatMap((s) => s.vertices?.map((v) => v.y) ?? []);
    const maxX = Math.max(1, ...xs, 0);
    const maxY = Math.max(1, ...ys, 0);
    return Math.max(maxX, maxY);
  }, [building]);

  const zoneFloorElevation = useMemo(() => {
    const map = new Map<string, number>();
    building.floors.forEach((f) => f.zones.forEach((z) => map.set(z.id, f.elevation_m)));
    return map;
  }, [building]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[extentM, extentM * 1.5, extentM]} intensity={1.1} castShadow />
      <Grid args={[extentM * 4, extentM * 4]} position={[extentM / 2, 0, extentM / 2]} cellColor="#d8dee6" sectionColor="#b7c0cc" fadeDistance={extentM * 6} />
      {building.surfaces.map((s) => (
        <SurfaceMesh key={s.id} surface={s} color={assemblyColor(building, s.assembly_id)} />
      ))}
      {building.openings.map((o) => {
        const parent = building.surfaces.find((s) => s.id === o.parent_surface_id);
        if (!parent) return null;
        return <OpeningMesh key={o.id} surface={parent} ratio={o.area_m2 / parent.area_m2} kind={o.opening_type} />;
      })}
      {Array.from(zoneFloorElevation.entries()).map(([zoneId, elevation]) => (
        <ZoneLabel key={zoneId} building={building} zoneId={zoneId} floorElevation={elevation} />
      ))}
      <OrbitControls target={[extentM / 2, 1.2, extentM / 2]} makeDefault />
    </>
  );
}

export default function BuildingViewer3D({ building }: { building: BuildingModel }) {
  return (
    <div className="w-full h-[480px] rounded-xl overflow-hidden bg-gradient-to-b from-sky-100 to-surface-container-low">
      <Canvas shadows camera={{ position: [10, 8, 10], fov: 45 }}>
        <Scene building={building} />
      </Canvas>
    </div>
  );
}
