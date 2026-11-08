'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BuildingModel, TerrainReport } from '@chalecad/engine';
import { mixHex } from '@/lib/sun';
import type { ThreeBounds } from '@/lib/three/convert';
import { SCENARIOS, type ScenarioId } from '@/lib/three/foliage';
import { buildGroundBuffers, buildHillsRing, buildPathStrip, GROUND_R, HILLS_FAR_R, HILLS_NEAR_R, SEA_DEPTH } from '@/lib/three/landscape';
import { getLandscapeData } from '@/lib/three/landscapeData';
import { slopeHeight, surfaceY } from '@/lib/three/slopedSite';
import { useEditor } from '@/lib/store/editor';
import { usePbrProps } from './usePbr';
import { Vegetation } from './Vegetation';

const hexRgb = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

const bufferGeometry = (b: { positions: Float32Array; indices: Uint16Array | Uint32Array; uvs?: Float32Array; colors?: Float32Array; colorSize?: number }) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
  if (b.uvs) g.setAttribute('uv', new THREE.BufferAttribute(b.uvs, 2));
  if (b.colors) g.setAttribute('color', new THREE.BufferAttribute(b.colors, b.colorSize ?? 3));
  g.setIndex(new THREE.BufferAttribute(b.indices, 1));
  return g;
};

export interface LandscapeProps {
  model: BuildingModel;
  bounds: ThreeBounds;
  scenario: ScenarioId;
  vegetation: boolean;
  quality: 'high' | 'light';
  /** 0 (noite) a 1 (dia): escurece o chão e os morros. */
  daylight: number;
  projectName: string;
  /** Terreno inclinado do motor (o `TerrainView` desenha o lote): o chão em volta continua o mesmo declive. */
  terrain?: TerrainReport | null;
}

/**
 * Paisagem do modo Apresentação: chão grande com relevo suave longe da casa (plano em volta dela, ou inclinado como
 * o lote), caminho de pedriscos até a porta, morros do horizonte, mar (praia) e a vegetação do cenário. Vegetação e
 * caminho pousam na altura do chão.
 */
export function Landscape({ model, bounds, scenario, vegetation, quality, daylight, projectName, terrain = null }: LandscapeProps) {
  const sc = SCENARIOS[scenario];
  const site = useEditor((s) => s.project.site);
  const cx = bounds.center[0], cz = bounds.center[2];
  const groundY = bounds.min[1];
  const data = useMemo(
    () => getLandscapeData({ model, terrain, site, projectName, center: [cx, cz], radius: bounds.radius, groundY, scenario, vegetation, quality }),
    [model, terrain, site, projectName, cx, cz, bounds.radius, groundY, scenario, vegetation, quality],
  );
  const { shape, slope, surface, path, placements } = data;

  const groundMap = usePbrProps(sc.ground.texture === 'sand' ? 'sand' : 'grass');
  const gravel = usePbrProps('gravel');

  const ground = useMemo(() => {
    const day = new THREE.Color(sc.ground.day);
    const rel = (hex: string): [number, number, number] => {
      const c = new THREE.Color(hex);
      return [Math.min(1.35, c.r / Math.max(0.05, day.r)), Math.min(1.35, c.g / Math.max(0.05, day.g)), Math.min(1.35, c.b / Math.max(0.05, day.b))];
    };
    // com declive, a malha do lote (TerrainView) cobre o retângulo dele: o chão fica sem esses triângulos
    const m = slope?.meshRect;
    const b = buildGroundBuffers(shape, rel(sc.ground.patchA), rel(sc.ground.patchB), GROUND_R, 44, 128, {
      base: slope ? (x, z) => slopeHeight(slope, cx + x, -(cz + z)) : undefined,
      hole: m ? (x, z) => cx + x >= m.minX && cx + x <= m.maxX && -(cz + z) >= m.minY && -(cz + z) <= m.maxY : undefined,
    });
    const g = bufferGeometry({ positions: b.positions, uvs: b.uvs, colors: b.colors, indices: b.indices });
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [shape, sc, slope, surface, cx, cz]);
  useEffect(() => () => ground.dispose(), [ground]);

  const pathGeo = useMemo(() => {
    if (!path || path.length < 2) return undefined;
    const b = buildPathStrip(path, 1.5, groundY + 0.012, slope ? (x, z) => surfaceY(surface, x, z) + 0.02 : undefined);
    const g = bufferGeometry({ positions: b.positions, uvs: b.uvs, colors: b.colors, colorSize: 4, indices: b.indices });
    g.computeVertexNormals();
    return g;
  }, [path, groundY, slope, surface]);
  useEffect(() => () => pathGeo?.dispose(), [pathGeo]);

  const hills = useMemo(() => {
    if (sc.hills.far[1] <= 0) return [];
    const top = hexRgb(sc.hills.color);
    const dark = top.map((v) => v * 0.62) as [number, number, number];
    const far = top.map((v) => v * 1.12) as [number, number, number];
    return [
      bufferGeometry({ ...buildHillsRing(HILLS_FAR_R, sc.hills.far, shape.seed + 7, far, dark, sc.sea) }),
      bufferGeometry({ ...buildHillsRing(HILLS_NEAR_R, sc.hills.near, shape.seed + 3, top, dark, sc.sea) }),
    ];
  }, [sc, shape.seed]);
  useEffect(() => () => hills.forEach((h) => h.dispose()), [hills]);

  const groundColor = mixHex(sc.ground.night, sc.ground.day, daylight);
  const hillColor = mixHex('#2a3350', '#ffffff', Math.max(0.08, daylight));

  return (
    <>
      <mesh geometry={ground} position={[cx, slope ? 0 : groundY - 0.002, cz]} receiveShadow>
        <meshStandardMaterial key={groundMap ? 'm' : 'n'} color={groundColor} vertexColors {...(groundMap ?? { roughness: 1 })} normalScale={groundMap ? new THREE.Vector2(0.6, 0.6) : undefined} />
      </mesh>
      {pathGeo && gravel ? (
        <mesh geometry={pathGeo} receiveShadow renderOrder={1}>
          <meshStandardMaterial {...gravel} color={mixHex('#58534c', '#ffffff', daylight)} vertexColors transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ) : null}
      {sc.sea ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, groundY - SEA_DEPTH, cz]}>
          <circleGeometry args={[GROUND_R * 1.3, 48]} />
          <meshStandardMaterial color={mixHex('#0d2230', '#2e7f93', daylight)} roughness={0.14} metalness={0.05} envMapIntensity={1.3} />
        </mesh>
      ) : null}
      {hills.map((g, i) => (
        <mesh key={i} geometry={g} position={[cx, groundY, cz]} renderOrder={-1} raycast={() => null}>
          <meshBasicMaterial vertexColors color={hillColor} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {placements.length > 0 ? <Vegetation placements={placements} surface={surface} quality={quality} /> : null}
    </>
  );
}

type Poly = [number, number][];

/** Decal de oclusão: polígonos (planta do motor) com borda suave (anéis concêntricos de alfa decrescente). */
function contactTexture(polys: Poly[], pad: number, pxPerM: number): { texture: THREE.CanvasTexture; rect: { minX: number; minY: number; w: number; h: number } } | undefined {
  if (typeof document === 'undefined' || polys.length === 0) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = maxX - minX, h = maxY - minY;
  const scale = Math.min(pxPerM, 1024 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(w * scale));
  canvas.height = Math.max(16, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  // y do canvas cresce para baixo; a textura usa flipY, então v = (y - minY) / h do motor de baixo para cima
  const tx = (x: number) => (x - minX) * scale;
  const ty = (y: number) => canvas.height - (y - minY) * scale;
  const path = (poly: Poly) => {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(tx(x), ty(y)) : ctx.lineTo(tx(x), ty(y))));
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  const steps = 14;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps; // 1 = mais longe
    ctx.strokeStyle = `rgba(0,0,0,${0.55 / steps * (1.0 - t * 0.35)})`;
    ctx.lineWidth = 2 * pad * scale * t;
    for (const poly of polys) {
      path(poly);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (const poly of polys) {
    path(poly);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, rect: { minX, minY, w, h } };
}

function ContactDecal({ polys, pad, z, opacity }: { polys: Poly[]; pad: number; z: number; opacity: number }) {
  const built = useMemo(() => contactTexture(polys, pad, 80), [polys, pad]);
  useEffect(() => () => built?.texture.dispose(), [built]);
  if (!built) return null;
  const { rect, texture } = built;
  // plano na cena (y para cima): x = x, z = -y
  return (
    <mesh position={[rect.minX + rect.w / 2, z, -(rect.minY + rect.h / 2)]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => null}>
      <planeGeometry args={[rect.w, rect.h]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} fog={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * Sombra de contato (qualidade Alta): decal suave sob o contorno da casa, no chão, e sob os móveis, em cada cota de
 * piso. É desenhada uma vez por geometria (não por quadro), sem recapturar a cena.
 */
export function HouseContactShadows({ model, bounds }: { model: BuildingModel; bounds: ThreeBounds }) {
  const footprint = useMemo<Poly[]>(() => [model.footprint as Poly], [model.footprint]);
  const byLevel = useMemo(() => {
    const m = new Map<number, Poly[]>();
    for (const f of model.furniture) {
      const z = Math.round(f.z * 1000) / 1000;
      const a = m.get(z);
      if (a) a.push(f.polygon as Poly);
      else m.set(z, [f.polygon as Poly]);
    }
    return [...m.entries()];
  }, [model.furniture]);
  return (
    <>
      <ContactDecal polys={footprint} pad={0.9} z={bounds.min[1] + 0.004} opacity={0.5} />
      {byLevel.map(([z, polys]) => (
        <ContactDecal key={z} polys={polys} pad={0.28} z={z + 0.016} opacity={0.5} />
      ))}
    </>
  );
}
