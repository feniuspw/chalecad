/** Corte A (transversal) e B (longitudinal) em mm de papel (conteúdo `section`). */
import { sectionSvg } from '../../plan2d/section';
import type { ContentRenderer } from '../types';
import { LEGEND, mmPerM, safeId } from './common';

export const sectionRenderer: ContentRenderer = (ctx, content, scale) => {
  const axis = content.target === 'B' ? 'B' : 'A';
  const assembly = ctx.catalog.assemblies.find((a) => a.id === `roof_${ctx.project.roof.cladding}`);
  const t = assembly?.layers[0]?.thickness;
  const levelNames = Object.fromEntries(ctx.project.levels.map((l) => [l.id, l.name ?? l.id]));
  const doc = sectionSvg(ctx.results.model, axis, undefined, {
    paper: true,
    unitsPerMeter: mmPerM(scale),
    idPrefix: safeId('section', axis),
    site: ctx.project.site,
    platformZ: ctx.results.terrain?.platformZ,
    terrain: ctx.results.terrain,
    roofThickness: t ? t / 1000 : undefined,
    levelNames,
  });
  return {
    body: doc.body,
    defs: doc.defs,
    width: doc.width,
    height: doc.height,
    scale,
    title: content.title,
    legend: [LEGEND.cutWall(), LEGEND.level()],
    notes: [axis === 'A' ? 'Corte A transversal, no meio da profundidade; vista para os fundos.' : 'Corte B longitudinal, pela escada e áreas molhadas quando houver; vista para a esquerda.', 'Cotas e níveis em metros.'],
  };
};
