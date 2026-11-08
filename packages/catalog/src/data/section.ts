import type { ProfileFamily } from '../schema';
import type { z } from 'zod';

export type SectionProps = {
  /** cm² */
  area: number;
  /** kg/m (área × 7850) */
  massPerM: number;
  /** cm⁴ */
  Ix: number;
  /** cm³ */
  Wx: number;
  Iy: number;
  Wy: number;
  /** cm */
  rx: number;
  ry: number;
};

const STEEL_DENSITY = 7850;
const STEPS = 400;

type Pt = { x: number; y: number; w: number };

/**
 * Propriedades da seção por linha média, com cantos arredondados (raio da linha média = 2t).
 * Dimensões nominais (alma, mesa, enrijecedor) são externas, em mm; t em mm.
 * Convenção: comprimentos da linha média = dimensão externa − t (alma e mesa) e − 2t (enrijecedor,
 * calibrado para ficar na faixa das tabelas comerciais).
 * Seção com mesa 0 é fita plana; enrijecedor 0 é perfil U (guia).
 * Retorna cm², kg/m, cm⁴, cm³, cm.
 */
export function sectionProperties(
  family: z.infer<typeof ProfileFamily>,
  web: number,
  flange: number,
  lip: number,
  t: number,
): SectionProps {
  if (family === 'Wood') {
    // Seção retangular maciça: web = altura (eixo forte), flange = largura. Unidades: mm → cm.
    const hb = web / 10;
    const bb = flange / 10;
    const area = hb * bb;
    const Ix = (bb * hb ** 3) / 12;
    const Iy = (hb * bb ** 3) / 12;
    return { area, massPerM: 0, Ix, Wx: Ix / (hb / 2), Iy, Wy: Iy / (bb / 2), rx: Math.sqrt(Ix / area), ry: Math.sqrt(Iy / area) };
  }
  const h = web - t;
  const b = Math.max(flange - t, 0);
  const lipC = lip > 0 ? Math.max(lip - 2 * t, 0) : 0;
  const hasFlange = family !== 'Fita' && b > 0;
  const hasLip = hasFlange && lipC > 0;
  const r = 2 * t;

  // Metade superior da linha média (y >= 0); o espelho é somado depois.
  const pts: Pt[] = [];
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len <= 0) return;
    for (let i = 0; i < STEPS; i++) {
      const s = (i + 0.5) / STEPS;
      pts.push({ x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s, w: len / STEPS });
    }
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const len = Math.abs(a1 - a0) * r;
    for (let i = 0; i < STEPS; i++) {
      const a = a0 + (a1 - a0) * ((i + 0.5) / STEPS);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), w: len / STEPS });
    }
  };

  if (!hasFlange) {
    seg(0, 0, 0, h / 2);
  } else {
    seg(0, 0, 0, h / 2 - r);
    arc(r, h / 2 - r, Math.PI, Math.PI / 2);
    if (hasLip) {
      seg(r, h / 2, b - r, h / 2);
      arc(b - r, h / 2 - r, Math.PI / 2, 0);
      seg(b, h / 2 - r, b, h / 2 - lipC);
    } else {
      seg(r, h / 2, b, h / 2);
    }
  }

  // Soma com espelho em y (peso dobrado) e momentos em mm.
  let A = 0;
  let Sx = 0;
  for (const p of pts) {
    A += 2 * p.w * t;
    Sx += 2 * p.w * t * p.x;
  }
  const xc = Sx / A;
  let Ix = 0;
  let Iy = 0;
  let yMax = 0;
  let xMax = 0;
  for (const p of pts) {
    Ix += 2 * p.w * t * p.y * p.y;
    Iy += 2 * p.w * t * (p.x - xc) * (p.x - xc);
    yMax = Math.max(yMax, p.y + t / 2);
    xMax = Math.max(xMax, Math.abs(p.x - xc) + t / 2);
  }
  // Inércia própria da espessura (desprezível, incluída para a fita plana).
  if (!hasFlange) Iy += h * t * t * t / 12;

  const area = A / 100;
  const IxCm = Ix / 1e4;
  const IyCm = Iy / 1e4;
  return {
    area,
    massPerM: area * 1e-4 * STEEL_DENSITY,
    Ix: IxCm,
    Wx: Ix / yMax / 1e3,
    Iy: IyCm,
    Wy: Iy / xMax / 1e3,
    rx: Math.sqrt(IxCm / area),
    ry: Math.sqrt(IyCm / area),
  };
}
