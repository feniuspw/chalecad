'use client';
import { useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { getCatalog } from '@chalecad/catalog';
import { toast } from 'sonner';
import { fmt } from '@/lib/project/format';
import { makePad, MAX_PADS } from '@/lib/project/terrain';
import { useEditor } from '@/lib/store/editor';
import { pointInPolygon, type V2 } from '@/lib/tools/geom';
import { SceneLabel } from '../../labels';
import { MotorGroup } from '../../MotorGroup';
import { useDrag, usePlanePointer } from '../pointer';
import { SnapMarker } from '../markers';
import type { ToolEnv } from '../env';
import { useHint, useKey } from '../hooks';
import {
  forecastEdges,
  hitVertex,
  levelFromDrag,
  padSnapTargets,
  polygonAreaAbs,
  polygonCentroid,
  rectToPolygon,
  snapPadPoint,
  translatePolygon,
  validatePadPolygon,
  type EdgeForecast,
  type PadSnapKind,
} from './padGeometry';
import { useTerrainUi } from './store';

const WALL_COLOR = '#ea580c';
const SLOPE_COLOR = '#16a34a';
const DRAFT_COLOR = '#d97706';
const HANDLE_PX = 10;

interface Live {
  id: string;
  polygon: V2[];
  level: number;
}

/**
 * "Aplainar área": desenha áreas niveladas (pads) no terreno inclinado. Retângulo (dois cliques) ou polígono (cliques,
 * Enter ou clique no primeiro ponto fecha). Com a ferramenta ativa também edita: arrasta vértices e a área inteira,
 * Shift + arrasto vertical muda o nível, Delete apaga. As bordas mostram ao vivo talude (verde) ou muro (laranja, com altura).
 */
export function TerrainPadTool({ env }: { env: ToolEnv }) {
  const site = env.project.site;
  const terrain = useEditor((s) => s.results?.terrain ?? null);
  const mode = useTerrainUi((s) => s.mode);
  const selectedId = useTerrainUi((s) => s.selectedPadId);
  const sloped = site.type === 'sloped' ? site : null;

  const [pts, setPts] = useState<V2[]>([]);
  const ptsRef = useRef<V2[]>([]);
  ptsRef.current = pts;
  const [cur, setCur] = useState<{ point: V2; kind: PadSnapKind; mpp: number } | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const drag = useDrag();
  const z = env.elevation;
  const rules = getCatalog().constants.terrainRules;
  const zp = terrain?.platformZ ?? 0;
  const center = useMemo<V2>(() => {
    const xs = env.model.footprint.map((p) => p[0]);
    const ys = env.model.footprint.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }, [env.model.footprint]);
  const targets = useMemo(() => padSnapTargets(env.project, env.model.footprint as V2[], terrain), [env.project, env.model.footprint, terrain]);
  const pads = sloped?.pads ?? [];
  const padsRef = useRef(pads);
  padsRef.current = pads;

  const snap = (raw: V2, e: { alt: boolean; mpp: number }) => snapPadPoint(raw, targets, Math.max(0.05, 12 * e.mpp), e.alt);

  const commit = (polygon: V2[]): boolean => {
    const check = validatePadPolygon(polygon);
    if (!check.ok) {
      toast.info(check.reason);
      return false;
    }
    if (padsRef.current.length >= MAX_PADS) {
      toast.info(`No máximo ${MAX_PADS} áreas aplainadas.`);
      return false;
    }
    const pad = makePad(polygon, padsRef.current);
    useEditor.getState().update('Aplainar área', (d) => {
      if (d.site.type === 'sloped') d.site.pads.push(pad);
    });
    useTerrainUi.getState().selectPad(pad.id);
    setPts([]);
    return true;
  };

  const patchPad = (id: string, label: string, fn: (p: NonNullable<typeof sloped>['pads'][number]) => void) =>
    useEditor.getState().update(label, (d) => {
      if (d.site.type !== 'sloped') return;
      const p = d.site.pads.find((x) => x.id === id);
      if (p) fn(p);
    });

  const startDrag = (e: { p: V2; shift: boolean; mpp: number; native: PointerEvent | MouseEvent; alt: boolean }): boolean => {
    const list = padsRef.current;
    const sel = list.find((p) => p.id === useTerrainUi.getState().selectedPadId);
    const native = e.native as PointerEvent;
    // 1) vértice da área selecionada
    if (sel) {
      const vi = hitVertex(sel.polygon as V2[], e.p, HANDLE_PX * e.mpp);
      if (vi >= 0) {
        const base = sel.polygon.map((p) => [p[0], p[1]] as V2);
        let last: V2[] = base;
        drag(native, {
          z,
          onMove: (m) => {
            const s = snap(m.p, m);
            last = base.map((p, i) => (i === vi ? s.point : p));
            setLive({ id: sel.id, polygon: last, level: sel.level });
          },
          onEnd: (moved) => {
            setLive(null);
            if (!moved) return;
            const ok = validatePadPolygon(last);
            if (!ok.ok) return void toast.info(ok.reason);
            patchPad(sel.id, 'Mover vértice da área aplainada', (p) => void (p.polygon = last.map((q) => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000])));
          },
        });
        return true;
      }
    }
    // 2) dentro de uma área: seleciona e arrasta (Shift = nível)
    for (let i = list.length - 1; i >= 0; i--) {
      const pad = list[i]!;
      if (!pointInPolygon(e.p, pad.polygon as V2[])) continue;
      useTerrainUi.getState().selectPad(pad.id);
      const base = pad.polygon.map((p) => [p[0], p[1]] as V2);
      const startY = native.clientY;
      const start = e.p;
      const shift = e.shift;
      let lastPoly: V2[] = base;
      let lastLevel = pad.level;
      drag(native, {
        z,
        onMove: (m) => {
          if (shift) {
            lastLevel = levelFromDrag(pad.level, m.native.clientY - startY, e.mpp);
            setLive({ id: pad.id, polygon: base, level: lastLevel });
          } else {
            const s = snapPadPoint(base[0] ? [base[0][0] + (m.p[0] - start[0]), base[0][1] + (m.p[1] - start[1])] : m.p, targets, 12 * m.mpp, m.alt);
            lastPoly = translatePolygon(base, s.point[0] - base[0]![0], s.point[1] - base[0]![1]);
            setLive({ id: pad.id, polygon: lastPoly, level: pad.level });
          }
        },
        onEnd: (moved) => {
          setLive(null);
          if (!moved) return;
          if (shift) patchPad(pad.id, 'Alterar nível da área aplainada', (p) => void (p.level = lastLevel));
          else patchPad(pad.id, 'Mover área aplainada', (p) => void (p.polygon = lastPoly.map((q) => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000])));
        },
      });
      return true;
    }
    return false;
  };

  usePlanePointer(
    {
      onMove: (e) => {
        const s = snap(e.p, e);
        setCur({ point: s.point, kind: s.kind, mpp: e.mpp });
      },
      onDown: (e) => {
        if (!sloped || ptsRef.current.length > 0) return false;
        return startDrag(e);
      },
      onClick: (e) => {
        if (!sloped) return;
        const s = snap(e.p, e);
        const p = ptsRef.current;
        if (mode === 'rect') {
          const a = p[0];
          if (!a) return void setPts([s.point]);
          if (Math.abs(s.point[0] - a[0]) < 0.5 || Math.abs(s.point[1] - a[1]) < 0.5) return void toast.info('Cada lado precisa ter pelo menos 50 cm.');
          commit(rectToPolygon(a, s.point));
          return;
        }
        const first = p[0];
        if (first && p.length >= 3 && Math.hypot(first[0] - e.p[0], first[1] - e.p[1]) < 12 * e.mpp) {
          commit(p);
          return;
        }
        const last = p[p.length - 1];
        if (last && Math.hypot(last[0] - s.point[0], last[1] - s.point[1]) < 0.05) return;
        if (p.length === 0) useTerrainUi.getState().selectPad(null);
        setPts([...p, s.point]);
      },
      onDoubleClick: () => {
        if (mode === 'poly' && ptsRef.current.length >= 3) commit(ptsRef.current);
      },
      onLeave: () => setCur(null),
    },
    { enabled: !!sloped, z },
  );

  useKey(['Escape'], () => {
    if (ptsRef.current.length > 0) {
      setPts([]);
      return true;
    }
    if (useTerrainUi.getState().selectedPadId) {
      useTerrainUi.getState().selectPad(null);
      return true;
    }
    return false;
  });
  useKey(['Enter'], () => {
    if (mode === 'poly' && ptsRef.current.length >= 3) return commit(ptsRef.current) || true;
    return false;
  });
  useKey(['Backspace', 'Delete'], (e) => {
    if (ptsRef.current.length > 0) {
      if (e.key === 'Backspace') setPts((p) => p.slice(0, -1));
      else setPts([]);
      return true;
    }
    const id = useTerrainUi.getState().selectedPadId;
    if (!id) return false;
    useEditor.getState().update('Apagar área aplainada', (d) => {
      if (d.site.type === 'sloped') d.site.pads = d.site.pads.filter((p) => p.id !== id);
    });
    useTerrainUi.getState().selectPad(null);
    return true;
  });
  useKey(['p'], () => {
    useTerrainUi.getState().setMode(mode === 'rect' ? 'poly' : 'rect');
    setPts([]);
    return true;
  });

  useHint(
    !sloped
      ? 'Aplainar área só funciona em terreno inclinado: mude o terreno para “Inclinado” na aba Terreno'
      : pts.length > 0
        ? mode === 'rect'
          ? 'Clique no canto oposto · Alt sem snap · Esc cancela'
          : 'Clique para adicionar pontos · Enter, duplo clique ou 1º ponto fecha · Backspace volta · Esc cancela'
        : `${mode === 'rect' ? 'Clique no 1º canto da área' : 'Clique para iniciar o contorno'} · P alterna retângulo/polígono · arraste vértices ou a área · Shift + arrasto vertical muda o nível · Delete apaga`,
  );

  if (!sloped) return null;

  // Previsão do que o motor vai fazer em cada borda (cor ao vivo).
  const forecast = (poly: V2[], level: number, edges: 'auto' | 'slope' | 'wall'): EdgeForecast[] =>
    forecastEdges(poly, zp + level, sloped, center, edges, { cutHeight: rules.retainingCutHeight, fillHeight: rules.retainingFillHeight });

  const draft: V2[] | null =
    pts.length > 0 && cur ? (mode === 'rect' ? rectToPolygon(pts[0]!, cur.point) : [...pts, cur.point]) : pts.length > 0 ? pts : null;

  return (
    <MotorGroup>
      {pads.map((pad) => {
        const lv = live && live.id === pad.id ? live : null;
        const poly = lv ? lv.polygon : (pad.polygon as V2[]);
        const level = lv ? lv.level : pad.level;
        const sel = pad.id === selectedId;
        const edges = forecast(poly, level, pad.edges);
        const zz = z + level;
        const c = polygonCentroid(poly);
        return (
          <group key={pad.id}>
            <EdgeLines edges={edges} z={zz} selected={sel} labels={sel} />
            <SceneLabel position={[c[0], c[1], zz + 0.08]} tone={sel ? 'live' : 'dim'}>
              {pad.name || 'Área'} · nível {fmt(level)} m · {fmt(polygonAreaAbs(poly), 1)} m²
            </SceneLabel>
            {sel ? poly.map((v, i) => <SnapMarker key={i} point={v} kind="endpoint" z={zz} mpp={cur?.mpp ?? 0.01} showLabel={false} />) : null}
          </group>
        );
      })}
      {draft && draft.length >= 2 ? (
        <>
          {draft.length >= 3 || mode === 'rect' ? <EdgeLines edges={forecast(draft, 0, 'auto')} z={z} selected labels /> : null}
          {draft.length < 3 && mode !== 'rect' ? <Line points={draft.map((p) => [p[0], p[1], z + 0.04] as [number, number, number])} color={DRAFT_COLOR} lineWidth={2.5} depthTest={false} renderOrder={990} /> : null}
          {draft.length >= 3 ? (
            <SceneLabel position={[polygonCentroid(draft)[0], polygonCentroid(draft)[1], z + 0.1]} tone="live">
              {fmt(polygonAreaAbs(draft), 1)} m² · nível 0,00 m
            </SceneLabel>
          ) : null}
        </>
      ) : null}
      {pts.map((p, i) => (
        <SnapMarker key={i} point={p} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} />
      ))}
      {cur ? <SnapMarker point={cur.point} kind={cur.kind} z={z} mpp={cur.mpp} /> : null}
    </MotorGroup>
  );
}

/** Contorno de uma área: cada aresta verde (talude) ou laranja (muro, com a altura prevista). */
function EdgeLines({ edges, z, selected, labels }: { edges: EdgeForecast[]; z: number; selected: boolean; labels: boolean }) {
  return (
    <>
      {edges.map((e, i) => (
        <group key={i}>
          <Line
            points={[[e.from[0], e.from[1], z + 0.04], [e.to[0], e.to[1], z + 0.04]]}
            color={e.kind === 'wall' ? WALL_COLOR : SLOPE_COLOR}
            lineWidth={selected ? 3 : 2}
            depthTest={false}
            renderOrder={989}
          />
          {labels ? (
            <SceneLabel position={[(e.from[0] + e.to[0]) / 2, (e.from[1] + e.to[1]) / 2, z + 0.06]} tone={e.kind === 'wall' ? 'bad' : 'ok'} offsetY={-12}>
              {fmt(Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]))} m · {e.kind === 'wall' ? `muro ${fmt(Math.abs(e.h))} m` : e.h > 0 ? 'talude de corte' : 'talude de aterro'}
            </SceneLabel>
          ) : null}
        </group>
      ))}
    </>
  );
}
