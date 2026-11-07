import type { ReactNode } from 'react';

const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', fill: 'none' } as const;

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 120 80" role="img" aria-hidden className="h-full w-full">
      <line x1="6" y1="70" x2="114" y2="70" {...stroke} className="text-stone-300" />
      {children}
    </svg>
  );
}

/** Duas águas com mezanino: caixa, telhado e linha do pavimento superior. */
export function GableIllustration() {
  return (
    <Frame>
      <path d="M22 70V38h76v32" {...stroke} />
      <path d="M14 40L60 12l46 28" {...stroke} className="text-accent" />
      <path d="M60 38h38" {...stroke} strokeDasharray="3 4" className="text-stone-400" />
      <path d="M26 70V56h10v14" {...stroke} className="text-stone-400" />
      <path d="M52 52h14v10H52z" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

export function AFrameIllustration() {
  return (
    <Frame>
      <path d="M60 10L18 70h84L60 10z" {...stroke} className="text-accent" />
      <path d="M60 34L42 58h36L60 34z" {...stroke} className="text-stone-400" />
      <path d="M54 70V58h12v12" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

/** Meia-água: parede alta na frente (esquerda), uma queda só. */
export function ShedIllustration() {
  return (
    <Frame>
      <path d="M22 70V28l76 18v24" {...stroke} />
      <path d="M16 30l88 20" {...stroke} className="text-accent" />
      <path d="M30 70V56h10v14" {...stroke} className="text-stone-400" />
      <path d="M58 52h16v10H58z" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

/** Telhado plano: platibanda em volta da cobertura. */
export function FlatRoofIllustration() {
  return (
    <Frame>
      <path d="M22 70V30h76v40" {...stroke} />
      <path d="M18 30h84M22 30V24M98 30V24" {...stroke} className="text-accent" />
      <path d="M30 70V56h10v14" {...stroke} className="text-stone-400" />
      <path d="M58 46h16v10H58z" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

/** Gambrel (celeiro): duas inclinações por água. */
export function GambrelIllustration() {
  return (
    <Frame>
      <path d="M26 70V46h68v24" {...stroke} />
      <path d="M18 48l10-2 6-18 26-14 26 14 6 18 10 2" {...stroke} className="text-accent" />
      <path d="M54 70V58h12v12" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

/** L/T: dois volumes de duas águas, o segundo saindo do fundo do primeiro. */
export function CombinedIllustration() {
  return (
    <Frame>
      <path d="M12 70V40h62v30" {...stroke} />
      <path d="M8 42L43 18l35 24" {...stroke} className="text-accent" />
      <path d="M74 70V52h32v18" {...stroke} className="text-stone-400" />
      <path d="M70 54l20-12 20 12" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

/** Planta em L (para o passo de dimensões). */
export function LPlanIllustration() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="h-full w-full">
      <path d="M24 66V14h28v30h44v22z" {...stroke} fill="currentColor" fillOpacity="0.08" className="text-accent" />
      <path d="M24 44h72" {...stroke} className="text-stone-400" strokeDasharray="3 4" />
    </svg>
  );
}

/** Planta em T. */
export function TPlanIllustration() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="h-full w-full">
      <path d="M20 66V44h26V14h28v30h26v22z" {...stroke} fill="currentColor" fillOpacity="0.08" className="text-accent" />
    </svg>
  );
}

export const TYPOLOGY_ART = {
  gable_mezzanine: GableIllustration,
  a_frame: AFrameIllustration,
  shed: ShedIllustration,
  flat_roof: FlatRoofIllustration,
  gambrel: GambrelIllustration,
  combined: CombinedIllustration,
} as const;

/** Terreno plano ou inclinado, com a casa assentada num platô. */
export function TerrainIllustration({ sloped }: { sloped: boolean }) {
  return (
    <svg viewBox="0 0 120 80" role="img" aria-hidden className="h-full w-full">
      {sloped ? (
        <>
          <path d="M6 30L114 66" {...stroke} className="text-stone-400" />
          <path d="M6 30L40 41h40l34 25" {...stroke} className="text-amber-700/70" strokeDasharray="0" />
          <path d="M44 41v-14h30v14M41 27l18-10 18 10" {...stroke} className="text-stone-700" />
          <path d="M40 41h40" {...stroke} className="text-accent" />
        </>
      ) : (
        <>
          <path d="M6 58h108" {...stroke} className="text-stone-400" />
          <path d="M40 58V40h40v18M36 41l24-14 24 14" {...stroke} className="text-stone-700" />
        </>
      )}
    </svg>
  );
}
