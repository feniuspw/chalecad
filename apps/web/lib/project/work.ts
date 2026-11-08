/**
 * Aba Obra: cronograma em barras, compras e progresso. Funções puras (sem React nem store).
 * Nada aqui altera cálculos do motor; só lê `results` e `project.progress`.
 */
import { buildConstructionGuide, type BudgetLine, type Progress, type Project, type Results } from '@chalecad/engine';
import { STAGE_ORDER, getCatalog, type Catalog, type StageId } from '@chalecad/catalog';

/** Equipe e jornada usadas para estimar a duração quando o usuário não definiu. */
export const CREW_SIZE = 2;
export const HOURS_PER_WEEK = 44;

export type DurationSource = 'definido' | 'estimado';
export interface StageDuration {
  weeks: number;
  source: DurationSource;
}

const PHASE_STAGE: Record<string, StageId> = {
  layout: 'foundation',
  foundation: 'foundation',
  walls: 'structure',
  mezzanine: 'structure',
  roof: 'roof',
  exterior_closure: 'closure',
  interior_closure: 'closure',
  services: 'installations',
  floor: 'floor',
  finishing: 'finishing',
  extras: 'extras',
};

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** Etapas que têm custo no orçamento, na ordem de `STAGE_ORDER`. */
export function costStages(results: Results): StageId[] {
  const has = new Set(results.budget.byStage.filter((s) => s.total > 0).map((s) => s.stage));
  return STAGE_ORDER.filter((s) => has.has(s));
}

/** Semanas por etapa: `budget.durationsWeeks` quando definido; senão, horas-homem do roteiro (2 pessoas, 44 h/semana), em passos de 0,5. */
export function stageDurations(project: Project, results: Results, catalog: Catalog = getCatalog()): Partial<Record<StageId, StageDuration>> {
  const stages = costStages(results);
  const hh: Partial<Record<StageId, number>> = {};
  if (stages.some((s) => !(project.budget.durationsWeeks[s]! > 0))) {
    for (const step of buildConstructionGuide(project, results, catalog).steps) {
      const st = PHASE_STAGE[step.phase];
      if (st) hh[st] = (hh[st] ?? 0) + step.manHours;
    }
  }
  const out: Partial<Record<StageId, StageDuration>> = {};
  for (const s of stages) {
    const set = project.budget.durationsWeeks[s];
    out[s] = set && set > 0 ? { weeks: set, source: 'definido' } : { weeks: Math.max(0.5, roundHalf((hh[s] ?? 0) / (CREW_SIZE * HOURS_PER_WEEK))), source: 'estimado' };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Soma dias a uma data ISO (UTC, sem fuso). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + Math.round(days))).toISOString().slice(0, 10);
}

export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------------

export interface GanttRow {
  stage: StageId;
  /** Semanas desde o início da obra (0 = começo da semana 1). */
  start: number;
  end: number;
  weeks: number;
  source: DurationSource;
  /** Datas ISO; null sem `startDate`. */
  startDate: string | null;
  endDate: string | null;
  /** "Semana 1–3" ou "Semana 4". */
  weekLabel: string;
}

/** Ordem de agendamento: Instalações começam no meio do Fechamento; Acabamento só depois das Instalações. */
const SCHEDULE_ORDER: StageId[] = ['terrain', 'foundation', 'structure', 'closure', 'roof', 'floor', 'installations', 'finishing', 'extras'];

export function weekLabel(start: number, end: number): string {
  const a = Math.floor(start + 1e-9) + 1;
  const b = Math.max(a, Math.ceil(end - 1e-9));
  return a === b ? `Semana ${a}` : `Semana ${a}–${b}`;
}

/** Barras na ordem de `STAGE_ORDER`, só etapas com custo. */
export function ganttRows(project: Project, results: Results, catalog: Catalog = getCatalog()): GanttRow[] {
  const dur = stageDurations(project, results, catalog);
  const times = new Map<StageId, { start: number; end: number }>();
  let cursor = 0;
  for (const st of SCHEDULE_ORDER) {
    const d = dur[st];
    if (!d) continue;
    let start = cursor;
    if (st === 'installations') {
      const c = times.get('closure');
      if (c) start = c.start + (c.end - c.start) / 2;
    } else if (st === 'finishing') {
      start = Math.max(cursor, times.get('installations')?.end ?? 0);
    } else if (st === 'extras') {
      start = Math.max(cursor, ...[...times.values()].map((t) => t.end));
    }
    const end = start + d.weeks;
    times.set(st, { start, end });
    if (st !== 'installations') cursor = Math.max(cursor, end);
  }
  const sd = project.progress.startDate;
  return STAGE_ORDER.flatMap((stage) => {
    const t = times.get(stage);
    const d = dur[stage];
    if (!t || !d) return [];
    return [
      {
        stage,
        start: t.start,
        end: t.end,
        weeks: d.weeks,
        source: d.source,
        startDate: sd ? addDaysISO(sd, t.start * 7) : null,
        endDate: sd ? addDaysISO(sd, t.end * 7) : null,
        weekLabel: weekLabel(t.start, t.end),
      },
    ];
  });
}

export function totalWeeks(rows: GanttRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.end), 0);
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export type LeadKey = 'steelProfile' | 'concrete' | 'hardware' | 'foundationMaterial';

/** Categoria de prazo de entrega (mesma regra do roteiro "compre primeiro"); null = sem prazo típico. */
export function leadKeyOf(line: Pick<BudgetLine, 'itemId' | 'stage'>, catalog: Catalog = getCatalog()): LeadKey | null {
  if (line.stage === 'structure') return catalog.profiles.some((p) => p.id === line.itemId) ? 'steelProfile' : 'hardware';
  if (line.stage === 'foundation') return line.itemId === 'concrete_fck25' ? 'concrete' : 'foundationMaterial';
  return null;
}

export interface PurchaseRow {
  lineId: string;
  itemId: string;
  stage: StageId;
  name: string;
  qty: number;
  unit: string;
  /** Material da linha no orçamento (R$). */
  estimated: number;
  bought: boolean;
  boughtAt: string | null;
  paid: number | null;
  /** Mesmo `itemId` já aparece em outra linha: status compartilhado, valor pago só na primeira. */
  shared: boolean;
  /** Pago − orçado, só nas linhas compradas com valor pago. */
  diff: number | null;
  leadKey: LeadKey | null;
}

export interface PurchaseTotals {
  estimated: number;
  paid: number;
  remaining: number;
  boughtCount: number;
  count: number;
}

export interface PurchaseGroup {
  stage: StageId;
  rows: PurchaseRow[];
  totals: PurchaseTotals;
}

export interface PurchaseList {
  groups: PurchaseGroup[];
  totals: PurchaseTotals;
}

function totalsOf(rows: PurchaseRow[]): PurchaseTotals {
  let estimated = 0;
  let paid = 0;
  let remaining = 0;
  let boughtCount = 0;
  for (const r of rows) {
    estimated += r.estimated;
    if (r.paid !== null) paid += r.paid;
    if (r.bought) boughtCount++;
    else remaining += r.estimated;
  }
  return { estimated, paid, remaining, boughtCount, count: rows.length };
}

export function purchaseList(results: Results, progress: Progress, catalog: Catalog = getCatalog()): PurchaseList {
  const seen = new Set<string>();
  const byStage = new Map<StageId, PurchaseRow[]>();
  const ordered = STAGE_ORDER.flatMap((st) => results.budget.lines.filter((l) => l.stage === st));
  for (const l of ordered) {
    const p = progress.purchased[l.itemId];
    const shared = seen.has(l.itemId);
    seen.add(l.itemId);
    const paid = p?.paid !== undefined && !shared ? p.paid : null;
    const row: PurchaseRow = {
      lineId: l.lineId,
      itemId: l.itemId,
      stage: l.stage,
      name: l.name,
      qty: l.qty,
      unit: l.unit,
      estimated: l.material,
      bought: !!p,
      boughtAt: p?.at ?? null,
      paid,
      shared,
      diff: paid !== null ? paid - l.material : null,
      leadKey: leadKeyOf(l, catalog),
    };
    byStage.set(l.stage, [...(byStage.get(l.stage) ?? []), row]);
  }
  const groups = STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => {
    const rows = byStage.get(stage)!;
    return { stage, rows, totals: totalsOf(rows) };
  });
  return { groups, totals: totalsOf(groups.flatMap((g) => g.rows)) };
}

export interface BuyBy {
  days: number;
  /** Data limite ISO; null sem `startDate`. */
  date: string | null;
  /** "até 12/03/2027" ou "21 dias antes do início da etapa". */
  label: string;
  /** Data já passou e o item não foi comprado. */
  overdue: boolean;
}

/** Data limite para comprar: início da etapa − prazo de entrega da categoria. Null quando a categoria não tem prazo. */
export function buyBy(
  row: Pick<PurchaseRow, 'leadKey' | 'bought'>,
  stageStart: { start: number; startDate: string | null },
  leadTimes: Catalog['constants']['leadTimes'],
  today: string = todayISO(),
): BuyBy | null {
  if (!row.leadKey) return null;
  const days = leadTimes[row.leadKey].days;
  if (!stageStart.startDate) return { days, date: null, label: `${days} dias antes do início da etapa`, overdue: false };
  const date = addDaysISO(stageStart.startDate, -days);
  return { days, date, label: `até ${isoToBR(date)}`, overdue: !row.bought && date < today };
}

// ---------------------------------------------------------------------------
// Progresso e receitas de edição (mutam um rascunho Immer de `project.progress`)
// ---------------------------------------------------------------------------

export interface WorkProgress {
  stagesDone: number;
  stagesTotal: number;
  paid: number;
  estimated: number;
}

export function workProgress(results: Results, progress: Progress, catalog: Catalog = getCatalog()): WorkProgress {
  const stages = costStages(results);
  const list = purchaseList(results, progress, catalog);
  return {
    stagesDone: stages.filter((s) => progress.stagesDone.includes(s)).length,
    stagesTotal: stages.length,
    paid: list.totals.paid,
    estimated: list.totals.estimated,
  };
}

export function setStartDate(progress: Progress, date: string | undefined): void {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) progress.startDate = date;
  else delete progress.startDate;
}

/** Marca ou desmarca "comprado". Desmarcar remove também o valor pago e a nota. */
export function setBought(progress: Progress, itemId: string, bought: boolean, today: string = todayISO()): void {
  if (!bought) {
    delete progress.purchased[itemId];
    return;
  }
  if (!progress.purchased[itemId]) progress.purchased[itemId] = { at: today };
}

/** Valor pago (R$ total do item). Informar valor marca o item como comprado; vazio/negativo limpa só o valor. */
export function setPaid(progress: Progress, itemId: string, paid: number | null, today: string = todayISO()): void {
  const cur = progress.purchased[itemId];
  if (paid === null || !(paid >= 0)) {
    if (cur) delete cur.paid;
    return;
  }
  if (cur) cur.paid = paid;
  else progress.purchased[itemId] = { at: today, paid };
}

export function setStageDone(progress: Progress, stage: StageId, done: boolean): void {
  const set = new Set(progress.stagesDone);
  if (done) set.add(stage);
  else set.delete(stage);
  progress.stagesDone = STAGE_ORDER.filter((s) => set.has(s));
}

/** Grava a duração em `budget.durationsWeeks` (0 ou vazio volta para a estimativa). */
export function setDuration(budget: Project['budget'], stage: StageId, weeks: number): void {
  if (weeks > 0) budget.durationsWeeks[stage] = weeks;
  else delete budget.durationsWeeks[stage];
}
