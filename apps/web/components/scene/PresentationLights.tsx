'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildingModel } from '@chalecad/engine';
import { MIN_SHADOW_ELEVATION, mixHex, sunLight, sunVector } from '@/lib/sun';
import type { ThreeBounds } from '@/lib/three/convert';
import { boxCorners, fitShadowFrustum, type Vec3 } from '@/lib/three/shadow';
import { GRASS_TILE, getGrassTexture } from '@/lib/three/textures';
import { polygonCentroid } from '@/lib/three/walk';
import { roomFloorZ } from '@/lib/three/finishes';
import { effectiveQuality, usePresentationUi } from './presentationUi';
import { NightSky, nightAmount } from './NightSky';
import { useSunState } from './useSunState';

/** Motor (z para cima) para cena (y para cima). */
const toScene = (v: [number, number, number]): Vec3 => [v[0], v[2], -v[1] + 0];

const GROUND_RADIUS = 400;
const MAX_LAMPS = 10;

export interface PresentationLightsProps {
  model: BuildingModel;
  bounds: ThreeBounds;
  /** Há terreno inclinado desenhado pelo TerrainView: o chão de grama fica abaixo, só até o horizonte. */
  hasTerrain: boolean;
}

/**
 * Iluminação procedural do modo apresentação: sol real (posição, cor e intensidade pela elevação),
 * céu, ambiente com Lightformers (sem HDRI), hemisfério, névoa, chão de grama e luzes internas.
 */
export function PresentationLights({ model, bounds, hasTerrain }: PresentationLightsProps) {
  const sun = useSunState();
  const quality = effectiveQuality(usePresentationUi((s) => s.quality), usePresentationUi((s) => s.degraded));
  const lamps = usePresentationUi((s) => s.lamps);
  const light = useMemo(() => sunLight(sun.elevationDeg), [sun.elevationDeg]);
  const night = nightAmount(sun.elevationDeg);

  const dir = useMemo(() => toScene(sunVector(sun.azimuthDeg, sun.elevationDeg, sun.northDeg)), [sun.azimuthDeg, sun.elevationDeg, sun.northDeg]);
  // a luz que projeta sombra nunca fica mais baixa que MIN_SHADOW_ELEVATION (o frustum explodiria)
  const shadowDir = useMemo(
    () => toScene(sunVector(sun.azimuthDeg, Math.max(sun.elevationDeg, MIN_SHADOW_ELEVATION), sun.northDeg)),
    [sun.azimuthDeg, sun.elevationDeg, sun.northDeg],
  );
  const moonDir = useMemo(() => toScene(sunVector(sun.azimuthDeg + 180, 45, sun.northDeg)), [sun.azimuthDeg, sun.northDeg]);

  const frustum = useMemo(() => {
    const corners = boxCorners(bounds.min, bounds.max);
    // pontos do chão atingidos pelos raios que passam pelos cantos: só alongam a profundidade
    const groundY = bounds.min[1];
    const ground: Vec3[] = corners.map((c) => {
      const t = Math.max(0, (c[1] - groundY) / Math.max(shadowDir[1], 0.05));
      return [c[0] - shadowDir[0] * t, groundY, c[2] - shadowDir[2] * t];
    });
    return fitShadowFrustum([...corners, ...ground], bounds.center, shadowDir, 3);
  }, [bounds, shadowDir]);

  const sunRef = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const l = sunRef.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = frustum.left;
    cam.right = frustum.right;
    cam.top = frustum.top;
    cam.bottom = frustum.bottom;
    cam.near = frustum.near;
    cam.far = frustum.far;
    cam.updateProjectionMatrix();
  }, [frustum, quality]);

  const sunPos: Vec3 = [
    bounds.center[0] + shadowDir[0] * frustum.distance,
    bounds.center[1] + shadowDir[1] * frustum.distance,
    bounds.center[2] + shadowDir[2] * frustum.distance,
  ];
  const mapSize = quality === 'high' ? 4096 : 2048;

  const horizon = useMemo(() => {
    const day = mixHex('#2a3350', '#cfe1f3', light.daylight);
    return mixHex(day, '#f3b27a', Math.max(0, 1 - Math.abs(sun.elevationDeg - 2) / 12) * 0.6);
  }, [light.daylight, sun.elevationDeg]);

  return (
    <>
      <hemisphereLight color={light.sky} groundColor={light.ground} intensity={light.hemi} />
      {/* luz de preenchimento: ceilings e cantos internos recebem bounce do ambiente */}
      <ambientLight color="#fff4e6" intensity={0.12 + 0.28 * light.daylight} />
      <primitive object={target} position={bounds.center} />
      {light.sun > 0.01 ? (
        <directionalLight
          key={`sun-${mapSize}`}
          ref={sunRef}
          target={target}
          position={sunPos}
          color={light.color}
          intensity={light.sun}
          castShadow
          shadow-mapSize={[mapSize, mapSize]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.025}
          shadow-radius={2.5}
        />
      ) : null}
      {light.moon > 0.01 ? (
        <directionalLight
          position={[bounds.center[0] + moonDir[0] * 40, bounds.center[1] + moonDir[1] * 40, bounds.center[2] + moonDir[2] * 40]}
          target={target}
          color="#7f9bff"
          intensity={light.moon}
        />
      ) : null}

      {night < 1 ? <Sky distance={1000} sunPosition={dir} turbidity={sun.elevationDeg < 10 ? 7 : 4} rayleigh={sun.elevationDeg < 6 ? 2.4 : 1.2} mieCoefficient={0.005} mieDirectionalG={0.82} /> : null}
      <NightSky amount={night} />
      <Environment resolution={128} environmentIntensity={light.env}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#cfe0ff" position={[-10, 3, 0]} rotation-y={Math.PI / 2} scale={[14, 5, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffe6c8" position={[10, 3, 0]} rotation-y={-Math.PI / 2} scale={[14, 5, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#e6efff" position={[0, 3, -10]} scale={[14, 5, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#fff1dd" position={[0, 3, 10]} rotation-y={Math.PI} scale={[14, 5, 1]} />
      </Environment>
      <fog attach="fog" args={[horizon, Math.max(80, bounds.radius * 6), GROUND_RADIUS - 20]} />

      <GrassGround y={hasTerrain ? bounds.min[1] - 8 : bounds.min[1] - 0.002} night={light.daylight} />
      {lamps ? <RoomLamps model={model} /> : null}
    </>
  );
}

function GrassGround({ y, night }: { y: number; night: number }) {
  const map = useMemo(() => getGrassTexture(), []);
  useEffect(() => {
    if (!map) return;
    const r = (2 * GROUND_RADIUS) / GRASS_TILE;
    map.repeat.set(r, r);
    map.needsUpdate = true;
  }, [map]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <circleGeometry args={[GROUND_RADIUS, 72]} />
      <meshStandardMaterial color={mixHex('#4c5a45', '#8aa863', night)} map={map ?? null} roughness={1} metalness={0} />
    </mesh>
  );
}

/** Uma luz quente por cômodo resolvido, no centroide a 2,2 m do piso (ou 0,3 m abaixo do teto, se mais baixo). */
function RoomLamps({ model }: { model: BuildingModel }) {
  const lamps = useMemo(() => {
    const out: { id: string; pos: Vec3 }[] = [];
    for (const r of model.rooms) {
      if (!r.polygon || r.polygon.length < 3 || out.length >= MAX_LAMPS) continue;
      const [cx, cy] = polygonCentroid(r.polygon);
      const floor = roomFloorZ(r, model.walls, model.slabs);
      const h = Math.min(2.2, Math.max(1.8, r.ceiling.min - 0.3));
      out.push({ id: r.id, pos: [cx, floor + h, -cy + 0] });
    }
    return out;
  }, [model.rooms, model.walls, model.slabs]);
  return (
    <>
      {lamps.map((l) => (
        <pointLight key={l.id} position={l.pos} color="#ffb673" intensity={16} distance={9} decay={2} />
      ))}
    </>
  );
}
