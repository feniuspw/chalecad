'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@chalecad/ui';
import type { Project, TypologyKind } from '@chalecad/engine';
import { aFramePitchDeg, degToPct, pctToDeg } from '@/lib/project/geometry';
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

const KIND_OPTIONS = (Object.keys(TEMPLATE_LABELS) as TypologyKind[]).map((k) => ({ value: k, label: TEMPLATE_LABELS[k] }));

type Edit = (label: string, patch: TypologyPatch, coalesce?: boolean) => void;
type TypoOf<K extends TypologyKind> = Extract<Project['typology'], { kind: K }>;

const eaveField = (t: { eave: number }, edit: Edit) => (
  <SliderField label="Beiral lateral" value={t.eave} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar beiral', { eave: v }, c)} />
);
const rakeField = (t: { rake: number }, edit: Edit) => (
  <SliderField label="Beiral das empenas" value={t.rake} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar beiral das empenas', { rake: v }, c)} />
);
const wallHeightField = (t: { wallHeight: number }, edit: Edit) => (
  <SliderField label="Pé-direito" value={t.wallHeight} min={2.2} max={6} unit="m" onChange={(v, c) => edit('Alterar pé-direito', { wallHeight: v }, c)} />
);
const pitchField = (t: { roofPitchDeg: number }, edit: Edit) => (
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
);

function GableFields({ t, edit }: { t: TypoOf<'gable_mezzanine'>; edit: Edit }) {
  return (
    <>
      {wallHeightField(t, edit)}
      {pitchField(t, edit)}
      {eaveField(t, edit)}
      {rakeField(t, edit)}
    </>
  );
}

function AFrameFields({ t, edit }: { t: TypoOf<'a_frame'>; edit: Edit }) {
  const pitch = aFramePitchDeg(t.width, t.ridgeHeight, t.kneeWallHeight);
  return (
    <>
      <SliderField label="Altura da cumeeira" value={t.ridgeHeight} min={3} max={12} unit="m" onChange={(v, c) => edit('Alterar cumeeira', { ridgeHeight: v }, c)} />
      <p className="-mt-2 text-[11px] text-stone-500 tabular-nums">
        Inclinação das águas: {fmt(pitch, 0)}° (= {fmt(degToPct(pitch), 0)}%), definida por largura e cumeeira.
      </p>
      <SliderField label="Mureta na base das águas" value={t.kneeWallHeight} min={0} max={1.5} step={0.05} unit="m" onChange={(v, c) => edit('Alterar mureta', { kneeWallHeight: v }, c)} hint="0 = águas até o chão" />
      {rakeField(t, edit)}
      <SelectField label="Empena frontal" value={t.frontGable} options={[...GABLE_OPTIONS]} onChange={(v) => edit('Alterar empena frontal', { frontGable: v })} />
      <SelectField label="Empena dos fundos" value={t.backGable} options={[...GABLE_OPTIONS]} onChange={(v) => edit('Alterar empena dos fundos', { backGable: v })} />
    </>
  );
}

const HIGH_SIDES = [
  { value: 'front', label: 'Frente' },
  { value: 'back', label: 'Fundos' },
  { value: 'left', label: 'Esq.' },
  { value: 'right', label: 'Dir.' },
] as const;

function ShedFields({ t, edit }: { t: TypoOf<'shed'>; edit: Edit }) {
  // A queda corre do lado baixo para o alto: profundidade (frente/fundos) ou largura (laterais).
  const run = t.highSide === 'front' || t.highSide === 'back' ? t.depth : t.width;
  const pitch = (Math.atan2(Math.max(0, t.highHeight - t.lowHeight), run) * 180) / Math.PI;
  return (
    <>
      <Segmented<'front' | 'back' | 'left' | 'right'> label="Lado alto" value={t.highSide} options={[...HIGH_SIDES]} onChange={(v) => edit('Alterar lado alto', { highSide: v })} hint="a água cai para o lado oposto" />
      <SliderField label="Altura do lado baixo" value={t.lowHeight} min={2.2} max={6} unit="m" onChange={(v, c) => edit('Alterar altura do lado baixo', { lowHeight: v }, c)} />
      <SliderField label="Altura do lado alto" value={t.highHeight} min={2.4} max={9} unit="m" onChange={(v, c) => edit('Alterar altura do lado alto', { highHeight: v }, c)} />
      <p className="-mt-2 text-[11px] text-stone-500 tabular-nums">
        Inclinação do telhado: {fmt(pitch, 1)}° (= {fmt(degToPct(pitch), 0)}%).{pitch < 5 ? ' Abaixo do usual para telha sanduíche (≈ 5%).' : ''}
      </p>
      {eaveField(t, edit)}
    </>
  );
}

function FlatFields({ t, edit }: { t: TypoOf<'flat_roof'>; edit: Edit }) {
  return (
    <>
      {wallHeightField(t, edit)}
      <SliderField label="Platibanda" value={t.parapetHeight} min={0} max={1.5} step={0.05} unit="m" hint="0 = sem platibanda" onChange={(v, c) => edit('Alterar platibanda', { parapetHeight: v }, c)} />
      <SliderField
        label="Caimento do telhado"
        value={t.slopePct}
        min={2}
        max={15}
        step={0.5}
        decimals={1}
        unit="%"
        hint={`≈ ${fmt(pctToDeg(t.slopePct), 1)}°, cai para o fundo`}
        onChange={(v, c) => edit('Alterar caimento', { slopePct: v }, c)}
      />
      {t.slopePct < 5 ? <Notice tone="warn">Menos de 5% de caimento costuma exigir telha e vedação especiais contra empoçamento.</Notice> : null}
    </>
  );
}

function GambrelFields({ t, edit }: { t: TypoOf<'gambrel'>; edit: Edit }) {
  return (
    <>
      {wallHeightField(t, edit)}
      <SliderField label="Inclinação inferior" value={t.lowerPitchDeg} min={30} max={80} step={1} decimals={0} unit="°" hint={`= ${fmt(degToPct(t.lowerPitchDeg), 0)}%`} onChange={(v, c) => edit('Alterar inclinação inferior', { lowerPitchDeg: v }, c)} />
      <SliderField label="Inclinação superior" value={t.upperPitchDeg} min={5} max={45} step={1} decimals={0} unit="°" hint={`= ${fmt(degToPct(t.upperPitchDeg), 0)}%`} onChange={(v, c) => edit('Alterar inclinação superior', { upperPitchDeg: v }, c)} />
      <SliderField
        label="Posição da quebra"
        value={t.breakRatio}
        min={0.2}
        max={0.8}
        step={0.01}
        scale={100}
        decimals={0}
        unit="%"
        hint="da meia-largura, a partir do beiral"
        onChange={(v, c) => edit('Alterar quebra do telhado', { breakRatio: v }, c)}
      />
      {eaveField(t, edit)}
      {rakeField(t, edit)}
    </>
  );
}

function CombinedFields({ t, edit }: { t: TypoOf<'combined'>; edit: Edit }) {
  const maxWingW = Math.max(2, Math.min(20, t.width, t.depth));
  const maxOffset = Math.max(0, t.width - t.wing.width);
  const wing = (label: string, patch: Partial<TypoOf<'combined'>['wing']>, c = false) => edit(label, { wing: patch }, c);
  return (
    <>
      <Segmented<'L' | 'T'>
        label="Forma"
        value={t.shape}
        options={[
          { value: 'L', label: 'Em L' },
          { value: 'T', label: 'Em T' },
        ]}
        onChange={(v) => edit('Alterar forma', { shape: v })}
        hint={t.shape === 'T' ? 'ala centralizada' : undefined}
      />
      {wallHeightField(t, edit)}
      {pitchField(t, edit)}
      {eaveField(t, edit)}
      {rakeField(t, edit)}
      <div className="space-y-4 rounded-lg border border-border bg-surface-muted p-3">
        <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Ala (sai do fundo)</h4>
        <SliderField label="Largura da ala" value={t.wing.width} min={2} max={maxWingW} unit="m" hint="≤ profundidade do corpo" onChange={(v, c) => wing('Alterar largura da ala', { width: v }, c)} />
        <SliderField label="Profundidade da ala" value={t.wing.depth} min={2} max={20} unit="m" onChange={(v, c) => wing('Alterar profundidade da ala', { depth: v }, c)} />
        {t.shape === 'L' ? (
          <SliderField label="Posição da ala" value={t.wing.offset} min={0} max={Math.max(0.1, maxOffset)} unit="m" hint="a partir da esquerda" disabled={maxOffset <= 0} onChange={(v, c) => wing('Mover ala', { offset: v }, c)} />
        ) : (
          <p className="text-[11px] text-stone-500">No T a ala fica centralizada no fundo do corpo.</p>
        )}
      </div>
    </>
  );
}

export function TypologySection({ project }: { project: Project }) {
  const section = useSection('typology');
  const edit = useTypologyEdit();
  const update = useEditor((s) => s.update);
  const ridge = useEditor((s) => s.results?.model.ridgeHeight);
  const [pendingKind, setPendingKind] = useState<TypologyKind | null>(null);
  const t = project.typology;

  const confirmSwitch = () => {
    if (!pendingKind) return;
    const box: { rep?: ReconcileReport } = {};
    update('Trocar tipologia', (d) => {
      box.rep = switchTypology(d, pendingKind);
    });
    reportToast(box.rep);
    setPendingKind(null);
  };

  const keepsMezzanine = pendingKind === 'gable_mezzanine' || pendingKind === 'a_frame';
  const losesMezzanine = pendingKind !== null && !keepsMezzanine && getMezzanine(project) !== null;
  const widthMax = 30;

  return (
    <Section title="Tipologia" {...section} badge={ridge ? <Badge variant="neutral">cumeeira {fmt(ridge, 1)} m</Badge> : undefined}>
      <SelectField
        label="Tipologia"
        value={t.kind}
        options={KIND_OPTIONS}
        onChange={(v) => {
          if (v !== t.kind) setPendingKind(v);
        }}
      />

      <SliderField label="Largura" value={t.width} min={2} max={widthMax} unit="m" onChange={(v, c) => edit('Alterar largura', { width: v }, c)} hint={t.kind === 'combined' ? 'do corpo principal' : 'eixo a eixo'} />
      <SliderField label="Profundidade" value={t.depth} min={2} max={40} unit="m" onChange={(v, c) => edit('Alterar profundidade', { depth: v }, c)} hint={t.kind === 'combined' ? 'do corpo principal' : 'eixo a eixo'} />

      {t.kind === 'gable_mezzanine' ? <GableFields t={t} edit={edit} /> : null}
      {t.kind === 'a_frame' ? <AFrameFields t={t} edit={edit} /> : null}
      {t.kind === 'shed' ? <ShedFields t={t} edit={edit} /> : null}
      {t.kind === 'flat_roof' ? <FlatFields t={t} edit={edit} /> : null}
      {t.kind === 'gambrel' ? <GambrelFields t={t} edit={edit} /> : null}
      {t.kind === 'combined' ? <CombinedFields t={t} edit={edit} /> : null}

      <Dialog open={pendingKind !== null} onOpenChange={(o) => !o && setPendingKind(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar para {pendingKind ? TEMPLATE_LABELS[pendingKind] : ''}?</DialogTitle>
            <DialogDescription>
              Largura, profundidade, pé-direito e aberturas que continuam válidas são mantidos. Telhado e empenas voltam aos valores padrão da nova tipologia, e aberturas
              que não cabem nela são removidas.
              {losesMezzanine ? ' Esta tipologia não tem mezanino: ele e a escada serão removidos.' : ''} Você pode desfazer com Ctrl/⌘+Z.
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
