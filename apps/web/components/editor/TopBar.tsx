'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, FileText, FolderKanban, FolderOpen, History, ClipboardList, ShieldCheck, Plus, Redo2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Separator,
} from '@chalecad/ui';
import { Logo } from '@/components/Logo';
import { exportProjectJson, openJsonFile, openStoredProject } from '@/lib/project/actions';
import { getStorage, type ProjectSummary } from '@/lib/storage';
import { selectCanRedo, selectCanUndo, selectRedoLabel, selectUndoLabel, useEditor } from '@/lib/store/editor';
import type { ValidationIssue } from '@/lib/store/types';
import { exportPdf } from '@/lib/pdf';
import { CompareButton } from '@/components/compare/CompareButton';
import { exportBudgetCsv, exportPurchaseCsv } from '@/lib/export/csv';
import { downloadText } from '@/lib/export/download';
import { dxfFileName, exportDxf } from '@/lib/export/dxf';
import { ReportsDialog, type ReportKind } from '@/components/reports/ReportsDialog';
import { ImportErrorsDialog } from './ImportErrorsDialog';
import { ProjectName } from './ProjectName';
import { ComputeStatus, SaveStatus } from './StatusIndicators';
import { VersionsDialog } from './VersionsDialog';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({ onNew }: { onNew: () => void }) {
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const undoLabel = useEditor(selectUndoLabel);
  const redoLabel = useEditor(selectRedoLabel);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const fileInput = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);
  const [errors, setErrors] = useState<{ file: string; issues: ValidationIssue[] } | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [report, setReport] = useState<ReportKind | null>(null);
  const mod = isMac() ? '⌘' : 'Ctrl+';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await openJsonFile(file);
    if (r.ok) toast.success(`“${r.name}” aberto.`, { description: 'O projeto anterior foi salvo.' });
    else setErrors({ file: file.name, issues: r.issues });
  };

  const csv = (kind: 'compras' | 'orcamento') => {
    const { project, results } = useEditor.getState();
    if (!results) {
      toast.info('Aguarde o cálculo terminar para exportar.');
      return;
    }
    const slug = project.meta.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const file = `${slug}-${kind}.csv`;
    downloadText(file, kind === 'compras' ? exportPurchaseCsv(results, project) : exportBudgetCsv(results, project));
    toast.success(`Arquivo ${file} baixado.`);
  };
  const onPurchaseCsv = () => csv('compras');
  const onBudgetCsv = () => csv('orcamento');

  const onDxf = () => {
    const { project, results } = useEditor.getState();
    if (!results) {
      toast.info('Aguarde o cálculo terminar para exportar.');
      return;
    }
    const file = dxfFileName(project.meta.name);
    downloadText(file, exportDxf(project, results.model), 'application/dxf');
    toast.success(`Arquivo ${file} baixado.`);
  };

  const onPdf = () => {
    const { project, results } = useEditor.getState();
    if (!results) {
      toast.info('Aguarde o cálculo terminar para exportar o PDF.');
      return;
    }
    toast.promise(exportPdf(project, results), {
      loading: 'Gerando PDF com plantas e lista de materiais…',
      success: (file) => `Arquivo ${file} baixado.`,
      error: (e) => (e instanceof Error ? e.message : 'Não foi possível gerar o PDF.'),
    });
  };

  const loadRecent = async (open: boolean) => {
    if (!open) return;
    try {
      const all = await getStorage().listProjects();
      const current = useEditor.getState().projectId;
      setRecent(all.filter((p) => p.id !== current).slice(0, 8));
    } catch {
      setRecent([]);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-white px-3">
      <Logo href="/" className="pr-1" />
      <Separator orientation="vertical" className="h-5" />
      <ProjectName />
      <SaveStatus />

      <div className="ml-auto flex items-center gap-1">
        <ComputeStatus />
        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button asChild variant="ghost" size="sm">
          <Link href="/projetos">
            <FolderKanban /> Projetos
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)}>
          <History /> Versões
        </Button>
        <Button variant="outline" size="sm" onClick={onNew}>
          <Plus /> Novo
        </Button>
        <CompareButton />

        <DropdownMenu onOpenChange={loadRecent}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderOpen /> Abrir <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
              <FileJson /> Arquivo .json…
            </DropdownMenuItem>
            {recent.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Neste navegador</DropdownMenuLabel>
                {recent.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onSelect={async () => {
                      if (!(await openStoredProject(p.id))) toast.error('Projeto não encontrado.');
                    }}
                  >
                    <FileText /> <span className="truncate">{p.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Abrir arquivo de projeto"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton label={undoLabel ? `Desfazer: ${undoLabel}` : 'Desfazer'} shortcut={`${mod}Z`} disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </IconButton>
        <IconButton label={redoLabel ? `Refazer: ${redoLabel}` : 'Refazer'} shortcut={`⇧${mod}Z`} disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </IconButton>
        <Separator orientation="vertical" className="mx-1 h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ClipboardList /> Relatórios <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setReport('guide')}>
              <ClipboardList /> Roteiro de obra
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setReport('engineer')}>
              <ShieldCheck /> Pacote do engenheiro
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download /> Exportar <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => toast.success(`Arquivo ${exportProjectJson()} baixado.`)}>
              <FileJson /> JSON do projeto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPdf}>
              <FileText /> PDF com plantas e lista
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPurchaseCsv}>
              <FileText /> CSV por fornecedor
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onBudgetCsv}>
              <FileText /> CSV do orçamento
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDxf}>
              <FileText /> DXF (AutoCAD)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReportsDialog kind={report} onOpenChange={(o) => !o && setReport(null)} />
      <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} />
      <ImportErrorsDialog fileName={errors?.file ?? ''} issues={errors?.issues ?? null} onClose={() => setErrors(null)} />
    </header>
  );
}
