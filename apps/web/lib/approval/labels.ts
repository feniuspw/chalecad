import type { ComplianceStatus, Discipline, ProjectStage } from '@chalecad/engine';

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  architecture: 'Arquitetura',
  structure: 'Estrutura',
  foundation: 'Fundação',
  electrical: 'Elétrica',
  plumbing: 'Hidrossanitário',
  execution: 'Execução de obra',
};
export const DISCIPLINES = Object.keys(DISCIPLINE_LABEL) as Discipline[];

export const STATUS_LABEL: Record<ComplianceStatus, string> = {
  ok: 'Ok',
  warn: 'Atenção',
  fail: 'Não passa',
  manual: 'Conferir',
  missing: 'Falta dado',
  na: 'N/A',
};

export const REVIEW_LABEL = { accepted: 'Aceito', rejected: 'Rejeitado', na: 'Não se aplica' } as const;

export const STAGE_LABEL: Record<ProjectStage, string> = {
  preliminary: 'Estudo preliminar',
  draft: 'Anteprojeto',
  legal: 'Projeto legal',
  executive: 'Projeto executivo',
};

/** Item aberto = precisa de olhar do profissional e ainda não tem parecer. */
export const isPending = (status: ComplianceStatus, reviewed: boolean) => !reviewed && (status === 'fail' || status === 'warn' || status === 'manual' || status === 'missing');

export const todayIso = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export const formatDateBr = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');
