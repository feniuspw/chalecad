/** Pacote de aprovação (.zip): monta pasta a pasta, com progresso, cancelamento e etapas que podem falhar. */
import { getCatalog, type Catalog } from '@chalecad/catalog';
import type { Project, Results } from '@chalecad/engine';
import { buildZip, type ZipEntry } from '../three/zip';
import { artDoc, complianceDoc, memorialDoc, permitDoc, septicDoc, slug, utilityDoc, type DocSpec } from './docs';
import { todayIso } from './labels';
import { buildReadme, type PackageStep } from './readme';

export interface PackDeps {
  /** PDF das pranchas (F17-W1). */
  sheetsPdf(ctx: { project: Project; results: Results; catalog: Catalog }): Promise<Uint8Array>;
  /** DXF já codificado (Windows-1252). */
  dxf(project: Project, results: Results): Uint8Array;
  /** PDF de quantitativos (plantas + lista). */
  quantitiesPdf(project: Project, results: Results): Promise<Uint8Array>;
  csvs(project: Project, results: Results): { name: string; text: string }[];
  renderDoc(spec: DocSpec): Promise<Uint8Array>;
}

export interface PackProgress {
  step: number;
  total: number;
  label: string;
}

export interface PackOptions {
  project: Project;
  results: Results;
  deps: PackDeps;
  onProgress?: (p: PackProgress) => void;
  signal?: AbortSignal;
  now?: Date;
}

export interface PackResult {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  steps: PackageStep[];
  ready: boolean;
  entries: string[];
}

const enc = new TextEncoder();
const utf8 = (s: string) => enc.encode(s);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const packFileName = (projectName: string, date: string) => `aprovacao-${slug(projectName)}-${date}.zip`;

/** Pendências para o LEIA-ME: dados obrigatórios que faltam e itens que não passam sem parecer. */
export function pendingList(project: Project, results: Results): string[] {
  const ap = results.approval;
  if (!ap) return ['Verificação normativa não calculada'];
  const out = ap.missingInputs.filter((m) => m.required).map((m) => `Dado obrigatório: ${m.label}`);
  for (const c of ap.compliance) if (c.status === 'fail' && !project.legal.reviews[c.id]) out.push(`Não passa, sem parecer: ${c.title} (${c.norm})`);
  return out;
}

export async function buildApprovalPackage(o: PackOptions): Promise<PackResult> {
  const { project, results, deps, signal } = o;
  const date = todayIso(o.now);
  const ap = results.approval;
  const entries: ZipEntry[] = [];
  const steps: PackageStep[] = [];

  type JobOut = { files: ZipEntry[]; failed?: string };
  type Job = { path: string; description: string; run: () => Promise<JobOut> };
  const need = <T,>(v: T | undefined, what: string): T => {
    if (v === undefined) throw new Error(what);
    return v;
  };
  const doc = async (folder: string, spec: DocSpec): Promise<ZipEntry> => ({ name: `${folder}/${spec.fileName}`, data: await deps.renderDoc(spec) });
  const ctx = () => ({ project, results, catalog: getCatalog() });

  const jobs: Job[] = [
    {
      path: '01-pranchas/',
      description: 'pranchas em PDF (formato ABNT, com carimbo) e o desenho em DXF.',
      run: async () => {
        const out: ZipEntry[] = [];
        const errors: string[] = [];
        try {
          out.push({ name: '01-pranchas/pranchas.pdf', data: await deps.sheetsPdf(ctx()) });
        } catch (e) {
          errors.push(`PDF das pranchas: ${msg(e)}`);
        }
        try {
          out.push({ name: '01-pranchas/projeto.dxf', data: deps.dxf(project, results) });
        } catch (e) {
          errors.push(`DXF: ${msg(e)}`);
        }
        if (out.length === 0) throw new Error(errors.join('; '));
        // parcial: o que saiu fica no zip e o que falhou vai para o LEIA-ME
        return { files: out, ...(errors.length > 0 ? { failed: errors.join('; ') } : {}) };
      },
    },
    {
      path: '02-memoriais/',
      description: 'um PDF por memorial (descritivo e de cálculo).',
      run: async () => {
        const a = need(ap, 'verificação normativa não calculada');
        if (a.memorials.length === 0) throw new Error('nenhum memorial para esta etapa');
        const out: ZipEntry[] = [];
        for (const m of a.memorials) out.push(await doc('02-memoriais', memorialDoc(project, m)));
        return { files: out };
      },
    },
    {
      path: '03-fichas/',
      description: 'fichas da ART/RRT, da concessionária, da fossa (quando houver) e do requerimento de alvará.',
      run: async () => {
        const a = need(ap, 'verificação normativa não calculada');
        const out = [await doc('03-fichas', artDoc(project, a)), await doc('03-fichas', utilityDoc(project, results))];
        const septic = septicDoc(project, results);
        if (septic) out.push(await doc('03-fichas', septic));
        out.push(await doc('03-fichas', permitDoc(project, a)));
        return { files: out };
      },
    },
    {
      path: '04-verificacao/',
      description: 'relatório da verificação normativa, com pareceres e termo de entrada de dados.',
      run: async () => ({ files: [await doc('04-verificacao', complianceDoc(project, results, need(ap, 'verificação normativa não calculada')))] }),
    },
    {
      path: '05-quantitativos/',
      description: 'PDF com plantas e lista de materiais, mais CSVs de compras e orçamento.',
      run: async () => {
        const out: ZipEntry[] = [{ name: '05-quantitativos/quantitativos.pdf', data: await deps.quantitiesPdf(project, results) }];
        for (const c of deps.csvs(project, results)) out.push({ name: `05-quantitativos/${c.name}`, data: utf8(c.text) });
        return { files: out };
      },
    },
  ];

  const total = jobs.length + 2; // + projeto e LEIA-ME
  const check = () => {
    if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
  };

  for (let i = 0; i < jobs.length; i++) {
    check();
    const job = jobs[i]!;
    o.onProgress?.({ step: i + 1, total, label: job.path });
    try {
      const { files, failed } = await job.run();
      check();
      entries.push(...files);
      steps.push({ path: job.path, description: job.description, ok: true, files: files.map((e) => e.name.slice(job.path.length)) });
      if (failed) steps.push({ path: `${job.path} (parte)`, description: 'parte da etapa', ok: false, reason: failed });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      steps.push({ path: job.path, description: job.description, ok: false, reason: msg(e) });
    }
  }

  check();
  o.onProgress?.({ step: jobs.length + 1, total, label: 'projeto.chalecad.json' });
  entries.push({ name: 'projeto.chalecad.json', data: utf8(JSON.stringify(project, null, 2)) });

  check();
  o.onProgress?.({ step: total, label: 'LEIA-ME.txt', total });
  const ready = !!ap?.ready;
  entries.push({ name: 'LEIA-ME.txt', data: utf8(buildReadme({ projectName: project.meta.name, date, ready, pending: pendingList(project, results), steps })) });

  const bytes = buildZip(entries, o.now);
  return { name: packFileName(project.meta.name, date), bytes, steps, ready, entries: entries.map((e) => e.name) };
}
