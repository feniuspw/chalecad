import type { ReactNode } from 'react';
import { Armchair, Ban, BedDouble, Bath, CircleHelp, Coins, DoorClosed, Droplets, Home, KeyRound, LayoutPanelLeft, Sofa, ShowerHead, Sun, TreePine, Umbrella, WashingMachine, Wrench } from 'lucide-react';
import { AFrameIllustration, FlatRoofIllustration, GableIllustration, GambrelIllustration, ShedIllustration } from '../editor/TypologyIllustrations';

const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', fill: 'none' } as const;

function Art({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 120 80" role="img" aria-hidden className="h-full w-full">
      <line x1="6" y1="70" x2="114" y2="70" {...stroke} className="text-stone-300" />
      {children}
    </svg>
  );
}

/** A-frame com cômodos encostados nas laterais (um ou dois lados). */
const Wings = ({ sides }: { sides: 1 | 2 }) => (
  <Art>
    <path d="M60 12L36 70h48L60 12z" {...stroke} className="text-accent" />
    <path d="M36 70V50l-18 4v16" {...stroke} className="text-stone-500" />
    {sides === 2 ? <path d="M84 70V50l18 4v16" {...stroke} className="text-stone-500" /> : null}
  </Art>
);

const Deck = ({ roof }: { roof: boolean }) => (
  <Art>
    <path d="M30 70V40h60v30" {...stroke} className="text-stone-700" />
    <path d="M10 62h40M14 62v8M46 62v8" {...stroke} className="text-amber-700" />
    {roof ? <path d="M6 44l24-8h24l-4 8z" {...stroke} className="text-accent" /> : null}
  </Art>
);

const Slope = ({ pct }: { pct: 0 | 1 | 2 }) => (
  <Art>
    <path d={pct === 0 ? 'M6 60h108' : pct === 1 ? 'M6 48L114 62' : 'M6 28L114 66'} {...stroke} className="text-stone-500" />
    <path d={pct === 0 ? 'M44 60V42h32v18M40 43l20-12 20 12' : pct === 1 ? 'M46 54V38h30v18M42 39l19-11 19 11' : 'M46 49V34h26v15M42 35l17-10 17 10'} {...stroke} className="text-stone-700" />
  </Art>
);

const Tower = () => (
  <Art>
    <path d="M30 70V42h40v28" {...stroke} className="text-stone-700" />
    <path d="M24 44l26-14 26 14" {...stroke} className="text-accent" />
    <path d="M78 70V22h16v48M76 24l10-8 10 8" {...stroke} className="text-sky-600" />
    <circle cx="86" cy="36" r="4" {...stroke} className="text-sky-500" />
  </Art>
);

const Wall = ({ open }: { open: boolean }) => (
  <Art>
    <path d="M20 16h80v54H20z" {...stroke} className="text-stone-600" />
    {open ? <path d="M30 56h22M60 56h30" {...stroke} strokeDasharray="3 4" className="text-stone-400" /> : <path d="M64 16v54" {...stroke} className="text-stone-600" />}
    {open ? null : <path d="M64 44h-12" {...stroke} className="text-accent" />}
  </Art>
);

const lucide = (C: typeof Home) => <C className="size-9" aria-hidden />;

export function OptionIcon({ name }: { name: string }) {
  switch (name) {
    case 'aframe':
      return <AFrameIllustration />;
    case 'gable':
      return <GableIllustration />;
    case 'gambrel':
      return <GambrelIllustration />;
    case 'shed':
      return (
        <div className="grid h-full w-full grid-cols-2 gap-1">
          <ShedIllustration />
          <FlatRoofIllustration />
        </div>
      );
    case 'wing1':
      return <Wings sides={1} />;
    case 'wing2':
      return <Wings sides={2} />;
    case 'deck':
      return <Deck roof={false} />;
    case 'deckRoof':
      return <Deck roof />;
    case 'flat':
      return <Slope pct={0} />;
    case 'gentle':
      return <Slope pct={1} />;
    case 'steep':
      return <Slope pct={2} />;
    case 'tower':
      return <Tower />;
    case 'open':
      return <Wall open />;
    case 'closed':
      return <Wall open={false} />;
    case 'sun':
      return lucide(Sun as typeof Home);
    case 'home':
      return lucide(Home);
    case 'key':
      return lucide(KeyRound as typeof Home);
    case 'bed':
      return lucide(BedDouble as typeof Home);
    case 'sofa':
      return lucide(Sofa as typeof Home);
    case 'bath':
      return lucide(Bath as typeof Home);
    case 'bath2':
      return (
        <div className="flex gap-1">
          <Bath className="size-9" aria-hidden />
          <ShowerHead className="size-9" aria-hidden />
        </div>
      );
    case 'washer':
      return lucide(WashingMachine as typeof Home);
    case 'porch':
      return lucide(Umbrella as typeof Home);
    case 'steel':
      return lucide(Wrench as typeof Home);
    case 'wood':
      return lucide(TreePine as typeof Home);
    case 'coin':
      return lucide(Coins as typeof Home);
    case 'no':
      return lucide(Ban as typeof Home);
    case 'water':
      return lucide(Droplets as typeof Home);
    case 'layout':
      return lucide(LayoutPanelLeft as typeof Home);
    case 'door':
      return lucide(DoorClosed as typeof Home);
    case 'chair':
      return lucide(Armchair as typeof Home);
    default:
      return lucide(CircleHelp as typeof Home);
  }
}
