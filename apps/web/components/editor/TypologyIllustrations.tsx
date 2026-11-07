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

export function ShedIllustration() {
  return (
    <Frame>
      <path d="M22 70V34h76v36" {...stroke} />
      <path d="M16 38L104 22" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

export function FlatRoofIllustration() {
  return (
    <Frame>
      <path d="M22 70V30h76v40" {...stroke} />
      <path d="M18 30h84" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

export function GambrelIllustration() {
  return (
    <Frame>
      <path d="M26 70V42h68v28" {...stroke} />
      <path d="M18 42L34 20l26-8 26 8 16 22" {...stroke} className="text-stone-400" />
    </Frame>
  );
}

export function CombinedIllustration() {
  return (
    <Frame>
      <path d="M16 70V36h50v34M66 70V48h40v22" {...stroke} />
      <path d="M12 38L41 18l29 20M62 50l24-14 24 14" {...stroke} className="text-stone-400" />
    </Frame>
  );
}
