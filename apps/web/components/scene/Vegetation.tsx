'use client';
import { useCallback, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SPRITES, type Placement, type SpriteId } from '@/lib/three/foliage';
import { placeOnSurface } from '@/lib/three/landscapeData';
import { hasPrepared } from '@/lib/three/presentationPrep';
import type { SurfaceCtx } from '@/lib/three/slopedSite';
import { disposeSpriteTextures, getSpriteTexture } from '@/lib/three/sprites';

/** Tempo compartilhado do vento (um uniform para todos os materiais). */
const WIND = { value: 0 };

/** Corte do alfa: abaixo disso o pixel some (e a sombra recortada segue o mesmo corte). */
const ALPHA_TEST = 0.45;

/** Balanço dos vértices do topo: o deslocamento cresce com o quadrado da altura relativa (0 no pé, 1 no topo). */
function patchWind(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string }) {
  shader.uniforms.uWind = WIND;
  shader.vertexShader =
    'uniform float uWind;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
#else
  vec3 ip = vec3( 0.0 );
#endif
float sw = position.y * position.y;
float ph = uWind * 1.6 + ip.x * 0.31 + ip.z * 0.23;
transformed.x += ( sin( ph ) + 0.5 * sin( ph * 2.3 + 1.7 ) ) * 0.035 * sw;
transformed.z += cos( ph * 0.9 + 0.5 ) * 0.022 * sw;`,
    );
}

/** Impostor: o quadro sempre encara a câmera (cilíndrico, só gira em torno do eixo vertical do mundo). */
function patchBillboard(shader: { vertexShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <defaultnormal_vertex>',
      `#include <defaultnormal_vertex>
vec3 bbUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
transformedNormal = normalize( bbUp * 0.85 + vec3( 0.0, 0.0, 0.5 ) );`,
    )
    .replace(
      '#include <project_vertex>',
      `vec3 bbUp2 = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
vec3 bbRight = normalize( cross( bbUp2, vec3( 0.0, 0.0, 1.0 ) ) );
float bbSx = length( instanceMatrix[0].xyz );
float bbSy = length( instanceMatrix[1].xyz );
vec4 mvPosition = modelViewMatrix * vec4( instanceMatrix[3].xyz, 1.0 );
mvPosition.xyz += bbRight * position.x * bbSx + bbUp2 * position.y * bbSy;
gl_Position = projectionMatrix * mvPosition;`,
    );
}

/** `planes` planos cruzados de largura `aspect` e altura 1 (pé na origem), com frente e verso, e normais voltadas para cima. */
export function makeCrossGeometry(aspect: number, planes: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let p = 0; p < planes; p++) {
    const phi = (p / planes) * Math.PI;
    const dx = Math.cos(phi), dz = Math.sin(phi);
    const nx = -Math.sin(phi), nz = Math.cos(phi);
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      const hw = aspect / 2;
      const corners: [number, number, number, number][] = [
        [-hw, 0, 0, 0],
        [hw, 0, 1, 0],
        [hw, 1, 1, 1],
        [-hw, 1, 0, 1],
      ];
      for (const [x, y, u, v] of corners) {
        pos.push(dx * x, y, dz * x);
        const l = Math.hypot(nx * 0.5, 0.85, nz * 0.5);
        nor.push((nx * side * 0.5) / l, 0.85 / l, (nz * side * 0.5) / l);
        uv.push(side === 1 ? u : 1 - u, v);
      }
      if (side === 1) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), Math.hypot(aspect / 2, 0.5) + 0.05);
  return g;
}

function makeBoardGeometry(aspect: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(aspect, 1);
  g.translate(0, 0.5, 0);
  return g;
}

interface Item {
  x: number;
  y: number;
  z: number;
  height: number;
  rot: number;
}

interface InstancesProps {
  sprite: SpriteId;
  items: Item[];
  mode: 'cross' | 'board';
  shadows: boolean;
  wind: boolean;
  texture: THREE.Texture;
}

const PLANES: Record<string, number> = { tree: 2, shrub: 3, grass: 3 };

/** Um InstancedMesh por tipo de sprite (e por modo): uma draw call, mais uma na sombra quando a árvore projeta. */
function SpriteInstances({ sprite, items, mode, shadows, wind, texture }: InstancesProps) {
  const info = SPRITES[sprite];
  const geometry = useMemo(() => (mode === 'cross' ? makeCrossGeometry(info.aspect, PLANES[info.kind] ?? 2) : makeBoardGeometry(info.aspect)), [info, mode]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: texture, alphaTest: ALPHA_TEST, roughness: 1, metalness: 0, side: mode === 'cross' ? THREE.FrontSide : THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      if (mode === 'board') patchBillboard(shader);
      else if (wind) patchWind(shader);
    };
    m.customProgramCacheKey = () => `veg-${mode}-${wind ? 'w' : 's'}`;
    return m;
  }, [texture, mode, wind]);
  const depth = useMemo(() => {
    if (!shadows || mode !== 'cross') return undefined;
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: ALPHA_TEST });
    m.onBeforeCompile = (shader) => {
      if (wind) patchWind(shader);
    };
    m.customProgramCacheKey = () => `vegd-${wind ? 'w' : 's'}`;
    return m;
  }, [shadows, mode, texture, wind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => depth?.dispose(), [depth]);

  const ref = useCallback(
    (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color();
      const up = new THREE.Vector3(0, 1, 0);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxH = 0;
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.height, it.height, it.height));
        mesh.setMatrixAt(i, m);
        // variação de tom por planta (determinística pela posição)
        const v = 0.86 + 0.26 * (Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233)) % 1);
        mesh.setColorAt(i, col.setRGB(v, v * (0.97 + 0.06 * Math.abs(Math.sin(it.x * 3.1))), v * 0.96));
        minX = Math.min(minX, it.x);
        maxX = Math.max(maxX, it.x);
        minZ = Math.min(minZ, it.z);
        maxZ = Math.max(maxZ, it.z);
        maxH = Math.max(maxH, it.height);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // esfera de culling manual: caixa dos pontos mais a altura da maior planta
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), Math.hypot(maxX - minX, maxZ - minZ) / 2 + maxH * 1.5 + 20);
    },
    [items],
  );
  if (items.length === 0) return null;
  const casts = shadows && mode === 'cross' && info.kind === 'tree';
  return (
    <instancedMesh
      key={`${sprite}-${mode}-${items.length}`}
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={casts}
      customDepthMaterial={casts ? depth : undefined}
      receiveShadow={false}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

export interface VegetationProps {
  placements: Placement[];
  /** Altura do chão (declive do lote e relevo): as plantas pousam nela. */
  surface: SurfaceCtx;
  quality: 'high' | 'light';
}

/**
 * Árvores, arbustos e capim em sprites com instancing. Árvores próximas: planos cruzados com sombra recortada;
 * distantes: impostores que encaram a câmera. Vento só na qualidade Alta.
 */
export function Vegetation({ placements, surface, quality }: VegetationProps) {
  const high = quality === 'high';
  const textures = useMemo(() => {
    const m = new Map<SpriteId, THREE.Texture>();
    for (const id of new Set(placements.map((p) => p.sprite))) {
      const t = getSpriteTexture(id, high ? 1 : 0.5);
      if (t) m.set(id, t);
    }
    return m;
  }, [placements, high]);
  // com o preparo retendo os sprites, só o próximo preparo os descarta (reentrar na apresentação não regenera)
  useEffect(() => () => {
    if (!hasPrepared()) disposeSpriteTextures();
  }, []);

  const groups = useMemo(() => placeOnSurface(placements, surface), [placements, surface]);

  useFrame((s) => {
    if (high) WIND.value = s.clock.elapsedTime;
  });

  return (
    <>
      {groups.map((g) => {
        const key = g.key;
        const tex = textures.get(g.sprite);
        if (!tex) return null;
        return <SpriteInstances key={key} sprite={g.sprite} items={g.items} mode={g.far ? 'board' : 'cross'} shadows wind={high} texture={tex} />;
      })}
    </>
  );
}
