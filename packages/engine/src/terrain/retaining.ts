import type { Catalog } from '@chalecad/catalog';

export type RetainingType = 'gabion' | 'concrete' | 'block';

/** Linha de quantidade de um muro de arrimo (sem hospedeiro/etapa: quem chama completa). `kg` só quando difere de net·massa. */
export interface RetainingLine {
  itemId: string;
  net: number;
  kg?: number;
}

/**
 * Tipo `auto` pela altura máxima do trecho: bloco estrutural até `retainingBlockMaxHeight`, concreto armado até
 * `retainingConcreteMaxHeight` e gabião acima.
 */
export function autoRetainingType(maxHeight: number, catalog: Catalog): RetainingType {
  const tr = catalog.constants.terrainRules;
  if (maxHeight <= tr.retainingBlockMaxHeight + 1e-9) return 'block';
  if (maxHeight <= tr.retainingConcreteMaxHeight + 1e-9) return 'concrete';
  return 'gabion';
}

/**
 * Quantidades de um muro de arrimo de `length` m e área de face `area` m² (∫ h ds; = length·h para altura constante).
 * Usada pelo `RetainingExtra` (altura única) e pelos muros do terreno (altura variável). A altura média é area/length.
 * Em altura constante as fórmulas são as de sempre: gabião L·H·(b + k·H); concreto L·(H·esp + sapata) com 80 kg/m³ de aço;
 * bloco estrutural com graute dobrado e sapata corrida; drenagem = geotêxtil (H + 0,5 m) e tubo.
 */
export function retainingItems(
  length: number,
  area: number,
  type: RetainingType,
  drainage: boolean,
  catalog: Catalog,
): RetainingLine[] {
  const c = catalog.constants;
  const R = c.retaining;
  const mas = c.masonry;
  const X = c.extras;
  const out: RetainingLine[] = [];
  const add = (itemId: string, net: number, kg?: number) => {
    if (net > 0) out.push(kg === undefined ? { itemId, net } : { itemId, net, kg });
  };
  const h = length > 0 ? area / length : 0;
  if (type === 'gabion') {
    add('gabion', area * (R.gabionBase + R.gabionBasePerHeight * h));
  } else if (type === 'concrete') {
    const vol = area * R.concreteStem + length * R.footing.width * R.footing.depth;
    add('concrete_fck25', vol, vol * c.concreteDensity);
    add('rebar_ca50', vol * R.steelKgPerM3);
  } else {
    // Bloco estruturado com graute em todos os furos (graute dobrado) e sapata corrida.
    add('block_structural', area * mas.blocksPerM2);
    add('grout', area * mas.groutM3PerM2 * 2);
    add('rebar_ca50', area * mas.rebarKgPerM2);
    add('mortar', area * X.mortarM3PerM2 * X.mortarDensity);
    const section = mas.stripFootingWidth * mas.stripFootingDepth;
    add('concrete_fck25', length * section, length * section * c.concreteDensity);
    add('rebar_ca50', length * X.footingSteelKgPerM);
  }
  if (drainage) {
    add('geotextile', area + length * R.geotextileExtraHeight);
    add('drain_pipe', length);
  }
  return out;
}
