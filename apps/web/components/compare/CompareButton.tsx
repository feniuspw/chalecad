'use client';
import { useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { Button } from '@chalecad/ui';
import { CompareDialog } from './CompareDialog';

/** Botão "Comparar" com o diálogo embutido. Encaixe na TopBar, ao lado de Desfazer/Refazer ou do menu Exportar. */
export function CompareButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
        <GitCompareArrows /> Comparar
      </Button>
      <CompareDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
