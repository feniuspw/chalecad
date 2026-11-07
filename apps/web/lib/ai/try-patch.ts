import { Project } from '@chalecad/engine';
import { PatchError, applyJsonPatch, type JsonPatchOp } from './patch';

export type PatchOutcome = { ok: true; project: Project } | { ok: false; errors: string[] };

/** Aplica o patch numa cópia e valida com o schema. Patch sem efeito (ex.: campo digitado errado) também é erro. */
export function tryPatch(project: Project, ops: readonly JsonPatchOp[]): PatchOutcome {
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, errors: ['O patch está vazio.'] };
  if (ops.length > 40) return { ok: false, errors: ['Patch grande demais (máximo de 40 operações).'] };
  const draft = structuredClone(project);
  try {
    applyJsonPatch(draft, ops);
  } catch (e) {
    return { ok: false, errors: [e instanceof PatchError ? e.message : 'Patch inválido.'] };
  }
  const parsed = Project.safeParse(draft);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
  }
  if (JSON.stringify(parsed.data) === JSON.stringify(project)) {
    return { ok: false, errors: ['O patch não altera nada no projeto (confira os caminhos dos campos).'] };
  }
  return { ok: true, project: parsed.data };
}
