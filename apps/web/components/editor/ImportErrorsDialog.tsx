'use client';
import { AlertTriangle } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@chalecad/ui';
import type { ValidationIssue } from '@/lib/store/types';

export function ImportErrorsDialog({ fileName, issues, onClose }: { fileName: string; issues: ValidationIssue[] | null; onClose: () => void }) {
  return (
    <Dialog open={issues !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-fail" /> Não foi possível abrir o arquivo
          </DialogTitle>
          <DialogDescription>
            “{fileName}” não é um projeto ChaléCAD válido. O projeto atual continua aberto e nada foi alterado.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {(issues ?? []).slice(0, 100).map((i, k) => (
            <li key={`${i.path}-${k}`} className="flex gap-3 px-3 py-2 text-sm">
              <code className="shrink-0 font-mono text-xs text-fail">{i.path || 'arquivo'}</code>
              <span className="text-stone-700">{i.message}</span>
            </li>
          ))}
        </ul>
        {issues && issues.length > 100 ? <p className="text-xs text-stone-500">Mostrando 100 de {issues.length} problemas.</p> : null}
        <DialogFooter>
          <Button onClick={onClose}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
