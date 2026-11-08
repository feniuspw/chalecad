'use client';
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { getCatalog } from '@chalecad/catalog';
import type { PipeSystem } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { inferSewer } from '@/lib/plumb/devices';
import { dist2, FALLBACK_COLORS, fmtM, isVertical, type V2, type V3 } from '@/lib/plumb/geometry';
import { liveLayout, plumbingReportOf } from '@/lib/plumb/live';
import { criticalPath, pressureRows, sealMissing, sealRows, sealText } from '@/lib/plumb/report';
import { usePlumb } from '@/lib/plumb/store';
import { flowArrows, longestSegment, pipeInfo, pipeTag, stackTag, tankSide } from '@/lib/plumb/symbols';
import { PlumbLabel, PressureSeal } from './PlumbLabel';

const AMBER = '#f59e0b';
const WIDTH: Record<PipeSystem, number> = { cold: 3.2, hot: 3.2, sewer: 4.4, vent: 2.2 };

const ring = (c: V2, r: number, n = 24): [number, number, number][] => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos((i / n) * Math.PI * 2), c[1] + r * Math.sin((i / n) * Math.PI * 2), 0]);
const square = (c: V2, s: number): [number, number, number][] => {
  const h = s / 2;
  return [[c[0] - h, c[1] - h, 0], [c[0] + h, c[1] - h, 0], [c[0] + h, c[1] + h, 0], [c[0] - h, c[1] + h, 0], [c[0] - h, c[1] - h, 0]];
};
const lift = (pts: [number, number, number][], z: number): [number, number, number][] => pts.map(([x, y]) => [x, y, z]);

/**
 * Camada Hidráulica na planta: tubos por sistema (cores do catálogo), DN, setas e declividade no esgoto, prumadas,
 * caixas (sifonada, gordura, inspeção), pontos de água com selo de pressão e a caixa d'água. Desenhada a partir do
 * traçado efetivo (`report.plumbing.layout`; o manual vem do projeto, sem esperar o motor).
 */
export function PlumbPlanLayer({ level, z }: { level: string; z: number }) {
  const on = usePlumb((s) => s.layer);
  const systems = usePlumb((s) => s.systems);
  const sel = usePlumb((s) => s.sel);
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const report = plumbingReportOf(project, results);
  const layout = useMemo(() => liveLayout(project, report), [project, report]);
  const k = getCatalog().constants.plumbing;
  const colors = (k.colors ?? FALLBACK_COLORS) as Record<PipeSystem, string>;
  const info = useMemo(() => (report ? pipeInfo(report) : new Map()), [report]);
  const rows = useMemo(() => (report ? pressureRows(report, project, k) : []), [report, project, k]);
  const seals = useMemo(() => sealRows(rows), [rows]);
  const critical = useMemo(() => (report && sel?.kind === 'point' ? criticalPath(report, sel.id) : new Set<string>()), [report, sel]);
  const sewer = useMemo(() => (layout ? inferSewer(layout, project, k) : null), [layout, project, k]);
  const zl = z + 0.02;

  const pipes = useMemo(() => (layout ? layout.pipes.filter((p) => p.level === level && systems[p.system]) : []), [layout, level, systems]);
  const bodies = useMemo(() => {
    const by: Record<PipeSystem, [number, number, number][]> = { cold: [], hot: [], sewer: [], vent: [] };
    for (const p of pipes) {
      const path = p.path as V3[];
      if (isVertical(path)) continue;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i]!;
        const b = path[i + 1]!;
        if (dist2(a, b) < 1e-4) continue;
        by[p.system].push([a[0], a[1], zl], [b[0], b[1], zl]);
      }
    }
    return by;
  }, [pipes, zl]);

  const placedSeals = useMemo(() => {
    if (!layout) return [];
    const pts = layout.points.filter((p) => p.level === level && seals.has(p.id)).sort((a, b) => b.position[1] - a.position[1] || a.position[0] - b.position[0]);
    return pts.map((p, i) => {
      const near = pts.slice(0, i).filter((q) => dist2(q.position, p.position) < 1.6).length;
      return { p, row: seals.get(p.id)!, dy: -22 + near * 40 };
    });
  }, [layout, level, seals]);

  if (!on || !layout) return null;
  const t = layout.tank;
  const side = tankSide(t.liters);
  const sameLevel = t.level === level;
  const selPipe = sel?.kind === 'pipe' ? layout.pipes.find((p) => p.id === sel.id && p.level === level) : undefined;
  const selPoint = sel?.kind === 'point' ? layout.points.find((p) => p.id === sel.id && p.level === level) : undefined;
  const devices = (sewer?.devices ?? []).filter((d) => d.level === level && systems.sewer);

  return (
    <group name="plumb-plan-layer">
      {/* caminho crítico do ponto selecionado, por baixo */}
      {pipes
        .filter((p) => critical.has(p.id) && !isVertical(p.path as V3[]))
        .map((p) => (
          <Line key={`crit-${p.id}`} points={(p.path as V3[]).map(([x, y]) => [x, y, zl - 0.003] as [number, number, number])} color={AMBER} lineWidth={WIDTH[p.system] + 5} transparent opacity={0.55} depthTest={false} renderOrder={20} />
        ))}
      {(Object.keys(bodies) as PipeSystem[]).map((s) =>
        bodies[s].length > 0 ? (
          <Line key={s} points={bodies[s]} segments color={colors[s] ?? FALLBACK_COLORS[s]} lineWidth={WIDTH[s]} depthTest={false} renderOrder={22} {...(s === 'vent' ? { dashed: true, dashSize: 0.14, gapSize: 0.07 } : {})} />
        ) : null,
      )}

      {/* esgoto: setas de escoamento */}
      {systems.sewer
        ? pipes
            .filter((p) => p.system === 'sewer' && !isVertical(p.path as V3[]))
            .flatMap((p) => {
              const fwd = sewer?.flowForward.get(p.id) ?? (p.path[0]![2] >= p.path[p.path.length - 1]![2]);
              return flowArrows(p.path as V3[], fwd).map((a, i) => {
                const n: V2 = [-a.dir[1], a.dir[0]];
                const tip: [number, number, number] = [a.at[0] + a.dir[0] * 0.1, a.at[1] + a.dir[1] * 0.1, zl + 0.004];
                return (
                  <Line
                    key={`arr-${p.id}-${i}`}
                    points={[[a.at[0] - a.dir[0] * 0.1 + n[0] * 0.08, a.at[1] - a.dir[1] * 0.1 + n[1] * 0.08, zl + 0.004], tip, [a.at[0] - a.dir[0] * 0.1 - n[0] * 0.08, a.at[1] - a.dir[1] * 0.1 - n[1] * 0.08, zl + 0.004]]}
                    color="#f5efe9"
                    lineWidth={2}
                    depthTest={false}
                    renderOrder={23}
                  />
                );
              });
            })
        : null}

      {/* DN (e declividade) junto ao tubo; prumadas viram círculo */}
      {pipes.map((p) => {
        const path = p.path as V3[];
        const color = colors[p.system] ?? FALLBACK_COLORS[p.system];
        if (isVertical(path)) {
          const c: V2 = [path[0]![0], path[0]![1]];
          const tag = pipeTag(p, info.get(p.id));
          return (
            <group key={`v-${p.id}`}>
              <Line points={lift(ring(c, 0.08), zl + 0.01)} color={color} lineWidth={2.4} depthTest={false} renderOrder={24} />
              <PlumbLabel position={[c[0], c[1], zl + 0.01]} color={color} dx={0} dy={p.system === 'vent' ? 14 : -15}>
                {stackTag(p)}
                {tag ? ` ${tag.split(' · ')[0]}` : ''}
              </PlumbLabel>
            </group>
          );
        }
        const seg = longestSegment(path);
        const tag = pipeTag(p, info.get(p.id));
        if (!seg || !tag || seg.length < 0.55) return null;
        const a = path[seg.index]!;
        const b = path[seg.index + 1]!;
        return (
          <PlumbLabel key={`l-${p.id}`} position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zl + 0.01]} color={color} dy={p.system === 'sewer' ? -11 : 0}>
            {tag}
          </PlumbLabel>
        );
      })}

      {/* caixas do esgoto */}
      {devices.map((d) => (
        <group key={`${d.kind}-${d.label}`}>
          <Line points={lift(square(d.xy, d.kind === 'ci' ? 0.3 : 0.2), zl + 0.012)} color={colors.sewer} lineWidth={2.2} depthTest={false} renderOrder={24} />
          <PlumbLabel position={[d.xy[0], d.xy[1], zl + 0.012]} color={colors.sewer} solid dy={d.kind === 'ci' ? 18 : -16}>
            {d.label}
          </PlumbLabel>
        </group>
      ))}

      {/* pontos de água */}
      {layout.points
        .filter((p) => p.level === level)
        .map((p) => {
          const spec = k.water.fixtures[p.fixture];
          const hot = (spec?.wHot ?? 0) > 0;
          return (
            <group key={p.id}>
              <Line points={lift(ring([p.position[0], p.position[1]], 0.1), zl + 0.014)} color={colors.cold} lineWidth={2.2} depthTest={false} renderOrder={25} />
              <mesh position={[p.position[0], p.position[1], zl + 0.015]} renderOrder={25}>
                <circleGeometry args={[0.058, 16]} />
                <meshBasicMaterial color={hot ? colors.hot : colors.cold} depthTest={false} toneMapped={false} />
              </mesh>
            </group>
          );
        })}

      {/* caixa d'água */}
      <group>
        <Line points={lift(square([t.position[0], t.position[1]], side), zl + 0.016)} color={colors.cold} lineWidth={sameLevel ? 3 : 1.6} depthTest={false} renderOrder={25} {...(sameLevel ? {} : { dashed: true, dashSize: 0.12, gapSize: 0.08 })} />
        {sameLevel ? (
          <PlumbLabel position={[t.position[0], t.position[1], zl + 0.016]} color={colors.cold} solid>
            {`CX ${t.liters.toLocaleString('pt-BR')} L · fundo ${fmtM(t.bottomZ)} m`}
          </PlumbLabel>
        ) : null}
      </group>

      {/* seleção: tubo com vértices, ponto, caixa */}
      {selPipe ? (
        <>
          <Line points={(selPipe.path as V3[]).map(([x, y]) => [x, y, zl + 0.02] as [number, number, number])} color={AMBER} lineWidth={WIDTH[selPipe.system] + 2.5} transparent opacity={0.8} depthTest={false} renderOrder={26} />
          {(selPipe.path as V3[]).map((v, i) => (
            <mesh key={i} position={[v[0], v[1], zl + 0.03]} renderOrder={30}>
              <planeGeometry args={[0.1, 0.1]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
            </mesh>
          ))}
          {(selPipe.path as V3[]).map((v, i) => (
            <Line key={`h${i}`} points={lift(square([v[0], v[1]], 0.1), zl + 0.031)} color={AMBER} lineWidth={2} depthTest={false} renderOrder={31} />
          ))}
        </>
      ) : null}
      {selPoint ? <Line points={lift(ring([selPoint.position[0], selPoint.position[1]], 0.17), zl + 0.03)} color={AMBER} lineWidth={3} depthTest={false} renderOrder={31} /> : null}
      {sel?.kind === 'tank' ? <Line points={lift(square([t.position[0], t.position[1]], side + 0.14), zl + 0.03)} color={AMBER} lineWidth={3} depthTest={false} renderOrder={31} /> : null}

      {/* selos de pressão */}
      {placedSeals.map(({ p, row, dy }) => (
        <PressureSeal key={p.id} position={[p.position[0], p.position[1], zl + 0.05]} pointId={p.id} ok={row.ok} value={sealText(row)} name={row.label} missing={sealMissing(row)} dx={82} dy={dy} />
      ))}
    </group>
  );
}
