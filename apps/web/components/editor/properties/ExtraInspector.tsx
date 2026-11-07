'use client';
import { Copy } from 'lucide-react';
import { Button } from '@chalecad/ui';
import type { Extra, Project } from '@chalecad/engine';
import { toast } from 'sonner';
import { duplicateExtra, extraLabel, extraSummary, findExtra, patchExtra, sideLength, SIDE_LABELS, type Side } from '@/lib/project/extras';
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

      </Body>
    </>
  );
}

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
  const sideLen = sideLength(project, e.side);
  const fullFacade = e.length === undefined;
  const maxLen = Math.max(1, sideLen - e.offset);
  return (
    <>
      <Segmented<Side> label="Lado da casa" value={e.side} options={SIDES} onChange={(v) => set('Mudar lado do deck', { side: v, offset: 0, length: undefined })} hint={`fachada de ${fmt(sideLen, 1)} m`} />
      <SwitchField label="Fachada inteira" description="Deck do comprimento da parede" checked={fullFacade} onChange={(v) => set('Alterar comprimento do deck', { length: v ? undefined : Math.min(sideLen, 4) })} />
      {!fullFacade ? <SliderField label="Comprimento" value={Math.min(e.length ?? maxLen, maxLen)} min={1} max={Math.max(1.1, maxLen)} step={0.1} unit="m" onChange={slider('Alterar comprimento', 'length')} /> : null}
      <SliderField label="Recuo da lateral" value={Math.min(e.offset, Math.max(0, sideLen - 1))} min={0} max={Math.max(0.1, sideLen - 1)} step={0.1} unit="m" hint="do início da fachada" onChange={slider('Mover deck', 'offset')} />
      <SliderField label="Profundidade" value={e.depth} min={0.8} max={6} step={0.1} unit="m" hint="para fora da parede" onChange={slider('Alterar profundidade', 'depth')} />
      <SliderField label="Altura do piso" value={e.elevation} min={0} max={3} step={0.05} unit="m" hint="acima do terreno" onChange={slider('Alterar altura do piso', 'elevation')} />
      <SwitchField label="Coberta" description="Telhado de uma água sobre o deck, com pilares" checked={e.covered} onChange={(v) => set(v ? 'Cobrir deck' : 'Descobrir deck', { covered: v })} />
      <SwitchField label="Guarda-corpo" description="Nas bordas livres do deck" checked={e.guardrail} onChange={(v) => set(v ? 'Incluir guarda-corpo do deck' : 'Remover guarda-corpo do deck', { guardrail: v })} />
    </>
  );
}
