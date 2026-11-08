'use client';
import type { FurnitureSpec } from '@chalecad/catalog';
import { furnitureSymbol, strokePath } from '@/lib/plan2d/furnitureSymbols';

/** Miniatura: o mesmo símbolo de arquitetura da planta, em SVG, com a proporção real do móvel. */
export function FurnitureThumb({ spec, size = 56, className }: { spec: Pick<FurnitureSpec, 'model' | 'size'>; size?: number; className?: string }) {
  const { w, d } = spec.size;
  const pad = 0.06;
  const strokes = furnitureSymbol(spec.model, { w, d });
  const k = Math.max(w, d) + pad * 2;
  const pw = (w + pad * 2) / k;
  const ph = (d + pad * 2) / k;
  return (
    <svg
      role="img"
      aria-label={`Símbolo de planta: ${spec.model}`}
      viewBox={`${-w / 2 - pad} ${-d / 2 - pad} ${w + pad * 2} ${d + pad * 2}`}
      width={size * pw}
      height={size * ph}
      className={className}
    >
      {strokes.map((st, i) => (
        <path
          key={i}
          d={strokePath(st)}
          fill={i === 0 ? '#fffaf0' : 'none'}
          stroke={st.light ? '#78716c' : '#44403c'}
          strokeWidth={st.light ? 1 : 1.4}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
