'use client';
import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from './cn';

export function Slider({ className, value, defaultValue, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const count = (value ?? defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      className={cn('relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-stone-200">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      {Array.from({ length: count }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block size-4 rounded-full border-2 border-accent bg-white shadow transition-shadow outline-none hover:ring-4 hover:ring-accent/15 focus-visible:ring-4 focus-visible:ring-accent/30"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
