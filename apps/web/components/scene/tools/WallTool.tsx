'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { RoomUse } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { newId } from '@/lib/project/ids';
import { addRoom } from '@/lib/project/rooms';
import { dist, round, type V2 } from '@/lib/tools/geom';
import { pointAtLength } from '@/lib/tools/measureInput';
import type { PlanSnapResult } from '@/lib/tools/planSnap';
import { interiorPoint, nearestParallel } from '@/lib/tools/walls';
import { MotorGroup } from '../MotorGroup';
import { CloseMarker, ElasticWall, SnapGuides, SnapMarker } from './markers';
import { CursorReadout, liveText, ParallelDim } from './DrawVisuals';
import { planSegments, resolvePlan, SNAP_PX, type ToolEnv } from './env';
import { useDrawKeys } from './drawKeys';
import { useHint } from './hooks';
import { usePlanePointer } from './pointer';
import { UseMenu } from './RoomTool';

const MIN_LEN = 0.1;

/**
 * Parede interna. Clique define o início; cliques seguintes encadeiam. Digite a medida (3,5 | 3,5;90) + Enter.
 * Shift = ângulos de 15°, Alt = sem snap. Clicar no ponto inicial fecha o contorno (e pergunta o uso do cômodo).
 * Esc ou duplo clique encerra.
 */
export function WallTool({ env }: { env: ToolEnv }) {
  const [pts, setPts] = useState<V2[]>([]);
  const ptsRef = useRef<V2[]>([]);
  ptsRef.current = pts;
  const start = pts[pts.length - 1] ?? null;
  const [cur, setCur] = useState<{ snap: PlanSnapResult; raw: V2; mpp: number; closing: boolean } | null>(null);
  const curRef = useRef(cur);
  curRef.current = cur;
  const [menu, setMenu] = useState<V2 | null>(null);
  const menuRef = useRef<V2 | null>(null);
  menuRef.current = menu;
  const z = env.elevation;

  const closingAt = (p: V2, mpp: number): boolean => {
    const first = ptsRef.current[0];
    return !!first && ptsRef.current.length >= 3 && dist(first, p) < SNAP_PX * mpp;
  };

  const resolve = (raw: V2, o: { alt: boolean; shift: boolean; mpp: number }) => {
    const anchor = ptsRef.current[ptsRef.current.length - 1] ?? null;
    const closing = closingAt(raw, o.mpp);
    const first = ptsRef.current[0];
    const snap: PlanSnapResult = closing && first ? { point: first, kind: 'endpoint', guides: [] } : resolvePlan(env, raw, { ...o, anchor });
    return { snap, closing };
  };

  /** Cria a parede a->b (ignora trecho curto ou parede idêntica já existente). */
  const addWall = (a: V2, b: V2): boolean => {
    if (dist(a, b) < MIN_LEN) return false;
    const from: V2 = [round(a[0], 3), round(a[1], 3)];
    const to: V2 = [round(b[0], 3), round(b[1], 3)];
    const dup = planSegments(env).some((s) => (dist(s.from, from) < 0.02 && dist(s.to, to) < 0.02) || (dist(s.from, to) < 0.02 && dist(s.to, from) < 0.02));
    if (dup) return true;
    const wet = useEditor.getState().toolOptions.wallWet;
    useEditor.getState().update('Desenhar parede', (d) => {
      d.walls.push({ id: newId('w'), level: env.levelId, from, to, ...(wet ? { wet: true } : {}) });
    });
    return true;
  };

  const closeLoop = (poly: V2[]) => {
    setPts([]);
    setCur(null);
    setMenu(interiorPoint(poly));
  };

  const { typed, invalid } = useDrawKeys({
    enabled: !!start && !menu,
    onCommit: (m) => {
      const a = ptsRef.current[ptsRef.current.length - 1];
      if (!a) return;
      if (m.kind === 'size') {
        toast.info('Digite só o comprimento (ex.: 3,5 ou 3,5;90). Para 3x4 use a ferramenta Retângulo (R).');
        return;
      }
      const toward = curRef.current?.snap.point ?? curRef.current?.raw ?? null;
      const b = pointAtLength(a, m.length, { angleDeg: m.angleDeg, toward });
      if (addWall(a, b)) setPts([...ptsRef.current, b]);
    },
    onEscape: () => {
      if (menuRef.current) {
        setMenu(null);
        return true;
      }
      if (ptsRef.current.length === 0) return false;
      setPts([]);
      return true;
    },
    onEnter: () => {
      if (ptsRef.current.length === 0) return false;
      setPts([]);
      return true;
    },
  });
  // Esc com o menu de uso aberto (a sessão de teclas só vale com o desenho ativo)
  useMenuEscape(menu, () => setMenu(null));

  usePlanePointer(
    {
      onMove: (e) => {
        const r = resolve(e.p, e);
        setCur({ snap: r.snap, raw: e.p, mpp: e.mpp, closing: r.closing });
      },
      onClick: (e) => {
        if (menuRef.current) {
          setMenu(null);
          return;
        }
        const r = resolve(e.p, e);
        const p = ptsRef.current;
        const a = p[p.length - 1];
        if (!a) {
          setPts([r.snap.point]);
          return;
        }
        if (r.closing) {
          if (addWall(a, r.snap.point)) closeLoop(p);
          return;
        }
        if (addWall(a, r.snap.point)) setPts([...p, r.snap.point]);
      },
      onDoubleClick: () => setPts([]),
      // Sem onLeave de propósito: o rótulo de medida (HTML) sob o cursor dispara pointerleave no canvas e apagaria a leitura
      // enquanto o usuário digita com o mouse parado. A última posição fica até o próximo movimento.
    },
    { enabled: true, z },
  );

  useHint(
    menu
      ? 'Escolha o uso do cômodo · Esc cancela'
      : typed
        ? 'Enter confirma a medida · Esc limpa · Backspace apaga'
        : start
          ? pts.length >= 3
            ? 'Digite a medida e Enter · Clique no início para fechar · Shift 15° · Alt sem snap · Esc encerra'
            : 'Digite a medida e Enter (3,5 ou 3,5;90) · Clique para a próxima parede · Shift 15° · Esc encerra'
          : 'Clique para iniciar a parede · Alt desliga o snap',
  );

  const end = cur?.snap.point ?? null;
  const len = start && end ? dist(start, end) : 0;
  const gap = start && end && len > 0.2 ? nearestParallel(start, end, planSegments(env).filter((s) => !(dist(s.from, start) < 0.02 || dist(s.to, start) < 0.02))) : null;
  return (
    <MotorGroup>
      {cur ? <SnapGuides guides={cur.snap.guides} z={z} /> : null}
      {cur && cur.closing ? <CloseMarker point={cur.snap.point} z={z} mpp={cur.mpp} /> : cur ? <SnapMarker point={cur.snap.point} kind={cur.snap.kind} z={z} mpp={cur.mpp} /> : null}
      {start && end && len > 0.001 ? (
        <>
          <ElasticWall a={start} b={end} z={z} thickness={0.11} />
          <ParallelDim gap={gap} z={z} />
        </>
      ) : null}
      {pts.slice(0, -1).map((p, i) => (
        <SnapMarker key={i} point={p} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} />
      ))}
      {start ? <SnapMarker point={start} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} /> : null}
      {start && end ? <CursorReadout at={end} z={z} mpp={cur?.mpp ?? 0.01} typed={typed} invalid={invalid} live={liveText(start, end)} extra={gap ? `a ${gap.distance.toFixed(2).replace('.', ',')} m da paralela` : undefined} /> : null}
      {menu ? <UseMenu p={menu} z={z} onPick={(use) => pickUse(env, menu, use, () => setMenu(null))} onClose={() => setMenu(null)} /> : null}
    </MotorGroup>
  );
}

/** Marca o cômodo no ponto interno do contorno recém-fechado. */
export function pickUse(env: ToolEnv, seed: V2, use: RoomUse, done: () => void) {
  const box: { id: string | null } = { id: null };
  useEditor.getState().update('Marcar cômodo', (d) => {
    box.id = addRoom(d, env.levelId, seed, use);
  });
  done();
  if (box.id) useEditor.getState().select({ kind: 'room', id: box.id });
}

/** Esc fecha o menu de uso (o campo de teclas só escuta com o desenho ativo). */
export function useMenuEscape(menu: V2 | null, close: () => void) {
  const c = useRef(close);
  c.current = close;
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      c.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu]);
}
