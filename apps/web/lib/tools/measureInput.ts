/**
 * Medida digitada ao desenhar (puro). Aceita vírgula ou ponto como separador decimal:
 *  - `3.5` / `3,5`       comprimento (m), na direção do cursor;
 *  - `3.5;90`            comprimento e ângulo absoluto em graus (0° = +X, anti-horário);
 *  - `3x4` / `3,5x4`     largura x profundidade (retângulo).
 */
import type { V2 } from './geom';

export type TypedMeasure =
  | { kind: 'length'; length: number; angleDeg?: number }
  | { kind: 'size'; width: number; height: number };

/** Caracteres aceitos no campo de medida. */
export const TYPED_CHARS = /^[0-9.,;xX*×-]$/;

const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export function parseMeasure(input: string): TypedMeasure | null {
  const s = input.trim();
  if (!s) return null;
  const size = s.split(/[xX*×]/);
  if (size.length === 2) {
    const w = num(size[0]!);
    const h = num(size[1]!);
    if (w === null || h === null || w <= 0 || h <= 0) return null;
    return { kind: 'size', width: w, height: h };
  }
  if (size.length > 2) return null;
  const parts = s.split(';');
  if (parts.length > 2) return null;
  const length = num(parts[0]!);
  if (length === null || length <= 0) return null;
  if (parts.length === 1) return { kind: 'length', length };
  const angle = num(parts[1]!);
  if (angle === null) return null;
  return { kind: 'length', length, angleDeg: angle };
}

/** Texto bonito do que está sendo digitado (pt-BR: vírgula). */
export function formatTyped(input: string): string {
  return input.replace(/\./g, ',').replace(/x/gi, ' x ').replace(';', ' ; ');
}

const DEG = Math.PI / 180;

/** Ângulo (graus, 0..360) da direção a -> b. */
export function angleDeg(a: V2, b: V2): number {
  const d = (Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG + 360) % 360;
  return Math.round(d * 100) / 100;
}

/** Ponto a `length` de `anchor`, na direção `angle` (graus) ou na direção de `toward` (padrão +X). */
export function pointAtLength(anchor: V2, length: number, o: { angleDeg?: number; toward?: V2 | null }): V2 {
  let dx = 1;
  let dy = 0;
  if (o.angleDeg !== undefined) {
    dx = Math.cos(o.angleDeg * DEG);
    dy = Math.sin(o.angleDeg * DEG);
  } else if (o.toward) {
    const vx = o.toward[0] - anchor[0];
    const vy = o.toward[1] - anchor[1];
    const l = Math.hypot(vx, vy);
    if (l > 1e-6) {
      dx = vx / l;
      dy = vy / l;
    }
  }
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return [r(anchor[0] + dx * length), r(anchor[1] + dy * length)];
}

/** Canto oposto de um retângulo `width` x `height` a partir de `a`, no quadrante do cursor (padrão +X +Y). */
export function rectCorner(a: V2, width: number, height: number, toward?: V2 | null): V2 {
  const sx = toward && toward[0] < a[0] ? -1 : 1;
  const sy = toward && toward[1] < a[1] ? -1 : 1;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return [r(a[0] + sx * width), r(a[1] + sy * height)];
}
