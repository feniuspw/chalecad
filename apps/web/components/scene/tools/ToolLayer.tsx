'use client';
import { useEffect } from 'react';
import type { BuildingModel } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { useElecMode } from '@/lib/elec/mode';
import { ElecTools } from './elec/ElecTools';
import { useToolEnv } from './env';
import { useHint } from './hooks';
import { FurnitureKeys, FurnitureTool } from './FurnitureTool';
import { MeasureTool } from './MeasureTool';
import { MezzanineTool } from './MezzanineTool';
import { OpeningTool } from './OpeningTool';
import { RectTool } from './RectTool';
import { RoomTool } from './RoomTool';
import { SelectOverlays } from './SelectOverlays';
import { StairTool } from './StairTool';
import { TerrainPadTool } from './terrain/TerrainPadTool';
import { WallTool } from './WallTool';
import { PlumbToolLayer } from './plumb/PlumbTools';
import { usePlumb } from '@/lib/plumb/store';

function PlanOnlyHint({ text }: { text: string }) {
  useHint(text);
  return null;
}

/** Ferramenta de planta ativa. Fora de 3D/planta (fachadas) avisa em vez de desenhar. */
export function ToolLayer({ model }: { model: BuildingModel }) {
  const tool = useEditor((s) => s.tool);
  const plumbTool = usePlumb((s) => s.tool);
  const view = useEditor((s) => s.cameraView);
  const env = useToolEnv(model);
  const elecMode = useElecMode();
  const drawable = view === '3d' || view === 'plan';

  useEffect(() => {
    // "Cota": as cotas automáticas aparecem na planta.
    if ((tool === 'dimension' || tool === 'terrain') && view !== 'plan') useEditor.getState().setCameraView('plan');
  }, [tool, view]);

  // Hidráulica: a ferramenta do tubo, ponto ou caixa ocupa o lugar da seleção
  if (plumbTool && tool === 'select') return view === 'plan' ? <PlumbToolLayer env={env} /> : <PlanOnlyHint text="Abra a Planta para desenhar a hidráulica" />;
  if (tool === 'select' && elecMode) return <ElecTools model={model} />;
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
    case 'rect':
      return <RectTool env={env} />;
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
    case 'terrain':
      return <TerrainPadTool env={env} />;
    default:
      return null;
  }
}
