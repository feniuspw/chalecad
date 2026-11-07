'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@chalecad/ui';
import { useSaveStatus } from '@/hooks/useAutosave';
import { formatMs, formatSavedAgo } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';

const chip = 'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs tabular-nums';

/** "Salvando…" / "Salvo há X s" / "Alterações não salvas" / erro de armazenamento. */
export function SaveStatus() {
  const { saving, error } = useSaveStatus();
  const dirty = useEditor((s) => s.dirty);
  const lastSavedAt = useEditor((s) => s.lastSavedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(chip, 'bg-red-50 text-red-700')} role="status">
            <CloudOff className="size-3.5" /> Não salvo
          </span>
        </TooltipTrigger>
        <TooltipContent>Falha ao salvar neste navegador: {error}. Exporte o JSON para não perder o trabalho.</TooltipContent>
      </Tooltip>
    );
  }
  if (saving) {
    return (
      <span className={cn(chip, 'text-stone-500')} role="status">
        <Loader2 className="size-3.5 animate-spin" /> Salvando…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className={cn(chip, 'text-stone-500')} role="status">
        <span className="size-1.5 rounded-full bg-amber-500" /> Alterações pendentes
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className={cn(chip, 'text-stone-500')} role="status">
        <Check className="size-3.5 text-ok" /> {formatSavedAgo(now - lastSavedAt)}
      </span>
    );
  }
  return null;
}

/** Estado do cálculo: calculando, tempo do último cálculo, erro ou projeto inválido. */
export function ComputeStatus() {
  const computing = useEditor((s) => s.computing);
  const stale = useEditor((s) => s.revision !== s.computedRevision);
  const error = useEditor((s) => s.computeError);
  const invalid = useEditor((s) => s.issues.length > 0);
  const results = useEditor((s) => s.results);
  const ms = results?.timingsMs.worker ?? results?.timingsMs.total;

  if (invalid) {
    return (
      <span className={cn(chip, 'bg-red-50 text-red-700')} role="status">
        <AlertTriangle className="size-3.5" /> Projeto inválido
      </span>
    );
  }
  if (error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(chip, 'bg-red-50 text-red-700')} role="status">
            <AlertTriangle className="size-3.5" /> Erro no cálculo
          </span>
        </TooltipTrigger>
        <TooltipContent>{error}</TooltipContent>
      </Tooltip>
    );
  }
  if (computing || (stale && !results)) {
    return (
      <span className={cn(chip, 'text-stone-500')} role="status">
        <Loader2 className="size-3.5 animate-spin" /> Calculando…
      </span>
    );
  }
  if (ms !== undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(chip, 'text-stone-500')} role="status">
            <Zap className="size-3.5 text-accent" /> {formatMs(ms)}
          </span>
        </TooltipTrigger>
        <TooltipContent>Tempo do último cálculo (meta: abaixo de 300 ms)</TooltipContent>
      </Tooltip>
    );
  }
  return null;
}
