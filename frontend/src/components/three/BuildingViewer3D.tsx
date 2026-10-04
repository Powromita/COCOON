"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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
  isolatedFloor,
}: {
  surface: BuildingSurface;
  building: BuildingModel;
  viewMode: ViewMode;
  isolatedFloor: boolean;
}) {
  const geometry = useMemo(() => (surface.vertices ? surfaceGeometry(surface.vertices) : null), [surface.vertices]);
  const edgesGeometry = useMemo(() => (geometry ? new THREE.EdgesGeometry(geometry, 25) : null), [geometry]);
  if (!geometry) return null;

  const mat = getAssemblyMat(building, surface.assembly_id);
  const isInterior = surface.boundary_type === "adjacent_zone" || surface.surface_type === "partition";
  // When one floor of a multi-storey plan is isolated, the slab above it must not hide the rooms either
  const isRoof = surface.surface_type === "roof" || (isolatedFloor && surface.surface_type === "ceiling");

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


function GroundCompass({
  position,
  radius,
  orientationDeg = 180,
}: {
  position: [number, number, number];
  radius: number;
  orientationDeg?: number;
}) {
  const r = Math.max(radius, 2.2);
  const needleLen = r * 0.85;
  const needleWidth = r * 0.16;

  return (
    <group position={position}>
      {/* Outer Compass Dial Ring on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[r * 0.94, r, 48]} />
        <meshBasicMaterial color="#334155" side={THREE.DoubleSide} transparent opacity={0.65} />
      </mesh>

      {/* Inner Accent Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[r * 0.5, r * 0.53, 36]} />
        <meshBasicMaterial color="#64748b" side={THREE.DoubleSide} transparent opacity={0.45} />
      </mesh>

      {/* Center Pivot Disk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[r * 0.14, 24]} />
        <meshBasicMaterial color="#0f172a" side={THREE.DoubleSide} />
      </mesh>

      {/* North Needle (Red / Crimson, points to -Z True North) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -needleLen / 2]}>
        <coneGeometry args={[needleWidth, needleLen, 4]} />
        <meshStandardMaterial color="#ef4444" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* South Needle (Amber / Gold, points to +Z True South / Solar Glazing) */}
      <mesh rotation={[-Math.PI / 2, Math.PI, 0]} position={[0, 0.02, needleLen / 2]}>
        <coneGeometry args={[needleWidth * 0.9, needleLen, 4]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* East-West Crossbars */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[needleLen * 0.42, 0.016, 0]}>
        <boxGeometry args={[needleLen * 0.75, 0.03, 0.01]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-needleLen * 0.42, 0.016, 0]}>
        <boxGeometry args={[needleLen * 0.75, 0.03, 0.01]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>

      {/* North 'N' Label */}
      <Text
        position={[0, 0.05, -r * 1.25]}
        fontSize={r * 0.3}
        color="#ef4444"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.035}
        outlineColor="#ffffff"
      >
        N
      </Text>

      {/* South 'S' Label with Solar Annotation */}
      <Text
        position={[0, 0.05, r * 1.28]}
        fontSize={r * 0.24}
        color="#d97706"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.035}
        outlineColor="#ffffff"
      >
        S (SOLAR)
      </Text>

      {/* East 'E' Label */}
      <Text
        position={[r * 1.25, 0.05, 0]}
        fontSize={r * 0.24}
        color="#475569"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.03}
        outlineColor="#ffffff"
      >
        E
      </Text>

      {/* West 'W' Label */}
      <Text
        position={[-r * 1.25, 0.05, 0]}
        fontSize={r * 0.24}
        color="#475569"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
        outlineWidth={0.03}
        outlineColor="#ffffff"
      >
        W
      </Text>
    </group>
  );
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Reports where scene-north (-Z, the axis GroundCompass labels "N") appears on screen,
 * as degrees clockwise from screen-up. Sampled every frame so drags, rotate steps and
 * resets all drive the same value.
 */
function HeadingSync({ onChange }: { onChange: (screenNorthDeg: number) => void }) {
  const { camera } = useThree();
  const last = useRef<number | null>(null);
  useFrame(() => {
    const e = camera.matrixWorld.elements; // column 0 = right, column 1 = up
    let deg = (Math.atan2(-e[2], -e[6]) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (last.current === null || Math.abs(((deg - last.current + 540) % 360) - 180) > 0.2) {
      last.current = deg;
      onChange(deg);
    }
  });
  return null;
}

/** Controls camera position smoothly across modes, reset triggers, and 360-degree rotation */
function CameraController({
  bbox,
  mode,
  resetTrigger,
  rotationStep,
}: {
  bbox: { center: [number, number, number]; maxDim: number };
  mode: ViewMode;
  resetTrigger: number;
  rotationStep: { angle: number; id: number };
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

  // Handle manual 360 step rotation triggers
  useEffect(() => {
    if (!controlsRef.current || rotationStep.id === 0) return;
    const [cx, , cz] = bbox.center;
    const px = camera.position.x - cx;
    const pz = camera.position.z - cz;
    const currentAngle = Math.atan2(px, pz);
    const radius = Math.sqrt(px * px + pz * pz);
    const newAngle = currentAngle + rotationStep.angle;

    camera.position.x = cx + radius * Math.sin(newAngle);
    camera.position.z = cz + radius * Math.cos(newAngle);
    camera.lookAt(bbox.center[0], bbox.center[1], bbox.center[2]);
    controlsRef.current.update();
  }, [rotationStep, bbox, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={bbox.center}
      maxPolarAngle={mode === "floorplan" ? Math.PI / 2 - 0.05 : Math.PI / 2 + 0.05}
      minDistance={1}
      maxDistance={bbox.maxDim * 5}
      autoRotate={false}
      enableDamping={true}
      dampingFactor={0.05}
      minAzimuthAngle={-Infinity}
      maxAzimuthAngle={Infinity}
      makeDefault
    />
  );
}

function Scene({
  building,
  viewMode,
  resetTrigger,
  rotationStep,
  onHeadingChange,
  planFloorId,
}: {
  building: BuildingModel;
  viewMode: ViewMode;
  resetTrigger: number;
  rotationStep: { angle: number; id: number };
  onHeadingChange: (screenNorthDeg: number) => void;
  /** Set only in the multi-storey top-down plan: the single floor to draw. */
  planFloorId: string | null;
}) {
  // Surfaces, openings and zone labels of the isolated floor (everything when no floor is isolated)
  const visible = useMemo(() => {
    if (!planFloorId) {
      return { surfaces: building.surfaces, openings: building.openings, zoneIds: null as Set<string> | null };
    }
    const floor = building.floors.find((f) => f.id === planFloorId);
    const zoneIds = new Set((floor?.zones ?? []).map((z) => z.id));
    const surfaces = building.surfaces.filter((sf) => zoneIds.has(sf.owning_zone_id));
    const surfaceIds = new Set(surfaces.map((sf) => sf.id));
    return { surfaces, openings: building.openings.filter((o) => surfaceIds.has(o.parent_surface_id)), zoneIds };
  }, [building, planFloorId]);

  const bbox = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    visible.surfaces.forEach((s) => {
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
  }, [visible]);

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
      {visible.surfaces.map((s) => (
        <SurfaceMesh key={s.id} surface={s} building={building} viewMode={viewMode} isolatedFloor={planFloorId !== null} />
      ))}

      {/* Window & Door Openings */}
      {visible.openings.map((o) => {
        const parent = building.surfaces.find((s) => s.id === o.parent_surface_id);
        if (!parent) return null;
        return <OpeningMesh key={o.id} surface={parent} ratio={o.area_m2 / parent.area_m2} kind={o.opening_type} />;
      })}

      {/* 3D Directional Compass on Ground */}
      <GroundCompass
        position={[cx - bbox.maxDim * 0.72, 0.02, cz + bbox.maxDim * 0.72]}
        radius={Math.max(2.4, bbox.maxDim * 0.22)}
        orientationDeg={building.orientation_deg}
      />

      {/* Zone Annotations */}
      {Array.from(zoneFloorElevation.entries())
        .filter(([zoneId]) => !visible.zoneIds || visible.zoneIds.has(zoneId))
        .map(([zoneId, elevation]) => (
        <ZoneLabel
          key={zoneId}
          building={building}
          zoneId={zoneId}
          floorElevation={elevation}
          viewMode={viewMode}
        />
      ))}

      <CameraController bbox={bbox} mode={viewMode} resetTrigger={resetTrigger} rotationStep={rotationStep} />
      <HeadingSync onChange={onHeadingChange} />
    </>
  );
}

export default function BuildingViewer3D({ building }: { building: BuildingModel }) {
  const [viewMode, setViewMode] = useState<ViewMode>("exterior");
  const [resetTrigger, setResetTrigger] = useState(0);
  const [rotationStep, setRotationStep] = useState<{ angle: number; id: number }>({ angle: 0, id: 0 });
  // Screen angle of north, shared by the on-canvas dial and the in-scene ground compass.
  const [northDeg, setNorthDeg] = useState(0);
  // Multi-storey buildings: the top-down plan shows one floor at a time so floors never overlap.
  const floorsByLevel = useMemo(() => [...building.floors].sort((a, b) => a.level - b.level), [building]);
  const multiFloor = floorsByLevel.length > 1;
  const [planFloorIndex, setPlanFloorIndex] = useState(0);
  const activeFloor = floorsByLevel[Math.min(planFloorIndex, floorsByLevel.length - 1)];
  const planFloorId = viewMode === "floorplan" && multiFloor && activeFloor ? activeFloor.id : null;
  const viewBearing = Math.round((360 - northDeg) % 360);
  const viewCardinal = CARDINALS[Math.round(viewBearing / 45) % 8];

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
        <div className="flex flex-wrap items-center gap-1 bg-surface-container rounded-xl p-1 border border-outline-variant/60 max-w-full">
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

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Manual 360 Step Rotation Controls */}
          <button
            type="button"
            onClick={() => setRotationStep((s) => ({ angle: -Math.PI / 4, id: s.id + 1 }))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container font-label-mono-xs text-[11px] font-medium transition-colors"
            title="Rotate view 45° counter-clockwise"
          >
            <span className="material-symbols-outlined text-[15px]">rotate_left</span>
            Rotate -45°
          </button>
          <button
            type="button"
            onClick={() => setRotationStep((s) => ({ angle: Math.PI / 4, id: s.id + 1 }))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container font-label-mono-xs text-[11px] font-medium transition-colors"
            title="Rotate view 45° clockwise"
          >
            <span className="material-symbols-outlined text-[15px]">rotate_right</span>
            Rotate +45°
          </button>

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

      {/* Floor selector: one top-down plan per floor */}
      {viewMode === "floorplan" && multiFloor && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-surface-container-low border-b border-outline-variant">
          <span className="font-label-mono-xs text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
            Floor plan:
          </span>
          <div className="flex flex-wrap items-center gap-1 bg-surface-container rounded-xl p-1 border border-outline-variant/60">
            {floorsByLevel.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPlanFloorIndex(i)}
                className={`px-3 py-1 rounded-lg font-label-mono-xs text-[11px] font-semibold transition-all ${
                  activeFloor?.id === f.id
                    ? "bg-surface-container-lowest text-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {f.level === 0 ? "Ground floor" : `Floor ${f.level + 1}`}
              </button>
            ))}
          </div>
          <span className="font-body-sm text-[11px] text-on-surface-variant">
            {activeFloor?.zones.length ?? 0} room{(activeFloor?.zones.length ?? 0) === 1 ? "" : "s"} on this floor
          </span>
        </div>
      )}

      {/* 3D Canvas Area */}
      <div className="relative w-full h-[380px] sm:h-[480px] lg:h-[540px] bg-gradient-to-b from-slate-100 via-sky-50/50 to-slate-200">
        <Canvas shadows camera={{ position: [14, 10, 14], fov: 42 }}>
          <Scene building={building} viewMode={viewMode} resetTrigger={resetTrigger} rotationStep={rotationStep} onHeadingChange={setNorthDeg} planFloorId={planFloorId} />
        </Canvas>

        {/* Material Legend Badge Overlay */}
        <div className="absolute top-3 left-3 max-w-[calc(100%-5.5rem)] flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 bg-surface-container-lowest/90 backdrop-blur-md rounded-xl border border-outline-variant/60 shadow-sm pointer-events-none">
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

        {/* Navigational Compass (Top-Right Corner) */}
        <div className="absolute top-3 right-3 flex flex-col items-center gap-1 z-10 select-none pointer-events-auto">
          <div
            className="relative w-14 h-14 rounded-full bg-surface-container-lowest/95 backdrop-blur-md border border-outline-variant shadow-md flex items-center justify-center p-1.5 hover:shadow-lg transition-shadow cursor-default"
            title={`Camera facing ${viewBearing}° ${viewCardinal} · building orientation ${building.orientation_deg ?? 180}°`}
          >
            <svg className="w-full h-full" viewBox="0 0 100 100">
              {/* Dial turns with the camera so N/E/S/W always point where they do in the scene */}
              <g transform={`rotate(${northDeg.toFixed(1)}, 50, 50)`}>
                <circle cx="50" cy="50" r="46" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2 3" />
                <circle cx="50" cy="50" r="38" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.2" />

                <text x="50" y="16" fill="#dc2626" fontSize="12" fontWeight="800" textAnchor="middle">N</text>
                <text x="50" y="93" fill="#d97706" fontSize="11" fontWeight="700" textAnchor="middle">S</text>
                <text x="92" y="54" fill="#64748b" fontSize="10" fontWeight="600" textAnchor="middle">E</text>
                <text x="8" y="54" fill="#64748b" fontSize="10" fontWeight="600" textAnchor="middle">W</text>

                {/* Orientation needle (building azimuth, fixed to the dial) */}
                <g transform={`rotate(${-(building.orientation_deg ?? 180) + 180}, 50, 50)`}>
                  <polygon points="50,18 45,50 55,50" fill="#dc2626" />
                  <polygon points="50,82 45,50 55,50" fill="#d97706" />
                </g>
              </g>
              <circle cx="50" cy="50" r="3.5" fill="#1e293b" />
              <circle cx="50" cy="50" r="1.5" fill="#ffffff" />
              {/* Fixed lubber mark: the direction the camera is facing */}
              <polygon points="50,1 46,8 54,8" fill="#1e293b" />
            </svg>
          </div>
          <span className="font-label-mono-xs text-[10px] font-bold text-on-surface bg-surface-container-lowest/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-outline-variant/60 shadow-xs">
            View {viewBearing}° {viewCardinal}
          </span>
        </div>

        {/* Interaction Hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-1.5rem)] text-center px-3.5 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md border border-outline-variant/60 text-[11px] font-body-sm text-on-surface-variant shadow-sm pointer-events-none">
          Drag to rotate · Scroll to zoom · Right-click to pan
        </div>
      </div>
    </div>
  );
}
