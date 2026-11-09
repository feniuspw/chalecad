'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { cctToHex, fixturesOf, lightRig, nearestFixtures, roofZAt, SPOT_TYPES, type Fixture } from '@/lib/elec/lights';
import { faceNormal } from '@/lib/elec/wallSnap';

const k = getCatalog().constants.electrical;

/** Fontes de luz reais ao mesmo tempo (as mais próximas da câmera); as demais luminárias só brilham (emissivas). */
export const REAL_POINT_LIGHTS = 8;
export const REAL_SPOT_LIGHTS = 4;
/**
 * Calibra candela física para a exposição da apresentação (a cena usa tom e bloom, não lux reais).
 * Referência: a lâmpada por cômodo antiga usava 16 cd; um plafon de 18 W tem 127 cd.
 */
const SCENE_GAIN = 0.08;
const LIGHT_DISTANCE = 9;
/**
 * A fonte real fica abaixo da peça: sem sombras a luz atravessa o telhado fino, e uma fonte a poucos centímetros dele
 * faz um ponto brilhante na face de fora. Mais baixa, o ponto some e a peça acesa continua no teto.
 */
const LIGHT_DROP = 0.9;

const BODY = new THREE.MeshStandardMaterial({ color: '#ece8e0', roughness: 0.55, metalness: 0.05 });
const glass = new Map<string, THREE.MeshBasicMaterial>();
const OFF_GLASS = new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.35, metalness: 0 });
/** Vidro aceso: cor acima de 1 (HDR) na cor da lâmpada; só ele passa do limiar do bloom. */
const litGlass = (cct: number) => {
  const key = cctToHex(cct);
  let m = glass.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(key).multiplyScalar(7), toneMapped: false });
    glass.set(key, m);
  }
  return m;
};

const cyl = (r: number, h: number, seg = 24) => new THREE.CylinderGeometry(r, r, h, seg);
const GEO = {
  plafon: cyl(0.16, 0.05),
  plafonGlass: cyl(0.135, 0.012),
  down: cyl(0.075, 0.016),
  downGlass: cyl(0.06, 0.006),
  spot: cyl(0.04, 0.09, 16),
  spotGlass: cyl(0.03, 0.006, 16),
  cord: cyl(0.004, 0.5, 6),
  dome: new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  domeGlass: new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  wall: new THREE.BoxGeometry(0.09, 0.2, 0.11),
  wallGlass: new THREE.BoxGeometry(0.02, 0.16, 0.08),
  strip: new THREE.BoxGeometry(1, 0.02, 0.03),
  flood: new THREE.BoxGeometry(0.22, 0.16, 0.05),
};

function Parts({ type, cct, lit }: { type: Fixture['luminaire']['type']; cct: number; lit: boolean }) {
  const g = lit ? litGlass(cct) : OFF_GLASS;
  const m = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], rotation?: [number, number, number]) => (
    <mesh geometry={geometry} material={material} position={position} rotation={rotation} raycast={() => null} />
  );
  switch (type) {
    case 'plafon':
      return (
        <>
          {m(GEO.plafon, BODY, [0, -0.025, 0])}
          {m(GEO.plafonGlass, g, [0, -0.053, 0])}
        </>
      );
    case 'downlight':
      return (
        <>
          {m(GEO.down, BODY, [0, -0.008, 0])}
          {m(GEO.downGlass, g, [0, -0.017, 0])}
        </>
      );
    case 'spot':
      return (
        <>
          {m(GEO.spot, BODY, [0, -0.045, 0])}
          {m(GEO.spotGlass, g, [0, -0.092, 0])}
        </>
      );
    case 'pendant':
      return (
        <>
          {m(GEO.cord, BODY, [0, -0.25, 0])}
          {m(GEO.dome, BODY, [0, -0.5, 0], [Math.PI, 0, 0])}
          {m(GEO.domeGlass, g, [0, -0.5, 0], [Math.PI, 0, 0])}
        </>
      );
    case 'wall':
      return (
        <>
          {m(GEO.wall, BODY, [0.045, 0, 0])}
          {m(GEO.wallGlass, g, [0.1, 0, 0])}
        </>
      );
    case 'strip':
      return m(GEO.strip, g, [0, -0.015, 0]);
    case 'flood':
      return (
        <>
          {m(GEO.flood, BODY, [0, -0.08, 0])}
          {m(GEO.flood, g, [0, -0.08, 0.026])}
        </>
      );
  }
}

interface Placed {
  f: Fixture;
  /** Cena (y para cima). */
  pos: [number, number, number];
  /** Guinada em torno de Y para a normal da arandela (rad). */
  yaw: number;
  spot: boolean;
  /** Onde a luz real fica (um pouco abaixo ou à frente da peça). */
  lightAt: [number, number, number];
}

function usePlaced(model: BuildingModel, elevations: Record<string, number>): Placed[] {
  const layout = useEditor((s) => s.results?.installations?.electrical?.layout);
  return useMemo(() => {
    if (!layout) return [];
    const walls = new Map(model.walls.map((w) => [w.id, { id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness }]));
    return fixturesOf(layout.points, k).map((f) => {
      let z = (elevations[f.level] ?? 0) + f.height;
      const n = f.hostId ? faceNormal(f.position, walls.get(f.hostId)) : null;
      // luminária de teto sob o telhado inclinado: o pé-direito médio pode estar acima do forro neste ponto
      if (!f.hostId) {
        const roof = roofZAt(model.roofPlanes, f.position);
        const drop = f.luminaire.type === 'pendant' ? 0.7 : 0.25;
        if (roof !== null && z > roof - drop) z = roof - drop;
      }
      const yaw = n ? Math.atan2(n[1], n[0]) : 0;
      const type = f.luminaire.type;
      const pos: [number, number, number] = [f.position[0], z, -f.position[1]];
      const lightAt: [number, number, number] =
        type === 'wall' && n ? [pos[0] + n[0] * 0.18, z, pos[2] - n[1] * 0.18] : [pos[0], z - (type === 'pendant' ? 0.55 : LIGHT_DROP), pos[2]];
      return { f, pos, yaw, spot: SPOT_TYPES.has(type), lightAt };
    });
  }, [layout, model.walls, model.roofPlanes, elevations]);
}

/** As luzes reais (poucas, fixas em número para não recompilar o shader) seguem as luminárias mais próximas da câmera. */
function LightPool({ items }: { items: Placed[] }) {
  const pool = useMemo(
    () => ({
      points: Array.from({ length: REAL_POINT_LIGHTS }, () => new THREE.PointLight('#ffffff', 0, LIGHT_DISTANCE, 2)),
      spots: Array.from({ length: REAL_SPOT_LIGHTS }, () => new THREE.SpotLight('#ffffff', 0, LIGHT_DISTANCE, 0.5, 0.4, 2)),
    }),
    [],
  );
  useEffect(() => () => [...pool.points, ...pool.spots].forEach((l) => l.dispose()), [pool]);
  const last = useRef({ x: NaN, y: NaN, z: NaN, n: -1 });
  const asItems = useMemo(() => items.map((i) => ({ id: i.f.id, pos: i.lightAt, spot: i.spot })), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.f.id, i])), [items]);

  useFrame(({ camera }) => {
    const c = camera.position;
    const l = last.current;
    // reavalia só quando a câmera andou 25 cm ou a lista mudou
    if (l.n === items.length && Math.hypot(c.x - l.x, c.y - l.y, c.z - l.z) < 0.25) return;
    last.current = { x: c.x, y: c.y, z: c.z, n: items.length };
    const from: [number, number, number] = [c.x, c.y, c.z];
    const pts = nearestFixtures(asItems.filter((i) => !i.spot), from, REAL_POINT_LIGHTS);
    const sps = nearestFixtures(asItems.filter((i) => i.spot), from, REAL_SPOT_LIGHTS);
    pool.points.forEach((light, i) => {
      const it = pts[i] ? byId.get(pts[i]!) : undefined;
      if (!it) {
        light.intensity = 0;
        return;
      }
      const rig = lightRig(it.f.luminaire, it.f.count);
      light.position.set(...it.lightAt);
      light.color.set(rig.color);
      light.intensity = rig.intensity * SCENE_GAIN;
    });
    pool.spots.forEach((light, i) => {
      const it = sps[i] ? byId.get(sps[i]!) : undefined;
      if (!it) {
        light.intensity = 0;
        return;
      }
      const rig = lightRig(it.f.luminaire, it.f.count);
      light.position.set(...it.lightAt);
      light.target.position.set(it.lightAt[0], it.lightAt[1] - 1, it.lightAt[2]);
      light.target.updateMatrixWorld();
      light.color.set(rig.color);
      if (rig.kind === 'spot') {
        light.angle = rig.angle;
        light.penumbra = rig.penumbra;
      }
      light.intensity = rig.intensity * SCENE_GAIN;
    });
  });

  return (
    <>
      {pool.points.map((l, i) => (
        <primitive key={`p${i}`} object={l} />
      ))}
      {pool.spots.map((l, i) => (
        <group key={`s${i}`}>
          <primitive object={l} />
          <primitive object={l.target} />
        </group>
      ))}
    </>
  );
}

/**
 * Luminárias do projeto elétrico no 3D (Acabado e Apresentação): plafon, embutido, spot, pendente e arandela.
 * Com `lit` (Luzes acesas) o vidro brilha e as mais próximas da câmera iluminam de verdade.
 */
export function ElecLuminaires({ model, elevations, lit }: { model: BuildingModel; elevations: Record<string, number>; lit: boolean }) {
  const items = usePlaced(model, elevations);
  if (items.length === 0) return null;
  return (
    <>
      <group name="elec-luminaires">
        {items.map((it) => (
          <group key={it.f.id} position={it.pos} rotation={[0, it.yaw, 0]}>
            <Parts type={it.f.luminaire.type} cct={it.f.luminaire.cct} lit={lit} />
          </group>
        ))}
      </group>
      {lit ? <LightPool items={items} /> : null}
    </>
  );
}
