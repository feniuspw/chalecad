'use client';
import { brl } from '@/lib/pdf/format';
import type { FinishOption } from '@/lib/project/rooms';
import { SelectField, type Option } from './fields';

const NONE = '__none';

/** Escolha de acabamento do catálogo com preço por m² da base do projeto; permite "sem …". */
export function FinishSelect({
  label,
  value,
  options,
  noneLabel,
  hint,
  onChange,
  disabled,
}: {
  label: string;
  value: string | undefined;
  options: FinishOption[];
  noneLabel: string;
  hint?: string;
  onChange: (id: string | undefined) => void;
  disabled?: boolean;
}) {
  const opts: Option<string>[] = [
    { value: NONE, label: noneLabel },
    ...options.map((o) => ({ value: o.id, label: o.name.replace(/\s*\(.*\)\s*$/, ''), hint: o.price !== null ? `${brl(o.price)}/m²` : 'sem preço' })),
  ];
  // valor que não está no catálogo (projeto antigo) continua visível
  if (value && !options.some((o) => o.id === value)) opts.push({ value, label: value });
  return (
    <SelectField
      label={label}
      value={value ?? NONE}
      options={opts}
      disabled={disabled}
      hint={hint}
      onChange={(v) => onChange(v === NONE ? undefined : v)}
    />
  );
}
