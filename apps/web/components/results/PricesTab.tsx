'use client';
import { useMemo, useRef, useState } from 'react';
import { CircleAlert, Clock, Download, FileUp, Pencil, RotateCcw, SearchX, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NumberInput } from '@chalecad/ui';
import { getCatalog, STAGE_LABELS, STAGE_ORDER } from '@chalecad/catalog';
import type { BudgetLine, Results } from '@chalecad/engine';
import { exportPricesCsv } from '@/lib/export/csv';
import { downloadText } from '@/lib/export/download';
import { parsePriceCsv, type ImportPreview } from '@/lib/export/price-import';
import { formatBRL, formatDate, todayIso } from '@/lib/format';
import { slugify } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { Chips, EmptyState, SearchBox } from './shared';

type Filter = 'all' | 'missing' | 'stale' | 'overridden';
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const MANUAL_SOURCE = 'cotação manual';

function PriceRow({ line, priceId }: { line: BudgetLine; priceId: string }) {
  const update = useEditor((s) => s.update);
  const hasRange = line.unitPriceMax > line.unitPrice;
  const setPrice = (v: number) =>
    update(`Preço: ${line.name}`, (d) => {
      d.priceOverrides[priceId] = { price: v, date: todayIso(), source: MANUAL_SOURCE };
    });
  const restore = () =>
    update(`Restaurar preço: ${line.name}`, (d) => {
      delete d.priceOverrides[priceId];
    });
  return (
    <li className="border-b border-border px-4 py-2.5 transition-colors hover:bg-stone-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-stone-900" title={line.name}>
            {line.name}
          </p>
          <p className="truncate text-xs text-stone-500">
            {STAGE_LABELS[line.stage]} · por {line.unit}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {line.missing ? (
            <Badge variant="fail">
              <CircleAlert className="size-3" /> sem preço
            </Badge>
          ) : null}
          {line.stale ? (
            <Badge variant="warn" title={`Preço de ${formatDate(line.priceDate)}`}>
              <Clock className="size-3" /> desatualizado
            </Badge>
          ) : null}
          {line.overridden ? (
            <Badge variant="accent">
              <Pencil className="size-3" /> editado
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <NumberInput
          className="h-8 w-36"
          aria-label={`Preço unitário de ${line.name}`}
          value={line.unitPrice}
          onValueChange={setPrice}
          min={0}
          max={1_000_000}
          step={1}
          decimals={2}
          unit="R$"
        />
        {line.overridden ? (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-stone-600" onClick={restore} aria-label={`Restaurar preço original de ${line.name}`}>
            <RotateCcw className="size-3.5" /> Restaurar
          </Button>
        ) : null}
        <span className="ml-auto min-w-0 truncate text-right text-[11px] text-stone-500 tabular-nums">
          {hasRange ? `até ${formatBRL(line.unitPriceMax)} · ` : ''}
          {line.priceDate ? formatDate(line.priceDate) : ''}
          {line.priceSource ? ` · ${line.priceSource}` : ''}
        </span>
      </div>
    </li>
  );
}

function ImportDialog({ open, onOpenChange, known }: { open: boolean; onOpenChange: (o: boolean) => void; known: ReadonlySet<string> }) {
  const update = useEditor((s) => s.update);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const preview: ImportPreview | null = useMemo(() => (text.trim() ? parsePriceCsv(text, known, todayIso()) : null), [text, known]);

  const close = (o: boolean) => {
    if (!o) setText('');
    onOpenChange(o);
  };
  const confirm = () => {
    if (!preview || preview.accepted.length === 0) return;
    const items = preview.accepted;
    update('Importar preços', (d) => {
      for (const it of items) {
        d.priceOverrides[it.itemId] = { price: it.price, date: it.date, source: it.source, ...(it.priceMax !== undefined ? { priceMax: it.priceMax } : {}) };
      }
    });
    toast.success(`${items.length} ${items.length === 1 ? 'preço importado' : 'preços importados'}.`);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar preços (CSV)</DialogTitle>
          <DialogDescription>
            Colunas: <code className="rounded bg-stone-100 px-1">itemId;preco;precoMax;data;fonte</code>. Só as duas primeiras são obrigatórias. Aceita <code>;</code>, tab ou <code>,</code> e vírgula decimal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
                e.target.value = '';
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> Escolher arquivo
            </Button>
            <span className="text-xs text-stone-500">ou cole o texto abaixo</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            spellCheck={false}
            aria-label="Texto CSV"
            placeholder={'mat-osb_11;98,50;;01/11/2026;Madeireira Silva\nmat-drywall_st_12;92'}
            className="w-full resize-y rounded-md border border-border bg-white p-2.5 font-mono text-xs text-stone-900 shadow-sm outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-accent/50"
          />
          {preview ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-stone-700 tabular-nums">
                {preview.accepted.length} reconhecidas{preview.ignored > 0 ? `, ${preview.ignored} ignoradas` : ''}
              </p>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border text-xs">
                {preview.rows.map((r) => (
                  <li key={r.line} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="w-6 shrink-0 text-right text-stone-400 tabular-nums">{r.line}</span>
                    {r.ok && r.value ? (
                      <>
                        <Badge variant="ok">ok</Badge>
                        <span className="min-w-0 flex-1 truncate font-mono text-stone-800">{r.value.itemId}</span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatBRL(r.value.price)}
                          {r.value.priceMax ? ` a ${formatBRL(r.value.priceMax)}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <Badge variant="fail">ignorada</Badge>
                        <span className="min-w-0 flex-1 truncate font-mono text-stone-500">{r.raw}</span>
                        <span className="shrink-0 text-red-700">{r.reason}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant="accent" disabled={!preview || preview.accepted.length === 0} onClick={confirm}>
            <Upload /> Importar {preview && preview.accepted.length > 0 ? preview.accepted.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PricesTab({ results }: { results: Results }) {
  const projectName = useEditor((s) => s.project.meta.name);
  const priceBookId = useEditor((s) => s.project.priceBookId);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [importing, setImporting] = useState(false);

  const priceIdByLine = useMemo(() => new Map(results.quantities.lines.map((l) => [l.id, l.priceItemId])), [results]);
  const known = useMemo(() => {
    const ids = new Set(results.quantities.lines.map((l) => l.priceItemId));
    const book = getCatalog().priceBooks.find((b) => b.id === priceBookId);
    for (const it of book?.items ?? []) ids.add(it.itemId);
    return ids;
  }, [results, priceBookId]);

  const lines = results.budget.lines;
  const counts = useMemo(
    () => ({ all: lines.length, missing: lines.filter((l) => l.missing).length, stale: lines.filter((l) => l.stale).length, overridden: lines.filter((l) => l.overridden).length }),
    [lines],
  );
  const q = norm(query.trim());
  const shown = useMemo(
    () =>
      lines
        .filter((l) => (filter === 'all' ? true : l[filter]))
        .filter((l) => !q || norm(`${l.name} ${l.itemId} ${STAGE_LABELS[l.stage]}`).includes(q))
        .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)),
    [lines, filter, q],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border bg-white px-3 py-2.5">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setImporting(true)}>
            <Upload /> Importar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const name = `${slugify(projectName)}-precos.csv`;
              downloadText(name, exportPricesCsv(results));
              toast.success(`Arquivo ${name} baixado.`);
            }}
          >
            <Download /> Exportar base
          </Button>
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar item" />
        <Chips
          label="Filtrar preços"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'Todos', count: counts.all },
            { id: 'missing', label: 'Sem preço', count: counts.missing },
            { id: 'stale', label: 'Desatualizados', count: counts.stale },
            { id: 'overridden', label: 'Editados', count: counts.overridden },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <EmptyState icon={<SearchX />} title="Nenhum item">
            Ajuste a busca ou o filtro.
          </EmptyState>
        ) : (
          <ul>
            {shown.map((l) => (
              <PriceRow key={l.lineId} line={l} priceId={priceIdByLine.get(l.lineId) ?? l.itemId} />
            ))}
          </ul>
        )}
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} known={known} />
    </div>
  );
}
