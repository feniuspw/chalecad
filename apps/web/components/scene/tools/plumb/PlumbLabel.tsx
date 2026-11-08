'use client';
import type { ReactNode } from 'react';
import { SafeHtml } from '../../SafeHtml';

/** Rótulo HTML colorido da hidráulica, ancorado num ponto do plano (deslocamento em px, nunca captura o mouse). */
export function PlumbLabel({ position, color, children, dx = 0, dy = 0, solid = false, testId }: { position: [number, number, number]; color: string; children: ReactNode; dx?: number; dy?: number; solid?: boolean; testId?: string }) {
  return (
    <SafeHtml position={position} center zIndexRange={[24, 0]} style={{ pointerEvents: 'none', transform: `translate(${dx}px, ${dy}px)` }}>
      <span
        data-testid={testId}
        className="block rounded border px-1 py-px text-[10px] leading-[14px] font-semibold whitespace-nowrap tabular-nums shadow-sm select-none"
        style={solid ? { background: color, borderColor: color, color: '#fff' } : { background: 'rgba(255,255,255,0.92)', borderColor: color, color }}
      >
        {children}
      </span>
    </SafeHtml>
  );
}

/** Selo de pressão do ponto de água: verde quando atende, vermelho quando não, com "faltam X m". */
export function PressureSeal({ position, ok, value, name, missing, dx, dy, pointId }: { position: [number, number, number]; ok: boolean; value: string; name: string; missing: string | null; dx: number; dy: number; pointId: string }) {
  const color = ok ? '#15803d' : '#dc2626';
  return (
    <SafeHtml position={position} center zIndexRange={[26, 0]} style={{ pointerEvents: 'none', transform: `translate(${dx}px, ${dy}px)` }}>
      <span
        data-testid="pressure-seal"
        data-point={pointId}
        data-ok={ok ? '1' : '0'}
        className="block rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-[13px] whitespace-nowrap tabular-nums shadow-md select-none"
        style={{ background: ok ? '#f0fdf4' : '#fef2f2', borderColor: color, color }}
      >
        <span className="block font-bold">{value}</span>
        <span className="block font-medium opacity-90">
          {name}
          {missing ? <b> · {missing}</b> : null}
        </span>
      </span>
    </SafeHtml>
  );
}
