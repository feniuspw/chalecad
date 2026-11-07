'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, cn } from '@chalecad/ui';
import { buildModel, type Project, type UF } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { aFramePitchDeg, degToPct, round } from '@/lib/project/geometry';
import { fmt } from '@/lib/project/format';
import { createProject, DEFAULT_PARAMS, TEMPLATE_LABELS, type TemplateKind, type TemplateParams } from '@/lib/project/templates';
import { Field, SelectField, SliderField, SwitchField } from './properties/fields';
import { UF_OPTIONS } from './properties/SystemSections';
import { AFrameIllustration, CombinedIllustration, FlatRoofIllustration, GableIllustration, GambrelIllustration, ShedIllustration } from './TypologyIllustrations';

interface KindCard {
  kind: TemplateKind | 'shed' | 'flat_roof' | 'gambrel' | 'combined';
  title: string;
  description: string;
  art: () => React.ReactNode;
  soon?: boolean;
}

const CARDS: KindCard[] = [
  { kind: 'gable_mezzanine', title: TEMPLATE_LABELS.gable_mezzanine, description: 'Caixa retangular com telhado de duas águas e pavimento superior.', art: GableIllustration },
  { kind: 'a_frame', title: TEMPLATE_LABELS.a_frame, description: 'Águas até o chão, empena frontal envidraçada e mezanino no fundo.', art: AFrameIllustration },
  { kind: 'shed', title: 'Meia-água', description: 'Telhado de uma queda só.', art: ShedIllustration, soon: true },
  { kind: 'flat_roof', title: 'Telhado plano', description: 'Platibanda e telha de baixa inclinação.', art: FlatRoofIllustration, soon: true },
  { kind: 'gambrel', title: 'Gambrel (celeiro)', description: 'Duas inclinações por água.', art: GambrelIllustration, soon: true },
  { kind: 'combined', title: 'Módulos em L e T', description: 'Dois volumes combinados.', art: CombinedIllustration, soon: true },
];

const STEPS = ['Tipologia', 'Dimensões', 'Nome e local'] as const;

function autoName(kind: TemplateKind, p: TemplateParams) {
  const f = (n: number) => String(round(n, 2)).replace('.', ',');
  return `${kind === 'a_frame' ? 'A-frame' : 'Chalé'} ${f(p.width)} × ${f(p.depth)}`;
}

export function NewProjectDialog({ open, onOpenChange, onCreate, firstAccess = false }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (project: Project) => void; firstAccess?: boolean }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<TemplateKind>('gable_mezzanine');
  const [params, setParams] = useState<TemplateParams>(DEFAULT_PARAMS.gable_mezzanine);
  const [nameTouched, setNameTouched] = useState(false);
  const nameId = useId();

  // Cada abertura recomeça do zero.
  useEffect(() => {
    if (open) {
      setStep(0);
      setKind('gable_mezzanine');
      setParams(DEFAULT_PARAMS.gable_mezzanine);
      setNameTouched(false);
    }
  }, [open]);

  const patch = (p: Partial<TemplateParams>) =>
    setParams((cur) => {
      const next = { ...cur, ...p };
      return nameTouched ? next : { ...next, name: autoName(kind, next) };
    });

  const pick = (k: TemplateKind) => {
    setKind(k);
    setParams({ ...DEFAULT_PARAMS[k], name: nameTouched ? params.name : DEFAULT_PARAMS[k].name });
  };

  // Pré-visualização numérica: usa o próprio motor (buildModel), então bate com o projeto criado.
  const preview = useMemo(() => {
    const pitch = kind === 'gable_mezzanine' ? params.roofPitchDeg : aFramePitchDeg(params.width, params.ridgeHeight);
    try {
      const m = buildModel(createProject(kind, params), getCatalog());
      return { footprint: m.footprintArea, built: m.builtArea, ridge: m.ridgeHeight, pitch };
    } catch {
      return { footprint: params.width * params.depth, built: params.width * params.depth, ridge: 0, pitch };
    }
  }, [kind, params]);

  const create = () => {
    const name = params.name.trim() || autoName(kind, params);
    onCreate(createProject(kind, { ...params, name }));
  };

  const last = step === STEPS.length - 1;
  const nameValid = params.name.trim().length > 0 && params.name.length <= 120;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-5 p-0"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            if (!last) setStep(step + 1);
            else if (nameValid) create();
          }
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{firstAccess ? 'Bem-vindo ao ChaléCAD' : 'Novo projeto'}</DialogTitle>
          <DialogDescription>
            {firstAccess ? 'Vamos começar pelo desenho do seu chalé. ' : ''}Passo {step + 1} de {STEPS.length}: {STEPS[step]?.toLowerCase()}.
          </DialogDescription>
          <ol className="mt-2 flex items-center gap-2" aria-label="Passos">
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

        <div className="min-h-[19rem] px-6">
          {step === 0 ? (
            <div role="radiogroup" aria-label="Tipologia" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CARDS.map((c) => {
                const selected = !c.soon && c.kind === kind;
                return (
                  <button
                    key={c.kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={c.soon}
                    onClick={() => !c.soon && pick(c.kind as TemplateKind)}
                    onDoubleClick={() => !c.soon && setStep(1)}
                    className={cn(
                      'group relative flex flex-col rounded-xl border bg-white p-3 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-stone-300 hover:shadow-sm',
                      c.soon && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <div className="mb-2 aspect-[3/2] rounded-lg bg-surface-sunken p-2 text-stone-700">
                      <c.art />
                    </div>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
                      {c.title}
                    </span>
                    <span className="mt-0.5 text-xs leading-snug text-stone-500">{c.description}</span>
                    {c.soon ? (
                      <Badge variant="neutral" className="absolute top-2 right-2 bg-white/90 whitespace-nowrap">
                        em breve
                      </Badge>
                    ) : null}
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

          {step === 1 ? (
            <div className="grid gap-6 sm:grid-cols-[1fr_14rem]">
              <div className="space-y-4">
                <SliderField label="Largura" value={params.width} min={2} max={30} unit="m" hint="eixo a eixo" onChange={(v) => patch({ width: v })} />
                <SliderField label="Profundidade" value={params.depth} min={2} max={40} unit="m" hint="eixo a eixo" onChange={(v) => patch({ depth: v })} />
                {kind === 'gable_mezzanine' ? (
                  <>
                    <SliderField label="Pé-direito" value={params.wallHeight} min={2.2} max={6} unit="m" onChange={(v) => patch({ wallHeight: v })} />
                    <SliderField label="Inclinação do telhado" value={params.roofPitchDeg} min={5} max={60} step={1} decimals={0} unit="°" hint={`= ${fmt(degToPct(params.roofPitchDeg), 0)}%`} onChange={(v) => patch({ roofPitchDeg: v })} />
                  </>
                ) : (
                  <>
                    <SliderField label="Altura da cumeeira" value={params.ridgeHeight} min={3} max={12} unit="m" onChange={(v) => patch({ ridgeHeight: v })} />
                    <p className="-mt-2 text-[11px] text-stone-500 tabular-nums">
                      Inclinação das águas: {fmt(preview.pitch, 0)}° (= {fmt(degToPct(preview.pitch), 0)}%), definida por largura e cumeeira.
                    </p>
                  </>
                )}
                <SwitchField label="Mezanino" description="Pavimento superior no fundo, com escada" checked={params.mezzanine} onChange={(v) => patch({ mezzanine: v })} />
              </div>
              <aside aria-label="Resumo" className="space-y-3 self-start rounded-xl border border-border bg-surface-muted p-4">
                <div className="aspect-[3/2] text-stone-700">{kind === 'a_frame' ? <AFrameIllustration /> : <GableIllustration />}</div>
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

          {step === 2 ? (
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
                {TEMPLATE_LABELS[kind]} · {fmt(params.width, 1)} × {fmt(params.depth, 1)} m · {fmt(preview.built, 1)} m² construídos
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {firstAccess && step === 0 ? (
            <Button variant="ghost" className="mr-auto" onClick={() => onOpenChange(false)}>
              Usar o chalé de exemplo
            </Button>
          ) : null}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
