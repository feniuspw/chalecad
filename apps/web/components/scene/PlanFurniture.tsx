'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { Furniture, FurnitureModel } from '@chalecad/engine';
import { furnitureSymbol, placeStrokes } from '@/lib/plan2d/furnitureSymbols';
import { specOf } from '@/lib/project/furniture';
import type { V2 } from '@/lib/tools/geom';
import type { AlertLevel } from './furnitureData';
import { FurnitureSelection } from './FurnitureView';
import { furnitureBaseZ, useFurnitureDrag, type WallLike } from './tools/furnitureDrag';

const catalog = getCatalog();
const INK = new THREE.Color('#44403c');
const SOFT = new THREE.Color('#78716c');
const RED = new THREE.Color('#dc2626');

/** Todos os traços dos símbolos do nível numa só geometria de segmentos (fina, uma chamada de desenho). */
function buildSymbolLines(items: { f: Furniture; alert: AlertLevel | undefined }[], z: (f: Furniture) => number) {
  const pos: number[] = [];
  const col: number[] = [];
  for (const { f, alert } of items) {
    const spec = specOf(catalog, f.item);
    if (!spec) continue;
    const bad = alert === 'warn' || alert === 'error';
    for (const st of placeStrokes(furnitureSymbol(spec.model, spec.size), f.position as V2, f.rotation)) {
      const c = bad ? RED : st.light ? SOFT : INK;
      const n = st.pts.length;
      for (let i = 0; i < (st.closed ? n : n - 1); i++) {
        const a = st.pts[i]!;
        const b = st.pts[(i + 1) % n]!;
        pos.push(a[0], a[1], z(f), b[0], b[1], z(f));
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

interface Props {
  models: FurnitureModel[];
  furniture: Furniture[];
  walls: WallLike[];
  level: string;
  selectedId: string | null;
  alerts: Map<string, AlertLevel>;
  interactive: boolean;
}

/** Móveis na planta: preenchimento claro e símbolo de arquitetura em traço fino; alerta warn em vermelho. */
export function PlanFurniture({ models, furniture, walls, level, selectedId, alerts, interactive }: Props) {
  const { beginMove, beginRotate } = useFurnitureDrag(models, walls);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const items = useMemo(() => furniture.filter((f) => f.level === level && byId.has(f.id)), [furniture, level, byId]);
  const lines = useMemo(() => buildSymbolLines(items.map((f) => ({ f, alert: alerts.get(f.id) })), (f) => furnitureBaseZ(byId.get(f.id)!) + 0.04), [items, alerts, byId]);
  useEffect(() => () => lines.dispose(), [lines]);

  const sel = selectedId ? items.find((f) => f.id === selectedId) : undefined;
  const selSpec = sel ? specOf(catalog, sel.item) : undefined;
  const selModel = sel ? byId.get(sel.id) : undefined;

  return (
    <group>
      {items.map((f) => (
        <PlanFill key={f.id} f={f} model={byId.get(f.id)!} interactive={interactive} onDown={beginMove} />
      ))}
      <lineSegments geometry={lines} renderOrder={7} raycast={() => null}>
        <lineBasicMaterial vertexColors depthTest={false} toneMapped={false} transparent />
      </lineSegments>
      {interactive && sel && selSpec && selModel ? <FurnitureSelection f={sel} spec={selSpec} model={selModel} alert={alerts.get(sel.id)} onRotateStart={(e) => beginRotate(sel, e)} /> : null}
    </group>
  );
}

function PlanFill({ f, model, interactive, onDown }: { f: Furniture; model: FurnitureModel; interactive: boolean; onDown: (f: Furniture, e: Parameters<ReturnType<typeof useFurnitureDrag>['beginMove']>[1]) => void }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(model.polygon.map(([x, y]) => new THREE.Vector2(x, y)))), [model.polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const spec = specOf(catalog, f.item);
  const rug = spec?.collides === false;
  return (
    <mesh
      geometry={geometry}
      position={[0, 0, furnitureBaseZ(model) + 0.02]}
      renderOrder={rug ? 3 : 4}
      onPointerDown={interactive ? (e) => onDown(f, e) : undefined}
      onClick={interactive ? (e) => e.stopPropagation() : undefined}
      onPointerOver={interactive ? () => (document.body.style.cursor = 'move') : undefined}
      onPointerOut={interactive ? () => (document.body.style.cursor = '') : undefined}
    >
      <meshBasicMaterial color={rug ? '#e9e1d2' : '#fffaf0'} transparent opacity={rug ? 0.8 : 0.92} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
