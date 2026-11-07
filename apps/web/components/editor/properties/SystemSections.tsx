'use client';
import { useMemo } from 'react';
import type { Project, UF } from '@chalecad/engine';
import { getCatalog, type Catalog, type Profile } from '@chalecad/catalog';
import { hasRidgeAxis } from '@/lib/project/edit';
import { fmt } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { Section, Segmented, SelectField, SliderField, SwitchField, type Option } from './fields';
import { usePanelUi } from './ui-state';
import type { SectionId } from '@/lib/project/selection';

function useSection(id: SectionId) {
  const open = usePanelUi((s) => s.open[id]);
  const setOpen = usePanelUi((s) => s.setOpen);
  return { open, onOpenChange: (v: boolean) => setOpen(id, v) };
}

const useCatalog = (): Catalog => useMemo(() => getCatalog(), []);

const dec = (n: number) => String(n).replace('.', ',');
const profileOption = (p: Profile): Option<string> => ({
  value: p.id,
  label: p.family === 'Cr' ? `Cartola ${p.web}×${p.flange}×${dec(p.thickness)}` : `${p.family} ${p.web}×${p.flange}×${dec(p.thickness)}`,
  hint: `${fmt(p.massPerM, 2)} kg/m`,
});

// Faixas de alma por uso (mm): montante de parede, viga de piso e caibro.
const WEB_RANGE = { wallStud: [90, 140], joist: [140, 250], rafter: [90, 200] } as const;

function options(cat: Catalog, family: Profile['family'], range?: readonly [number, number], keep?: string): Option<string>[] {
  return cat.profiles
    .filter((p) => p.family === family && (!range || (p.web >= range[0] && p.web <= range[1]) || p.id === keep))
    .map(profileOption);
}

// ---------------------------------------------------------------------------
// Sistema construtivo
// ---------------------------------------------------------------------------

export function SystemSection({ project }: { project: Project }) {
  const section = useSection('system');
  const cat = useCatalog();
  const update = useEditor((s) => s.update);
  const sys = project.system;
  const asm = (kind: string): Option<string>[] => cat.assemblies.filter((a) => a.kind === kind).map((a) => ({ value: a.id, label: a.name.replace(/^[^:]+:\s*/, '') }));

  return (
    <Section title="Sistema construtivo" {...section}>
      <Segmented<0.4 | 0.6>
        label="Espaçamento dos montantes"
        value={sys.studSpacing}
        options={[
          { value: 0.4, label: '40 cm' },
          { value: 0.6, label: '60 cm' },
        ]}
        onChange={(v) => update('Alterar espaçamento dos montantes', (d) => void (d.system.studSpacing = v))}
        hint={sys.studSpacing === 0.4 ? 'mais rígido, mais aço' : 'mais econômico'}
      />
      <SelectField
        label="Perfil do montante"
        value={sys.profiles.wallStud}
        options={options(cat, 'Ue', WEB_RANGE.wallStud, sys.profiles.wallStud)}
        onChange={(id) =>
          update('Alterar perfil do montante', (d) => {
            d.system.profiles.wallStud = id;
            // A guia acompanha o montante (mesma alma e espessura).
            const stud = cat.profiles.find((p) => p.id === id);
            const track = stud && cat.profiles.find((p) => p.family === 'U' && p.web === stud.web && p.thickness === stud.thickness);
            if (track) d.system.profiles.wallTrack = track.id;
          })
        }
      />
      <p className="-mt-2 text-[11px] text-stone-500">Guia: {sys.profiles.wallTrack} (acompanha o montante)</p>
      <SelectField
        label="Perfil da viga do mezanino"
        value={sys.profiles.joist}
        options={options(cat, 'Ue', WEB_RANGE.joist, sys.profiles.joist)}
        onChange={(id) => update('Alterar perfil da viga', (d) => void (d.system.profiles.joist = id))}
      />
      <SelectField
        label="Perfil do caibro"
        value={sys.profiles.rafter}
        options={options(cat, 'Ue', WEB_RANGE.rafter, sys.profiles.rafter)}
        onChange={(id) => update('Alterar perfil do caibro', (d) => void (d.system.profiles.rafter = id))}
      />
      <SelectField
        label="Terça / cartola"
        value={sys.profiles.purlin}
        options={options(cat, 'Cr', undefined, sys.profiles.purlin)}
        onChange={(id) => update('Alterar terça', (d) => void (d.system.profiles.purlin = id))}
      />
      <Segmented<'osb' | 'strap'>
        label="Contraventamento"
        value={sys.bracing}
        options={[
          { value: 'osb', label: 'Placa OSB' },
          { value: 'strap', label: 'Fitas em X' },
        ]}
        onChange={(v) => update('Alterar contraventamento', (d) => void (d.system.bracing = v))}
      />
      <SelectField label="Parede externa" value={sys.assemblies.exterior} options={asm('wall_exterior')} onChange={(id) => update('Alterar parede externa', (d) => void (d.system.assemblies.exterior = id))} />
      <SelectField label="Parede interna" value={sys.assemblies.interior} options={asm('wall_interior')} onChange={(id) => update('Alterar parede interna', (d) => void (d.system.assemblies.interior = id))} />
      <SelectField label="Parede de área molhada" value={sys.assemblies.wet} options={asm('wall_wet')} onChange={(id) => update('Alterar parede molhada', (d) => void (d.system.assemblies.wet = id))} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Cobertura
// ---------------------------------------------------------------------------

export function RoofSection({ project }: { project: Project }) {
  const section = useSection('roof');
  const cat = useCatalog();
  const update = useEditor((s) => s.update);
  const roofing: Option<string>[] = cat.materials
    .filter((m) => m.category === 'roofing' && m.baseUnit === 'm2')
    .map((m) => ({ value: m.id, label: m.name }));
  const fixedAxis = !hasRidgeAxis(project.typology);
  return (
    <Section title="Cobertura" {...section}>
      <SelectField
        label="Telha"
        value={project.roof.cladding}
        options={roofing.some((o) => o.value === project.roof.cladding) ? roofing : [...roofing, { value: project.roof.cladding, label: project.roof.cladding }]}
        onChange={(id) => update('Alterar telha', (d) => void (d.roof.cladding = id))}
      />
      <Segmented<'depth' | 'width'>
        label="Eixo da cumeeira"
        value={project.roof.ridgeAxis}
        options={[
          { value: 'depth', label: 'Profundidade', disabled: false },
          { value: 'width', label: 'Largura', disabled: fixedAxis },
        ]}
        onChange={(v) => update('Alterar eixo da cumeeira', (d) => void (d.roof.ridgeAxis = v))}
        hint={fixedAxis ? 'definido pela tipologia' : undefined}
      />
      <SwitchField label="Calhas" description="Calha e rufos no beiral" checked={project.roof.gutters} onChange={(on) => update(on ? 'Incluir calhas' : 'Remover calhas', (d) => void (d.roof.gutters = on))} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Fundação
// ---------------------------------------------------------------------------

export function FoundationSection({ project }: { project: Project }) {
  const section = useSection('foundation');
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const f = project.system.foundation;
  const set = (label: string, key: 'thickness' | 'border' | 'edgeBeamDepth') => (v: number, c: boolean) => (c ? updateCoalesced : update)(label, (d) => void (d.system.foundation[key] = v));
  return (
    <Section title="Fundação (radier)" {...section}>
      <SliderField label="Espessura do radier" value={f.thickness} min={0.08} max={0.3} step={0.01} scale={100} unit="cm" decimals={0} onChange={set('Alterar espessura do radier', 'thickness')} />
      <SliderField label="Borda além das paredes" value={f.border} min={0} max={0.5} step={0.01} scale={100} unit="cm" decimals={0} onChange={set('Alterar borda do radier', 'border')} />
      <SliderField label="Viga de borda (profundidade)" value={f.edgeBeamDepth} min={0} max={0.6} step={0.01} scale={100} unit="cm" decimals={0} onChange={set('Alterar viga de borda', 'edgeBeamDepth')} hint="0 = sem viga" />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Local
// ---------------------------------------------------------------------------

const UF_NAMES: Record<UF, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
export const UF_OPTIONS: Option<UF>[] = (Object.keys(UF_NAMES) as UF[]).map((uf) => ({ value: uf, label: `${uf} · ${UF_NAMES[uf]}` }));

const TERRAIN_OPTIONS: Option<string>[] = [
  { value: '1', label: '1 · Mar aberto, planície lisa' },
  { value: '2', label: '2 · Campo aberto, poucos obstáculos' },
  { value: '3', label: '3 · Subúrbio, obstáculos baixos' },
  { value: '4', label: '4 · Cidade, obstáculos médios' },
  { value: '5', label: '5 · Centro urbano, edifícios altos' },
];

export function SiteSection({ project }: { project: Project }) {
  const section = useSection('site');
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const d0 = project.design;
  return (
    <Section title="Local" {...section}>
      <SelectField label="Estado (UF)" value={project.meta.region} options={UF_OPTIONS} onChange={(uf) => update('Alterar estado', (d) => void (d.meta.region = uf))} hint="preços e referências" />
      <SliderField
        label="Velocidade básica do vento (V₀)"
        value={d0.windV0}
        min={25}
        max={55}
        step={1}
        decimals={0}
        unit="m/s"
        onChange={(v, c) => (c ? updateCoalesced : update)('Alterar vento V₀', (d) => void (d.design.windV0 = v))}
        hint="NBR 6123"
      />
      <SelectField
        label="Categoria do terreno"
        value={String(d0.terrainCategory)}
        options={TERRAIN_OPTIONS}
        onChange={(v) => update('Alterar categoria do terreno', (d) => void (d.design.terrainCategory = Number(v) as 1 | 2 | 3 | 4 | 5))}
      />
      <SliderField
        label="Tensão admissível do solo"
        value={d0.soilBearingKPa}
        min={30}
        max={500}
        step={10}
        decimals={0}
        unit="kPa"
        onChange={(v, c) => (c ? updateCoalesced : update)('Alterar tensão do solo', (d) => void (d.design.soilBearingKPa = v))}
        hint={d0.soilBearingKPa === 100 ? 'padrão sem sondagem' : undefined}
      />
    </Section>
  );
}
