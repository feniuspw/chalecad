/** Relatório de instalações montado à mão, só para testes (o motor F7-E1 produz o real). */
import { getCatalog } from '@chalecad/catalog';
import { computeAll, type InstallationPoint, type InstallationPointKind, type InstallationsReport } from '@chalecad/engine';
import { createProject } from '../project/templates';

export const handProject = createProject('gable_mezzanine', { name: 'Chalé de teste' });
export const handResults = computeAll(handProject, getCatalog());
export const handModel = handResults.model;
export const handLevel = handModel.walls[0]?.level ?? 'L0';

const P = (id: string, kind: InstallationPointKind, position: [number, number], height: number, circuitId: string | null, hostId: string | null = null): InstallationPoint => ({
  id,
  kind,
  level: handLevel,
  position,
  height,
  roomId: null,
  hostId,
  furnitureId: null,
  circuitId,
  label: `${kind} ${id}`,
});

export const handReport: InstallationsReport = {
  points: [
    P('q1', 'panel', [0.5, 0.5], 1.4, null),
    P('l1', 'light', [2, 2], 2.5, 'c1'),
    P('l2', 'light', [4, 2], 2.5, 'c1'),
    P('s1', 'switch', [1, 1], 1.1, 'c1'),
    P('t1', 'outlet', [3, 0.2], 0.3, 'c2'),
    P('t2', 'outlet_high', [3.5, 0.2], 1.1, 'c2'),
    P('u1', 'tue', [5, 0.2], 2.1, 'c3'),
    P('a1', 'water_cold', [1, 3], 0.6, null),
    P('a2', 'water_hot', [1.2, 3], 1.1, null),
    P('e1', 'sewer', [1, 3.5], 0, null),
    P('d1', 'drain', [1.5, 3.5], 0, null),
    P('cx', 'tank', [3, 3], 3.2, null),
  ],
  circuits: [
    { id: 'c1', kind: 'lighting', label: 'Iluminação', points: 3, power: 220, wire: 1.5, breaker: 10, cableLength: 24.5 },
    { id: 'c2', kind: 'outlets', label: 'Tomadas gerais', points: 2, power: 200, wire: 2.5, breaker: 16, cableLength: 18 },
    { id: 'c3', kind: 'tue', label: 'Chuveiro', points: 1, power: 5500, wire: 6, breaker: 32, cableLength: 12 },
  ],
  panel: { level: handLevel, position: [0.5, 0.5] },
  demandKw: 4.2,
  voltage: 220,
  tankLiters: 500,
  dailyLiters: 600,
  occupants: 4,
  pipes: { cold: 14.2, hot: 6.1, sewer40: 5, sewer100: 7.5 },
  conduit: 42,
};
