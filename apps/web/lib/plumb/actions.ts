'use client';
/** Ações da hidráulica sobre os stores (cada uma é um passo de desfazer no editor). */
import { toast } from 'sonner';
import { getCatalog } from '@chalecad/catalog';
import { computePlumbing, type PipeSystem, type PlumbingLayout, type Project, type Results } from '@chalecad/engine';
import { useEditor } from '../store/editor';
import { liveLayout, plumbingReportOf } from './live';
import { autoRoute, backToAuto, deletePipe, deletePoint, MANUAL_NOTE, raiseTankToMeet } from './ops';
import { usePlumb } from './store';

/** Avisa que o traçado virou manual (a primeira edição copia o traçado gerado para o projeto). */
export const noteManual = (wasManual: boolean) => {
  if (!wasManual) toast.info(MANUAL_NOTE, { id: 'plumb-manual', duration: 6000 });
};

export function currentLayout(): PlumbingLayout | null {
  const s = useEditor.getState();
  return liveLayout(s.project, plumbingReportOf(s.project, s.results));
}

/** Excluir o tubo ou ponto selecionado. A caixa d'água não se exclui. */
export function deletePlumbSelection(): boolean {
  const sel = usePlumb.getState().sel;
  const layout = currentLayout();
  if (!sel || !layout) return false;
  if (sel.kind === 'tank') {
    toast.info("A caixa d'água não pode ser excluída: arraste-a ou mude a cota do fundo.");
    return true;
  }
  const s = useEditor.getState();
  const was = s.project.installations.plumbing.manual;
  s.update(sel.kind === 'pipe' ? 'Excluir tubo' : 'Excluir ponto de água', (d) => (sel.kind === 'pipe' ? deletePipe(d, layout, sel.id) : deletePoint(d, layout, sel.id)));
  usePlumb.getState().select(null);
  noteManual(was);
  return true;
}

/** "Subir até atender": aplica o maior `requiredTankRise`. */
export function raiseTankUntilOk(): number {
  const s = useEditor.getState();
  const report = plumbingReportOf(s.project, s.results);
  if (!report) return 0;
  let rise = 0;
  s.update("Subir a caixa d'água", (d) => {
    rise = raiseTankToMeet(d, report);
  });
  if (rise > 0) toast.success(`Caixa subiu ${rise.toFixed(2).replace('.', ',')} m. A pressão será recalculada.`);
  else toast.info('Todos os pontos já atendem a pressão mínima.');
  return rise;
}

/** "Gerar automaticamente": volta ao traçado do motor (o usuário confirma antes). */
export function generateAutomatically(): void {
  useEditor.getState().update('Gerar hidráulica automaticamente', (d: Project) => backToAuto(d));
  usePlumb.getState().select(null);
  toast.success('O motor voltou a gerar o traçado hidráulico.');
}

/** Traçado que o motor geraria agora (ignora o manual), com o modelo já calculado. */
export function generatedLayout(project: Project, results: Pick<Results, 'model'>): PlumbingLayout | null {
  const copy = structuredClone(project);
  copy.installations.plumbing.manual = false;
  copy.installations.plumbing.points = [];
  copy.installations.plumbing.pipes = [];
  return computePlumbing(copy, results.model, getCatalog())?.report.layout ?? null;
}

/** "Rotear automaticamente": troca os tubos dos sistemas pelos do traçado gerado. */
export function routeAutomatically(systems: PipeSystem[]): number {
  const s = useEditor.getState();
  if (!s.results) return 0;
  const layout = currentLayout();
  const auto = generatedLayout(s.project, s.results);
  if (!layout || !auto) {
    toast.info('Não há traçado para gerar: marque o banheiro ou ponha a torre da caixa.');
    return 0;
  }
  const was = s.project.installations.plumbing.manual;
  let n = 0;
  s.update('Rotear automaticamente', (d) => {
    n = autoRoute(d, layout, auto, systems);
  });
  noteManual(was);
  toast.success(`${n} tubo${n === 1 ? '' : 's'} gerado${n === 1 ? '' : 's'} pelo motor.`);
  return n;
}

/** "Mostrar na planta": liga a camada, vai ao nível do objeto citado (ponto ou tubo) e o seleciona. */
export function showOnPlan(refs: string[]): boolean {
  const s = useEditor.getState();
  const layout = liveLayout(s.project, plumbingReportOf(s.project, s.results));
  if (!layout) return false;
  const pt = refs.map((r) => layout.points.find((p) => p.id === r)).find(Boolean);
  const pipe = refs.map((r) => layout.pipes.find((p) => p.id === r)).find(Boolean);
  const target = pt ? { kind: 'point' as const, id: pt.id, level: pt.level } : pipe ? { kind: 'pipe' as const, id: pipe.id, level: pipe.level } : null;
  const p = usePlumb.getState();
  p.setLayer(true);
  s.setCameraView('plan');
  if (!target) return false;
  s.setActiveLevel(target.level);
  p.setTool('edit');
  p.select({ kind: target.kind, id: target.id });
  return true;
}
