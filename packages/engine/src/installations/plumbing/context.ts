import type { Catalog, TechnicalConstants } from '@chalecad/catalog';
import type { Project } from '../../schema/project';
import type { BuildingModel } from '../../schema/results';

export type PlumbingK = TechnicalConstants['plumbing'];
export type FixtureSpec = PlumbingK['water']['fixtures'][string];

export interface Ctx {
  project: Project;
  model: BuildingModel;
  catalog: Catalog;
  k: PlumbingK;
  /** Cota do piso do nível (m). */
  elev: (levelId: string) => number;
}

export function makeCtx(project: Project, model: BuildingModel, catalog: Catalog): Ctx {
  const levels = new Map(project.levels.map((l) => [l.id, l.elevation]));
  return { project, model, catalog, k: catalog.constants.plumbing, elev: (id) => levels.get(id) ?? 0 };
}

/**
 * Premissas ainda fora do contrato de catálogo (`catalog.constants.plumbing`); ver o relatório do card F16-E2.
 * Cada uma cita a base em `docs/research/hidraulica.md`.
 */
export const LOCAL = {
  /** Tolerância de coincidência das pontas dos tubos (m), pelo card. */
  tol: 0.02,
  /** Altura do registro de gaveta do ambiente (m do piso), seção 1.7. */
  registerHeight: 1.2,
  /** Barrilete logo abaixo do fundo da caixa (m), seção 9 (barrilete a ~0,10 m do fundo). */
  barreleDrop: 0.1,
  /** Perda interna do aquecedor a gás (m.c.a.), seção 10.3 item 10 [incerto]; solar (boiler por gravidade). */
  heaterLossMca: { gas: 2, solar: 0.5 },
  /** Pressão mínima na entrada do aquecedor a gás (m.c.a.), seção 1.10. */
  gasHeaterMinMca: 2,
  /** Diâmetro do ramal de ventilação de grupo com bacia até 17 UHC e acima disso (NBR 8160 Tab. 9). */
  ventDn: { small: 50, large: 75, splitUhc: 17 },
  /** Sem telhado sob o ventilador: sobe esta altura acima do teto do cômodo (m). */
  ventFallbackRise: 0.6,
  /** Aparelhos de bancada/serviço que recebem registro de gaveta no sub-ramal (prática de apostilas, seção 9, Ex. 2). */
  gateOnBranch: new Set(['kitchen_sink', 'laundry_tub', 'washing_machine']),
  /** Folga das ramais de esgoto no forro do pavimento superior abaixo do piso (m). */
  upperBranchMargin: 0.15,
  /** Filtro anaeróbio NBR 13969: Vu = 1,6·N·C·T com mínimo de 1.000 L. */
  filter: { factor: 1.6, minLiters: 1000 },
  /** Distância mínima de um tubo gerado (m); abaixo disso a ligação é coincidente. */
  minPipe: 0.05,
  /** Saída do esgoto: comprimento mínimo do trecho final fora do radier (m). */
  exitMin: 0.5,
};
