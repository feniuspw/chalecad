'use client';
import type { ReactNode } from 'react';
import { Mountain, PencilRuler, Shovel, Trash2, Truck } from 'lucide-react';
import { getCatalog } from '@chalecad/catalog';
import type { Project, Site } from '@chalecad/engine';
import { Badge, Button } from '@chalecad/ui';
import { useTerrainUi } from '@/components/scene/tools/terrain/store';
import { fmt } from '@/lib/project/format';
import { pctToDeg } from '@/lib/project/geometry';
import { makeSlopedSite, WALL_REASON_LABEL, WALL_TYPE_LABEL, wallMaterialCosts } from '@/lib/project/terrain';
import { useEditor } from '@/lib/store/editor';
import { DownhillPicker } from './DownhillPicker';
import { Notice, NumberField, Section, Segmented, SliderField, SwitchField } from './fields';
import { usePanelUi } from './ui-state';

type Sloped = Extract<Site, { type: 'sloped' }>;

function Stat({ icon, label, value, hint }: { icon?: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[11px] text-stone-500">
        {icon}
        {label}
      </dt>
      <dd className="text-sm font-semibold text-stone-900 tabular-nums">{value}</dd>
      {hint ? <p className="text-[10px] text-stone-400">{hint}</p> : null}
    </div>
  );
}

/** Resumo do movimento de terra, vindo de `results.terrain`. */
export function TerrainSummary() {
  const t = useEditor((s) => s.results?.terrain);
  const stale = useEditor((s) => s.revision !== s.computedRevision);
  if (!t) return <Notice>O resumo de corte e aterro aparece assim que o cálculo terminar.</Notice>;
  return (
    <div className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-live="polite">
      <dl className="grid grid-cols-3 gap-2">
        <Stat icon={<Shovel className="size-3" />} label="Corte" value={`${fmt(t.cutVolume, 1)} m³`} />
        <Stat label="Aterro" value={`${fmt(t.fillVolume, 1)} m³`} />
        <Stat icon={<Truck className="size-3" />} label="Exportação" value={`${fmt(t.exportVolume, 1)} m³`} hint={t.truckLoads > 0 ? `${fmt(t.truckLoads, 0)} viagens` : undefined} />
      </dl>
      <p className="mt-2 text-[11px] text-stone-500 tabular-nums">
        Cota do platô {fmt(t.platformZ, 2)} m · talude {fmt(t.slopeArea, 0)} m² · máquina {fmt(t.machineDays, 1)} diária(s)
        {t.importVolume > 0 ? ` · importar ${fmt(t.importVolume, 1)} m³` : ''}
      </p>
    </div>
  );
}

type EdgeMode = 'auto' | 'slope' | 'wall';
const EDGE_OPTIONS: { value: EdgeMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'slope', label: 'Talude' },
  { value: 'wall', label: 'Muro' },
];

/** Áreas aplainadas (pads), bordas do platô da casa e ferramenta "Aplainar área". */
function PadsPanel({ site, patch }: { site: Sloped; patch: (label: string, recipe: (s: Sloped) => void, coalesce?: boolean) => void }) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const results = useEditor((s) => s.results);
  const mode = useTerrainUi((s) => s.mode);
  const setMode = useTerrainUi((s) => s.setMode);
  const selected = useTerrainUi((s) => s.selectedPadId);
  const selectPad = useTerrainUi((s) => s.selectPad);
  const active = tool === 'terrain';
  const areas = new Map((results?.terrain?.pads ?? []).map((p) => [p.id, p.area]));
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Áreas aplainadas</h4>
      <p className="-mt-1 text-[11px] text-stone-500">Plataformas niveladas além da casa (garagem, quintal, piscina). Onde o talude não cabe, o programa sugere muro de arrimo.</p>
      <div className="flex gap-2">
        <Button size="sm" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={() => setTool(active ? 'select' : 'terrain')} className="flex-1">
          <PencilRuler className="size-3.5" /> Aplainar área <span className="ml-1 opacity-60">G</span>
        </Button>
      </div>
      {active ? (
        <Segmented<'rect' | 'poly'>
          label="Desenho"
          value={mode}
          options={[
            { value: 'rect', label: 'Retângulo' },
            { value: 'poly', label: 'Polígono' },
          ]}
          onChange={setMode}
        />
      ) : null}
      {site.pads.length === 0 ? <p className="text-[11px] text-stone-500">Nenhuma área ainda. Use “Aplainar área” e desenhe na planta.</p> : null}
      <ul className="space-y-2">
        {site.pads.map((pad, i) => (
          <li key={pad.id} className={`space-y-2 rounded-lg border bg-white p-2 ${pad.id === selected ? 'border-amber-400' : 'border-border'}`}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => selectPad(pad.id === selected ? null : pad.id)} className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-stone-800">
                {pad.name || `Área ${i + 1}`}
              </button>
              <span className="text-[11px] text-stone-500 tabular-nums">{fmt(areas.get(pad.id) ?? 0, 1)} m²</span>
              <button
                type="button"
                aria-label={`Apagar ${pad.name || 'área'}`}
                onClick={() => {
                  if (pad.id === selected) selectPad(null);
                  patch('Apagar área aplainada', (s) => void (s.pads = s.pads.filter((p) => p.id !== pad.id)));
                }}
                className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Nível (m)"
                value={pad.level}
                min={-10}
                max={10}
                step={0.05}
                hint="0 = piso da casa"
                onChange={(v) => patch('Alterar nível da área aplainada', (s) => void (s.pads.find((p) => p.id === pad.id)!.level = v))}
              />
              <Segmented<EdgeMode>
                label="Bordas"
                value={pad.edges}
                options={EDGE_OPTIONS}
                onChange={(v) => patch('Alterar bordas da área aplainada', (s) => void (s.pads.find((p) => p.id === pad.id)!.edges = v))}
              />
            </div>
          </li>
        ))}
      </ul>
      <Segmented<EdgeMode>
        label="Bordas do platô da casa"
        value={site.edges}
        hint="Auto: muro onde o talude não cabe"
        options={EDGE_OPTIONS}
        onChange={(v) => patch('Alterar bordas do platô', (s) => void (s.edges = v))}
      />
    </div>
  );
}

/** Tipo e drenagem dos muros gerados e resumo dos muros sugeridos (comprimento, altura, tipo e custo). */
function RetainingPanel({ site, patch }: { site: Sloped; patch: (label: string, recipe: (s: Sloped) => void, coalesce?: boolean) => void }) {
  const results = useEditor((s) => s.results);
  const selectedWall = useTerrainUi((s) => s.selectedWallId);
  const selectWall = useTerrainUi((s) => s.selectWall);
  const walls = results?.terrain?.walls ?? [];
  const costs = results ? wallMaterialCosts(results, site.retaining.drainage, getCatalog()) : {};
  const total = walls.reduce((s, w) => s + w.length, 0);
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Muros de arrimo</h4>
      <Segmented<'auto' | 'block' | 'concrete' | 'gabion'>
        label="Tipo dos muros"
        value={site.retaining.type}
        hint={site.retaining.type === 'auto' ? 'pela altura' : undefined}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'block', label: 'Bloco' },
          { value: 'concrete', label: 'Concreto' },
          { value: 'gabion', label: 'Gabião' },
        ]}
        onChange={(v) => patch('Alterar tipo dos muros de arrimo', (s) => void (s.retaining.type = v))}
      />
      <SwitchField label="Drenagem atrás dos muros de corte" checked={site.retaining.drainage} onChange={(v) => patch('Alterar drenagem dos muros', (s) => void (s.retaining.drainage = v))} />
      {walls.length === 0 ? (
        <p className="text-[11px] text-stone-500">Nenhum muro necessário: os taludes cabem no terreno.</p>
      ) : (
        <>
          <p className="text-[11px] text-stone-500 tabular-nums">
            {walls.length} muro(s), {fmt(total, 1)} m no total. Muros altos exigem projeto geotécnico (NBR 11682).
          </p>
          <ul className="space-y-1">
            {walls.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  aria-pressed={w.id === selectedWall}
                  onClick={() => selectWall(w.id === selectedWall ? null : w.id)}
                  className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-left text-[11px] text-stone-700 hover:bg-stone-50 aria-pressed:border-amber-400"
                >
                  <span className="font-semibold">{w.id.replace('terrain-', '')}</span> · {w.side === 'cut' ? 'corte' : 'aterro'} · {fmt(w.length, 1)} m · até {fmt(w.maxHeight)} m · {WALL_TYPE_LABEL[w.type]}
                  <span className="block text-stone-500">
                    {WALL_REASON_LABEL[w.reason]}
                    {costs[w.id] != null ? ` · material ≈ R$ ${fmt(costs[w.id]!, 0)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function TerrainSection({ project }: { project: Project }) {
  const open = usePanelUi((s) => s.open.terrain);
  const setOpen = usePanelUi((s) => s.setOpen);
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const platformZ = useEditor((s) => s.results?.terrain?.platformZ);
  const site = project.site;

  const patch = (label: string, recipe: (s: Sloped) => void, coalesce = false) =>
    (coalesce ? updateCoalesced : update)(label, (d) => {
      if (d.site.type === 'sloped') recipe(d.site);
    });

  const margins = site.type === 'sloped' ? site.platformMargin : null;
  const manual = site.type === 'sloped' && site.platformElevation !== 'auto';

  return (
    <Section
      title="Terreno"
      open={open}
      onOpenChange={(v) => setOpen('terrain', v)}
      badge={site.type === 'sloped' ? <Badge variant="neutral">{fmt(site.slopePct, 0)}%</Badge> : <Badge variant="neutral">plano</Badge>}
    >
      <Segmented<'flat' | 'sloped'>
        label="Tipo de terreno"
        value={site.type}
        options={[
          { value: 'flat', label: 'Plano' },
          { value: 'sloped', label: 'Inclinado' },
        ]}
        onChange={(v) =>
          update(v === 'flat' ? 'Terreno plano' : 'Terreno inclinado', (d) => {
            d.site = v === 'flat' ? { type: 'flat' } : makeSlopedSite();
          })
        }
      />

      {site.type === 'flat' ? (
        <Notice>Sem movimento de terra. Escolha “Inclinado” para calcular corte, aterro, taludes e bota-fora.</Notice>
      ) : (
        <>
          <SliderField
            label="Inclinação do terreno"
            value={site.slopePct}
            min={0}
            max={100}
            step={1}
            decimals={0}
            unit="%"
            hint={`≈ ${fmt(pctToDeg(site.slopePct), 1)}°`}
            onChange={(v, c) => patch('Alterar inclinação do terreno', (s) => void (s.slopePct = v), c)}
          />
          {site.slopePct > 30 ? <Notice tone="warn">Acima de 30% o terreno costuma pedir sondagem e projeto de contenção.</Notice> : null}
          <DownhillPicker value={site.downhillAzimuthDeg} onChange={(v, c) => patch('Alterar direção da descida', (s) => void (s.downhillAzimuthDeg = v), c)} />

          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Margens do platô</h4>
            <p className="-mt-1 text-[11px] text-stone-500">Folga de terreno nivelado além das paredes, em cada lado.</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {margins
                ? (
                    [
                      ['front', 'Frente'],
                      ['back', 'Fundos'],
                      ['left', 'Esquerda'],
                      ['right', 'Direita'],
                    ] as const
                  ).map(([k, label]) => (
                    <NumberField key={k} label={label} value={margins[k]} min={0} max={30} step={0.5} unit="m" onChange={(v) => patch(`Alterar margem do platô (${label.toLowerCase()})`, (s) => void (s.platformMargin[k] = v))} />
                  ))
                : null}
            </div>
          </div>

          <Segmented<'auto' | 'manual'>
            label="Cota do platô"
            value={manual ? 'manual' : 'auto'}
            hint={platformZ !== undefined ? `${fmt(platformZ, 2)} m` : undefined}
            options={[
              { value: 'auto', label: 'Automática' },
              { value: 'manual', label: 'Manual' },
            ]}
            onChange={(v) =>
              patch('Alterar cota do platô', (s) => {
                s.platformElevation = v === 'auto' ? 'auto' : Math.round(Math.max(-10, Math.min(10, platformZ ?? 0)) * 20) / 20;
              })
            }
          />
          {manual && site.platformElevation !== 'auto' ? (
            <SliderField
              label="Cota manual"
              value={site.platformElevation}
              min={-10}
              max={10}
              step={0.05}
              unit="m"
              hint="em relação ao terreno no centro da casa"
              onChange={(v, c) => patch('Alterar cota do platô', (s) => void (s.platformElevation = v), c)}
            />
          ) : (
            <p className="-mt-2 text-[11px] text-stone-500">A cota automática equilibra corte e aterro para gastar o mínimo de terra.</p>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Taludes</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Corte (H:V)" value={site.cutSlopeHV} min={0.2} max={4} step={0.1} hint={`${fmt(pctToDeg(100 / site.cutSlopeHV), 0)}°`} onChange={(v) => patch('Alterar talude de corte', (s) => void (s.cutSlopeHV = v))} />
              <NumberField label="Aterro (H:V)" value={site.fillSlopeHV} min={0.5} max={4} step={0.1} hint={`${fmt(pctToDeg(100 / site.fillSlopeHV), 0)}°`} onChange={(v) => patch('Alterar talude de aterro', (s) => void (s.fillSlopeHV = v))} />
            </div>
            <p className="text-[11px] text-stone-500">H:V = metros na horizontal para cada metro de altura. Corte 1:1 e aterro 1,5:1 são usuais. Cortes altos pedem muro de arrimo.</p>
          </div>

          <PadsPanel site={site} patch={patch} />
          <RetainingPanel site={site} patch={patch} />

          <SliderField
            label="Distância do bota-fora"
            value={site.disposalDistanceKm}
            min={0}
            max={200}
            step={1}
            decimals={0}
            unit="km"
            hint="custo do transporte de terra"
            onChange={(v, c) => patch('Alterar distância do bota-fora', (s) => void (s.disposalDistanceKm = v), c)}
          />

          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-700 uppercase">
              <Mountain className="size-3.5 text-stone-400" /> Movimento de terra
            </h4>
            <TerrainSummary />
          </div>
        </>
      )}
    </Section>
  );
}
