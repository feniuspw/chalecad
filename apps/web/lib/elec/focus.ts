'use client';
import { useEditor } from '@/lib/store/editor';
import { useElecUi } from './ui';

/** Nível dos `refs` de um aviso (ponto, eletroduto ou cômodo). */
export function levelOfRefs(refs: string[]): string | null {
  const s = useEditor.getState();
  const layout = s.results?.installations?.electrical?.layout;
  for (const r of refs) {
    const p = layout?.points.find((x) => x.id === r);
    if (p) return p.level;
    const c = layout?.conduits.find((x) => x.id === r);
    if (c) return c.level;
    const room = s.results?.model.rooms.find((x) => x.id === r);
    if (room) return room.level;
  }
  return null;
}

/**
 * "Mostrar na planta": abre a vista Planta no nível certo, liga a camada Elétrica e circula os `refs`.
 * A troca de vista passa pelo botão da barra (o seletor de vistas guarda o próprio estado).
 */
export function showOnPlan(refs: string[]): void {
  const s = useEditor.getState();
  if (s.viewMode === 'presentation') s.setViewMode('finished');
  const level = levelOfRefs(refs);
  if (level) s.setActiveLevel(level);
  if (useEditor.getState().cameraView !== 'plan') {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Vistas"] button')].find((b) => b.textContent?.trim() === 'Planta');
    if (btn) btn.click();
    else s.setCameraView('plan');
  }
  const st = useEditor.getState();
  if (!st.project.installations.enabled) st.update('Ligar instalações', (d) => void (d.installations.enabled = true));
  st.select(null);
  st.setTool('select');
  useElecUi.getState().setLayer(true);
  useElecUi.getState().setFocus(refs);
}
