/** Página opcional "Cronograma e compras" do PDF: só entra com `startDate` ou alguma compra marcada. */
import { getCatalog, type Catalog } from '@chalecad/catalog';
import type { Project, Results } from '@chalecad/engine';
import { buyBy, ganttRows, isoToBR, purchaseList, todayISO, totalWeeks } from '../project/work';
import { brl } from './format';
import { stageLabel } from './labels';

export interface WorkPdf {
  summary: { label: string; value: string }[];
  schedule: { stage: string; start: string; end: string; weeks: string; done: boolean }[];
  /** O que falta comprar, por etapa, com data limite. */
  toBuy: { stage: string; rows: { name: string; qty: string; estimated: string; by: string; overdue: boolean }[] }[];
  /** Itens já comprados: contagem e valores. */
  bought: string;
}

const clean = (s: string) => Array.from(s, (c) => (c.charCodeAt(0) > 255 ? '-' : c)).join('');

export function buildWorkPdf(project: Project, results: Results, opts: { catalog?: Catalog; today?: string } = {}): WorkPdf | null {
  const pr = project.progress;
  if (!pr.startDate && Object.keys(pr.purchased).length === 0) return null;
  const catalog = opts.catalog ?? getCatalog();
  const today = opts.today ?? todayISO();
  const structure = project.system.structure;
  const rows = ganttRows(project, results, catalog);
  const list = purchaseList(results, pr, catalog);
  const weeks = totalWeeks(rows);
  const startByStage = new Map(rows.map((r) => [r.stage, { start: r.start, startDate: r.startDate }]));
  const fmtWeeks = (w: number) => `${w.toFixed(1).replace('.', ',').replace(/,0$/, '')} sem.`;

  const summary = [
    { label: 'Início da obra', value: pr.startDate ? isoToBR(pr.startDate) : 'não definido' },
    { label: 'Duração total', value: fmtWeeks(weeks) },
    ...(rows.length && rows[rows.length - 1]!.endDate ? [{ label: 'Término previsto', value: isoToBR(rows.map((r) => r.endDate!).sort().at(-1)!) }] : []),
    { label: 'Etapas concluídas', value: `${rows.filter((r) => pr.stagesDone.includes(r.stage)).length} de ${rows.length}` },
    { label: 'Pago / orçado em materiais', value: `${brl(list.totals.paid)} / ${brl(list.totals.estimated)}` },
    { label: 'Falta comprar (orçado)', value: brl(list.totals.remaining) },
  ];
  const schedule = rows.map((r) => ({
    stage: stageLabel(r.stage, structure),
    start: r.startDate ? isoToBR(r.startDate) : r.weekLabel,
    end: r.endDate ? isoToBR(r.endDate) : '—',
    weeks: fmtWeeks(r.weeks),
    done: pr.stagesDone.includes(r.stage),
  }));
  const toBuy = list.groups.flatMap((g) => {
    const pending = g.rows.filter((r) => !r.bought);
    if (!pending.length) return [];
    const st = startByStage.get(g.stage) ?? { start: 0, startDate: null };
    return [
      {
        stage: stageLabel(g.stage, structure),
        rows: pending.map((r) => {
          const by = buyBy(r, st, catalog.constants.leadTimes, today);
          return {
            name: clean(r.name),
            qty: `${r.qty.toFixed(2).replace('.', ',').replace(/,?0+$/, '')} ${r.unit}`,
            estimated: brl(r.estimated),
            by: by ? (by.date ? isoToBR(by.date) : by.label) : '—',
            overdue: !!by?.overdue,
          };
        }),
      },
    ];
  });
  return { summary, schedule, toBuy, bought: `${list.totals.boughtCount} de ${list.totals.count} itens comprados` };
}
