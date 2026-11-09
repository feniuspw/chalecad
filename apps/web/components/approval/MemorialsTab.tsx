'use client';
import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, cn } from '@chalecad/ui';
import type { Memorial } from '@chalecad/engine';
import { artDoc, complianceDoc, memorialDoc, permitDoc, septicDoc, utilityDoc, type DocSpec } from '@/lib/approval/docs';
import { saveBlob } from '@/lib/approval/download';
import { DISCIPLINE_LABEL } from '@/lib/approval/labels';
import { useEditor } from '@/lib/store/editor';

async function downloadDoc(spec: DocSpec) {
  const { renderDocBlob } = await import('./pdf/render');
  const blob = await renderDocBlob(spec);
  saveBlob(spec.fileName, blob, 'application/pdf');
  return spec.fileName;
}

function MemorialView({ m }: { m: Memorial }) {
  return (
    <article className="rounded-lg border border-border bg-white p-4" data-testid="memorial-view">
      <h3 className="text-base font-semibold text-stone-900">{m.title}</h3>
      <p className="text-xs text-stone-500">
        {m.kind === 'calculation' ? 'Memorial de cálculo' : 'Memorial descritivo'} · {DISCIPLINE_LABEL[m.discipline]}
        {m.norms.length > 0 ? ` · ${m.norms.join('; ')}` : ''}
      </p>
      {m.sections.map((s, i) => (
        <section key={i} className="mt-4">
          <h4 className="text-sm font-semibold text-stone-800">{s.title}</h4>
          {s.paragraphs.map((p, j) => (
            <p key={j} className="mt-1.5 text-xs leading-relaxed text-stone-700">
              {p}
            </p>
          ))}
          {s.table ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    {s.table.head.map((h, k) => (
                      <th key={k} className="px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, k) => (
                    <tr key={k} className="border-t border-border">
                      {r.map((c, l) => (
                        <td key={l} className="px-2 py-1 tabular-nums">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}

export function MemorialsTab() {
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const ap = results?.approval;
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!ap || !results)
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-stone-500" data-testid="memorials-empty">
        <Loader2 className="size-4 animate-spin" /> Calculando os memoriais…
      </div>
    );

  const run = async (key: string, spec: DocSpec | null) => {
    if (!spec) return;
    setBusy(key);
    try {
      toast.success(`Arquivo ${await downloadDoc(spec)} baixado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
    } finally {
      setBusy(null);
    }
  };
  const current = ap.memorials.find((m) => m.id === sel) ?? ap.memorials[0];
  const septic = septicDoc(project, results);
  const docs: { key: string; label: string; spec: DocSpec | null }[] = [
    { key: 'compliance', label: 'Relatório da verificação normativa', spec: complianceDoc(project, results, ap) },
    { key: 'art', label: 'Ficha da ART/RRT', spec: artDoc(project, ap) },
    { key: 'utility', label: 'Ficha para a concessionária de energia', spec: utilityDoc(project, results) },
    { key: 'septic', label: 'Ficha da fossa (vigilância sanitária/prefeitura)', spec: septic },
    { key: 'permit', label: 'Ficha do requerimento de alvará', spec: permitDoc(project, ap) },
  ];
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[18rem_1fr]" data-testid="approval-memorials">
      <div className="space-y-4">
        <section aria-label="Memoriais">
          <h3 className="mb-2 text-sm font-semibold text-stone-900">Memoriais</h3>
          {ap.memorials.length === 0 ? <p className="text-xs text-stone-500">Nenhum memorial para esta etapa.</p> : null}
          <ul className="space-y-1.5">
            {ap.memorials.map((m) => (
              <li key={m.id} className={cn('flex items-center gap-1 rounded-md border p-1.5', current?.id === m.id ? 'border-accent/60 bg-accent-soft' : 'border-border bg-white')}>
                <button type="button" onClick={() => setSel(m.id)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-stone-800 outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                  {m.title}
                </button>
                <Button variant="ghost" size="sm" aria-label={`PDF: ${m.title}`} disabled={busy !== null} onClick={() => void run(m.id, memorialDoc(project, m))}>
                  {busy === m.id ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Documentos e fichas">
          <h3 className="mb-2 text-sm font-semibold text-stone-900">Documentos e fichas (PDF)</h3>
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-white p-1.5">
                <span className="text-xs text-stone-800">{d.label}</span>
                <Button variant="ghost" size="sm" aria-label={`PDF: ${d.label}`} disabled={!d.spec || busy !== null} title={d.spec ? undefined : 'Não há fossa calculada neste projeto'} onClick={() => void run(d.key, d.spec)}>
                  {busy === d.key ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {current ? <MemorialView m={current} /> : <div />}
    </div>
  );
}
