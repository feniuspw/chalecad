/** Relatório de desempenho montado à mão, só para testes (o motor F9-E1 produz o real). */
import type { PerformanceReport } from '@chalecad/engine';

export const handPerformance: PerformanceReport = {
  zone: 3,
  zoneSource: 'uf',
  thermal: [
    { id: 'ext_cement_osb_wool_drywall', kind: 'wall', label: 'Parede externa', U: 1.1, CT: 160, alpha: 0.4, limitU: 3.7, limitCT: 130, okU: true, okCT: true },
    { id: 'roof', kind: 'roof', label: 'Cobertura', U: 2.6, CT: 8, alpha: 0.8, limitU: 1.5, limitCT: null, okU: false, okCT: true },
  ],
  solar: {
    monthlyKWh: 330,
    kWp: 3.3,
    modules: 6,
    areaM2: 15.5,
    roofPlaneId: 'roof-0',
    fits: true,
    annualKWh: 4600,
    cost: 14000,
    costMax: 17000,
    savingsPerYear: 3900,
    paybackYears: 3.8,
  },
  rain: { roofAreaM2: 60, annualLiters: 70000, demandLitersYear: 60000, tankLiters: 5000, coverage: 0.62 },
};
