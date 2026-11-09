/** Conteúdos de arquitetura (F17-W1): situação, implantação, plantas, cortes, fachadas, cobertura, quadros. */
import type { RendererRegistry } from '../types';
import { areasRenderer } from './areas';
import { elevationRenderer } from './elevation';
import { implantationRenderer, situationRenderer } from './lot';
import { planRenderer } from './plan';
import { roofRenderer } from './roof';
import { sectionRenderer } from './section';

export const archRenderers: RendererRegistry = {
  situation: situationRenderer,
  implantation: implantationRenderer,
  areas: areasRenderer,
  plan: planRenderer,
  section: sectionRenderer,
  elevation: elevationRenderer,
  roof: roofRenderer,
};

export { fallbackSheets } from './fallback';
export { setbacksOf, rayHit } from './lot';
