'use client';
/**
 * Ações da elétrica desenhada sobre o store do editor. Cada ação é UM `update` (um passo de desfazer), e a primeira
 * edição copia o traçado gerado para o projeto com `manual: true`.
 */
import { toast } from 'sonner';
import { routeLayoutConduits, type CircuitDef, type Conduit, type ElecPoint, type Electrical, type ElectricalLayout, type Vec2 } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { useEditor } from '@/lib/store/editor';
import { addConduit, adoptCircuit, appendPoint, ensureManual, patchCircuit, patchPoint, pinCircuit, removeConduits, removePoints, resetToAuto, toggleControl, uncontrolledLightsIn } from './edit';
import { pointInPoly } from './lightGrid';
import { routeConduits } from './route';
import { useElecUi } from './ui';

export const elecId = (prefix: 'e' | 'cd' | 'ck'): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export const FIRST_EDIT_NOTE = 'Você passou a editar o projeto elétrico. “Gerar automaticamente” refaz tudo pelas regras da norma.';

/** Traçado efetivo do último cálculo (o que está na planta). */
export function currentLayout(): ElectricalLayout | null {
  return useEditor.getState().results?.installations?.electrical?.layout ?? null;
}

/**
 * Edita o projeto elétrico num único passo de desfazer. Devolve false (sem mexer em nada) se o traçado automático
 * ainda não foi calculado.
 */
export function editElec(label: string, fn: (e: Electrical, layout: ElectricalLayout | null) => void): boolean {
  const s = useEditor.getState();
  const layout = currentLayout();
  if (!s.project.installations.electrical.manual && !layout) {
    toast.info('Aguarde o cálculo das instalações para editar o projeto elétrico.');
    return false;
  }
  let became = false;
  s.update(label, (d) => {
    became = ensureManual(d.installations.electrical, layout);
    fn(d.installations.electrical, layout);
  });
  if (became) toast.message(FIRST_EDIT_NOTE, { id: 'elec-first-edit', duration: 6000 });
  return true;
}

export function placePoint(point: Omit<ElecPoint, 'id'>, opts: { autoControl?: { polygon: Vec2[] } } = {}): string | null {
  const id = elecId('e');
  const ok = editElec('Adicionar ponto elétrico', (e, layout) => {
    const full: ElecPoint = { id, ...point };
    if (point.kind === 'switch' && opts.autoControl) {
      const poly = opts.autoControl.polygon;
      const all = e.manual ? e.points : (layout?.points ?? []);
      full.controls = uncontrolledLightsIn(all, (p) => p.level === point.level && pointInPoly(p.position, poly));
    }
    if (!appendPoint(e, full)) toast.error('Limite de 2.000 pontos elétricos.');
  });
  return ok ? id : null;
}

/** Vários pontos de uma vez (grade de luminárias) num passo só. */
export function placePoints(points: Omit<ElecPoint, 'id'>[], label = 'Grade de luminárias'): string[] {
  const ids = points.map(() => elecId('e'));
  const ok = editElec(label, (e) => {
    points.forEach((p, i) => void appendPoint(e, { id: ids[i]!, ...p }));
  });
  return ok ? ids : [];
}

export function movePoint(id: string, to: { position: Vec2; hostId?: string; height?: number }): void {
  editElec('Mover ponto elétrico', (e) => {
    patchPoint(e, id, { position: to.position, ...(to.height !== undefined ? { height: to.height } : {}), ...(to.hostId ? { hostId: to.hostId } : {}) });
  });
}

export function editPoint(id: string, patch: Partial<Omit<ElecPoint, 'id'>>, remove: (keyof ElecPoint)[] = [], label = 'Editar ponto elétrico'): void {
  editElec(label, (e) => void patchPoint(e, id, patch, remove));
}

export function deleteElecSelection(): boolean {
  const sel = useElecUi.getState().selected;
  if (!sel) return false;
  const ok = editElec(sel.kind === 'point' ? 'Apagar ponto elétrico' : 'Apagar eletroduto', (e) => {
    if (sel.kind === 'point') removePoints(e, new Set([sel.id]));
    else removeConduits(e, new Set([sel.id]));
  });
  if (ok) {
    useElecUi.getState().select(null);
    toast('Apagado.', { action: { label: 'Desfazer', onClick: () => useEditor.getState().undo() } });
  }
  return ok;
}

/** Interruptor selecionado + clique numa luz: liga/desliga o comando. */
export function toggleLightControl(switchId: string, lightId: string): boolean | null {
  let result: boolean | null = null;
  editElec('Comando da luz', (e) => {
    result = toggleControl(e, switchId, lightId);
  });
  return result;
}

export function commitConduit(path: Vec2[], run: Conduit['run'], level: string): string | null {
  if (path.length < 2) return null;
  const id = elecId('cd');
  const ok = editElec('Desenhar eletroduto', (e) => {
    if (!addConduit(e, { id, level, path: path.map((p) => [p[0], p[1]] as Vec2), run })) toast.error('Limite de 2.000 eletrodutos.');
  });
  return ok ? id : null;
}

export function setConduitRun(id: string, run: Conduit['run']): void {
  editElec('Eletroduto', (e) => {
    const c = e.conduits.find((x) => x.id === id);
    if (c) c.run = run;
  });
}

export function setConduitDn(id: string, dn: number | undefined): void {
  editElec('Eletroduto', (e) => {
    const c = e.conduits.find((x) => x.id === id);
    if (!c) return;
    if (dn === undefined) delete c.dn;
    else c.dn = dn;
  });
}

/** Apaga os eletrodutos e traça de novo (árvore por circuito a partir do quadro). */
export function autoRoute(): boolean {
  const layout = currentLayout();
  if (!layout) {
    toast.info('Aguarde o cálculo das instalações.');
    return false;
  }
  const ok = editElec('Rotear eletrodutos', (e, lay) => {
    const l = lay ?? layout;
    // pontos do traçado efetivo (com o circuito que o motor deu aos pontos soltos)
    const byId = new Map(l.points.map((p) => [p.id, p]));
    const pts = e.points.map((p) => ({ ...p, circuitId: p.circuitId ?? byId.get(p.id)?.circuitId }));
    // o roteador do motor (prumadas entre níveis, descidas, caixas de passagem); sem modelo, o simples da interface
    const st = useEditor.getState();
    const model = st.results?.model;
    e.conduits = (
      model
        ? routeLayoutConduits(st.project, model, getCatalog(), { ...l, points: pts })
        : routeConduits({ points: pts, panel: { level: l.panel.level, position: l.panel.position }, newId: () => elecId('cd') })
    ).slice(0, 2000);
  });
  if (ok) toast.success('Eletrodutos traçados.');
  return ok;
}

/** Volta ao traçado automático (o chamador confirma antes). */
export function regenerate(): void {
  useEditor.getState().update('Gerar projeto elétrico automaticamente', (d) => void resetToAuto(d.installations.electrical));
  useElecUi.getState().select(null);
  toast.success('Projeto elétrico gerado de novo pelas regras da norma.');
}

export function setPanelPosition(position: Vec2): void {
  useEditor.getState().update('Posição do quadro', (d) => void (d.installations.panel = [position[0], position[1]]));
}

/** Circuito: nome, tipo e sobrescritas. Circuito `auto-*` é fixado no projeto junto com seus pontos. */
export function editCircuit(id: string, patch: Partial<Omit<CircuitDef, 'id'>>, remove: (keyof CircuitDef)[] = []): void {
  editElec('Editar circuito', (e, layout) => {
    if (layout && !e.circuits.some((c) => c.id === id)) pinCircuit(e, layout, id);
    patchCircuit(e, id, patch, remove);
  });
}

/** Atribui o ponto a um circuito existente ou novo (`'new'`); `undefined` = deixa o motor distribuir. */
export function assignCircuit(pointId: string, circuit: string | 'new' | undefined, kind: CircuitDef['kind']): void {
  editElec('Circuito do ponto', (e, layout) => {
    const p = e.points.find((x) => x.id === pointId);
    if (!p) return;
    if (circuit === undefined) {
      delete p.circuitId;
      return;
    }
    if (circuit === 'new') {
      const n = e.circuits.length + 1;
      const id = elecId('ck');
      e.circuits.push({ id, name: `Circuito ${n}`, kind });
      p.circuitId = id;
      return;
    }
    const def = layout?.circuits.find((c) => c.id === circuit);
    if (def && !e.circuits.some((c) => c.id === circuit)) adoptCircuit(e, def);
    p.circuitId = circuit;
  });
}
