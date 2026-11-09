'use client';
import { Copy } from 'lucide-react';
import { Button } from '@chalecad/ui';
import type { DeckStair, Extra, ExtraModel, Project } from '@chalecad/engine';
import { toast } from 'sonner';
import { planBounds } from '@/lib/project/geometry';
import { deckAlignPatch, duplicateExtra, extraLabel, extraSummary, findExtra, patchExtra, sideFaceCount, sideLength, SIDE_LABELS, type DeckAlignMode, type Side } from '@/lib/project/extras';
import { round } from '@/lib/project/geometry';
import { fmt } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { Notice, Segmented, SelectField, SliderField, SwitchField, type Option } from './fields';
import { Body, Header, useDelete } from './inspector-parts';
import { PathEditor } from './PathEditor';

type Of<K extends Extra['kind']> = Extract<Extra, { kind: K }>;

const SIDES: Option<Side>[] = (Object.keys(SIDE_LABELS) as Side[]).map((v) => ({ value: v, label: SIDE_LABELS[v] }));

const WALL_SYSTEMS: Option<Of<'wall'>['system']>[] = [
  { value: 'concrete_block', label: 'Bloco de concreto' },
  { value: 'structural_block', label: 'Bloco estrutural' },
  { value: 'lsf_board', label: 'Steel frame + cimentícia' },
];
const WALL_FOUNDATIONS: Option<Of<'wall'>['foundation']>[] = [
  { value: 'strip', label: 'Sapata corrida' },
  { value: 'grade_beam', label: 'Viga baldrame' },
];
const POST_TYPES: Option<Of<'fence'>['postType']>[] = [
  { value: 'concrete', label: 'Concreto' },
  { value: 'eucalyptus', label: 'Eucalipto tratado' },
  { value: 'steel', label: 'Aço' },
];
const MESHES: Option<Of<'fence'>['mesh']>[] = [
  { value: 'welded', label: 'Tela soldada' },
  { value: 'chain_link', label: 'Alambrado' },
  { value: 'barbed', label: 'Arame farpado' },
];
const TOWER_ROOFS: Option<Of<'water_tower'>['roof']>[] = [
  { value: 'gable', label: 'Duas águas' },
  { value: 'shed', label: 'Uma água' },
  { value: 'flat', label: 'Plano' },
];
const RETAINING_TYPES: Option<Of<'retaining'>['type']>[] = [
  { value: 'block', label: 'Bloco de concreto' },
  { value: 'concrete', label: 'Concreto armado' },
  { value: 'gabion', label: 'Gabião' },
];

export function ExtraInspector({ id, project }: { id: string; project: Project }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const select = useEditor((s) => s.select);
  const remove = useDelete();
  const e = findExtra(project, id);
  if (!e) return null;
  const name = extraLabel(project, id);

  const set = (label: string, patch: Record<string, unknown>, coalesce = false) => (coalesce ? updateCoalesced : update)(label, (d) => patchExtra(d, id, patch));
  const slider = (what: string, key: string) => (v: number, c: boolean) => set(`${what} (${name.toLowerCase()})`, { [key]: v }, c);

  const duplicate = () => {
    const box: { id: string | null } = { id: null };
    update(`Duplicar ${name.toLowerCase()}`, (d) => {
      box.id = duplicateExtra(d, id);
    });
    if (box.id) {
      select({ kind: 'extra', id: box.id });
      toast(`${name} duplicado.`, { action: { label: 'Desfazer', onClick: () => useEditor.getState().undo() } });
    }
  };

  return (
    <>
      <Header
        title={name}
        subtitle={extraSummary(e).detail}
        onDelete={remove}
        actions={
          <Button variant="outline" size="sm" onClick={duplicate}>
            <Copy /> Duplicar
          </Button>
        }
      />
      <Body>
        {e.kind === 'deck' ? <DeckFields e={e} project={project} set={set} slider={slider} /> : null}

        {e.kind === 'wall' ? (
          <>
            <SliderField label="Altura" value={e.height} min={0.5} max={4} step={0.1} unit="m" onChange={slider('Alterar altura', 'height')} />
            <SelectField label="Sistema" value={e.system} options={WALL_SYSTEMS} onChange={(v) => set(`Alterar sistema (${name.toLowerCase()})`, { system: v })} />
            <SelectField label="Fundação" value={e.foundation} options={WALL_FOUNDATIONS} onChange={(v) => set(`Alterar fundação (${name.toLowerCase()})`, { foundation: v })} />
            <SwitchField label="Caminho fechado" description="Liga o último ponto ao primeiro" checked={e.closed} onChange={(v) => set('Fechar caminho', { closed: v })} />
            <PathEditor id={id} path={e.path} closed={e.closed} />
          </>
        ) : null}

        {e.kind === 'fence' ? (
          <>
            <SliderField label="Altura" value={e.height} min={0.8} max={3} step={0.1} unit="m" onChange={slider('Alterar altura', 'height')} />
            <SelectField label="Mourões" value={e.postType} options={POST_TYPES} onChange={(v) => set(`Alterar mourões (${name.toLowerCase()})`, { postType: v })} />
            <SliderField label="Espaçamento dos mourões" value={e.postSpacing} min={1} max={4} step={0.1} unit="m" onChange={slider('Alterar espaçamento', 'postSpacing')} />
            <SelectField label="Tela" value={e.mesh} options={MESHES} onChange={(v) => set(`Alterar tela (${name.toLowerCase()})`, { mesh: v })} />
            <SliderField label="Mureta na base" value={e.baseWallHeight} min={0} max={1} step={0.05} unit="m" hint="0 = sem mureta" onChange={slider('Alterar mureta', 'baseWallHeight')} />
            <SwitchField label="Caminho fechado" description="Liga o último ponto ao primeiro" checked={e.closed} onChange={(v) => set('Fechar caminho', { closed: v })} />
            <PathEditor id={id} path={e.path} closed={e.closed} />
          </>
        ) : null}

        {e.kind === 'retaining' ? (
          <>
            <SliderField label="Altura" value={e.height} min={0.3} max={5} step={0.1} unit="m" onChange={slider('Alterar altura', 'height')} />
            <SelectField label="Tipo" value={e.type} options={RETAINING_TYPES} onChange={(v) => set(`Alterar tipo (${name.toLowerCase()})`, { type: v })} />
            <SwitchField label="Drenagem" description="Dreno e brita atrás do muro" checked={e.drainage} onChange={(v) => set('Alterar drenagem', { drainage: v })} />
            {project.site.type === 'flat' ? <Notice>O terreno está plano: o arrimo não contém corte nenhum. Defina a inclinação em “Terreno”.</Notice> : null}
            <PathEditor id={id} path={e.path} closed={false} perimeterLabel="Na borda do platô (lado da subida)" />
          </>
        ) : null}

        {e.kind === 'water_tower' ? <TowerFields e={e} project={project} set={set} slider={slider} /> : null}
      </Body>
    </>
  );
}

function TowerFields({
  e,
  project,
  set,
  slider,
}: {
  e: Of<'water_tower'>;
  project: Project;
  set: (label: string, patch: Record<string, unknown>, coalesce?: boolean) => void;
  slider: (what: string, key: string) => (v: number, c: boolean) => void;
}) {
  const b = planBounds(project.typology);
  const upper = project.levels.filter((l) => l.elevation > 0).reduce((m, l) => Math.max(m, l.elevation), 0);
  const minHead = upper + 2.1 + 1;
  const low = e.platformZ < minHead - 1e-6;
  const move = (axis: 0 | 1) => (v: number, c: boolean) => set(`Mover torre (${axis === 0 ? 'x' : 'y'})`, { position: axis === 0 ? [v, e.position[1]] : [e.position[0], v] }, c);
  return (
    <>
      <Notice>Precisa ficar ~1 m acima do chuveiro mais alto. Chuveiro a 2,1 m do piso do banheiro de cima: a caixa deve começar a pelo menos {fmt(minHead, 1)} m.</Notice>
      <SliderField label="Posição x" value={e.position[0]} min={b.x0 - 2} max={b.x1 + 2} step={0.05} unit="m" hint="da esquerda para a direita" onChange={move(0)} />
      <SliderField label="Posição y" value={e.position[1]} min={b.y0 - 2} max={b.y1 + 2} step={0.05} unit="m" hint="da frente para os fundos" onChange={move(1)} />
      <SliderField label="Largura" value={e.width} min={1} max={3} step={0.1} unit="m" onChange={slider('Alterar largura', 'width')} />
      <SliderField label="Profundidade" value={e.depth} min={1} max={3} step={0.1} unit="m" onChange={slider('Alterar profundidade', 'depth')} />
      <SliderField label="Altura do piso da caixa" value={e.platformZ} min={2} max={10} step={0.1} unit="m" hint="a partir do térreo" onChange={slider('Alterar altura da caixa', 'platformZ')} />
      {low && upper > 0 ? <Notice>A caixa está a menos de 1 m acima do chuveiro do mezanino: a pressão pode ficar fraca. Suba a caixa.</Notice> : null}
      <Segmented<Of<'water_tower'>['roof']> label="Telhado da torre" value={e.roof} options={TOWER_ROOFS} onChange={(v) => set('Alterar telhado da torre', { roof: v })} />
    </>
  );
}

const ALIGNS: Option<Of<'deck'>['align']>[] = [
  { value: 'start', label: 'Início' },
  { value: 'center', label: 'Centro' },
  { value: 'end', label: 'Fim' },
];
const GUARDRAILS: Option<'auto' | 'yes' | 'no'>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
];
const SUPPORTS: Option<Of<'deck'>['support']>[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'wood', label: 'Madeira tratada' },
  { value: 'steel', label: 'Aço' },
  { value: 'concrete', label: 'Concreto' },
];
const FOOTINGS: Option<Of<'deck'>['footing']>[] = [
  { value: 'auto', label: 'Automática' },
  { value: 'pad', label: 'Sapata isolada' },
  { value: 'bored', label: 'Broca (estaca escavada)' },
];
const BOARDS: Option<Of<'deck'>['boards']>[] = [
  { value: 'parallel', label: 'Paralelas à fachada' },
  { value: 'perpendicular', label: 'Perpendiculares' },
];
const STAIR_EDGES: Option<DeckStair['edge']>[] = [
  { value: 'outer', label: 'Borda externa' },
  { value: 'start', label: 'Lateral do início' },
  { value: 'end', label: 'Lateral do fim' },
];
const MATERIAL_NAMES = { wood: 'madeira', steel: 'aço', concrete: 'concreto' } as const;

const guardrailValue = (g: Of<'deck'>['guardrail']): 'auto' | 'yes' | 'no' => (g === 'auto' ? 'auto' : g ? 'yes' : 'no');

function DeckFields({
  e,
  project,
  set,
  slider,
}: {
  e: Of<'deck'>;
  project: Project;
  set: (label: string, patch: Record<string, unknown>, coalesce?: boolean) => void;
  slider: (what: string, key: string) => (v: number, c: boolean) => void;
}) {
  const deck = useEditor((s) => s.results?.model.extras.find((x) => x.id === e.id)?.deck);
  const faces = sideFaceCount(project, e.side);
  const faceLen = sideLength(project, e.side, e.facadeIndex);
  const fullFacade = e.length === undefined;
  const length = Math.min(e.length ?? faceLen, faceLen);
  const level = e.level ?? -0.03;
  const manual = e.stairs !== 'auto';
  const stairs: DeckStair[] = e.stairs === 'auto' ? [] : e.stairs;
  const setStairs = (next: DeckStair[] | 'auto') => set('Alterar escadas do deck', { stairs: next });
  const patchStair = (i: number, patch: Partial<DeckStair>) => setStairs(stairs.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const align = (mode: DeckAlignMode) => {
    const patch = deckAlignPatch(project, e, mode);
    if (!patch) {
      toast.info('Não há porta nesta fachada dentro do deck.');
      return;
    }
    set(mode === 'door' ? 'Centralizar deck na porta' : 'Alinhar deck', patch);
  };

  const materials = deck ? [...new Set(deck.supports.filter((s) => s.topZ - s.groundZ > 1e-6).map((s) => MATERIAL_NAMES[s.material]))] : [];
  const footings = deck ? [...new Set(deck.supports.map((s) => (s.footing.kind === 'bored' ? 'broca' : 'sapata')))] : [];
  const maxH = deck ? deck.supports.reduce((m, s) => Math.max(m, s.topZ - s.groundZ), 0) : 0;

  return (
    <>
      <Segmented<Side> label="Lado da casa" value={e.side} options={SIDES} onChange={(v) => set('Mudar lado do deck', { side: v, facadeIndex: 0, offset: 0, align: 'start', length: undefined })} hint={`fachada de ${fmt(faceLen, 1)} m`} />
      {faces > 1 ? (
        <Segmented<number>
          label="Fachada"
          value={Math.min(e.facadeIndex, faces - 1)}
          options={Array.from({ length: faces }, (_, i) => ({ value: i, label: i === 0 ? 'Externa' : `${i + 1}ª` }))}
          onChange={(v) => set('Mudar fachada do deck', { facadeIndex: v, offset: 0 })}
          hint="há mais de uma parede voltada para este lado"
        />
      ) : null}

      <Segmented<Of<'deck'>['align']> label="Alinhamento" value={e.align} options={ALIGNS} onChange={(v) => align(v)} />
      <Button variant="outline" size="sm" onClick={() => align('door')}>
        Centralizar na porta
      </Button>
      <SliderField label="Deslocamento" value={clampTo(e.offset, -faceLen, faceLen)} min={-Math.max(0.1, faceLen / 2)} max={Math.max(0.1, faceLen / 2)} step={0.05} unit="m" hint="a partir do alinhamento" onChange={slider('Mover deck', 'offset')} />

      <SwitchField label="Fachada inteira" description="Deck de quina a quina da parede" checked={fullFacade} onChange={(v) => set('Alterar comprimento do deck', { length: v ? undefined : Math.min(faceLen, 4) })} />
      {!fullFacade ? <SliderField label="Comprimento" value={length} min={1} max={Math.max(1.1, faceLen)} step={0.1} unit="m" onChange={slider('Alterar comprimento', 'length')} /> : null}
      <SliderField label="Profundidade" value={e.depth} min={0.8} max={6} step={0.1} unit="m" hint="para fora da parede" onChange={slider('Alterar profundidade', 'depth')} />
      <SliderField label="Nível do piso" value={level} min={-1} max={3} step={0.01} unit="m" hint="em relação ao piso da casa" onChange={slider('Alterar nível do piso', 'level')} />
      <Button variant="outline" size="sm" onClick={() => set('Nivelar deck com a casa', { level: 0 })}>
        Nivelar com a casa
      </Button>
      <SwitchField label="Coberto" description="Telhado de uma água sobre o deck, com pilares" checked={e.covered} onChange={(v) => set(v ? 'Cobrir deck' : 'Descobrir deck', { covered: v })} />

      <Segmented<'auto' | 'yes' | 'no'>
        label="Guarda-corpo"
        value={guardrailValue(e.guardrail)}
        options={GUARDRAILS}
        onChange={(v) => set('Alterar guarda-corpo do deck', { guardrail: v === 'auto' ? 'auto' : v === 'yes' })}
        hint={deck ? `desnível ${fmt(deck.maxDrop, 2)} m` : undefined}
      />
      <Segmented<'auto' | 'manual'>
        label="Escadas"
        value={manual ? 'manual' : 'auto'}
        options={[{ value: 'auto', label: 'Automática' }, { value: 'manual', label: 'Manual' }]}
        onChange={(v) => setStairs(v === 'auto' ? 'auto' : [{ edge: 'outer', at: round(length / 2, 2), width: 1.2 }])}
        hint={deck ? `${deck.stairs.length} no deck` : undefined}
      />
      {manual ? (
        <div className="space-y-3">
          {stairs.map((st, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
              <SelectField label={`Escada ${i + 1}`} value={st.edge} options={STAIR_EDGES} onChange={(v) => patchStair(i, { edge: v })} />
              <SliderField label="Posição" value={Math.min(st.at, 30)} min={0} max={Math.max(1, st.edge === 'outer' ? length : e.depth)} step={0.05} unit="m" hint="centro, a partir do início da borda" onChange={(v) => patchStair(i, { at: v })} />
              <SliderField label="Largura" value={st.width} min={0.8} max={3} step={0.05} unit="m" onChange={(v) => patchStair(i, { width: v })} />
              <Button variant="outline" size="sm" onClick={() => setStairs(stairs.filter((_, k) => k !== i))}>
                Remover escada
              </Button>
            </div>
          ))}
          {stairs.length < 4 ? (
            <Button variant="outline" size="sm" onClick={() => setStairs([...stairs, { edge: 'outer', at: round(length / 2, 2), width: 1.2 }])}>
              Adicionar escada
            </Button>
          ) : null}
        </div>
      ) : null}

      <SelectField label="Pilares" value={e.support} options={SUPPORTS} onChange={(v) => set('Alterar pilares do deck', { support: v })} hint={e.support === 'auto' && materials.length > 0 ? `auto: ${materials.join(' e ')}` : undefined} />
      <SelectField label="Fundação dos pilares" value={e.footing} options={FOOTINGS} onChange={(v) => set('Alterar fundação do deck', { footing: v })} hint={e.footing === 'auto' && footings.length > 0 ? `auto: ${footings.join(' e ')}` : undefined} />
      <Segmented<Of<'deck'>['boards']> label="Tábuas" value={e.boards} options={BOARDS} onChange={(v) => set('Alterar direção das tábuas', { boards: v })} />

      {deck ? <DeckSummary deck={deck} maxHeight={maxH} /> : null}
    </>
  );
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const STATUS_STYLE = { ok: 'text-emerald-700', warn: 'text-amber-700', fail: 'text-red-700' } as const;
const STATUS_LABEL = { ok: 'ok', warn: 'atenção', fail: 'reprovado' } as const;

/** Resumo do motor: pilares, altura máxima e as verificações com o status de cada uma. */
function DeckSummary({ deck, maxHeight }: { deck: NonNullable<ExtraModel['deck']>; maxHeight: number }) {
  const worst = deck.checks.some((c) => c.status === 'fail') ? 'fail' : deck.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  return (
    <div className="space-y-2" data-testid="deck-summary">
      <Notice tone={worst === 'ok' ? 'info' : worst}>
        {deck.supports.length} pilares · altura máxima {fmt(maxHeight, 2)} m · {deck.joists.length} barrotes · {deck.beams.length} {deck.beams.length === 1 ? 'viga' : 'vigas'}
        {deck.ledger ? ' · ledger na casa' : ' · linha de pilares junto à casa'}
      </Notice>
      <ul className="space-y-1 text-[11px] leading-snug">
        {deck.checks.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2">
            <span className="text-stone-600">
              {c.label}: <span className="tabular-nums">{c.value}</span> <span className="text-stone-400">(limite {c.limit})</span>
            </span>
            <span className={`shrink-0 font-semibold ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
