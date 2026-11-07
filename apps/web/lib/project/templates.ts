/** Projetos iniciais por tipologia. */
import { Project, type Opening, type ProjectInput, type Site, type Typology, type TypologyKind, type UF, type UtilityPoint } from '@chalecad/engine';
import { clamp, round } from './geometry';
import { mezzaninePolygon, mezzanineElevation, defaultMezzanineDepth, isEditableTypology, stairRun } from './edit';
import { newId, type IdGen } from './ids';
import { ANNEX_DEFAULT, annexInfo, fitAnnex, type AnnexSide } from './annex';

export type TemplateKind = TypologyKind;

export interface TemplateParams {
  name: string;
  region: UF;
  width: number;
  depth: number;
  /** Pé-direito (altura das paredes): duas águas, telhado plano, gambrel, L/T. */
  wallHeight: number;
  /** Duas águas e L/T: inclinação do telhado (graus). */
  roofPitchDeg: number;
  /** A-frame: altura da cumeeira. */
  ridgeHeight: number;
  /** A-frame: mureta na base das águas (0 = águas até o chão). */
  kneeWallHeight: number;
  /** A-frame: cômodos encostados nas laterais. */
  annexSides: AnnexSide[];
  /** Meia-água. */
  lowHeight: number;
  highHeight: number;
  highSide: 'front' | 'back' | 'left' | 'right';
  /** Telhado plano. */
  parapetHeight: number;
  slopePct: number;
  /** Gambrel. */
  lowerPitchDeg: number;
  upperPitchDeg: number;
  breakRatio: number;
  /** L/T. */
  shape: 'L' | 'T';
  wingWidth: number;
  wingDepth: number;
  wingOffset: number;
  /** Só duas águas e A-frame. */
  mezzanine: boolean;
  /** Profundidade do mezanino; omitido = proporção padrão. */
  mezzanineDepth?: number;
  /** Terreno; omitido = plano. */
  site?: Site;
}

const BASE: Omit<TemplateParams, 'name' | 'width' | 'depth' | 'region'> = {
  wallHeight: 2.8,
  roofPitchDeg: 35,
  ridgeHeight: 6,
  kneeWallHeight: 0,
  annexSides: [],
  lowHeight: 2.6,
  highHeight: 3.8,
  highSide: 'front',
  parapetHeight: 0.6,
  slopePct: 5,
  lowerPitchDeg: 60,
  upperPitchDeg: 25,
  breakRatio: 0.4,
  shape: 'L',
  wingWidth: 4,
  wingDepth: 5,
  wingOffset: 0,
  mezzanine: false,
};

export const DEFAULT_PARAMS: Record<TemplateKind, TemplateParams> = {
  gable_mezzanine: { ...BASE, name: 'Chalé 6,5 × 8,5', region: 'MG', width: 6.5, depth: 8.5, mezzanine: true },
  a_frame: { ...BASE, name: 'A-frame 6 × 7', region: 'SP', width: 6, depth: 7, mezzanine: true },
  shed: { ...BASE, name: 'Meia-água 6 × 8', region: 'SP', width: 6, depth: 8 },
  flat_roof: { ...BASE, name: 'Casa de telhado plano 6 × 8', region: 'SP', width: 6, depth: 8 },
  gambrel: { ...BASE, name: 'Celeiro 7 × 9', region: 'SP', width: 7, depth: 9, wallHeight: 2.6 },
  combined: { ...BASE, name: 'Chalé em L 8 × 6', region: 'SP', width: 8, depth: 6, roofPitchDeg: 30, wingWidth: 4, wingDepth: 5 },
};

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  gable_mezzanine: 'Duas águas com mezanino',
  a_frame: 'A-frame',
  shed: 'Meia-água',
  flat_roof: 'Telhado plano',
  gambrel: 'Gambrel (celeiro)',
  combined: 'Módulos em L e T',
};

export const TYPOLOGY_DESCRIPTIONS: Record<TemplateKind, string> = {
  gable_mezzanine: 'Caixa retangular com telhado de duas águas e pavimento superior.',
  a_frame: 'Águas até o chão, empena frontal envidraçada e mezanino no fundo.',
  shed: 'Telhado de uma queda só, com o lado alto à sua escolha.',
  flat_roof: 'Platibanda esconde a telha de baixa inclinação.',
  gambrel: 'Duas inclinações por água: mais volume sob o telhado.',
  combined: 'Dois volumes de duas águas combinados em L ou T.',
};

/** Altura útil das paredes externas (a menor), para encaixar janelas. */
function lowestWall(kind: TemplateKind, p: TemplateParams): number {
  return kind === 'shed' ? Math.min(p.lowHeight, p.highHeight) : p.wallHeight;
}

/** Tipologia a partir dos parâmetros do assistente. */
export function typologyFromParams(kind: TemplateKind, p: TemplateParams): Typology {
  const { width, depth } = p;
  switch (kind) {
    case 'gable_mezzanine':
      return { kind, width, depth, wallHeight: p.wallHeight, roofPitchDeg: p.roofPitchDeg, eave: 0.6, rake: 0.3 };
    case 'a_frame': {
      const t: Typology = { kind, width, depth, ridgeHeight: p.ridgeHeight, kneeWallHeight: p.kneeWallHeight, rake: 0.4, frontGable: 'glazed', backGable: 'closed', annexes: [] };
      const length = Math.min(5, depth);
      for (const side of p.annexSides) {
        const a = fitAnnex(t, { side, ...ANNEX_DEFAULT, length, offset: round(Math.max(0, (depth - length) / 2), 2) });
        if (a) t.annexes.push(a);
      }
      return t;
    }
    case 'shed':
      return { kind, width, depth, lowHeight: p.lowHeight, highHeight: Math.max(p.highHeight, p.lowHeight), highSide: p.highSide, eave: 0.5 };
    case 'flat_roof':
      return { kind, width, depth, wallHeight: p.wallHeight, parapetHeight: p.parapetHeight, slopePct: p.slopePct };
    case 'gambrel':
      return { kind, width, depth, wallHeight: p.wallHeight, lowerPitchDeg: p.lowerPitchDeg, upperPitchDeg: p.upperPitchDeg, breakRatio: p.breakRatio, eave: 0.4, rake: 0.3 };
    case 'combined': {
      const ww = clamp(p.wingWidth, 2, Math.max(2, Math.min(20, width, depth)));
      const offset = p.shape === 'T' ? (width - ww) / 2 : clamp(p.wingOffset, 0, Math.max(0, width - ww));
      return {
        kind,
        shape: p.shape,
        width,
        depth,
        wallHeight: p.wallHeight,
        roofPitchDeg: p.roofPitchDeg,
        eave: 0.5,
        rake: 0.3,
        wing: { width: round(ww, 2), depth: round(clamp(p.wingDepth, 2, 20), 2), offset: round(offset, 2) },
      };
    }
  }
}

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

  const typology = typologyFromParams(kind, p);

  const levels: ProjectInput['levels'] = [{ id: 'L0', name: 'Térreo', elevation: 0, floor: kind === 'a_frame' ? 'polished_concrete' : 'burnished_concrete' }];
  const stairs: NonNullable<ProjectInput['stairs']> = [];
  let mezzDepth = 0;
  if (p.mezzanine && isEditableTypology(typology)) {
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
    const run = stairRun(rise);
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

  // Anexos do A-frame: uma janela centrada na parede de fora de cada um.
  if (typology.kind === 'a_frame') {
    for (const a of typology.annexes) {
      const ww = Math.min(1.2, a.length - 0.6);
      const sill = 1.0;
      const h = round(Math.min(1.0, annexInfo(typology, a).lowHeight - 0.2 - sill), 2);
      if (ww >= 0.5 && h >= 0.4) openings.push(win(ids, `annex-${a.side}-side`, (a.length - ww) / 2, ww, h, sill));
    }
  }

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

  if (kind === 'shed' || kind === 'flat_roof' || kind === 'gambrel' || kind === 'combined') {
    const cap = lowestWall(kind, p) - 0.2;
    const sill = 0.9;
    const wh = round(Math.min(1.2, cap - sill), 2);
    const front = (off: number, w: number) => {
      if (w >= 0.5) openings.push(win(ids, 'ext-front', off, w, wh, sill));
    };
    // Janelas dos dois lados da porta.
    const m = Math.min(0.8, s * 0.3);
    front(m, Math.min(1.5, s - m - 0.4));
    const g = Math.min(0.7, s * 0.25);
    front(doorOff + doorW + g, Math.min(1.5, s - g - 0.4));
    // Janelas nas laterais (a de trás só se o fundo da lateral estiver livre).
    const sideW = Math.min(1.2, D * 0.4);
    const sideOff = round(Math.max(0.4, D * 0.4 - sideW / 2), 1);
    if (sideOff + sideW <= D - 0.3) {
      openings.push(win(ids, 'ext-left', sideOff, sideW, wh, sill), win(ids, 'ext-right', sideOff, sideW, wh, sill));
    }
    if (typology.kind === 'combined') {
      // Ala: janela no fundo e uma em cada lateral.
      const wing = typology.wing;
      const bw = round(Math.min(1.5, wing.width - 0.8), 2);
      if (bw >= 0.5) openings.push(win(ids, 'wing-back', (wing.width - bw) / 2, bw, wh, sill));
      const lw = round(Math.min(1.2, wing.depth - 0.8), 2);
      if (lw >= 0.5) openings.push(win(ids, 'wing-left', (wing.depth - lw) / 2, lw, wh, sill), win(ids, 'wing-right', (wing.depth - lw) / 2, lw, wh, sill));
    }
  }

  const input: ProjectInput = {
    schemaVersion: 1,
    meta: { name: p.name, region: p.region, currency: 'BRL' },
    site: p.site ?? { type: 'flat' },
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
