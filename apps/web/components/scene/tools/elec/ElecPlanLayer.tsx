'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BuildingModel, Vec2 } from '@chalecad/engine';
import { useElecUi } from '@/lib/elec/ui';
import { ALERT_COLOR, CONDUIT_COLOR, CONTROL_COLOR, SELECT_COLOR } from '@/lib/elec/kinds';
import { dashSegments, fanTriangles, polylineQuads, ringQuads, segmentQuad } from '@/lib/elec/mesh';
import type { PlanLabel, SymbolShape } from '@/lib/elec/symbols';
import { PLAN_CUT_HEIGHT } from '@/lib/three/views';
import { labelSprite } from './labelSprites';
import { useElecPlan } from './useElecPlan';

const LINE = 0.03;
const CONDUIT_W = 0.035;

function Tri({ data, color, order, opacity = 1 }: { data: number[]; color: string; order: number; opacity?: number }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(data, 3)), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (data.length === 0) return null;
  return (
    <mesh geometry={geometry} renderOrder={order} frustumCulled={false} raycast={() => null}>
      <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** Texto do plano como sprite (tamanho em metros: cresce com o zoom como o desenho). */
export function PlanText({ label, z }: { label: PlanLabel; z: number }) {
  const { material, aspect } = labelSprite(label.text, label.color);
  return <sprite material={material} position={[label.at[0], label.at[1], z]} scale={[label.size * aspect * 1.45, label.size * 1.45, 1]} renderOrder={60} raycast={() => null} />;
}

/** Símbolo (contorno e preenchimento) numa cor. */
export function SymbolMesh({ shape, color, z, order = 40, opacity = 1 }: { shape: SymbolShape; color: string; z: number; order?: number; opacity?: number }) {
  const lines = useMemo(() => {
    const out: number[] = [];
    for (const s of shape.outline) polylineQuads(s.pts, s.closed, LINE, z, out);
    return out;
  }, [shape, z]);
  const fills = useMemo(() => {
    const out: number[] = [];
    for (const f of shape.fills) fanTriangles(f, z, out);
    return out;
  }, [shape, z]);
  return (
    <>
      <Tri data={fills} color={color} order={order} opacity={opacity} />
      <Tri data={lines} color={color} order={order + 1} opacity={opacity} />
    </>
  );
}

/**
 * Camada "Elétrica" da planta: símbolos NBR 5444 por circuito, eletrodutos (contínuo no forro, tracejado no piso)
 * com DN e nº de circuitos, ligações interruptor → luz com a letra do comando e rótulos. Desenha o
 * `report.electrical.layout`, que vale para o traçado gerado e para o manual.
 */
export function ElecPlanLayer({ model, level, elevation }: { model: BuildingModel; level: string; elevation: number }) {
  const plan = useElecPlan(model, level);
  const selected = useElecUi((s) => s.selected);
  const focus = useElecUi((s) => s.focus);
  const z = elevation + PLAN_CUT_HEIGHT + 0.06;

  const conduits = useMemo(() => {
    const solid: number[] = [];
    const dashed: number[] = [];
    if (!plan) return { solid, dashed };
    for (const c of plan.conduits) {
      if (c.run === 'ceiling') polylineQuads(c.path, false, CONDUIT_W, z, solid);
      else for (const [a, b] of dashSegments(c.path, c.run === 'floor' ? 0.16 : 0.06, c.run === 'floor' ? 0.1 : 0.06)) segmentQuad(a, b, CONDUIT_W, z, dashed);
    }
    return { solid, dashed };
  }, [plan, z]);

  const links = useMemo(() => {
    const out: number[] = [];
    if (!plan) return out;
    // como nas pranchas: a letra do comando junto de cada luz basta; as linhas só aparecem para o interruptor (ou a luz)
    // selecionado, senão um interruptor de sala com 12 luzes vira um leque de tracejados
    const sel = selected?.kind === 'point' ? selected.id : null;
    if (!sel) return out;
    for (const l of plan.links) {
      if (l.switchId !== sel && l.lightId !== sel) continue;
      for (const [a, b] of dashSegments([l.from, l.to], 0.1, 0.07)) segmentQuad(a, b, 0.015, z + 0.001, out);
    }
    return out;
  }, [plan, z, selected]);

  const highlight = useMemo(() => {
    const sel: number[] = [];
    const alert: number[] = [];
    if (!plan) return { sel, alert };
    const pointAt = (id: string): Vec2 | null => plan.points.find((p) => p.id === id)?.shape.center ?? null;
    if (selected?.kind === 'point') {
      const c = pointAt(selected.id);
      if (c) ringQuads(c, 0.3, 0.04, z + 0.003, sel);
    } else if (selected?.kind === 'conduit') {
      const c = plan.conduits.find((x) => x.id === selected.id);
      if (c) polylineQuads(c.path, false, 0.09, z - 0.001, sel);
    }
    for (const id of focus) {
      const c = pointAt(id);
      if (c) ringQuads(c, 0.34, 0.045, z + 0.004, alert);
      const cd = plan.conduits.find((x) => x.id === id);
      if (cd) polylineQuads(cd.path, false, 0.09, z - 0.002, alert);
    }
    return { sel, alert };
  }, [plan, selected, focus, z]);

  const roomOutlines = useMemo(() => {
    const out: number[] = [];
    for (const id of focus) {
      const r = model.rooms.find((x) => x.id === id);
      if (r?.polygon && r.level === level) polylineQuads(r.polygon as Vec2[], true, 0.06, z + 0.002, out);
    }
    return out;
  }, [focus, model.rooms, level, z]);

  const byColor = useMemo(() => {
    const m = new Map<string, { lines: number[]; fills: number[] }>();
    if (!plan) return m;
    for (const it of plan.points) {
      const g = m.get(it.color) ?? { lines: [], fills: [] };
      for (const s of it.shape.outline) polylineQuads(s.pts, s.closed, LINE, z + 0.002, g.lines);
      for (const f of it.shape.fills) fanTriangles(f, z + 0.002, g.fills);
      m.set(it.color, g);
    }
    return m;
  }, [plan, z]);

  if (!plan) return null;
  return (
    <group name="elec-plan">
      <Tri data={highlight.sel} color={SELECT_COLOR} order={30} />
      <Tri data={highlight.alert} color={ALERT_COLOR} order={31} opacity={0.9} />
      <Tri data={roomOutlines} color={ALERT_COLOR} order={31} opacity={0.9} />
      <Tri data={conduits.solid} color={CONDUIT_COLOR} order={32} />
      <Tri data={conduits.dashed} color={CONDUIT_COLOR} order={32} />
      <Tri data={links} color={CONTROL_COLOR} order={33} opacity={0.85} />
      {[...byColor.entries()].map(([color, g]) => (
        <group key={color}>
          <Tri data={g.fills} color={color} order={40} />
          <Tri data={g.lines} color={color} order={41} />
        </group>
      ))}
      {plan.points.flatMap((it) => it.labels.map((l, i) => <PlanText key={`${it.id}-${i}`} label={l} z={z + 0.01} />))}
      {plan.conduits.map((c) => (c.label ? <PlanText key={c.id} label={c.label} z={z + 0.01} /> : null))}
    </group>
  );
}
