/**
 * Operações de edição do traçado hidráulico sobre um rascunho do projeto (receitas para `update`: cada uma é um passo
 * de desfazer). Na primeira edição o traçado efetivo é copiado para o projeto com `manual: true`.
 */
import type { Pipe, PipeSystem, PlumbingLayout, PlumbingReport, Project, WaterPoint } from '@chalecad/engine';
import { CONNECTS_TO, dist2, levelElevation, TOL, type V2, type V3 } from './geometry';
import { splitPipe } from './snap';
import { buildPipePath, type DrawVertex, type PlumbEnv } from './zdefaults';

export const MANUAL_NOTE = 'Traçado copiado para o projeto e agora é seu. Para o motor voltar a gerar, use "Gerar automaticamente".';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Copia o traçado efetivo (`report.plumbing.layout`) para o projeto e liga `manual`. Devolve true se copiou agora. */
export function ensureManual(draft: Project, layout: PlumbingLayout): boolean {
  const pl = draft.installations.plumbing;
  if (pl.manual) return false;
  pl.manual = true;
  pl.points = clone(layout.points);
  pl.pipes = clone(layout.pipes);
  const liters = pl.tank?.liters;
  pl.tank = { level: layout.tank.level, position: [layout.tank.position[0], layout.tank.position[1]], bottomZ: layout.tank.bottomZ, ...(liters !== undefined ? { liters } : {}) };
  return true;
}

/** Volta ao traçado gerado pelo motor. A posição e a cota da caixa que o usuário definiu continuam valendo. */
export function backToAuto(draft: Project): void {
  const pl = draft.installations.plumbing;
  pl.manual = false;
  pl.points = [];
  pl.pipes = [];
}

/** Procura o trecho (de tubo compatível, do nível) que passa por `at` e devolve [pipeId, índice do trecho]. */
function findSegment(pipes: Pipe[], level: string, compat: PipeSystem[], at: V3): { id: string; seg: number } | null {
  for (const p of pipes) {
    if (p.level !== level || !compat.includes(p.system)) continue;
    const path = p.path as V3[];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const l2 = dx * dx + dy * dy + dz * dz;
      if (l2 < 1e-12) continue;
      const t = Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy + (at[2] - a[2]) * dz) / l2));
      if (Math.hypot(a[0] + dx * t - at[0], a[1] + dy * t - at[1], a[2] + dz * t - at[2]) <= TOL) return { id: p.id, seg: i };
    }
  }
  return null;
}

export interface AddPipeInput {
  system: PipeSystem;
  verts: DrawVertex[];
  env: PlumbEnv;
  newId: () => string;
  dn?: number;
  slope?: number;
}

/** Desenha um tubo: monta as cotas, divide os tubos tocados no meio e grava. Devolve o id, ou null se ficou curto demais. */
export function addPipe(draft: Project, input: AddPipeInput): string | null {
  const { system, verts, env, newId } = input;
  const path = buildPipePath(system, verts, env, { ...(input.dn !== undefined ? { dn: input.dn } : {}), ...(input.slope !== undefined ? { slope: input.slope } : {}) });
  const minVerts = system === 'vent' ? 2 : 2;
  if (path.length < minVerts) return null;
  ensureManual(draft, env.layout);
  const pipes = draft.installations.plumbing.pipes;
  const compat = CONNECTS_TO[system];
  const level = env.levelId;
  // divide os tubos que as pontas e vértices tocam no meio do trecho
  for (const v of verts) {
    if (v.snap?.kind !== 'segment' || v.snap.z === undefined) continue;
    const at: V3 = [v.snap.xy[0], v.snap.xy[1], v.snap.z];
    const hit = findSegment(pipes, level, compat, at);
    if (hit) splitPipe(pipes, hit.id, hit.seg, at, newId());
  }
  const id = newId();
  const pipe: Pipe = { id, system, level, path };
  if (input.dn !== undefined) pipe.dn = input.dn;
  if (input.slope !== undefined) pipe.slope = input.slope;
  pipes.push(pipe);
  return id;
}

/** Ponto de água novo no nível. */
export function addPoint(draft: Project, layout: PlumbingLayout, p: { id: string; fixture: string; level: string; xy: V2; label?: string }): void {
  ensureManual(draft, layout);
  const pt: WaterPoint = { id: p.id, fixture: p.fixture, level: p.level, position: [p.xy[0], p.xy[1]], ...(p.label ? { label: p.label } : {}) };
  draft.installations.plumbing.points.push(pt);
}

/** Move os vértices de tubo que estão sobre `from` (em planta) para `to`; `levelId` limita aos tubos do nível. */
export function moveNode(pipes: Pipe[], from: V2, to: V2, levelId?: string): void {
  for (const p of pipes) {
    if (levelId !== undefined && p.level !== levelId) continue;
    for (const v of p.path) {
      if (dist2(v, from) <= TOL) {
        v[0] = to[0];
        v[1] = to[1];
      }
    }
  }
}

export function movePoint(draft: Project, layout: PlumbingLayout, pointId: string, to: V2): void {
  ensureManual(draft, layout);
  const pl = draft.installations.plumbing;
  const pt = pl.points.find((p) => p.id === pointId);
  if (!pt) return;
  const from: V2 = [pt.position[0], pt.position[1]];
  moveNode(pl.pipes, from, to, pt.level);
  pt.position = [to[0], to[1]];
}

/** Move (e muda de nível) a caixa. A cota do fundo (absoluta) é mantida. Com traçado manual os tubos ligados acompanham. */
export function moveTank(draft: Project, layout: PlumbingLayout, level: string, to: V2): void {
  const pl = draft.installations.plumbing;
  const liters = pl.tank?.liters;
  if (pl.manual) moveNode(pl.pipes, [layout.tank.position[0], layout.tank.position[1]], to);
  pl.tank = { level, position: [to[0], to[1]], bottomZ: pl.tank?.bottomZ ?? layout.tank.bottomZ, ...(liters !== undefined ? { liters } : {}) };
}

/** Cota do fundo da caixa (m, absoluta). */
export function setTankBottom(draft: Project, layout: PlumbingLayout, bottomZ: number): void {
  const pl = draft.installations.plumbing;
  const liters = pl.tank?.liters;
  pl.tank = {
    level: pl.tank?.level ?? layout.tank.level,
    position: pl.tank?.position ?? [layout.tank.position[0], layout.tank.position[1]],
    bottomZ: Math.min(30, Math.max(0, Math.round(bottomZ * 1000) / 1000)),
    ...(liters !== undefined ? { liters } : {}),
  };
}

/** Quanto subir a caixa para todos os pontos atenderem: o maior `requiredTankRise`, arredondado para cima em 1 cm. */
export function requiredRise(report: Pick<PlumbingReport, 'water'>): number {
  const max = report.water.points.reduce((m, p) => Math.max(m, p.ok ? 0 : p.requiredTankRise), 0);
  return max > 0 ? Math.ceil(max * 100 - 1e-9) / 100 : 0;
}

/** "Subir até atender": aplica o maior `requiredTankRise`. Devolve quanto subiu (0 = nada a fazer). */
export function raiseTankToMeet(draft: Project, report: PlumbingReport): number {
  const rise = requiredRise(report);
  if (rise > 0) setTankBottom(draft, report.layout, report.layout.tank.bottomZ + rise);
  return rise;
}

export function deletePipe(draft: Project, layout: PlumbingLayout, id: string): void {
  ensureManual(draft, layout);
  const pl = draft.installations.plumbing;
  pl.pipes = pl.pipes.filter((p) => p.id !== id);
}

export function deletePoint(draft: Project, layout: PlumbingLayout, id: string): void {
  ensureManual(draft, layout);
  const pl = draft.installations.plumbing;
  pl.points = pl.points.filter((p) => p.id !== id);
}

export interface PipePatch {
  system?: PipeSystem;
  /** `null` = automático. */
  dn?: number | null;
  slope?: number | null;
}

export function patchPipe(draft: Project, layout: PlumbingLayout, id: string, patch: PipePatch): void {
  ensureManual(draft, layout);
  const p = draft.installations.plumbing.pipes.find((x) => x.id === id);
  if (!p) return;
  if (patch.system) p.system = patch.system;
  if (patch.dn !== undefined) {
    if (patch.dn === null) delete p.dn;
    else p.dn = patch.dn;
  }
  if (patch.slope !== undefined) {
    if (patch.slope === null) delete p.slope;
    else p.slope = patch.slope;
  }
  if (p.system !== 'sewer') delete p.slope;
}

/** Cota (m do piso) do trecho horizontal mais longo do tubo, ou null se nenhum trecho é horizontal (esgoto inclinado, prumada). */
export function horizontalRunZ(path: readonly (readonly number[])[]): number | null {
  let best: { z: number; len: number } | null = null;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
    if (len > 1e-3 && Math.abs(a[2]! - b[2]!) < 1e-6 && (!best || len > best.len)) best = { z: a[2]!, len };
  }
  return best ? best.z : null;
}

/**
 * Muda a cota do trecho horizontal do tubo (m do piso do nível): os vértices na mesma cota sobem ou descem juntos (as
 * pernas verticais se ajustam) e as pontas de outros tubos coladas neles acompanham. `false` se o tubo não tem trecho horizontal.
 */
export function setPipeZ(draft: Project, layout: PlumbingLayout, id: string, z: number): boolean {
  const pl0 = draft.installations.plumbing;
  const src = (pl0.manual ? pl0.pipes : layout.pipes).find((x) => x.id === id);
  const z0 = src ? horizontalRunZ(src.path) : null;
  if (!src || z0 === null) return false;
  ensureManual(draft, layout);
  const pl = draft.installations.plumbing;
  const p = pl.pipes.find((x) => x.id === id)!;
  const elev = levelElevation(draft, p.level);
  const moved: V3[] = [];
  for (const v of p.path) {
    if (Math.abs(v[2] - z0) < 1e-6) {
      moved.push([v[0], v[1], v[2]]);
      v[2] = z;
    }
  }
  // pontas de outros tubos que estavam coladas nos vértices antigos acompanham (3D)
  for (const q of pl.pipes) {
    if (q.id === id) continue;
    const qe = levelElevation(draft, q.level);
    for (const v of q.path) {
      if (moved.some((o) => Math.hypot(v[0] - o[0], v[1] - o[1], v[2] + qe - (o[2] + elev)) <= TOL)) v[2] = z + elev - qe;
    }
  }
  return true;
}

/** "Rotear automaticamente": troca os tubos dos sistemas pelos do traçado gerado pelo motor. */
export function autoRoute(draft: Project, layout: PlumbingLayout, auto: PlumbingLayout, systems: PipeSystem[]): number {
  ensureManual(draft, layout);
  const pl = draft.installations.plumbing;
  const fresh = clone(auto.pipes.filter((p) => systems.includes(p.system)));
  pl.pipes = [...pl.pipes.filter((p) => !systems.includes(p.system)), ...fresh];
  return fresh.length;
}

/** Move um vértice do tubo (e os vértices de outros tubos colados nele). */
export function moveVertex(draft: Project, layout: PlumbingLayout, pipeId: string, index: number, to: V2): void {
  ensureManual(draft, layout);
  const pl = draft.installations.plumbing;
  const p = pl.pipes.find((x) => x.id === pipeId);
  const v = p?.path[index];
  if (!p || !v) return;
  moveNode(pl.pipes, [v[0], v[1]], to, p.level);
}

/** Troca o aparelho (e o rótulo) de um ponto de água. */
export function patchPoint(draft: Project, layout: PlumbingLayout, id: string, patch: { fixture?: string; label?: string | null }): void {
  ensureManual(draft, layout);
  const pt = draft.installations.plumbing.points.find((p) => p.id === id);
  if (!pt) return;
  if (patch.fixture) pt.fixture = patch.fixture;
  if (patch.label === null) delete pt.label;
  else if (patch.label !== undefined) pt.label = patch.label;
}
