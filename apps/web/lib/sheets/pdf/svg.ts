/** Leitor mínimo de SVG (subconjunto que as pranchas geram): elementos, atributos e texto. Sem DOM. */

export interface SvgNode {
  name: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  /** Texto direto (para `<text>` e `<tspan>`). */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });

export function parseSvg(src: string): SvgNode {
  const root: SvgNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: SvgNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of src.matchAll(re)) {
    const [, close, name, rawAttrs, self, txt] = m;
    const top = stack[stack.length - 1]!;
    if (txt !== undefined) {
      top.text += decodeEntities(txt);
      continue;
    }
    if (!name) continue;
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '');
    const node: SvgNode = { name, attrs, children: [], text: '' };
    top.children.push(node);
    if (!self) stack.push(node);
  }
  const svg = root.children.find((c) => c.name === 'svg');
  if (!svg) throw new Error('SVG inválido: elemento <svg> ausente.');
  return svg;
}

export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** `transform="translate(..) rotate(..) scale(..) matrix(..)"` em matriz. */
export function parseTransform(s: string | undefined): Matrix {
  let m = IDENTITY;
  if (!s) return m;
  for (const t of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = t[2]!.split(/[\s,]+/).filter(Boolean).map(Number);
    const a = v[0] ?? 0;
    switch (t[1]) {
      case 'translate': m = mul(m, [1, 0, 0, 1, a, v[1] ?? 0]); break;
      case 'scale': m = mul(m, [a, 0, 0, v[1] ?? a, 0, 0]); break;
      case 'rotate': {
        const r = (a * Math.PI) / 180;
        const [c, s2] = [Math.cos(r), Math.sin(r)];
        const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
        m = mul(m, [1, 0, 0, 1, cx, cy]);
        m = mul(m, [c, s2, -s2, c, 0, 0]);
        m = mul(m, [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'matrix': if (v.length === 6) m = mul(m, v as Matrix); break;
      default: break;
    }
  }
  return m;
}

export type PathOp = { op: 'M' | 'L' | 'C' | 'Z'; pts: number[] };

/** `d` de um path em comandos absolutos M, L, C, Z (H, V, Q, S, T e arcos A convertidos). */
export function parsePath(d: string): PathOp[] {
  const out: PathOp[] = [];
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  const num = () => Number(tokens[i++]);
  const more = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'Z') {
      out.push({ op: 'Z', pts: [] });
      x = sx;
      y = sy;
      lastC = lastQ = null;
      continue;
    }
    do {
      if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push({ op: 'M', pts: [x, y] }); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; }
      else if (C === 'L') { x = ox + num(); y = oy + num(); out.push({ op: 'L', pts: [x, y] }); lastC = lastQ = null; }
      else if (C === 'H') { x = (rel ? x : 0) + num(); out.push({ op: 'L', pts: [x, y] }); lastC = lastQ = null; }
      else if (C === 'V') { y = (rel ? y : 0) + num(); out.push({ op: 'L', pts: [x, y] }); lastC = lastQ = null; }
      else if (C === 'C') {
        const p = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
        out.push({ op: 'C', pts: p }); lastC = [p[2]!, p[3]!]; lastQ = null; x = p[4]!; y = p[5]!;
      } else if (C === 'S') {
        const c1: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        const p = [c1[0], c1[1], ox + num(), oy + num(), ox + num(), oy + num()];
        out.push({ op: 'C', pts: p }); lastC = [p[2]!, p[3]!]; lastQ = null; x = p[4]!; y = p[5]!;
      } else if (C === 'Q' || C === 'T') {
        let q: [number, number];
        if (C === 'Q') q = [ox + num(), oy + num()];
        else q = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
        const ex = ox + num();
        const ey = oy + num();
        out.push({ op: 'C', pts: [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), ex + (2 / 3) * (q[0] - ex), ey + (2 / 3) * (q[1] - ey), ex, ey] });
        lastQ = q; lastC = null; x = ex; y = ey;
      } else if (C === 'A') {
        const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
        const ex = ox + num();
        const ey = oy + num();
        for (const seg of arcToCubics(x, y, rx, ry, rot, large !== 0, sweep !== 0, ex, ey)) out.push({ op: 'C', pts: seg });
        x = ex; y = ey; lastC = lastQ = null;
      } else {
        i = tokens.length;
        break;
      }
    } while (more());
  }
  return out;
}

/** Arco SVG (parametrização por ponto final) em curvas de Bézier cúbicas. */
function arcToCubics(x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const [cp, sp] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy;
  const y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2;
  const cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const step = dth / n;
  const t = (4 / 3) * Math.tan(step / 4);
  const out: number[][] = [];
  const pt = (a: number): [number, number] => [cx + rx * Math.cos(a) * cp - ry * Math.sin(a) * sp, cy + rx * Math.cos(a) * sp + ry * Math.sin(a) * cp];
  const dv = (a: number): [number, number] => [-rx * Math.sin(a) * cp - ry * Math.cos(a) * sp, -rx * Math.sin(a) * sp + ry * Math.cos(a) * cp];
  for (let k = 0; k < n; k++) {
    const a0 = th1 + k * step;
    const a1 = a0 + step;
    const p0 = pt(a0);
    const p1 = pt(a1);
    const d0 = dv(a0);
    const d1 = dv(a1);
    out.push([p0[0] + t * d0[0], p0[1] + t * d0[1], p1[0] - t * d1[0], p1[1] - t * d1[1], p1[0], p1[1]]);
  }
  return out;
}

/** Cor CSS (#rgb, #rrggbb, rgb(), rgba(), nomes comuns) em [r,g,b] 0–255; null para none/transparent. */
export function parseColor(c: string | undefined): { rgb: [number, number, number]; alpha: number } | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;
  const named: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080' };
  const v = named[s] ?? s;
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return { rgb: [...m[1]!].map((h) => parseInt(h + h, 16)) as [number, number, number], alpha: 1 };
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return { rgb: [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4, 6), 16)], alpha: 1 };
  const r = /^rgba?\(([^)]+)\)$/.exec(v);
  if (r) {
    const p = r[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], alpha: p[3] ?? 1 };
  }
  return { rgb: [0, 0, 0], alpha: 1 };
}
