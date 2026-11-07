'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { BuildingModel, HostWall, ResolvedOpening, ResolvedStair, SlabModel, RoofPlane, Vec3 } from '@chalecad/engine';
import * as THREE from 'three';
import { freeSlabEdges, guardrailLayout, openingPlacement, roofZAt, type V2 } from '@/lib/three/convert';
import { COLORS } from './materials';
import { makeRoofGeometry, makeSlabGeometry, makeWallGeometry } from './geometry';

export interface BuildingViewProps {
  model: BuildingModel;
  highlight?: { hostIds: string[] };
  onSelectHost?: (id: string) => void;
  hoverable?: boolean;
  /** Hover controlado de fora (ex.: item de lista): realça o hospedeiro como se o mouse estivesse nele. */
  hoverId?: string | null;
  onHoverHost?: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Interação por hospedeiro (hover = emissive leve, selecionado = contorno âmbar)
// ---------------------------------------------------------------------------

const StyleCtx = createContext({ hovered: false, active: false });

interface HostGroupProps {
  id: string;
  hoverable: boolean;
  active: boolean;
  onSelect?: (id: string) => void;
  externalHover?: boolean;
  onHover?: (id: string | null) => void;
  position?: THREE.Vector3;
  quaternion?: THREE.Quaternion;
  children: ReactNode;
}

function HostGroup({ id, hoverable, active, onSelect, externalHover = false, onHover, children, position, quaternion }: HostGroupProps) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  const shownHover = hovered || externalHover;
  const value = useMemo(() => ({ hovered: shownHover, active }), [shownHover, active]);
  const handlers = hoverable
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          onHover?.(id);
        },
        onPointerOut: () => {
          setHovered(false);
          onHover?.(null);
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 4) return; // foi arrasto de câmera, não clique
          e.stopPropagation();
          onSelect?.(id);
        },
      }
    : {};
  return (
    <group position={position} quaternion={quaternion} {...handlers}>
      <StyleCtx.Provider value={value}>{children}</StyleCtx.Provider>
    </group>
  );
}

interface SurfaceProps {
  geometry?: THREE.BufferGeometry;
  color: string;
  roughness?: number;
  metalness?: number;
  edges?: boolean;
  edgeColor?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number, number];
  castShadow?: boolean;
}

/** Malha opaca que reage ao hover/seleção do HostGroup pai. Aceita geometria pronta ou caixa (size). */
function Surface({ geometry, size, color, roughness = 0.85, metalness = 0, edges = true, edgeColor = COLORS.edge, castShadow = true, ...rest }: SurfaceProps) {
  const { hovered, active } = useContext(StyleCtx);
  const emissive = active ? COLORS.accent : hovered ? COLORS.hover : '#000000';
  const intensity = active ? 0.1 : hovered ? 0.14 : 0;
  return (
    <mesh geometry={geometry} castShadow={castShadow} receiveShadow {...rest}>
      {size ? <boxGeometry args={size} /> : null}
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive} emissiveIntensity={intensity} />
      {edges ? (
        <Edges
          threshold={25}
          color={active ? COLORS.accent : edgeColor}
          lineWidth={active ? 2.5 : 1}
          transparent
          opacity={active ? 1 : 0.4}
          raycast={() => null}
        />
      ) : null}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Aberturas
// ---------------------------------------------------------------------------

function Glass({ size, position }: { size: [number, number]; position: [number, number, number] }) {
  return (
    <mesh position={position} renderOrder={2}>
      <boxGeometry args={[size[0], size[1], 0.012]} />
      <meshStandardMaterial color={COLORS.glass} transparent opacity={0.38} roughness={0.05} metalness={0.15} depthWrite={false} />
    </mesh>
  );
}

function Bar({ size, position, color }: { size: [number, number, number]; position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

const F = 0.05; // espessura do requadro

/** Janela/porta de correr/claraboia: requadro escuro + vidro. Local: centro em (0,0), plano XY. */
function GlazedFrame({ w, h, depth, mullion }: { w: number; h: number; depth: number; mullion?: boolean }) {
  const c = COLORS.windowFrame;
  return (
    <group>
      <Bar color={c} size={[w, F, depth]} position={[0, -h / 2 + F / 2, 0]} />
      <Bar color={c} size={[w, F, depth]} position={[0, h / 2 - F / 2, 0]} />
      <Bar color={c} size={[F, h - 2 * F, depth]} position={[-w / 2 + F / 2, 0, 0]} />
      <Bar color={c} size={[F, h - 2 * F, depth]} position={[w / 2 - F / 2, 0, 0]} />
      {mullion || w > 1.5 ? <Bar color={c} size={[F * 0.7, h - 2 * F, depth * 0.8]} position={[0, 0, 0]} /> : null}
      <Glass size={[w - 2 * F, h - 2 * F]} position={[0, 0, 0]} />
    </group>
  );
}

function DoorLeaf({ w, h, depth }: { w: number; h: number; depth: number }) {
  const fr = COLORS.doorFrame;
  const leaf = 0.045;
  return (
    <group>
      <Bar color={fr} size={[F, h, depth]} position={[-w / 2 + F / 2, 0, 0]} />
      <Bar color={fr} size={[F, h, depth]} position={[w / 2 - F / 2, 0, 0]} />
      <Bar color={fr} size={[w - 2 * F, F, depth]} position={[0, h / 2 - F / 2, 0]} />
      <Bar color={COLORS.doorLeaf} size={[w - 2 * F, h - F, leaf]} position={[0, -F / 2, 0]} />
      {/* maçaneta */}
      <Bar color="#d6d3d1" size={[0.03, 0.14, 0.1]} position={[w / 2 - F - 0.1, -0.05, 0]} />
    </group>
  );
}

function OpeningMesh({ op, depth }: { op: ResolvedOpening; depth: number }) {
  const { center, size } = openingPlacement(op);
  const d = depth + 0.02;
  return (
    <group position={[center[0], center[1], 0]}>
      {op.type === 'door' ? (
        <DoorLeaf w={size[0]} h={size[1]} depth={d} />
      ) : (
        <GlazedFrame w={size[0]} h={size[1]} depth={d} mullion={op.type === 'sliding_door'} />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

interface PartCommon {
  hoverable: boolean;
  active: boolean;
  onSelect?: (id: string) => void;
  externalHover?: boolean;
  onHover?: (id: string | null) => void;
}

function Wall({ wall, openings, ...common }: { wall: HostWall; openings: ResolvedOpening[] } & PartCommon) {
  const built = useMemo(() => makeWallGeometry(wall, openings), [wall, openings]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const interior = wall.kind === 'interior';
  return (
    <HostGroup id={wall.id} position={built.position} quaternion={built.quaternion} {...common}>
      <Surface geometry={built.geometry} color={interior ? COLORS.wallInterior : COLORS.wallExterior} roughness={0.92} />
      {built.openings.map((op) => (
        <OpeningMesh key={op.id} op={op} depth={wall.thickness} />
      ))}
    </HostGroup>
  );
}

function Roof({ plane, openings, ...common }: { plane: RoofPlane; openings: ResolvedOpening[] } & PartCommon) {
  const built = useMemo(() => makeRoofGeometry(plane, openings), [plane, openings]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const skylights = openings.filter((o) => o.valid && o.hostKind === 'roof' && o.hostId === plane.id);
  return (
    <HostGroup id={plane.id} position={built.position} quaternion={built.quaternion} {...common}>
      <Surface geometry={built.geometry} color={COLORS.roof} roughness={0.95} edgeColor="#78716c" />
      {skylights.map((op) => {
        const { center, size } = openingPlacement(op);
        return (
          <group key={op.id} position={[center[0], center[1], built.thickness / 2]}>
            <GlazedFrame w={size[0]} h={size[1]} depth={built.thickness + 0.04} />
          </group>
        );
      })}
    </HostGroup>
  );
}

const RAIL_H = 1.05;
const POST = 0.04;

/** Barra entre dois pontos 3D (coordenadas do motor). */
function Rod({ a, b, t, color }: { a: Vec3; b: Vec3; t: number; color: string }) {
  const { position, quaternion, length } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return {
      position: va.clone().add(vb).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize()),
      length: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <boxGeometry args={[length, t, t]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

/** Guarda-corpo de uma borda livre; a altura dos postes é limitada pelo telhado acima. */
function Guardrail({ a, b, z, roofPlanes }: { a: V2; b: V2; z: number; roofPlanes: RoofPlane[] }) {
  const c = COLORS.guardrail;
  const posts = useMemo(() => {
    const g = guardrailLayout(a, b);
    return g.posts.map(([x, y]) => {
      const clearance = roofZAt(roofPlanes, x, y) - z - 0.06;
      const h = Math.min(RAIL_H, Math.max(0.04, clearance));
      return { x, y, h };
    });
  }, [a, b, z, roofPlanes]);
  return (
    <group>
      {posts.map((p, i) => (
        <Bar key={i} color={c} size={[POST, POST, p.h]} position={[p.x, p.y, z + p.h / 2]} />
      ))}
      {posts.slice(1).flatMap((q, i) => {
        const p = posts[i]!;
        return [1, 0.66, 0.33].map((f) => (
          <Rod
            key={`${i}-${f}`}
            a={[p.x, p.y, z + p.h * f]}
            b={[q.x, q.y, z + q.h * f]}
            t={f === 1 ? 0.045 : 0.02}
            color={c}
          />
        ));
      })}
    </group>
  );
}

function Slab({ slab, model, ...common }: { slab: SlabModel; model: BuildingModel } & PartCommon) {
  const built = useMemo(() => makeSlabGeometry(slab), [slab]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const free = useMemo(() => (slab.kind === 'mezzanine' ? freeSlabEdges(slab, model.walls) : []), [slab, model.walls]);
  const color = slab.kind === 'radier' ? COLORS.radier : COLORS.mezzanine;
  return (
    <HostGroup id={slab.id} {...common}>
      <Surface geometry={built.geometry} position={[0, 0, built.zBottom]} color={color} roughness={slab.kind === 'radier' ? 0.95 : 0.8} />
      {free.map(([a, b], i) => (
        <Guardrail key={i} a={a} b={b} z={slab.topZ} roofPlanes={model.roofPlanes} />
      ))}
    </HostGroup>
  );
}

function Stair({ stair, ...common }: { stair: ResolvedStair } & PartCommon) {
  return (
    <HostGroup id={stair.id} {...common}>
      {stair.treads.map((t, i) => (
        <Surface
          key={i}
          size={t.size}
          position={t.center}
          rotation={[0, 0, (t.rotationZDeg * Math.PI) / 180]}
          color={COLORS.stair}
          roughness={0.75}
        />
      ))}
    </HostGroup>
  );
}

// ---------------------------------------------------------------------------
// Edificação
// ---------------------------------------------------------------------------

/**
 * Renderiza o BuildingModel. As coordenadas do motor (z-up) entram direto: o único
 * `<group rotation={[-PI/2,0,0]}>` abaixo leva z-up para y-up (ver lib/three/convert.ts).
 */
export function BuildingView({ model, highlight, onSelectHost, hoverable = true, hoverId = null, onHoverHost }: BuildingViewProps) {
  const lit = useMemo(() => new Set(highlight?.hostIds ?? []), [highlight]);
  const common = (id: string): PartCommon => ({ hoverable, active: lit.has(id), onSelect: onSelectHost, externalHover: hoverId === id, onHover: onHoverHost });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {model.walls.map((w) => (
        <Wall key={w.id} wall={w} openings={model.openings} {...common(w.id)} />
      ))}
      {model.roofPlanes.map((p) => (
        <Roof key={p.id} plane={p} openings={model.openings} {...common(p.id)} />
      ))}
      {model.slabs.map((s) => (
        <Slab key={s.id} slab={s} model={model} {...common(s.id)} />
      ))}
      {model.stairs.map((s) => (
        <Stair key={s.id} stair={s} {...common(s.id)} />
      ))}
    </group>
  );
}

