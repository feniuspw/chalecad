'use client';
import { Eye, Info } from 'lucide-react';
import { useEditor } from '@/lib/store/editor';
import { HEAT, HEAT_LEGEND } from '@/lib/three/heatmap';
import { EXPLODE_LABELS, EXPLODE_ORDER } from '@/lib/three/views';
import { GROUP_COLORS, GROUP_LABELS, GROUP_ORDER, WOOD_GROUP_COLORS, WOOD_GROUP_LABELS } from '@/lib/three/skeleton';
import { useSceneInfo } from './sceneInfo';

const chip = 'rounded-lg border border-border bg-white/90 px-2.5 py-1.5 text-[11px] text-stone-600 shadow-float backdrop-blur';

function Legend() {
  const mode = useEditor((s) => s.viewMode);
  const wood = useEditor((s) => s.project.system.structure === 'wood');
  const colors = wood ? WOOD_GROUP_COLORS : GROUP_COLORS;
  const labels = wood ? WOOD_GROUP_LABELS : GROUP_LABELS;
  if (mode === 'skeleton' || mode === 'exploded') {
    return (
      <div className={`${chip}`} aria-label="Legenda do esqueleto">
        <div className="mb-1 font-medium text-stone-800">{mode === 'exploded' ? 'Explodido · cor por função' : 'Estrutura · cor por função'}</div>
        <ul className="space-y-0.5">
          {GROUP_ORDER.map((g) => (
            <li key={g} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: colors[g] }} />
              {labels[g]}
            </li>
          ))}
        </ul>
        {mode === 'exploded' ? (
          <div className="mt-1.5 border-t border-border pt-1 text-stone-500">Camadas de baixo para cima: {EXPLODE_ORDER.map((l) => EXPLODE_LABELS[l]).join(' · ')}</div>
        ) : null}
      </div>
    );
  }
  if (mode === 'heatmap') {
    return (
      <div className={`${chip}`} aria-label="Legenda do mapa de calor">
        <div className="mb-1 font-medium text-stone-800">Taxa de uso (verificação estrutural)</div>
        <ul className="space-y-0.5">
          {HEAT_LEGEND.map((l) => (
            <li key={l.level} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-black/10" style={{ background: HEAT[l.level] }} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

/** Overlays HTML da cena (legenda, avisos, dicas, tooltip). Posicionados sobre o viewport; não capturam o mouse. */
export function SceneOverlays() {
  const notice = useSceneInfo((s) => s.notice);
  const hint = useSceneInfo((s) => s.hint);
  const tooltip = useSceneInfo((s) => s.tooltip);
  const pathDraw = useSceneInfo((s) => s.pathDraw);
  return (
    <>
      <div className="pointer-events-none absolute top-14 left-3 flex flex-col items-start gap-2">
        <Legend />
        {notice ? (
          <div className={`${chip} flex items-center gap-1.5 border-amber-300 bg-amber-50/95 text-amber-800`} role="status">
            <Eye className="size-3.5" /> {notice}
          </div>
        ) : null}
        {pathDraw ? (
          <div className={`${chip} flex items-center gap-1.5 border-amber-300 bg-amber-50/95 text-amber-800`} role="status">
            <Info className="size-3.5" /> Desenhando caminho em planta
          </div>
        ) : null}
      </div>
      {hint ? (
        <div className="pointer-events-none absolute bottom-14 left-1/2 w-max max-w-[80%] -translate-x-1/2 rounded-full bg-stone-900/85 px-3.5 py-1.5 text-center text-xs text-white shadow-float backdrop-blur" role="status">
          {hint}
        </div>
      ) : null}
      {tooltip ? (
        <div className="pointer-events-none fixed z-50 max-w-64 rounded-md border border-border bg-white px-2.5 py-1.5 text-[11px] text-stone-600 shadow-float" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="font-medium text-stone-900">{tooltip.title}</div>
          {tooltip.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}
    </>
  );
}
