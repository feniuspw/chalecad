'use client';
import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from './cn';

export const TooltipProvider = ({ delayDuration = 250, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
);
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex items-center gap-2 rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-stone-50 shadow-lg animate-in fade-in-0 zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
