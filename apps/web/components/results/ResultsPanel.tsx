'use client';
import { useMemo, type ReactNode } from 'react';
import { ChevronDown, Download, FileJson, FileSpreadsheet, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@chalecad/ui';
import type { Results, Severity } from '@chalecad/engine';
import { ArtNotice } from '@/components/ArtNotice';
import { exportBudgetCsv, exportPurchaseCsv } from '@/lib/export/csv';
import { downloadText } from '@/lib/export/download';
import { exportProjectJson } from '@/lib/project/actions';
import { slugify } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { AlertsTab, visibleWarnings, worstSeverity } from './AlertsTab';
import { BudgetTab } from './BudgetTab';
import { Kpis, KpisSkeleton } from './Kpis';
import { MaterialsTab } from './MaterialsTab';
import { PricesTab } from './PricesTab';
import { StructureTab } from './StructureTab';
import { SummaryTab } from './SummaryTab';

const COUNT_STYLE: Record<Severity, string> = {
  error: 'bg-fail text-white',
  warn: 'bg-warn text-stone-900',
  info: 'bg-sky-100 text-sky-800',
};

function Tab({ value, children, count, severity }: { value: string; children: ReactNode; count?: number; severity?: Severity | null }) {
  return (
    <TabsTrigger
      value={value}
      onClick={(e) => e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' })}
      className="h-10 flex-none rounded-none border-b-2 border-transparent px-2.5 text-[13px] data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {children}
      {count !== undefined && count > 0 ? (
        <span className={cn('grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums', COUNT_STYLE[severity ?? 'info'])}>{count}</span>
      ) : null}
    </TabsTrigger>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto bg-surface-muted">{children}</div>;
}

function TabsSkeleton() {
  return (
    <div className="flex-1 space-y-3 bg-surface-muted p-3" aria-hidden>
      {[176, 120, 96].map((h) => (
        <div key={h} className="animate-pulse rounded-xl border border-border bg-white" style={{ height: h }} />
      ))}
    </div>
  );
}

function ExportMenu({ results }: { results: Results | null }) {
  const project = useEditor((s) => s.project);
  const base = slugify(project.meta.name);
  const save = (name: string, csv: string) => {
    downloadText(name, csv);
    toast.success(`Arquivo ${name} baixado.`);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Download /> Exportar <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!results} onSelect={() => results && save(`${base}-compras.csv`, exportPurchaseCsv(results, project))}>
          <FileSpreadsheet /> CSV por fornecedor
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!results} onSelect={() => results && save(`${base}-orcamento.csv`, exportBudgetCsv(results, project))}>
          <FileSpreadsheet /> CSV do orçamento
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.success(`Arquivo ${exportProjectJson()} baixado.`)}>
          <FileJson /> JSON do projeto
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Painel direito: KPIs fixos no topo, abas de resultados e aviso de ART no rodapé. */
export function ResultsPanel() {
  const results = useEditor((s) => s.results);
  const computing = useEditor((s) => s.computing);
  const stale = useEditor((s) => s.revision !== s.computedRevision);
  const computeError = useEditor((s) => s.computeError);
  const busy = computing || stale;

  const warnings = useMemo(() => visibleWarnings(results?.warnings ?? []), [results]);
  const worst = worstSeverity(warnings);
  const structure = results?.structure ?? null;
  const structureIssues = structure ? structure.summary.warn + structure.summary.fail : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-900">Resultados</h2>
          <span className={cn('flex items-center gap-1 text-xs text-stone-500 transition-opacity', busy ? 'opacity-100' : 'opacity-0')} aria-live="polite">
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" /> recalculando
              </>
            ) : null}
          </span>
        </div>
        <ExportMenu results={results} />
      </div>

      {computeError ? (
        <p role="alert" className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {computeError}
        </p>
      ) : null}

      {results ? <Kpis results={results} /> : <KpisSkeleton />}

      {results ? (
        <Tabs defaultValue="summary" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-white px-1.5 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]">
            <Tab value="summary">Resumo</Tab>
            <Tab value="materials">Materiais</Tab>
            <Tab value="budget">Orçamento</Tab>
            <Tab value="prices">Preços</Tab>
            <Tab value="alerts" count={warnings.length} severity={worst}>
              Alertas
            </Tab>
            <Tab value="structure" count={structureIssues} severity={structure && structure.summary.fail > 0 ? 'error' : 'warn'}>
              Estrutura
            </Tab>
          </TabsList>
          <TabsContent value="summary" className="flex min-h-0 flex-1 flex-col">
            <Scroll>
              <SummaryTab results={results} />
            </Scroll>
          </TabsContent>
          <TabsContent value="materials" className="flex min-h-0 flex-1 flex-col bg-white">
            <MaterialsTab results={results} />
          </TabsContent>
          <TabsContent value="budget" className="flex min-h-0 flex-1 flex-col">
            <Scroll>
              <BudgetTab results={results} />
            </Scroll>
          </TabsContent>
          <TabsContent value="prices" className="flex min-h-0 flex-1 flex-col bg-white">
            <PricesTab results={results} />
          </TabsContent>
          <TabsContent value="alerts" className="flex min-h-0 flex-1 flex-col">
            <Scroll>
              <AlertsTab warnings={warnings} />
            </Scroll>
          </TabsContent>
          <TabsContent value="structure" className="flex min-h-0 flex-1 flex-col">
            <Scroll>
              <StructureTab report={structure} />
            </Scroll>
          </TabsContent>
        </Tabs>
      ) : (
        <TabsSkeleton />
      )}

      <div className="shrink-0 border-t border-border bg-surface-muted px-4 py-2.5">
        <ArtNotice className="items-start" />
      </div>
    </div>
  );
}
