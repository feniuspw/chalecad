import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
  {
    variants: {
      variant: {
        neutral: 'border-stone-200 bg-stone-100 text-stone-700',
        ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warn: 'border-amber-200 bg-amber-50 text-amber-700',
        fail: 'border-red-200 bg-red-50 text-red-700',
        accent: 'border-amber-300 bg-accent-soft text-accent-hover',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
