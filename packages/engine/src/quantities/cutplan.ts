import type { CutBar } from '../schema/results';

const EPS = 1e-9;

/**
 * Plano de corte: First-Fit Decreasing em barras do maior comprimento e, depois, troca de cada barra
 * pela menor que comporte o que foi cortado.
 *
 * Regra do disco: n cortes numa barra consomem Σ comprimentos + kerf × (n − 1) (o último corte é o
 * fim da barra). `waste` = comprimento da barra − Σ comprimentos cortados (inclui o kerf).
 * Peça maior que a maior barra é dividida em segmentos (emenda), com IDs `<id>#1`, `<id>#2`…
 */
export function cutPlan(pieces: { id: string; length: number }[], barLengths: number[], kerf: number): CutBar[] {
  const sizes = [...barLengths].sort((a, b) => a - b);
  const max = sizes[sizes.length - 1];
  if (max === undefined) return [];

  const cuts: { pieceId: string; length: number }[] = [];
  for (const p of pieces) {
    if (p.length <= max + EPS) {
      cuts.push({ pieceId: p.id, length: p.length });
      continue;
    }
    let rest = p.length;
    let k = 1;
    while (rest > max + EPS) {
      cuts.push({ pieceId: `${p.id}#${k++}`, length: max });
      rest -= max;
    }
    if (rest > EPS) cuts.push({ pieceId: `${p.id}#${k}`, length: rest });
  }
  cuts.sort((a, b) => b.length - a.length);

  const open: { cuts: { pieceId: string; length: number }[]; sum: number }[] = [];
  const need = (sum: number, n: number) => sum + kerf * Math.max(0, n - 1);
  for (const c of cuts) {
    const bar = open.find((b) => need(b.sum + c.length, b.cuts.length + 1) <= max + EPS);
    if (bar) {
      bar.cuts.push(c);
      bar.sum += c.length;
    } else open.push({ cuts: [c], sum: c.length });
  }

  return open.map((b) => {
    const needed = need(b.sum, b.cuts.length);
    const barLength = sizes.find((s) => s >= needed - EPS) ?? max;
    return { barLength, cuts: b.cuts, waste: Math.max(0, barLength - b.sum) };
  });
}
