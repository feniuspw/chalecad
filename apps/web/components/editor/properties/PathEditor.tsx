'use client';
import type { ReactNode } from 'react';
import { Minus, PencilRuler, Plus, RotateCcw } from 'lucide-react';
import { Button, NumberInput } from '@chalecad/ui';
import type { Vec2 } from '@chalecad/engine';
import { addVertex, pathLength, removeVertex, resetPathToPerimeter, setVertex } from '@/lib/project/extras';
import { fmt } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { useExtraTools } from './ui-state';

/**
 * Lista de vértices (x, y em metros; origem no canto frontal-esquerdo da casa). O desenho direto no 3D
 * é ligado pelo orquestrador via `useExtraTools().drawPath`.
 */
function MiniBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md border border-border bg-white text-stone-500 outline-none hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

export function PathEditor({ id, path, closed, perimeterLabel = 'Em volta da casa' }: { id: string; path: Vec2[]; closed: boolean; perimeterLabel?: string }) {
  const update = useEditor((s) => s.update);
  const drawPath = useExtraTools((s) => s.drawPath);
  const length = pathLength(path, closed);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Caminho ({path.length} pontos)</h4>
        <span className="text-[11px] text-stone-500 tabular-nums">{fmt(length, 1)} m</span>
      </div>
      <p className="-mt-1 text-[11px] text-stone-500">Coordenadas em metros: x para a direita, y para o fundo, a partir do canto frontal-esquerdo da casa.</p>
      <ol className="space-y-1.5">
        {path.map((v, i) => (
          <li key={i} className="grid grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-1.5">
            <span className="text-center text-[11px] font-medium text-stone-400 tabular-nums">{i + 1}</span>
            <NumberInput aria-label={`Ponto ${i + 1}, x`} value={v[0]} step={0.1} decimals={2} unit="x" onValueChange={(x) => update('Mover ponto do caminho', (d) => setVertex(d, id, i, [x, v[1]]))} className="h-8 min-w-0" />
            <NumberInput aria-label={`Ponto ${i + 1}, y`} value={v[1]} step={0.1} decimals={2} unit="y" onValueChange={(y) => update('Mover ponto do caminho', (d) => setVertex(d, id, i, [v[0], y]))} className="h-8 min-w-0" />
            <MiniBtn label={`Inserir ponto depois do ${i + 1}`} onClick={() => update('Inserir ponto no caminho', (d) => addVertex(d, id, i))}>
              <Plus />
            </MiniBtn>
            <MiniBtn label={`Remover ponto ${i + 1}`} disabled={path.length <= 2} onClick={() => update('Remover ponto do caminho', (d) => removeVertex(d, id, i))}>
              <Minus />
            </MiniBtn>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="outline" size="sm" className="h-auto min-h-8 py-1.5 whitespace-normal" onClick={() => update('Restaurar caminho', (d) => resetPathToPerimeter(d, id))}>
          <RotateCcw /> {perimeterLabel}
        </Button>
        {drawPath ? (
          <Button variant="outline" size="sm" onClick={() => drawPath(id)}>
            <PencilRuler /> Desenhar no 3D
          </Button>
        ) : null}
      </div>
    </div>
  );
}
