'use client';
import { useEffect, useMemo, useState } from 'react';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { ExtraModel } from '@chalecad/engine';
import { getTexture } from '@/lib/three/textures';
import { ROOF_COLORS } from '@/lib/project/rooms';
import { useEditor } from '@/lib/store/editor';
import { makeRoofGeometry } from './geometry';
import { COLORS } from './materials';
import { usePbrProps } from './usePbr';

type Seg = ExtraModel['segments'][number];

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, aniso = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Bloco de concreto 39 x 19 cm: junta clara nas bordas e granulado sutil. */
function makeBlockTexture() {
  return canvasTexture(128, 64, (g) => {
    g.fillStyle = '#d2cdc4';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#bcb7ae';
    g.fillRect(3, 3, 122, 58);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '60,55,48'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 128, Math.random() * 64, 1.4, 1.4);
    }
  });
}

/** Tábuas de 14 cm (quatro por tile de 56 cm), junta escura e veio sutil. */
function makeWoodTexture() {
  return canvasTexture(128, 128, (g) => {
    const tones = ['#a77c50', '#9c7248', '#b0855a', '#a17549'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = tones[i]!;
      g.fillRect(0, i * 32, 128, 32);
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(70,45,20,${0.05 + Math.random() * 0.08})`;
        g.fillRect(0, i * 32 + 2 + Math.random() * 28, 128, 1);
      }
      g.fillStyle = 'rgba(40,25,10,0.55)';
      g.fillRect(0, i * 32, 128, 1.5);
    }
  });
}

/** Caixa com UV proporcionais às medidas (a textura repete a cada bloco). Eixos do motor: x = comprimento, y = espessura, z = altura. */
export function makeScaledBox(l: number, t: number, h: number, tile: [number, number] = [0.39, 0.19]): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(l, t, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry: faces +x, -x, +y, -y, +z, -z (4 vértices cada)
  const dims: [number, number][] = [
    [t, h],
    [t, h],
    [l, h],
    [l, h],
    [l, t],
    [l, t],
  ];
  dims.forEach(([du, dv], f) => {
    for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * (du / tile[0]), uv.getY(f * 4 + i) * (dv / tile[1]));
  });
  uv.needsUpdate = true;
  return g;
}

interface Tex {
  block: THREE.Texture;
  wood: THREE.Texture;
}

/** Como a torre da caixa d'água pinta as paredes e o telhado (igual ao chalé). */
export interface TowerStyle {
  /** Textura da fachada do chalé (acabamento escolhido). */
  facadeMap?: THREE.Texture | undefined;
  roofColor: string;
  /** Estrutura/Explodido: paredes translúcidas para ver a caixa, postes e armação. */
  see: boolean;
  /** Câmera em planta: sem o telhado da torre cobrindo a vista de cima. */
  plan?: boolean;
}

function SegmentMesh({ seg, tex, lit, selected, hover, plain, tower }: { seg: Seg; tex: Tex; lit: boolean; selected: boolean; hover: boolean; plain: boolean; tower?: TowerStyle | undefined }) {
  const length = Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]);
  const angle = Math.atan2(seg.to[1] - seg.from[1], seg.to[0] - seg.from[0]);
  const geometry = useMemo(() => makeScaledBox(Math.max(0.01, length), Math.max(0.01, seg.thickness), Math.max(0.01, seg.height)), [length, seg.thickness, seg.height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const emissive = lit || selected ? COLORS.accent : hover ? COLORS.hover : '#000000';
  const ei = lit || selected ? 0.1 : hover ? 0.1 : 0;
  const pos: [number, number, number] = [(seg.from[0] + seg.to[0]) / 2, (seg.from[1] + seg.to[1]) / 2, seg.baseZ + seg.height / 2];
  const common = { emissive, emissiveIntensity: ei };
  let material: React.ReactNode;
  switch (seg.material) {
    case 'block':
      material = <meshStandardMaterial map={tex.block} color="#ffffff" roughness={0.95} {...common} />;
      break;
    case 'gabion':
      material = <meshStandardMaterial map={tex.block} color="#8f8878" roughness={1} {...common} />;
      break;
    case 'concrete':
      material = <meshStandardMaterial color="#a8a29e" roughness={0.9} {...common} />;
      break;
    case 'board':
      if (tower) {
        // paredes da torre: mesmo acabamento do chalé; translúcidas quando selecionada ou nas vistas técnicas (recorte para ver a caixa)
        const ghost = tower.see || selected;
        material = <meshStandardMaterial key={ghost ? 'ghost' : 'solid'} map={tower.facadeMap ?? tex.wood} color="#ffffff" roughness={0.85} transparent={ghost} opacity={ghost ? (tower.see ? 0.18 : 0.35) : 1} depthWrite={!ghost} {...common} />;
      } else material = <meshStandardMaterial map={tex.wood} color="#ffffff" roughness={0.8} {...common} />;
      break;
    case 'rail':
      // guarda-corpo: painel quase transparente + corrimão no topo (ver abaixo)
      material = <meshStandardMaterial color={COLORS.guardrail} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} roughness={0.6} {...common} />;
      break;
    default: // tela
      material = <meshStandardMaterial color="#57534e" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} roughness={0.7} {...common} />;
  }
  const solid = seg.material !== 'mesh' && seg.material !== 'rail' && !(tower && (tower.see || selected));
  return (
    <group>
      <mesh geometry={geometry} position={pos} rotation={[0, 0, angle]} castShadow={solid} receiveShadow renderOrder={solid ? 0 : 2}>
        {material}
        {selected ? <Edges color={COLORS.accent} lineWidth={2.5} raycast={() => null} /> : solid && !plain ? <Edges threshold={25} color={COLORS.edge} transparent opacity={0.35} raycast={() => null} /> : null}
      </mesh>
      {seg.material === 'rail' ? (
        <mesh position={[pos[0], pos[1], seg.baseZ + seg.height - 0.025]} rotation={[0, 0, angle]} castShadow>
          <boxGeometry args={[Math.max(0.01, length), 0.06, 0.05]} />
          <meshStandardMaterial color={COLORS.guardrail} roughness={0.6} {...common} />
        </mesh>
      ) : null}
    </group>
  );
}

const POST_COLORS = { concrete: '#a8a29e', wood: '#7a5a3a', steel: '#57534e' };

interface ExtraProps {
  extra: ExtraModel;
  tex: Tex;
  lit: boolean;
  selected: boolean;
  hoverable: boolean;
  plain: boolean;
  tower?: TowerStyle | undefined;
  onSelect?: (id: string) => void;
}

function Extra({ extra, tex, lit, selected, hoverable, plain, tower, onSelect }: ExtraProps) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hover]);

  const deckGeo = useMemo(() => {
    if (!extra.polygon || extra.polygon.length < 3) return null;
    const shape = new THREE.Shape(extra.polygon.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    return g;
  }, [extra.polygon]);
  useEffect(() => () => deckGeo?.dispose(), [deckGeo]);
  const roof = useMemo(() => (extra.roof ? makeRoofGeometry(extra.roof, []) : null), [extra.roof]);
  useEffect(() => () => roof?.geometry.dispose(), [roof]);
  const towerRoofs = useMemo(() => (extra.roofs ?? []).map((r) => makeRoofGeometry(r, [])), [extra.roofs]);
  useEffect(() => () => towerRoofs.forEach((r) => r.geometry.dispose()), [towerRoofs]);

  const woodTex = useMemo(() => {
    const t = tex.wood.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / 0.56, 1 / 0.56);
    return t;
  }, [tex.wood]);
  useEffect(() => () => woodTex.dispose(), [woodTex]);
  // piso do deck com réguas em PBR e telha do deck coberto em sanduíche (as texturas leem UV em metros)
  const deckPbr = usePbrProps(extra.kind === 'deck' ? 'deck_wood' : undefined);
  const roofPbr = usePbrProps(extra.roof ? 'roof_sandwich' : undefined);

  const postBase = extra.kind === 'deck' ? (extra.topZ ?? 0) : 0;
  const seg0 = extra.segments[0];
  // as postes da torre medem a altura desde o piso de apoio (térreo ou mezanino); o topo é o das paredes
  const towerTop = extra.kind === 'water_tower' && seg0 ? seg0.baseZ + seg0.height : null;
  const showTank = !!extra.tank && !!tower && (tower.see || selected);
  const postColor = extra.kind === 'water_tower' ? POST_COLORS.steel : extra.kind === 'deck' ? POST_COLORS.wood : extra.kind === 'fence' ? POST_COLORS.concrete : POST_COLORS.steel;
  const emissive = lit || selected ? COLORS.accent : hover ? COLORS.hover : '#000000';
  const ei = lit || selected ? 0.1 : hover ? 0.1 : 0;

  const handlers = hoverable
    ? {
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          setHover(true);
        },
        onPointerOut: () => setHover(false),
        onClick: (e: { delta: number; stopPropagation: () => void }) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          onSelect?.(extra.id);
        },
      }
    : {};

  return (
    <group {...handlers}>
      {extra.segments.map((s, i) => (
        <SegmentMesh key={i} seg={s} tex={tex} lit={lit} selected={selected} hover={hover} plain={plain} tower={extra.kind === 'water_tower' ? tower : undefined} />
      ))}
      {extra.kind === 'water_tower' && !tower?.plan ? towerRoofs.map((r, i) => (
        <mesh key={`tr${i}`} geometry={r.geometry} position={r.position} quaternion={r.quaternion} castShadow receiveShadow>
          <meshStandardMaterial color={tower?.roofColor ?? COLORS.roof} roughness={0.95} emissive={emissive} emissiveIntensity={ei} />
          {plain ? null : <Edges threshold={25} color="#78716c" transparent opacity={0.4} raycast={() => null} />}
        </mesh>
      )) : null}
      {showTank && extra.tank ? (
        <mesh position={[extra.tank.position[0], extra.tank.position[1], extra.tank.baseZ + extra.tank.height / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[extra.tank.radius, extra.tank.radius, extra.tank.height, 32]} />
          <meshStandardMaterial color="#3b82f6" transparent opacity={0.55} roughness={0.25} metalness={0.1} />
        </mesh>
      ) : null}
      {extra.kind === 'water_tower' && !(tower?.see || selected) ? null : extra.posts.map((p, i) => (
        <mesh key={`p${i}`} position={[p.position[0], p.position[1], (towerTop !== null ? towerTop - p.height : postBase) + p.height / 2]} castShadow>
          <boxGeometry args={[p.size, p.size, p.height]} />
          <meshStandardMaterial color={postColor} roughness={0.8} emissive={emissive} emissiveIntensity={ei} />
        </mesh>
      ))}
      {deckGeo && extra.topZ !== undefined ? (
        <mesh geometry={deckGeo} position={[0, 0, extra.topZ - 0.1]} castShadow receiveShadow>
          <meshStandardMaterial {...(deckPbr ?? { map: woodTex, roughness: 0.8 })} color="#ffffff" emissive={emissive} emissiveIntensity={ei} />
          {selected ? <Edges color={COLORS.accent} lineWidth={2.5} raycast={() => null} /> : plain ? null : <Edges threshold={25} color={COLORS.edge} transparent opacity={0.35} raycast={() => null} />}
        </mesh>
      ) : null}
      {roof ? (
        <mesh geometry={roof.geometry} position={roof.position} quaternion={roof.quaternion} castShadow receiveShadow>
          <meshStandardMaterial color={COLORS.roof} {...(roofPbr ?? { roughness: 0.95 })} emissive={emissive} emissiveIntensity={ei} />
          {plain ? null : <Edges threshold={25} color="#78716c" transparent opacity={0.4} raycast={() => null} />}
        </mesh>
      ) : null}
    </group>
  );
}

export interface ExtrasViewProps {
  extras: ExtraModel[];
  selectedId?: string | null;
  highlightIds?: string[];
  hoverable?: boolean;
  /** Modo apresentação: sem arestas técnicas. */
  plain?: boolean;
  /** Acabamento da torre da caixa d'água (fachada e telha do chalé; vistas técnicas). */
  tower?: TowerStyle;
  onSelect?: (id: string) => void;
}

/** Muro, cerca, deck e arrimo (`results.model.extras`), selecionáveis. */
/** Acabamento da torre a partir do projeto aberto no editor (fachada, cor da telha) e da vista (Explodido/Estrutura). */
function useTowerStyle(): TowerStyle {
  const finishes = useEditor((s) => s.project?.finishes);
  const viewMode = useEditor((s) => s.viewMode);
  const facadeId = finishes?.facade;
  const facadeMap = useMemo(() => getTexture(facadeId), [facadeId]);
  const roofColor = ROOF_COLORS.find((c) => c.id === finishes?.roofColor)?.hex ?? COLORS.roof;
  return { facadeMap, roofColor, see: viewMode === 'exploded' || viewMode === 'skeleton' || viewMode === 'heatmap' };
}

export function ExtrasView({ extras, selectedId = null, highlightIds = [], hoverable = true, plain = false, tower: towerProp, onSelect }: ExtrasViewProps) {
  const fromEditor = useTowerStyle();
  const inPlan = useEditor((st) => st.cameraView === 'plan');
  const tower = towerProp ?? { ...fromEditor, plan: inPlan };
  const tex = useMemo<Tex>(() => ({ block: makeBlockTexture(), wood: makeWoodTexture() }), []);
  useEffect(
    () => () => {
      tex.block.dispose();
      tex.wood.dispose();
    },
    [tex],
  );
  const lit = useMemo(() => new Set(highlightIds), [highlightIds]);
  return (
    <>
      {extras.map((x) => (
        <Extra key={x.id} extra={x} tex={tex} lit={lit.has(x.id)} selected={selectedId === x.id} hoverable={hoverable} plain={plain} tower={tower} onSelect={onSelect} />
      ))}
    </>
  );
}
