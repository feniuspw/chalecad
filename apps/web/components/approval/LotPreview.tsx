'use client';
import { useMemo } from 'react';
import type { Lot, Vec2, Zoning } from '@chalecad/engine';
import { fmt } from '@/lib/project/format';
import { SIDE_LABEL, buildableRect, lotOutline, setbackBands, setbackDims, toLot } from '@/lib/approval/lotGeometry';

/** Miniatura SVG ao vivo: lote (traço-ponto), casa, faixas de recuo e distâncias reais. Rua embaixo. */
export function LotPreview({ lot, zoning, footprint }: { lot: Lot; zoning: Zoning; footprint: Vec2[] }) {
  const g = useMemo(() => {
    const outline = lotOutline(lot);
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const fp = footprint.length >= 3 ? footprint : ([[0, 0], [6, 0], [6, 8], [0, 8]] as Vec2[]);
    return {
      box: [x0, x1, y0, y1] as const,
      outline,
      house: fp.map((p) => toLot(lot, p)),
      bands: setbackBands(lot, zoning, fp),
      dims: setbackDims(lot, fp),
      buildable: buildableRect(lot, zoning),
    };
  }, [lot, zoning, footprint]);
  const [x0, x1, y0, y1] = g.box;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.08 + 1;
  const W = x1 - x0 + 2 * pad;
  const H = y1 - y0 + 2 * pad;
  // y do lote cresce para dentro (para cima na tela); a rua fica embaixo
  const X = (x: number) => x - x0 + pad;
  const Y = (y: number) => y1 - y + pad;
  const fs = Math.max(W, H) / 38;
  const pts = (poly: Vec2[]) => poly.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Miniatura do lote com a casa e os recuos" data-testid="lot-preview" className="max-h-72 w-full rounded-md border border-border bg-stone-50">
      {g.bands.map((b) => (
        <rect
          key={b.side}
          x={X(b.rect[0])}
          y={Y(b.rect[3])}
          width={b.rect[2] - b.rect[0]}
          height={b.rect[3] - b.rect[1]}
          fill={b.invaded ? '#fca5a5' : '#e7e5e4'}
          fillOpacity={b.invaded ? 0.55 : 0.5}
          data-invaded={b.invaded}
        />
      ))}
      {g.buildable ? <rect x={X(g.buildable[0])} y={Y(g.buildable[3])} width={g.buildable[2] - g.buildable[0]} height={g.buildable[3] - g.buildable[1]} fill="none" stroke="#a8a29e" strokeWidth={fs / 8} strokeDasharray={`${fs / 2} ${fs / 3}`} /> : null}
      <polygon points={pts(g.outline)} fill="none" stroke="#1c1917" strokeWidth={fs / 6} strokeDasharray={`${fs} ${fs / 3} ${fs / 8} ${fs / 3}`} />
      <polygon points={pts(g.house)} fill="#fde68a" stroke="#92400e" strokeWidth={fs / 8} />
      {g.dims.map((d) => (
        <g key={d.side}>
          <line x1={X(d.from[0])} y1={Y(d.from[1])} x2={X(d.to[0])} y2={Y(d.to[1])} stroke={d.value < 0 ? '#b91c1c' : '#57534e'} strokeWidth={fs / 10} />
          <text x={(X(d.from[0]) + X(d.to[0])) / 2} y={(Y(d.from[1]) + Y(d.to[1])) / 2} fontSize={fs} textAnchor="middle" dy={-fs / 4} fill="#44403c" stroke="#fafaf9" strokeWidth={fs / 5} paintOrder="stroke">
            {fmt(d.value, 2)} m
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - pad / 3} fontSize={fs} textAnchor="middle" fill="#78716c">
        {lot.streetName || 'Rua'} · {SIDE_LABEL.front.toLowerCase()}
      </text>
    </svg>
  );
}
