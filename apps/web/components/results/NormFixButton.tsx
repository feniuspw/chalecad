'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, Hourglass, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, cn, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@chalecad/ui';
import { formatBRL } from '@/lib/format';
import { planNormFixes, type NormFixPlan } from '@/lib/project/normfix';
import { useEditor } from '@/lib/store/editor';

function Count({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="rounded-lg border border-border bg-stone-50 px-3 py-2">
      <p className="text-[11px] font-medium text-stone-500">{label}</p>
      <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-stone-900">
        {before}
        <ArrowRight className="size-3.5 text-stone-400" />
        <span className={cn(after < before ? 'text-emerald-700' : 'text-stone-900')}>{after}</span>
      </p>
    </div>
  );
}

/** Botão "Ajustar às normas": mostra o que muda e o que fica pendente antes de aplicar (uma única alteração, desfazível). */
export function NormFixButton({ className }: { className?: string }) {
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const [open, setOpen] = useState(false);
  const plan = useMemo<NormFixPlan | null>(() => {
    if (!open) return null;
    try {
      return planNormFixes(project);
    } catch {
      return null;
    }
  }, [open, project]);

  const apply = () => {
    if (!plan) return;
    update('Ajustar às normas', (d) => {
      Object.assign(d, plan.project);
    });
    setOpen(false);
    toast.success(`${plan.changes.length} ajuste(s) aplicado(s).`, { description: 'Desfaça com Ctrl/⌘+Z.' });
  };

  return (
    <>
      <Button size="sm" variant="outline" className={cn('h-8 gap-1.5', className)} onClick={() => setOpen(true)}>
        <Wand2 className="size-3.5" /> Ajustar às normas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajustar às normas</DialogTitle>
            <DialogDescription>
              Aplica de uma vez o que dá para corrigir sem decisão de projeto. É uma única alteração: dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          {!plan ? (
            <p className="text-sm text-stone-500">Não foi possível calcular os ajustes para este projeto.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Count label="Verificações reprovadas" before={plan.before.fail} after={plan.after.fail} />
                <Count label="Alertas de atenção" before={plan.before.warn} after={plan.after.warn} />
              </div>
              <div className="rounded-lg border border-border bg-stone-50 px-3 py-2">
                <p className="text-[11px] font-medium text-stone-500">Custo estimado</p>
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold tabular-nums text-stone-900">
                  {formatBRL(plan.before.total)}
                  <ArrowRight className="size-3.5 text-stone-400" />
                  {formatBRL(plan.after.total)}
                  <span className={cn('text-xs font-medium', plan.after.total > plan.before.total ? 'text-amber-700' : 'text-emerald-700')}>
                    ({plan.after.total >= plan.before.total ? '+' : '−'}
                    {formatBRL(Math.abs(plan.after.total - plan.before.total))})
                  </span>
                </p>
                {plan.after.total - plan.before.total > plan.before.total * 0.1 ? (
                  <p className="mt-1 text-[11px] leading-snug text-stone-500">
                    O perfil dos montantes e o espaçamento valem para a estrutura toda: a parede mais alta puxa o resto. Um engenheiro costuma resolver só onde precisa (reforço na empena, apoio intermediário nos caibros) e sai mais barato.
                  </p>
                ) : null}
              </div>
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-800">
                  <CircleCheck className="size-3.5 text-emerald-600" /> O que muda
                </h3>
                {plan.changes.length === 0 ? (
                  <p className="text-xs text-stone-500">Nada a corrigir automaticamente.</p>
                ) : (
                  <ul className="space-y-1">
                    {plan.changes.map((c, i) => (
                      <li key={i} className="rounded-md bg-emerald-50/70 px-2.5 py-1.5 text-xs text-stone-700">
                        <span className="font-medium text-stone-900">{c.label}:</span> {c.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {plan.pending.length > 0 ? (
                <section>
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-800">
                    <Hourglass className="size-3.5 text-amber-600" /> Fica para você ou para o engenheiro
                  </h3>
                  <ul className="space-y-1">
                    {plan.pending.map((p, i) => (
                      <li key={i} className="rounded-md bg-amber-50/70 px-2.5 py-1.5 text-xs leading-relaxed text-stone-700">
                        {p}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <p className="text-[11px] text-stone-500">Estimativa para planejamento. Não substitui projeto estrutural com ART.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={apply} disabled={!plan || plan.changes.length === 0}>
              <Wand2 className="size-4" /> Aplicar {plan && plan.changes.length > 0 ? `${plan.changes.length} ajuste(s)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
