'use client';
import { useState } from 'react';
import { getCatalog } from '@chalecad/catalog';
import { Badge } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { capitalZone, rainSummary, solarPlacement, solarSummary } from '@/lib/three/performance';
import { Notice, Section, SelectField, SwitchField, type Option } from './fields';

const AUTO = 'auto';

/** Desempenho: zona bioclimática (térmico), energia solar e água de chuva. */
export function PerformanceSection({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const update = useEditor((s) => s.update);
  const report = useEditor((s) => s.results?.performance ?? null);
  const model = useEditor((s) => s.results?.model ?? null);
  const perf = project.performance;
  const uf = project.meta.region;
  const capital = capitalZone(getCatalog().constants.performance.thermal.zoneByUF, uf);
  const options: Option<string>[] = [
    { value: AUTO, label: capital ? `Automática (zona ${capital} da capital de ${uf})` : 'Automática' },
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((z) => ({ value: String(z), label: `Zona ${z}` })),
  ];
  const placed = model && report?.solar ? solarPlacement(model, report.solar, getCatalog().constants.performance.solar.moduleArea) : null;
  const on = [perf.solar && 'solar', perf.rainwater && 'chuva'].filter(Boolean);

  return (
    <Section title="Desempenho" open={open} onOpenChange={setOpen} badge={<Badge variant="neutral">{on.length ? on.join(' + ') : report ? `zona ${report.zone}` : 'térmico'}</Badge>}>
      <SelectField
        label="Zona bioclimática"
        value={perf.zone === undefined ? AUTO : String(perf.zone)}
        options={options}
        onChange={(v) =>
          update('Mudar zona bioclimática', (d) => {
            if (v === AUTO) delete d.performance.zone;
            else d.performance.zone = Number(v);
          })
        }
      />
      <p className="-mt-2 text-[11px] text-stone-500">Na serra, a zona costuma ser 1 a 3, mais fria que a da capital. Ajuste pela cidade do terreno (NBR 15220-3).</p>

      <SwitchField
        label="Energia solar"
        description={report?.solar ? solarSummary(report.solar) : 'Painéis fotovoltaicos no telhado, dimensionados pelo consumo.'}
        checked={perf.solar}
        onChange={(v) => update(v ? 'Ligar energia solar' : 'Desligar energia solar', (d) => void (d.performance.solar = v))}
      />
      {perf.solar && placed && placed.layout.missing > 0 ? (
        <Notice tone="warn">
          {placed.layout.missing} de {report?.solar?.modules} módulos não cabem na água do telhado e ficam de fora do 3D.
        </Notice>
      ) : null}

      <SwitchField
        label="Água de chuva"
        description={report?.rain ? rainSummary(report.rain) : 'Captação do telhado para uso não potável, com reservatório.'}
        checked={perf.rainwater}
        onChange={(v) => update(v ? 'Ligar água de chuva' : 'Desligar água de chuva', (d) => void (d.performance.rainwater = v))}
      />
    </Section>
  );
}
