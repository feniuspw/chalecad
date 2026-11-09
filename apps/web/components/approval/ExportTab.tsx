'use client';
import { useRef, useState } from 'react';
import { PackageOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@chalecad/ui';
import { saveBlob } from '@/lib/approval/download';
import { realPackDeps } from '@/lib/approval/deps';
import { buildApprovalPackage, pendingList, type PackProgress } from '@/lib/approval/pack';
import { useEditor } from '@/lib/store/editor';

export function ExportTab() {
  const results = useEditor((s) => s.results);
  const project = useEditor((s) => s.project);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = progress !== null;
  const pending = results ? pendingList(project, results) : [];
  const ready = !!results?.approval?.ready;

  const run = async () => {
    if (!results) return;
    setConfirm(false);
    setSummary(null);
    const ctl = new AbortController();
    abort.current = ctl;
    setProgress({ step: 0, total: 7, label: 'Preparando' });
    try {
      const r = await buildApprovalPackage({ project, results, deps: realPackDeps, signal: ctl.signal, onProgress: setProgress });
      // deixa o navegador pintar a última etapa antes do download
      saveBlob(r.name, new Blob([r.bytes], { type: 'application/zip' }), 'application/zip');
      const failed = r.steps.filter((s) => !s.ok);
      setSummary(failed.map((s) => `${s.path}: não gerado: ${s.reason ?? ''}`));
      toast.success(`Arquivo ${r.name} baixado.`, failed.length > 0 ? { description: `${failed.length} etapa(s) não gerada(s): veja o LEIA-ME.txt.` } : undefined);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') toast.info('Exportação cancelada.');
      else toast.error(e instanceof Error ? e.message : 'Não foi possível montar o pacote.');
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const start = () => {
    if (!results) return toast.info('Aguarde o cálculo terminar para exportar.');
    if (!ready) setConfirm(true);
    else void run();
  };

  return (
    <div className="space-y-4 p-4" data-testid="approval-export">
      <p className="max-w-3xl text-xs leading-snug text-stone-600">
        O pacote reúne pranchas, memoriais, fichas, a verificação normativa, os quantitativos e o projeto em um .zip, com um LEIA-ME que explica cada arquivo e lista o que falta. Etapa que falhar não impede o resto.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={start} disabled={busy || !results} data-testid="export-package">
          <PackageOpen /> Exportar pacote de aprovação (.zip)
        </Button>
        {busy ? (
          <Button variant="outline" onClick={() => abort.current?.abort()}>
            <X /> Cancelar
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="export-confirm">
          <p>Há {pending.length || 'algumas'} pendências; exportar mesmo assim? O LEIA-ME será marcado como “MINUTA — pendências abertas”.</p>
          {pending.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {pending.slice(0, 8).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void run()}>
              Exportar mesmo assim
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : null}
      {progress ? (
        <div role="status" aria-live="polite" data-testid="export-progress" className="max-w-md">
          <p className="text-xs text-stone-700">
            Etapa {Math.min(progress.step, progress.total)} de {progress.total}: {progress.label}
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-accent transition-all" style={{ width: `${(Math.min(progress.step, progress.total) / progress.total) * 100}%` }} />
          </div>
        </div>
      ) : null}
      {summary && summary.length > 0 ? (
        <div className="rounded-lg border border-border bg-white p-3 text-xs text-stone-700" data-testid="export-summary">
          <p className="font-medium">Etapas não geradas (constam no LEIA-ME.txt):</p>
          <ul className="mt-1 list-disc pl-5">
            {summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
