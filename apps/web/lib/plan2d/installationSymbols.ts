/**
 * Símbolos de projeto elétrico e hidráulico para a planta (SVG, cena e DXF). Puro: devolve traços em metros,
 * no referencial da planta (coordenadas do motor), todos a até 30 cm do ponto.
 */
import type { InstallationPoint, InstallationPointKind } from '@chalecad/engine';
import { kindColor, POINT_LABELS } from '../three/installations';
import type { V2 } from '../tools/geom';
import type { Stroke } from './furnitureSymbols';

export interface InstallationSymbol {
  id: string;
  kind: InstallationPointKind;
  level: string;
  point: V2;
  /** Cor do sistema (hex). */
  color: string;
  strokes: Stroke[];
  /** Preenche o contorno (triângulo da TUE, círculo do ponto de luz não). */
  fill: boolean;
  /** Letras dentro do símbolo (S, AF, AQ, CX). */
  text?: string;
}

const circle = (cx: number, cy: number, r: number, n = 20): Stroke => ({
  pts: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)] as V2),
  closed: true,
});
const seg = (a: V2, b: V2, light = false): Stroke => ({ pts: [a, b], closed: false, light });
const tri = (cx: number, cy: number, r: number): Stroke => ({
  pts: [[cx, cy + r], [cx - r * 0.87, cy - r * 0.5], [cx + r * 0.87, cy - r * 0.5]],
  closed: true,
});

function strokesOf(kind: InstallationPointKind, [x, y]: V2): { strokes: Stroke[]; fill: boolean; text?: string } {
  switch (kind) {
    case 'outlet':
      return { strokes: [tri(x, y, 0.1), seg([x, y - 0.05], [x, y - 0.14], true)], fill: false };
    case 'outlet_high':
      return { strokes: [tri(x, y, 0.1), seg([x, y - 0.05], [x, y - 0.14], true), seg([x - 0.05, y + 0.14], [x + 0.05, y + 0.14], true)], fill: false };
    case 'tue':
      return { strokes: [tri(x, y, 0.13), seg([x, y - 0.065], [x, y - 0.16], true)], fill: true };
    case 'switch':
      return { strokes: [circle(x, y, 0.07)], fill: false, text: 'S' };
    case 'light': {
      const r = 0.1;
      const d = r * 0.7;
      return { strokes: [circle(x, y, r), seg([x - d, y - d], [x + d, y + d]), seg([x - d, y + d], [x + d, y - d])], fill: false };
    }
    case 'panel': {
      const hw = 0.2;
      const hh = 0.12;
      const hatch: Stroke[] = [-0.12, 0, 0.12].map((o) => seg([x + o - hh, y - hh], [x + o + hh, y + hh], true));
      return { strokes: [{ pts: [[x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh]], closed: true }, ...hatch], fill: false };
    }
    case 'water_cold':
      return { strokes: [circle(x, y, 0.08)], fill: false, text: 'AF' };
    case 'water_hot':
      return { strokes: [circle(x, y, 0.08)], fill: false, text: 'AQ' };
    case 'sewer':
    case 'drain': {
      const r = kind === 'sewer' ? 0.1 : 0.07;
      return { strokes: [circle(x, y, r), seg([x - r, y], [x + r, y]), seg([x, y - r], [x, y + r])], fill: false };
    }
    case 'tank':
      return { strokes: [circle(x, y, 0.25, 28)], fill: false, text: 'CX' };
  }
}

/** Símbolos dos pontos (um por ponto). */
export function installationSymbols(points: InstallationPoint[]): InstallationSymbol[] {
  return points.map((p) => ({ id: p.id, kind: p.kind, level: p.level, point: p.position as V2, color: kindColor(p.kind), ...strokesOf(p.kind, p.position as V2) }));
}

/** Itens da legenda (só os tipos presentes, na ordem usual). */
const LEGEND_ORDER: InstallationPointKind[] = ['outlet', 'outlet_high', 'tue', 'switch', 'light', 'panel', 'water_cold', 'water_hot', 'sewer', 'drain', 'tank'];

export function installationLegend(points: InstallationPoint[]): { kind: InstallationPointKind; label: string }[] {
  const present = new Set(points.map((p) => p.kind));
  return LEGEND_ORDER.filter((k) => present.has(k)).map((kind) => ({ kind, label: POINT_LABELS[kind] }));
}
