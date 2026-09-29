"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingModel, BuildingSurface, Vector3 } from "@/lib/api";

/**
 * BuildingModel coordinate system is Z-up (height along z); three.js is Y-up.
 * (x, z, y) -> three (x, y, z)
 */
function toThree(v: Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, v.y);
}

export type ViewMode = "exterior" | "cutaway" | "floorplan" | "wireframe";

const MATERIAL_DEFS: Record<string, { color: string; roughness: number; metalness: number; label: string }> = {
  mat_stone: { color: "#64748b", roughness: 0.9, metalness: 0.05, label: "Stone / Slate" },
  mat_concrete: { color: "#94a3b8", roughness: 0.8, metalness: 0.05, label: "Concrete" },
  mat_reinforced_concrete: { color: "#475569", roughness: 0.75, metalness: 0.1, label: "Reinforced Concrete" },
  mat_plywood: { color: "#d4a373", roughness: 0.65, metalness: 0.0, label: "Plywood" },
  mat_wood_timber: { color: "#a16207", roughness: 0.7, metalness: 0.0, label: "Timber" },
  mat_puf: { color: "#fef08a", roughness: 0.85, metalness: 0.0, label: "PUF Insulation" },
  mat_steel_panel: { color: "#334155", roughness: 0.35, metalness: 0.5, label: "Steel Panel" },
  mat_adobe: { color: "#b45309", roughness: 0.95, metalness: 0.0, label: "Adobe Clay" },
  mat_rammed_earth: { color: "#92400e", roughness: 0.95, metalness: 0.0, label: "Rammed Earth" },
  mat_straw_clay: { color: "#d6c7a1", roughness: 0.9, metalness: 0.0, label: "Straw Clay" },
};

const DEFAULT_MAT = { color: "#94a3b8", roughness: 0.8, metalness: 0.05, label: "Composite" };

function getAssemblyMat(building: BuildingModel, assemblyId: string) {
  const asm = building.assemblies[assemblyId];
  const materialId = asm?.layers[0]?.material_id;
  return (materialId && MATERIAL_DEFS[materialId]) || DEFAULT_MAT;
}

/** Fan-triangulates the surface polygon into a BufferGeometry with smooth normals */
function surfaceGeometry(vertices: Vector3[]): THREE.BufferGeometry {
  const pts = vertices.map(toThree);
  const positions: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    positions.push(
      pts[0].x, pts[0].y, pts[0].z,
      pts[i].x, pts[i].y, pts[i].z,
      pts[i + 1].x, pts[i + 1].y, pts[i + 1].z
    );
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
  return new THREE.Vector3().crossVectors(e1, e2).normalize().negate();
}

function SurfaceMesh({
  surface,
  building,
  viewMode,
}: {
  surface: BuildingSurface;
  building: BuildingModel;
  viewMode: ViewMode;
}) {
  const geometry = useMemo(() => (surface.vertices ? surfaceGeometry(surface.vertices) : null), [surface.vertices]);
  const edgesGeometry = useMemo(() => (geometry ? new THREE.EdgesGeometry(geometry, 25) : null), [geometry]);
  if (!geometry) return null;

  const mat = getAssemblyMat(building, surface.assembly_id);
  const isInterior = surface.boundary_type === "adjacent_zone" || surface.surface_type === "partition";
  const isRoof = surface.surface_type === "roof";

  // In cutaway or floorplan, hide or fade the roof so interior is completely unobstructed
  if ((viewMode === "cutaway" || viewMode === "floorplan") && isRoof) {
    return (
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={mat.color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.12}
          roughness={mat.roughness}
        />
      </mesh>
    );
  }

  const opacity = isInterior ? 0.35 : 1.0;
  const isTransparent = isInterior || viewMode === "wireframe";

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={mat.color}
          side={THREE.DoubleSide}
          transparent={isTransparent}
          opacity={opacity}
          roughness={mat.roughness}
          metalness={mat.metalness}
          wireframe={viewMode === "wireframe"}
        />
      </mesh>
      {/* Subtle architectural edge highlight */}
      {edgesGeometry && viewMode !== "wireframe" && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial color="#1e293b" opacity={isInterior ? 0.3 : 0.6} transparent />
        </lineSegments>
      )}
    </group>
  );
}

function OpeningMesh({
  surface,
  ratio,
  kind,
}: {
  surface: BuildingSurface;
  ratio: number;
  kind: "window" | "door";
}) {
  const geometry = useMemo(() => {
    if (!surface.vertices) return null;
    const pts = surface.vertices.map(toThree);
    const center = surfaceCenter(surface.vertices);
    const normal = surfaceNormal(surface.vertices);
    const shrink = Math.min(0.92, Math.sqrt(Math.max(ratio, 0.08)));
    const scaled = pts.map((p) => center.clone().add(p.clone().sub(center).multiplyScalar(shrink)));
    const offset = normal.clone().multiplyScalar(0.02);
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

  const frameGeometry = useMemo(() => (geometry ? new THREE.EdgesGeometry(geometry, 20) : null), [geometry]);

  if (!geometry) return null;

  const isWindow = kind === "window";

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={isWindow ? "#38bdf8" : "#78350f"}
          side={THREE.DoubleSide}
          transparent={isWindow}
          opacity={isWindow ? 0.65 : 0.95}
          metalness={isWindow ? 0.4 : 0.05}
          roughness={isWindow ? 0.1 : 0.7}
        />
      </mesh>
      {frameGeometry && (
        <lineSegments geometry={frameGeometry}>
          <lineBasicMaterial color={isWindow ? "#0284c7" : "#451a03"} linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
}

function ZoneLabel({
  building,
  zoneId,
  floorElevation,
  viewMode,
}: {
  building: BuildingModel;
  zoneId: string;
  floorElevation: number;
  viewMode: ViewMode;
}) {
  const zone = building.floors.flatMap((f) => f.zones).find((z) => z.id === zoneId);
  if (!zone) return null;

  const cx = zone.origin_m.x + zone.size_m.length_m / 2;
  const cy = zone.origin_m.y + zone.size_m.width_m / 2;
  // In cutaway or floorplan, elevate label right above the floor so it's clearly readable inside
  const cz = viewMode === "cutaway" || viewMode === "floorplan"
    ? floorElevation + 0.35
    : floorElevation + zone.size_m.height_m + 0.2;

  const areaM2 = (zone.size_m.length_m * zone.size_m.width_m).toFixed(1);

  return (
    <group position={[cx, cz, cy]}>
      <Text
        fontSize={0.32}
        color="#0f172a"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.03}
        outlineColor="#ffffff"
        rotation={viewMode === "floorplan" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      >
        {`${zone.type.toUpperCase()}`}
      </Text>
      <Text
        position={[0, viewMode === "floorplan" ? 0.3 : -0.22, 0]}
        fontSize={0.22}
        color="#475569"
        anchorX="center"
        anchorY="top"
        outlineWidth={0.02}
        outlineColor="#ffffff"
        rotation={viewMode === "floorplan" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      >
        {`${areaM2} m²`}
      </Text>
    </group>
  );
}

/** Controls camera position smoothly across modes and reset triggers */
function CameraController({
  bbox,
  mode,
  resetTrigger,
}: {
  bbox: { center: [number, number, number]; maxDim: number };
  mode: ViewMode;
  resetTrigger: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const [cx, cy, cz] = bbox.center;
    const d = bbox.maxDim * 1.6;

    if (mode === "floorplan") {
      camera.position.set(cx, cy + d * 1.5, cz + 0.01);
    } else if (mode === "cutaway") {
      camera.position.set(cx + d * 0.9, cy + d * 0.95, cz + d * 0.9);
    } else {
      // standard isometric view
      camera.position.set(cx + d * 1.1, cy + d * 0.8, cz + d * 1.1);
    }

    camera.lookAt(cx, cy, cz);
    camera.near = 0.1;
    camera.far = 1000;
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(cx, cy, cz);
      controlsRef.current.update();
    }
  }, [bbox, mode, resetTrigger, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={bbox.center}
      maxPolarAngle={mode === "floorplan" ? Math.PI / 2 - 0.05 : Math.PI / 2 + 0.05}
      minDistance={1}
      maxDistance={bbox.maxDim * 5}
      makeDefault
    />
  );
}

function Scene({
  building,
  viewMode,
  resetTrigger,
}: {
  building: BuildingModel;
  viewMode: ViewMode;
  resetTrigger: number;
}) {
  const bbox = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    building.surfaces.forEach((s) => {
      s.vertices?.forEach((v) => {
        const p = toThree(v);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
    });

    const cx = (minX + maxX) / 2 || 0;
    const cy = (minY + maxY) / 2 || 1.4;
    const cz = (minZ + maxZ) / 2 || 0;
    const sizeX = maxX - minX || 8;
    const sizeY = maxY - minY || 3;
    const sizeZ = maxZ - minZ || 6;
    const maxDim = Math.max(sizeX, sizeY, sizeZ, 6);

    return { center: [cx, cy, cz] as [number, number, number], maxDim };
  }, [building]);

  const zoneFloorElevation = useMemo(() => {
    const map = new Map<string, number>();
    building.floors.forEach((f) => f.zones.forEach((z) => map.set(z.id, f.elevation_m)));
    return map;
  }, [building]);

  const [cx, , cz] = bbox.center;
  const gridDim = Math.max(bbox.maxDim * 3, 20);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[cx + bbox.maxDim * 1.5, bbox.maxDim * 2.5, cz + bbox.maxDim * 1.5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      <directionalLight
        position={[cx - bbox.maxDim, bbox.maxDim * 1.2, cz - bbox.maxDim]}
        intensity={0.4}
      />

      {/* Engineering Ground Grid */}
      <Grid
        args={[gridDim, gridDim]}
        position={[cx, 0, cz]}
        cellColor="#cbd5e1"
        sectionColor="#94a3b8"
        fadeDistance={gridDim * 1.2}
        cellThickness={0.8}
        sectionThickness={1.4}
      />

      {/* Building Surfaces */}
      {building.surfaces.map((s) => (
        <SurfaceMesh key={s.id} surface={s} building={building} viewMode={viewMode} />
      ))}

      {/* Window & Door Openings */}
      {building.openings.map((o) => {
        const parent = building.surfaces.find((s) => s.id === o.parent_surface_id);
        if (!parent) return null;
        return <OpeningMesh key={o.id} surface={parent} ratio={o.area_m2 / parent.area_m2} kind={o.opening_type} />;
      })}

      {/* Zone Annotations */}
      {Array.from(zoneFloorElevation.entries()).map(([zoneId, elevation]) => (
        <ZoneLabel
          key={zoneId}
          building={building}
          zoneId={zoneId}
          floorElevation={elevation}
          viewMode={viewMode}
        />
      ))}

      <CameraController bbox={bbox} mode={viewMode} resetTrigger={resetTrigger} />
    </>
  );
}

export default function BuildingViewer3D({ building }: { building: BuildingModel }) {
  const [viewMode, setViewMode] = useState<ViewMode>("exterior");
  const [resetTrigger, setResetTrigger] = useState(0);

  // Derive all active materials present in this specific building
  const activeMaterials = useMemo(() => {
    const set = new Set<string>();
    Object.values(building.assemblies).forEach((asm) => {
      asm.layers?.forEach((l) => set.add(l.material_id));
    });
    return Array.from(set).map((id) => ({
      id,
      ...(MATERIAL_DEFS[id] || { color: "#94a3b8", label: id }),
    }));
  }, [building]);

  return (
    <div className="w-full flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-card">
      {/* Viewer Header / Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface-container-low border-b border-outline-variant">
        <div className="flex items-center gap-1 bg-surface-container rounded-xl p-1 border border-outline-variant/60">
          <button
            type="button"
            onClick={() => setViewMode("exterior")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-mono-xs text-[11px] font-semibold transition-all ${
              viewMode === "exterior"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">home</span>
            Exterior 3D
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cutaway")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-mono-xs text-[11px] font-semibold transition-all ${
              viewMode === "cutaway"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">content_cut</span>
            Interior Cutaway
          </button>
          <button
            type="button"
            onClick={() => setViewMode("floorplan")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-mono-xs text-[11px] font-semibold transition-all ${
              viewMode === "floorplan"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">dashboard</span>
            Top-Down Plan
          </button>
          <button
            type="button"
            onClick={() => setViewMode("wireframe")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-mono-xs text-[11px] font-semibold transition-all ${
              viewMode === "wireframe"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">grid_4x4</span>
            Wireframe
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setResetTrigger((n) => n + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container font-label-mono-xs text-[11px] font-medium transition-colors"
            title="Reset to default camera angle"
          >
            <span className="material-symbols-outlined text-[14px]">restart_alt</span>
            Reset View
          </button>
        </div>
      </div>

      {/* 3D Canvas Area */}
      <div className="relative w-full h-[480px] sm:h-[540px] bg-gradient-to-b from-slate-100 via-sky-50/50 to-slate-200">
        <Canvas shadows camera={{ position: [14, 10, 14], fov: 42 }}>
          <Scene building={building} viewMode={viewMode} resetTrigger={resetTrigger} />
        </Canvas>

        {/* Material Legend Badge Overlay */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 px-3 py-1.5 bg-surface-container-lowest/90 backdrop-blur-md rounded-xl border border-outline-variant/60 shadow-sm pointer-events-none">
          <span className="font-label-mono-xs text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
            Materials:
          </span>
          {activeMaterials.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: m.color }} />
              <span className="font-body-sm text-[11px] text-on-surface font-medium">{m.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pl-1 border-l border-outline-variant/50">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-black/10 shrink-0" />
            <span className="font-body-sm text-[11px] text-on-surface font-medium">Glazing</span>
          </div>
        </div>

        {/* View Mode Indicator */}
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant/50 text-[10px] font-label-mono-xs uppercase tracking-wider text-primary font-bold">
          {viewMode === "cutaway" ? "Interior Cutaway View" : viewMode === "floorplan" ? "Plan View" : viewMode === "wireframe" ? "Structural Wireframe" : "Exterior Isometric"}
        </div>

        {/* Interaction Hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant/50 text-[11px] font-body-sm text-on-surface-variant shadow-sm pointer-events-none">
          Left-click + drag to rotate • Scroll to zoom • Right-click to pan
        </div>
      </div>
    </div>
  );
}
