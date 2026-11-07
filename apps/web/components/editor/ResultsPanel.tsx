'use client';
import { Calculator, Loader2, Scale, Wallet } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, ScrollArea } from '@chalecad/ui';
import { ArtNotice } from '@/components/ArtNotice';
import { fmt, formatMs } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { PARTIAL_WARNING_CODE } from '@/lib/engine/compute';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-medium text-stone-900 tabular-nums">{value}</dd>
    </div>
  );
}

function Soon({ icon: Icon, title }: { icon: typeof Calculator; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-muted px-3 py-3">
      <span className="grid size-8 place-items-center rounded-md bg-white text-stone-500 shadow-sm">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">{title}</p>
        <p className="text-xs text-stone-500">Aparece aqui quando o motor estiver conectado.</p>
      </div>
      <Badge variant="neutral">em breve</Badge>
    </div>
  );
}

/** Painel direito (provisório do F1-W1): lê `results` do store. O F1-W2 o substitui por `components/results/ResultsPanel`. */
export function ResultsPanel() {
  const results = useEditor((s) => s.results);
  const computing = useEditor((s) => s.computing);
  const selection = useEditor((s) => s.selection);
  const stale = useEditor((s) => s.revision !== s.computedRevision);
  const model = results?.model;
  const partial = results?.warnings.some((w) => w.code === PARTIAL_WARNING_CODE) ?? true;
  const ms = results?.timingsMs.worker ?? results?.timingsMs.total;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-900">Resultados</h2>
        <span className="flex items-center gap-1.5 text-xs text-stone-500 tabular-nums" aria-live="polite">
          {computing || stale ? (
            <>
              <Loader2 className="size-3 animate-spin" /> calculando
            </>
          ) : ms !== undefined ? (
            `calculado em ${formatMs(ms)}`
          ) : null}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {model ? (
            <Card>
              <CardHeader>
                <CardTitle>Edificação</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-3">
                <dl className="divide-y divide-border">
                  <Row label="Área de implantação" value={`${fmt(model.footprintArea)} m²`} />
                  <Row label="Área construída" value={`${fmt(model.builtArea)} m²`} />
                  <Row label="Altura da cumeeira" value={`${fmt(model.ridgeHeight)} m`} />
                  <Row label="Águas do telhado" value={`${model.roofPlanes.length}`} />
                  <Row label="Aberturas" value={`${model.openings.length}`} />
                </dl>
              </CardContent>
            </Card>
          ) : (
            <p className="px-1 text-sm text-stone-500">Calculando o projeto…</p>
          )}

          {results ? (
            <Card>
              <CardHeader>
                <CardTitle>Cálculo</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-3">
                <dl className="divide-y divide-border">
                  <Row label="Peças de estrutura" value={`${results.pieces.length}`} />
                  <Row label="Itens da lista de compra" value={`${results.quantities.lines.length}`} />
                  <Row label="Tempo de cálculo" value={ms !== undefined ? formatMs(ms) : '—'} />
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {selection ? (
            <Card className="border-amber-300 bg-amber-50/40">
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm text-stone-700">Selecionado</span>
                <Badge variant="accent" className="font-mono">
                  {selection.id}
                </Badge>
              </CardContent>
            </Card>
          ) : (
            <p className="px-1 text-xs text-stone-500">Clique numa parede, água do telhado, laje ou escada para selecionar.</p>
          )}

          {results && results.warnings.length > 0 ? (
            <ul className="space-y-1.5">
              {results.warnings.map((w, i) => (
                <li key={`${w.code}-${i}`} className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-stone-600">
                  {w.message}
                </li>
              ))}
            </ul>
          ) : null}

          {partial ? (
            <>
              <Soon icon={Calculator} title="Lista de materiais" />
              <Soon icon={Scale} title="Peso e estrutura" />
              <Soon icon={Wallet} title="Orçamento por etapa" />
            </>
          ) : null}
        </div>
      </ScrollArea>
      <div className="border-t border-border bg-surface-muted p-3">
        <ArtNotice className="items-start" />
      </div>
    </div>
  );
}
