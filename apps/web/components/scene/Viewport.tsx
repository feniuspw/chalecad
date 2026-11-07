'use client';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { cn } from '@chalecad/ui';
import type { ViewportProps } from './types';
import type { ControlledViewportProps } from './ViewportCanvas';
import { SceneOverlays } from './SceneOverlays';

export type { ViewportHandle, ViewportProps, ViewPreset } from './types';
export { PathDrawer, type PathDrawerProps } from './PathDrawer';
export { SceneOverlays } from './SceneOverlays';

/** O canvas só existe no cliente (WebGL): carregamento dinâmico sem SSR. */
const ViewportCanvas = dynamic(() => import('./ViewportCanvas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-sm text-stone-500">
      <span className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Carregando cena 3D
      </span>
    </div>
  ),
});

export function Viewport({ className, ...props }: ViewportProps & ControlledViewportProps) {
  return (
    <div className={cn('scene-sky relative size-full overflow-hidden', className)}>
      <ViewportCanvas {...props} />
      {props.showcase ? null : <SceneOverlays />}
    </div>
  );
}
