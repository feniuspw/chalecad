'use client';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@chalecad/ui';

/** Explicações curtas de termos técnicos, para leigos. */
export const GLOSSARY: Record<string, string> = {
  'steel frame': 'Estrutura de perfis de aço galvanizado (finos e leves) que forma o esqueleto das paredes e do telhado. Também chamado LSF.',
  'wood frame': 'Esqueleto de paredes e telhado feito com madeira tratada (pinus), como nas casas de madeira americanas.',
  mezanino: 'Um andar parcial no alto, que ocupa só parte da casa e deixa o resto com pé-direito alto.',
  radier: 'Laje de concreto armado que serve de fundação e de piso ao mesmo tempo. É a base mais usada em chalés leves.',
  'pé-direito': 'Altura do chão até o teto.',
  'zona bioclimática': 'Classificação do clima da região (1 a 8). Define o isolamento térmico que a casa precisa.',
  'caixa d\'água': 'Reservatório que abastece a casa. Precisa ficar mais alto que o chuveiro para a água ter pressão.',
  arrimo: 'Muro que segura a terra de um corte no terreno inclinado.',
  'telha sanduíche': 'Telha de duas chapas de aço com isolante no meio. Isola o calor e o barulho da chuva.',
};

export function Term({ children, term }: { children: ReactNode; term: keyof typeof GLOSSARY | string }) {
  const hint = GLOSSARY[String(term).toLowerCase()];
  if (!hint) return <>{children}</>;
  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs leading-snug">{hint}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
