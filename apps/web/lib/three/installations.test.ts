import { describe, expect, it } from 'vitest';
import { circuitRows, installationRoutes, pipeTotals, placePoint, summarizePoints, wireTotals } from './installations';
import { handModel, handReport } from './installations.fixture';
import { installationsCost } from '../../components/results/InstallationsTab';
import { buildInstallationsPdf } from '../pdf/data';

describe('instalações (dados puros)', () => {
  it('linhas da tabela de circuitos', () => {
    const rows = circuitRows(handReport);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ n: 1, kind: 'Iluminação', points: 3, powerVA: 220, wire: 1.5, breaker: 10 });
    expect(rows[2]).toMatchObject({ wire: 6, breaker: 32 });
  });

  it('totais de cabo por bitola e tubos', () => {
    expect(wireTotals(handReport)).toEqual([
      { wire: 1.5, length: 24.5 },
      { wire: 2.5, length: 18 },
      { wire: 6, length: 12 },
    ]);
    expect(pipeTotals(handReport).map((p) => p.length)).toEqual([14.2, 6.1, 5, 7.5]);
  });

  it('resumo por tipo', () => {
    const s = Object.fromEntries(summarizePoints(handReport.points).map((g) => [g.id, g.count]));
    expect(s).toMatchObject({ outlets: 2, tue: 1, switches: 1, lights: 2, water: 2, sewer: 2 });
  });

  it('custo da etapa instalações vem do orçamento', () => {
    expect(installationsCost({ budget: { byStage: [] } } as never)).toBeNull();
    const c = installationsCost({ budget: { byStage: [{ stage: 'installations', material: 100, labor: 40 }] } } as never);
    expect(c).toEqual({ material: 100, labor: 40, total: 140 });
  });

  it('posiciona o ponto na face da parede', () => {
    const wall = { id: 'w', from: [0, 0] as [number, number], to: [4, 0] as [number, number], length: 4 };
    const front = placePoint({ ...handReport.points[4]!, hostId: 'w', position: [2, -0.1] }, [wall], 0);
    expect(front.yaw).toBeCloseTo(-Math.PI / 2);
    const back = placePoint({ ...handReport.points[4]!, hostId: 'w', position: [2, 0.1] }, [wall], 1);
    expect(back.yaw).toBeCloseTo(Math.PI / 2);
    expect(back.position[2]).toBeCloseTo(1.3);
    expect(handModel.walls.length).toBeGreaterThan(0);
  });

  it('traçado: um trecho em L por ponto de circuito e por ponto de água', () => {
    const routes = installationRoutes(handReport, {});
    expect(routes.filter((r) => r.system === 'electric')).toHaveLength(6);
    expect(routes.filter((r) => r.system === 'cold')).toHaveLength(1);
    expect(routes.filter((r) => r.system === 'hot')).toHaveLength(1);
  });

  it('seção do PDF usa o relatório e some sem ele', () => {
    const none = buildInstallationsPdf({ installations: null } as never);
    expect(none).toBeNull();
    const pdf = buildInstallationsPdf({ installations: handReport, budget: { byStage: [{ stage: 'installations', material: 100, labor: 40 }] } } as never)!;
    expect(pdf.circuits).toHaveLength(3);
    expect(pdf.circuits[0]!.power).toContain('220');
    expect(pdf.totals.map((t) => t.label)).toContain('Eletroduto');
    expect(pdf.cost).toHaveLength(3);
    expect(pdf.notice).toContain('NBR 5410');
  });
});
