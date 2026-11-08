'use client';
import { useEffect } from 'react';
import type { BuildingModel } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { useToolEnv } from './env';
import { useHint } from './hooks';
import { FurnitureKeys, FurnitureTool } from './FurnitureTool';
import { MeasureTool } from './MeasureTool';
import { MezzanineTool } from './MezzanineTool';
import { OpeningTool } from './OpeningTool';
import { RoomTool } from './RoomTool';
import { SelectOverlays } from './SelectOverlays';
import { StairTool } from './StairTool';
import { WallTool } from './WallTool';

function PlanOnlyHint({ text }: { text: string }) {
  useHint(text);
  return null;
}

/** Ferramenta de planta ativa. Fora de 3D/planta (fachadas) avisa em vez de desenhar. */
export function ToolLayer({ model }: { model: BuildingModel }) {
  const tool = useEditor((s) => s.tool);
  const view = useEditor((s) => s.cameraView);
  const env = useToolEnv(model);
  const drawable = view === '3d' || view === 'plan';

  useEffect(() => {
    // "Cota": as cotas automáticas aparecem na planta.
    if (tool === 'dimension' && view !== 'plan') useEditor.getState().setCameraView('plan');
  }, [tool, view]);

  if (tool === 'select')
    return (
      <>
        <SelectOverlays env={env} view={view} />
        <FurnitureKeys />
      </>
    );
  if (tool === 'dimension') return <PlanOnlyHint text="Cotas automáticas das paredes externas e aberturas na vista Planta" />;
  if (!drawable) return <PlanOnlyHint text="Mude para Planta ou 3D para usar esta ferramenta" />;
  switch (tool) {
    case 'wall':
      return <WallTool env={env} />;
    case 'opening':
      return <OpeningTool env={env} />;
    case 'stair':
      return <StairTool env={env} />;
    case 'mezzanine':
      return <MezzanineTool env={env} />;
    case 'measure':
      return <MeasureTool env={env} />;
    case 'room':
      return <RoomTool env={env} />;
    case 'furniture':
      return <FurnitureTool env={env} />;
    default:
      return null;
  }
}
