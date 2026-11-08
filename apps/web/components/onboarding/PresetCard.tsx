'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BedDouble, Check, Ruler, Wallet } from 'lucide-react';
import { cn } from '@chalecad/ui';
import { fmt } from '@/lib/project/format';
import type { Preset } from '@/lib/project/presets';
import { presetThumbnailSvg } from '@/lib/project/presets/thumbnail';

const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// Miniaturas calculadas uma vez por modelo (motor + SVG), depois do primeiro desenho.
const thumbs = new Map<string, string>();

function usePresetThumb(preset: Preset): string | null {
  const [svg, setSvg] = useState<string | null>(thumbs.get(preset.id) ?? null);
  useEffect(() => {
    if (svg) return;
    const t = setTimeout(() => {
      try {
        const s = presetThumbnailSvg(preset.build());
        thumbs.set(preset.id, s);
        setSvg(s);
      } catch (e) {
        console.warn('[modelos] miniatura indisponível:', e);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [preset, svg]);
  return svg;
}

export function PresetThumb({ preset }: { preset: Preset }) {
  const svg = usePresetThumb(preset);
  return (
    <div className="aspect-[3/2] overflow-hidden rounded-lg bg-gradient-to-b from-sky-50 to-stone-50 p-2" aria-hidden>
      {svg ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-full w-full animate-pulse rounded bg-stone-100" />}
    </div>
  );
}

function Facts({ preset }: { preset: Preset }) {
  return (
    <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
      <div className="flex items-center gap-1">
        <dt className="sr-only">Área</dt>
        <Ruler className="size-3 text-stone-400" aria-hidden />
        <dd className="tabular-nums">{fmt(preset.area, 1)} m²</dd>
      </div>
      <div className="flex items-center gap-1">
        <dt className="sr-only">Quartos</dt>
        <BedDouble className="size-3 text-stone-400" aria-hidden />
        <dd>
          {preset.bedrooms} {preset.bedrooms === 1 ? 'quarto' : 'quartos'}
        </dd>
      </div>
      <div className="flex items-center gap-1">
        <dt className="sr-only">Custo estimado</dt>
        <Wallet className="size-3 text-stone-400" aria-hidden />
        <dd className="font-medium tabular-nums text-stone-800">≈ {brl0(preset.estimatedCost)}</dd>
      </div>
    </dl>
  );
}

/** Cartão de modelo pronto: seleção (no assistente de novo projeto) ou link (lista de projetos vazia). */
export function PresetCard({ preset, selected, onSelect, onOpen, href }: { preset: Preset; selected?: boolean; onSelect?: () => void; onOpen?: () => void; href?: string }) {
  const body = (
    <>
      <PresetThumb preset={preset} />
      <span className="mt-2 block text-sm font-semibold text-stone-900">{preset.name}</span>
      <span className="mt-0.5 block text-xs leading-snug text-stone-500">{preset.description}</span>
      <Facts preset={preset} />
    </>
  );
  const base = 'group relative flex flex-col rounded-xl border bg-white p-3 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
  if (href) {
    return (
      <Link href={href} className={cn(base, 'border-border hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-float')}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(base, selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-stone-300 hover:shadow-sm')}
    >
      {body}
      {selected ? (
        <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-accent text-white">
          <Check className="size-3" />
        </span>
      ) : null}
    </button>
  );
}
