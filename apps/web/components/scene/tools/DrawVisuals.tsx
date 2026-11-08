'use client';
import { Line } from '@react-three/drei';
import { fmt } from '@/lib/project/format';
import type { V2 } from '@/lib/tools/geom';
import { dist } from '@/lib/tools/geom';
import { angleDeg, formatTyped } from '@/lib/tools/measureInput';
import type { ParallelGap } from '@/lib/tools/walls';
import { SceneLabel } from '../labels';

/** Campo flutuante junto ao cursor com a medida em digitação (ou a leitura ao vivo do trecho). */
export function CursorReadout({ at, z, mpp, typed, invalid, live, extra }: { at: V2; z: number; mpp: number; typed: string; invalid: boolean; live: string; extra?: string }) {
  // Acima do cursor, deslocado na cena (não por CSS): o contêiner HTML sob o cursor engoliria cliques e movimentos.
  return (
    <SceneLabel position={[at[0], at[1] + mpp * 34, z + 0.08]} tone={invalid ? 'bad' : 'live'}>
      {typed ? (
        <span data-testid="typed-field">
          {formatTyped(typed)}
          <span className="opacity-70"> {invalid ? '· medida inválida' : '· Enter'}</span>
        </span>
      ) : (
        <span data-testid="live-readout">
          {live}
          {extra ? <span className="opacity-80"> · {extra}</span> : null}
        </span>
      )}
    </SceneLabel>
  );
}

/** Leitura ao vivo de um trecho: comprimento e ângulo. */
export const liveText = (a: V2, b: V2) => `${fmt(dist(a, b))} m · ${fmt(angleDeg(a, b), 0)}°`;

/** Cota fina até a parede paralela mais próxima. */
export function ParallelDim({ gap, z }: { gap: ParallelGap | null; z: number }) {
  if (!gap) return null;
  const m: V2 = [(gap.from[0] + gap.to[0]) / 2, (gap.from[1] + gap.to[1]) / 2];
  return (
    <>
      <Line points={[[gap.from[0], gap.from[1], z + 0.03], [gap.to[0], gap.to[1], z + 0.03]]} color="#0ea5e9" lineWidth={1.25} depthTest={false} renderOrder={986} />
      <SceneLabel position={[m[0], m[1], z + 0.06]} tone="hint" offsetY={0}>
        {fmt(gap.distance)} m
      </SceneLabel>
    </>
  );
}
