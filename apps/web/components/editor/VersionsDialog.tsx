'use client';
import { useCallback, useEffect, useState } from 'react';
import { GitCompareArrows, History, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from '@chalecad/ui';
import type { Project, Results } from '@chalecad/engine';
import { saveNow } from '@/hooks/useAutosave';
import { getEngine } from '@/lib/engine/client';
import { fmt } from '@/lib/project/format';
import { getStorage, type ProjectVersion } from '@/lib/storage';
import { useEditor } from '@/lib/store/editor';

type VersionItem = Omit<ProjectVersion, 'project'>;

const when = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

interface Diff {
  versionId: string;
  rows: { label: string; before: string; after: string; delta: string; tone: 'up' | 'down' | 'same' }[];
}

function pct(a: number, b: number) {
  if (!a) return '';
  const p = ((b - a) / a) * 100;
  return ` (${p > 0 ? '+' : ''}${fmt(p, 1)}%)`;
}

function diffRows(past: Results, now: Results): Diff['rows'] {
  const row = (label: string, a: number, b: number, f: (n: number) => string) => {
    const d = b - a;
    return { label, before: f(a), after: f(b), delta: Math.abs(d) < 1e-9 ? 'igual' : `${d > 0 ? '+' : '−'}${f(Math.abs(d))}${pct(a, b)}`, tone: Math.abs(d) < 1e-9 ? ('same' as const) : d > 0 ? ('up' as const) : ('down' as const) };
  };
  return [
    row('Área construída', past.model.builtArea, now.model.builtArea, (n) => `${fmt(n, 2)} m²`),
    row('Custo total', past.budget.total, now.budget.total, brl0),
    row('Peso total', past.weight.totalKg, now.weight.totalKg, (n) => `${fmt(n, 0)} kg`),
    row('Aço', past.quantities.steelKg, now.quantities.steelKg, (n) => `${fmt(n, 0)} kg`),
  ];
}

export function VersionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const projectId = useEditor((s) => s.projectId);
  const [versions, setVersions] = useState<VersionItem[] | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [comparing, setComparing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = useEditor.getState().projectId;
    if (!id) {
      setVersions([]);
      return;
    }
    try {
      setVersions(await getStorage().listVersions(id));
    } catch {
      setVersions([]);
      toast.error('Não foi possível carregar as versões.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setConfirmRestore(null);
    setDiff(null);
    setVersions(null);
    setName('');
    void load();
  }, [open, load, projectId]);

  /** Garante que o projeto exista no armazenamento (cria o id se ainda não foi salvo). */
  const ensureSaved = async (): Promise<string> => {
    await saveNow();
    const id = useEditor.getState().projectId;
    if (!id) throw new Error('Não foi possível salvar o projeto antes de criar a versão.');
    return id;
  };

  const save = async (label: string, project: Project) => {
    const id = await ensureSaved();
    await getStorage().saveVersion(id, label, project);
  };

  const onSave = async () => {
    const label = name.trim() || `Versão ${(versions?.length ?? 0) + 1}`;
    setSaving(true);
    try {
      await save(label, useEditor.getState().project);
      toast.success(`Versão “${label}” salva.`);
      setName('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a versão.');
    } finally {
      setSaving(false);
    }
  };

  const onRestore = async (v: VersionItem) => {
    setBusy(v.id);
    try {
      const full = await getStorage().getVersion(v.id);
      if (!full) throw new Error('Versão não encontrada.');
      // Rede de segurança: o estado atual vira uma versão antes de ser substituído.
      await save(`Antes de restaurar “${v.name}”`.slice(0, 120), useEditor.getState().project);
      const id = useEditor.getState().projectId!;
      useEditor.getState().loadProject(full.project, { projectId: id });
      await getStorage().saveProject(id, full.project);
      useEditor.getState().markSaved(id, Date.now());
      toast.success(`Versão “${v.name}” restaurada.`, { description: 'O estado anterior foi guardado como nova versão.' });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível restaurar.');
    } finally {
      setBusy(null);
      setConfirmRestore(null);
    }
  };

  const onCompare = async (v: VersionItem) => {
    if (diff?.versionId === v.id) {
      setDiff(null);
      return;
    }
    setComparing(v.id);
    try {
      const full = await getStorage().getVersion(v.id);
      if (!full) throw new Error('Versão não encontrada.');
      const [a, b] = await getEngine().computeMany([full.project, useEditor.getState().project]);
      if (!a?.ok || !b?.ok) throw new Error('Não foi possível calcular uma das versões (projeto inválido).');
      setDiff({ versionId: v.id, rows: diffRows(a.results, b.results) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível comparar.');
    } finally {
      setComparing(null);
    }
  };

  const onDelete = async (v: VersionItem) => {
    setBusy(v.id);
    try {
      await getStorage().deleteVersion(v.id);
      if (diff?.versionId === v.id) setDiff(null);
      await load();
      toast.success('Versão excluída.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-accent" aria-hidden /> Versões do projeto
          </DialogTitle>
          <DialogDescription>Guarde pontos de retorno com um nome (“antes de mudar o telhado”) e volte a eles quando quiser.</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Nome da versão (ex.: antes de mudar o telhado)"
            aria-label="Nome da versão"
            className="h-9 flex-1 rounded-md border border-border px-3 text-sm outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-accent/50"
          />
          <Button type="submit" variant="accent" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Salvar versão
          </Button>
        </form>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
          {versions === null ? (
            <div className="grid place-items-center py-10 text-stone-400" role="status" aria-label="Carregando versões">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">Nenhuma versão ainda. Salve a primeira acima.</p>
          ) : (
            <ul className="divide-y divide-border">
              {versions.map((v) => (
                <li key={v.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-900">{v.name}</p>
                      <p className="text-xs text-stone-500">{when(v.createdAt)}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={comparing === v.id} onClick={() => void onCompare(v)} aria-label={`Comparar “${v.name}” com o projeto atual`}>
                      {comparing === v.id ? <Loader2 className="animate-spin" /> : <GitCompareArrows />} Comparar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmRestore(confirmRestore === v.id ? null : v.id)} aria-label={`Restaurar “${v.name}”`}>
                      <RotateCcw /> Restaurar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === v.id} onClick={() => void onDelete(v)} aria-label={`Excluir “${v.name}”`} className="text-stone-500 hover:text-fail">
                      <Trash2 />
                    </Button>
                  </div>

                  {confirmRestore === v.id ? (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
                      <span>Substituir o projeto atual por esta versão? O estado atual será guardado como uma nova versão.</span>
                      <span className="flex shrink-0 gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" variant="accent" disabled={busy === v.id} onClick={() => void onRestore(v)}>
                          {busy === v.id ? <Loader2 className="animate-spin" /> : null} Restaurar
                        </Button>
                      </span>
                    </div>
                  ) : null}

                  {diff?.versionId === v.id ? (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-stone-500">
                          <th className="py-1 font-medium">Comparado ao atual</th>
                          <th className="py-1 text-right font-medium">Versão</th>
                          <th className="py-1 text-right font-medium">Atual</th>
                          <th className="py-1 text-right font-medium">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.rows.map((r) => (
                          <tr key={r.label} className="border-t border-border">
                            <td className="py-1 text-stone-700">{r.label}</td>
                            <td className="py-1 text-right tabular-nums text-stone-600">{r.before}</td>
                            <td className="py-1 text-right tabular-nums text-stone-900">{r.after}</td>
                            <td className={cn('py-1 text-right tabular-nums font-medium', r.tone === 'up' && 'text-amber-700', r.tone === 'down' && 'text-ok', r.tone === 'same' && 'text-stone-400')}>{r.delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
