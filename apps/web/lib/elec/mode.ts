'use client';
import { useEditor } from '@/lib/store/editor';
import { useElecUi } from './ui';

/** Camada Elétrica editável: ligada, na vista Planta, com instalações habilitadas e fora da apresentação. */
export function useElecMode(): boolean {
  const layer = useElecUi((s) => s.layerOn);
  const plan = useEditor((s) => s.cameraView === 'plan' && s.viewMode !== 'presentation');
  const enabled = useEditor((s) => s.project.installations.enabled);
  return layer && plan && enabled;
}
