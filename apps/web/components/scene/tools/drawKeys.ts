'use client';
import { useEffect, useRef, useState } from 'react';
import { parseMeasure, TYPED_CHARS, type TypedMeasure } from '@/lib/tools/measureInput';
import { isTypingTarget } from './hooks';

export interface DrawKeysOptions {
  /** Só captura teclas com a sessão de desenho ativa (primeiro ponto já definido). */
  enabled: boolean;
  /** Enter com medida válida digitada. */
  onCommit: (m: TypedMeasure) => void;
  /** Esc sem nada digitado; devolva true se consumiu. */
  onEscape?: () => boolean;
  /** Enter sem nada digitado; devolva true se consumiu. */
  onEnter?: () => boolean;
}

/**
 * Campo de medida digitada (captura as teclas antes dos atalhos globais): dígitos, vírgula/ponto, `;` e `x`.
 * Backspace apaga; Esc limpa o campo (e só depois cancela o desenho); Enter confirma.
 */
export function useDrawKeys(o: DrawKeysOptions): { typed: string; invalid: boolean } {
  const [typed, setTyped] = useState('');
  const [invalid, setInvalid] = useState(false);
  const buf = useRef('');
  const opts = useRef(o);
  opts.current = o;

  const set = (v: string) => {
    buf.current = v;
    setTyped(v);
    setInvalid(false);
  };

  useEffect(() => {
    if (!o.enabled) {
      buf.current = '';
      setTyped('');
      setInvalid(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const eat = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      const b = buf.current;
      if (e.key === 'Escape') {
        if (b) {
          eat();
          set('');
        } else if (opts.current.onEscape?.()) eat();
        return;
      }
      if (e.key === 'Enter') {
        if (b) {
          eat();
          const m = parseMeasure(b);
          if (!m) {
            setInvalid(true);
            return;
          }
          set('');
          opts.current.onCommit(m);
        } else if (opts.current.onEnter?.()) eat();
        return;
      }
      if (e.key === 'Backspace') {
        if (b) {
          eat();
          set(b.slice(0, -1));
        }
        return;
      }
      if (e.key.length !== 1 || !TYPED_CHARS.test(e.key) || e.shiftKey) return;
      const k = e.key.toLowerCase();
      // 'x' só depois de um número; '-' só depois do ';' (ângulo negativo); '.', ',' e ';' não se repetem de forma absurda
      if (k === 'x' && (!/\d$/.test(b) || /[x;]/.test(b))) return;
      if (k === '*' || k === '×') return;
      if (k === '-' && !b.endsWith(';')) return;
      if (k === ';' && (!/\d$/.test(b) || /[x;]/.test(b))) return;
      eat();
      set(b + k);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [o.enabled]);

  return { typed, invalid };
}
