'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tabs, TabsList, TabsTrigger, cn } from '@chalecad/ui';
import { buildModel, type Project, type Site, type UF } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { aFramePitchDeg, degToPct, pctToDeg, round } from '@/lib/project/geometry';
import { fmt } from '@/lib/project/format';
import { makeSlopedSite } from '@/lib/project/terrain';
import { PresetCard } from '@/components/onboarding/PresetCard';
import { PRESETS, findPreset } from '@/lib/project/presets';
import { createProject, DEFAULT_PARAMS, TEMPLATE_LABELS, TYPOLOGY_DESCRIPTIONS, type TemplateKind, type TemplateParams } from '@/lib/project/templates';
import { DownhillPicker } from './properties/DownhillPicker';
import { Field, Notice, SelectField, Segmented, SliderField, SwitchField } from './properties/fields';
import { UF_OPTIONS } from './properties/SystemSections';
import { LPlanIllustration, TPlanIllustration, TerrainIllustration, TYPOLOGY_ART } from './TypologyIllustrations';

const KINDS = Object.keys(TEMPLATE_LABELS) as TemplateKind[];

const STEPS = ['Tipologia', 'Dimensões', 'Terreno', 'Nome e local'] as const;

const NAME_PREFIX: Record<TemplateKind, string> = {
  gable_mezzanine: 'Chalé',
  a_frame: 'A-frame',
  shed: 'Meia-água',
  flat_roof: 'Casa plana',
  gambrel: 'Celeiro',
  combined: 'Chalé em L',
};

function autoName(kind: TemplateKind, p: TemplateParams) {
  const f = (n: number) => String(round(n, 2)).replace('.', ',');
  const prefix = kind === 'combined' ? `Chalé em ${p.shape}` : NAME_PREFIX[kind];
  return `${prefix} ${f(p.width)} × ${f(p.depth)}`;
}

const HIGH_SIDES = [
  { value: 'front', label: 'Frente' },
  { value: 'back', label: 'Fundos' },
  { value: 'left', label: 'Esq.' },
  { value: 'right', label: 'Dir.' },
] as const;

/** Campos de dimensões específicos de cada tipologia. */
function KindFields({ kind, params, patch }: { kind: TemplateKind; params: TemplateParams; patch: (p: Partial<TemplateParams>) => void }) {
  const wallHeight = <SliderField label="Pé-direito" value={params.wallHeight} min={2.2} max={6} unit="m" onChange={(v) => patch({ wallHeight: v })} />;
  switch (kind) {
    case 'gable_mezzanine':
      return (
        <>
          {wallHeight}
          <SliderField label="Inclinação do telhado" value={params.roofPitchDeg} min={5} max={60} step={1} decimals={0} unit="°" hint={`= ${fmt(degToPct(params.roofPitchDeg), 0)}%`} onChange={(v) => patch({ roofPitchDeg: v })} />
        </>
      );
    case 'a_frame': {
      const pitch = aFramePitchDeg(params.width, params.ridgeHeight, params.kneeWallHeight);
      const sides = params.annexSides;
      const annexValue = sides.length === 2 ? 'both' : sides[0] ?? 'none';
      return (
        <>
          <SliderField label="Altura da cumeeira" value={params.ridgeHeight} min={3} max={12} unit="m" onChange={(v) => patch({ ridgeHeight: v })} />
          <SliderField label="Mureta na base das águas" value={params.kneeWallHeight} min={0} max={1.5} step={0.05} unit="m" hint="0 = águas até o chão" onChange={(v) => patch({ kneeWallHeight: v })} />
          <p className="-mt-2 text-[11px] text-stone-500 tabular-nums">
            Inclinação das águas: {fmt(pitch, 0)}° (= {fmt(degToPct(pitch), 0)}%), definida por largura, cumeeira e mureta.
          </p>
          <Segmented<'none' | 'left' | 'right' | 'both'>
            label="Cômodos nas laterais"
            value={annexValue}
            options={[
              { value: 'none', label: 'Nenhum' },
              { value: 'left', label: 'Esquerda' },
              { value: 'right', label: 'Direita' },
              { value: 'both', label: 'Os dois' },
            ]}
            hint="anexo 3 × 5 m com telhado de uma água; ajuste depois"
            onChange={(v) => patch({ annexSides: v === 'none' ? [] : v === 'both' ? ['left', 'right'] : [v] })}
          />
        </>
      );
    }
    case 'shed': {
      const run = params.highSide === 'front' || params.highSide === 'back' ? params.depth : params.width;
      const pitch = (Math.atan2(Math.max(0, params.highHeight - params.lowHeight), run) * 180) / Math.PI;
      return (
        <>
          <Segmented<'front' | 'back' | 'left' | 'right'> label="Lado alto" value={params.highSide} options={[...HIGH_SIDES]} onChange={(v) => patch({ highSide: v })} />
          <SliderField label="Altura do lado baixo" value={params.lowHeight} min={2.2} max={6} unit="m" onChange={(v) => patch({ lowHeight: v, highHeight: Math.max(params.highHeight, v) })} />
          <SliderField label="Altura do lado alto" value={params.highHeight} min={2.4} max={9} unit="m" onChange={(v) => patch({ highHeight: v, lowHeight: Math.min(params.lowHeight, v) })} />
          <p className="-mt-2 text-[11px] text-stone-500 tabular-nums">
            Inclinação do telhado: {fmt(pitch, 1)}° (= {fmt(degToPct(pitch), 0)}%).
          </p>
        </>
      );
    }
    case 'flat_roof':
      return (
        <>
          {wallHeight}
          <SliderField label="Platibanda" value={params.parapetHeight} min={0} max={1.5} step={0.05} unit="m" hint="0 = sem" onChange={(v) => patch({ parapetHeight: v })} />
          <SliderField label="Caimento do telhado" value={params.slopePct} min={2} max={15} step={0.5} decimals={1} unit="%" hint={`≈ ${fmt(pctToDeg(params.slopePct), 1)}°`} onChange={(v) => patch({ slopePct: v })} />
        </>
      );
    case 'gambrel':
      return (
        <>
          {wallHeight}
          <SliderField label="Inclinação inferior" value={params.lowerPitchDeg} min={30} max={80} step={1} decimals={0} unit="°" onChange={(v) => patch({ lowerPitchDeg: v })} />
          <SliderField label="Inclinação superior" value={params.upperPitchDeg} min={5} max={45} step={1} decimals={0} unit="°" onChange={(v) => patch({ upperPitchDeg: v })} />
          <SliderField label="Posição da quebra" value={params.breakRatio} min={0.2} max={0.8} step={0.01} scale={100} decimals={0} unit="%" hint="da meia-largura" onChange={(v) => patch({ breakRatio: v })} />
        </>
      );
    case 'combined': {
      const maxW = Math.max(2, Math.min(20, params.width, params.depth));
      const ww = Math.min(params.wingWidth, maxW);
      return (
        <>
          <Segmented<'L' | 'T'>
            label="Forma"
            value={params.shape}
            options={[
              { value: 'L', label: 'Em L' },
              { value: 'T', label: 'Em T' },
            ]}
            onChange={(v) => patch({ shape: v })}
          />
          {wallHeight}
          <SliderField label="Inclinação do telhado" value={params.roofPitchDeg} min={5} max={60} step={1} decimals={0} unit="°" hint={`= ${fmt(degToPct(params.roofPitchDeg), 0)}%`} onChange={(v) => patch({ roofPitchDeg: v })} />
          <SliderField label="Largura da ala" value={ww} min={2} max={maxW} unit="m" hint="≤ profundidade do corpo" onChange={(v) => patch({ wingWidth: v })} />
          <SliderField label="Profundidade da ala" value={params.wingDepth} min={2} max={20} unit="m" onChange={(v) => patch({ wingDepth: v })} />
          {params.shape === 'L' ? (
            <SliderField label="Posição da ala" value={Math.min(params.wingOffset, Math.max(0, params.width - ww))} min={0} max={Math.max(0.1, params.width - ww)} unit="m" disabled={params.width - ww <= 0} hint="a partir da esquerda" onChange={(v) => patch({ wingOffset: v })} />
          ) : null}
        </>
      );
    }
  }
}

export function NewProjectDialog({ open, onOpenChange, onCreate, firstAccess = false }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (project: Project) => void; firstAccess?: boolean }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<TemplateKind>('gable_mezzanine');
  const [params, setParams] = useState<TemplateParams>(DEFAULT_PARAMS.gable_mezzanine);
  const [nameTouched, setNameTouched] = useState(false);
  const [tab, setTab] = useState<'models' | 'scratch'>('models');
  const [presetId, setPresetId] = useState<string>(PRESETS[0]!.id);
  const [presetName, setPresetName] = useState<string>(PRESETS[0]!.name);
  const nameId = useId();
  const presetNameId = useId();

  // Cada abertura recomeça do zero.
  useEffect(() => {
    if (open) {
      setStep(0);
      setKind('gable_mezzanine');
      setParams(DEFAULT_PARAMS.gable_mezzanine);
      setNameTouched(false);
      setTab('models');
      setPresetId(PRESETS[0]!.id);
      setPresetName(PRESETS[0]!.name);
    }
  }, [open]);

  const pickPreset = (id: string) => {
    setPresetId(id);
    setPresetName(findPreset(id)?.name ?? '');
  };
  const presetNameValid = presetName.trim().length > 0 && presetName.length <= 120;
  const createFromPreset = () => {
    const preset = findPreset(presetId);
    if (!preset || !presetNameValid) return;
    const p = preset.build();
    onCreate({ ...p, meta: { ...p.meta, name: presetName.trim() } });
  };

  const patch = (p: Partial<TemplateParams>) =>
    setParams((cur) => {
      const next = { ...cur, ...p };
      return nameTouched ? next : { ...next, name: autoName(kind, next) };
    });

  const pick = (k: TemplateKind) => {
    setKind(k);
    setParams({ ...DEFAULT_PARAMS[k], name: nameTouched ? params.name : DEFAULT_PARAMS[k].name, site: params.site });
  };

  // Pré-visualização numérica: usa o próprio motor (buildModel), então bate com o projeto criado.
  const preview = useMemo(() => {
    try {
      const m = buildModel(createProject(kind, params), getCatalog());
      return { footprint: m.footprintArea, built: m.builtArea, ridge: m.ridgeHeight };
    } catch {
      return { footprint: params.width * params.depth, built: params.width * params.depth, ridge: 0 };
    }
  }, [kind, params]);

  const Art = TYPOLOGY_ART[kind];
  const sloped = params.site?.type === 'sloped' ? params.site : null;
  const setSite = (site: Site | undefined) => setParams((cur) => ({ ...cur, site }));

  const create = () => {
    const name = params.name.trim() || autoName(kind, params);
    onCreate(createProject(kind, { ...params, name }));
  };

  const last = step === STEPS.length - 1;
  const nameValid = params.name.trim().length > 0 && params.name.length <= 120;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('gap-5 p-0', tab === 'models' ? 'max-w-4xl' : 'max-w-2xl')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            if (tab === 'models') createFromPreset();
            else if (!last) setStep(step + 1);
            else if (nameValid) create();
          }
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{firstAccess ? 'Bem-vindo ao ChaléCAD' : 'Novo projeto'}</DialogTitle>
          <DialogDescription>
            {firstAccess ? 'Vamos começar pelo seu chalé. ' : ''}
            {tab === 'models' ? 'Escolha um modelo pronto, já com cômodos, acabamentos e móveis. Dá para mudar tudo depois.' : `Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]?.toLowerCase()}.`}
          </DialogDescription>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'models' | 'scratch')} className="mt-1">
            <TabsList className="w-full sm:w-auto" aria-label="Como começar">
              <TabsTrigger value="models">Modelos prontos</TabsTrigger>
              <TabsTrigger value="scratch">Do zero</TabsTrigger>
            </TabsList>
          </Tabs>
          <ol className={cn('mt-2 flex items-center gap-2', tab === 'models' && 'hidden')} aria-label="Passos">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? 'step' : undefined}>
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', i < step ? 'bg-accent text-white' : i === step ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500')}>
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn('hidden text-xs font-medium sm:block', i === step ? 'text-stone-900' : 'text-stone-500')}>{s}</span>
                {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="max-h-[62vh] min-h-[19rem] overflow-y-auto px-6 pb-1">
          {tab === 'models' ? (
            <div className="space-y-4">
              <div role="radiogroup" aria-label="Modelos prontos" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PRESETS.map((pr) => (
                  <PresetCard key={pr.id} preset={pr} selected={pr.id === presetId} onSelect={() => pickPreset(pr.id)} onOpen={createFromPreset} />
                ))}
              </div>
              <Field label="Nome do projeto" htmlFor={presetNameId}>
                <input
                  id={presetNameId}
                  value={presetName}
                  maxLength={120}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="h-9 w-full max-w-sm rounded-md border border-border bg-white px-3 text-sm text-stone-900 shadow-sm outline-none hover:border-stone-300 focus:ring-2 focus:ring-accent/50"
                />
              </Field>
            </div>
          ) : null}

          {tab === 'scratch' && step === 0 ? (
            <div role="radiogroup" aria-label="Tipologia" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {KINDS.map((k) => {
                const Card = TYPOLOGY_ART[k];
                const selected = k === kind;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => pick(k)}
                    onDoubleClick={() => setStep(1)}
                    className={cn(
                      'group relative flex flex-col rounded-xl border bg-white p-3 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-stone-300 hover:shadow-sm',
                    )}
                  >
                    <div className="mb-2 aspect-[3/2] rounded-lg bg-surface-sunken p-2 text-stone-700">
                      <Card />
                    </div>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">{TEMPLATE_LABELS[k]}</span>
                    <span className="mt-0.5 text-xs leading-snug text-stone-500">{TYPOLOGY_DESCRIPTIONS[k]}</span>
                    {selected ? (
                      <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-accent text-white">
                        <Check className="size-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {tab === 'scratch' && step === 1 ? (
            <div className="grid gap-6 sm:grid-cols-[1fr_14rem]">
              <div className="space-y-4">
                <SliderField label={kind === 'combined' ? 'Largura do corpo principal' : 'Largura'} value={params.width} min={2} max={30} unit="m" hint="eixo a eixo" onChange={(v) => patch({ width: v })} />
                <SliderField label={kind === 'combined' ? 'Profundidade do corpo principal' : 'Profundidade'} value={params.depth} min={2} max={40} unit="m" hint="eixo a eixo" onChange={(v) => patch({ depth: v })} />
                <KindFields kind={kind} params={params} patch={patch} />
                {kind === 'gable_mezzanine' || kind === 'a_frame' ? (
                  <SwitchField label="Mezanino" description="Pavimento superior no fundo, com escada" checked={params.mezzanine} onChange={(v) => patch({ mezzanine: v })} />
                ) : null}
              </div>
              <aside aria-label="Resumo" className="space-y-3 self-start rounded-xl border border-border bg-surface-muted p-4">
                <div className="aspect-[3/2] text-stone-700">{kind === 'combined' ? (params.shape === 'T' ? <TPlanIllustration /> : <LPlanIllustration />) : <Art />}</div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-stone-500">Área de implantação</dt>
                    <dd className="text-lg font-semibold text-stone-900 tabular-nums">{fmt(preview.footprint, 1)} m²</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Área construída (aprox.)</dt>
                    <dd className="font-semibold text-stone-900 tabular-nums">{fmt(preview.built, 1)} m²</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500">Altura da cumeeira (aprox.)</dt>
                    <dd className="font-semibold text-stone-900 tabular-nums">{fmt(preview.ridge, 2)} m</dd>
                  </div>
                </dl>
              </aside>
            </div>
          ) : null}

          {tab === 'scratch' && step === 2 ? (
            <div className="grid gap-6 sm:grid-cols-[1fr_14rem]">
              <div className="space-y-4">
                <Segmented<'flat' | 'sloped'>
                  label="Terreno"
                  value={sloped ? 'sloped' : 'flat'}
                  options={[
                    { value: 'flat', label: 'Plano' },
                    { value: 'sloped', label: 'Inclinado' },
                  ]}
                  onChange={(v) => setSite(v === 'flat' ? undefined : (sloped ?? makeSlopedSite()))}
                />
                {sloped ? (
                  <>
                    <SliderField label="Inclinação" value={sloped.slopePct} min={0} max={100} step={1} decimals={0} unit="%" hint={`≈ ${fmt(pctToDeg(sloped.slopePct), 1)}°`} onChange={(v) => setSite({ ...sloped, slopePct: v })} />
                    <DownhillPicker value={sloped.downhillAzimuthDeg} onChange={(v) => setSite({ ...sloped, downhillAzimuthDeg: v })} />
                  </>
                ) : (
                  <Notice>Passo opcional. Com terreno plano não há corte nem aterro. Você pode mudar isso depois, em “Terreno”.</Notice>
                )}
              </div>
              <aside aria-label="Terreno" className="space-y-3 self-start rounded-xl border border-border bg-surface-muted p-4">
                <div className="aspect-[3/2] text-stone-700">
                  <TerrainIllustration sloped={!!sloped} />
                </div>
                <p className="text-xs leading-snug text-stone-600">
                  {sloped
                    ? `O motor calcula o platô, o corte e o aterro compensados, os taludes e o bota-fora. Margens e taludes começam com valores usuais e podem ser ajustados depois.`
                    : 'Casa assentada direto no radier, sem movimento de terra.'}
                </p>
              </aside>
            </div>
          ) : null}

          {tab === 'scratch' && step === 3 ? (
            <div className="mx-auto max-w-sm space-y-5 pt-2">
              <Field label="Nome do projeto" htmlFor={nameId}>
                <input
                  id={nameId}
                  autoFocus
                  value={params.name}
                  maxLength={120}
                  onChange={(e) => {
                    setNameTouched(true);
                    setParams({ ...params, name: e.target.value });
                  }}
                  className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm text-stone-900 shadow-sm outline-none hover:border-stone-300 focus:ring-2 focus:ring-accent/50"
                />
              </Field>
              <SelectField label="Estado (UF)" value={params.region} options={UF_OPTIONS} onChange={(uf: UF) => setParams({ ...params, region: uf })} hint="define a base de preços" />
              <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-stone-600">
                {TEMPLATE_LABELS[kind]} · {fmt(params.width, 1)} × {fmt(params.depth, 1)} m · {fmt(preview.built, 1)} m² construídos{sloped ? ` · terreno ${fmt(sloped.slopePct, 0)}%` : ''}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {firstAccess && (tab === 'models' || step === 0) ? (
            <Button variant="ghost" className="mr-auto" onClick={() => onOpenChange(false)}>
              Usar o chalé de exemplo
            </Button>
          ) : null}
          {tab === 'models' ? (
            <>
              {!firstAccess ? (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
              ) : null}
              <Button variant="accent" disabled={!presetNameValid} onClick={createFromPreset}>
                <Check /> Criar a partir do modelo
              </Button>
            </>
          ) : (
            <>
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  <ArrowLeft /> Voltar
                </Button>
              ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
              )}
              {last ? (
                <Button variant="accent" disabled={!nameValid} onClick={create}>
                  <Check /> Criar projeto
                </Button>
              ) : (
                <Button variant="accent" onClick={() => setStep(step + 1)}>
                  Continuar <ArrowRight />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
