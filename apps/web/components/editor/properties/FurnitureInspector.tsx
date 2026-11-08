'use client';
import { useMemo } from 'react';
import { Copy, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { getCatalog, getPriceBook } from '@chalecad/catalog';
import type { EngineWarning, Project } from '@chalecad/engine';
import { Button, cn } from '@chalecad/ui';
import { GROUP_LABELS, sizeLabel } from '@/components/editor/furniture/FurnitureLibrary';
import { FurnitureThumb } from '@/components/editor/furniture/FurnitureThumb';
import { formatBRLRange } from '@/lib/format';
import { duplicateFurniture, patchFurniture, rotateFurniture, setFurnitureRotation, specOf } from '@/lib/project/furniture';
import { furniturePrice } from '@/lib/project/furnitureInfo';
import { roomDisplayName } from '@/lib/project/rooms';
import { useEditor, type SelectedObject } from '@/lib/store/editor';
import { TONES, type Tone } from '@/lib/three/furniture/materials';
import { Field, NumberField, Notice, SelectField } from './fields';
import { Body, Header, Row, useDelete } from './inspector-parts';

type FurnitureObj = Extract<SelectedObject, { kind: 'furniture' }>;

const SEVERITY: Record<EngineWarning['severity'], 'info' | 'warn' | 'fail'> = { info: 'info', warn: 'warn', error: 'fail' };

/** Alertas `furniture.*` que citam este móvel. */
export function furnitureWarnings(warnings: EngineWarning[] | undefined, id: string): EngineWarning[] {
  return (warnings ?? []).filter((w) => w.code.startsWith('furniture.') && w.refs?.includes(id));
}

export function FurnitureInspector({ obj, project }: { obj: FurnitureObj; project: Project }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const select = useEditor((s) => s.select);
  const warnings = useEditor((s) => s.results?.warnings);
  const remove = useDelete();
  const catalog = getCatalog();
  const { furniture: f, resolved } = obj;
  const spec = specOf(catalog, f.item);
  const alerts = useMemo(() => furnitureWarnings(warnings, f.id), [warnings, f.id]);
  const book = useMemo(() => {
    try {
      return getPriceBook(catalog, project.priceBookId);
    } catch {
      return null;
    }
  }, [catalog, project.priceBookId]);

  if (!spec) {
    return (
      <>
        <Header title="Móvel" subtitle={f.item} onDelete={remove} />
        <Body>
          <Notice tone="warn">Este item não existe mais no catálogo. Troque por outro ou remova.</Notice>
        </Body>
      </>
    );
  }

  const room = resolved?.roomId ? project.rooms.find((r) => r.id === resolved.roomId) : undefined;
  const price = furniturePrice(spec.id, catalog, book, project.priceOverrides);
  const sameGroup = catalog.furniture.filter((x) => x.group === spec.group).map((x) => ({ value: x.id, label: x.name, hint: sizeLabel(x) }));
  const tone = (f.tone ?? 'default') as Tone | 'default';

  return (
    <>
      <Header title={spec.name} subtitle={`${GROUP_LABELS[spec.group]}${room ? ` · ${roomDisplayName(project, room)}` : ''}`} />
      <Body>
        <div className="grid place-items-center rounded-lg border border-border bg-stone-50 py-3">
          <FurnitureThumb spec={spec} size={84} />
        </div>

        <SelectField label="Item" value={spec.id} options={sameGroup} onChange={(item) => update('Trocar móvel', (d) => void patchFurniture(d, f.id, { item }))} />

        <dl className="divide-y divide-border rounded-md border border-border px-2.5">
          <Row label="Medidas (L × P × A)" value={`${sizeLabel(spec).replace(' m', '')} × ${spec.size.h.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`} />
          <Row label="Preço de referência" value={price ? formatBRLRange(price.min, price.max) : '—'} />
          <Row label="Cômodo" value={room ? roomDisplayName(project, room) : resolved ? 'Fora de cômodo marcado' : '—'} />
        </dl>

        <Field label="Rotação" hint={`${f.rotation}°`}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" aria-label="Girar 90° no sentido anti-horário" onClick={() => update('Girar móvel', (d) => void rotateFurniture(d, f.id, 90))}>
              <RotateCcw /> 90°
            </Button>
            <Button variant="outline" size="sm" aria-label="Girar 90° no sentido horário" onClick={() => update('Girar móvel', (d) => void rotateFurniture(d, f.id, -90))}>
              <RotateCw /> 90°
            </Button>
          </div>
        </Field>
        <NumberField label="Ângulo livre" value={f.rotation} min={-180} max={180} step={5} unit="°" onChange={(v) => updateCoalesced('Girar móvel', (d) => void setFurnitureRotation(d, f.id, v))} />

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Posição x" value={f.position[0]} step={0.05} unit="m" onChange={(v) => updateCoalesced('Mover móvel', (d) => void patchFurniture(d, f.id, { position: [v, f.position[1]] }))} />
          <NumberField label="Posição y" value={f.position[1]} step={0.05} unit="m" onChange={(v) => updateCoalesced('Mover móvel', (d) => void patchFurniture(d, f.id, { position: [f.position[0], v] }))} />
        </div>

        <Field label="Acabamento" hint={TONES.find((t) => t.id === tone)?.label}>
          <div role="radiogroup" aria-label="Acabamento" className="flex gap-2">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tone === t.id}
                aria-label={t.label}
                title={t.label}
                onClick={() => update('Mudar acabamento do móvel', (d) => void patchFurniture(d, f.id, { tone: t.id === 'default' ? undefined : t.id }))}
                className={cn('size-7 rounded-full border border-stone-300 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50', tone === t.id && 'ring-2 ring-accent ring-offset-2')}
                style={{ backgroundColor: t.hex }}
              />
            ))}
          </div>
        </Field>

        {alerts.length > 0 ? (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Alertas ({alerts.length})</h3>
            {alerts.map((a, i) => (
              <Notice key={`${a.code}-${i}`} tone={SEVERITY[a.severity]}>
                {a.message}
              </Notice>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const box: { id: string | null } = { id: null };
              update('Duplicar móvel', (d) => {
                box.id = duplicateFurniture(d, f.id);
              });
              if (box.id) select({ kind: 'furniture', id: box.id });
            }}
          >
            <Copy /> Duplicar
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-fail hover:text-red-700" onClick={remove}>
            <Trash2 /> Remover
          </Button>
        </div>
        <p className="text-[11px] text-stone-500">Arraste no piso para mover (Alt = sem encaixe). R gira 90°, Ctrl/⌘+D duplica, Delete remove.</p>
      </Body>
    </>
  );
}
