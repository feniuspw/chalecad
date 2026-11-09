import { pointInPolygon, pointInPoly, signedArea, polygonArea, type Vec2 } from '../geometry';

export type EdgeMode = 'auto' | 'slope' | 'wall';

/** Intervalo de borda (~volumeStep) de um pad: unidade de decisão talude/muro. */
export interface Sample {
  pad: number;
  /** Índice local no laço do pad. */
  i: number;
  /** Início, fim e ponto médio do intervalo. */
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  mx: number;
  my: number;
  /** Normal externa unitária. */
  nx: number;
  ny: number;
  step: number;
  /** Primeiro intervalo de uma aresta (vértice do polígono). */
  corner: boolean;
  /** Intervalo coberto por pad mais recente ou colado a pad de mesma cota: sem talude nem muro. */
  hidden: boolean;
  /** Nível do pad vizinho logo à frente da borda (relativo ao piso da casa), ou null se a frente é terreno natural. */
  ovLevel: number | null;
  /** Terreno natural no ponto médio e componente do gradiente natural na direção da normal. */
  nat: number;
  g: number;
}

export interface PadGeom {
  id: string;
  name: string;
  level: number;
  mode: EdgeMode;
  /** Polígono anti-horário, sem vértices repetidos. */
  poly: Vec2[];
  bbox: [number, number, number, number];
  area: number;
  /** Arestas: início, vetor, comprimento², nº de intervalos e deslocamento no vetor global de amostras. */
  ax: Float64Array;
  ay: Float64Array;
  dx: Float64Array;
  dy: Float64Array;
  l2: Float64Array;
  edgeN: number[];
  edgeOffset: number[];
  sampleBase: number;
  nSamples: number;
}

/** Remove vértices repetidos e orienta anti-horário. */
export function normalizePolygon(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push([p[0], p[1]]);
  }
  if (out.length > 1 && Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) <= 1e-6) out.pop();
  return signedArea(out) < 0 ? out.reverse() : out;
}

export function makePad(id: string, name: string, level: number, mode: EdgeMode, poly: Vec2[]): PadGeom {
  const n = poly.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const l2 = new Float64Array(n);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % n]!;
    ax[k] = a[0];
    ay[k] = a[1];
    dx[k] = b[0] - a[0];
    dy[k] = b[1] - a[1];
    l2[k] = dx[k]! * dx[k]! + dy[k]! * dy[k]!;
    x0 = Math.min(x0, a[0]);
    y0 = Math.min(y0, a[1]);
    x1 = Math.max(x1, a[0]);
    y1 = Math.max(y1, a[1]);
  }
  return {
    id, name, level, mode, poly, bbox: [x0, y0, x1, y1], area: polygonArea(poly),
    ax, ay, dx, dy, l2, edgeN: [], edgeOffset: [], sampleBase: 0, nSamples: 0,
  };
}

/** Gera os intervalos de borda de todos os pads (amostras globais) e preenche `sampleBase`/`edgeN`/`edgeOffset`. */
export function buildSamples(
  pads: PadGeom[],
  step: number,
  natural: (x: number, y: number) => number,
  gradient: [number, number],
): Sample[] {
  const out: Sample[] = [];
  const DELTA = 0.05;
  pads.forEach((p, pi) => {
    p.sampleBase = out.length;
    const n = p.poly.length;
    let local = 0;
    for (let k = 0; k < n; k++) {
      const len = Math.sqrt(p.l2[k]!);
      const cnt = Math.max(1, Math.ceil(len / step - 1e-9));
      p.edgeN.push(cnt);
      p.edgeOffset.push(local);
      const ux = p.dx[k]! / len;
      const uy = p.dy[k]! / len;
      const nx = uy; // anti-horário: normal externa à direita da aresta
      const ny = -ux;
      const st = len / cnt;
      for (let i = 0; i < cnt; i++) {
        const sx = p.ax[k]! + ux * st * i;
        const sy = p.ay[k]! + uy * st * i;
        const ex = p.ax[k]! + ux * st * (i + 1);
        const ey = p.ay[k]! + uy * st * (i + 1);
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        // Cobertura: pad mais recente que contém o ponto médio esconde o intervalo; vizinho na frente define o desnível.
        let hidden = false;
        for (let j = pi + 1; j < pads.length; j++) {
          if (inBox(pads[j]!, mx, my) && pointInPolygon([mx, my], pads[j]!.poly, 1e-6)) {
            hidden = true;
            break;
          }
        }
        let ovLevel: number | null = null;
        const qx = mx + nx * DELTA;
        const qy = my + ny * DELTA;
        for (let j = pads.length - 1; j >= 0; j--) {
          if (j === pi) continue;
          if (inBox(pads[j]!, qx, qy) && pointInPoly(qx, qy, pads[j]!.poly)) {
            ovLevel = pads[j]!.level;
            break;
          }
        }
        if (ovLevel !== null && Math.abs(ovLevel - p.level) < 0.05) hidden = true;
        out.push({
          pad: pi, i: local++, sx, sy, ex, ey, mx, my, nx, ny, step: st, corner: i === 0, hidden, ovLevel,
          nat: natural(mx, my), g: gradient[0] * nx + gradient[1] * ny,
        });
      }
    }
    p.nSamples = local;
  });
  return out;
}

function inBox(p: PadGeom, x: number, y: number, pad = 1e-6): boolean {
  return x >= p.bbox[0] - pad && x <= p.bbox[2] + pad && y >= p.bbox[1] - pad && y <= p.bbox[3] + pad;
}

/** Posição de um ponto em relação aos pads: pad dono, distância ao dono (0 dentro) e intervalo de borda mais próximo. */
export interface Loc {
  owner: number;
  d: number;
  samp: number;
}

/**
 * Dono do ponto: pad mais recente que o contém (d = 0); fora de todos, o pad mais próximo (empate: o mais recente),
 * com o intervalo de borda mais próximo (para saber se ali há muro).
 */
export function locate(pads: PadGeom[], x: number, y: number, out: Loc): Loc {
  for (let i = pads.length - 1; i >= 0; i--) {
    const p = pads[i]!;
    if (inBox(p, x, y, 0) && pointInPoly(x, y, p.poly)) {
      out.owner = i;
      out.d = 0;
      out.samp = -1;
      return out;
    }
  }
  let best = Infinity;
  let bi = 0;
  let bk = 0;
  let bt = 0;
  for (let i = pads.length - 1; i >= 0; i--) {
    const p = pads[i]!;
    // Limite inferior pela caixa: pula pads que não podem vencer.
    const bx = Math.max(p.bbox[0] - x, 0, x - p.bbox[2]);
    const by = Math.max(p.bbox[1] - y, 0, y - p.bbox[3]);
    if (Math.hypot(bx, by) > best) continue;
    const n = p.poly.length;
    for (let k = 0; k < n; k++) {
      const l2 = p.l2[k]!;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - p.ax[k]!) * p.dx[k]! + (y - p.ay[k]!) * p.dy[k]!) / l2));
      const d = Math.hypot(x - (p.ax[k]! + t * p.dx[k]!), y - (p.ay[k]! + t * p.dy[k]!));
      if (d < best) {
        best = d;
        bi = i;
        bk = k;
        bt = t;
      }
    }
  }
  const p = pads[bi]!;
  out.owner = bi;
  out.d = best;
  out.samp = p.sampleBase + p.edgeOffset[bk]! + Math.min(p.edgeN[bk]! - 1, Math.floor(bt * p.edgeN[bk]!));
  return out;
}
