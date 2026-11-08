/**
 * Desempenho (térmico, solar, chuva): funções puras de status, textos e layout 3D.
 * Sem React nem Three.js, para testar sem WebGL. Coordenadas locais da água: (u, v) do RoofPlane.
 */
import type { PerformanceReport, RainReport, RoofPlane, SolarReport, ThermalElement, Vec2, Vec3 } from '@chalecad/engine';
import { formatBRL, formatBRLRange, formatNumber } from '../format';

export const THERMAL_NOTICE = 'Procedimento simplificado da NBR 15575. Sistemas leves costumam precisar de simulação computacional.';

export type Status = 'ok' | 'near' | 'fail' | 'na';

/** Folga mínima (10%) para o verde: abaixo disso o resultado fica âmbar. */
const MARGIN = 0.1;

export const STATUS_LABEL: Record<Status, string> = { ok: 'Atende', near: 'No limite', fail: 'Reprova', na: 'Sem exigência' };

/** Transmitância: menor é melhor. Reprova acima do limite; âmbar a menos de 10% dele. */
export function uStatus(el: Pick<ThermalElement, 'U' | 'limitU' | 'okU'>): Status {
  if (!el.okU) return 'fail';
  return el.U > el.limitU * (1 - MARGIN) ? 'near' : 'ok';
}

/** Capacidade térmica: maior é melhor. Sem limite (null) não há exigência. */
export function ctStatus(el: Pick<ThermalElement, 'CT' | 'limitCT' | 'okCT'>): Status {
  if (el.limitCT === null) return 'na';
  if (!el.okCT) return 'fail';
  return el.CT < el.limitCT * (1 + MARGIN) ? 'near' : 'ok';
}

const RANK: Record<Status, number> = { na: 0, ok: 1, near: 2, fail: 3 };

export function worstStatus(...list: Status[]): Status {
  return list.reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), 'na');
}

export function elementStatus(el: ThermalElement): Status {
  const s = worstStatus(uStatus(el), ctStatus(el));
  return s === 'na' ? 'ok' : s;
}

/** Tamanho de uma barra de 0 a 1: valor relativo à escala (até 1,5x o limite). */
export function barFill(value: number, limit: number): number {
  if (!(limit > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / (limit * 1.5)));
}

/** Posição do limite na mesma escala da barra (sempre 1/1,5). */
export const LIMIT_MARK = 1 / 1.5;

export const STATUS_COLOR: Record<Status, string> = { ok: '#16a34a', near: '#d97706', fail: '#dc2626', na: '#a8a29e' };

/** Conselhos curtos para o que reprova. Vazio quando tudo atende. */
export function thermalAdvice(elements: ThermalElement[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    const label = el.label.toLowerCase();
    if (!el.okU) {
      out.push(
        el.kind === 'roof'
          ? `Cobertura (${label}): U acima do limite. Use telha com núcleo mais espesso, adicione forro com lã ou cor mais clara na telha (absortância ${formatNumber(el.alpha, 2)}).`
          : `Parede (${label}): U acima do limite. Aumente o isolante (lã de PET mais grossa) ou prefira cor clara na fachada (absortância ${formatNumber(el.alpha, 2)}).`,
      );
    }
    if (!el.okCT) out.push(`Parede (${label}): capacidade térmica baixa. Camadas mais pesadas (placa cimentícia, revestimento) ajudam.`);
  }
  return out;
}

export function thermalPassing(elements: ThermalElement[]): boolean {
  return elements.every((e) => e.okU && e.okCT);
}

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------

export function solarSummary(s: SolarReport): string {
  return `${formatNumber(s.kWp, 2)} kWp · ${s.modules} módulos · ${formatBRLRange(s.cost, s.costMax)} · retorno em ${formatNumber(s.paybackYears, 1)} anos`;
}

export function rainSummary(r: RainReport): string {
  return `${formatNumber(r.annualLiters, 0)} L/ano · reservatório de ${formatNumber(r.tankLiters, 0)} L`;
}

export function coveragePct(r: Pick<RainReport, 'coverage'>): string {
  return `${formatNumber(Math.min(1, Math.max(0, r.coverage)) * 100, 0)}%`;
}

export const money = formatBRL;

/** Zona de uma UF no catálogo, ou null. */
export function capitalZone(zoneByUF: Record<string, number>, uf: string): number | null {
  return zoneByUF[uf] ?? null;
}

export function hasPerformance(report: PerformanceReport | null | undefined): report is PerformanceReport {
  return !!report && report.thermal.length > 0;
}

// ---------------------------------------------------------------------------
// Layout dos módulos fotovoltaicos na água
// ---------------------------------------------------------------------------

/** Módulo padrão (m): largura em u e altura em v (retrato). A altura vem da área do catálogo. */
export const MODULE_WIDTH = 1.13;
export function moduleSize(moduleArea: number): { w: number; h: number } {
  return { w: MODULE_WIDTH, h: moduleArea / MODULE_WIDTH };
}

export const SOLAR_EDGE_MARGIN = 0.3;
export const SOLAR_GAP = 0.02;
/** Distância dos módulos à telha (m). */
export const SOLAR_OFFSET = 0.05;

export interface SolarSlot {
  /** Centro do módulo em (u, v) da água. */
  u: number;
  v: number;
  w: number;
  h: number;
}

export interface SolarLayout {
  slots: SolarSlot[];
  /** Módulos pedidos que não couberam. */
  missing: number;
  /** Capacidade total da água (com a folga). */
  capacity: number;
}

function planeOutline(plane: Pick<RoofPlane, 'uLength' | 'vLength' | 'outline'>): Vec2[] {
  return plane.outline && plane.outline.length >= 3
    ? plane.outline
    : [
        [0, 0],
        [plane.uLength, 0],
        [plane.uLength, plane.vLength],
        [0, plane.vLength],
      ];
}

const EPS = 1e-6;

function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > EPS) return false;
  return p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}

/** Ponto dentro (ou na borda) do polígono. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (onSegment(p, a, b)) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** O retângulo [u0,u1]x[v0,v1] cabe no polígono: cantos dentro e nenhum vértice estritamente dentro do retângulo. */
function rectInside(u0: number, v0: number, u1: number, v1: number, poly: Vec2[]): boolean {
  const corners: Vec2[] = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  if (!corners.every((c) => pointInPolygon(c, poly))) return false;
  return !poly.some(([x, y]) => x > u0 + EPS && x < u1 - EPS && y > v0 + EPS && y < v1 - EPS);
}

function packOrientation(poly: Vec2[], w: number, h: number, count: number, margin: number, gap: number): { slots: SolarSlot[]; capacity: number } {
  const vs = poly.map((p) => p[1]);
  const vmin = Math.min(...vs);
  const vmax = Math.max(...vs);
  const umin = Math.min(...poly.map((p) => p[0]));
  const umax = Math.max(...poly.map((p) => p[0]));
  const pitchV = h + gap;
  const pitchU = w + gap;
  const avail = vmax - vmin - 2 * margin;
  const rows = avail + gap >= h ? Math.floor((avail + gap) / pitchV + EPS) : 0;
  const vStart = vmin + margin + (avail - (rows > 0 ? rows * pitchV - gap : 0)) / 2;
  const STEP = 0.05;

  const slots: SolarSlot[] = [];
  let capacity = 0;
  let remaining = count;
  for (let r = 0; r < rows; r++) {
    const v0 = vStart + r * pitchV;
    // faixas contíguas de u onde um módulo (com a folga) cabe
    const fits: boolean[] = [];
    const n = Math.floor((umax - umin) / STEP);
    for (let i = 0; i <= n; i++) {
      const u0 = umin + i * STEP;
      fits.push(rectInside(u0 - margin, v0 - margin, u0 + w + margin, v0 + h + margin, poly));
    }
    let i = 0;
    while (i <= n) {
      if (!fits[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 <= n && fits[j + 1]) j++;
      const runStart = umin + i * STEP;
      const runEnd = umin + j * STEP + w;
      const cap = Math.floor((runEnd - runStart + gap) / pitchU + EPS);
      capacity += cap;
      const take = Math.min(cap, remaining);
      if (take > 0) {
        const used = take * pitchU - gap;
        const first = runStart + (runEnd - runStart - used) / 2;
        for (let k = 0; k < take; k++) slots.push({ u: first + k * pitchU + w / 2, v: v0 + h / 2, w, h });
        remaining -= take;
      }
      i = j + 1;
    }
  }
  return { slots, capacity };
}

/**
 * Posiciona até `count` módulos na água, em fileiras da beira do beiral para cima, centralizadas
 * e com folga das bordas. Testa retrato e paisagem e fica com a que acomoda mais módulos.
 */
export function solarLayout(
  plane: Pick<RoofPlane, 'uLength' | 'vLength' | 'outline'>,
  count: number,
  size: { w: number; h: number },
  opts: { margin?: number; gap?: number } = {},
): SolarLayout {
  const margin = opts.margin ?? SOLAR_EDGE_MARGIN;
  const gap = opts.gap ?? SOLAR_GAP;
  const want = Math.max(0, Math.round(count));
  const poly = planeOutline(plane);
  const portrait = packOrientation(poly, size.w, size.h, want, margin, gap);
  const landscape = packOrientation(poly, size.h, size.w, want, margin, gap);
  const best = landscape.slots.length > portrait.slots.length ? landscape : portrait;
  return { slots: best.slots, missing: want - best.slots.length, capacity: Math.max(portrait.capacity, landscape.capacity) };
}

/** Matriz de um módulo (colunas u, v, normal; posição) no referencial do motor. */
export function slotTransform(plane: Pick<RoofPlane, 'origin' | 'uAxis' | 'vAxis'>, slot: Pick<SolarSlot, 'u' | 'v'>, offset = SOLAR_OFFSET): { position: Vec3; normal: Vec3 } {
  const { uAxis: a, vAxis: b, origin: o } = plane;
  const n: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const nn: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
  return {
    position: [0, 1, 2].map((i) => o[i]! + a[i]! * slot.u + b[i]! * slot.v + nn[i]! * offset) as Vec3,
    normal: nn,
  };
}

// ---------------------------------------------------------------------------
// Reservatório de chuva
// ---------------------------------------------------------------------------

/** Cilindro com volume proporcional: altura cresce com a raiz cúbica do volume (1 a 2,4 m). */
export function rainTankSize(liters: number): { radius: number; height: number } {
  const v = Math.max(0, liters) / 1000;
  const height = Math.min(2.4, Math.max(1, Math.cbrt(v) * 1.3));
  const radius = Math.sqrt(v / (Math.PI * height)) || 0.3;
  return { radius: Math.max(0.3, radius), height };
}

/** Posição (x, y) do tanque: centrado na largura, a 1 m da parede dos fundos (y máximo da planta). */
export function rainTankPosition(footprint: Vec2[], radius: number, gapToWall = 1): Vec2 {
  if (footprint.length === 0) return [0, 0];
  const xs = footprint.map((p) => p[0]);
  const ys = footprint.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys) + gapToWall + radius];
}

/** Água indicada pelo motor e a disposição dos módulos nela (null sem solar ou sem água). */
export function solarPlacement(
  model: { roofPlanes: RoofPlane[] },
  solar: Pick<SolarReport, 'roofPlaneId' | 'modules'> | null | undefined,
  moduleArea: number,
): { plane: RoofPlane; layout: SolarLayout } | null {
  if (!solar || !solar.roofPlaneId || solar.modules <= 0) return null;
  const plane = model.roofPlanes.find((p) => p.id === solar.roofPlaneId);
  if (!plane) return null;
  return { plane, layout: solarLayout(plane, solar.modules, moduleSize(moduleArea)) };
}
