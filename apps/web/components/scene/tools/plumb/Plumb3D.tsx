'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { PipeSystem, PlumbingLayout, Project } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { FALLBACK_COLORS, levelElevation, SYSTEMS, type V3 } from '@/lib/plumb/geometry';
import { liveLayout, plumbingReportOf } from '@/lib/plumb/live';
import { pipeInfo } from '@/lib/plumb/symbols';
import { usePlumb } from '@/lib/plumb/store';
import { ExplodeGroup } from '../../ExplodeGroup';

/** DN usado quando o motor não calculou o tubo (soltos ou fora da rede). */
const FALLBACK_DN: Record<PipeSystem, number> = { cold: 25, hot: 22, sewer: 50, vent: 50 };

export interface PipeSeg {
  mid: V3;
  dir: V3;
  length: number;
  /** Raio (m) = DN/2 (tubo em escala 1:1). */
  radius: number;
}

/** Segmentos de cilindro de cada sistema, em cota absoluta (m), com o diâmetro real do tubo (DN em mm). */
export function pipeSegments(layout: PlumbingLayout, project: Pick<Project, 'levels'>, dnOf: (id: string, system: PipeSystem) => number): Record<PipeSystem, { segs: PipeSeg[]; joints: { at: V3; radius: number }[] }> {
  const out = Object.fromEntries(SYSTEMS.map((s) => [s, { segs: [] as PipeSeg[], joints: [] as { at: V3; radius: number }[] }])) as Record<PipeSystem, { segs: PipeSeg[]; joints: { at: V3; radius: number }[] }>;
  for (const p of layout.pipes) {
    const e = levelElevation(project, p.level);
    const radius = dnOf(p.id, p.system) / 2000;
    const path = (p.path as V3[]).map((v): V3 => [v[0], v[1], v[2] + e]);
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const length = Math.hypot(d[0], d[1], d[2]);
      if (length < 1e-4) continue;
      out[p.system].segs.push({ mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], dir: [d[0] / length, d[1] / length, d[2] / length], length, radius });
    }
    for (const v of path) out[p.system].joints.push({ at: v, radius });
  }
  return out;
}

const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
const ball = new THREE.SphereGeometry(1, 10, 8);

function SystemMesh({ segs, joints, color }: { segs: PipeSeg[]; joints: { at: V3; radius: number }[]; color: string }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const balls = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = body.current;
    const b = balls.current;
    const o = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    if (m) {
      segs.forEach((s, i) => {
        o.position.set(...s.mid);
        o.quaternion.setFromUnitVectors(up, new THREE.Vector3(...s.dir));
        o.scale.set(s.radius, s.length, s.radius);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.count = segs.length;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    if (b) {
      joints.forEach((j, i) => {
        o.position.set(...j.at);
        o.quaternion.identity();
        o.scale.setScalar(j.radius);
        o.updateMatrix();
        b.setMatrixAt(i, o.matrix);
      });
      b.count = joints.length;
      b.instanceMatrix.needsUpdate = true;
      b.computeBoundingSphere();
    }
  }, [segs, joints]);
  if (segs.length === 0) return null;
  return (
    <>
      <instancedMesh ref={body} args={[cyl, undefined, segs.length]} frustumCulled={false} name="plumb-pipes">
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={balls} args={[ball, undefined, joints.length]} frustumCulled={false}>
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
      </instancedMesh>
    </>
  );
}

/**
 * Tubos da hidráulica no 3D (dentro do MotorGroup): cilindros por sistema, com as cores do catálogo e o diâmetro real
 * (DN em escala 1:1), a partir do traçado efetivo e do DN calculado de cada tubo.
 */
export function Plumb3D({ exploded, gap }: { exploded: boolean; gap: number }) {
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const systems = usePlumb((s) => s.systems);
  const report = plumbingReportOf(project, results);
  const layout = useMemo(() => liveLayout(project, report), [project, report]);
  const info = useMemo(() => (report ? pipeInfo(report) : new Map<string, { dn: number }>()), [report]);
  const colors = getCatalog().constants.plumbing.colors as Record<PipeSystem, string>;
  const groups = useMemo(() => (layout ? pipeSegments(layout, project, (id, sys) => layout.pipes.find((p) => p.id === id)?.dn ?? info.get(id)?.dn ?? FALLBACK_DN[sys]) : null), [layout, project, info]);
  if (!groups) return null;
  return (
    <ExplodeGroup layer="closure" active={exploded} gap={gap}>
      {SYSTEMS.filter((s) => systems[s]).map((s) => (
        <SystemMesh key={s} segs={groups[s].segs} joints={groups[s].joints} color={colors[s] ?? FALLBACK_COLORS[s]} />
      ))}
    </ExplodeGroup>
  );
}
