'use client';
import type { Project } from '@chalecad/engine';
import { Compass } from '@/components/scene/Compass';
import { resolveLocation, ufLocation } from '@/lib/sun';
import { useEditor } from '@/lib/store/editor';
import { Field, Notice, NumberField, Segmented, SliderField } from './fields';

/** Coordenadas e norte da planta (sol do modo apresentação). Vai dentro da seção "Local". */
export function LocationFields({ project }: { project: Project }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const { region, location, northDeg } = project.meta;
  const capital = ufLocation(region);
  const loc = resolveLocation({ region, location });

  const setCoord = (key: 'lat' | 'lon', v: number) =>
    update('Alterar coordenadas', (d) => {
      const cur = d.meta.location ?? { lat: capital.lat, lon: capital.lon };
      d.meta.location = { ...cur, [key]: v };
    });

  return (
    <>
      <Segmented
        label="Coordenadas do sol"
        value={location ? 'custom' : 'capital'}
        options={[
          { value: 'capital', label: `Capital (${capital.city})` },
          { value: 'custom', label: 'Digitar' },
        ]}
        onChange={(v) =>
          update('Alterar local do sol', (d) => {
            if (v === 'capital') delete d.meta.location;
            else d.meta.location = { lat: capital.lat, lon: capital.lon };
          })
        }
        hint="modo apresentação"
      />
      {location ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Latitude" value={location.lat} min={-34} max={6} step={0.01} unit="°" hint="sul negativo" onChange={(v) => setCoord('lat', v)} />
          <NumberField label="Longitude" value={location.lon} min={-75} max={-28} step={0.01} unit="°" hint="oeste negativo" onChange={(v) => setCoord('lon', v)} />
        </div>
      ) : (
        <p className="text-[11px] text-stone-500 tabular-nums">
          {capital.city}: {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}° · UTC{capital.tz}
        </p>
      )}
      <Field label="Norte da planta" hint={`${Math.round(northDeg)}°`}>
        <div className="flex items-center gap-3">
          <Compass northDeg={northDeg} size={72} />
          <div className="min-w-0 flex-1">
            <SliderField
              label="Giro do norte"
              value={northDeg}
              min={0}
              max={360}
              step={5}
              decimals={0}
              unit="°"
              onChange={(v, c) => (c ? updateCoalesced : update)('Alterar norte', (d) => void (d.meta.northDeg = v))}
            />
          </div>
        </div>
      </Field>
      <Notice>Graus no sentido horário a partir dos fundos da planta. 180° (padrão) significa a frente voltada para o norte; 0° põe o norte nos fundos e 90° à direita.</Notice>
    </>
  );
}
