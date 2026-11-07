import { TriangleAlert } from 'lucide-react';
import { DISCLAIMER } from '@chalecad/engine';
import { cn } from '@chalecad/ui';

/** Aviso fixo: o resultado não substitui projeto estrutural com ART. */
export function ArtNotice({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-stone-500', className)}>
      <TriangleAlert className="size-3.5 shrink-0 text-warn" aria-hidden />
      <span>{DISCLAIMER}</span>
    </p>
  );
}
