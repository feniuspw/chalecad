import { findPriceItem, getPriceBook } from '@chalecad/catalog';
import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildEngineerPackage } from '../../src/reports';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
const aframe = { kind: 'a_frame', width: 6, depth: 9, ridgeHeight: 7.5, kneeWallHeight: 0.6, frontGable: 'closed', backGable: 'closed' };
const wall = (id: string, from: [number, number], to: [number, number], extra: object = {}) => ({ id, level: 'L0', from, to, ...extra });
const room = (id: string, seed: [number, number], use = 'living', extra: object = {}) => ({ id, level: 'L0', use, seed, ...extra });
const item = (id: string, kind: string, position: [number, number], rotation = 0) => ({ id, level: 'L0', item: kind, position, rotation });
const run = (typology: unknown, extra: Record<string, unknown>) => computeAll(mk(typology, extra), testCatalog);
const codes = (r: ReturnType<typeof run>) => r.warnings.map((w) => w.code);
const has = (r: ReturnType<typeof run>, code: string, ref?: string) =>
  r.warnings.some((w) => w.code === code && (!ref || w.refs?.includes(ref)));
const near = (a: number[][], b: number[][]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(b[i]![0]!, 6);
    expect(p[1]).toBeCloseTo(b[i]![1]!, 6);
  });
};

describe('móveis: modelo', () => {
  test('cama de casal girada 90° no centro: 4 cantos certos', () => {
    const r = run(gable, { furniture: [item('b', 'furn_bed_double', [3, 4], 90)] });
    const f = r.model.furniture[0]!;
    // local (±0,725; ±1,0) girado 90° anti-horário: (x, y) → (−y, x)
    near(f.polygon, [[4, 3.275], [4, 4.725], [2, 4.725], [2, 3.275]]);
    expect(f.z).toBe(0);
    expect(f.height).toBe(0.55);
  });

  test('faixa de uso de 0,60 m na frente, em 0°, 90° e 180°', () => {
    const at = (rot: number) => run(gable, { furniture: [item('s', 'furn_sofa_3', [3, 4], rot)] }).model.furniture[0]!.clearance!;
    // sofá 2,10 × 0,90: frente para −y em 0°
    near(at(0), [[1.95, 2.95], [4.05, 2.95], [4.05, 4.45], [1.95, 4.45]]);
    // 90° anti-horário: a frente vira +x
    near(at(90), [[4.05, 2.95], [4.05, 5.05], [2.55, 5.05], [2.55, 2.95]]);
    near(at(180), [[4.05, 5.05], [1.95, 5.05], [1.95, 3.55], [4.05, 3.55]]);
  });

  test('sem folga, a faixa é null; cômodo contém o centro; item desconhecido é ignorado com info', () => {
    const r = run(gable, {
      rooms: [room('sala', [3, 4])],
      furniture: [item('t', 'furn_coffee_table', [3, 4]), item('x', 'furn_nao_existe', [3, 4])],
    });
    expect(r.model.furniture).toHaveLength(1);
    expect(r.model.furniture[0]!.clearance).toBeNull();
    expect(r.model.furniture[0]!.roomId).toBe('sala');
    const w = r.warnings.find((x) => x.code === 'furniture.unknown')!;
    expect(w.severity).toBe('info');
    expect(w.refs).toEqual(['x']);
  });
});

describe('móveis: alertas', () => {
  test('guarda-roupa de 2,20 m na lateral baixa do A-frame: headroom; no centro: nada', () => {
    const low = run(aframe, { furniture: [item('g', 'furn_wardrobe', [0.45, 4.5], 270)] });
    const w = low.warnings.find((x) => x.code === 'furniture.headroom')!;
    expect(w.severity).toBe('warn');
    expect(w.refs).toEqual(['g']);
    expect(w.message).toMatch(/faltam/);
    const mid = run(aframe, { furniture: [item('g', 'furn_wardrobe', [3, 4.5])] });
    expect(codes(mid)).not.toContain('furniture.headroom');
  });

  test('sofá cruzando a parede interna: wall; a 1 cm da face: sem alerta', () => {
    const base = { walls: [wall('w1', [0, 4], [6, 4])] };
    const t = run(gable, base).model.walls.find((w) => w.id === 'w1')!.thickness;
    const cross = run(gable, { ...base, furniture: [item('s', 'furn_sofa_3', [3, 4.2], 180)] });
    expect(has(cross, 'furniture.wall', 's')).toBe(true);
    const touch = run(gable, { ...base, furniture: [item('s', 'furn_sofa_3', [3, 4 + t / 2 + 0.45 + 0.01], 180)] });
    expect(codes(touch)).not.toContain('furniture.wall');
    const glued = run(gable, { ...base, furniture: [item('s', 'furn_sofa_3', [3, 4 + t / 2 + 0.45], 180)] });
    expect(codes(glued)).not.toContain('furniture.wall');
  });

  test('parede de vidro conta', () => {
    const r = run({ ...aframe, frontGable: 'glazed' }, { furniture: [item('s', 'furn_sofa_3', [3, 0.1], 180)] });
    expect(has(r, 'furniture.wall', 's')).toBe(true);
  });

  test('dois móveis sobrepostos: collision; tapete sob a mesa: sem colisão', () => {
    const two = run(gable, { furniture: [item('a', 'furn_bed_double', [3, 4]), item('b', 'furn_bed_double', [3.5, 4])] });
    const w = two.warnings.find((x) => x.code === 'furniture.collision')!;
    expect(w.refs).toEqual(['a', 'b']);
    const rug = run(gable, { furniture: [item('m', 'furn_dining_4', [3, 4]), item('t', 'furn_rug', [3, 4])] });
    expect(codes(rug)).not.toContain('furniture.collision');
    expect(codes(rug)).not.toContain('furniture.clearance');
  });

  test('faixa de uso invadida por outro móvel ou parede: info com a folga na mensagem', () => {
    const r = run(gable, { furniture: [item('s', 'furn_sofa_3', [3, 4]), item('c', 'furn_bookshelf', [3, 3.2])] });
    const w = r.warnings.find((x) => x.code === 'furniture.clearance' && x.refs?.includes('s'))!;
    expect(w.severity).toBe('info');
    expect(w.message).toBe('Pouco espaço na frente de Sofá 3 lugares: deixe 0,60 m livres.');
    const free = run(gable, { furniture: [item('s', 'furn_sofa_3', [3, 4])] });
    expect(codes(free)).not.toContain('furniture.clearance');
  });

  test('mesa na frente da porta: door; longe dela: sem alerta', () => {
    const door = { openings: [{ id: 'p', host: 'ext-front', type: 'door', offset: 1, width: 0.9, height: 2.1 }] };
    const r = run(gable, { ...door, furniture: [item('m', 'furn_dining_4', [1.45, 1.2])] });
    expect(has(r, 'furniture.door', 'm')).toBe(true);
    const far = run(gable, { ...door, furniture: [item('m', 'furn_dining_4', [4.5, 3])] });
    expect(codes(far)).not.toContain('furniture.door');
  });

  test('porta de correr: só 0,60 m de cada lado', () => {
    const slide = { openings: [{ id: 'p', host: 'ext-front', type: 'sliding_door', offset: 1, width: 1.8, height: 2.1 }] };
    const near = run(gable, { ...slide, furniture: [item('m', 'furn_coffee_table', [1.9, 0.55])] });
    expect(has(near, 'furniture.door', 'm')).toBe(true);
    const beyond = run(gable, { ...slide, furniture: [item('m', 'furn_coffee_table', [1.9, 1.2])] });
    expect(codes(beyond)).not.toContain('furniture.door');
  });

  test('vaso sanitário na sala: water; no banheiro: sem alerta', () => {
    const sala = run(gable, { rooms: [room('sala', [3, 4])], furniture: [item('v', 'furn_toilet', [3, 4])] });
    const w = sala.warnings.find((x) => x.code === 'furniture.water')!;
    expect(w.severity).toBe('info');
    expect(w.message).toMatch(/ponto de água e esgoto/);
    const bath = run(gable, {
      walls: [wall('w1', [2, 0], [2, 8]), wall('w2', [0, 2], [2, 2])],
      rooms: [room('wc', [1, 1], 'bathroom')],
      furniture: [item('v', 'furn_toilet', [1, 1])],
    });
    expect(bath.model.furniture[0]!.roomId).toBe('wc');
    expect(codes(bath)).not.toContain('furniture.water');
    const fora = run(gable, { furniture: [item('v', 'furn_toilet', [3, 4])] });
    expect(has(fora, 'furniture.water', 'v')).toBe(true);
  });

  test('móvel fora do chalé: outside; encostado na face interna: sem alerta', () => {
    const r = run(gable, { furniture: [item('s', 'furn_sofa_3', [-3, 4])] });
    expect(has(r, 'furniture.outside', 's')).toBe(true);
    const t = r.model.walls.find((w) => w.id === 'ext-left')!.thickness;
    // face interna da parede esquerda em x = t/2; sofá girado 90° com fundo (d = 0,9) encostado
    const inside = run(gable, { furniture: [item('s', 'furn_sofa_3', [t / 2 + 0.45, 4], 270)] });
    expect(codes(inside)).not.toContain('furniture.outside');
    const wallHalf = run(gable, { furniture: [item('s', 'furn_sofa_3', [0.45, 4], 270)] });
    expect(has(wallHalf, 'furniture.outside', 's')).toBe(true);
  });

  test('móvel sobre a escada ou a chegada dela: stair', () => {
    const levels = [
      { id: 'L0', elevation: 0, floor: 'polished_concrete' },
      { id: 'L1', elevation: 2.6, polygon: [[0, 4], [6, 4], [6, 8], [0, 8]] },
    ];
    const stairs = [{ id: 'e', type: 'straight', from: 'L0', to: 'L1', position: [1, 1], rotationDeg: 0, width: 0.9 }];
    const on = run(gable, { levels, stairs, furniture: [item('m', 'furn_coffee_table', [1.45, 2])] });
    expect(has(on, 'furniture.stair', 'm')).toBe(true);
    // chegada: 0,80 m antes do primeiro degrau (y < 1)
    const arrival = run(gable, { levels, stairs, furniture: [item('m', 'furn_coffee_table', [1.45, 0.5])] });
    expect(has(arrival, 'furniture.stair', 'm')).toBe(true);
    const away = run(gable, { levels, stairs, furniture: [item('m', 'furn_coffee_table', [4.5, 2])] });
    expect(codes(away)).not.toContain('furniture.stair');
  });

  test('cômodo apertado (versão simples: área livre < 40%)', () => {
    const closed = [wall('w1', [3, 0], [3, 3]), wall('w2', [0, 3], [3, 3])];
    const full = run(gable, {
      walls: closed,
      rooms: [room('q', [1.5, 1.5], 'bedroom')],
      furniture: [item('a', 'furn_bed_queen', [1.5, 1.5], 90), item('b', 'furn_wardrobe', [1.5, 0.5]), item('c', 'furn_bed_double', [1.5, 2.3])],
    });
    const w = full.warnings.find((x) => x.code === 'furniture.circulation')!;
    expect(w.severity).toBe('info');
    expect(w.message).toMatch(/^Cômodo apertado/);
    const ok = run(gable, { walls: closed, rooms: [room('q', [1.5, 1.5], 'bedroom')], furniture: [item('a', 'furn_bed_single', [1, 1.5])] });
    expect(codes(ok)).not.toContain('furniture.circulation');
  });
});

describe('móveis: orçamento e pacote do engenheiro', () => {
  const beds = [item('a', 'furn_bed_double', [1.5, 2]), item('b', 'furn_bed_double', [4.5, 2])];
  const withBudget = (flag: boolean) =>
    run(gable, { furniture: beds, budget: { includeFurniture: flag } });

  test('duas camas com includeFurniture: 2 un com o preço do catálogo, em acabamento', () => {
    const r = withBudget(true);
    const l = r.budget.lines.find((x) => x.itemId === 'furn_bed_double')!;
    const price = findPriceItem(getPriceBook(testCatalog, mk(gable).priceBookId), 'mat-furn_bed_double')!;
    expect(l.qty).toBe(2);
    expect(l.stage).toBe('finishing');
    expect(l.unitPrice).toBe(price.price);
    expect(l.material).toBeCloseTo(2 * price.price, 6);
    const q = r.quantities.lines.find((x) => x.itemId === 'furn_bed_double')!;
    expect(q.weightKg).toBeCloseTo(120, 6);
    expect(q.hostIds.sort()).toEqual(['a', 'b']);
  });

  test('sem a flag, móveis não entram no orçamento nem no peso', () => {
    const off = withBudget(false);
    expect(off.budget.lines.some((x) => x.itemId.startsWith('furn_'))).toBe(false);
    const none = run(gable, {});
    expect(off.weight.totalKg).toBeCloseTo(withBudget(true).weight.totalKg, 6);
    expect(off.budget.total).toBeCloseTo(none.budget.total, 6);
  });

  test('pacote do engenheiro: só headroom e escada entram; o resto é layout', () => {
    const layout = run(gable, { furniture: [item('a', 'furn_bed_double', [3, 4]), item('b', 'furn_bed_double', [3.5, 4])] });
    expect(codes(layout)).toContain('furniture.collision');
    const pkg = buildEngineerPackage(mk(gable), layout, testCatalog);
    expect(pkg.attentionPoints.some((p) => p.text.includes('furniture.collision'))).toBe(false);
    expect(pkg.openQuestions.some((q) => q.text.includes('furniture.collision'))).toBe(false);
    const head = run(aframe, { furniture: [item('g', 'furn_wardrobe', [0.45, 4.5], 270)] });
    const pkg2 = buildEngineerPackage(mk(aframe), head, testCatalog);
    expect(pkg2.attentionPoints.some((p) => p.text.includes('furniture.headroom'))).toBe(true);
    expect(pkg2.openQuestions.some((q) => q.text.includes('furniture.headroom'))).toBe(true);
  });
});

describe('ventilação pela área que abre', () => {
  const closed = [wall('w1', [3, 0], [3, 3]), wall('w2', [0, 3], [3, 3])];
  const win = (w: number, h: number) => [{ id: 'j', host: 'ext-front', type: 'window', offset: 0.5, width: w, height: h, sill: 0.9 }];
  const vent = (r: ReturnType<typeof run>) => r.warnings.find((x) => x.code === 'room.ventilation');

  test('vão inteiro passaria em área/12, mas só metade abre: alerta; com vão maior: passa', () => {
    // banheiro de 9 m²: precisa de 0,75 m² que abrem
    const small = run(gable, { walls: closed, openings: win(1.0, 1.0), rooms: [room('b', [1.5, 1.5], 'bathroom')] });
    const b = small.model.rooms.find((x) => x.id === 'b')!;
    expect(b.glazing).toBeCloseTo(1.0, 6); // 1,0 >= 9/12
    expect(vent(small)?.refs).toEqual(['b']); // mas abre 0,50 < 0,75
    expect(vent(small)?.message).toMatch(/0,50 m² de área que abre/);
    const big = run(gable, { walls: closed, openings: win(1.6, 1.0), rooms: [room('b', [1.5, 1.5], 'bathroom')] });
    expect(vent(big)).toBeUndefined(); // abre 0,80 >= 0,75
  });

  test('quarto de 9 m²: janela de 1,5 m² ilumina (1/6) e abre 0,75 (1/12); janela de 1,4 m² falha a iluminação', () => {
    const ok = run(gable, { walls: closed, openings: win(1.5, 1.0), rooms: [room('q', [1.5, 1.5], 'bedroom')] });
    expect(codes(ok).filter((c) => c.startsWith('room.'))).toEqual([]);
    const light = run(gable, { walls: closed, openings: win(1.4, 1.0), rooms: [room('q', [1.5, 1.5], 'bedroom')] });
    expect(codes(light)).toContain('room.lighting');
  });

  test('fachada envidraçada fixa ilumina mas não ventila', () => {
    const r = run(
      { ...aframe, frontGable: 'glazed' },
      { rooms: [room('corpo', [3, 4.5], 'living')] },
    );
    expect(codes(r)).not.toContain('room.lighting');
    const w = vent(r)!;
    expect(w.severity).toBe('warn');
    expect(w.refs).toEqual(['corpo']);
    // sala de 18 m² (partição em y = 3) precisa de 1,5 m² abertos: 3 janelas de 1,0 × 1,5 na fachada de vidro abrem 2,25 m²
    const part = { walls: [wall('w1', [0, 3], [6, 3])], rooms: [room('corpo', [3, 1.5], 'living')] };
    const win2 = [1, 2, 3].map((o) => ({ id: `j${o}`, host: 'ext-front', type: 'window', offset: o, width: 1, height: 1.5, sill: 0.1 }));
    const closed = run({ ...aframe, frontGable: 'glazed' }, part);
    expect(vent(closed)).toBeDefined();
    const ok = run({ ...aframe, frontGable: 'glazed' }, { ...part, openings: win2 });
    expect(vent(ok)).toBeUndefined();
  });
});
