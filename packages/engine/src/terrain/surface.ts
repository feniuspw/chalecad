/**
 * Fase 18. Superfície do terreno acabado consultável ponto a ponto, em coordenadas da casa (piso acabado = 0).
 * Usada pelos pilares do deck e por quem precisa da cota do chão fora da malha.
 */
export interface SiteSurface {
  /** Cota do platô da casa em coordenadas do terreno (`TerrainReport.platformZ`); 0 no terreno plano. */
  platformZ: number;
  /** Terreno acabado (platôs, taludes, muros) em coordenadas da casa. */
  groundZ(x: number, y: number): number;
  /** Terreno natural em coordenadas da casa. */
  naturalZ(x: number, y: number): number;
  /** Inclinação do terreno natural (%). */
  slopePct: number;
}

/** O chão em volta do radier fica 3 cm abaixo do piso acabado (convenção da cena, `terrainZOffset`). */
export const GROUND_BELOW_FLOOR = 0.03;

export const flatSurface = (): SiteSurface => ({
  platformZ: 0,
  groundZ: () => -GROUND_BELOW_FLOOR,
  naturalZ: () => -GROUND_BELOW_FLOOR,
  slopePct: 0,
});
