import Link from 'next/link';
import { cn } from '@chalecad/ui';

/** Marca: telhado de duas águas em madeira + nome. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7', className)}>
      <rect width="32" height="32" rx="8" fill="#d97706" />
      <path d="M6 17 16 8l10 9" fill="none" stroke="#fffbeb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 15.5V24h13v-8.5" fill="none" stroke="#fffbeb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 24v-5h5v5" fill="none" stroke="#fde68a" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/50', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-stone-900">ChaléCAD</span>
    </Link>
  );
}
