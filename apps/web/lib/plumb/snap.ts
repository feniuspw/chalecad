/** Snap do tubo em planta (puro): ponto de água, caixa, ponta de tubo e trecho de outro tubo (dividido no encontro). */
import type { Pipe, PipeSystem } from '@chalecad/engine';
import { CONNECTS_TO, dist2, levelElevation, TOL, type V2, type V3 } from './geometry';
import type { PipeSnap } from './snapTypes';
import type { PlumbEnv } from './zdefaults';

/** Aparelho do catálogo recebe tubo do sistema? (água: peso > 0; quente: peso quente > 0; esgoto: DN de esgoto). */
export function fixtureAccepts(k: PlumbEnv['k'], fixture: string, system: PipeSystem): boolean {
  const f = k.water.fixtures[fixture];
  if (!f) return false;
  if (system === 'cold') return f.w > 0;
  if (system === 'hot') return f.wHot > 0;
  if (system === 'sewer') return f.sewerDn !== undefined;
  return false;
}

function closestOnSeg(p: V2, a: V3, b: V3): { point: V2; t: number; d: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  const point: V2 = [a[0] + dx * t, a[1] + dy * t];
  return { point, t, d: dist2(p, point) };
}

/** Cota da ligação na caixa: o fundo (como a saída do barrilete gerado), relativa ao piso do nível ativo. O motor tem como raiz o nó mais alto sob a caixa. */
export const tankConnectionZ = (env: PlumbEnv): number => env.layout.tank.bottomZ - levelElevation(env.project, env.levelId);

/**
 * Candidatos de ligação perto de `raw`, por prioridade: ponto de água > caixa (só água fria) > ponta de tubo > trecho de tubo.
 * `radius` em metros. Sem candidato devolve `null` (o chamador usa o snap de paredes e grade).
 */
export function snapPipe(raw: V2, system: PipeSystem, env: PlumbEnv, radius: number, exclude?: ReadonlySet<string>): PipeSnap | null {
  const { layout, k, levelId } = env;
  let best: { snap: PipeSnap; rank: number; d: number } | null = null;
  const offer = (snap: PipeSnap, rank: number, d: number) => {
    if (d > radius) return;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { snap, rank, d };
  };

  for (const p of layout.points) {
    if (p.level !== levelId || !fixtureAccepts(k, p.fixture, system)) continue;
    const spec = k.water.fixtures[p.fixture]!;
    const z = system === 'sewer' ? -k.sewer.startDepth : spec.waterH;
    offer({ xy: [p.position[0], p.position[1]], kind: 'point', z, pointId: p.id }, 0, dist2(raw, p.position));
  }
  if (system === 'cold') {
    const t = layout.tank;
    offer({ xy: [t.position[0], t.position[1]], kind: 'tank', z: tankConnectionZ(env) }, 1, dist2(raw, t.position));
  }
  const compat = CONNECTS_TO[system];
  for (const pipe of layout.pipes) {
    if (pipe.level !== levelId || !compat.includes(pipe.system) || exclude?.has(pipe.id)) continue;
    const path = pipe.path as V3[];
    for (const end of [path[0]!, path[path.length - 1]!]) offer({ xy: [end[0], end[1]], kind: 'end', z: end[2], pipeId: pipe.id }, 2, dist2(raw, end));
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      if (dist2(a, b) < 0.05) continue; // trecho vertical (prumada) não recebe ligação lateral
      const c = closestOnSeg(raw, a, b);
      const z = a[2] + (b[2] - a[2]) * c.t;
      offer({ xy: c.point, kind: 'segment', z, pipeId: pipe.id, segIndex: i }, 3, c.d);
    }
  }
  return best ? (best as { snap: PipeSnap }).snap : null;
}

/**
 * Divide `pipeId` no ponto `at` (3D, z relativa ao piso do tubo): o vértice entra no trecho `seg` (ou reaproveita um que já
 * esteja ali) e o tubo vira dois, com as mesmas propriedades. O motor só liga ponta com ponta; sem a divisão o tubo novo
 * que termina no meio de outro ficaria solto. Devolve o id do segundo tubo (ou null se o ponto já é uma ponta).
 */
export function splitPipe(pipes: Pipe[], pipeId: string, seg: number, at: V3, newId: string): string | null {
  const idx = pipes.findIndex((p) => p.id === pipeId);
  if (idx < 0) return null;
  const p = pipes[idx]!;
  const path = p.path as V3[];
  let vi = path.findIndex((v) => Math.hypot(v[0] - at[0], v[1] - at[1], v[2] - at[2]) <= TOL);
  if (vi < 0) {
    path.splice(seg + 1, 0, [at[0], at[1], at[2]]);
    vi = seg + 1;
  }
  if (vi === 0 || vi === path.length - 1) return null;
  const tail = path.slice(vi);
  p.path = path.slice(0, vi + 1);
  const copy: Pipe = { ...p, id: newId, path: tail };
  pipes.splice(idx + 1, 0, copy);
  return newId;
}
