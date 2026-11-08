import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import type { HostWall, Project, ResolvedOpening, RoomModel } from '@chalecad/engine';
import { patchTypology } from './edit';
import {
  addFurniture,
  clearancePolygon,
  clientFurnitureModels,
  duplicateFurniture,
  furnishRoom,
  furnitureFootprint,
  mergeFurnitureModels,
  moveFurniture,
  placeFurniture,
  placeEnv,
  polysOverlap,
  reconcileFurniture,
  removeFurniture,
  rotateFurniture,
  setFurnitureRotation,
  snapToFurniture,
  snapToWall,
  wallRect,
} from './furniture';
import { planBounds } from './geometry';
import { createProject } from './templates';
import type { V2 } from '../tools/geom';

const catalog = getCatalog();
const spec = (id: string) => catalog.furniture.find((f) => f.id === id)!;
const L0 = (p: Project) => p.levels[0]!.id;
const base = () => createProject('gable_mezzanine');

const wall = (id: string, from: V2, to: V2, thickness = 0.1): HostWall => ({ id, level: 'L0', from, to, thickness }) as HostWall;

describe('edição de móveis', () => {
  it('adiciona com ID f-xxxxxxxx, move, gira, duplica e remove', () => {
    let id = '';
    let copy: string | null = null;
    const p = produce(base(), (d) => {
      id = addFurniture(d, L0(d), 'furn_sofa_3', [2.00049, 1.5], 450);
      expect(moveFurniture(d, id, [3, 2.5])).toBe(true);
      expect(rotateFurniture(d, id)).toBe(true);
      copy = duplicateFurniture(d, id);
    });
    expect(id).toMatch(/^f-[0-9a-f]{8}$/);
    expect(copy).toMatch(/^f-[0-9a-f]{8}$/);
    const a = p.furniture.find((f) => f.id === id)!;
    const b = p.furniture.find((f) => f.id === copy)!;
    // 450° vira 90°, mais um passo de 90° = 180°
    expect(a).toMatchObject({ position: [3, 2.5], rotation: 180, item: 'furn_sofa_3' });
    expect(b.position).toEqual([3.3, 2.8]);
    expect(b.rotation).toBe(180);
    const p2 = produce(p, (d) => {
      expect(removeFurniture(d, id)).toBe(true);
      expect(removeFurniture(d, 'f-nada')).toBe(false);
    });
    expect(p2.furniture.map((f) => f.id)).toEqual([copy]);
  });

  it('giro livre e passos negativos ficam em (-180, 180]', () => {
    let id = '';
    const p = produce(base(), (d) => {
      id = addFurniture(d, L0(d), 'furn_rug', [1, 1]);
      setFurnitureRotation(d, id, 37.5);
      rotateFurniture(d, id, -90);
    });
    expect(p.furniture[0]!.rotation).toBe(-52.5);
    const q = produce(p, (d) => void setFurnitureRotation(d, id, 270));
    expect(q.furniture[0]!.rotation).toBe(-90);
  });
});

describe('contorno', () => {
  const s = spec('furn_sofa_3'); // 2,10 x 0,90
  it('0°: retângulo w x d em torno do centro', () => {
    const f = furnitureFootprint(s, [5, 4], 0);
    expect(f).toHaveLength(4);
    expect(f[0]![0]).toBeCloseTo(3.95);
    expect(f[0]![1]).toBeCloseTo(3.55);
    expect(f[2]![0]).toBeCloseTo(6.05);
    expect(f[2]![1]).toBeCloseTo(4.45);
  });
  it('90°: largura passa para y (anti-horário)', () => {
    const f = furnitureFootprint(s, [0, 0], 90);
    const xs = f.map((p) => p[0]);
    const ys = f.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2.1);
    // canto (−w/2, −d/2) gira para (d/2, −w/2)
    expect(f[0]![0]).toBeCloseTo(0.45);
    expect(f[0]![1]).toBeCloseTo(-1.05);
  });
  it('45°: caixa envolvente (w + d) / √2', () => {
    const f = furnitureFootprint(s, [1, 1], 45);
    const xs = f.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo((2.1 + 0.9) / Math.SQRT2, 5);
  });
  it('faixa de uso à frente (−y) do sofá', () => {
    const c = clearancePolygon(s, [0, 0], 0)!;
    expect(Math.min(...c.map((p) => p[1]))).toBeCloseTo(-0.45 - 0.6);
    expect(clearancePolygon(spec('furn_plant'), [0, 0], 0)).toBeNull();
  });
  it('sobreposição: encostar não conta, entrar conta', () => {
    const a: V2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(polysOverlap(a, [[1, 0], [2, 0], [2, 1], [1, 1]])).toBe(false);
    expect(polysOverlap(a, [[0.9, 0], [2, 0], [2, 1], [0.9, 1]])).toBe(true);
  });
});

describe('snapToWall', () => {
  const s = spec('furn_sofa_3');
  const off = (t: number) => t / 2 + s.size.d / 2 + 0.005;

  it('parede horizontal: fundo encostado, frente para o lado do ponto', () => {
    const r = snapToWall(s, [2, 0.4], 0, [wall('a', [0, 0], [5, 0])], 'L0');
    expect(r.wallId).toBe('a');
    expect(r.position[0]).toBeCloseTo(2);
    expect(r.position[1]).toBeCloseTo(off(0.1), 3);
    // frente (−y) aponta para +y: 180°
    expect(r.rotation).toBe(180);
    const below = snapToWall(s, [2, -0.3], 0, [wall('a', [0, 0], [5, 0])], 'L0');
    expect(below.rotation).toBe(0);
    expect(below.position[1]).toBeCloseTo(-off(0.1), 3);
  });

  it('parede vertical', () => {
    const w = [wall('v', [3, 0], [3, 4], 0.12)];
    const r = snapToWall(s, [2.6, 2], 0, w, 'L0');
    // ponto à esquerda (x < 3): frente aponta para −x
    expect(r.rotation).toBe(-90);
    expect(r.position[0]).toBeCloseTo(3 - off(0.12), 3);
    expect(r.position[1]).toBeCloseTo(2);
    const right = snapToWall(s, [3.4, 2], 0, w, 'L0');
    expect(right.rotation).toBe(90);
    expect(right.position[0]).toBeCloseTo(3 + off(0.12), 3);
  });

  it('parede diagonal: o fundo toca a parede', () => {
    const w = wall('d', [0, 0], [4, 4], 0.1);
    const r = snapToWall(s, [2.3, 1.7], 0, [w], 'L0');
    expect(r.wallId).toBe('d');
    // distância do centro ao eixo = espessura/2 + d/2 + 5 mm
    const dist = Math.abs(r.position[0] - r.position[1]) / Math.SQRT2;
    expect(dist).toBeCloseTo(off(0.1), 2);
    // frente aponta para o lado do ponto (x > y): direção (1, −1)/√2 => rotação 135°
    const f = furnitureFootprint(s, r.position, r.rotation);
    const back = [f[2]!, f[3]!];
    const backDist = back.map((p) => Math.abs(p[0] - p[1]) / Math.SQRT2);
    for (const bd of backDist) expect(bd).toBeCloseTo(0.05 + 0.005, 2);
  });

  it('sem parede por perto (ou de outro nível, ou item sem wall): grade de 5 cm e rotação mantida', () => {
    const w = [wall('a', [0, 0], [5, 0])];
    const far = snapToWall(s, [2.03, 2.04], 30, w, 'L0');
    expect(far).toEqual({ position: [2.05, 2.05], rotation: 30, wallId: null });
    expect(snapToWall(s, [2, 0.3], 0, w, 'L1').wallId).toBeNull();
    expect(snapToWall(spec('furn_rug'), [2, 0.3], 0, w, 'L0').wallId).toBeNull();
  });
});

describe('encaixe entre móveis e colisão', () => {
  it('alinha a borda com outro móvel a menos de 8 cm', () => {
    const rug = spec('furn_coffee_table'); // 1,0 x 0,6
    const other = furnitureFootprint(spec('furn_sofa_3'), [5, 5], 0); // x 3,95..6,05; y 4,55..5,45
    const r = snapToFurniture(rug, [3.42, 4.2], 0, [other]);
    // borda direita da mesa (x + 0,5) vai de 3,92 para 3,95; a de cima (y + 0,3) de 4,50 para 4,55
    expect(r[0]).toBeCloseTo(3.45);
    expect(r[1]).toBeCloseTo(4.25);
    // fora de 8 cm não mexe
    expect(snapToFurniture(rug, [1, 1], 0, [other])).toEqual([1, 1]);
    // com rotação diagonal não encaixa
    expect(snapToFurniture(rug, [3.42, 4.2], 45, [other])).toEqual([3.42, 4.2]);
  });

  it('prévia vermelha ao cruzar parede ou outro móvel', () => {
    const p = produce(base(), (d) => {
      addFurniture(d, L0(d), 'furn_sofa_3', [3, 3], 0);
    });
    const env = placeEnv(p, catalog, [wall('a', [0, 0], [8, 0])], 'L0');
    const sofa = spec('furn_sofa_3');
    expect(placeFurniture(sofa, [3, 3.2], 0, env, { free: true }).collision).toBe(true);
    expect(placeFurniture(spec('furn_armchair'), [6, 3], 0, env, { free: true }).collision).toBe(false);
    // rug não colide com móveis
    expect(placeFurniture(spec('furn_rug'), [3, 3], 0, env, { free: true }).collision).toBe(false);
    // dentro da parede
    expect(placeFurniture(spec('furn_armchair'), [6, 0.1], 0, env, { free: true }).collision).toBe(true);
    // encaixado na parede não colide
    const snapped = placeFurniture(sofa, [3, 0.5], 0, env);
    expect(snapped.wallId).toBe('a');
    expect(snapped.collision).toBe(false);
  });
});

describe('reconcile', () => {
  it('remove móveis de nível que sumiu e empurra para dentro da planta', () => {
    const p0 = produce(base(), (d) => {
      addFurniture(d, L0(d), 'furn_sofa_3', [-5, 100], 0);
      addFurniture(d, 'L-fantasma', 'furn_sofa_3', [1, 1], 0);
    });
    const p1 = produce(p0, (d) => {
      const r = reconcileFurniture(d, catalog);
      expect(r).toEqual({ removed: 1, moved: 1 });
    });
    expect(p1.furniture).toHaveLength(1);
    const b = planBounds(p1.typology);
    const f = furnitureFootprint(spec('furn_sofa_3'), p1.furniture[0]!.position as V2, 0);
    for (const [x, y] of f) {
      expect(x).toBeGreaterThanOrEqual(b.x0 - 1e-6);
      expect(y).toBeLessThanOrEqual(b.y1 + 1e-6);
    }
  });

  it('reconcileProject (mudar o tamanho) mantém os móveis dentro', () => {
    const p0 = produce(base(), (d) => {
      addFurniture(d, L0(d), 'furn_sofa_3', [d.typology.width - 1, d.typology.depth - 0.5], 0);
    });
    const p1 = produce(p0, (d) => void patchTypology(d, { width: 4, depth: 5 }));
    const b = planBounds(p1.typology);
    const f = furnitureFootprint(spec('furn_sofa_3'), p1.furniture[0]!.position as V2, 0);
    expect(Math.max(...f.map((q) => q[0]))).toBeLessThanOrEqual(b.x1 + 1e-6);
    expect(Math.max(...f.map((q) => q[1]))).toBeLessThanOrEqual(b.y1 + 1e-6);
  });
});

describe('modelo no cliente', () => {
  it('contorno, faixa, altura, cota e cômodo; o motor vence quando existe', () => {
    const p = produce(base(), (d) => {
      addFurniture(d, L0(d), 'furn_bed_double', [1.5, 2], 0);
    });
    const room = { id: 'r1', level: L0(p), polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] } as unknown as RoomModel;
    const [m] = clientFurnitureModels(p, catalog, [room], () => 0.12);
    expect(m).toMatchObject({ item: 'furn_bed_double', z: 0.12, height: 0.55, roomId: 'r1' });
    expect(m!.polygon).toHaveLength(4);
    expect(m!.clearance).not.toBeNull();
    const fromEngine = { ...m!, roomId: 'motor' };
    expect(mergeFurnitureModels([fromEngine], [m!])[0]!.roomId).toBe('motor');
    // resultado defasado (móvel movido depois do cálculo): vale o cliente
    const stale = { ...fromEngine, polygon: m!.polygon.map(([x, y]) => [x + 1, y] as [number, number]) };
    expect(mergeFurnitureModels([stale], [m!])[0]!.roomId).toBe('r1');
    expect(mergeFurnitureModels([], [m!])[0]!.roomId).toBe('r1');
  });
});

// ---------------------------------------------------------------------------
// Mobiliar
// ---------------------------------------------------------------------------

interface Layout {
  room: RoomModel;
  walls: HostWall[];
  openings: ResolvedOpening[];
}

/** Cômodo retangular w x d no canto (0,0), paredes de 12 cm sobre o contorno. Aberturas: [parede 0..3, tipo, u0, u1]. */
function box(w: number, d: number, use: RoomModel['use'], ops: [number, 'door' | 'window', number, number][]): Layout {
  const pts: V2[] = [[0, 0], [w, 0], [w, d], [0, d]];
  const walls = pts.map((a, i) => wall(`w${i}`, a, pts[(i + 1) % 4]!, 0.12));
  const edges = pts.map((a, i) => ({ from: a, to: pts[(i + 1) % 4]!, hostId: `w${i}` }));
  const openings = ops.map(([wi, type, u0, u1], i) => ({ id: `o${i}`, hostId: `w${wi}`, hostKind: 'wall', type, u0, u1, v0: type === 'door' ? 0 : 0.9, v1: type === 'door' ? 2.1 : 2.1, valid: true })) as ResolvedOpening[];
  const room = { id: 'r', level: 'L0', use, name: use, polygon: pts, edges, area: w * d, perimeter: 2 * (w + d), ceiling: { min: 2.7, avg: 2.7, max: 2.7 }, glazing: 0, openingIds: [], wet: false } as unknown as RoomModel;
  return { room, walls, openings };
}

function checkLayout(l: Layout, list: ReturnType<typeof furnishRoom>) {
  const polys = list.map((f) => ({ f, spec: spec(f.item), poly: furnitureFootprint(spec(f.item), f.position as V2, f.rotation) }));
  for (const a of polys) {
    for (const c of a.poly) {
      // dentro do polígono (a parede é o contorno: encostar é permitido)
      expect(c[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(c[1]).toBeGreaterThanOrEqual(-1e-6);
    }
    for (const w of l.walls) expect(polysOverlap(a.poly, wallRect(w))).toBe(false);
  }
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) expect(polysOverlap(polys[i]!.poly, polys[j]!.poly)).toBe(false);
  }
  // portas livres
  for (const o of l.openings) {
    if (o.type !== 'door') continue;
    const w = l.walls.find((x) => x.id === o.hostId)!;
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    const dir: V2 = [(w.to[0] - w.from[0]) / len, (w.to[1] - w.from[1]) / len];
    const mid = (o.u0 + o.u1) / 2;
    const pt: V2 = [w.from[0] + dir[0] * mid, w.from[1] + dir[1] * mid];
    // ponto 0,4 m para dentro da porta (centro do cômodo está para a esquerda do sentido anti-horário)
    const inward: V2 = [-dir[1], dir[0]];
    const probe: V2 = [pt[0] + inward[0] * 0.4, pt[1] + inward[1] * 0.4];
    for (const a of polys) expect(pointIn(probe, a.poly)).toBe(false);
  }
}

const pointIn = (p: V2, poly: V2[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const items = (l: ReturnType<typeof furnishRoom>) => l.map((f) => f.item);
const run = (l: Layout) => furnishRoom({ furniture: [] }, catalog, l.room, { walls: l.walls, openings: l.openings });

describe('furnishRoom', () => {
  it('quarto 3 x 3,5 com porta e janela: cama e guarda-roupa sem sobreposição, dentro do polígono', () => {
    // janela na parede de baixo (w0), porta na parede direita (w1, entre y 0,4 e 1,3)
    const l = box(3, 3.5, 'bedroom', [[0, 'window', 1, 2.2], [1, 'door', 0.4, 1.3]]);
    const out = run(l);
    expect(items(out)).toContain('furn_bed_double');
    expect(items(out)).toContain('furn_wardrobe');
    checkLayout(l, out);
    // cabeceira na parede mais longa sem janela e sem porta (esquerda, w3: x = 0)
    const bed = out.find((f) => f.item === 'furn_bed_double')!;
    expect(bed.position[0]).toBeLessThan(1.3);
    expect(Math.abs(bed.rotation)).toBe(90);
    expect(bed.rotation).toBe(-90 + 180); // frente para +x
  });

  it('quarto estreito usa cama de solteiro', () => {
    const l = box(2.4, 3.2, 'bedroom', [[1, 'door', 0.3, 1.1]]);
    const out = run(l);
    expect(items(out)).toContain('furn_bed_single');
    checkLayout(l, out);
  });

  it('banheiro 1,5 x 2,4: vaso, lavatório e box', () => {
    const l = box(1.5, 2.4, 'bathroom', [[0, 'door', 0.3, 1.1]]);
    const out = run(l);
    expect(items(out).sort()).toEqual(['furn_bath_sink', 'furn_shower', 'furn_toilet']);
    checkLayout(l, out);
  });

  it('cozinha 2,5 x 3: pia, fogão e geladeira', () => {
    const l = box(2.5, 3, 'kitchen', [[0, 'door', 0.4, 1.2], [2, 'window', 0.8, 1.8]]);
    const out = run(l);
    expect(items(out).sort()).toEqual(['furn_fridge', 'furn_kitchen_sink', 'furn_stove']);
    checkLayout(l, out);
  });

  it('sala: sofá, rack e mesa de centro, sem sobreposição', () => {
    const l = box(4, 5, 'living', [[0, 'door', 0.4, 1.3], [2, 'window', 1, 3]]);
    const out = run(l);
    expect(items(out)).toEqual(expect.arrayContaining(['furn_sofa_3', 'furn_tv_rack', 'furn_coffee_table']));
    checkLayout(l, out);
    const sofa = out.find((f) => f.item === 'furn_sofa_3')!;
    const rack = out.find((f) => f.item === 'furn_tv_rack')!;
    const table = out.find((f) => f.item === 'furn_coffee_table')!;
    // mesa de centro entre os dois
    const d = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(d(table.position as V2, sofa.position as V2) + d(table.position as V2, rack.position as V2)).toBeLessThan(d(sofa.position as V2, rack.position as V2) * 1.2);
  });

  it('lavanderia: tanque e máquina', () => {
    const l = box(1.8, 2.2, 'laundry', [[0, 'door', 0.3, 1.1]]);
    const out = run(l);
    expect(items(out).sort()).toEqual(['furn_tank', 'furn_washer']);
    checkLayout(l, out);
  });

  it('descarta o que não cabe e não repete o que já existe', () => {
    const tiny = box(1.0, 1.0, 'bedroom', []);
    expect(run(tiny)).toEqual([]);
    const l = box(3, 3.5, 'bedroom', []);
    const first = run(l);
    const again = furnishRoom({ furniture: first }, catalog, l.room, { walls: l.walls, openings: l.openings });
    expect(again).toEqual([]);
    expect(furnishRoom({ furniture: [] }, catalog, box(3, 3, 'circulation', []).room)).toEqual([]);
  });

  it('respeita móveis já postos no cômodo', () => {
    const l = box(3, 3.5, 'bedroom', []);
    const blocker = { id: 'f-blocker', level: 'L0', item: 'furn_island', position: [1.5, 1.75] as [number, number], rotation: 0 };
    const out = furnishRoom({ furniture: [blocker] }, catalog, l.room, { walls: l.walls, openings: l.openings });
    const bs = furnitureFootprint(spec('furn_island'), blocker.position, 0);
    for (const f of out) expect(polysOverlap(furnitureFootprint(spec(f.item), f.position as V2, f.rotation), bs)).toBe(false);
  });
});

describe('preço de referência', () => {
  it('usa a base de preços do material furn_* e o ajuste manual do usuário', async () => {
    const { furniturePrice } = await import('./furnitureInfo');
    const book = catalog.priceBooks[0]!;
    const p = furniturePrice('furn_sofa_3', catalog, book)!;
    expect(p.min).toBe(2200);
    expect(p.max).toBe(3500);
    expect(furniturePrice('furn_sofa_3', catalog, book, { 'mat-furn_sofa_3': { price: 3000, date: '2026-11-01', source: 'cotação' } })).toEqual({ min: 3000, max: 3000 });
    expect(furniturePrice('furn_inexistente', catalog, book)).toBeNull();
    const { furnitureTotals } = await import('./furniture');
    const t = furnitureTotals({ furniture: [{ id: 'a', level: 'L0', item: 'furn_sofa_3', position: [0, 0], rotation: 0 }, { id: 'b', level: 'L0', item: 'furn_rug', position: [1, 1], rotation: 0 }] }, (i) => furniturePrice(i, catalog, book));
    expect(t).toEqual({ count: 2, min: 2500, max: 4400 });
  });
});
