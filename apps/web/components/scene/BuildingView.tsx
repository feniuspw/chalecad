'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { BuildingModel, Finishes, HostWall, ResolvedOpening, ResolvedStair, SlabModel, RoofPlane, Vec3 } from '@chalecad/engine';
import * as THREE from 'three';
import { freeSlabEdges, glazingBars, guardrailLayout, guardrailSpan, openingPlacement, roofZAt, type V2 } from '@/lib/three/convert';
import { getTexture } from '@/lib/three/textures';
import { ROOF_COLORS } from '@/lib/project/rooms';
import { explodeGap as computeGap, type ExplodeLayer } from '@/lib/three/views';
import type { ViewMode } from '@/lib/store/types';
import { COLORS } from './materials';
import { makeRoofGeometry, makeSlabGeometry, makeWallGeometry } from './geometry';
import { ExplodeGroup } from './ExplodeGroup';

export interface BuildingViewProps {
  model: BuildingModel;
  highlight?: { hostIds: string[] };
  onSelectHost?: (id: string) => void;
  hoverable?: boolean;
  /** Hover controlado de fora (ex.: item de lista): realça o hospedeiro como se o mouse estivesse nele. */
  hoverId?: string | null;
  onHoverHost?: (id: string | null) => void;
  /** Modo de visualização: esqueleto/mapa de calor escondem fechamentos; explodido separa camadas. */
  mode?: ViewMode;
  /** Planos de corte (planta baixa): paredes cortadas na altura do plano. */
  clip?: THREE.Plane[];
  /** Há destaque ativo: o que não está em `highlight.hostIds` esmaece. */
  fadeOthers?: boolean;
  /** Oculta o telhado (planta). */
  hideRoof?: boolean;
  selectedOpeningId?: string | null;
  onSelectOpening?: (id: string) => void;
  /** Acabamentos gerais: fachada (textura nas paredes externas) e cor da telha. */
  finishes?: Finishes;
}

interface ViewState {
  clip?: THREE.Plane[];
  /** Fantasma (esqueleto/mapa de calor): lajes translúcidas, sem contorno. */
  ghost: boolean;
  selectedOpeningId: string | null;
  onSelectOpening?: (id: string) => void;
  hoverable: boolean;
  /** Textura da fachada; ausente = cor lisa de sempre. */
  facadeMap?: THREE.Texture;
  roofColor: string;
}
const ViewCtx = createContext<ViewState>({ ghost: false, selectedOpeningId: null, hoverable: true, roofColor: COLORS.roof });

// ---------------------------------------------------------------------------
// Interação por hospedeiro (hover = emissive leve, selecionado = contorno âmbar)
// ---------------------------------------------------------------------------

const StyleCtx = createContext({ hovered: false, active: false, faded: false });

interface HostGroupProps {
  id: string;
  hoverable: boolean;
  active: boolean;
  onSelect?: (id: string) => void;
  externalHover?: boolean;
  faded?: boolean;
  onHover?: (id: string | null) => void;
  position?: THREE.Vector3;
  quaternion?: THREE.Quaternion;
  children: ReactNode;
}

function HostGroup({ id, hoverable, active, onSelect, externalHover = false, faded = false, onHover, children, position, quaternion }: HostGroupProps) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  const shownHover = hovered || externalHover;
  const value = useMemo(() => ({ hovered: shownHover, active, faded }), [shownHover, active, faded]);
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
  /** Textura (UVs em metros). Com textura a cor vira branca para não tingir. */
  map?: THREE.Texture;
}

/** Malha opaca que reage ao hover/seleção do HostGroup pai. Aceita geometria pronta ou caixa (size). */
function Surface({ geometry, size, color, map, roughness = 0.85, metalness = 0, edges = true, edgeColor = COLORS.edge, castShadow = true, ...rest }: SurfaceProps) {
  const { hovered, active, faded } = useContext(StyleCtx);
  const { clip, ghost } = useContext(ViewCtx);
  const opacity = ghost ? 0.22 : faded ? 0.16 : 1;
  const emissive = active ? COLORS.accent : hovered ? COLORS.hover : '#000000';
  const intensity = active ? 0.1 : hovered ? 0.14 : 0;
  return (
    <mesh geometry={geometry} castShadow={castShadow && opacity === 1} receiveShadow={opacity === 1} renderOrder={opacity < 1 ? 1 : 0} {...rest}>
      {size ? <boxGeometry args={size} /> : null}
      <meshStandardMaterial
        key={`${opacity < 1 ? 'translucent' : 'opaque'}${map ? '-map' : ''}`} // trocar `transparent`/`map` exige novo programa de shader
        color={map ? '#ffffff' : color}
        map={map ?? null}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive}
        emissiveIntensity={intensity}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
        clippingPlanes={clip}
      />
      {edges && !ghost ? (
        <Edges
          threshold={25}
          color={active ? COLORS.accent : edgeColor}
          lineWidth={active ? 2.5 : 1}
          transparent
          opacity={faded ? 0.15 : active ? 1 : 0.4}
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
  const { clip } = useContext(ViewCtx);
  return (
    <mesh position={position} renderOrder={2}>
      <boxGeometry args={[size[0], size[1], 0.012]} />
      <meshStandardMaterial color={COLORS.glass} transparent opacity={0.38} roughness={0.05} metalness={0.15} depthWrite={false} clippingPlanes={clip} />
    </mesh>
  );
}

function Bar({ size, position, color }: { size: [number, number, number]; position: [number, number, number]; color: string }) {
  const { clip } = useContext(ViewCtx);
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.6} clippingPlanes={clip} />
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
  const { selectedOpeningId, onSelectOpening, hoverable } = useContext(ViewCtx);
  const [hot, setHot] = useState(false);
  useEffect(() => {
    if (!hot) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hot]);
  const selected = selectedOpeningId === op.id;
  const d = depth + 0.02;
  return (
    <group position={[center[0], center[1], 0]}>
      {hoverable ? (
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            setHot(true);
          }}
          onPointerOut={() => setHot(false)}
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            onSelectOpening?.(op.id);
          }}
        >
          <boxGeometry args={[size[0] + 0.02, size[1] + 0.02, d + 0.04]} />
          <meshBasicMaterial color={COLORS.accent} transparent opacity={selected ? 0.22 : hot ? 0.14 : 0} depthWrite={false} />
          {selected || hot ? <Edges color={COLORS.accent} lineWidth={selected ? 3 : 2} raycast={() => null} /> : null}
        </mesh>
      ) : null}
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
  faded?: boolean;
  onSelect?: (id: string) => void;
  externalHover?: boolean;
  onHover?: (id: string | null) => void;
}

/** Fachada envidraçada: vidro na forma da parede + caixilhos (requadro, montantes e travessas). */
function GlazedWall({ geometry, outline, openings, depth }: { geometry: THREE.BufferGeometry; outline: V2[]; openings: ResolvedOpening[]; depth: number }) {
  const { hovered, active, faded } = useContext(StyleCtx);
  const { clip, ghost } = useContext(ViewCtx);
  const bars = useMemo(() => glazingBars(outline, openings), [outline, openings]);
  const c = COLORS.windowFrame;
  return (
    <group>
      <mesh geometry={geometry} renderOrder={2} scale={[1, 1, 0.25]}>
        <meshStandardMaterial
          color={active ? COLORS.accent : hovered ? COLORS.hover : COLORS.glass}
          transparent
          opacity={ghost || faded ? 0.12 : 0.34}
          roughness={0.05}
          metalness={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
          clippingPlanes={clip}
        />
      </mesh>
      {bars.map((b, i) => (
        <Rod key={i} a={[b.from[0], b.from[1], 0]} b={[b.to[0], b.to[1], 0]} t={Math.min(0.08, depth)} color={c} />
      ))}
    </group>
  );
}

function Wall({ wall, openings, ...common }: { wall: HostWall; openings: ResolvedOpening[] } & PartCommon) {
  const built = useMemo(() => makeWallGeometry(wall, openings), [wall, openings]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const interior = wall.kind === 'interior';
  const glazed = wall.assemblyId === 'gable_glazed';
  const { facadeMap } = useContext(ViewCtx);
  const facade = !interior && wall.exteriorSide !== null && !glazed ? facadeMap : undefined;
  return (
    <HostGroup id={wall.id} position={built.position} quaternion={built.quaternion} {...common}>
      {glazed ? (
        <GlazedWall geometry={built.geometry} outline={wall.outline as V2[]} openings={built.openings} depth={wall.thickness} />
      ) : (
        <Surface geometry={built.geometry} color={interior ? COLORS.wallInterior : COLORS.wallExterior} map={facade} roughness={0.92} />
      )}
      {built.openings.map((op) => (
        <OpeningMesh key={op.id} op={op} depth={wall.thickness} />
      ))}
    </HostGroup>
  );
}

function Roof({ plane, openings, ...common }: { plane: RoofPlane; openings: ResolvedOpening[] } & PartCommon) {
  const built = useMemo(() => makeRoofGeometry(plane, openings), [plane, openings]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const { roofColor } = useContext(ViewCtx);
  const skylights = openings.filter((o) => o.valid && o.hostKind === 'roof' && o.hostId === plane.id);
  return (
    <HostGroup id={plane.id} position={built.position} quaternion={built.quaternion} {...common}>
      <Surface geometry={built.geometry} color={roofColor} roughness={0.95} edgeColor="#78716c" />
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

/** NBR 14718: guarda-corpo com 1,10 m e vãos de no máximo 11 cm (montantes verticais, nada escalável). */
const RAIL_H = 1.1;
const POST = 0.04;
const BALUSTER = 0.02;
const BALUSTER_STEP = 0.11 + BALUSTER;

/** Barra entre dois pontos 3D (coordenadas do motor). */
function Rod({ a, b, t, color }: { a: Vec3; b: Vec3; t: number; color: string }) {
  const { clip } = useContext(ViewCtx);
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
      <meshStandardMaterial color={color} roughness={0.6} clippingPlanes={clip} />
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
        return [
          <Rod key={`${i}-top`} a={[p.x, p.y, z + p.h]} b={[q.x, q.y, z + q.h]} t={0.045} color={c} />,
          <Rod key={`${i}-low`} a={[p.x, p.y, z + 0.08]} b={[q.x, q.y, z + 0.08]} t={0.025} color={c} />,
        ];
      })}
      <Balusters posts={posts} z={z} color={c} />
    </group>
  );
}

/** Montantes verticais entre os postes, num único InstancedMesh. */
function Balusters({ posts, z, color }: { posts: { x: number; y: number; h: number }[]; z: number; color: string }) {
  const { clip } = useContext(ViewCtx);
  const items = useMemo(() => {
    const out: { x: number; y: number; h: number }[] = [];
    posts.slice(1).forEach((q, i) => {
      const p = posts[i]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const n = Math.max(0, Math.ceil(len / BALUSTER_STEP) - 1);
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        out.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, h: p.h + (q.h - p.h) * f });
      }
    });
    return out;
  }, [posts]);
  const ref = useCallback(
    (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      const m = new THREE.Matrix4();
      items.forEach((b, i) => {
        const h = Math.max(0.02, b.h - 0.1);
        m.compose(new THREE.Vector3(b.x, b.y, z + 0.08 + h / 2), new THREE.Quaternion(), new THREE.Vector3(1, 1, h));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
    [items, z],
  );
  if (items.length === 0) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]} castShadow>
      <boxGeometry args={[BALUSTER, BALUSTER, 1]} />
      <meshStandardMaterial color={color} roughness={0.6} clippingPlanes={clip} />
    </instancedMesh>
  );
}

function Slab({ slab, model, ...common }: { slab: SlabModel; model: BuildingModel } & PartCommon) {
  const built = useMemo(() => makeSlabGeometry(slab), [slab]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const free = useMemo(() => {
    if (slab.kind !== 'mezzanine') return [];
    // só onde há altura para o guarda-corpo (bordas que encostam na água do A-frame não levam)
    const clearance = (x: number, y: number) => roofZAt(model.roofPlanes, x, y) - slab.topZ;
    return freeSlabEdges(slab, model.walls)
      .map(([a, b]) => guardrailSpan(a, b, clearance, RAIL_H))
      .filter((e): e is [V2, V2] => e !== null);
  }, [slab, model.walls, model.roofPlanes]);
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
export function BuildingView({
  model,
  highlight,
  onSelectHost,
  hoverable = true,
  hoverId = null,
  onHoverHost,
  mode = 'finished',
  clip,
  fadeOthers = false,
  hideRoof = false,
  selectedOpeningId = null,
  onSelectOpening,
  finishes,
}: BuildingViewProps) {
  const lit = useMemo(() => new Set(highlight?.hostIds ?? []), [highlight]);
  const common = (id: string): PartCommon => ({
    hoverable,
    active: lit.has(id),
    faded: fadeOthers && !lit.has(id),
    onSelect: onSelectHost,
    externalHover: hoverId === id,
    onHover: onHoverHost,
  });
  const structural = mode === 'skeleton' || mode === 'heatmap';
  const exploded = mode === 'exploded';
  const gap = computeGap(model.ridgeHeight);
  const facadeId = finishes?.facade;
  const facadeMap = useMemo(() => getTexture(facadeId), [facadeId]);
  const roofColor = ROOF_COLORS.find((c) => c.id === finishes?.roofColor)?.hex ?? COLORS.roof;
  const view = useMemo<ViewState>(
    () => ({ clip, ghost: structural, selectedOpeningId, onSelectOpening, hoverable, facadeMap, roofColor }),
    [clip, structural, selectedOpeningId, onSelectOpening, hoverable, facadeMap, roofColor],
  );
  const layer = (l: ExplodeLayer, children: ReactNode) => (
    <ExplodeGroup layer={l} active={exploded} gap={gap}>
      {children}
    </ExplodeGroup>
  );

  return (
    <ViewCtx.Provider value={view}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {structural
          ? null
          : layer(
              'closure',
              model.walls.map((w) => <Wall key={w.id} wall={w} openings={model.openings} {...common(w.id)} />),
            )}
        {structural || hideRoof
          ? null
          : layer(
              'roof',
              model.roofPlanes.map((p) => <Roof key={p.id} plane={p} openings={model.openings} {...common(p.id)} />),
            )}
        {model.slabs.map((s) => (
          <ExplodeGroup key={s.id} layer={s.kind === 'radier' ? 'radier' : 'structure'} active={exploded} gap={gap}>
            <Slab slab={s} model={model} {...common(s.id)} />
          </ExplodeGroup>
        ))}
        {structural
          ? null
          : layer(
              'structure',
              model.stairs.map((s) => <Stair key={s.id} stair={s} {...common(s.id)} />),
            )}
      </group>
    </ViewCtx.Provider>
  );
}

