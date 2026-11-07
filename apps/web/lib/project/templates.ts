/** Projetos iniciais por tipologia. */
import { Project, type Opening, type ProjectInput, type UF, type UtilityPoint } from '@chalecad/engine';
import { clamp, round } from './geometry';
import { mezzaninePolygon, mezzanineElevation, defaultMezzanineDepth, type EditableTypology } from './edit';
import { newId, type IdGen } from './ids';

export type TemplateKind = 'gable_mezzanine' | 'a_frame';

export interface TemplateParams {
  name: string;
  region: UF;
  width: number;
  depth: number;
  /** Duas águas: pé-direito (altura das paredes). */
  wallHeight: number;
  /** Duas águas: inclinação do telhado (graus). */
  roofPitchDeg: number;
  /** A-frame: altura da cumeeira. */
  ridgeHeight: number;
  mezzanine: boolean;
  /** Profundidade do mezanino; omitido = proporção padrão. */
  mezzanineDepth?: number;
}

export const DEFAULT_PARAMS: Record<TemplateKind, TemplateParams> = {
  gable_mezzanine: {
    name: 'Chalé 6,5 × 8,5',
    region: 'MG',
    width: 6.5,
    depth: 8.5,
    wallHeight: 2.8,
    roofPitchDeg: 35,
    ridgeHeight: 6,
    mezzanine: true,
  },
  a_frame: {
    name: 'A-frame 6 × 7',
    region: 'SP',
    width: 6,
    depth: 7,
    wallHeight: 2.8,
    roofPitchDeg: 35,
    ridgeHeight: 6,
    mezzanine: true,
  },
};

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  gable_mezzanine: 'Duas águas com mezanino',
  a_frame: 'A-frame',
};

const win = (ids: IdGen, host: string, offset: number, width: number, height: number, sill: number): Opening => ({
  id: ids('o'),
  host,
  type: 'window',
  offset: round(offset, 2),
  width: round(width, 2),
  height,
  sill,
});

/** Cria um projeto válido (defaults aplicados). `ids` permite IDs determinísticos em testes. */
export function createProject(kind: TemplateKind, params: Partial<TemplateParams> = {}, ids: IdGen = newId): Project {
  const p = { ...DEFAULT_PARAMS[kind], ...params };
  const { width: W, depth: D } = p;

  const typology: EditableTypology =
    kind === 'gable_mezzanine'
      ? { kind, width: W, depth: D, wallHeight: p.wallHeight, roofPitchDeg: p.roofPitchDeg, eave: 0.6, rake: 0.3 }
      : { kind, width: W, depth: D, ridgeHeight: p.ridgeHeight, kneeWallHeight: 0, rake: 0.4, frontGable: 'glazed', backGable: 'closed' };

  const levels: ProjectInput['levels'] = [{ id: 'L0', name: 'Térreo', elevation: 0, floor: kind === 'a_frame' ? 'polished_concrete' : 'burnished_concrete' }];
  const stairs: NonNullable<ProjectInput['stairs']> = [];
  let mezzDepth = 0;
  if (p.mezzanine) {
    mezzDepth = clamp(p.mezzanineDepth ?? defaultMezzanineDepth(typology), 1.5, Math.max(1.5, D - 1));
    levels.push({
      id: 'L1',
      name: 'Mezanino',
      elevation: mezzanineElevation(typology),
      polygon: mezzaninePolygon(typology, mezzDepth, 'back'),
      deck: 'osb18',
      guardrail: true,
    });
    const rise = mezzanineElevation(typology);
    const run = Math.ceil(rise / 0.18) * 0.27;
    stairs.push(
      kind === 'a_frame'
        ? { id: ids('s'), type: 'straight', from: 'L0', to: 'L1', position: [round(W / 2 - 0.4, 2), round(Math.max(0.6, D - mezzDepth - run), 2)], rotationDeg: 0, width: 0.8, turnRight: true }
        : { id: ids('s'), type: 'straight', from: 'L0', to: 'L1', position: [0.2, 0.6], rotationDeg: 0, width: 0.8, turnRight: true },
    );
  }

  // Porta centralizada na frente; janelas ao lado (como no chalé de referência 6,5 x 8,5).
  const doorW = 0.9;
  const doorOff = round((W - doorW) / 2, 2);
  const s = doorOff;
  const openings: Opening[] = [{ id: ids('o'), host: 'ext-front', type: 'door', offset: doorOff, width: doorW, height: 2.1, sill: 0 }];
  const walls: NonNullable<ProjectInput['walls']> = [];
  const utilities: UtilityPoint[] = [];

  if (kind === 'gable_mezzanine') {
    const m = Math.min(0.8, s * 0.3);
    const w1 = Math.min(1.5, s - m - 0.4);
    if (w1 >= 0.5) openings.push(win(ids, 'ext-front', m, w1, 1.2, 0.9));
    const g = Math.min(0.7, s * 0.25);
    const w2 = Math.min(1.5, s - g - 0.4);
    if (w2 >= 0.5) openings.push(win(ids, 'ext-front', doorOff + doorW + g, w2, 1.2, 0.9));

    // Banheiro no canto do fundo (área molhada) com janela alta.
    const hasBath = W >= 4 && D >= 5;
    if (hasBath) {
      const bx = round(W - 2.2, 2);
      const by = round(D - 2.1, 2);
      const w1id = ids('w');
      const w2id = ids('w');
      walls.push({ id: w1id, level: 'L0', from: [bx, D], to: [bx, by], wet: true }, { id: w2id, level: 'L0', from: [bx, by], to: [W, by], wet: true });
      openings.push({ id: ids('o'), host: w2id, type: 'door', offset: 0.4, width: 0.7, height: 2.1, sill: 0 });
      openings.push(win(ids, 'ext-right', D - 1.5, 0.6, 0.6, 1.6));
      utilities.push({ id: ids('u'), kind: 'sewer', position: [round(W - 1.1, 2), round(D - 1, 2)] }, { id: ids('u'), kind: 'water', position: [round(W - 2, 2), round(D - 0.2, 2)] });
    }
    const sideLimit = hasBath ? D - 2.1 - 0.4 : D - 0.4;
    const lOff = round(D * 0.235, 1);
    if (lOff + 1.2 <= sideLimit) openings.push(win(ids, 'ext-left', lOff, 1.2, 1.0, 1.0));
    const rOff = round(D * 0.353, 1);
    if (rOff + 1.2 <= sideLimit) openings.push(win(ids, 'ext-right', rOff, 1.2, 1.0, 1.0));
  }

  const input: ProjectInput = {
    schemaVersion: 1,
    meta: { name: p.name, region: p.region, currency: 'BRL' },
    site: { type: 'flat' },
    typology,
    levels,
    walls,
    openings,
    stairs,
    roof: { cladding: 'sandwich_eps30', ridgeAxis: 'depth', gutters: true },
    utilities,
    extras: [],
  };
  return Project.parse(input);
}
