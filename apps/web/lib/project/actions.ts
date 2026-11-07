/** Ações de projeto no navegador: abrir, exportar, novo. Sempre salvam o projeto atual antes de trocá-lo. */
import type { Project } from '@chalecad/engine';
import { saveNow } from '../../hooks/useAutosave';
import { getEngine } from '../engine/client';
import { getStorage } from '../storage';
import { useEditor } from '../store/editor';
import type { ValidationIssue } from '../store/types';
import { slugify } from './format';

export async function startNewProject(project: Project): Promise<void> {
  await saveNow();
  useEditor.getState().loadProject(project);
  window.history.replaceState(null, '', '/editor');
}

export type OpenResult = { ok: true; name: string } | { ok: false; issues: ValidationIssue[] };

/** Lê um .json, valida no worker (migra versões antigas) e abre como novo registro. */
export async function openJsonFile(file: File): Promise<OpenResult> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch (e) {
    const detail = e instanceof Error ? ` (${e.message})` : '';
    return { ok: false, issues: [{ path: '', message: `O arquivo não é um JSON válido${detail}.` }] };
  }
  const r = await getEngine().validate(json);
  if (!r.ok) return r;
  await startNewProject(r.project);
  return { ok: true, name: r.project.meta.name };
}

export async function openStoredProject(id: string): Promise<boolean> {
  const rec = await getStorage().getProject(id);
  if (!rec) return false;
  await saveNow();
  useEditor.getState().loadProject(rec.project, { projectId: id });
  window.history.replaceState(null, '', `/editor?id=${encodeURIComponent(id)}`);
  return true;
}

export function exportProjectJson(): string {
  const { project } = useEditor.getState();
  const name = `${slugify(project.meta.name)}.json`;
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
