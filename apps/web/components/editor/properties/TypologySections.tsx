'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import {
  aFramePitchDeg,
  degToPct,
} from '@/lib/project/geometry';
import {
  getMezzanine,
  isEditableTypology,
  maxMezzanineDepth,
  patchTypology,
  setMezzanine,
  setMezzanineEnabled,
  switchTypology,
  type TypologyPatch,
  type MezzaninePosition,
  type ReconcileReport,
} from '@/lib/project/edit';
import { fmt } from '@/lib/project/format';
import { TEMPLATE_LABELS } from '@/lib/project/templates';
import { useEditor } from '@/lib/store/editor';
import { Notice, Section, Segmented, SelectField, SliderField, SwitchField } from './fields';
import { usePanelUi } from './ui-state';

const GABLE_OPTIONS = [
  { value: 'closed', label: 'Fechada' },
  { value: 'glazed', label: 'Envidraçada' },
  { value: 'open', label: 'Aberta' },
] as const;

export function reportToast(rep: ReconcileReport | undefined) {
  if (!rep) return;
  if (rep.removedOpenings > 0 || rep.removedWalls > 0) {
    const parts = [
      rep.removedOpenings ? `${rep.removedOpenings} abertura(s) removida(s)` : '',
      rep.removedWalls ? `${rep.removedWalls} parede(s) interna(s) removida(s)` : '',
    ].filter(Boolean);
    toast.warning(`${parts.join(' e ')}: não cabiam nas novas dimensões.`, { id: 'fit', description: 'Desfaça com Ctrl/⌘+Z.' });
  } else if (rep.adjustedOpenings > 0) {
    toast.info(`${rep.adjustedOpenings} abertura(s) ajustada(s) para caber nas paredes.`, { id: 'fit' });
  }
}

function useTypologyEdit() {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  return (label: string, patch: TypologyPatch, coalesce = false) => {
    const box: { rep?: ReconcileReport } = {};
    (coalesce ? updateCoalesced : update)(label, (d) => {
      box.rep = patchTypology(d, patch);
    });
    reportToast(box.rep);
  };
}

function useSection(id: 'typology' | 'mezzanine') {
  const open = usePanelUi((s) => s.open[id]);
  const setOpen = usePanelUi((s) => s.setOpen);
  return { open, onOpenChange: (v: boolean) => setOpen(id, v) };
}

// ---------------------------------------------------------------------------
// Tipologia
// ---------------------------------------------------------------------------

const KIND_OPTIONS = [
  { value: 'gable_mezzanine', label: TEMPLATE_LABELS.gable_mezzanine },
  { value: 'a_frame', label: TEMPLATE_LABELS.a_frame },
  { value: 'shed', label: 'Meia-água', disabled: true, hint: 'em breve' },
  { value: 'flat_roof', label: 'Telhado plano', disabled: true, hint: 'em breve' },
  { value: 'gambrel', label: 'Gambrel (celeiro)', disabled: true, hint: 'em breve' },
  { value: 'combined', label: 'Módulos em L e T', disabled: true, hint: 'em breve' },
];

export function TypologySection({ project }: { project: Project }) {
  const section = useSection('typology');
  const edit = useTypologyEdit();
  const update = useEditor((s) => s.update);
  const [pendingKind, setPendingKind] = useState<'gable_mezzanine' | 'a_frame' | null>(null);
  const t = project.typology;

  if (!isEditableTypology(t)) {
    return (
      <Section title="Tipologia" {...section}>
        <Notice tone="warn">A tipologia “{t.kind}” ainda não pode ser editada aqui.</Notice>
      </Section>
    );
  }

  const confirmSwitch = () => {
    if (!pendingKind) return;
    const box: { rep?: ReconcileReport } = {};
    update('Trocar tipologia', (d) => {
      box.rep = switchTypology(d, pendingKind);
    });
    reportToast(box.rep);
    setPendingKind(null);
  };

  const pitch = t.kind === 'gable_mezzanine' ? t.roofPitchDeg : aFramePitchDeg(t.width, t.ridgeHeight, t.kneeWallHeight);

  return (
    <Section title="Tipologia" {...section}>
      <SelectField
        label="Tipologia"
        value={t.kind}
        options={KIND_OPTIONS}
        onChange={(v) => {
          if (v !== t.kind && (v === 'gable_mezzanine' || v === 'a_frame')) setPendingKind(v);
        }}
      />

      <SliderField label="Largura" value={t.width} min={2} max={30} unit="m" onChange={(v, c) => edit('Alterar largura', { width: v }, c)} hint="eixo a eixo" />
      <SliderField label="Profundidade" value={t.depth} min={2} max={40} unit="m" onChange={(v, c) => edit('Alterar profundidade', { depth: v }, c)} hint="eixo a eixo" />

      {t.kind === 'gable_mezzanine' ? (
        <>
          <SliderField label="Pé-direito" value={t.wallHeight} min={2.2} max={6} unit="m" onChange={(v, c) => edit('Alterar pé-direito', { wallHeight: v }, c)} />
          <SliderField
            label="Inclinação do telhado"
            value={t.roofPitchDeg}
            min={5}
            max={60}
            step={1}
            decimals={0}
            unit="°"
            hint={`= ${fmt(degToPct(t.roofPitchDeg), 0)}%`}
            onChange={(v, c) => edit('Alterar inclinação', { roofPitchDeg: v }, c)}
          />
          <SliderField label="Beiral lateral" value={t.eave} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar beiral', { eave: v }, c)} />
          <SliderField label="Beiral das empenas" value={t.rake} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar beiral das empenas', { rake: v }, c)} />
        </>
      ) : (
        <>
          <SliderField label="Altura da cumeeira" value={t.ridgeHeight} min={3} max={12} unit="m" onChange={(v, c) => edit('Alterar cumeeira', { ridgeHeight: v }, c)} />
          <p className="-mt-2 text-[11px] text-stone-500 tabular-nums">
            Inclinação das águas: {fmt(pitch, 0)}° (= {fmt(degToPct(pitch), 0)}%), definida por largura e cumeeira.
          </p>
          <SliderField label="Mureta na base das águas" value={t.kneeWallHeight} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar mureta', { kneeWallHeight: v }, c)} hint="0 = águas até o chão" />
          <SliderField label="Beiral das empenas" value={t.rake} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar beiral das empenas', { rake: v }, c)} />
          <SelectField label="Empena frontal" value={t.frontGable} options={[...GABLE_OPTIONS]} onChange={(v) => edit('Alterar empena frontal', { frontGable: v })} />
          <SelectField label="Empena dos fundos" value={t.backGable} options={[...GABLE_OPTIONS]} onChange={(v) => edit('Alterar empena dos fundos', { backGable: v })} />
        </>
      )}

      <Dialog open={pendingKind !== null} onOpenChange={(o) => !o && setPendingKind(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar para {pendingKind ? TEMPLATE_LABELS[pendingKind] : ''}?</DialogTitle>
            <DialogDescription>
              Largura, profundidade e mezanino são mantidos. Altura, telhado e empenas voltam aos valores padrão da nova tipologia, e aberturas que não existem nela
              são removidas. Você pode desfazer com Ctrl/⌘+Z.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingKind(null)}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={confirmSwitch}>
              Trocar tipologia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Mezanino
// ---------------------------------------------------------------------------

const DECK_OPTIONS = [
  { value: 'osb18', label: 'OSB 18 mm' },
  { value: 'osb18_wood', label: 'OSB 18 mm + madeira' },
  { value: 'cement18', label: 'Placa cimentícia 18 mm' },
] as const;

export function MezzanineSection({ project }: { project: Project }) {
  const section = useSection('mezzanine');
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const mezz = useEditor((s) => s.results?.model.slabs.find((x) => x.kind === 'mezzanine'));
  const t = project.typology;
  if (!isEditableTypology(t)) return null;
  const info = getMezzanine(project);

  return (
    <Section title="Mezanino" {...section} badge={info ? <Badge variant="neutral">{fmt(mezz?.area ?? 0, 1)} m²</Badge> : <Badge variant="neutral">sem</Badge>}>
      <SwitchField
        label="Mezanino"
        description={info ? 'Pavimento superior com escada' : 'Ative para incluir um pavimento superior'}
        checked={info !== null}
        onChange={(on) => update(on ? 'Incluir mezanino' : 'Remover mezanino', (d) => setMezzanineEnabled(d, on))}
      />
      {info ? (
        <>
          <SliderField
            label="Profundidade"
            value={info.depth}
            min={1}
            max={maxMezzanineDepth(t)}
            unit="m"
            onChange={(v, c) => (c ? updateCoalesced : update)('Alterar profundidade do mezanino', (d) => setMezzanine(d, { depth: v }))}
          />
          <Segmented<MezzaninePosition>
            label="Posição"
            value={info.position}
            options={[
              { value: 'back', label: 'Fundos' },
              { value: 'front', label: 'Frente' },
            ]}
            onChange={(v) => update('Mover mezanino', (d) => setMezzanine(d, { position: v }))}
          />
          <SwitchField
            label="Guarda-corpo"
            description="Nas bordas livres do mezanino"
            checked={info.level.guardrail ?? false}
            onChange={(on) =>
              update(on ? 'Incluir guarda-corpo' : 'Remover guarda-corpo', (d) => {
                const lv = d.levels.find((l) => l.id === info.level.id);
                if (lv) lv.guardrail = on;
              })
            }
          />
          <SelectField
            label="Piso"
            value={info.level.deck ?? 'osb18'}
            options={[...DECK_OPTIONS]}
            onChange={(v) =>
              update('Alterar piso do mezanino', (d) => {
                const lv = d.levels.find((l) => l.id === info.level.id);
                if (lv) lv.deck = v;
              })
            }
          />
        </>
      ) : null}
    </Section>
  );
}
