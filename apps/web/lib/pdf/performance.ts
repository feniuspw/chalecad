/** Seção "Desempenho" do PDF: tabela térmica e resumos de solar e chuva. Função pura. */
import type { PerformanceReport } from '@chalecad/engine';
import { STATUS_LABEL, THERMAL_NOTICE, coveragePct, elementStatus } from '../three/performance';
import { brl, num } from './format';

export interface PerformancePdf {
  zone: string;
  thermal: { element: string; u: string; limitU: string; ct: string; limitCT: string; status: string; fail: boolean }[];
  solar: { label: string; value: string }[] | null;
  rain: { label: string; value: string }[] | null;
  notice: string;
}

export function buildPerformancePdf(report: PerformanceReport | null | undefined): PerformancePdf | null {
  if (!report || report.thermal.length === 0) return null;
  const { solar, rain } = report;
  return {
    zone: `Zona bioclimática ${report.zone} (${report.zoneSource === 'project' ? 'escolhida no projeto' : 'da capital do estado'})`,
    thermal: report.thermal.map((e) => {
      const st = elementStatus(e);
      return {
        element: e.label,
        u: `${num(e.U, 2)} W/m²K`,
        limitU: `≤ ${num(e.limitU, 2)}`,
        ct: `${num(e.CT, 0)} kJ/m²K`,
        limitCT: e.limitCT === null ? 'sem exigência' : `≥ ${num(e.limitCT, 0)}`,
        status: STATUS_LABEL[st],
        fail: st === 'fail',
      };
    }),
    solar: solar
      ? [
          { label: 'Consumo estimado', value: `${num(solar.monthlyKWh, 0)} kWh/mês` },
          { label: 'Potência', value: `${num(solar.kWp, 2)} kWp (${solar.modules} módulos, ${num(solar.areaM2, 1)} m²)` },
          { label: 'Cabe no telhado', value: solar.fits ? 'Sim' : 'Não: parte dos módulos fica de fora' },
          { label: 'Geração anual', value: `${num(solar.annualKWh, 0)} kWh` },
          { label: 'Custo estimado', value: `${brl(solar.cost, 0)} a ${brl(solar.costMax, 0)}` },
          { label: 'Economia por ano', value: brl(solar.savingsPerYear, 0) },
          { label: 'Retorno', value: `${num(solar.paybackYears, 1)} anos` },
        ]
      : null,
    rain: rain
      ? [
          { label: 'Área de captação', value: `${num(rain.roofAreaM2, 1)} m²` },
          { label: 'Chuva captada', value: `${num(rain.annualLiters, 0)} L/ano` },
          { label: 'Demanda não potável', value: `${num(rain.demandLitersYear, 0)} L/ano` },
          { label: 'Reservatório', value: `${num(rain.tankLiters, 0)} L` },
          { label: 'Demanda atendida', value: coveragePct(rain) },
        ]
      : null,
    notice: THERMAL_NOTICE,
  };
}
