'use client';
import { useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, FileText, FolderOpen, Plus, Redo2, Undo2 } from 'lucide-react';
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
import { ImportErrorsDialog } from './ImportErrorsDialog';
import { ProjectName } from './ProjectName';
import { ComputeStatus, SaveStatus } from './StatusIndicators';

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
  const mod = isMac() ? '⌘' : 'Ctrl+';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await openJsonFile(file);
    if (r.ok) toast.success(`“${r.name}” aberto.`, { description: 'O projeto anterior foi salvo.' });
    else setErrors({ file: file.name, issues: r.issues });
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

        <Button variant="outline" size="sm" onClick={onNew}>
          <Plus /> Novo
        </Button>

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
              <Download /> Exportar <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => toast.success(`Arquivo ${exportProjectJson()} baixado.`)}>
              <FileJson /> JSON do projeto
            </DropdownMenuItem>
            {['PDF com plantas e lista', 'CSV por fornecedor'].map((l) => (
              <DropdownMenuItem key={l} onSelect={() => toast.info('Exportação disponível em breve')}>
                <FileText /> {l}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ImportErrorsDialog fileName={errors?.file ?? ''} issues={errors?.issues ?? null} onClose={() => setErrors(null)} />
    </header>
  );
}
