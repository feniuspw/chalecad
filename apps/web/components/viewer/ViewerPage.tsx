'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileDown, FolderKanban, ImageDown, Loader2, PencilRuler, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@chalecad/ui';
import { DISCLAIMER, type Project, type Results } from '@chalecad/engine';
import { ArtNotice } from '@/components/ArtNotice';
import { Logo } from '@/components/Logo';
import { SunPanel } from '@/components/scene/SunPanel';
import { Viewport } from '@/components/scene/Viewport';
import { useEngine } from '@/hooks/useEngine';
import { exportPdf } from '@/lib/pdf';
import { deriveLevels, planSvg } from '@/lib/plan2d';
import { getStorage } from '@/lib/storage';
import { useEditor } from '@/lib/store/editor';
import { captureImage } from '@/lib/three/capture';
import { openForViewing } from './openForViewing';
import { viewerSummary, type ViewerSummary } from './summary';
import { useViewerDevice } from './useNarrow';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; id: string };

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-stone-50 p-6">
      <div className="max-w-sm space-y-4 text-center">
        <Logo className="justify-center" />
        <TriangleAlert className="mx-auto size-8 text-warn" aria-hidden />
        <h1 className="text-lg font-semibold text-stone-900">{title}</h1>
        <p className="text-sm text-stone-600">{text}</p>
        <Button asChild>
          <Link href="/projetos">
            <FolderKanban /> Ver meus projetos
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <dt className="text-[11px] text-stone-500">{label}</dt>
      <dd className={cn('tabular-nums text-stone-900', strong ? 'text-lg font-semibold' : 'text-sm font-medium')}>{value}</dd>
    </div>
  );
}

function PlanTab({ project, results }: { project: Project; results: Results }) {
  const levels = useMemo(
    () => deriveLevels(results.model, project).filter((l) => results.model.walls.some((w) => w.level === l.id) || results.model.slabs.some((s) => s.level === l.id && s.kind !== 'radier')),
    [project, results],
  );
  const [levelId, setLevelId] = useState<string | undefined>(undefined);
  const current = levels.find((l) => l.id === levelId) ?? levels[0];
  const svg = useMemo(
    () => (current ? planSvg(results.model, { project, levelId: current.id, idPrefix: 'ver', ...(results.installations ? { installations: results.installations.points } : {}) }).svg : ''),
    [current, project, results],
  );
  if (!current) return <p className="p-4 text-sm text-stone-500">Sem planta para mostrar.</p>;
  return (
    <div className="space-y-2 p-3">
      {levels.length > 1 ? (
        <div role="group" aria-label="Nível da planta" className="flex gap-1">
          {levels.map((l) => (
            <Button key={l.id} size="sm" variant={l.id === current.id ? 'default' : 'outline'} aria-pressed={l.id === current.id} onClick={() => setLevelId(l.id)}>
              {l.name}
            </Button>
          ))}
        </div>
      ) : null}
      <div
        role="img"
        aria-label={`Planta baixa: ${current.name}`}
        className="overflow-hidden rounded-lg border border-border bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function NumbersTab({ summary }: { summary: ViewerSummary }) {
  return (
    <div className="space-y-3 p-3">
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Total estimado" value={summary.totalLabel} strong />
        <Stat label="Por m² construído" value={summary.perM2Label} />
      </dl>
      <p className="text-xs text-stone-500">Faixa de custo: {summary.costRangeLabel}</p>
      <ul aria-label="Custo por etapa" className="space-y-2">
        {summary.stages.map((s) => (
          <li key={s.stage}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-stone-700">{s.label}</span>
              <span className="font-medium text-stone-900 tabular-nums">{s.totalLabel}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round(s.share * 100))}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-3 p-3 text-sm text-stone-600">
      <ArtNotice className="text-sm" />
      <p>Esta página é só para ver. Nada aqui altera o projeto. Valores e quantidades são estimativas calculadas pelo ChaléCAD a partir do desenho e da base de preços do projeto.</p>
      <p>{DISCLAIMER}</p>
    </div>
  );
}

function ViewerContent({ id }: { id: string }) {
  useEngine();
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const computeError = useEditor((s) => s.computeError);
  const { narrow, touch } = useViewerDevice();
  const summary = useMemo(() => (results ? viewerSummary(project, results) : null), [project, results]);
  const model = results?.model;

  const onPdf = () => {
    if (!results) return toast.info('Aguarde o cálculo terminar para baixar o PDF.');
    toast.promise(exportPdf(project, results), {
      loading: 'Gerando PDF com plantas e lista de materiais…',
      success: (file) => `Arquivo ${file} baixado.`,
      error: (e) => (e instanceof Error ? e.message : 'Não foi possível gerar o PDF.'),
    });
  };
  const onImage = async () => {
    const ok = await captureImage().catch(() => false);
    if (ok) toast.success('Imagem salva.');
    else toast.error('Não foi possível salvar a imagem.');
  };

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-white px-3">
        <Logo />
        <span className="truncate pl-3 text-xs text-stone-500">Somente leitura</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative h-[60%] shrink-0 md:h-auto md:min-w-0 md:flex-1" aria-label="Modelo 3D">
          {model ? (
            <Viewport model={model} />
          ) : (
            <div className="scene-sky absolute inset-0 grid place-items-center text-sm text-stone-500">
              {computeError ? (
                <span className="px-6 text-center">Não foi possível calcular o projeto: {computeError}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Calculando o modelo 3D
                </span>
              )}
            </div>
          )}
          {model ? <SunPanel allowWalk={!touch && !narrow} allowSave={false} compact={narrow} className={narrow ? 'bottom-2 left-2 right-2 w-auto max-w-none' : 'bottom-3'} /> : null}
        </main>

        <aside aria-label="Resumo do projeto" className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border bg-stone-50 md:w-[24rem] md:flex-none md:border-t-0 md:border-l">
          <div className="space-y-3 border-b border-border bg-white p-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-stone-900">{project.meta.name}</h1>
              <p className="text-xs text-stone-500">
                {summary ? `${summary.typologyLabel} · ${summary.systemLabel}` : 'Calculando…'}
              </p>
            </div>
            {summary ? (
              <>
                <dl className="grid grid-cols-2 gap-2">
                  <Stat label="Área construída" value={summary.builtAreaLabel} strong />
                  <Stat label="Custo estimado" value={summary.costRangeLabel} />
                </dl>
                {summary.rooms.length > 0 ? (
                  <ul aria-label="Cômodos" className="flex flex-wrap gap-1.5">
                    {summary.rooms.map((r) => (
                      <li key={r.id} className="rounded-full border border-border bg-stone-50 px-2.5 py-0.5 text-xs text-stone-700">
                        {r.name} <span className="text-stone-500 tabular-nums">{r.areaLabel}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onPdf} disabled={!results}>
                <FileDown /> Baixar PDF
              </Button>
              <Button size="sm" variant="outline" onClick={onImage} disabled={!model}>
                <ImageDown /> Salvar imagem
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/editor?id=${encodeURIComponent(id)}`}>
                  <PencilRuler /> Abrir no editor
                </Link>
              </Button>
            </div>
          </div>

          {results && summary ? (
            <Tabs defaultValue="plan" className="flex-1">
              <TabsList className="mx-3 mt-3">
                <TabsTrigger value="plan">Planta</TabsTrigger>
                <TabsTrigger value="numbers">Números</TabsTrigger>
                <TabsTrigger value="about">Sobre</TabsTrigger>
              </TabsList>
              <TabsContent value="plan">
                <PlanTab project={project} results={results} />
              </TabsContent>
              <TabsContent value="numbers">
                <NumbersTab summary={summary} />
              </TabsContent>
              <TabsContent value="about">
                <AboutTab />
              </TabsContent>
            </Tabs>
          ) : (
            <p className="flex items-center gap-2 p-4 text-sm text-stone-500">
              <Loader2 className="size-4 animate-spin" /> Calculando…
            </p>
          )}

          <footer className="mt-auto border-t border-border bg-white px-4 py-2 text-center text-[11px] text-stone-500">Feito com ChaléCAD · estimativa, não substitui projeto com ART</footer>
        </aside>
      </div>
    </div>
  );
}

/** Página /ver?id=<projeto>: somente leitura (sem autosave, sem edição). */
export function ViewerPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      setLoad({ state: 'missing' });
      return;
    }
    getStorage()
      .getProject(id)
      .then((rec) => {
        if (cancelled) return;
        if (!rec) return setLoad({ state: 'missing' });
        openForViewing(rec.project, id);
        setLoad({ state: 'ready', id });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoad({ state: 'error', message: e instanceof Error ? e.message : 'Falha ao abrir o projeto.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.state === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-stone-500">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Abrindo o projeto
        </span>
      </div>
    );
  }
  if (load.state === 'missing') return <Message title="Projeto não encontrado" text="Esse link não aponta para um projeto salvo neste servidor ou navegador. Confira o endereço ou escolha um da lista." />;
  if (load.state === 'error') return <Message title="Não foi possível abrir o projeto" text={load.message} />;
  return <ViewerContent id={load.id} />;
}
