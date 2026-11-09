/** Carimbo (selo) da prancha, quadro de revisões e caixa de aprovação da prefeitura. Tudo em mm de papel. */
import type { Catalog } from '@chalecad/catalog';
import type { Discipline, Professional, Project, Results, SheetSpec } from '@chalecad/engine';
import { fmt } from '../../project/format';
import { INK, MUTED, group, line, rect, text } from '../../plan2d/svg';
import { fit } from './text';

/** Campos do carimbo, já em texto. Vazio = linha em branco. */
export interface StampData {
  work: string;
  content: string;
  stage: string;
  owner: string;
  ownerDoc: string;
  address: string;
  lotLine: string;
  author: string;
  authorReg: string;
  executor: string;
  executorReg: string;
  artDesign: string;
  artExec: string;
  scale: string;
  date: string;
  sheet: string;
  code: string;
  revision: string;
  drawnBy: string;
  checkedBy: string;
  lotArea: string;
  builtArea: string;
  fileName: string;
  /** Todas as revisões, da mais antiga para a mais nova. */
  revisions: { code: string; date: string; description: string }[];
}

const LABEL = 1.7;
const VALUE = 2.5;
const REV_HEADER = 5;
const REV_ROW = 4.5;
const REV_MAX = 4;
const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const join = (parts: (string | undefined)[], sep: string) => parts.map(clean).filter(Boolean).join(sep);

const isoToBr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const registryOf = (p: Professional | undefined) => (p ? `${p.council} ${p.registry}`.trim() + (p.uf ? `/${p.uf}` : '') : '');

export function professionalFor(project: Project, discipline: Discipline): Professional | undefined {
  return project.legal.professionals.find((p) => p.disciplines.includes(discipline));
}

export interface StampInput {
  project: Project;
  results: Results;
  catalog: Catalog;
  spec: SheetSpec;
  scaleLabel: string;
  index: number;
  total: number;
  date: Date;
  fileName: string;
}

export function stampData(i: StampInput): StampData {
  const { project, results, catalog, spec } = i;
  const legal = project.legal;
  const stage = catalog.constants.approval.stages.find((s) => s.id === legal.stage);
  const author = professionalFor(project, spec.discipline);
  const exec = legal.professionals.find((p) => p.disciplines.includes('execution'));
  const a = legal.address;
  const lotArea = results.approval?.urban?.lotArea ?? (legal.lot ? lotAreaOf(legal.lot) : undefined);
  const built = results.approval?.areas.totalBuilt ?? results.approval?.urban?.builtArea ?? results.model.builtArea;
  const last = legal.revisions[legal.revisions.length - 1];
  return {
    work: project.meta.name,
    content: spec.title,
    stage: stage ? `${stage.label} (${stage.code})` : '',
    owner: clean(legal.owner.name),
    ownerDoc: clean(legal.owner.doc),
    address: join([join([a.street, a.number, a.complement], ', '), a.district, join([a.city, project.meta.region], '/'), a.cep ? `CEP ${a.cep}` : ''], ' - '),
    lotLine: `Lote ${clean(a.lot)}   Quadra ${clean(a.block)}   Matrícula ${clean(a.registry)}   Inscrição ${clean(a.cadastral)}`,
    author: join([author?.name, author?.title], ' - '),
    authorReg: registryOf(author),
    executor: join([exec?.name, exec?.title], ' - '),
    executorReg: registryOf(exec),
    artDesign: clean(author?.docNumber),
    artExec: clean(exec?.docNumber),
    scale: i.scaleLabel,
    date: i.date.toLocaleDateString('pt-BR'),
    sheet: `${i.index}/${i.total}`,
    code: spec.code,
    revision: last ? last.code : '',
    drawnBy: clean(legal.drawnBy),
    checkedBy: clean(legal.checkedBy),
    lotArea: lotArea !== undefined ? `${fmt(lotArea, 2)} m²` : '',
    builtArea: `${fmt(built, 2)} m²`,
    fileName: i.fileName,
    revisions: legal.revisions.map((r) => ({ code: r.code, date: isoToBr(r.date), description: clean(r.description) })),
  };
}

function lotAreaOf(lot: NonNullable<Project['legal']['lot']>): number {
  if (lot.polygon && lot.polygon.length >= 3) {
    let s = 0;
    for (let k = 0; k < lot.polygon.length; k++) {
      const p = lot.polygon[k]!;
      const q = lot.polygon[(k + 1) % lot.polygon.length]!;
      s += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(s) / 2;
  }
  return lot.front * lot.depth;
}

const STROKE = 0.25;

function cell(x: number, y: number, w: number, h: number, label: string, value: string, o: { size?: number; bold?: boolean; extra?: string } = {}): string {
  const size = o.size ?? VALUE;
  const lines = [value, o.extra ?? ''].filter((s, k) => k === 0 || s !== '');
  const parts = [rect(x, y, w, h, { fill: 'none', stroke: INK, 'stroke-width': STROKE })];
  parts.push(text(x + 1.2, y + 2.4, label, { 'font-size': LABEL, 'text-anchor': 'start', fill: MUTED }));
  lines.forEach((v, k) => {
    parts.push(text(x + 1.2, y + 2.4 + 3.6 + k * 3.8, fit(v, w - 2.4, size, o.bold), { 'font-size': size, 'text-anchor': 'start', 'font-weight': o.bold ? 700 : 400 }));
  });
  return group(parts.join(''), { 'data-field': label });
}

/** Altura do carimbo (mm): a soma das linhas, no mínimo `minHeight` do catálogo. */
export function stampHeight(catalog: Catalog): number {
  return Math.max(catalog.constants.approval.titleBlock.minHeight, ROWS.reduce((s, r) => s + r, 0));
}
const ROWS = [11, 11, 11, 15, 11, 11, 11, 11, 14, 7];

/** Altura da tabela de revisões (cabeçalho + linhas mostradas). */
export function revisionsHeight(n: number): number {
  return REV_HEADER + REV_ROW * Math.max(1, Math.min(REV_MAX, n));
}

/** Desenha o carimbo com o canto superior esquerdo em (x, y) e largura `w`. */
export function stampSvg(d: StampData, x: number, y: number, w: number, h: number): string {
  const out: string[] = [];
  const rowH = ROWS.map((r) => r * (h / ROWS.reduce((s, v) => s + v, 0)));
  let cy = y;
  const row = (k: number) => {
    const top = cy;
    cy += rowH[k]!;
    return { top, h: rowH[k]! };
  };
  const split = (total: number, parts: number[]) => {
    const sum = parts.reduce((s, v) => s + v, 0);
    let ax = x;
    return parts.map((p) => {
      const cw = (total * p) / sum;
      const r = { x: ax, w: cw };
      ax += cw;
      return r;
    });
  };
  let r = row(0);
  out.push(cell(x, r.top, w, r.h, 'OBRA', d.work, { size: 3.5, bold: true }));
  r = row(1);
  let c = split(w, [120, 55]);
  out.push(cell(c[0]!.x, r.top, c[0]!.w, r.h, 'CONTEÚDO DA PRANCHA', d.content, { bold: true }), cell(c[1]!.x, r.top, c[1]!.w, r.h, 'ETAPA', d.stage));
  r = row(2);
  c = split(w, [120, 55]);
  out.push(cell(c[0]!.x, r.top, c[0]!.w, r.h, 'PROPRIETÁRIO', d.owner), cell(c[1]!.x, r.top, c[1]!.w, r.h, 'CPF/CNPJ', d.ownerDoc));
  r = row(3);
  out.push(cell(x, r.top, w, r.h, 'ENDEREÇO DA OBRA', d.address, { extra: d.lotLine }));
  r = row(4);
  c = split(w, [120, 55]);
  out.push(cell(c[0]!.x, r.top, c[0]!.w, r.h, 'AUTOR DO PROJETO', d.author), cell(c[1]!.x, r.top, c[1]!.w, r.h, 'CONSELHO / REGISTRO', d.authorReg));
  r = row(5);
  c = split(w, [88, 44, 43]);
  out.push(
    cell(c[0]!.x, r.top, c[0]!.w, r.h, 'RESPONSÁVEL PELA EXECUÇÃO', d.executor, { extra: d.executorReg }),
    cell(c[1]!.x, r.top, c[1]!.w, r.h, 'Nº ART/RRT (PROJETO)', d.artDesign),
    cell(c[2]!.x, r.top, c[2]!.w, r.h, 'Nº ART/RRT (EXECUÇÃO)', d.artExec),
  );
  r = row(6);
  c = split(w, [34, 34, 22, 40, 45]);
  out.push(
    cell(c[0]!.x, r.top, c[0]!.w, r.h, 'ESCALA', d.scale),
    cell(c[1]!.x, r.top, c[1]!.w, r.h, 'DATA', d.date),
    cell(c[2]!.x, r.top, c[2]!.w, r.h, 'FOLHA', d.sheet, { bold: true }),
    cell(c[3]!.x, r.top, c[3]!.w, r.h, 'CÓDIGO', d.code, { bold: true }),
    cell(c[4]!.x, r.top, c[4]!.w, r.h, 'REVISÃO', d.revision),
  );
  r = row(7);
  c = split(w, [28, 28, 59.5, 59.5]);
  out.push(
    cell(c[0]!.x, r.top, c[0]!.w, r.h, 'DESENHO', d.drawnBy),
    cell(c[1]!.x, r.top, c[1]!.w, r.h, 'CONFERÊNCIA', d.checkedBy),
    cell(c[2]!.x, r.top, c[2]!.w, r.h, 'ÁREA DO TERRENO', d.lotArea),
    cell(c[3]!.x, r.top, c[3]!.w, r.h, 'ÁREA CONSTRUÍDA', d.builtArea),
  );
  r = row(8);
  c = split(w, [1, 1]);
  out.push(
    cell(c[0]!.x, r.top, c[0]!.w, r.h, 'ASSINATURA DO PROPRIETÁRIO', ''),
    cell(c[1]!.x, r.top, c[1]!.w, r.h, 'ASSINATURA DO RESPONSÁVEL TÉCNICO', ''),
  );
  // Linha de assinatura.
  for (const k of c) out.push(line(k.x + 4, r.top + r.h - 3.5, k.x + k.w - 4, r.top + r.h - 3.5, { 'stroke-width': STROKE }));
  r = row(9);
  c = split(w, [60, 115]);
  out.push(
    rect(c[0]!.x, r.top, c[0]!.w, r.h, { fill: 'none', stroke: INK, 'stroke-width': STROKE }),
    text(c[0]!.x + 1.2, r.top + 4.7, 'ChaléCAD', { 'font-size': 3.2, 'text-anchor': 'start', 'font-weight': 700 }),
    rect(c[1]!.x, r.top, c[1]!.w, r.h, { fill: 'none', stroke: INK, 'stroke-width': STROKE }),
    text(c[1]!.x + c[1]!.w - 1.2, r.top + 4.7, fit(d.fileName, c[1]!.w - 2.4, 2.2), { 'font-size': 2.2, 'text-anchor': 'end', fill: MUTED }),
  );
  out.push(rect(x, y, w, h, { fill: 'none', stroke: INK, 'stroke-width': 0.5 }));
  return group(out.join(''), { 'data-role': 'title-block' });
}

/** Quadro de revisões: cabeçalho e as últimas linhas (mais nova embaixo, junto ao carimbo). */
export function revisionsSvg(d: StampData, x: number, y: number, w: number): string {
  const shown = d.revisions.slice(-REV_MAX);
  const rows = Math.max(1, Math.min(REV_MAX, d.revisions.length));
  const cols = [14, 24, w - 38];
  const out: string[] = [rect(x, y, w, REV_HEADER + REV_ROW * rows, { fill: 'none', stroke: INK, 'stroke-width': 0.5 })];
  let cx = x;
  ['REV.', 'DATA', 'DESCRIÇÃO DA REVISÃO'].forEach((h, k) => {
    out.push(rect(cx, y, cols[k]!, REV_HEADER, { fill: '#f5f5f4', stroke: INK, 'stroke-width': STROKE }), text(cx + 1.2, y + 3.5, h, { 'font-size': 2, 'text-anchor': 'start', 'font-weight': 700 }));
    cx += cols[k]!;
  });
  for (let r = 0; r < rows; r++) {
    const rev = shown[r];
    cx = x;
    const vals = rev ? [rev.code, rev.date, rev.description] : ['', '', ''];
    vals.forEach((v, k) => {
      out.push(rect(cx, y + REV_HEADER + r * REV_ROW, cols[k]!, REV_ROW, { fill: 'none', stroke: INK, 'stroke-width': STROKE }), text(cx + 1.2, y + REV_HEADER + r * REV_ROW + 3.2, fit(v, cols[k]! - 2.4, 2.2), { 'font-size': 2.2, 'text-anchor': 'start' }));
      cx += cols[k]!;
    });
  }
  return group(out.join(''), { 'data-role': 'revisions' });
}

/** Espaço livre para o carimbo de aprovação da prefeitura. */
export function approvalBoxSvg(x: number, y: number, w: number, h: number): string {
  return group(
    rect(x, y, w, h, { fill: 'none', stroke: INK, 'stroke-width': 0.5 }) +
      text(x + w / 2, y + 4, 'Reservado à aprovação', { 'font-size': 2.5, fill: MUTED }) +
      line(x, y + 5.5, x + w, y + 5.5, { 'stroke-width': STROKE }),
    { 'data-role': 'approval-box' },
  );
}
