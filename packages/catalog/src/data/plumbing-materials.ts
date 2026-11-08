import type { Material } from '../schema';

/**
 * Materiais hidráulicos do motor F16-E2 (tubos por DN, conexões contadas pelo grafo, registros, caixas e fossa).
 * Preços de referência nov/2026 por unidade de compra: [preço, preço máx?].
 */
function pm(
  id: string,
  name: string,
  baseUnit: Material['baseUnit'],
  label: string,
  size: number,
  massPerUnit: number,
  wastePct: number,
  price: [number, number?],
  integer = true,
): { material: Material; price: [number, number?] } {
  return {
    material: {
      id,
      name,
      category: 'misc',
      baseUnit,
      purchase: { label, size, integer },
      wastePct,
      massPerUnit,
      priceItemId: `mat-${id}`,
      laborIncluded: false,
    },
    price,
  };
}

const defs = [
  // Tubos por DN (m). `pvc_water_25`, `ppr_hot_25`, `pvc_sewer_40` e `pvc_sewer_100` já existem em materials.ts.
  pm('pvc_water_20', 'Tubo PVC soldável água 20 mm', 'm', 'barra 6 m', 6, 0.12, 5, [18, 28]),
  pm('pvc_water_32', 'Tubo PVC soldável água 32 mm', 'm', 'barra 6 m', 6, 0.3, 5, [48, 70]),
  pm('pvc_water_40', 'Tubo PVC soldável água 40 mm', 'm', 'barra 6 m', 6, 0.45, 5, [75, 105]),
  pm('pvc_water_50', 'Tubo PVC soldável água 50 mm', 'm', 'barra 6 m', 6, 0.7, 5, [120, 165]),
  pm('ppr_hot_20', 'Tubo PPR água quente 20 mm', 'm', 'barra 3 m', 3, 0.2, 5, [30, 45]),
  pm('ppr_hot_32', 'Tubo PPR água quente 32 mm', 'm', 'barra 3 m', 3, 0.4, 5, [70, 95]),
  pm('ppr_hot_40', 'Tubo PPR água quente 40 mm', 'm', 'barra 3 m', 3, 0.6, 5, [110, 150]),
  pm('pvc_sewer_50', 'Tubo PVC esgoto 50 mm', 'm', 'barra 6 m', 6, 0.6, 5, [58, 80]),
  pm('pvc_sewer_75', 'Tubo PVC esgoto 75 mm', 'm', 'barra 6 m', 6, 0.9, 5, [85, 115]),
  // Conexões (contadas pelo traçado).
  pm('fit_water_elbow', 'Joelho PVC soldável água', 'un', 'un', 1, 0.03, 0, [3, 7]),
  pm('fit_water_tee', 'Tê PVC soldável água', 'un', 'un', 1, 0.05, 0, [5, 10]),
  pm('fit_hot_elbow', 'Joelho PPR água quente', 'un', 'un', 1, 0.04, 0, [9, 16]),
  pm('fit_hot_tee', 'Tê PPR água quente', 'un', 'un', 1, 0.06, 0, [14, 24]),
  pm('fit_sewer_elbow', 'Joelho PVC esgoto (45° ou 90°)', 'un', 'un', 1, 0.15, 0, [6, 14]),
  pm('fit_sewer_tee', 'Junção ou tê PVC esgoto', 'un', 'un', 1, 0.25, 0, [9, 20]),
  // Registros, caixas e tratamento.
  pm('water_valve_pressure', 'Registro de pressão com acabamento', 'un', 'un', 1, 0.4, 0, [48, 95]),
  pm('grease_trap', 'Caixa de gordura simples (31 L)', 'un', 'un', 1, 2.5, 0, [60, 110]),
  pm('inspection_box', 'Caixa de inspeção 60 x 60 pré-moldada com tampa', 'un', 'un', 1, 30, 0, [60, 120]),
  pm('septic_tank', 'Tanque séptico (fossa) instalado, por m³ útil', 'm3', 'm³', 1, 60, 0, [1300, 1900], false),
  pm('anaerobic_filter', 'Filtro anaeróbio instalado, por m³ útil', 'm3', 'm³', 1, 60, 0, [1100, 1600], false),
];

export const plumbingMaterials: Material[] = defs.map((d) => d.material);
export const plumbingPrices: Record<string, [number, number?]> = Object.fromEntries(defs.map((d) => [d.material.id, d.price]));
