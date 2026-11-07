'use client';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@chalecad/ui';
import { Field, SliderField } from './fields';

/** Azimute para onde o terreno desce: 0 = fundos (+y), 90 = direita (+x), 180 = frente (-y), 270 = esquerda (-x). */
const DIRS = [
  { az: 0, label: 'Fundos', Icon: ArrowUp, cell: 'col-start-2 row-start-1' },
  { az: 90, label: 'Direita', Icon: ArrowRight, cell: 'col-start-3 row-start-2' },
  { az: 180, label: 'Frente', Icon: ArrowDown, cell: 'col-start-2 row-start-3' },
  { az: 270, label: 'Esquerda', Icon: ArrowLeft, cell: 'col-start-1 row-start-2' },
] as const;

const norm = (deg: number) => ((deg % 360) + 360) % 360;

export function azimuthLabel(az: number): string {
  const a = norm(az);
  const hit = DIRS.find((d) => Math.abs(a - d.az) < 0.5 || Math.abs(a - 360 - d.az) < 0.5);
  if (hit) return hit.label.toLowerCase();
  // Entre duas direções: "frente-direita".
  const names: Record<number, string> = { 45: 'fundos-direita', 135: 'frente-direita', 225: 'frente-esquerda', 315: 'fundos-esquerda' };
  const nearest = [45, 135, 225, 315].find((n) => Math.abs(a - n) < 0.5);
  return nearest ? names[nearest]! : `${Math.round(a)}°`;
}

/**
 * Seletor visual da direção da descida: vista de cima da edificação com as quatro direções
 * (botões) e um ângulo livre (slider), com a seta mostrando o sentido da descida.
 */
export function DownhillPicker({ value, onChange }: { value: number; onChange: (deg: number, coalesce: boolean) => void }) {
  const az = norm(value);
  return (
    <div className="space-y-3">
      <Field label="Para onde o terreno desce" hint={azimuthLabel(az)}>
        <div className="mx-auto grid w-fit grid-cols-[2.25rem_6rem_2.25rem] grid-rows-[2.25rem_6rem_2.25rem] gap-1" role="group" aria-label="Direção da descida">
          {DIRS.map(({ az: d, label, Icon, cell }) => {
            const active = Math.abs(az - d) < 0.5;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                aria-label={`Desce para ${label.toLowerCase()}`}
                title={`Desce para ${label.toLowerCase()}`}
                onClick={() => onChange(d, false)}
                className={cn(
                  'grid place-items-center rounded-md border text-stone-500 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  cell,
                  active ? 'border-accent bg-accent-soft text-accent-hover' : 'border-border bg-white hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800',
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
          <div className="relative col-start-2 row-start-2 overflow-hidden rounded-lg border border-border bg-surface-sunken">
            {/* Curvas de nível sugeridas: perpendiculares à descida. */}
            <svg viewBox="-50 -50 100 100" aria-hidden className="absolute inset-0 size-full">
              <g transform={`rotate(${az})`}>
                {[-36, -18, 0, 18, 36].map((y) => (
                  <line key={y} x1="-60" x2="60" y1={y} y2={y} stroke="currentColor" strokeWidth="0.8" className="text-stone-300" strokeDasharray="3 3" />
                ))}
                <path d="M0 22V-16M-8 -8L0 -18L8 -8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
              </g>
              <rect x="-15" y="-11" width="30" height="22" rx="2" fill="white" stroke="currentColor" strokeWidth="2" className="text-stone-600" />
              <text x="0" y="3" textAnchor="middle" fontSize="8" className="fill-stone-500" fontWeight="600">
                casa
              </text>
            </svg>
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-stone-400">fundos</span>
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-stone-400">frente</span>
          </div>
        </div>
      </Field>
      <SliderField label="Ângulo da descida" value={az} min={0} max={360} step={5} decimals={0} unit="°" hint="0° = fundos, 90° = direita" onChange={(v, c) => onChange(v === 360 ? 0 : v, c)} />
    </div>
  );
}
