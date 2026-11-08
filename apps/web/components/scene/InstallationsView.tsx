'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuildingModel, InstallationPoint, InstallationPointKind, InstallationsReport } from '@chalecad/engine';
import { formatNumber } from '@/lib/format';
import { installationSymbols } from '@/lib/plan2d/installationSymbols';
import { installationRoutes, kindColor, placePoint, pointCircuit, POINT_LABELS, SYSTEM_COLORS, type PlacedPoint } from '@/lib/three/installations';
import { PLAN_CUT_HEIGHT, explodeGap } from '@/lib/three/views';
import { ExplodeGroup } from './ExplodeGroup';
import { SceneLabel } from './labels';

type Kind = InstallationPointKind;

interface Item {
  point: InstallationPoint;
  placed: PlacedPoint;
}

/** Geometria base (unitária no referencial local: x = normal da placa; z = para cima) de cada tipo instanciado. */
function makeGeometry(kind: Kind): THREE.BufferGeometry {
  switch (kind) {
    case 'outlet':
    case 'outlet_high':
      return new THREE.BoxGeometry(0.018, 0.11, 0.11);
    case 'switch':
      return new THREE.BoxGeometry(0.018, 0.07, 0.11);
    case 'tue':
      return new THREE.BoxGeometry(0.022, 0.13, 0.13);
    case 'panel':
      return new THREE.BoxGeometry(0.12, 0.4, 0.5);
    case 'light': {
      const g = new THREE.CylinderGeometry(0.14, 0.14, 0.022, 20);
      g.rotateX(Math.PI / 2);
      return g;
    }
    case 'water_cold':
    case 'water_hot':
      return new THREE.SphereGeometry(0.06, 12, 8);
    case 'sewer':
    case 'drain': {
      const g = new THREE.CylinderGeometry(kind === 'sewer' ? 0.06 : 0.045, kind === 'sewer' ? 0.06 : 0.045, 0.012, 16);
      g.rotateX(Math.PI / 2);
      return g;
    }
    case 'tank':
      return new THREE.BoxGeometry(0.1, 0.1, 0.1); // não usado: a caixa tem componente próprio
  }
}

/** Um InstancedMesh por tipo de ponto. */
function InstancedKind({ kind, items, onPick }: { kind: Kind; items: Item[]; onPick: (p: InstallationPoint) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => makeGeometry(kind), [kind]);
  const color = kindColor(kind);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      const { position, yaw } = it.placed;
      // a placa encosta na face da parede: afasta metade da espessura ao longo da normal
      const off = kind === 'light' || kind === 'sewer' || kind === 'drain' ? 0 : kind === 'panel' ? 0.06 : 0.01;
      o.position.set(position[0] + Math.cos(yaw) * off, position[1] + Math.sin(yaw) * off, position[2] + (kind === 'light' ? -0.009 : kind === 'sewer' || kind === 'drain' ? 0.008 : 0));
      o.rotation.set(0, 0, kind === 'light' || kind === 'sewer' || kind === 'drain' ? 0 : yaw);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, kind]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
      frustumCulled={false}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 4 || e.instanceId === undefined) return;
        const it = items[e.instanceId];
        if (!it) return;
        e.stopPropagation();
        onPick(it.point);
      }}
    >
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} emissive={color} emissiveIntensity={0.25} />
    </instancedMesh>
  );
}

function Tank({ item, liters, onPick }: { item: Item; liters: number; onPick: (p: InstallationPoint) => void }) {
  const r = Math.min(0.8, 0.28 + liters / 3000);
  const h = r * 1.1;
  const [x, y, z] = item.placed.position;
  return (
    <group position={[x, y, z]}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          onPick(item.point);
        }}
      >
        <cylinderGeometry args={[r, r, h, 28]} />
        <meshStandardMaterial color={SYSTEM_COLORS.cold} roughness={0.45} transparent opacity={0.85} />
      </mesh>
      <SceneLabel position={[0, 0, h / 2 + 0.12]} tone="dim">
        {formatNumber(liters, 0)} L
      </SceneLabel>
    </group>
  );
}

/** Traçado esquemático: um LineSegments por sistema (elétrica, AF, AQ). */
function Routes({ report, elevations }: { report: InstallationsReport; elevations: Record<string, number> }) {
  const groups = useMemo(() => {
    const by: Record<'electric' | 'cold' | 'hot', number[]> = { electric: [], cold: [], hot: [] };
    for (const r of installationRoutes(report, elevations)) {
      for (let i = 0; i + 1 < r.pts.length; i++) by[r.system].push(...r.pts[i]!, ...r.pts[i + 1]!);
    }
    return (Object.keys(by) as (keyof typeof by)[]).filter((k) => by[k].length > 0).map((k) => ({ system: k, geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(by[k], 3)) }));
  }, [report, elevations]);
  useEffect(() => () => groups.forEach((g) => g.geometry.dispose()), [groups]);
  return (
    <>
      {groups.map((g) => (
        <lineSegments key={g.system} geometry={g.geometry} frustumCulled={false}>
          <lineBasicMaterial color={SYSTEM_COLORS[g.system]} transparent opacity={0.7} />
        </lineSegments>
      ))}
    </>
  );
}

const fmtPower = (va: number) => `${formatNumber(va, 0)} VA`;

function Tooltip({ point, report, item, onClose }: { point: InstallationPoint; report: InstallationsReport; item: Item | undefined; onClose: () => void }) {
  const c = pointCircuit(point, report.circuits);
  const pos = item?.placed.position ?? [point.position[0], point.position[1], point.height];
  return (
    <Html position={[pos[0], pos[1], pos[2] + 0.12]} center zIndexRange={[30, 0]}>
      <div role="tooltip" className="pointer-events-auto min-w-36 -translate-y-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] leading-4 text-stone-700 shadow-float">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-stone-900">{point.label || POINT_LABELS[point.kind]}</span>
          <button type="button" aria-label="Fechar" onClick={onClose} className="-mt-0.5 text-stone-400 hover:text-stone-700">
            ×
          </button>
        </div>
        <div className="text-stone-500">{POINT_LABELS[point.kind]}</div>
        {c ? (
          <div className="mt-0.5 tabular-nums">
            {c.label} · {fmtPower(c.power)} · {c.wire} mm² · {c.breaker} A
          </div>
        ) : null}
      </div>
    </Html>
  );
}

export interface InstallationsViewProps {
  model: BuildingModel;
  report: InstallationsReport;
  /** Cota do piso de cada nível. */
  elevations: Record<string, number>;
  exploded?: boolean;
  interactive?: boolean;
}

const KINDS: Kind[] = ['outlet', 'outlet_high', 'switch', 'tue', 'light', 'panel', 'water_cold', 'water_hot', 'sewer', 'drain'];

/**
 * Pontos de instalações no 3D (referencial do motor, dentro do MotorGroup): um InstancedMesh por tipo, caixa d'água,
 * traçado esquemático e tooltip no clique.
 */
export function InstallationsView({ model, report, elevations, exploded = false, interactive = true }: InstallationsViewProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const gap = explodeGap(model.ridgeHeight);
  const items = useMemo<Item[]>(() => report.points.map((point) => ({ point, placed: placePoint(point, model.walls, elevations[point.level] ?? 0) })), [report.points, model.walls, elevations]);
  const byKind = useMemo(() => {
    const m = new Map<Kind, Item[]>();
    for (const it of items) m.set(it.point.kind, [...(m.get(it.point.kind) ?? []), it]);
    return m;
  }, [items]);
  const tank = byKind.get('tank')?.[0];
  const pickedPoint = picked ? report.points.find((p) => p.id === picked) : undefined;
  const onPick = interactive ? (p: InstallationPoint) => setPicked((cur) => (cur === p.id ? null : p.id)) : () => undefined;

  return (
    <ExplodeGroup layer="closure" active={exploded} gap={gap}>
      {KINDS.map((k) => (
        <InstancedKind key={k} kind={k} items={byKind.get(k) ?? []} onPick={onPick} />
      ))}
      {tank ? <Tank item={tank} liters={report.tankLiters} onPick={onPick} /> : null}
      <Routes report={report} elevations={elevations} />
      {pickedPoint ? <Tooltip point={pickedPoint} report={report} item={items.find((i) => i.point.id === pickedPoint.id)} onClose={() => setPicked(null)} /> : null}
    </ExplodeGroup>
  );
}

/** Símbolos de planta (traços finos por cor) do nível ativo, no corte da planta. */
export function PlanInstallations({ points, level, elevation }: { points: InstallationPoint[]; level: string; elevation: number }) {
  const z = elevation + PLAN_CUT_HEIGHT + 0.05;
  const groups = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const s of installationSymbols(points.filter((p) => p.level === level))) {
      const arr = by.get(s.color) ?? [];
      for (const st of s.strokes) {
        const n = st.closed ? st.pts.length : st.pts.length - 1;
        for (let i = 0; i < n; i++) {
          const a = st.pts[i]!;
          const b = st.pts[(i + 1) % st.pts.length]!;
          arr.push(a[0], a[1], z, b[0], b[1], z);
        }
      }
      by.set(s.color, arr);
    }
    return [...by.entries()].map(([color, arr]) => ({ color, geometry: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)) }));
  }, [points, level, z]);
  useEffect(() => () => groups.forEach((g) => g.geometry.dispose()), [groups]);
  return (
    <>
      {groups.map((g) => (
        <lineSegments key={g.color} geometry={g.geometry} renderOrder={8} frustumCulled={false}>
          <lineBasicMaterial color={g.color} toneMapped={false} />
        </lineSegments>
      ))}
    </>
  );
}
