import { describe, expect, test } from 'vitest';
import { buildModel } from '../../../src/model';
import { buildGraph, makeCtx, pointInfos } from '../../../src/installations/electrical';
import { pathStats, runOk } from '../../../src/installations/electrical/conduits';
import { pathEdges } from '../../../src/installations/electrical/graph';
import { ceilingAt } from '../../../src/installations/electrical/loads';
import type { ElecPoint } from '../../../src/schema/project';
import type { ElectricalLayout } from '../../../src/schema/results';
import { testCatalog } from '../../helpers/catalog';
import { house } from './house';

const project = house();
const ctx = makeCtx(project, buildModel(project, testCatalog), testCatalog);
/** Ponto de luz com a caixa no forro (sem descida), a menos que `height` seja dado. */
const pt = (id: string, position: [number, number], height?: number, kind: ElecPoint['kind'] = 'light'): ElecPoint => ({ id, kind, level: 'L0', position, height: height ?? ceilingAt(ctx, 'L0', position), circuitId: 'c' });
const lay = (points: ElecPoint[], conduits: ElectricalLayout['conduits']): ElectricalLayout => ({
  points,
  conduits,
  circuits: [{ id: 'c', name: 'c', kind: 'lighting' }],
  panel: { level: 'L0', position: [1, 1], hostId: null },
});
const graphOf = (l: ElectricalLayout) => buildGraph(ctx, l, pointInfos(ctx, l.points));
const cd = (id: string, path: [number, number][]) => ({ id, level: 'L0', path, run: 'ceiling' as const });

describe('grafo de eletrodutos', () => {
  test('pontas coincidentes a 2 cm viram um nó; a distância pelo quadro soma os trechos', () => {
    const l = lay([pt('a', [1, 4]), pt('b', [4, 4])], [cd('c1', [[1, 1], [1, 4]]), cd('c2', [[1.015, 4], [4, 4]])]);
    const g = graphOf(l);
    const a = g.nodeOfPoint.get('a')!;
    const b = g.nodeOfPoint.get('b')!;
    expect(g.dist[b]! - g.dist[a]!).toBeCloseTo(2.985, 6);
    expect(pathEdges(g, b)).toHaveLength(2);
    // o quadro está a 1,50 m: a descida até o forro conta no primeiro eletroduto
    expect(g.dist[a]!).toBeCloseTo(3 + (ceilingAt(ctx, 'L0', [1, 1]) - 1.5), 6);
  });

  test('pontas a mais de 2 cm não se ligam', () => {
    const l = lay([pt('a', [1, 4]), pt('b', [4, 4])], [cd('c1', [[1, 1], [1, 4]]), cd('c2', [[1.1, 4], [4, 4]])]);
    const g = graphOf(l);
    expect(g.dist[g.nodeOfPoint.get('b')!]).toBe(Infinity);
  });

  test('ponto a até 30 cm da polilinha liga por ramal e divide o eletroduto; a 40 cm não liga', () => {
    const base = [cd('c1', [[1, 1], [1, 6]])];
    const near = graphOf(lay([pt('p', [1.25, 3])], base));
    const n = near.nodeOfPoint.get('p')!;
    expect(near.dist[n]).toBeLessThan(Infinity);
    expect(near.edges.filter((e) => e.conduitId === 'c1')).toHaveLength(2); // dividido no ponto
    expect(near.conduits[0]!.length).toBeGreaterThanOrEqual(5);
    const far = graphOf(lay([pt('p', [1.4, 3])], base));
    expect(far.dist[far.nodeOfPoint.get('p')!]).toBe(Infinity);
  });

  test('descida vertical até a caixa: tomada baixa soma (forro − 0,30 m) ao eletroduto', () => {
    const sock = pt('s', [1, 4], 0.3, 'socket');
    const g = graphOf(lay([sock], [cd('c1', [[1, 1], [1, 4]])]));
    const ceil = pointInfos(ctx, [sock])[0]!.zCeiling;
    const drops = Math.abs(ceil - 1.5) + Math.abs(ceil - 0.3); // quadro e tomada
    expect(g.conduits[0]!.length).toBeCloseTo(3 + drops, 6);
    expect(g.conduits[0]!.bends90).toBe(2);
  });

  test('prumo entre pavimentos: pontas em cotas diferentes no mesmo lugar ligam', () => {
    const p = [pt('g', [1, 4]), { ...pt('m', [2, 4]), level: 'L1' }];
    const l = lay(p, [cd('c1', [[1, 1], [1, 4]]), { id: 'c2', level: 'L1', path: [[1, 4], [2, 4]], run: 'ceiling' as const }]);
    const model = buildModel(project, testCatalog);
    void model;
    const c2 = makeCtx(project, buildModel(project, testCatalog), testCatalog);
    c2.elev.set('L1', 3);
    const g = buildGraph(c2, l, pointInfos(c2, p));
    expect(g.dist[g.nodeOfPoint.get('m')!]).toBeLessThan(Infinity);
  });
});

describe('regra das caixas', () => {
  const k = testCatalog.constants.electrical;
  test('15 m − 3 m por curva, no máximo 3 curvas', () => {
    expect(runOk(k, pathStats([[0, 0], [15, 0]], 0, 0))).toBe(true);
    expect(runOk(k, pathStats([[0, 0], [15.1, 0]], 0, 0))).toBe(false);
    const l1 = pathStats([[0, 0], [10, 0], [10, 2]], 0, 0);
    expect(l1.bends90).toBe(1);
    expect(runOk(k, l1)).toBe(true); // 12 m ≤ 12 m
    expect(runOk(k, pathStats([[0, 0], [10, 0], [10, 3]], 0, 0))).toBe(false); // 13 m > 12 m
    const four = pathStats([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]], 0, 0);
    expect(four.bends90).toBe(4);
    expect(runOk(k, four)).toBe(false);
  });
  test('cada descida na parede conta como uma curva', () => {
    expect(pathStats([[0, 0], [3, 0]], 2, 2)).toMatchObject({ bends90: 2, length: 7 });
  });
});
