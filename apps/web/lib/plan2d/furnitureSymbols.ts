/**
 * Símbolos de arquitetura dos móveis na planta, em traço fino. Referencial local do móvel (centro na origem, largura em x,
 * profundidade em y, fundo em +y, frente em −y), em metros. Puro: serve à cena (linhas three), ao SVG e às miniaturas da biblioteca.
 */
import type { FurnitureModelKind } from '@chalecad/catalog';
import type { V2 } from '../tools/geom';

export interface Stroke {
  pts: V2[];
  closed: boolean;
  /** Traço mais leve (detalhe interno). */
  light?: boolean;
}

interface Size {
  w: number;
  d: number;
}

const rect = (x0: number, y0: number, x1: number, y1: number, light = false): Stroke => ({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, light });
const seg = (x0: number, y0: number, x1: number, y1: number, light = true): Stroke => ({ pts: [[x0, y0], [x1, y1]], closed: false, light });
const ellipse = (cx: number, cy: number, rx: number, ry: number, light = true, n = 28): Stroke => ({
  pts: Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)] as V2),
  closed: true,
  light,
});
const circle = (cx: number, cy: number, r: number, light = true) => ellipse(cx, cy, r, r, light, 20);

/** Retângulo com cantos arredondados (aproximado por arcos). */
function rrect(x0: number, y0: number, x1: number, y1: number, r: number, light = true): Stroke {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: V2[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  };
  corner(x1 - rr, y0 + rr, -Math.PI / 2);
  corner(x1 - rr, y1 - rr, 0);
  corner(x0 + rr, y1 - rr, Math.PI / 2);
  corner(x0 + rr, y0 + rr, Math.PI);
  return { pts, closed: true, light };
}

function upholstered(w: number, d: number, seats: number): Stroke[] {
  const hw = w / 2;
  const hd = d / 2;
  const arm = Math.min(0.16, w * 0.12);
  const back = Math.min(0.2, d * 0.24);
  const out: Stroke[] = [
    rect(-hw, -hd, hw, hd),
    seg(-hw + arm, -hd, -hw + arm, hd - back), // braço esquerdo
    seg(hw - arm, -hd, hw - arm, hd - back), // braço direito
    seg(-hw + arm, hd - back, hw - arm, hd - back), // encosto
  ];
  for (let i = 1; i < seats; i++) {
    const x = -hw + arm + ((w - 2 * arm) * i) / seats;
    out.push(seg(x, -hd + 0.04, x, hd - back));
  }
  return out;
}

function doors(w: number, d: number, front = -1): Stroke[] {
  const n = Math.max(1, Math.round(w / 0.6));
  const y = (d / 2) * front;
  const out: Stroke[] = [seg(-w / 2, y * 0.82, w / 2, y * 0.82)];
  for (let i = 1; i < n; i++) {
    const x = -w / 2 + (w * i) / n;
    out.push(seg(x, y * 0.82, x, y));
  }
  return out;
}

function chairsAlong(w: number, d: number, count: number): Stroke[] {
  // cadeiras nas duas faces longas, encaixadas sob o tampo (cabem na caixa w x d)
  const out: Stroke[] = [];
  const cw = 0.42;
  const per = Math.max(1, Math.floor(count / 2));
  for (let i = 0; i < per; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / per;
    out.push(rrect(x - cw / 2, -d / 2, x + cw / 2, -d / 2 + 0.3, 0.05));
    out.push(rrect(x - cw / 2, d / 2 - 0.3, x + cw / 2, d / 2, 0.05));
  }
  return out;
}

/** Traços do símbolo (o primeiro é o contorno). */
export function furnitureSymbol(kind: FurnitureModelKind, { w, d }: Size): Stroke[] {
  const hw = w / 2;
  const hd = d / 2;
  switch (kind) {
    case 'sofa':
      return upholstered(w, d, w > 1.9 ? 3 : 2);
    case 'armchair':
      return upholstered(w, d, 1);
    case 'coffee_table':
      return [rect(-hw, -hd, hw, hd), rrect(-hw + 0.06, -hd + 0.06, hw - 0.06, hd - 0.06, 0.04)];
    case 'rack':
      return [rect(-hw, -hd, hw, hd), seg(-hw * 0.7, hd * 0.4, hw * 0.7, hd * 0.4), seg(-hw, 0, hw, 0)];
    case 'shelf':
      return [rect(-hw, -hd, hw, hd), seg(-hw, -hd, hw, hd), seg(-hw, hd, hw, -hd)];
    case 'dining': {
      const t = Math.min(0.04, d * 0.1);
      return [rect(-hw, -hd, hw, hd, true), rrect(-hw, -hd + t, hw, hd - t, 0.03, false), ...chairsAlong(w, d, w > 1.5 ? 6 : 4)];
    }
    case 'round_table': {
      const rt = Math.min(hw, hd) - 0.04;
      const cr = 0.17;
      const dist = Math.min(hw, hd) - cr;
      return [
        ellipse(0, 0, rt, rt, false, 36),
        ...([0, 90, 180, 270] as const).map((a) => circle(dist * Math.cos((a * Math.PI) / 180), dist * Math.sin((a * Math.PI) / 180), cr)),
      ];
    }
    case 'bed': {
      const pillows = w > 1.2 ? 2 : 1;
      const out: Stroke[] = [rect(-hw, -hd, hw, hd), seg(-hw, -hd + 0.62, hw, -hd + 0.62)];
      const pw = (w - 0.12 - 0.06 * (pillows - 1)) / pillows;
      for (let i = 0; i < pillows; i++) {
        const x0 = -hw + 0.06 + i * (pw + 0.06);
        out.push(rrect(x0, hd - 0.4, x0 + pw, hd - 0.08, 0.05));
      }
      out.push(seg(-hw + 0.04, hd - 0.52, hw - 0.04, hd - 0.52));
      return out;
    }
    case 'bunk':
      return [rect(-hw, -hd, hw, hd), rect(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, true), rrect(-hw + 0.1, hd - 0.4, hw - 0.1, hd - 0.1, 0.05), seg(-hw + 0.05, -hd + 0.6, hw - 0.05, -hd + 0.6), seg(hw - 0.2, -hd + 0.1, hw - 0.2, -hd + 0.6)];
    case 'nightstand':
      return [rect(-hw, -hd, hw, hd), circle(0, hd * 0.15, Math.min(hw, hd) * 0.45), seg(-hw, -hd + 0.05, hw, -hd + 0.05)];
    case 'wardrobe':
      return [rect(-hw, -hd, hw, hd), ...doors(w, d), seg(-hw + 0.05, hd * 0.2, hw - 0.05, hd * 0.2)];
    case 'desk':
      return [rect(-hw, -hd, hw, hd), rect(-hw, -hd, -hw + 0.03, hd, true), circle(0, -hd + 0.17, 0.17)];
    case 'counter':
      return [rect(-hw, -hd, hw, hd), seg(-hw, -hd + 0.04, hw, -hd + 0.04), ...doors(w, d)];
    case 'counter_sink': {
      const sw = Math.min(0.5, w * 0.4);
      const cx = -hw * 0.25;
      return [rect(-hw, -hd, hw, hd), rrect(cx - sw / 2, -hd * 0.55, cx + sw / 2, hd * 0.55, 0.04), circle(cx, 0, 0.03), seg(cx, hd * 0.55, cx, hd * 0.8), rect(hw - 0.55, -hd * 0.6, hw - 0.05, hd * 0.6, true)];
    }
    case 'stove': {
      const rr = Math.min(hw, hd) * 0.28;
      const o = Math.min(hw, hd) * 0.5;
      return [rect(-hw, -hd, hw, hd), circle(-o, -o * 0.9 + hd * 0.2, rr), circle(o, -o * 0.9 + hd * 0.2, rr), circle(-o, o * 0.9 + hd * 0.2, rr), circle(o, o * 0.9 + hd * 0.2, rr), seg(-hw, -hd + 0.07, hw, -hd + 0.07)];
    }
    case 'fridge':
      return [rect(-hw, -hd, hw, hd), seg(-hw, -hd * 0.15, hw, -hd * 0.15), seg(hw - 0.08, -hd * 0.9, hw - 0.08, -hd * 0.4), seg(hw - 0.08, -hd * 0.05, hw - 0.08, hd * 0.4)];
    case 'island':
      return [rect(-hw, -hd, hw, hd), rrect(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, 0.03), seg(-hw + 0.05, 0, hw - 0.05, 0)];
    case 'toilet':
      return [rect(-hw, -hd, hw, hd), rect(-hw * 0.9, hd - 0.2, hw * 0.9, hd, true), ellipse(0, -hd * 0.1, hw * 0.85, hd * 0.55), ellipse(0, -hd * 0.1, hw * 0.55, hd * 0.35)];
    case 'basin':
      return [rect(-hw, -hd, hw, hd), ellipse(0, -hd * 0.05, hw * 0.72, hd * 0.55), circle(0, -hd * 0.05, 0.025), seg(0, hd * 0.5, 0, hd * 0.85)];
    case 'shower':
      return [rect(-hw, -hd, hw, hd), seg(-hw, -hd, hw, hd), circle(0, 0, 0.04), rect(-hw + 0.04, -hd + 0.04, hw - 0.04, hd - 0.04, true)];
    case 'bathtub':
      return [rect(-hw, -hd, hw, hd), rrect(-hw + 0.07, -hd + 0.07, hw - 0.07, hd - 0.07, hd * 0.45), circle(-hw + 0.25, 0, 0.03)];
    case 'washer':
      return [rect(-hw, -hd, hw, hd), circle(0, -hd * 0.05, Math.min(hw, hd) * 0.62), circle(0, -hd * 0.05, Math.min(hw, hd) * 0.42), seg(-hw * 0.8, hd * 0.8, -hw * 0.2, hd * 0.8)];
    case 'tank':
      return [rect(-hw, -hd, hw, hd), rrect(-hw + 0.05, -hd + 0.08, hw * 0.1, hd - 0.05, 0.03), circle(-hw * 0.45, 0, 0.025), rect(hw * 0.25, -hd + 0.08, hw - 0.05, hd - 0.05, true)];
    case 'lounger':
      return [rect(-hw, -hd, hw, hd), seg(-hw, hd - 0.6, hw, hd - 0.6), seg(-hw + 0.08, hd - 0.3, hw - 0.08, hd - 0.3)];
    case 'plant': {
      const r = Math.min(hw, hd);
      const leaves: Stroke[] = [0, 60, 120, 180, 240, 300].map((a) => seg(0, 0, r * 0.95 * Math.cos((a * Math.PI) / 180), r * 0.95 * Math.sin((a * Math.PI) / 180)));
      return [ellipse(0, 0, r, r, false, 32), circle(0, 0, r * 0.35), ...leaves];
    }
    case 'rug':
      return [rect(-hw, -hd, hw, hd), rect(-hw + 0.08, -hd + 0.08, hw - 0.08, hd - 0.08, true), rect(-hw + 0.14, -hd + 0.14, hw - 0.14, hd - 0.14, true)];
  }
}

/** Traços no referencial da planta: gira (graus, anti-horário) e translada. */
export function placeStrokes(strokes: Stroke[], position: V2, rotation: number): Stroke[] {
  const a = (rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return strokes.map((st) => ({ ...st, pts: st.pts.map(([x, y]) => [position[0] + x * c - y * s, position[1] + x * s + y * c] as V2) }));
}

/** SVG `d` de um traço, em coordenadas locais com y para baixo (frente em −y fica no alto, como na planta). */
export function strokePath(st: Stroke, unit = 1): string {
  const f = (n: number) => String(Math.round(n * unit * 100) / 100);
  return st.pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(-y)}`).join(' ') + (st.closed ? ' Z' : '');
}
