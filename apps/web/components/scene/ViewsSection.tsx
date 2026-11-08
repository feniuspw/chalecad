'use client';
import { useCallback, useEffect, useState } from 'react';
import { Camera, ChevronDown, Eye, Film, Home, Images, Mountain, Pencil, Plus, Sofa, Square, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Switch, cn } from '@chalecad/ui';
import { getDirector } from '@/lib/three/director';
import {
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
  autoViewpoints,
  loadSavedViews,
  storeSavedViews,
  type SavedView,
  type Viewpoint,
  type ViewpointId,
} from '@/lib/three/viewpoints';
import { useEditor } from '@/lib/store/editor';
import { useSunState } from './useSunState';
import { usePresentationUi } from './presentationUi';
import { cancelTask, flyTo, isBusy, recordVideo, recordingSupported, savePhotos } from './presentationTools';

const ICONS: Record<ViewpointId, typeof Home> = { front: Home, corner: Eye, back: Square, top: Mountain, interior: Sofa };

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Seção "Câmera" do painel do sol: vistas prontas, vistas salvas, fotos em lote e vídeo 360°. */
export function ViewsSection({ compact = false }: { compact?: boolean }) {
  const model = useEditor((s) => s.results?.model);
  const levels = useEditor((s) => s.project.levels);
  const projectId = useEditor((s) => s.projectId);
  const projectName = useEditor((s) => s.project.meta.name);
  const presentation = useEditor((s) => s.viewMode === 'presentation');
  const walk = useEditor((s) => s.walk);
  const task = usePresentationUi((s) => s.task);
  const sun = useSunState();
  const storeKey = projectId ?? `nome:${projectName}`;
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [timelapse, setTimelapse] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => setSaved(loadSavedViews(storeKey)), [storeKey]);
  useEffect(() => setSupported(recordingSupported()), []);

  const viewpoints = useCallback((): Viewpoint[] => {
    if (!model) return [];
    const lens = getDirector()?.lens();
    const ground = [...levels].sort((a, b) => a.elevation - b.elevation)[0];
    return autoViewpoints(model, { ...lens, groundLevelId: ground?.id, groundElevation: ground?.elevation ?? 0 });
  }, [model, levels]);

  const go = useCallback(
    (id: ViewpointId) => {
      if (isBusy() || useEditor.getState().walk) return;
      const v = viewpoints().find((x) => x.id === id);
      if (v) void flyTo(v);
    },
    [viewpoints],
  );

  // atalhos 1 a 5, só na apresentação e fora de campos de texto
  useEffect(() => {
    if (!presentation || walk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const i = '12345'.indexOf(e.key);
      if (e.key.length === 1 && i >= 0) {
        const id = VIEWPOINT_ORDER[i];
        if (id) go(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation, walk, go]);

  const persist = (next: SavedView[]) => {
    setSaved(next);
    if (!storeSavedViews(storeKey, next)) toast.error('Não foi possível guardar a vista neste navegador.');
  };

  const saveCurrent = () => {
    const pose = getDirector()?.current();
    if (!pose) return toast.error('A cena ainda não está pronta.');
    const name = window.prompt('Nome da vista', `Vista ${saved.length + 1}`)?.trim();
    if (!name) return;
    persist([...saved, { id: `v${Date.now().toString(36)}`, name: name.slice(0, 40), position: pose.position, target: pose.target }]);
  };
  const rename = (v: SavedView) => {
    const name = window.prompt('Novo nome da vista', v.name)?.trim();
    if (name) persist(saved.map((x) => (x.id === v.id ? { ...x, name: name.slice(0, 40) } : x)));
  };

  const photos = async () => {
    const n = await savePhotos(viewpoints(), projectName).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar as fotos.');
      return null;
    });
    if (n) toast.success(`${n} fotos salvas em um arquivo .zip.`);
  };
  const video = async () => {
    const corner = viewpoints().find((v) => v.id === 'corner');
    if (!corner) return;
    const ok = await recordVideo(timelapse ? 'timelapse' : 'orbit', corner, sun.times, projectName).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gravar o vídeo.');
      return null;
    });
    if (ok) toast.success('Vídeo salvo.');
  };

  const busy = !!task;
  const disabled = !model || busy;
  // Fotos, vídeo e vistas salvas ficam recolhidos por padrão: o painel do sol não cobre a cena.
  const [more, setMore] = useState(false);
  useEffect(() => {
    try {
      setMore(localStorage.getItem('chalecad.cameraMore') === '1');
    } catch {
      // sem armazenamento: recolhido
    }
  }, []);
  const toggleMore = () =>
    setMore((v) => {
      try {
        localStorage.setItem('chalecad.cameraMore', v ? '0' : '1');
      } catch {
        // ignora
      }
      return !v;
    });

  return (
    <div className="mt-2.5 space-y-2 border-t border-border pt-2.5" aria-label="Câmera">
      <button type="button" onClick={toggleMore} aria-expanded={more} className="flex w-full items-center gap-1.5 text-xs font-medium text-stone-700 hover:text-stone-900">
        <Camera className="size-3.5 text-accent" /> Câmera
        <span className="ml-auto flex items-center gap-0.5 text-[11px] font-normal text-stone-500">
          {more ? 'menos' : 'fotos, vídeo e vistas salvas'}
          <ChevronDown className={cn('size-3 transition-transform', more && 'rotate-180')} />
        </span>
      </button>
      <div className="flex flex-wrap gap-1">
        {VIEWPOINT_ORDER.map((id, i) => {
          const Icon = ICONS[id];
          return (
            <Button key={id} size="sm" variant="outline" className="h-7 gap-1 px-1.5 text-xs" disabled={disabled} onClick={() => go(id)} title={`${VIEWPOINT_LABELS[id]} (tecla ${i + 1})`} data-viewpoint={id}>
              <Icon className="size-3" /> {VIEWPOINT_LABELS[id]}
            </Button>
          );
        })}
      </div>

      {more ? (
      <>
      {saved.length > 0 ? (
        <ul className={cn('space-y-0.5', compact && 'max-h-24 overflow-y-auto')} aria-label="Vistas salvas">
          {saved.map((v) => (
            <li key={v.id} className="flex items-center gap-1">
              <button type="button" className="min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-xs text-stone-700 hover:bg-stone-100" disabled={busy} onClick={() => void flyTo(v)}>
                {v.name}
              </button>
              <button type="button" className="rounded p-1 text-stone-400 hover:text-stone-800" aria-label={`Renomear ${v.name}`} title="Renomear" onClick={() => rename(v)}>
                <Pencil className="size-3" />
              </button>
              <button type="button" className="rounded p-1 text-stone-400 hover:text-red-600" aria-label={`Apagar ${v.name}`} title="Apagar" onClick={() => persist(saved.filter((x) => x.id !== v.id))}>
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button size="sm" variant="outline" className="h-7 w-full gap-1 text-xs" disabled={disabled} onClick={saveCurrent}>
        <Plus className="size-3" /> Salvar esta vista
      </Button>

      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 px-1.5 text-xs" disabled={disabled} onClick={photos} title="Frente, Quina, Fundos e Interior em um .zip">
          <Images className="size-3" /> Salvar 4 fotos
        </Button>
        <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 px-1.5 text-xs" disabled={disabled || !supported} onClick={video} title={supported ? (timelapse ? 'Câmera fixa na Quina e o sol do nascer ao pôr em 10 s' : 'Uma volta em torno da casa em 12 s') : 'Este navegador não grava vídeo da cena (MediaRecorder)'}>
          <Film className="size-3" /> Gravar vídeo 360°
        </Button>
      </div>
      <label className={cn('flex cursor-pointer items-center justify-between gap-2 text-xs text-stone-700', !supported && 'opacity-50')}>
        Do nascer ao pôr do sol
        <Switch checked={timelapse} onCheckedChange={setTimelapse} disabled={!supported || busy} aria-label="Do nascer ao pôr do sol" />
      </label>
      {!supported ? <p className="text-[10px] text-stone-400">Gravação de vídeo indisponível neste navegador.</p> : null}
      </>
      ) : null}
    </div>
  );
}

/** Progresso e cancelar de fotos/vídeo. Fica visível mesmo com os painéis escondidos. */
export function TaskBar() {
  const task = usePresentationUi((s) => s.task);
  if (!task) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-auto absolute top-14 left-1/2 flex w-72 max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-white/92 px-3 py-2 text-xs text-stone-700 shadow-float backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="truncate">{task.kind === 'video' ? `Gravando: ${task.label}` : task.label}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-200">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(task.progress * 100)}%` }} />
        </div>
      </div>
      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={cancelTask}>
        <X className="size-3" /> Cancelar
      </Button>
    </div>
  );
}
