'use client';
import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from './cn';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent bg-stone-300 shadow-inner transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50 data-[state=checked]:bg-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}
