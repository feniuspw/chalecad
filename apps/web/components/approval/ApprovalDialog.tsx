'use client';
import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@chalecad/ui';
import { DISCLAIMER } from '@chalecad/engine';
import { isTyping } from '@/hooks/useShortcuts';
import { useApprovalUi, type ApprovalTab } from '@/lib/approval/ui';
import { useEditor } from '@/lib/store/editor';
import { ArtTab } from './ArtTab';
import { ComplianceTab } from './ComplianceTab';
import { DataTab } from './DataTab';
import { ExportTab } from './ExportTab';
import { MemorialsTab } from './MemorialsTab';

/** Tela "Aprovação": dados legais, verificação normativa, ART/RRT, memoriais e pacote. Shift+A abre. */
export function ApprovalDialog() {
  const open = useApprovalUi((s) => s.open);
  const tab = useApprovalUi((s) => s.tab);
  const ready = useEditor((s) => s.results?.approval?.ready);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'A' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (!useApprovalUi.getState().open && document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      const ui = useApprovalUi.getState();
      if (ui.open) ui.hide();
      else ui.show();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? useApprovalUi.getState().show() : useApprovalUi.getState().hide())}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0" data-testid="approval-dialog">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3 pr-14">
          <ShieldCheck className="size-5 text-accent" />
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">Aprovação</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Dados legais, verificação normativa com seu parecer, ficha da ART/RRT, memoriais e pacote para a prefeitura e o conselho.
            </DialogDescription>
          </div>
          {ready !== undefined ? (
            <span className={ready ? 'ml-auto rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800' : 'ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900'}>
              {ready ? 'Pronto para exportar' : 'Há pendências'}
            </span>
          ) : null}
        </div>
        <Tabs value={tab} onValueChange={(v) => useApprovalUi.getState().setTab(v as ApprovalTab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-3 w-fit shrink-0">
            <TabsTrigger value="data">Dados</TabsTrigger>
            <TabsTrigger value="compliance">Verificação</TabsTrigger>
            <TabsTrigger value="art">ART/RRT</TabsTrigger>
            <TabsTrigger value="memorials">Memoriais</TabsTrigger>
            <TabsTrigger value="export">Exportar</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="data" className="mt-0">
              <DataTab />
            </TabsContent>
            <TabsContent value="compliance" className="mt-0">
              <ComplianceTab />
            </TabsContent>
            <TabsContent value="art" className="mt-0">
              <ArtTab />
            </TabsContent>
            <TabsContent value="memorials" className="mt-0">
              <MemorialsTab />
            </TabsContent>
            <TabsContent value="export" className="mt-0">
              <ExportTab />
            </TabsContent>
          </div>
        </Tabs>
        <p className="shrink-0 border-t border-border px-6 py-2 text-[11px] text-stone-500">{DISCLAIMER}</p>
      </DialogContent>
    </Dialog>
  );
}
