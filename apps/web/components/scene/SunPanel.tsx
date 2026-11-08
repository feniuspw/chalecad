'use client';
import { useEffect, useRef } from 'react';
import { Footprints, ImageDown, Lightbulb, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Slider, Switch } from '@chalecad/ui';
import { compassLabel, formatMinutes } from '@/lib/sun';
import { captureImage } from '@/lib/three/capture';
import { useEditor } from '@/lib/store/editor';
import { Compass } from './Compass';
import { usePresentationUi, type QualityChoice } from './presentationUi';
import { useSunState } from './useSunState';

const QUALITY: { id: QualityChoice; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Começa em Alta e cai para Leve se o FPS ficar baixo' },
  { id: 'high', label: 'Alta', hint: 'Oclusão ambiente, sombras de 4096 px e resolução dupla' },
  { id: 'light', label: 'Leve', hint: 'Sem oclusão ambiente, sombras de 2048 px, resolução 1x' },
];

/** Volta do dia animada: do nascer ao pôr do sol em ~14 s. */
const DAY_SECONDS = 14;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Painel do sol do modo apresentação: data, hora, animação, atalhos, compasso, andar por dentro, salvar imagem. */
export function SunPanel() {
  const sun = useSunState();
  const setSun = useEditor((s) => s.setSun);
  const setWalk = useEditor((s) => s.setWalk);
  const setCameraView = useEditor((s) => s.setCameraView);
  const walk = useEditor((s) => s.walk);
  const hasModel = useEditor((s) => Boolean(s.results?.model));
  const { quality, lamps, playing, fps, setQuality, setLamps, setPlaying } = usePresentationUi();

  // a hora vai de um pouco antes do nascer a um pouco depois do pôr (crepúsculo, para as luzes acesas fazerem sentido)
  const lo = Math.max(0, Math.floor(sun.times.sunrise - 45));
  const hi = Math.min(1439, Math.ceil(sun.times.sunset + 45));
  const sunUp = sun.elevationDeg > -0.83;

  // ao trocar a data (ou o local) mantém a hora dentro do intervalo
  useEffect(() => {
    if (sun.minutes < lo || sun.minutes > hi) setSun({ minutes: clamp(sun.minutes, lo, hi) });
  }, [lo, hi, sun.minutes, setSun]);

  // animação do dia
  const range = useRef({ lo, hi });
  range.current = { lo, hi };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { lo, hi } = range.current;
      const cur = useEditor.getState().sun.minutes;
      const next = cur + ((hi - lo) / DAY_SECONDS) * dt;
      useEditor.getState().setSun({ minutes: next > hi ? lo : next });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useEffect(() => () => usePresentationUi.getState().setPlaying(false), []);

  const quick = (minutes: number) => {
    setPlaying(false);
    setSun({ minutes: clamp(Math.round(minutes), lo, hi) });
  };

  const startWalk = () => {
    setPlaying(false);
    setCameraView('3d');
    setWalk(true);
  };

  const save = async () => {
    const ok = await captureImage().catch(() => false);
    if (ok) toast.success('Imagem salva.');
    else toast.error('Não foi possível salvar a imagem.');
  };

  if (walk) {
    return (
      <div className="pointer-events-auto absolute top-14 left-1/2 flex w-max max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-white/90 px-3 py-2 text-xs text-stone-600 shadow-float backdrop-blur" role="status">
        <Footprints className="size-4 text-accent" />
        <span>
          <strong className="font-medium text-stone-900">Clique na cena</strong> para olhar com o mouse · <kbd className="font-mono">WASD</kbd> ou setas andam · <kbd className="font-mono">Shift</kbd> corre · <kbd className="font-mono">Esc</kbd> sai
        </span>
        <Button size="sm" variant="outline" onClick={() => setWalk(false)}>
          Sair
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-14 left-3 w-[22rem] max-w-[calc(100%-1.5rem)] rounded-xl border border-border bg-white/92 p-3 shadow-float backdrop-blur" aria-label="Painel do sol">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <label htmlFor="sun-date" className="text-xs font-medium text-stone-700">
              Data
            </label>
            <input
              id="sun-date"
              type="date"
              value={sun.date}
              onChange={(e) => e.target.value && setSun({ date: e.target.value })}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-white px-2 text-xs text-stone-800 outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="size-7 shrink-0 p-0" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pausar o dia' : 'Animar o dia'} title={playing ? 'Pausar' : 'Animar o dia'}>
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </Button>
            <Slider
              aria-label="Hora do dia"
              value={[clamp(sun.minutes, lo, hi)]}
              min={lo}
              max={hi}
              step={1}
              onValueChange={([v]) => v !== undefined && setSun({ minutes: v })}
              className="min-w-0 flex-1"
            />
            <span className="w-11 text-right text-sm font-semibold text-stone-900 tabular-nums">{formatMinutes(sun.minutes)}</span>
          </div>
          <div className="flex gap-1">
            {[
              { label: 'Manhã', at: sun.times.sunrise + 150 },
              { label: 'Meio-dia', at: sun.times.solarNoon },
              { label: 'Tarde', at: sun.times.sunset - 150 },
            ].map((q) => (
              <Button key={q.label} size="sm" variant="outline" className="h-7 flex-1 px-1.5 text-xs" onClick={() => quick(q.at)}>
                {q.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Compass northDeg={sun.northDeg} sunAzimuthDeg={sun.azimuthDeg} sunUp={sunUp} />
          <div className="text-center text-[11px] leading-tight text-stone-500 tabular-nums">
            <div>
              Az {Math.round(sun.azimuthDeg)}° {compassLabel(sun.azimuthDeg)}
            </div>
            <div>El {sun.elevationDeg.toFixed(0)}°</div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-700">
          <Lightbulb className="size-3.5 text-amber-500" />
          Luzes acesas
          <Switch checked={lamps} onCheckedChange={setLamps} aria-label="Luzes acesas" />
        </label>
        <div role="group" aria-label="Qualidade" className="flex items-center rounded-md bg-stone-100 p-0.5">
          {QUALITY.map((q) => (
            <button
              key={q.id}
              type="button"
              title={q.hint}
              aria-pressed={quality === q.id}
              onClick={() => setQuality(q.id)}
              className="h-6 rounded px-2 text-[11px] font-medium text-stone-600 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-white aria-pressed:text-stone-900 aria-pressed:shadow-sm"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" className="flex-1" onClick={startWalk} disabled={!hasModel}>
          <Footprints /> Andar por dentro
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={save} disabled={!hasModel}>
          <ImageDown /> Salvar imagem
        </Button>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-stone-400 tabular-nums">
        <span>
          {sun.location.city ?? `${sun.location.lat.toFixed(2)}°, ${sun.location.lon.toFixed(2)}°`} · norte a {Math.round(sun.northDeg)}°
        </span>
        {fps !== null ? <span>{fps} fps</span> : null}
      </div>
    </div>
  );
}
