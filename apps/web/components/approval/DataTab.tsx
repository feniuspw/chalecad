'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Switch } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import type { Discipline, Legal, Lot, Professional, UF, Vec2 } from '@chalecad/engine';
import { Term } from '@/components/glossary/Term';
import { docStatus, isCauRegistry, maskCep, maskDoc } from '@/lib/approval/docId';
import { DISCIPLINES, DISCIPLINE_LABEL, STAGE_LABEL, todayIso } from '@/lib/approval/labels';
import { useApprovalUi } from '@/lib/approval/ui';
import { newId } from '@/lib/project/ids';
import { useEditor } from '@/lib/store/editor';
import { NumField, OptNumField, Section, SelectField, TextField } from './fields';
import { LotPreview } from './LotPreview';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/** Grava em `project.legal` com histórico; a mesma etiqueta funde teclas seguidas num só passo de desfazer. */
function useLegalEdit() {
  const legal = useEditor((s) => s.project.legal);
  const set = (field: string, fn: (l: Legal) => void) => useEditor.getState().updateCoalesced(`Dados legais: ${field}`, (d) => fn(d.legal));
  return { legal, set };
}

function docWarn(doc: string): string | null {
  const st = docStatus(doc);
  return st === 'invalid' ? 'CPF/CNPJ com dígito verificador inválido: confira.' : st === 'incomplete' ? 'CPF tem 11 dígitos e CNPJ tem 14.' : null;
}

function PersonFields({ prefix, person, onChange, who }: { prefix: string; person: Legal['owner']; onChange: (k: keyof Legal['owner'], v: string) => void; who: string }) {
  return (
    <>
      <TextField label={`Nome do ${who}`} why="Aparece na ART/RRT, no alvará e no carimbo." fieldKey={`${prefix}.name`} value={person.name} onChange={(v) => onChange('name', v)} />
      <TextField label={`CPF/CNPJ do ${who}`} why="Exigido pelo CREA/CAU e pela prefeitura." fieldKey={`${prefix}.doc`} value={person.doc} onChange={(v) => onChange('doc', v)} mask={maskDoc} warn={docWarn(person.doc)} placeholder="000.000.000-00" />
      <TextField label={`Endereço do ${who}`} why="Endereço de correspondência, não o da obra." value={person.address} onChange={(v) => onChange('address', v)} />
      <TextField label={`E-mail do ${who}`} value={person.email} onChange={(v) => onChange('email', v)} />
      <TextField label={`Telefone do ${who}`} value={person.phone} onChange={(v) => onChange('phone', v)} />
    </>
  );
}

function ProfessionalCard({ p, index }: { p: Professional; index: number }) {
  const { set } = useLegalEdit();
  const edit = (field: string, fn: (x: Professional) => void) => set(`profissional ${index + 1}: ${field}`, (l) => { const x = l.professionals[index]; if (x) fn(x); });
  const regWarn = p.council === 'CAU' && p.registry && !isCauRegistry(p.registry) ? 'O registro no CAU costuma ser A000000-0.' : null;
  return (
    <div className="rounded-md border border-border p-3" data-testid="professional-card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Nome do profissional" value={p.name} onChange={(v) => edit('nome', (x) => void (x.name = v || ' '))} />
        <TextField label="Título" placeholder="Engenheiro Civil" value={p.title} onChange={(v) => edit('título', (x) => void (x.title = v))} />
        <SelectField label="Conselho" value={p.council} onChange={(v) => edit('conselho', (x) => void (x.council = v))} options={[{ value: 'CREA', label: 'CREA' }, { value: 'CAU', label: 'CAU' }]} />
        <TextField label="Registro (CREA/CAU)" value={p.registry} onChange={(v) => edit('registro', (x) => void (x.registry = v))} warn={regWarn} />
        <SelectField label="UF do registro" value={p.uf ?? 'SP'} onChange={(v) => edit('UF', (x) => void (x.uf = v as UF))} options={UFS.map((u) => ({ value: u, label: u }))} />
        <TextField label="Empresa" value={p.company} onChange={(v) => edit('empresa', (x) => void (x.company = v))} />
        <TextField label={p.council === 'CAU' ? 'Nº do RRT' : 'Nº da ART'} why="Depois de emitida no sistema do conselho. Sai nos carimbos das pranchas." value={p.docNumber} onChange={(v) => edit('nº ART/RRT', (x) => void (x.docNumber = v))} />
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-stone-700">Disciplinas</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {DISCIPLINES.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-xs text-stone-700">
              <input
                type="checkbox"
                checked={p.disciplines.includes(d)}
                onChange={(e) =>
                  edit('disciplinas', (x) => {
                    const next: Discipline[] = e.target.checked ? [...x.disciplines, d] : x.disciplines.filter((y) => y !== d);
                    if (next.length > 0) x.disciplines = next;
                  })
                }
              />
              {DISCIPLINE_LABEL[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <Button variant="ghost" size="sm" className="mt-2 text-red-700" onClick={() => useEditor.getState().update(`Remover responsável técnico`, (d) => void d.legal.professionals.splice(index, 1))}>
        <Trash2 /> Remover
      </Button>
    </div>
  );
}

export function DataTab() {
  const { legal, set } = useLegalEdit();
  const design = useEditor((s) => s.project.design);
  const footprint = useEditor((s) => s.results?.model.footprint) as Vec2[] | undefined;
  const stages = getCatalog().constants.approval.stages;
  const root = useRef<HTMLDivElement>(null);
  const focusKey = useApprovalUi((s) => s.focusKey);

  // pendência clicada: rola até o campo (ou a primeira seção que começa com a chave) e foca o controle
  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => {
      const el = root.current?.querySelector<HTMLElement>(`[data-field="${focusKey}"]`) ?? root.current?.querySelector<HTMLElement>(`[data-field^="${focusKey}"]`) ?? root.current?.querySelector<HTMLElement>(`[data-section="${focusKey.split('.').slice(0, 2).join('.')}"]`);
      el?.scrollIntoView({ block: 'center' });
      el?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
      useApprovalUi.getState().clearFocus();
    }, 60);
    return () => clearTimeout(t);
  }, [focusKey]);

  const lot = legal.lot;
  const setLot = (field: string, fn: (l: Lot) => void) => set(`lote: ${field}`, (l) => { if (l.lot) fn(l.lot); });
  const createLot = () => {
    const xs = (footprint ?? []).map((p) => p[0]);
    const w = xs.length ? Math.max(...xs) - Math.min(...xs) : 6;
    const front = 12;
    set('lote', (l) => {
      l.lot = { front, depth: 30, buildingOffset: [Math.round(((front - w) / 2 - (xs.length ? Math.min(...xs) : 0)) * 10) / 10, 5], rotationDeg: 0, pavedArea: 0, streetName: '' };
    });
  };
  const z = legal.zoning;
  const setZ = (field: string, fn: (zz: Legal['zoning']) => void) => set(`zoneamento: ${field}`, (l) => fn(l.zoning));
  const pos = (v: Vec2 | undefined, key: 'septicPosition' | 'wellPosition', label: string) => (
    <>
      {v && lot ? (
        <>
          <NumField label={`${label}: x no lote`} value={v[0]} unit="m" onChange={(n) => set(label, (l) => void (l[key] = [n, l[key]?.[1] ?? 0]))} />
          <NumField label={`${label}: y no lote`} value={v[1]} unit="m" onChange={(n) => set(label, (l) => void (l[key] = [l[key]?.[0] ?? 0, n]))} />
          <Button variant="ghost" size="sm" className="self-end justify-self-start text-red-700" onClick={() => set(label, (l) => void (l[key] = undefined))}>
            <Trash2 /> Tirar {label.toLowerCase()}
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" className="self-end justify-self-start" disabled={!lot} onClick={() => set(label, (l) => void (l[key] = [l.lot ? l.lot.front / 2 : 0, l.lot ? l.lot.depth - 4 : 0]))}>
          <Plus /> Locar {label.toLowerCase()}
        </Button>
      )}
    </>
  );

  return (
    <div ref={root} className="space-y-4 p-4" data-testid="approval-data">
      <Section title="Projeto e proprietário" id="legal-owner">
        <SelectField label="Etapa do projeto" why="Define quais pranchas e memoriais entram (NBR 16636-2)." fieldKey="legal.stage" value={legal.stage} onChange={(v) => set('etapa', (l) => void (l.stage = v))} options={stages.map((s) => ({ value: s.id, label: s.label || STAGE_LABEL[s.id] }))} />
        <SelectField label="Área" why="Urbana pede alvará na prefeitura; rural, INCRA/CCIR." value={legal.area} onChange={(v) => set('área', (l) => void (l.area = v))} options={[{ value: 'urban', label: 'Urbana' }, { value: 'rural', label: 'Rural' }]} />
        <div className="hidden lg:block" />
        <PersonFields prefix="legal.owner" who="proprietário" person={legal.owner} onChange={(k, v) => set(`proprietário: ${k}`, (l) => void (l.owner[k] = v))} />
        <div className="col-span-full flex items-center gap-2" data-field="legal.contractor">
          <Switch
            id="same-contractor"
            aria-label="O contratante é o mesmo que o proprietário"
            checked={legal.contractor === undefined}
            onCheckedChange={(on) => set('contratante', (l) => void (l.contractor = on ? undefined : { ...l.owner }))}
          />
          <label htmlFor="same-contractor" className="text-xs text-stone-700">
            O contratante é o mesmo que o proprietário
          </label>
        </div>
        {legal.contractor ? <PersonFields prefix="legal.contractor" who="contratante" person={legal.contractor} onChange={(k, v) => set(`contratante: ${k}`, (l) => { if (l.contractor) l.contractor[k] = v; })} /> : null}
      </Section>

      <Section title="Endereço e registro do imóvel" id="legal-address">
        <TextField label="Rua da obra" fieldKey="legal.address.street" why="Endereço da obra, para a ART/RRT e o alvará." value={legal.address.street} onChange={(v) => set('endereço: rua', (l) => void (l.address.street = v))} />
        <TextField label="Número" value={legal.address.number} onChange={(v) => set('endereço: número', (l) => void (l.address.number = v))} />
        <TextField label="Complemento" value={legal.address.complement} onChange={(v) => set('endereço: complemento', (l) => void (l.address.complement = v))} />
        <TextField label="Bairro" value={legal.address.district} onChange={(v) => set('endereço: bairro', (l) => void (l.address.district = v))} />
        <TextField label="Cidade" fieldKey="legal.address.city" value={legal.address.city} onChange={(v) => set('endereço: cidade', (l) => void (l.address.city = v))} />
        <TextField label="CEP" value={legal.address.cep} mask={maskCep} onChange={(v) => set('endereço: CEP', (l) => void (l.address.cep = v))} />
        <TextField label="Matrícula do imóvel" fieldKey="legal.address.registry" why="Número da matrícula no cartório de registro de imóveis." value={legal.address.registry} onChange={(v) => set('matrícula', (l) => void (l.address.registry = v))} />
        <TextField label="Cartório" value={legal.address.registryOffice} onChange={(v) => set('cartório', (l) => void (l.address.registryOffice = v))} />
        <TextField label="Inscrição cadastral" why="Inscrição do IPTU (ou CCIR/NIRF em área rural)." fieldKey="legal.address.cadastral" value={legal.address.cadastral} onChange={(v) => set('inscrição', (l) => void (l.address.cadastral = v))} />
        <TextField label="Lote (nº)" value={legal.address.lot} onChange={(v) => set('lote nº', (l) => void (l.address.lot = v))} />
        <TextField label="Quadra" value={legal.address.block} onChange={(v) => set('quadra', (l) => void (l.address.block = v))} />
        <TextField label="Loteamento" value={legal.address.subdivision} onChange={(v) => set('loteamento', (l) => void (l.address.subdivision = v))} />
      </Section>

      <Section title="Concessionárias, abastecimento e prazos" id="legal-utilities">
        <TextField label="Concessionária de energia" why="Define o padrão de entrada e a ficha de carga." value={legal.powerUtility} onChange={(v) => set('concessionária de energia', (l) => void (l.powerUtility = v))} />
        <TextField label="Concessionária de água e esgoto" value={legal.waterUtility} onChange={(v) => set('concessionária de água', (l) => void (l.waterUtility = v))} />
        <SelectField label="Abastecimento de água" why="Poço pede distância mínima da fossa." value={legal.waterSource} onChange={(v) => set('abastecimento', (l) => void (l.waterSource = v))} options={[{ value: 'public', label: 'Rede pública' }, { value: 'well', label: 'Poço' }]} />
        <SelectField label="Esquema de aterramento" why="NBR 5410: define DR e condutor de proteção." value={legal.earthing} onChange={(v) => set('aterramento', (l) => void (l.earthing = v))} options={[{ value: 'TN-S', label: 'TN-S' }, { value: 'TN-C-S', label: 'TN-C-S' }, { value: 'TT', label: 'TT' }]} />
        <TextField type="date" label="Início da obra" value={legal.startDate ?? ''} onChange={(v) => set('início', (l) => void (l.startDate = v || undefined))} />
        <TextField type="date" label="Término previsto" value={legal.endDate ?? ''} onChange={(v) => set('término', (l) => void (l.endDate = v || undefined))} />
        {DISCIPLINES.map((d) => (
          <OptNumField key={d} label={`Contrato: ${DISCIPLINE_LABEL[d]}`} unit="R$" min={0} value={legal.contractValues[d]} why={d === 'architecture' ? 'Valor do contrato de cada atividade, para a ART/RRT.' : undefined} onChange={(v) => set(`contrato ${DISCIPLINE_LABEL[d]}`, (l) => { if (v === undefined) delete l.contractValues[d]; else l.contractValues[d] = v; })} />
        ))}
      </Section>

      <section aria-label="Lote" data-section="legal.lot" data-field="legal.lot" className="rounded-lg border border-border bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900">Lote</h3>
        <p className="mt-1 text-xs text-stone-500">Com o lote, o programa calcula <Term id="taxa_ocupacao">taxa de ocupação</Term>, <Term id="coef_aproveitamento">coeficiente de aproveitamento</Term>, <Term id="taxa_permeabilidade">permeabilidade</Term> e <Term id="recuo">recuos</Term>.</p>
        {!lot ? (
          <Button className="mt-3" size="sm" onClick={createLot} data-testid="lot-create">
            <Plus /> Informar o lote
          </Button>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField label="Testada (largura)" why="Medida da frente do lote, na rua." fieldKey="legal.lot.front" unit="m" min={3} max={1000} value={lot.front} onChange={(n) => setLot('testada', (x) => void (x.front = n))} />
              <NumField label="Profundidade" why="Da frente aos fundos." fieldKey="legal.lot.depth" unit="m" min={3} max={2000} value={lot.depth} onChange={(n) => setLot('profundidade', (x) => void (x.depth = n))} />
              <TextField label="Nome da rua" value={lot.streetName} onChange={(v) => setLot('rua', (x) => void (x.streetName = v))} />
              <NumField label="Área pavimentada" why="Calçadas, garagem e piscina; descontam da permeabilidade." unit="m²" min={0} value={lot.pavedArea} onChange={(n) => setLot('área pavimentada', (x) => void (x.pavedArea = n))} />
              <NumField label="Casa no lote: deslocamento x" why="Distância da divisa esquerda à origem do projeto." unit="m" step={0.1} value={lot.buildingOffset[0]} onChange={(n) => setLot('deslocamento x', (x) => void (x.buildingOffset = [n, x.buildingOffset[1]]))} />
              <NumField label="Casa no lote: deslocamento y" why="Distância da frente à origem do projeto." unit="m" step={0.1} value={lot.buildingOffset[1]} onChange={(n) => setLot('deslocamento y', (x) => void (x.buildingOffset = [x.buildingOffset[0], n]))} />
              <NumField label="Casa no lote: rotação" unit="°" step={1} min={-180} max={180} decimals={0} value={lot.rotationDeg} onChange={(n) => setLot('rotação', (x) => void (x.rotationDeg = n))} />
              <div className="flex items-end gap-2">
                <Switch
                  id="lot-poly"
                  aria-label="Lote com poligonal"
                  checked={!!lot.polygon}
                  onCheckedChange={(on) => setLot('poligonal', (x) => void (x.polygon = on ? [[0, 0], [x.front, 0], [x.front, x.depth], [0, x.depth]] : undefined))}
                />
                <label htmlFor="lot-poly" className="pb-1 text-xs text-stone-700">Poligonal (lote irregular)</label>
              </div>
              {lot.polygon ? (
                <div className="col-span-full space-y-1.5" data-testid="lot-polygon">
                  <p className="text-[11px] text-stone-500">Vértices em metros, no sistema do lote (origem no canto da testada à esquerda, y para dentro).</p>
                  {lot.polygon.map((v, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <NumField label={`Vértice ${i + 1}: x`} unit="m" value={v[0]} onChange={(n) => setLot(`vértice ${i + 1}`, (x) => { const q = x.polygon?.[i]; if (q) x.polygon![i] = [n, q[1]]; })} />
                      <NumField label={`Vértice ${i + 1}: y`} unit="m" value={v[1]} onChange={(n) => setLot(`vértice ${i + 1}`, (x) => { const q = x.polygon?.[i]; if (q) x.polygon![i] = [q[0], n]; })} />
                      <Button variant="ghost" size="sm" aria-label={`Remover vértice ${i + 1}`} disabled={lot.polygon!.length <= 3} onClick={() => setLot('remover vértice', (x) => void x.polygon?.splice(i, 1))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setLot('adicionar vértice', (x) => void x.polygon?.push([x.front / 2, x.depth / 2]))}>
                    <Plus /> Vértice
                  </Button>
                </div>
              ) : null}
              <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-3">{pos(legal.septicPosition, 'septicPosition', 'Fossa')}</div>
              <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-3">{pos(legal.wellPosition, 'wellPosition', 'Poço')}</div>
              <Button variant="ghost" size="sm" className="justify-self-start text-red-700" onClick={() => useEditor.getState().update('Remover lote', (d) => void (d.legal.lot = undefined))}>
                <Trash2 /> Remover o lote
              </Button>
            </div>
            <div>
              <LotPreview lot={lot} zoning={z} footprint={footprint ?? []} />
              <p className="mt-1 text-[11px] text-stone-500">Rua embaixo. Faixas vermelhas: a casa invade o recuo mínimo.</p>
            </div>
          </div>
        )}
      </section>

      <Section
        title="Zoneamento"
        id="legal-zoning"
        note={<span className="font-medium text-amber-800">Estes valores vêm do plano diretor e da lei de zoneamento do seu município: o ChaléCAD não os conhece.</span>}
      >
        <TextField label="Zona" fieldKey="legal.zoning.zone" value={z.zone} onChange={(v) => setZ('zona', (x) => void (x.zone = v))} />
        <OptNumField label="Taxa de ocupação máxima (TO)" fieldKey="legal.zoning.maxOccupancyPct" unit="%" min={0} max={100} value={z.maxOccupancyPct} onChange={(v) => setZ('TO', (x) => void (x.maxOccupancyPct = v))} />
        <OptNumField label="Coeficiente de aproveitamento (CA)" fieldKey="legal.zoning.maxFar" min={0} max={20} value={z.maxFar} onChange={(v) => setZ('CA', (x) => void (x.maxFar = v))} />
        <OptNumField label="Permeabilidade mínima (TP)" fieldKey="legal.zoning.minPermeablePct" unit="%" min={0} max={100} value={z.minPermeablePct} onChange={(v) => setZ('TP', (x) => void (x.minPermeablePct = v))} />
        <OptNumField label="Recuo de frente" fieldKey="legal.zoning.setbackFront" unit="m" min={0} max={50} value={z.setbackFront} onChange={(v) => setZ('recuo frente', (x) => void (x.setbackFront = v))} />
        <OptNumField label="Recuo lateral" fieldKey="legal.zoning.setbackSide" unit="m" min={0} max={50} value={z.setbackSide} onChange={(v) => setZ('recuo lateral', (x) => void (x.setbackSide = v))} />
        <OptNumField label="Recuo de fundos" fieldKey="legal.zoning.setbackBack" unit="m" min={0} max={50} value={z.setbackBack} onChange={(v) => setZ('recuo fundos', (x) => void (x.setbackBack = v))} />
        <OptNumField label="Altura máxima" fieldKey="legal.zoning.maxHeight" unit="m" min={0} max={200} value={z.maxHeight} onChange={(v) => setZ('altura', (x) => void (x.maxHeight = v))} />
        <OptNumField label="Pavimentos máximos" fieldKey="legal.zoning.maxFloors" min={1} max={50} value={z.maxFloors} onChange={(v) => setZ('pavimentos', (x) => void (x.maxFloors = v === undefined ? undefined : Math.round(v)))} />
        <OptNumField label="Pé-direito mínimo" fieldKey="legal.zoning.minCeiling" unit="m" min={2} max={4} value={z.minCeiling} onChange={(v) => setZ('pé-direito', (x) => void (x.minCeiling = v))} />
        <div className="flex items-center gap-2">
          <Switch id="mezz-counts" aria-label="O mezanino conta" checked={z.mezzanineCounts} onCheckedChange={(on) => setZ('mezanino conta', (x) => void (x.mezzanineCounts = on))} />
          <label htmlFor="mezz-counts" className="text-xs text-stone-700">O mezanino conta na área e nos pavimentos</label>
        </div>
        <TextField label="Fonte dos parâmetros" why="Lei, artigo e data da consulta." className="sm:col-span-2" value={z.source} onChange={(v) => setZ('fonte', (x) => void (x.source = v))} />
      </Section>

      <Section title="Solo" id="legal-soil" note={<>A tensão admissível do solo dimensiona o radier. Sem laudo, vale o valor assumido. <Term id="spt">SPT</Term> é a sondagem que mede a resistência do solo.</>}>
        <SelectField label="Origem da tensão do solo" fieldKey="legal.soil" value={legal.soil.source} onChange={(v) => set('solo: origem', (l) => void (l.soil.source = v))} options={[{ value: 'assumed', label: 'Assumida (sem laudo)' }, { value: 'spt', label: 'Sondagem SPT' }, { value: 'other', label: 'Outra fonte' }]} />
        <NumField label="Tensão admissível do solo" why="Mesmo valor das Propriedades do projeto (Projeto > solo)." fieldKey="design.soilBearingKPa" unit="kPa" min={30} max={500} step={5} decimals={0} value={design.soilBearingKPa} onChange={(n) => useEditor.getState().updateCoalesced('Dados legais: tensão admissível', (d) => void (d.design.soilBearingKPa = n))} />
        <TextField label="Referência do laudo" why="Empresa, número e data da sondagem." value={legal.soil.reference} onChange={(v) => set('solo: laudo', (l) => void (l.soil.reference = v))} />
        <NumField label="Furos de sondagem" step={1} min={0} max={50} decimals={0} value={legal.soil.boreholes} onChange={(n) => set('solo: furos', (l) => void (l.soil.boreholes = Math.round(n)))} />
        <OptNumField label="Nível d'água" unit="m" min={0} max={50} value={legal.soil.waterTableDepth} onChange={(v) => set('solo: nível d’água', (l) => void (l.soil.waterTableDepth = v))} why="Profundidade em que a água aparece; vazio = não encontrado." />
        <OptNumField label="Teste de percolação" fieldKey="legal.percolationMinPerCm" unit="min/cm" min={0} max={1000} value={legal.percolationMinPerCm} onChange={(v) => set('percolação', (l) => void (l.percolationMinPerCm = v))} why="Define se o solo absorve o esgoto tratado." />
      </Section>

      <section aria-label="Responsáveis técnicos" data-field="legal.professionals" className="rounded-lg border border-border bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900">Responsáveis técnicos</h3>
        <p className="mt-1 text-xs text-stone-500">Quem assina cada disciplina. A <Term id="art">ART</Term> (CREA) ou o <Term id="rrt">RRT</Term> (CAU) é emitida por eles.</p>
        <div className="mt-3 space-y-3">
          {legal.professionals.map((p, i) => (
            <ProfessionalCard key={p.id} p={p} index={i} />
          ))}
          <Button
            variant="outline"
            size="sm"
            data-testid="add-professional"
            onClick={() =>
              useEditor.getState().update('Adicionar responsável técnico', (d) => {
                d.legal.professionals.push({ id: newId('u'), name: 'Novo profissional', title: '', council: 'CREA', registry: '', company: '', companyRegistry: '', disciplines: ['structure'], docNumber: '' });
              })
            }
          >
            <Plus /> Adicionar profissional
          </Button>
        </div>
      </section>

      <SheetsSection />
    </div>
  );
}

function SheetsSection() {
  const { legal, set } = useLegalEdit();
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const nextCode = `R${String(legal.revisions.length).padStart(2, '0')}`;
  return (
    <Section title="Pranchas" id="legal-sheets">
      <SelectField label="Formato" why="Automático usa o menor formato que cabe na escala." value={legal.sheetFormat} onChange={(v) => set('formato das pranchas', (l) => void (l.sheetFormat = v))} options={[{ value: 'auto', label: 'Automático' }, ...(['A0', 'A1', 'A2', 'A3'] as const).map((f) => ({ value: f, label: f }))]} />
      <TextField label="Desenhista (iniciais)" why="Vai no carimbo." value={legal.drawnBy} maxLength={40} onChange={(v) => set('desenhista', (l) => void (l.drawnBy = v))} />
      <TextField label="Conferente (iniciais)" value={legal.checkedBy} maxLength={40} onChange={(v) => set('conferente', (l) => void (l.checkedBy = v))} />
      <div className="col-span-full space-y-2">
        <p className="text-xs font-medium text-stone-700">Revisões</p>
        {legal.revisions.length === 0 ? <p className="text-xs text-stone-500">Nenhuma revisão registrada.</p> : null}
        {legal.revisions.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-stone-700">
            <span className="w-10 font-medium">{r.code}</span>
            <span className="w-24 tabular-nums">{r.date.split('-').reverse().join('/')}</span>
            <span className="flex-1">{r.description}</span>
            <Button variant="ghost" size="sm" aria-label={`Remover revisão ${r.code}`} onClick={() => useEditor.getState().update('Remover revisão', (d) => void d.legal.revisions.splice(i, 1))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Código" placeholder={nextCode} value={code} onChange={setCode} maxLength={8} className="w-24" />
          <TextField label="Descrição da revisão" value={desc} onChange={setDesc} className="min-w-64 flex-1" maxLength={200} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              useEditor.getState().update('Adicionar revisão', (d) => void d.legal.revisions.push({ code: code.trim() || nextCode, date: todayIso(), description: desc }));
              setCode('');
              setDesc('');
            }}
          >
            <Plus /> Adicionar {code.trim() || nextCode}
          </Button>
        </div>
      </div>
    </Section>
  );
}
