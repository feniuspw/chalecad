'use client';
import type { ReactNode } from 'react';
import { Html } from '@react-three/drei';

type Tone = 'dim' | 'live' | 'ok' | 'bad' | 'hint';

const TONES: Record<Tone, string> = {
  dim: 'bg-white/90 text-stone-700 border-stone-300',
  live: 'bg-amber-500 text-white border-amber-600',
  ok: 'bg-emerald-600 text-white border-emerald-700',
  bad: 'bg-red-600 text-white border-red-700',
  hint: 'bg-stone-800/90 text-white border-stone-700',
};

/** Rótulo HTML ancorado num ponto da cena (coordenadas do grupo em que está). Nunca captura o mouse. */
export function SceneLabel({ position, children, tone = 'dim', offsetY = 0 }: { position: [number, number, number]; children: ReactNode; tone?: Tone; offsetY?: number }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none', transform: `translateY(${offsetY}px)` }}>
      <span className={`block rounded border px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap tabular-nums shadow-sm select-none ${TONES[tone]}`}>{children}</span>
    </Html>
  );
}
