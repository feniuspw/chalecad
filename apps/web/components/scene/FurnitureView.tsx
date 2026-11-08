'use client';
import { memo, useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalog, type FurnitureSpec } from '@chalecad/catalog';
import type { Furniture, FurnitureModel } from '@chalecad/engine';
import { fmt } from '@/lib/project/format';
import { specOf } from '@/lib/project/furniture';
import { explodeGap } from '@/lib/three/views';
import { getFurnitureMaterial, getFurnitureParts, type Tone } from '@/lib/three/furniture/materials';
import type { V2 } from '@/lib/tools/geom';
import type { AlertLevel } from './furnitureData';
import { SceneLabel } from './labels';
import { MotorGroup } from './MotorGroup';
import { ConstantSize } from './tools/ConstantSize';
import { furnitureBaseZ, useFurnitureDrag, type WallLike } from './tools/furnitureDrag';
import { ExplodeGroup } from './ExplodeGroup';

const AMBER = '#f59e0b';
const RED = '#dc2626';
const catalog = getCatalog();

interface ItemProps {
  f: Furniture;
  spec: FurnitureSpec;
  z: number;
  interactive: boolean;
  onDown: (f: Furniture, e: ThreeEvent<PointerEvent>) => void;
}

/** Um móvel: uma malha por material (geometria fundida e memorizada), projeta e recebe sombra. */
const FurnitureItem = memo(function FurnitureItem({ f, spec, z, interactive, onDown }: ItemProps) {
  const parts = useMemo(() => getFurnitureParts(spec.model, spec.size), [spec.model, spec.size]);
  const tone = f.tone as Tone | undefined;
  return (
    <group
      position={[f.position[0], f.position[1], z]}
      rotation={[0, 0, (f.rotation * Math.PI) / 180]}
      onPointerDown={interactive ? (e) => onDown(f, e) : undefined}
      onClick={interactive ? (e) => e.stopPropagation() : undefined}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              document.body.style.cursor = 'move';
            }
          : undefined
      }
      onPointerOut={interactive ? () => (document.body.style.cursor = '') : undefined}
    >
      {parts.map((p) => (
        <mesh key={p.token} geometry={p.geometry} material={getFurnitureMaterial(p.token, tone)} castShadow={p.token !== 'glass'} receiveShadow />
      ))}
    </group>
  );
});

const lineLoop = (poly: V2[], z: number): [number, number, number][] => [...poly, poly[0]!].map(([x, y]) => [x, y, z]);

/** Contorno, faixa de uso tracejada, medidas e alça de giro do móvel selecionado. */
export function FurnitureSelection({ f, spec, model, alert, onRotateStart }: { f: Furniture; spec: FurnitureSpec; model: FurnitureModel; alert: AlertLevel | undefined; onRotateStart: (e: ThreeEvent<PointerEvent>) => void }) {
  const z = furnitureBaseZ(model) + 0.02;
  const color = alert === 'warn' || alert === 'error' ? RED : AMBER;
  const fill = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(model.polygon.map(([x, y]) => new THREE.Vector2(x, y)))), [model.polygon]);
  const clear = model.clearance as V2[] | null;
  const r = Math.max(spec.size.w, spec.size.d) / 2 + 0.32;
  const a = (f.rotation * Math.PI) / 180;
  const handle: [number, number, number] = [f.position[0] + Math.cos(a) * r, f.position[1] + Math.sin(a) * r, z + 0.02];
  return (
    <>
      <mesh geometry={fill} position={[0, 0, z - 0.005]} renderOrder={940} raycast={() => null}>
        <meshBasicMaterial color={color} transparent opacity={0.16} depthTest={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={lineLoop(model.polygon as V2[], z)} color={color} lineWidth={2.2} depthTest={false} renderOrder={950} />
      {clear ? <Line points={lineLoop(clear, z)} color={color} lineWidth={1.2} dashed dashSize={0.08} gapSize={0.06} depthTest={false} renderOrder={949} /> : null}
      <Line points={[[f.position[0], f.position[1], z], handle]} color={color} lineWidth={1} dashed dashSize={0.05} gapSize={0.04} depthTest={false} renderOrder={949} />
      <ConstantSize position={handle} px={1}>
        <mesh
          renderOrder={960}
          onPointerDown={(e) => {
            e.stopPropagation();
            onRotateStart(e);
          }}
          onPointerOver={() => (document.body.style.cursor = 'grab')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <ringGeometry args={[6, 9, 24]} />
          <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh renderOrder={960} raycast={() => null}>
          <circleGeometry args={[5.4, 20]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
        </mesh>
      </ConstantSize>
      <SceneLabel position={[f.position[0], f.position[1], z + spec.size.h + 0.1]} tone={color === RED ? 'bad' : 'live'}>
        {spec.name} · {fmt(spec.size.w)} × {fmt(spec.size.d)} m
      </SceneLabel>
    </>
  );
}

export interface FurnitureViewProps {
  models: FurnitureModel[];
  furniture: Furniture[];
  walls: WallLike[];
  selectedId: string | null;
  alerts: Map<string, AlertLevel>;
  /** Ferramenta Selecionar ativa e fora da apresentação: clicar seleciona, arrastar move. */
  interactive: boolean;
  exploded?: boolean;
  ridgeHeight?: number;
}

/** Móveis no 3D (modos Acabado, Apresentação e Explodido). */
export function FurnitureView({ models, furniture, walls, selectedId, alerts, interactive, exploded = false, ridgeHeight = 4 }: FurnitureViewProps) {
  const { beginMove, beginRotate } = useFurnitureDrag(models, walls);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const sel = selectedId ? furniture.find((f) => f.id === selectedId) : undefined;
  const selSpec = sel ? specOf(catalog, sel.item) : undefined;
  const selModel = sel ? byId.get(sel.id) : undefined;

  return (
    <MotorGroup>
      <ExplodeGroup layer="structure" active={exploded} gap={explodeGap(ridgeHeight)}>
        {furniture.map((f) => {
          const spec = specOf(catalog, f.item);
          const m = byId.get(f.id);
          if (!spec || !m) return null;
          return <FurnitureItem key={f.id} f={f} spec={spec} z={furnitureBaseZ(m)} interactive={interactive} onDown={beginMove} />;
        })}
        {interactive && sel && selSpec && selModel ? <FurnitureSelection f={sel} spec={selSpec} model={selModel} alert={alerts.get(sel.id)} onRotateStart={(e) => beginRotate(sel, e)} /> : null}
      </ExplodeGroup>
    </MotorGroup>
  );
}
