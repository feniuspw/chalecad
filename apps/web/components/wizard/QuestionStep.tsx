'use client';
import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { cn } from '@chalecad/ui';
import type { UF } from '@chalecad/engine';
import { DEFAULT_CUSTOM_SLOPE_PCT, MAX_BEDROOMS, MAX_SLOPE_PCT, degToPct, pctToDeg, suggestedBedrooms, type WizardAnswers } from '@/lib/project/wizard/answers';
import type { Question } from '@/lib/project/wizard/questions';
import { resolveStyle, STYLE_NAMES } from '@/lib/project/wizard/style';
import { NumberField, Notice, SelectField, Segmented, SwitchField } from '../editor/properties/fields';
import { UF_OPTIONS } from '../editor/properties/SystemSections';
import { OptionIcon } from './icons';
import { Term } from '@/components/glossary/Term';

type Patch = (p: Partial<WizardAnswers>) => void;

/** Valor atual de uma pergunta de escolha, como texto, e como gravar a opção escolhida. */
const READ: Record<string, (a: WizardAnswers) => string> = {
  purpose: (a) => a.purpose,
  style: (a) => a.style,
  mezzanine: (a) => a.mezzanine,
  bathrooms: (a) => String(a.bathrooms),
  bathUp: (a) => (a.bathUp ? 'yes' : 'no'),
  wings: (a) => a.wings,
  kitchen: (a) => a.kitchen,
  laundry: (a) => a.laundry,
  deck: (a) => a.deck,
  terrain: (a) => a.terrain,
  structure: (a) => a.structure,
  budget: (a) => a.budget,
};
const WRITE: Record<string, (v: string, a: WizardAnswers) => Partial<WizardAnswers>> = {
  purpose: (v) => ({ purpose: v as WizardAnswers['purpose'], laundry: v === 'live' ? 'inside' : v === 'rent' ? 'inside' : 'none' }),
  style: (v) => ({ style: v as WizardAnswers['style'] }),
  mezzanine: (v) => ({ mezzanine: v as WizardAnswers['mezzanine'] }),
  bathrooms: (v) => ({ bathrooms: v === '2' ? 2 : 1 }),
  bathUp: (v) => ({ bathUp: v === 'yes' }),
  wings: (v) => ({ wings: v as WizardAnswers['wings'] }),
  kitchen: (v) => ({ kitchen: v as WizardAnswers['kitchen'] }),
  laundry: (v) => ({ laundry: v as WizardAnswers['laundry'] }),
  deck: (v) => ({ deck: v as WizardAnswers['deck'] }),
  terrain: (v, a) => ({ terrain: v as WizardAnswers['terrain'], ...(v === 'custom' ? { slopePct: a.slopePct ?? DEFAULT_CUSTOM_SLOPE_PCT } : {}) }),
  structure: (v) => ({ structure: v as WizardAnswers['structure'] }),
  budget: (v) => ({ budget: v as WizardAnswers['budget'] }),
};

function Counter({ value, min, max, onChange, unit }: { value: number; min: number; max: number; onChange: (v: number) => void; unit: string }) {
  return (
    <div className="flex items-center justify-center gap-6 py-4">
      <button type="button" aria-label="Diminuir" disabled={value <= min} onClick={() => onChange(value - 1)} className="grid size-14 place-items-center rounded-full border border-border bg-white text-stone-700 outline-none hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40">
        <Minus className="size-6" />
      </button>
      <div className="min-w-24 text-center" aria-live="polite">
        <div className="text-6xl font-semibold tabular-nums text-stone-900">{value}</div>
        <div className="mt-1 text-sm text-stone-500">{value === 1 ? unit : `${unit}s`}</div>
      </div>
      <button type="button" aria-label="Aumentar" disabled={value >= max} onClick={() => onChange(value + 1)} className="grid size-14 place-items-center rounded-full border border-border bg-white text-stone-700 outline-none hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40">
        <Plus className="size-6" />
      </button>
    </div>
  );
}

const r1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Inclinação própria: campo em % ou em graus, com o equivalente ao lado e uma frase para leigo. */
function SlopeInput({ a, patch }: { a: WizardAnswers; patch: Patch }) {
  const [unit, setUnit] = useState<'pct' | 'deg'>('pct');
  const pct = a.slopePct ?? DEFAULT_CUSTOM_SLOPE_PCT;
  const deg = pctToDeg(pct);
  const maxDeg = Math.round(pctToDeg(MAX_SLOPE_PCT) * 10) / 10;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {unit === 'pct' ? (
          <NumberField label="Inclinação" value={Math.round(pct * 10) / 10} min={0} max={MAX_SLOPE_PCT} step={1} unit="%" onChange={(v) => patch({ slopePct: Math.min(MAX_SLOPE_PCT, Math.max(0, v)) })} />
        ) : (
          <NumberField label="Inclinação" value={Math.round(deg * 10) / 10} min={0} max={maxDeg} step={0.5} unit="°" onChange={(v) => patch({ slopePct: Math.min(MAX_SLOPE_PCT, Math.max(0, Math.round(degToPct(v) * 10) / 10)) })} />
        )}
        <Segmented<'pct' | 'deg'>
          label="Digitar em"
          value={unit}
          options={[
            { value: 'pct', label: 'Porcentagem (%)' },
            { value: 'deg', label: 'Graus (°)' },
          ]}
          onChange={setUnit}
        />
      </div>
      <p className="text-sm text-stone-700" aria-live="polite">
        <strong>
          {r1(pct)}% ≈ {r1(deg)}°
        </strong>
        : o terreno sobe {r1(pct)} cm a cada 1 m.
        {pct > 20 ? ' Acima de 20% incluímos muro de arrimo.' : pct < 1 ? ' Abaixo de 1% tratamos como terreno plano.' : ''}
      </p>
    </div>
  );
}

function ChoiceGrid({ q, a, patch }: { q: Question; a: WizardAnswers; patch: Patch }) {
  const current = READ[q.id]?.(a);
  const opts = q.options ?? [];
  return (
    <div role="radiogroup" aria-label={q.title} className={cn('grid gap-3', opts.length >= 4 ? 'sm:grid-cols-2' : opts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {opts.map((o) => {
        const selected = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => patch(WRITE[q.id]!(o.value, a))}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/60',
              selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-stone-300 hover:shadow-sm',
            )}
          >
            {o.icon ? (
              <div className="grid h-20 w-full place-items-center text-stone-700">
                <div className="h-full max-w-36 [&>svg]:h-full">
                  <OptionIcon name={o.icon} />
                </div>
              </div>
            ) : null}
            <span className="text-base font-semibold text-stone-900">{o.label}</span>
            {o.hint ? <span className="text-sm leading-snug text-stone-600">{o.hint}</span> : null}
            {selected ? (
              <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-accent text-white">
                <Check className="size-4" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function QuestionStep({ q, a, patch, onBedroomsEdited }: { q: Question; a: WizardAnswers; patch: Patch; onBedroomsEdited: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{q.title}</h2>
        <p className="mt-1.5 flex gap-1.5 text-sm leading-relaxed text-stone-600">
          <span className="font-medium text-stone-700">Por que perguntamos:</span>
          <span>{q.why}</span>
        </p>
      </div>

      {q.id === 'people' ? (
        <>
          <Counter value={a.people} min={1} max={q.max!} unit="pessoa" onChange={(v) => patch({ people: v, ...(a.bedrooms === suggestedBedrooms(a.people) ? { bedrooms: suggestedBedrooms(v) } : {}) })} />
          <Notice>Sugerimos {suggestedBedrooms(a.people)} {suggestedBedrooms(a.people) === 1 ? 'quarto' : 'quartos'} para {a.people} {a.people === 1 ? 'pessoa' : 'pessoas'}. Você pode mudar na próxima pergunta.</Notice>
        </>
      ) : null}

      {q.id === 'bedrooms' ? (
        <>
          <Counter
            value={a.bedrooms}
            min={1}
            max={MAX_BEDROOMS}
            unit="quarto"
            onChange={(v) => {
              onBedroomsEdited();
              patch({ bedrooms: v });
            }}
          />
          <Notice>Sugerido para {a.people} {a.people === 1 ? 'pessoa' : 'pessoas'}: {suggestedBedrooms(a.people)}. Uma sala com sofá-cama conta como cama extra, então dá para ter um quarto a menos.</Notice>
        </>
      ) : null}

      {q.kind === 'choice' ? <ChoiceGrid q={q} a={a} patch={patch} /> : null}

      {q.id === 'style' && a.style === 'modern' ? (
        <Segmented<'shed' | 'flat'>
          label="Telhado moderno"
          value={a.modernRoof}
          options={[
            { value: 'shed', label: 'Uma água (inclinado)' },
            { value: 'flat', label: 'Plano (com platibanda)' },
          ]}
          onChange={(v) => patch({ modernRoof: v })}
        />
      ) : null}
      {q.id === 'style' && a.style === 'auto' ? <Notice>Vamos recomendar na hora de montar: {STYLE_NAMES[resolveStyle(a).kind]} para {a.bedrooms} {a.bedrooms === 1 ? 'quarto' : 'quartos'}. {resolveStyle(a).why}</Notice> : null}
      {q.id === 'mezzanine' ? (
        <Notice>
          <Term id="mezanino">Mezanino</Term> é o andar parcial no alto. Se escolher dormir lá em cima, esse é um dos seus quartos.
        </Notice>
      ) : null}
      {q.id === 'structure' ? (
        <Notice>
          <Term id="lsf">Steel frame</Term> e <Term id="wood_frame">wood frame</Term> são formas de montar o esqueleto da casa. Aço: preciso e não dá cupim. Madeira: mais acolhedor, pede manutenção.
        </Notice>
      ) : null}

      {q.kind === 'terrain' ? (
        <>
          <ChoiceGrid q={q} a={a} patch={patch} />
          {a.terrain === 'custom' ? <SlopeInput a={a} patch={patch} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Estado (UF)" value={a.uf} options={UF_OPTIONS} onChange={(uf: UF) => patch({ uf })} hint="define a base de preços" />
            <SwitchField label="Fica na serra ou na montanha?" description="Mais frio e mais vento: ajustamos o conforto térmico e a estrutura." checked={a.mountain} onChange={(v) => patch({ mountain: v })} />
          </div>
        </>
      ) : null}

      {q.kind === 'extras' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['installations', 'Estimar instalações', 'Pontos de luz, tomadas e água, com a caixa d\'água.'],
              ['furnish', 'Já colocar móveis', 'Cama, sofá, cozinha e banheiro nos cômodos, para você ver como fica.'],
              ['solar', 'Energia solar', 'Placas no telhado para gerar a própria luz.'],
              ['rainwater', 'Aproveitar a água da chuva', 'Cisterna para regar e dar descarga.'],
            ] as const
          ).map(([key, title, hint]) => (
            <SwitchField key={key} label={title} description={hint} checked={a[key]} onChange={(v) => patch({ [key]: v })} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
