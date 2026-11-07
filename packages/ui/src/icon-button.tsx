'use client';
import * as React from 'react';
import { Button, type ButtonProps } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { Kbd } from './kbd';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children' | 'asChild'> {
  /** Rótulo acessível e texto do tooltip. */
  label: string;
  /** Atalho exibido no tooltip. */
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  active?: boolean;
  children: React.ReactNode;
}

export function IconButton({ label, shortcut, side = 'bottom', active, variant = 'ghost', children, ...props }: IconButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={variant} size="icon" aria-label={label} data-active={active} aria-pressed={active} {...props}>
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
