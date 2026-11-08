'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { fmt } from '@/lib/project/format';
import { newId } from '@/lib/project/ids';
import { type V2 } from '@/lib/tools/geom';
import { rectCorner } from '@/lib/tools/measureInput';
import type { PlanSnapResult } from '@/lib/tools/planSnap';
import { MIN_RECT_SIDE, rectCorners, rectWalls } from '@/lib/tools/walls';
import { MotorGroup } from '../MotorGroup';
import { useEditor } from '@/lib/store/editor';
import { ElasticWall, SnapGuides, SnapMarker } from './markers';
import { CursorReadout } from './DrawVisuals';
import { planSegments, resolvePlan, type ToolEnv } from './env';
import { useDrawKeys } from './drawKeys';
import { useHint } from './hooks';
import { usePlanePointer } from './pointer';
import { UseMenu } from './RoomTool';
import { pickUse, useMenuEscape } from './WallTool';

/** Segundo canto; com Shift vira quadrado (lado = maior eixo). */
function opposite(a: V2, p: V2, square: boolean): V2 {
  if (!square) return p;
  const dx = p[0] - a[0];
  const dy = p[1] - a[1];
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + (dx < 0 ? -s : s), a[1] + (dy < 0 ? -s : s)];
}

/**
 * Cômodo retangular: dois cliques (ou um clique + `3x4` + Enter) criam as 4 paredes internas, ligadas às existentes,
 * sem duplicar trechos que já têm parede. Em seguida pergunta o uso do cômodo.
 */
export function RectTool({ env }: { env: ToolEnv }) {
  const [a, setA] = useState<V2 | null>(null);
  const aRef = useRef<V2 | null>(null);
  aRef.current = a;
  const [cur, setCur] = useState<{ snap: PlanSnapResult; raw: V2; mpp: number } | null>(null);
  const curRef = useRef(cur);
  curRef.current = cur;
  const [menu, setMenu] = useState<V2 | null>(null);
  const menuRef = useRef<V2 | null>(null);
  menuRef.current = menu;
  const z = env.elevation;

  const create = (p: V2, q: V2) => {
    const existing = planSegments(env);
    const news = rectWalls(existing, p, q);
    const corners = rectCorners(p, q);
    if (Math.abs(p[0] - q[0]) < MIN_RECT_SIDE || Math.abs(p[1] - q[1]) < MIN_RECT_SIDE) {
      toast.info('O retângulo precisa ter pelo menos 30 cm de cada lado.');
      return false;
    }
    if (news.length > 0) {
      const wet = useEditor.getState().toolOptions.wallWet;
      useEditor.getState().update('Desenhar retângulo', (d) => {
        for (const w of news) d.walls.push({ id: newId('w'), level: env.levelId, from: w.from, to: w.to, ...(wet ? { wet: true } : {}) });
      });
    } else toast.info('Esse retângulo já está cercado por paredes.');
    setA(null);
    setCur(null);
    setMenu([round3((corners[0]![0] + corners[2]![0]) / 2), round3((corners[0]![1] + corners[2]![1]) / 2)]);
    return true;
  };

  const { typed, invalid } = useDrawKeys({
    enabled: !!a && !menu,
    onCommit: (m) => {
      const p = aRef.current;
      if (!p) return;
      const w = m.kind === 'size' ? m.width : m.length;
      const h = m.kind === 'size' ? m.height : m.length;
      create(p, rectCorner(p, w, h, curRef.current?.raw ?? null));
    },
    onEscape: () => {
      if (!aRef.current) return false;
      setA(null);
      return true;
    },
  });
  useMenuEscape(menu, () => setMenu(null));

  const resolveCorner = (raw: V2, o: { alt: boolean; shift: boolean; mpp: number }): PlanSnapResult => {
    const anchor = aRef.current;
    // Shift = quadrado (não ângulo de 15°): o snap roda sem travar o ângulo e depois quadramos.
    const s = resolvePlan(env, raw, { alt: o.alt, shift: false, mpp: o.mpp, anchor });
    return anchor && o.shift ? { ...s, point: opposite(anchor, s.point, true) } : s;
  };

  usePlanePointer(
    {
      onMove: (e) => setCur({ snap: resolveCorner(e.p, e), raw: e.p, mpp: e.mpp }),
      onClick: (e) => {
        if (menuRef.current) {
          setMenu(null);
          return;
        }
        const s = resolveCorner(e.p, e);
        const p = aRef.current;
        if (!p) {
          setA(s.point);
          return;
        }
        create(p, s.point);
      },
      // Sem onLeave: ver WallTool (o rótulo HTML sob o cursor dispara pointerleave).
    },
    { enabled: true, z },
  );

  useHint(
    menu
      ? 'Escolha o uso do cômodo · Esc cancela'
      : typed
        ? 'Enter confirma (ex.: 3x4 ou só 3 para quadrado) · Esc limpa'
        : a
          ? 'Clique no canto oposto ou digite 3x4 e Enter · Shift quadrado · Alt sem snap · Esc cancela'
          : 'Clique no primeiro canto do cômodo · Alt desliga o snap',
  );

  const end = cur?.snap.point ?? null;
  const box = a && end ? rectCorners(a, end) : null;
  const w = a && end ? Math.abs(end[0] - a[0]) : 0;
  const h = a && end ? Math.abs(end[1] - a[1]) : 0;
  return (
    <MotorGroup>
      {cur ? <SnapGuides guides={cur.snap.guides} z={z} /> : null}
      {cur ? <SnapMarker point={cur.snap.point} kind={cur.snap.kind} z={z} mpp={cur.mpp} /> : null}
      {box && w > 0.001 && h > 0.001
        ? box.map((c, i) => <ElasticWall key={i} a={c} b={box[(i + 1) % 4]!} z={z} thickness={0.11} />)
        : null}
      {a ? <SnapMarker point={a} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} /> : null}
      {a && end ? <CursorReadout at={end} z={z} mpp={cur?.mpp ?? 0.01} typed={typed} invalid={invalid} live={`${fmt(w)} × ${fmt(h)} m`} extra={`${fmt(w * h)} m²`} /> : null}
      {menu ? <UseMenu p={menu} z={z} onPick={(use) => pickUse(env, menu, use, () => setMenu(null))} onClose={() => setMenu(null)} /> : null}
    </MotorGroup>
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
