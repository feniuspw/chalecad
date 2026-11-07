'use client';
import * as React from 'react';
import { cn } from './cn';
import { clampNumber, formatDecimal, parseDecimal, snapToStep } from './number-parse';

export interface NumberInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step'> {
  value: number;
  /** Chamado ao confirmar (blur ou Enter) e nas setas ↑/↓. */
  onValueChange: (value: number) => void;
  /** Sufixo de unidade, ex.: "m", "°", "cm". */
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Casas decimais exibidas e gravadas (padrão: deduzidas do step). */
  decimals?: number;
}

function decimalsOf(step: number) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function NumberInput({
  value,
  onValueChange,
  unit,
  step = 0.1,
  min,
  max,
  decimals,
  className,
  disabled,
  onBlur,
  onKeyDown,
  onFocus,
  ...props
}: NumberInputProps) {
  const dec = decimals ?? Math.max(decimalsOf(step), 2);
  const [text, setText] = React.useState(() => formatDecimal(value, dec));
  const [editing, setEditing] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);

  // Sincroniza com o valor externo quando o usuário não está digitando.
  React.useEffect(() => {
    if (!editing) setText(formatDecimal(value, dec));
  }, [value, dec, editing]);

  const commit = React.useCallback(
    (raw: string) => {
      const parsed = parseDecimal(raw);
      if (parsed === null) {
        setInvalid(false);
        setText(formatDecimal(value, dec));
        return;
      }
      const next = clampNumber(Number(parsed.toFixed(dec)), min, max);
      setInvalid(false);
      setText(formatDecimal(next, dec));
      if (next !== value) onValueChange(next);
    },
    [value, dec, min, max, onValueChange],
  );

  const bump = (dir: 1 | -1, mult: number) => {
    const next = clampNumber(snapToStep(value + dir * step * mult, step, dec), min, max);
    setText(formatDecimal(next, dec));
    if (next !== value) onValueChange(next);
  };

  return (
    <div
      className={cn(
        'flex h-9 w-full items-center rounded-md border bg-white shadow-sm transition-colors focus-within:ring-2',
        invalid ? 'border-fail focus-within:ring-fail/30' : 'border-border hover:border-stone-300 focus-within:ring-accent/50',
        disabled && 'opacity-50',
        className,
      )}
    >
      <input
        {...props}
        disabled={disabled}
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(e.target.value.trim() !== '' && parseDecimal(e.target.value) === null);
        }}
        onBlur={(e) => {
          setEditing(false);
          commit(e.target.value);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            e.currentTarget.select();
          } else if (e.key === 'Escape') {
            setText(formatDecimal(value, dec));
            setInvalid(false);
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
          }
          onKeyDown?.(e);
        }}
        className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-sm text-stone-900 tabular-nums outline-none"
      />
      {unit ? <span className="pr-3 text-xs font-medium text-stone-500 select-none">{unit}</span> : null}
    </div>
  );
}
