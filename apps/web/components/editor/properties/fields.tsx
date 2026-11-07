'use client';
import { useId, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { NumberInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Switch, cn } from '@chalecad/ui';

export function Section({
  title,
  open,
  onOpenChange,
  badge,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="border-b border-border">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => onOpenChange(!open)}
          className="flex h-10 w-full items-center gap-2 px-4 text-left text-xs font-semibold tracking-wide text-stone-700 uppercase outline-none hover:bg-stone-50 focus-visible:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset"
        >
          <ChevronRight className={cn('size-3.5 text-stone-400 transition-transform', open && 'rotate-90')} />
          <span className="flex-1">{title}</span>
          {badge}
        </button>
      </h3>
      {open ? (
        <div id={id} className="space-y-4 px-4 pt-1 pb-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-stone-700">
          {label}
        </label>
        {hint ? <span className="text-[11px] text-stone-500 tabular-nums">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Multiplica o valor para exibição (ex.: 100 para mostrar cm quando o dado está em m). */
  scale?: number;
  decimals?: number;
  hint?: ReactNode;
  disabled?: boolean;
  /** `coalesce` = true enquanto arrasta o slider (funde no histórico); false para valor digitado. */
  onChange: (value: number, coalesce: boolean) => void;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

/** Slider + campo numérico com unidade, sincronizados. Valores em unidades do projeto; `scale` só afeta a exibição. */
export function SliderField({ label, value, min, max, step = 0.1, unit, scale = 1, decimals, hint, disabled, onChange }: SliderFieldProps) {
  const id = useId();
  const dStep = step * scale;
  const dec = decimals ?? Math.max(0, String(dStep).includes('.') ? String(dStep).split('.')[1]!.length : 0);
  const shown = round(value * scale, 6);
  const toModel = (v: number) => round(v / scale, 6);
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-3">
        <Slider
          aria-label={label}
          value={[Math.min(max * scale, Math.max(min * scale, shown))]}
          min={min * scale}
          max={max * scale}
          step={dStep}
          disabled={disabled}
          onValueChange={([v]) => v !== undefined && onChange(toModel(v), true)}
          className="min-w-0 flex-1"
        />
        <NumberInput
          id={id}
          value={shown}
          min={min * scale}
          max={max * scale}
          step={dStep}
          decimals={dec}
          unit={unit}
          disabled={disabled}
          onValueChange={(v) => onChange(toModel(v), false)}
          className="h-8 w-[5.75rem] shrink-0"
        />
      </div>
    </Field>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: ReactNode;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <NumberInput id={id} value={value} min={min} max={max} step={step} unit={unit} disabled={disabled} onValueChange={onChange} className="h-8" />
    </Field>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
  placeholder,
}: {
  label: string;
  value: T | undefined;
  options: Option<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
        <SelectTrigger id={id} className="h-8 text-left text-[13px] [&>span]:truncate">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
              {o.hint ? <span className="ml-2 text-xs text-stone-400">{o.hint}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-xs font-medium text-stone-700">{label}</span>
        {description ? <span className="block text-[11px] text-stone-500">{description}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Escolha entre poucas opções, lado a lado (ex.: 40 | 60 cm). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-stone-100 p-0.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className="h-7 rounded-md px-2 text-xs font-medium text-stone-600 transition-colors outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 aria-pressed:bg-white aria-pressed:text-stone-900 aria-pressed:shadow-sm"
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'fail'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-md border px-2.5 py-2 text-xs leading-snug',
        tone === 'info' && 'border-stone-200 bg-stone-50 text-stone-600',
        tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-800',
        tone === 'fail' && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      {children}
    </p>
  );
}
