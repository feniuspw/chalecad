import { getMaterial, type Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { BuildingModel } from '../schema/results';
import type { Item } from '../quantities/items';
import { paginateSheets } from '../quantities/paginate';
import { waterTowerItems } from './water_tower_quantities';
import {
  deckGeometry,
  fencePosts,
  pathLength,
  pathSegments,
  segLen,
} from './geometry';

export { buildExtraModels, deckGeometry, fencePosts, facade } from './geometry';
export { attachDeckFrames } from './deckFrame';
export { towerProfileLines } from './water_tower_quantities';
export { waterTowerModel, towerTankFullKg, tankDimensions, towerLiters, towerContour } from './water_tower';
export type { ExtraBuildContext, WaterTowerE } from './water_tower';

const rect = (l: number, h: number): [number, number][] => [[0, 0], [l, 0], [l, h], [0, h]];

/** Linhas de quantidade (estágio `extras`) de muro, cerca, deck e arrimo. Não entram no peso do edifício. */
export function computeExtras(project: Project, model: BuildingModel, catalog: Catalog): Item[] {
  const out: Item[] = [];
  const c = catalog.constants;
  const mas = c.masonry;
  const X = c.extras;
  const RETAINING = c.retaining;

  const add = (hostId: string, itemId: string, net: number, extra: Partial<Item> = {}): void => {
    if (!(net > 0)) return;
    const m = getMaterial(catalog, itemId);
    out.push({ hostId, stage: 'extras', itemId, net, kg: net * m.massPerUnit, inWeight: false, ...extra });
  };

  /** Alvenaria de blocos + sapata/baldrame sob `length` metros de muro com `height` m de altura. */
  const masonry = (
    hostId: string,
    length: number,
    height: number,
    structural: boolean,
    foundation: 'strip' | 'grade_beam',
  ): void => {
    const area = length * height;
    add(hostId, structural ? 'block_structural' : 'block_concrete', area * mas.blocksPerM2);
    add(hostId, 'grout', area * mas.groutM3PerM2 * (structural ? 2 : 1));
    add(hostId, 'rebar_ca50', area * mas.rebarKgPerM2);
    add(hostId, 'mortar', area * X.mortarM3PerM2 * X.mortarDensity);
    const section =
      foundation === 'strip'
        ? mas.stripFootingWidth * mas.stripFootingDepth
        : X.gradeBeam.width * X.gradeBeam.depth;
    add(hostId, 'concrete_fck25', length * section, { kg: length * section * c.concreteDensity });
    add(hostId, 'rebar_ca50', length * X.footingSteelKgPerM);
  };

  for (const e of project.extras) {
    if (e.kind === 'wall') {
      const length = pathLength(e.path, e.closed);
      if (e.system === 'lsf_board') {
        // Estrutura LSF: peças em generatePieces (framing/extras). Aqui: placas cimentícias nas duas faces e fundação.
        let pages = 0;
        for (const [a, b] of pathSegments(e.path, e.closed)) {
          const m = getMaterial(catalog, 'cement_board_10');
          const sh = m.purchase.sheet!;
          pages += paginateSheets(rect(segLen(a, b), e.height), [], sh.width, sh.height) * 2;
        }
        add(e.id, 'cement_board_10', length * e.height * 2, { pages });
        const section =
          e.foundation === 'strip'
            ? mas.stripFootingWidth * mas.stripFootingDepth
            : X.gradeBeam.width * X.gradeBeam.depth;
        add(e.id, 'concrete_fck25', length * section, { kg: length * section * c.concreteDensity });
        add(e.id, 'rebar_ca50', length * X.footingSteelKgPerM);
      } else {
        masonry(e.id, length, e.height, e.system === 'structural_block', e.foundation);
      }
    } else if (e.kind === 'fence') {
      const length = pathLength(e.path, e.closed);
      add(e.id, `post_${e.postType}`, fencePosts(e).length);
      if (e.mesh === 'barbed') add(e.id, 'barbed_wire', length * X.barbedStrands);
      else add(e.id, e.mesh === 'welded' ? 'fence_welded' : 'fence_chain', length);
      if (e.baseWallHeight > 0) masonry(e.id, length, e.baseWallHeight, false, 'strip');
    } else if (e.kind === 'deck') {
      const em = model.extras.find((x) => x.id === e.id);
      const g = deckGeometry(project, e);
      const area = g.length * e.depth;
      add(e.id, 'deck_wood', area);
      add(e.id, 'deck_frame', area);
      if (e.guardrail) {
        const rails = em
          ? em.segments.filter((s) => s.material === 'rail').reduce((s, x) => s + segLen(x.from, x.to), 0)
          : g.rails.reduce((s, [a, b]) => s + segLen(a, b), 0);
        add(e.id, 'guardrail', rails);
      }
      const roof = em?.roof;
      if (e.covered && roof) {
        const clad = getMaterial(catalog, project.roof.cladding);
        const tiles = Math.ceil(roof.uLength / c.roof.sandwichUsefulWidth - 1e-9);
        add(e.id, clad.id, roof.area, {
          directPurchase: tiles * roof.vLength,
          note: `${tiles} telhas de ${roof.vLength.toFixed(2).replace('.', ',')} m (deck ${e.id})`,
        });
        add(e.id, 'screw_roof', roof.area * c.roof.screwsPerM2);
        add(e.id, 'flashing', roof.uLength, { unitSize: c.roof.flashingLength });
        if (project.roof.gutters) add(e.id, 'gutter', roof.uLength, { unitSize: c.roof.gutterLength });
        add(e.id, 'post_steel', em.posts.length);
      }
    }
    else if (e.kind === 'water_tower') {
      const em = model.extras.find((x) => x.id === e.id);
      if (em?.roofs) waterTowerItems(project, model, e, em, catalog, add);
    }
    else if (e.kind === 'retaining') {
      const length = pathLength(e.path, false);
      const h = e.height;
      if (e.type === 'gabion') {
        add(e.id, 'gabion', length * h * (RETAINING.gabionBase + RETAINING.gabionBasePerHeight * h));
      } else if (e.type === 'concrete') {
        const vol = length * (h * RETAINING.concreteStem + RETAINING.footing.width * RETAINING.footing.depth);
        add(e.id, 'concrete_fck25', vol, { kg: vol * c.concreteDensity });
        add(e.id, 'rebar_ca50', vol * RETAINING.steelKgPerM3);
      } else {
        // Bloco estruturado com graute em todos os furos (graute dobrado) e sapata corrida.
        masonry(e.id, length, h, true, 'strip');
      }
      if (e.drainage) {
        add(e.id, 'geotextile', length * (h + RETAINING.geotextileExtraHeight));
        add(e.id, 'drain_pipe', length);
      }
    }
  }
  return out;
}
