/**
 * Construtor dos modelos prontos: monta o projeto com as funções de edição do editor (`addRoom`, `addFurniture`,
 * `setFinish`, `addAnnex`…) sobre o projeto inicial da tipologia. Os móveis são encostados nas paredes pela geometria
 * real do motor (`buildModel`), então nunca atravessam parede nem se sobrepõem.
 */
import { buildModel, Project, type BuildingModel, type Finishes, type Opening, type RoomUse, type Vec2 } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { createProject, type TemplateKind, type TemplateParams } from '../templates';
import { addFurniture, rotationFacing, specOf, WALL_GAP } from '../furniture';
import { addRoom, patchRoom, setFinish } from '../rooms';
import { addAnnex, type AnnexSide } from '../annex';
import { round } from '../geometry';
import { setMezzanine, stairRun } from '../edit';
import { addExtra, patchExtra } from '../extras';
import type { IdGen } from '../ids';

export { addAnnex, setFinish };
export type { AnnexSide };

const catalog = getCatalog();

export class Builder {
  readonly p: Project;
  private cached: BuildingModel | null = null;

  constructor(kind: TemplateKind, params: Partial<TemplateParams>, private readonly ids: IdGen) {
    this.p = createProject(kind, params, ids);
  }

  /** Modelo do motor com o estado atual (recalculado depois de cada mudança de paredes/aberturas). */
  get model(): BuildingModel {
    this.cached ??= buildModel(Project.parse(this.p), catalog);
    return this.cached;
  }
  private dirty() {
    this.cached = null;
  }

  finishes(f: Finishes) {
    for (const [k, v] of Object.entries(f)) setFinish(this.p, k as keyof Finishes, v as never);
    this.dirty();
  }

  /** Remove aberturas do projeto inicial por hospedeiro (para redesenhar uma fachada). */
  clearOpenings(host: string) {
    this.p.openings = this.p.openings.filter((o) => o.host !== host);
    this.dirty();
  }

  wall(from: Vec2, to: Vec2, o: { level?: string; wet?: boolean; height?: number } = {}): string {
    const id = this.ids('w');
    this.p.walls.push({ id, level: o.level ?? 'L0', from, to, ...(o.wet ? { wet: true } : {}), ...(o.height ? { height: o.height } : {}) });
    this.dirty();
    return id;
  }

  open(host: string, type: Opening['type'], offset: number, width: number, height: number, sill = 0): string {
    const id = this.ids('o');
    this.p.openings.push({ id, host, type, offset: round(offset, 2), width, height, sill });
    this.dirty();
    return id;
  }
  door(host: string, offset: number, width = 0.8) {
    return this.open(host, 'door', offset, width, 2.1, 0);
  }
  window(host: string, offset: number, width: number, height = 1.2, sill = 0.9) {
    return this.open(host, 'window', offset, width, height, sill);
  }

  room(use: RoomUse, seed: Vec2, name?: string, o: { floor?: string; walls?: string; level?: string } = {}): string {
    const id = addRoom(this.p, o.level ?? 'L0', seed, use, this.ids);
    patchRoom(this.p, id, { ...(name ? { name } : {}), ...(o.floor ? { floor: o.floor } : {}), ...(o.walls ? { walls: o.walls } : {}) });
    this.dirty();
    return id;
  }

  /**
   * Móvel com o fundo encostado na parede `wallId`, a `u` metros do início dela, virado para o lado de `toward`
   * (um ponto dentro do cômodo). `at` é a distância do início da parede ao centro do móvel ou um ponto (projetado na parede).
   */
  put(item: string, wallId: string, at: number | Vec2, toward: Vec2, level = 'L0'): string {
    const spec = specOf(catalog, item);
    const w = this.model.walls.find((x) => x.id === wallId);
    if (!spec || !w) throw new Error(`preset: móvel ${item} ou parede ${wallId} inexistente`);
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    const d: Vec2 = [(w.to[0] - w.from[0]) / len, (w.to[1] - w.from[1]) / len];
    // `at` como ponto: projeta sobre a parede (posição do centro do móvel ao longo dela)
    const u = typeof at === 'number' ? at : (at[0] - w.from[0]) * d[0] + (at[1] - w.from[1]) * d[1];
    let n: Vec2 = [-d[1], d[0]];
    const mid: Vec2 = [w.from[0] + d[0] * u, w.from[1] + d[1] * u];
    if ((toward[0] - mid[0]) * n[0] + (toward[1] - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
    const off = w.thickness / 2 + spec.size.d / 2 + WALL_GAP;
    const pos: Vec2 = [mid[0] + n[0] * off, mid[1] + n[1] * off];
    return addFurniture(this.p, level, item, pos, rotationFacing(n), this.ids);
  }

  /** Móvel solto (centro e rotação em graus). */
  at(item: string, position: Vec2, rotation = 0, level = 'L0'): string {
    return addFurniture(this.p, level, item, position, rotation, this.ids);
  }

  /** Mezanino: profundidade e cota; a escada reta é refeita com o comprimento certo. `stairX` = canto esquerdo do pé. */
  mezzanine(o: { depth: number; elevation?: number; stairX: number; stairRotation?: number }) {
    setMezzanine(this.p, o.elevation === undefined ? { depth: o.depth } : { depth: o.depth, elevation: o.elevation });
    const lv = this.p.levels.find((l) => l.elevation > 0)!;
    const st = this.p.stairs[0]!;
    const run = stairRun(lv.elevation);
    const y0 = Math.min(...lv.polygon!.map((v) => v[1]));
    st.position = [o.stairX, round(y0 - run, 2)];
    st.rotationDeg = o.stairRotation ?? 0;
    this.dirty();
  }

  deck(patch: Record<string, unknown> = {}) {
    const id = addExtra(this.p, 'deck', this.ids);
    patchExtra(this.p, id, patch);
    this.dirty();
    return id;
  }

  tone(id: string, tone: NonNullable<Project['furniture'][number]['tone']>) {
    const f = this.p.furniture.find((x) => x.id === id);
    if (f) f.tone = tone;
  }

  build(): Project {
    // ida e volta por JSON: tira o -0 das rotações e garante que o projeto é puro dado serializável
    return Project.parse(JSON.parse(JSON.stringify(this.p)));
  }
}
