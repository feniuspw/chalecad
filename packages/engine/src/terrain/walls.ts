import { pointInPolygon, type Vec2 } from '../geometry';
import type { PadGeom, Sample } from './pads';

/** Altura mínima (m) para considerar desnível e para o trecho de muro forçado (sempre > 0). */
export const MIN_WALL_H = 0.05;
const DECIMATE_TOL = 0.02;

export type WallReason = 'forced' | 'overlap' | 'lot' | 'height';
const REASON: (WallReason | null)[] = [null, 'forced', 'overlap', 'lot', 'height'];

export interface WallRules {
  cutHeight: number;
  fillHeight: number;
  minLength: number;
  cutSlopeHV: number;
  fillSlopeHV: number;
  maxReach: number;
}

export interface DecideCtx {
  pads: PadGeom[];
  samples: Sample[];
  rules: WallRules;
  /** Contorno do lote nas coordenadas do projeto, se houver. */
  lot: Vec2[] | null;
}

/** Trecho contínuo de muro numa borda de pad (antes da montagem do caminho). */
export interface WallRun {
  pad: number;
  /** Índices locais (no laço do pad) dos intervalos do trecho, em ordem. */
  idx: number[];
  closed: boolean;
  side: 'cut' | 'fill';
  reason: WallReason;
}

export interface Decision {
  /** 1 = intervalo (global) tem muro. */
  flag: Uint8Array;
  /** Desnível com sinal por intervalo (corte > 0): terreno à frente menos o pad. */
  h: Float64Array;
  runs: WallRun[];
  /** Pads com `edges: 'slope'` cujo talude sairia do lote. */
  slopeOutsideLot: Set<number>;
}

/** Alcance horizontal do talude a partir da borda: onde ele encontra o terreno natural que sobe/desce com gradiente g. */
function slopeReach(h: number, g: number, r: WallRules): number {
  if (h > 0) {
    const den = 1 / r.cutSlopeHV - g;
    return den > 1e-9 ? Math.min(r.maxReach, h / den) : r.maxReach;
  }
  const den = 1 / r.fillSlopeHV + g;
  return den > 1e-9 ? Math.min(r.maxReach, -h / den) : r.maxReach;
}

/**
 * Decide, para a cota `zp` do platô da casa, onde há muro. O desnível de cada intervalo é o terreno natural à frente
 * (ou o pad vizinho) menos a cota do pad. Une trechos vizinhos, estende sobre vãos curtos e descarta trechos curtos.
 */
export function decide(zp: number, ctx: DecideCtx, withRuns: boolean): Decision {
  const { pads, samples, rules, lot } = ctx;
  const N = samples.length;
  const raw = new Uint8Array(N);
  const reason = new Uint8Array(N);
  const hs = new Float64Array(N);
  const slopeOutsideLot = new Set<number>();

  for (let k = 0; k < N; k++) {
    const sm = samples[k]!;
    if (sm.hidden) continue;
    const pad = pads[sm.pad]!;
    const h = sm.ovLevel !== null ? sm.ovLevel - pad.level : sm.nat - (zp + pad.level);
    hs[k] = h;
    if (pad.mode === 'wall') {
      raw[k] = 1;
      reason[k] = 1;
      continue;
    }
    if (Math.abs(h) < MIN_WALL_H) continue;
    if (pad.mode === 'auto' && sm.ovLevel !== null) {
      raw[k] = 1;
      reason[k] = 2;
      continue;
    }
    const wantsLot = lot !== null && (pad.mode === 'auto' || (withRuns && pad.mode === 'slope'));
    const r = pad.mode === 'auto' || wantsLot ? slopeReach(h, sm.g, rules) : 0;
    const px = sm.mx + sm.nx * r;
    const py = sm.my + sm.ny * r;
    if (pad.mode === 'auto') {
      let invade = false;
      for (let j = 0; j < pads.length && !invade; j++) {
        if (j === sm.pad) continue;
        const o = pads[j]!;
        const ox = (sm.mx + px) / 2;
        const oy = (sm.my + py) / 2;
        if (pointInPolygon([px, py], o.poly, 1e-6) || pointInPolygon([ox, oy], o.poly, 1e-6)) invade = true;
      }
      if (invade) {
        raw[k] = 1;
        reason[k] = 2;
        continue;
      }
    }
    if (wantsLot && lot) {
      const out = !pointInPolygon([px, py], lot, 1e-6) || !pointInPolygon([(sm.mx + px) / 2, (sm.my + py) / 2], lot, 1e-6);
      if (out) {
        if (pad.mode === 'auto') {
          raw[k] = 1;
          reason[k] = 3;
          continue;
        }
        slopeOutsideLot.add(sm.pad);
      }
    }
    if (pad.mode === 'auto' && (h > 0 ? h > rules.cutHeight : -h > rules.fillHeight)) {
      raw[k] = 1;
      reason[k] = 4;
    }
  }

  const flag = new Uint8Array(N);
  const runs: WallRun[] = [];
  pads.forEach((pad, pi) => processPad(pad, pi, raw, reason, hs, samples, rules, flag, runs, withRuns));
  return { flag, h: hs, runs, slopeOutsideLot };
}

const sideOf = (h: number): 'cut' | 'fill' => (h > 0 ? 'cut' : h < 0 ? 'fill' : 'cut');

function processPad(
  pad: PadGeom,
  pi: number,
  raw: Uint8Array,
  reason: Uint8Array,
  hs: Float64Array,
  samples: Sample[],
  rules: WallRules,
  flag: Uint8Array,
  outRuns: WallRun[],
  withRuns: boolean,
): void {
  const n = pad.nSamples;
  const base = pad.sampleBase;
  const isW = (i: number) => raw[base + i] === 1;
  if (n === 0) return;
  // Gira o laço para o maior vão sem muro ficar no fim (os trechos não atravessam o índice 0).
  let s0 = 0;
  let closed = true;
  let bestGap = 0;
  for (let i = 0; i < n; i++) {
    if (isW(i)) continue;
    closed = false;
    if (!isW((i + n - 1) % n)) continue; // não é início de vão
    let len = 0;
    while (len < n && !isW((i + len) % n)) len++;
    if (len > bestGap) {
      bestGap = len;
      s0 = (i + len) % n;
    }
  }
  if (closed) s0 = 0;
  const at = (t: number) => (s0 + t) % n;

  // 1) Trechos de mesmo lado.
  interface R {
    t0: number;
    t1: number;
    side: 'cut' | 'fill';
  }
  let runs: R[] = [];
  for (let t = 0; t < n; t++) {
    const i = at(t);
    if (!isW(i)) continue;
    const side = sideOf(hs[base + i]!);
    const last = runs[runs.length - 1];
    if (last && last.t1 === t - 1 && last.side === side) last.t1 = t;
    else runs.push({ t0: t, t1: t, side });
  }
  const span = (t0: number, t1: number) => {
    let s = 0;
    for (let t = t0; t <= t1; t++) s += samples[base + at(t)]!.step;
    return s;
  };
  // 2) Vãos curtos entre trechos do mesmo lado são fechados (sem trecho escondido no vão).
  const merged: R[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.side === r.side && r.t0 - prev.t1 > 1) {
      let ok = span(prev.t1 + 1, r.t0 - 1) < rules.minLength;
      for (let t = prev.t1 + 1; t < r.t0 && ok; t++) if (samples[base + at(t)]!.hidden) ok = false;
      if (ok) {
        for (let t = prev.t1 + 1; t < r.t0; t++) raw[base + at(t)] = 1;
        prev.t1 = r.t1;
        continue;
      }
    }
    merged.push({ ...r });
  }
  runs = merged;
  // 3) Trechos curtos somem, salvo se forçados pelo usuário.
  for (const r of runs) {
    let forced = false;
    for (let t = r.t0; t <= r.t1; t++) if (reason[base + at(t)] === 1) forced = true;
    if (!forced && span(r.t0, r.t1) < rules.minLength) continue;
    let rc = 5;
    const idx: number[] = [];
    for (let t = r.t0; t <= r.t1; t++) {
      const i = at(t);
      flag[base + i] = 1;
      idx.push(i);
      const rr = reason[base + i]!;
      if (rr === 1) rc = 1;
      else if (rr > 0 && rc !== 1) rc = Math.min(rc, rr);
    }
    if (withRuns) {
      outRuns.push({
        pad: pi, idx, closed: closed && runs.length === 1 && r.t0 === 0 && r.t1 === n - 1, side: r.side,
        reason: REASON[rc === 5 ? 4 : rc]!,
      });
    }
  }
}

export interface BuiltWall {
  pad: number;
  path: Vec2[];
  heights: number[];
  side: 'cut' | 'fill';
  reason: WallReason;
}

/** Monta caminho e alturas por vértice de um trecho; simplifica vértices colineares de altura linear. */
export function buildWall(run: WallRun, pad: PadGeom, samples: Sample[], hs: Float64Array): BuiltWall {
  const base = pad.sampleBase;
  const m = run.idx.length;
  const pts: Vec2[] = [];
  const corner: boolean[] = [];
  const hv: number[] = [];
  const hAbs = (i: number) => Math.max(MIN_WALL_H, Math.abs(hs[base + i]!));
  for (let k = 0; k < m; k++) {
    const sm = samples[base + run.idx[k]!]!;
    pts.push([sm.sx, sm.sy]);
    corner.push(sm.corner);
    if (k === 0) hv.push(run.closed ? (hAbs(run.idx[m - 1]!) + hAbs(run.idx[0]!)) / 2 : hAbs(run.idx[0]!));
    else hv.push((hAbs(run.idx[k - 1]!) + hAbs(run.idx[k]!)) / 2);
  }
  const lastS = samples[base + run.idx[m - 1]!]!;
  pts.push(run.closed ? [pts[0]![0], pts[0]![1]] : [lastS.ex, lastS.ey]);
  corner.push(true);
  hv.push(run.closed ? hv[0]! : hAbs(run.idx[m - 1]!));
  // cumulativa
  const s: number[] = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
  const keep: number[] = [0];
  let anchor = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    let ok = true;
    const end = k + 1;
    for (let j = anchor + 1; j <= k && ok; j++) {
      const f = (s[j]! - s[anchor]!) / (s[end]! - s[anchor]! || 1);
      if (Math.abs(hv[j]! - (hv[anchor]! + (hv[end]! - hv[anchor]!) * f)) > DECIMATE_TOL) ok = false;
    }
    if (corner[k] || !ok) {
      keep.push(k);
      anchor = k;
    }
  }
  keep.push(pts.length - 1);
  return {
    pad: run.pad, path: keep.map((k) => pts[k]!), heights: keep.map((k) => hv[k]!), side: run.side, reason: run.reason,
  };
}
