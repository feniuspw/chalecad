'use client';
import { symbolShape } from '@/lib/elec/symbols';
import type { SymbolKind } from '@/lib/elec/kinds';

/** Miniatura do símbolo NBR 5444 (a mesma geometria da planta) para a paleta e a legenda. */
export function SymbolIcon({ kind, color = '#44403c', size = 22 }: { kind: SymbolKind; color?: string; size?: number }) {
  const s = symbolShape(kind, [0, 0], [0, 1]);
  const path = (pts: [number, number][], closed: boolean) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)} ${(-p[1]).toFixed(3)}`).join(' ') + (closed ? ' Z' : '');
  const cy = kind === 'light_ceiling' ? 0 : -0.1;
  return (
    <svg aria-hidden width={size} height={size} viewBox={`-0.28 ${cy - 0.28} 0.56 0.56`} className="shrink-0">
      {s.fills.map((f, i) => (
        <path key={`f${i}`} d={path(f, true)} fill={color} />
      ))}
      {s.outline.map((o, i) => (
        <path key={`o${i}`} d={path(o.pts, o.closed)} fill="none" stroke={color} strokeWidth={0.03} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
