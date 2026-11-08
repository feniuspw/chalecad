'use client';
import { useMemo } from 'react';
import { Badge, cn } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import { getCatalog, getPriceBook } from '@chalecad/catalog';
import { formatBRLRange } from '@/lib/format';
import { fmt } from '@/lib/project/format';
import { furnitureTotals } from '@/lib/project/furniture';
import { furniturePrice } from '@/lib/project/furnitureInfo';
import { finishOptions, ROOF_COLORS, ROOM_USES, roomDisplayName, setFinish } from '@/lib/project/rooms';
import { useEditor } from '@/lib/store/editor';
import { Field, Notice, Section, SwitchField } from './fields';
import { FinishSelect } from './FinishSelect';
import { usePanelUi } from './ui-state';

/** Acabamentos gerais: fachada, forro das águas (A-frame), cor da telha e a lista de cômodos. */
export function FinishesSection({ project }: { project: Project }) {
  const open = usePanelUi((s) => s.open.finishes);
  const setOpen = usePanelUi((s) => s.setOpen);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const setHover = useEditor((s) => s.setHover);
  const modelRooms = useEditor((s) => s.results?.model.rooms);
  const facades = useMemo(() => finishOptions(project, 'finish_facade_'), [project]);
  const ceilings = useMemo(() => finishOptions(project, 'finish_ceiling_'), [project]);
  const { finishes, rooms } = project;
  const aFrame = project.typology.kind === 'a_frame';
  const totals = useMemo(() => {
    let book = null;
    try {
      book = getPriceBook(getCatalog(), project.priceBookId);
    } catch {
      // base inexistente: sem preço
    }
    return furnitureTotals(project, (item) => furniturePrice(item, getCatalog(), book, project.priceOverrides));
  }, [project]);

  return (
    <Section title="Acabamentos" open={open} onOpenChange={setOpen.bind(null, 'finishes')} badge={<Badge variant="neutral">{rooms.length === 0 ? 'sem cômodos' : `${rooms.length} cômodo${rooms.length > 1 ? 's' : ''}`}</Badge>}>
      <FinishSelect label="Fachada" value={finishes.facade} options={facades} noneLabel="Sem revestimento" onChange={(v) => update('Mudar fachada', (d) => setFinish(d, 'facade', v))} />
      {aFrame ? (
        <FinishSelect label="Forro das águas" value={finishes.interiorRoof} options={ceilings} noneLabel="Sem forro" onChange={(v) => update('Mudar forro das águas', (d) => setFinish(d, 'interiorRoof', v))} />
      ) : null}

      <Field label="Cor da telha" hint={ROOF_COLORS.find((c) => c.id === (finishes.roofColor ?? 'graphite'))?.label}>
        <div role="radiogroup" aria-label="Cor da telha" className="flex gap-2">
          {ROOF_COLORS.map((c) => {
            const active = (finishes.roofColor ?? 'graphite') === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={c.label}
                title={c.label}
                onClick={() => update('Mudar cor da telha', (d) => setFinish(d, 'roofColor', c.id === 'graphite' ? undefined : c.id))}
                className={cn('size-7 rounded-full border border-stone-300 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50', active && 'ring-2 ring-accent ring-offset-2')}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </Field>

      <div className="space-y-1.5">
        <SwitchField
          label="Incluir móveis no orçamento"
          description={totals.count === 0 ? 'Nenhum móvel no projeto ainda (ferramenta Móveis, F)' : `${totals.count} ${totals.count === 1 ? 'móvel' : 'móveis'} · ${formatBRLRange(totals.min, totals.max)}`}
          checked={project.budget.includeFurniture}
          onChange={(v) => update('Móveis no orçamento', (d) => void (d.budget.includeFurniture = v))}
        />
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Cômodos</h4>
        {rooms.length === 0 ? (
          <Notice>Use a ferramenta Cômodo (A) e clique dentro de um ambiente fechado para marcar sala, cozinha, quarto ou banheiro. Piso e paredes entram no orçamento.</Notice>
        ) : (
          <ul className="space-y-1">
            {rooms.map((r) => {
              const Icon = ROOM_USES[r.use].icon;
              const area = modelRooms?.find((m) => m.id === r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => select({ kind: 'room', id: r.id })}
                    onMouseEnter={() => setHover(r.id)}
                    onMouseLeave={() => setHover(null)}
                    className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-xs outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <Icon className="size-3.5 shrink-0 text-stone-500" />
                    <span className="min-w-0 flex-1 truncate font-medium text-stone-800">{roomDisplayName(project, r)}</span>
                    <span className="text-stone-500 tabular-nums">{area?.polygon ? `${fmt(area.area, 1)} m²` : area ? 'aberto' : '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}
