'use client';
import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from './cn';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex items-center gap-1 rounded-lg bg-stone-100 p-1', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium text-stone-600 outline-none transition-colors hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...props} />;
}
