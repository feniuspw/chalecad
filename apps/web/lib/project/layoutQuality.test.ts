import { describe, expect, it } from 'vitest';
import { computeAll, type ResolvedOpening, type Vec2 } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { DEFAULT_ANSWERS } from './wizard/answers';
import { generateProject } from './wizard/generate';
import { PRESETS } from './presets';
import {
  bathProblems,
  bedProblems,
  circulationProblems,
  ctxProblems,
  furnitureProblems,
  kitchenProblems,
  layoutProblems,
  livingPairProblems,
  makeLF,
  makeWall,
  sofaLowWall,
  wallSenseProblems,
  type LCtx,
  type LF,
  type LWall,
} from './layoutQuality';

const catalog = getCatalog();
const spec = (id: string) => catalog.furniture.find((f) => f.id === id)!;
let seq = 0;
const lf = (item: string, pos: Vec2, rot = 0, level = 'L0'): LF => makeLF(spec(item), `t${seq++}`, level, pos, rot);

const wall = (id: string, from: Vec2, to: Vec2, top = 2.8, kind = 'interior', level = 'L0'): LWall => makeWall({ id, level, kind, from, to, thickness: 0.12, baseZ: 0, top });
const door = (id: string, hostId: string, u0: number, u1: number): ResolvedOpening => ({ id, hostId, hostKind: 'wall', type: 'door', u0, u1, v0: 0, v1: 2.1, valid: true });
const win = (id: string, hostId: string, u0: number, u1: number, sill = 0.9): ResolvedOpening => ({ id, hostId, hostKind: 'wall', type: 'window', u0, u1, v0: sill, v1: sill + 1.2, valid: true });

const room = (id: string, name: string, use: LCtx['rooms'][number]['use'], x0: number, y0: number, x1: number, y1: number, hosts: string[] = [], level = 'L0'): LCtx['rooms'][number] => {
  const polygon: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return {
    id,
    name,
    use,
    level,
    polygon,
    edges: polygon.map((p, i) => ({ from: p, to: polygon[(i + 1) % 4]!, hostId: hosts[i] ?? null })),
    area: (x1 - x0) * (y1 - y0),
    perimeter: 2 * (x1 - x0 + y1 - y0),
    ceiling: { min: 2.8, avg: 2.8, max: 2.8 },
    glazing: 0,
    openingIds: [],
    wet: false,
  };
};

/** Sala 7 × 5 (eixos das paredes) com as quatro paredes externas. */
function box(opts: { use?: LCtx['rooms'][number]['use']; w?: number; d?: number } = {}): LCtx {
  const w = opts.w ?? 7;
  const d = opts.d ?? 5;
  const walls = [
    wall('ext-front', [0, 0], [w, 0], 2.8, 'exterior'),
    wall('ext-right', [w, 0], [w, d], 2.8, 'exterior'),
    wall('ext-back', [w, d], [0, d], 2.8, 'exterior'),
    wall('ext-left', [0, d], [0, 0], 2.8, 'exterior'),
  ];
  return {
    catalog,
    elev: new Map([['L0', 0]]),
    walls,
    openings: [door('o-front', 'ext-front', 1, 1.9)],
    stairs: [],
    rooms: [room('r1', 'Sala', opts.use ?? 'living', 0, 0, w, d, ['ext-front', 'ext-right', 'ext-back', 'ext-left'])],
    furniture: [],
    glassFront: null,
    bodyWidth: null,
    upperPolys: [],
  };
}

const withF = (ctx: LCtx, ...fs: LF[]): LCtx => ({ ...ctx, furniture: [...ctx.furniture, ...fs] });

describe('layoutQuality: sala de estar', () => {
  // rack encostado na parede esquerda (frente para +x), sofá de frente para ele (frente para −x), a 2,8 m
  const rack = lf('furn_tv_rack', [0.06 + 0.225 + 0.005, 2.5], 90);
  const sofa = lf('furn_sofa_3', [3.1, 2.5], -90);

  it('passa: sofá e TV de frente, a 2,8 m, sem nada no meio', () => {
    expect(rack.n[0]).toBeCloseTo(1);
    expect(sofa.n[0]).toBeCloseTo(-1);
    expect(livingPairProblems(withF(box(), rack, sofa), sofa, rack)).toEqual([]);
  });

  it('reprova: normais que não são opostas (desvio acima de 20 graus)', () => {
    const side = lf('furn_sofa_3', [3.1, 2.5], 0);
    expect(livingPairProblems(withF(box(), rack, side), side, rack).join(' ')).toMatch(/não ficam de frente/);
    const tilted = lf('furn_sofa_3', [3.1, 2.5], -60);
    expect(livingPairProblems(withF(box(), rack, tilted), tilted, rack).join(' ')).toMatch(/de frente/);
  });

  it('reprova: distância fora de 1,8 a 4,0 m', () => {
    const far = lf('furn_sofa_3', [5.9, 2.5], -90);
    expect(livingPairProblems(withF(box(), rack, far), far, rack).join(' ')).toMatch(/a 5,6 m/);
    const near = lf('furn_sofa_3', [1.5, 2.5], -90);
    expect(livingPairProblems(withF(box(), rack, near), near, rack).join(' ')).toMatch(/a 1,2 m/);
  });

  it('reprova: parede alta, escada ou geladeira entre os dois; mureta baixa não corta a vista', () => {
    const c = box();
    expect(livingPairProblems({ ...withF(c, rack, sofa), walls: [...c.walls, wall('w-1', [1.8, 1], [1.8, 4])] }, sofa, rack).join(' ')).toMatch(/parede w-1/);
    expect(livingPairProblems({ ...withF(c, rack, sofa), walls: [...c.walls, wall('w-low', [1.8, 1], [1.8, 4], 0.8)] }, sofa, rack)).toEqual([]);
    const stairs = [{ id: 's', level: 'L0', footprint: [[1.5, 2], [2.3, 2], [2.3, 3], [1.5, 3]] as Vec2[], foot: [], top: [], footPoint: [1.9, 2] as Vec2, topPoint: [1.9, 3] as Vec2 }];
    expect(livingPairProblems({ ...withF(c, rack, sofa), stairs }, sofa, rack).join(' ')).toMatch(/escada/);
    const fridge = lf('furn_fridge', [1.8, 2.5], 90);
    expect(livingPairProblems(withF(c, rack, sofa, fridge), sofa, rack).join(' ')).toMatch(/Geladeira/);
  });

  it('reprova: sofá encostado em mureta de 1,1 m; passa encostado em parede cheia', () => {
    const c = box();
    const low = { ...c, walls: [...c.walls, wall('w-mureta', [3.8, 1], [3.8, 4], 1.1)] };
    const s = lf('furn_sofa_3', [3.8 - 0.06 - 0.45 - 0.005, 2.5], -90);
    expect(sofaLowWall(withF(low, s), s)?.id).toBe('w-mureta');
    expect(ctxProblems(withF(low, s)).join(' ')).toMatch(/parede baixa/);
    const wallSofa = lf('furn_sofa_3', [6.94 - 0.45 - 0.005 - 0.0, 2.5], -90);
    expect(sofaLowWall(withF(c, wallSofa), wallSofa)).toBeUndefined();
  });

  it('reprova: sala sem sofá', () => {
    expect(ctxProblems(box()).join(' ')).toMatch(/Sala: sem sofá/);
    expect(ctxProblems(withF(box(), lf('furn_sofa_3', [3.5, 4.4]))).join(' ')).not.toMatch(/sem sofá/);
  });

  it('A-frame de vidro: sofá nos fundos reprova; na frente, voltado para o vidro, passa', () => {
    const glass = { ...box(), glassFront: { depth: 5, width: 7 } };
    const back = lf('furn_sofa_3', [3.5, 4.0], 0);
    expect(ctxProblems(withF(glass, back)).join(' ')).toMatch(/nos fundos/);
    const front = lf('furn_sofa_3', [3.5, 1.6], 0);
    expect(ctxProblems(withF(glass, front)).join(' ')).not.toMatch(/fundos|de frente/);
  });
});

describe('layoutQuality: móveis dentro do cômodo, sem atravessar parede, porta ou escada', () => {
  it('passa um móvel encostado na parede', () => {
    expect(furnitureProblems(box(), lf('furn_wardrobe', [3.5, 5 - 0.06 - 0.3 - 0.005]))).toEqual([]);
  });

  it('reprova: móvel que passa do contorno do cômodo ou cai fora dele', () => {
    const c = box();
    const out = lf('furn_sofa_3', [3.5, 0.1]);
    expect(furnitureProblems(c, out).join(' ')).toMatch(/passa do contorno|atravessa/);
    const gone = lf('furn_plant', [9, 9]);
    expect(furnitureProblems(c, gone).join(' ')).toMatch(/fora de qualquer cômodo/);
  });

  it('reprova: atravessa parede interna', () => {
    const c = { ...box(), walls: [...box().walls, wall('w-1', [3.5, 0], [3.5, 3])] };
    expect(furnitureProblems(c, lf('furn_sofa_3', [3.5, 1.5], 90)).join(' ')).toMatch(/atravessa a parede w-1/);
  });

  it('reprova: invade a área da porta; passa fora dela', () => {
    const c = box();
    expect(furnitureProblems(c, lf('furn_armchair', [1.45, 0.6])).join(' ')).toMatch(/invade a porta/);
    expect(furnitureProblems(c, lf('furn_armchair', [4.5, 0.6])).join(' ')).toEqual('');
  });

  it('reprova: ocupa a escada, a chegada ao pé ou fica a menos de 0,6 m do topo', () => {
    const c = box();
    const stair = { id: 's', level: 'L0', footprint: [[3, 1], [3.8, 1], [3.8, 5], [3, 5]] as Vec2[], foot: [[3, 0.2], [3.8, 0.2], [3.8, 1], [3, 1]] as Vec2[], top: [[3, 4.4], [3.8, 4.4], [3.8, 5], [3, 5]] as Vec2[], footPoint: [3.4, 1.2] as Vec2, topPoint: [3.4, 4.8] as Vec2 };
    const cs = { ...c, stairs: [stair] };
    expect(furnitureProblems(cs, lf('furn_armchair', [3.4, 3])).join(' ')).toMatch(/escada/);
    expect(furnitureProblems(cs, lf('furn_armchair', [3.4, 0.6])).join(' ')).toMatch(/escada/);
    expect(furnitureProblems(cs, lf('furn_armchair', [5, 3])).join(' ')).toEqual('');
  });

  it('reprova: colisão entre móveis', () => {
    const a = lf('furn_sofa_3', [3.5, 2.5]);
    const b = lf('furn_armchair', [3.5, 2.4]);
    expect(furnitureProblems(withF(box(), a, b), b).join(' ')).toMatch(/colide/);
  });
});

describe('layoutQuality: cama', () => {
  /** Quarto 3,2 × 3,6, cabeceira na parede dos fundos (y = 3,6). */
  const bedroom = (): LCtx => {
    const w = 3.2;
    const d = 3.6;
    const c = box({ use: 'bedroom', w, d });
    return c;
  };
  const bedAt = (x: number) => lf('furn_bed_double', [x, 3.54 - 1.0 - 0.005 + 0.0], 0);

  it('passa: cama centrada, acesso pelos dois lados e cabeceira em parede cheia', () => {
    const c = bedroom();
    const b = bedAt(1.6);
    expect(bedProblems(withF(c, b), b)).toEqual([]);
  });

  it('reprova: cama encostada na parede lateral sem acesso pelos dois lados (quarto largo)', () => {
    const c = bedroom();
    const b = bedAt(0.06 + 0.725 + 0.005);
    expect(bedProblems(withF(c, b), b).join(' ')).toMatch(/pelos dois lados/);
  });

  it('quarto estreito pede acesso só por um lado', () => {
    const c = box({ use: 'bedroom', w: 2.6, d: 3.6 });
    const b = lf('furn_bed_double', [0.06 + 0.725 + 0.005, 2.54], 0);
    expect(bedProblems(withF(c, b), b)).toEqual([]);
  });

  it('reprova: cabeceira sob janela baixa; passa com peitoril de 1,1 m', () => {
    const c = bedroom();
    const b = bedAt(1.6);
    expect(bedProblems({ ...withF(c, b), openings: [win('j', 'ext-back', 1.3, 2.7, 0.9)] }, b).join(' ')).toMatch(/janela baixa/);
    expect(bedProblems({ ...withF(c, b), openings: [win('j', 'ext-back', 1.3, 2.7, 1.1)] }, b)).toEqual([]);
  });

  it('reprova: cabeceira em mureta e cama longe de qualquer parede', () => {
    const c = bedroom();
    const low = { ...c, walls: c.walls.map((w) => (w.id === 'ext-back' ? wall('ext-back', [3.2, 3.6], [0, 3.6], 1.1, 'exterior') : w)) };
    const b = bedAt(1.6);
    expect(bedProblems(withF(low, b), b).join(' ')).toMatch(/parede baixa/);
    const floating = lf('furn_bed_double', [1.6, 1.8], 0);
    expect(bedProblems(withF(c, floating), floating).join(' ')).toMatch(/não encosta/);
  });
});

describe('layoutQuality: cozinha', () => {
  const kitchen = () => {
    const c = box({ use: 'kitchen', w: 4, d: 3 });
    return c;
  };
  // fila na parede dos fundos (y = 3): pia, fogão, vão, geladeira
  const sink = () => lf('furn_kitchen_sink', [0.9 + 0.06, 3 - 0.06 - 0.3 - 0.005], 0);
  const stove = (x = 2.3) => lf('furn_stove', [x, 3 - 0.06 - 0.3 - 0.005], 0);
  const fridge = (x = 3.4) => lf('furn_fridge', [x, 3 - 0.06 - 0.36 - 0.005], 0);

  it('passa: triângulo de 4 a 8 m, fogão a 0,3 m da geladeira', () => {
    const c = withF(kitchen(), sink(), stove(), fridge());
    expect(kitchenProblems(c, c.rooms[0]!)).toEqual([]);
  });

  it('reprova: fogão encostado na geladeira', () => {
    const c = withF(kitchen(), sink(), stove(3.0), fridge(3.62));
    expect(kitchenProblems(c, c.rooms[0]!).join(' ')).toMatch(/encostado na geladeira/);
  });

  it('passa com uma bancada entre o fogão e a geladeira', () => {
    const counter = lf('furn_kitchen_counter', [3.0, 3 - 0.06 - 0.3 - 0.005], 0);
    const c = withF(kitchen(), sink(), lf('furn_stove', [2.45, 3 - 0.06 - 0.3 - 0.005], 0), counter, lf('furn_fridge', [3.97, 3 - 0.06 - 0.36 - 0.005], 0));
    expect(kitchenProblems(c, c.rooms[0]!).join(' ')).not.toMatch(/encostado na geladeira/);
  });

  it('reprova: triângulo pequeno demais e lado menor que 0,9 m', () => {
    const c = withF(kitchen(), sink(), lf('furn_stove', [1.7, 2.635], 0), lf('furn_fridge', [2.3, 2.6], 0));
    const p = kitchenProblems(c, c.rooms[0]!).join(' ');
    expect(p).toMatch(/triângulo/);
    expect(p).toMatch(/lado do triângulo/);
  });

  it('reprova: fogão embaixo de janela; a pia sob janela passa', () => {
    const c = { ...withF(kitchen(), sink(), stove(), fridge()), openings: [win('j', 'ext-back', 1.5, 2.2, 1.0)] };
    expect(kitchenProblems(c, c.rooms[0]!).join(' ')).toMatch(/fogão embaixo de janela/);
    const c2 = { ...withF(kitchen(), sink(), stove(), fridge()), openings: [win('j', 'ext-back', 3.0, 3.9, 1.0)] };
    expect(kitchenProblems(c2, c2.rooms[0]!)).toEqual([]);
    const c3 = { ...withF(kitchen(), sink(), stove(), fridge()), openings: [win('j', 'ext-back', 0.4, 1.2, 1.0)] };
    expect(kitchenProblems(c3, c3.rooms[0]!).join(' ')).not.toMatch(/fogão/);
  });

  it('reprova: falta equipamento', () => {
    const c = withF(kitchen(), sink(), stove());
    expect(kitchenProblems(c, c.rooms[0]!).join(' ')).toMatch(/falta geladeira/);
  });
});

describe('layoutQuality: banheiro', () => {
  const bath = () => box({ use: 'bathroom', w: 2.4, d: 2.4 });
  const items = (toiletX = 0.5) => [
    lf('furn_shower', [2.4 - 0.06 - 0.45 - 0.005, 2.4 - 0.06 - 0.45 - 0.005], 0), // canto do fundo, direita (de costas para o fundo)
    lf('furn_toilet', [toiletX, 2.4 - 0.06 - 0.325 - 0.005], 0),
    lf('furn_bath_sink', [1.0, 2.4 - 0.06 - 0.225 - 0.005], 0),
  ];

  it('passa: bacia e lavatório com 0,6 m livres na frente, box de 0,9 × 0,9 m', () => {
    const c = withF(bath(), ...items());
    expect(bathProblems(c, c.rooms[0]!)).toEqual([]);
  });

  it('reprova: sem folga na frente da bacia (parede em frente) ou do lavatório (móvel em frente)', () => {
    const tight = box({ use: 'bathroom', w: 2.4, d: 1.2 });
    const t = [lf('furn_shower', [1.9, 1.0], 0), lf('furn_toilet', [0.5, 1.2 - 0.06 - 0.325 - 0.005], 0), lf('furn_bath_sink', [1.0, 1.2 - 0.06 - 0.225 - 0.005], 0)];
    expect(bathProblems(withF(tight, ...t), tight.rooms[0]!).join(' ')).toMatch(/frente da bacia/);
    const [sh, to, ba] = items();
    const blocker = lf('furn_washer', [1.3, 1.5], 0);
    const c = withF(bath(), sh!, to!, ba!, blocker);
    expect(bathProblems(c, c.rooms[0]!).join(' ')).toMatch(/frente do lavatório/);
  });

  it('reprova: falta peça', () => {
    const c = withF(bath(), items()[0]!);
    expect(bathProblems(c, c.rooms[0]!).join(' ')).toMatch(/falta bacia, lavatório/);
  });
});

describe('layoutQuality: paredes com sentido', () => {
  /** Dois cômodos lado a lado, separados por w-1 em x = 3. */
  const two = (): LCtx => {
    const c = box({ w: 6, d: 4 });
    return {
      ...c,
      walls: [...c.walls, wall('w-1', [3, 0], [3, 4])],
      rooms: [room('a', 'Quarto', 'bedroom', 0, 0, 3, 4, ['ext-front', 'w-1', 'ext-back', 'ext-left']), room('b', 'Sala', 'living', 3, 0, 6, 4, ['ext-front', 'ext-right', 'ext-back', 'w-1'])],
    };
  };

  it('passa: parede que separa dois cômodos', () => {
    expect(wallSenseProblems(two())).toEqual([]);
  });

  it('reprova: toco solto dentro de um cômodo', () => {
    const c = box({ w: 6, d: 4 });
    const stub = { ...c, walls: [...c.walls, wall('w-stub', [3, 0], [3, 2])] };
    expect(wallSenseProblems(stub).join(' ')).toMatch(/w-stub/);
  });

  it('passa: meia-parede de balcão (bancada encostada) e parede da escada; reprova meia-parede solta', () => {
    const c = box({ w: 6, d: 4 });
    const half = { ...c, walls: [...c.walls, wall('w-half', [3, 0.5], [3, 3.5], 1.1)] };
    expect(wallSenseProblems(half).join(' ')).toMatch(/w-half/);
    const counter = lf('furn_kitchen_counter', [3.4, 1.0], 90);
    const sink = lf('furn_kitchen_sink', [3.4, 2.5], 90);
    expect(wallSenseProblems(withF(half, counter, sink))).toEqual([]);
    const stairWall = { ...c, walls: [...c.walls, wall('w-st', [3, 0.5], [3, 3.5])], stairs: [{ id: 's', level: 'L0', footprint: [[2.1, 0.5], [2.9, 0.5], [2.9, 3.5], [2.1, 3.5]] as Vec2[], foot: [], top: [], footPoint: [2.5, 0.5] as Vec2, topPoint: [2.5, 3.5] as Vec2 }] };
    expect(wallSenseProblems(stairWall)).toEqual([]);
  });

  it('passa: parede que apoia a borda do mezanino', () => {
    const c = box({ w: 6, d: 4 });
    const support = { ...c, walls: [...c.walls, wall('w-edge', [0, 2], [6, 2])], upperPolys: [[[0, 2], [6, 2], [6, 4], [0, 4]] as Vec2[]] };
    expect(wallSenseProblems(support)).toEqual([]);
  });

  it('reprova: toco de anexo do A-frame que entra mais de 1,3 m no corpo; passa com 1,1 m', () => {
    const c = { ...box({ w: 6, d: 6 }), bodyWidth: 6 };
    const stub = (reach: number) => ({ ...c, walls: [...c.walls, wall('annex-left-back', [reach, 4], [-3, 4], 3, 'exterior')] });
    expect(wallSenseProblems(stub(1.44)).join(' ')).toMatch(/annex-left-back/);
    expect(wallSenseProblems(stub(1.1))).toEqual([]);
  });
});

describe('layoutQuality: circulação', () => {
  /** Dois cômodos com porta de entrada na frente do corpo e porta interna em w-1. */
  const plan = (): LCtx => {
    const c = box({ w: 6, d: 4 });
    return {
      ...c,
      walls: [...c.walls, wall('w-1', [3, 0], [3, 4])],
      openings: [door('o-ent', 'ext-front', 1, 1.9), door('o-int', 'w-1', 2.6, 3.4)],
      rooms: [room('a', 'Quarto', 'bedroom', 0, 0, 3, 4, ['ext-front', 'w-1', 'ext-back', 'ext-left']), room('b', 'Sala', 'living', 3, 0, 6, 4, ['ext-front', 'ext-right', 'ext-back', 'w-1'])],
    };
  };

  it('passa: caminho livre da porta de dentro até a de entrada', () => {
    expect(circulationProblems(plan())).toEqual([]);
  });

  it('reprova: porta cercada por móveis (sem 0,8 m de passagem)', () => {
    const c = withF(plan(), lf('furn_bookshelf', [2.6, 1.9], 0), lf('furn_bookshelf', [2.6, 1.55], 0), lf('furn_wardrobe', [2.2, 2.6], 90), lf('furn_wardrobe', [2.2, 3.3], 90), lf('furn_wardrobe', [1.4, 2.95], 0), lf('furn_wardrobe', [3.8, 3.0], -90), lf('furn_wardrobe', [4.6, 1.6], 0));
    expect(circulationProblems(c).join(' ')).toMatch(/o-int/);
  });

  it('sala com menos de 40% de piso livre reprova', () => {
    const c = box({ w: 4, d: 3 });
    const sofa = lf('furn_sofa_3', [2, 3 - 0.06 - 0.45 - 0.005]);
    const lots = [
      lf('furn_dining_6', [2, 1.5]),
      lf('furn_dining_6', [2, 1.2]),
      lf('furn_dining_6', [2, 1.8]),
      lf('furn_dining_4', [0.7, 1.6]),
      lf('furn_dining_4', [3.3, 1.6]),
    ];
    expect(ctxProblems(withF(c, sofa, ...lots)).join(' ')).toMatch(/piso livre/);
    expect(ctxProblems(withF(c, sofa)).join(' ')).not.toMatch(/piso livre/);
  });
});

describe('layoutProblems: projetos reais', () => {
  it('projeto do assistente (A-frame, duas águas, celeiro, moderno) passa nas métricas', { timeout: 120_000 }, () => {
    for (const style of ['aframe', 'gable', 'gambrel', 'modern'] as const) {
      const { project } = generateProject({ ...DEFAULT_ANSWERS, style, bedrooms: 2, mezzanine: style === 'modern' ? 'none' : 'sleep', bathUp: style !== 'modern' });
      const r = computeAll(project, catalog);
      expect(layoutProblems(project, r.model, catalog), style).toEqual([]);
    }
  });

  it('os 5 modelos prontos passam nas métricas', { timeout: 120_000 }, () => {
    for (const preset of PRESETS) {
      const project = preset.build();
      const r = computeAll(project, catalog);
      expect(layoutProblems(project, r.model, catalog), preset.id).toEqual([]);
    }
  });

  it('as métricas pegam o desenho antigo: tira o sofá da frente da TV e reprova', { timeout: 60_000 }, () => {
    const { project } = generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 1, mezzanine: 'sleep' });
    const sofa = project.furniture.find((f) => f.item.startsWith('furn_sofa'))!;
    sofa.rotation = (sofa.rotation + 90) % 360;
    const r = computeAll(project, catalog);
    expect(layoutProblems(project, r.model, catalog).join(' ')).toMatch(/de frente|colide|atravessa|passa do contorno/);
  });
});
