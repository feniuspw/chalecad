'use client';
import { useMemo } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import { buildConstructionGuide, buildEngineerPackage } from '@chalecad/engine';
import { downloadText } from '@/lib/export/download';
import { slugify } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { ConstructionGuideView } from './ConstructionGuideView';
import { EngineerPackageView } from './EngineerPackageView';
import { guideToMarkdown, packageToMarkdown } from './markdown';

export type ReportKind = 'guide' | 'engineer';

const TITLE: Record<ReportKind, string> = { guide: 'Roteiro de obra', engineer: 'Pacote do engenheiro' };

/** Só o diálogo aparece na impressão; o resto da página some. */
const PRINT_CSS = `
@media print {
  body > *:not([data-report-dialog]):not(:has([data-report-dialog])) { display: none !important; }
  [data-report-dialog] { position: static !important; transform: none !important; display: block !important; width: auto !important; max-width: none !important; height: auto !important; max-height: none !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
  [data-report-dialog] > button, [data-report-toolbar] { display: none !important; }
  [data-report-scroll] { overflow: visible !important; height: auto !important; padding: 0 !important; }
  @page { margin: 14mm; }
}`;

/** Diálogo grande com o relatório do motor (roteiro de obra ou pacote do engenheiro). */
export function ReportsDialog({ kind, onOpenChange }: { kind: ReportKind | null; onOpenChange: (open: boolean) => void }) {
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);

  const data = useMemo(() => {
    if (!kind || !results) return null;
    const catalog = getCatalog();
    return kind === 'guide'
      ? { kind, guide: buildConstructionGuide(project, results, catalog), lines: results.quantities.lines }
      : { kind, pkg: buildEngineerPackage(project, results, catalog) };
  }, [kind, project, results]);

  const exportMd = () => {
    if (!data) return;
    const md = data.kind === 'guide' ? guideToMarkdown(data.guide, data.lines) : packageToMarkdown(data.pkg);
    const file = `${slugify(project.meta.name)}-${data.kind === 'guide' ? 'roteiro-de-obra' : 'pacote-engenheiro'}.md`;
    downloadText(file, md, 'text/markdown;charset=utf-8');
    toast.success(`Arquivo ${file} baixado.`);
  };

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent data-report-dialog className="flex h-[88vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <style>{PRINT_CSS}</style>
        <div data-report-toolbar className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3 pr-14">
          <div>
            <DialogTitle className="text-base font-semibold">{kind ? TITLE[kind] : ''}</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">Gerado pelo motor a partir do projeto atual, sem IA.</DialogDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data} onClick={exportMd}>
              <FileDown /> Markdown
            </Button>
            <Button variant="outline" size="sm" disabled={!data} onClick={() => window.print()}>
              <Printer /> Imprimir
            </Button>
          </div>
        </div>
        <div data-report-scroll className="min-h-0 flex-1 overflow-y-auto bg-surface-muted p-6">
          {!data ? (
            <p className="py-12 text-center text-sm text-stone-500">Aguarde o cálculo terminar para gerar o relatório.</p>
          ) : data.kind === 'guide' ? (
            <ConstructionGuideView guide={data.guide} lines={data.lines} />
          ) : (
            <EngineerPackageView pkg={data.pkg} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
