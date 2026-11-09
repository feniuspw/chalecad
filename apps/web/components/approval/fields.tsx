'use client';
import { useId, useState, type ReactNode } from 'react';
import { NumberInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@chalecad/ui';
import { parseDecimal } from '@chalecad/ui';

export const inputCls =
  'h-8 w-full rounded-md border border-border bg-white px-2 text-[13px] text-stone-900 outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:bg-stone-50 disabled:text-stone-400';

/** Rótulo + "por que pedimos" (uma linha) + controle. `fieldKey` permite focar o campo a partir de uma pendência. */
export function Field({ label, why, fieldKey, htmlFor, children, className, warn }: { label: string; why?: string; fieldKey?: string; htmlFor?: string; children: ReactNode; className?: string; warn?: string | null }) {
  return (
    <div data-field={fieldKey} className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-stone-700">
        {label}
      </label>
      {children}
      {warn ? <p className="text-[11px] leading-snug text-amber-700">{warn}</p> : why ? <p className="text-[11px] leading-snug text-stone-500">{why}</p> : null}
    </div>
  );
}

export function TextField({ label, why, fieldKey, value, onChange, placeholder, warn, mask, maxLength, className, type = 'text' }: {
  label: string;
  why?: string;
  fieldKey?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  warn?: string | null;
  mask?: (v: string) => string;
  maxLength?: number;
  className?: string;
  type?: 'text' | 'date';
}) {
  const id = useId();
  return (
    <Field label={label} why={why} fieldKey={fieldKey} htmlFor={id} warn={warn} {...(className ? { className } : {})}>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(mask ? mask(e.target.value) : e.target.value)}
        className={cn(inputCls, warn && 'border-amber-400')}
      />
    </Field>
  );
}

export function AreaField({ label, why, fieldKey, value, onChange, rows = 2 }: { label: string; why?: string; fieldKey?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId();
  return (
    <Field label={label} why={why} fieldKey={fieldKey} htmlFor={id}>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'h-auto py-1.5')} />
    </Field>
  );
}

export function NumField({ label, why, fieldKey, value, onChange, unit, step = 0.1, min, max, decimals }: {
  label: string;
  why?: string;
  fieldKey?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
}) {
  const id = useId();
  return (
    <Field label={label} why={why} fieldKey={fieldKey} htmlFor={id}>
      <NumberInput id={id} aria-label={label} value={value} onValueChange={onChange} {...(unit ? { unit } : {})} step={step} {...(min !== undefined ? { min } : {})} {...(max !== undefined ? { max } : {})} {...(decimals !== undefined ? { decimals } : {})} />
    </Field>
  );
}

/** Número opcional: vazio = não informado (grava `undefined`). */
export function OptNumField({ label, why, fieldKey, value, onChange, unit, min, max }: {
  label: string;
  why?: string;
  fieldKey?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const shown = value === undefined ? '' : String(value).replace('.', ',');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t === '') onChange(undefined);
    else {
      const n = parseDecimal(t);
      if (n !== null) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
    }
    setDraft(null);
  };
  return (
    <Field label={label} why={why} fieldKey={fieldKey} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          value={draft ?? shown}
          placeholder="não informado"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className={cn(inputCls, unit && 'pr-8')}
        />
        {unit ? <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-stone-400">{unit}</span> : null}
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({ label, why, fieldKey, value, onChange, options, className }: {
  label: string;
  why?: string;
  fieldKey?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} why={why} fieldKey={fieldKey} htmlFor={id} {...(className ? { className } : {})}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} aria-label={label} className="h-8 text-left text-[13px] [&>span]:truncate">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function Section({ title, id, note, children }: { title: string; id?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="rounded-lg border border-border bg-white p-4">
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      {note ? <p className="mt-1 text-xs leading-snug text-stone-500">{note}</p> : null}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
