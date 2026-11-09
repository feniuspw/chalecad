/** LEIA-ME.txt do pacote de aprovação. Puro. */
import { APPROVAL_NOTICE } from '@chalecad/engine';

export interface PackageStep {
  /** Pasta ou arquivo no zip. */
  path: string;
  /** O que é. */
  description: string;
  ok: boolean;
  /** Motivo da falha (quando `ok` é falso). */
  reason?: string;
  /** Arquivos gerados nesta etapa. */
  files?: string[];
}

export interface ReadmeInput {
  projectName: string;
  /** AAAA-MM-DD. */
  date: string;
  ready: boolean;
  /** Rótulos das pendências obrigatórias (`missingInputs` com `required`) e itens sem parecer. */
  pending: string[];
  steps: PackageStep[];
}

export function buildReadme(i: ReadmeInput): string {
  const L: string[] = [];
  L.push(`PACOTE DE APROVAÇÃO — ${i.projectName}`);
  L.push(`Gerado em ${i.date.split('-').reverse().join('/')} pelo ChaléCAD.`);
  L.push('');
  if (!i.ready) {
    L.push('MINUTA — pendências abertas');
    L.push('');
  }
  L.push('CONTEÚDO');
  for (const s of i.steps) {
    L.push(`- ${s.path}: ${s.description}${s.ok ? '' : ` [NÃO GERADO: ${s.reason ?? 'motivo não informado'}]`}`);
    if (s.ok) for (const f of s.files ?? []) L.push(`    ${f}`);
  }
  L.push('- projeto.chalecad.json: o projeto completo, para reabrir no ChaléCAD.');
  L.push('- LEIA-ME.txt: este arquivo.');
  L.push('');
  L.push('PENDÊNCIAS');
  if (i.pending.length === 0) L.push('Nenhuma pendência obrigatória.');
  else for (const p of i.pending) L.push(`- ${p}`);
  const failed = i.steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    L.push('');
    L.push('ETAPAS NÃO GERADAS');
    for (const s of failed) L.push(`- ${s.path}: não gerado: ${s.reason ?? 'motivo não informado'}`);
  }
  L.push('');
  L.push('AVISO');
  L.push(APPROVAL_NOTICE);
  L.push('');
  return L.join('\n');
}
