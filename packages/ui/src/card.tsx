import * as React from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-xl border border-border bg-white shadow-sm', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-4 pt-4', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-sm font-semibold tracking-tight text-stone-900', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 py-4', className)} {...props} />;
}
