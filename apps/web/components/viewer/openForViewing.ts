import type { Project } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';

/**
 * Abre um projeto salvo no store só para olhar: com `projectId` o store nasce limpo (`dirty` falso)
 * e vai direto para o modo apresentação. A página /ver não monta `useAutosave` nem chama
 * `update`/`save`, então nada é gravado.
 */
export function openForViewing(project: Project, projectId: string): void {
  const s = useEditor.getState();
  s.loadProject(project, { projectId });
  s.setViewMode('presentation');
  s.setCameraView('3d');
}
