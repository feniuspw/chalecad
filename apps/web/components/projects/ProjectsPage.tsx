'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, CloudOff, FileUp, FolderPlus, Loader2, Plus, Search, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@chalecad/ui';
import { loadProject } from '@chalecad/engine';
import { ArtNotice } from '@/components/ArtNotice';
import { Logo } from '@/components/Logo';
import { PresetCard } from '@/components/onboarding/PresetCard';
import { findPreset, type Preset } from '@/lib/project/presets';
import { getStorage, type ProjectSummary } from '@/lib/storage';
import { SyncedStorage } from '@/lib/storage';
import { WIZARD_FLAG } from '@/components/wizard/WizardDialog';
import { ProjectCard } from './ProjectCard';

type SortKey = 'recent' | 'name' | 'area' | 'total';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'area', label: 'Maior área' },
  { id: 'total', label: 'Maior custo' },
];

/** Modelos sugeridos na lista vazia: três tipologias bem diferentes. */
const SUGGESTED_PRESETS = ['aframe-compact', 'gable-loft', 'l-house'].map(findPreset).filter((p): p is Preset => !!p);

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ProjectsPage() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const storage = getStorage();
    try {
      setItems(await storage.listProjects());
      if (storage instanceof SyncedStorage) setOffline(!(await storage.isOnline()));
    } catch (e) {
      console.warn('[projetos]', e);
      setItems([]);
      toast.error('Não foi possível carregar os projetos.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    const list = (items ?? []).filter((p) => !q || norm(p.name).includes(q));
    const by: Record<SortKey, (a: ProjectSummary, b: ProjectSummary) => number> = {
      recent: (a, b) => b.updatedAt - a.updatedAt,
      name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
      area: (a, b) => (b.builtArea ?? 0) - (a.builtArea ?? 0),
      total: (a, b) => (b.total ?? 0) - (a.total ?? 0),
    };
    return [...list].sort(by[sort]);
  }, [items, query, sort]);

  const duplicate = async (p: ProjectSummary) => {
    try {
      const storage = getStorage();
      const rec = await storage.getProject(p.id);
      if (!rec) throw new Error('Projeto não encontrado.');
      const copy = { ...rec.project, meta: { ...rec.project.meta, name: `${rec.project.meta.name} (cópia)`.slice(0, 120) } };
      await storage.saveProject(null, copy, { builtArea: p.builtArea, total: p.total, thumbnail: p.thumbnail });
      toast.success(`“${copy.meta.name}” criado.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível duplicar.');
    }
  };

  const rename = async () => {
    const p = renaming;
    const name = renameValue.trim();
    if (!p || !name) return;
    setBusy(true);
    try {
      const storage = getStorage();
      const rec = await storage.getProject(p.id);
      if (!rec) throw new Error('Projeto não encontrado.');
      await storage.saveProject(p.id, { ...rec.project, meta: { ...rec.project.meta, name: name.slice(0, 120) } });
      toast.success('Projeto renomeado.');
      setRenaming(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível renomear.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const p = deleting;
    if (!p) return;
    setBusy(true);
    try {
      await getStorage().deleteProject(p.id);
      toast.success(`“${p.name}” excluído.`);
      setDeleting(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      toast.error(`“${file.name}” não é um arquivo JSON válido.`);
      return;
    }
    const r = loadProject(json);
    if (!r.ok) {
      const first = r.issues[0];
      toast.error('Projeto inválido.', { description: first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : undefined });
      return;
    }
    try {
      await getStorage().saveProject(null, r.project);
      toast.success(`“${r.project.meta.name}” importado.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível importar.');
    }
  };

  const total = items?.length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Logo />
          <Button asChild variant="accent" size="sm">
            <Link href="/editor?new=1">
              <Plus /> Novo projeto
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Seus projetos</h1>
            <p className="mt-1 text-sm text-stone-600">
              {items === null ? 'Carregando…' : total === 0 ? 'Nenhum projeto ainda.' : `${total} ${total === 1 ? 'projeto' : 'projetos'}, salvos automaticamente.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome"
                aria-label="Buscar projetos"
                className="h-9 w-56 rounded-md border border-border bg-white pr-3 pl-9 text-sm shadow-sm outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="md">
                  <ArrowDownUp /> {SORTS.find((s) => s.id === sort)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SORTS.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => setSort(s.id)} className={s.id === sort ? 'font-semibold text-accent-hover' : ''}>
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <FileUp /> Importar JSON
            </Button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Importar projeto em JSON" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>

        {offline ? (
          <p className="mt-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <CloudOff className="size-4 shrink-0" aria-hidden /> Servidor indisponível: mostrando só os projetos salvos neste navegador.
          </p>
        ) : null}

        {items === null ? (
          <div className="mt-24 grid place-items-center text-stone-400" role="status" aria-label="Carregando projetos">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : total === 0 ? (
          <>
            <section className="mt-10 grid place-items-center rounded-3xl border border-dashed border-border-strong bg-white px-6 py-14 text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent-hover">
                <FolderPlus className="size-8" aria-hidden />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight text-stone-900">Comece o seu primeiro chalé</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">
                Não entende de construção? Responda perguntas simples e montamos um chalé para você. Ou escolha um modelo pronto, ou desenhe do zero. Ajuste as medidas e veja lista de materiais, peso e orçamento aparecerem na hora. Tudo fica salvo aqui.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button asChild variant="accent" size="lg">
                  <Link href="/editor?new=1&wizard=1" onClick={() => window.sessionStorage.setItem(WIZARD_FLAG, '1')}>
                    <Wand2 /> Me ajude a montar
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/editor?new=1">
                    <Plus /> Novo projeto
                  </Link>
                </Button>
                <Button variant="outline" size="lg" onClick={() => fileInput.current?.click()}>
                  <FileUp /> Importar JSON
                </Button>
              </div>
            </section>
            <section aria-labelledby="modelos-prontos" className="mt-10">
              <h2 id="modelos-prontos" className="text-lg font-semibold tracking-tight text-stone-900">
                Comece por um modelo pronto
              </h2>
              <p className="mt-1 text-sm text-stone-600">Já vêm com cômodos, acabamentos e móveis. Dá para mudar tudo no editor.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {SUGGESTED_PRESETS.map((pr) => (
                  <PresetCard key={pr.id} preset={pr} href={`/editor?new=1&template=${pr.id}`} />
                ))}
              </div>
            </section>
          </>
        ) : visible.length === 0 ? (
          <p className="mt-16 text-center text-sm text-stone-500">Nenhum projeto encontrado para “{query}”.</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onRename={() => {
                  setRenaming(p);
                  setRenameValue(p.name);
                }}
                onDuplicate={() => void duplicate(p)}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <ArtNotice />
        </div>
      </footer>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Renomear projeto</DialogTitle>
              <DialogDescription>O novo nome aparece na lista, no editor e no PDF.</DialogDescription>
            </DialogHeader>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={120}
              aria-label="Nome do projeto"
              className="h-10 rounded-md border border-border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" disabled={busy || !renameValue.trim()}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir “{deleting?.name}”?</DialogTitle>
            <DialogDescription>O projeto e todas as suas versões nomeadas serão apagados. Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              Excluir projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
