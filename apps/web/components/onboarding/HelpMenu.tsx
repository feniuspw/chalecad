'use client';
import { useState } from 'react';
import { CircleHelp, Compass, Keyboard, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Kbd } from '@chalecad/ui';
import { ArtNotice } from '@/components/ArtNotice';

/** Botão "?" discreto: atalhos, refazer o tour e sobre/aviso de ART. */
export function HelpMenu({ onShortcuts, onTour }: { onShortcuts: () => void; onTour: () => void }) {
  const [about, setAbout] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Ajuda"
            title="Ajuda e atalhos (?)"
            data-tour="help"
            className="grid size-6 place-items-center rounded-full border border-border text-stone-500 outline-none transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <CircleHelp className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem onSelect={onShortcuts}>
            <Keyboard /> Atalhos de teclado <Kbd className="ml-auto">?</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTour}>
            <Compass /> Refazer o tour
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAbout(true)}>
            <ShieldAlert /> Sobre e aviso de ART
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sobre o ChaléCAD</DialogTitle>
            <DialogDescription>Editor paramétrico de chalés em aço leve (LSF) com radier e telha sanduíche: quantitativos, peso, pré-dimensionamento e orçamento.</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-stone-600">Os números são estimativas para decidir e orçar. Antes de construir, o projeto precisa de um responsável técnico, com ART.</p>
          <ArtNotice />
        </DialogContent>
      </Dialog>
    </>
  );
}
