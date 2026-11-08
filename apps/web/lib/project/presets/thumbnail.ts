/** Miniatura SVG do modelo pronto: fachada frontal gerada pela geometria do motor (`lib/plan2d`, só leitura), sem cotas nem textos. */
import { buildModel, type Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { elevationSvg } from '../../plan2d';

/** Margens do desenho em `elevationSvg` (esquerda, direita, topo, base), em unidades do SVG. */
const MARGIN = { l: 110, r: 100, t: 70, b: 140 } as const;
/** Proporção (largura / altura) do quadro da miniatura. */
export const THUMB_ASPECT = 1.5;

/** Tira títulos, cotas, marcas de nível, escala e o fundo branco: sobra só o desenho da fachada. */
export function stripAnnotations(svg: string): string {
  return svg
    .replace(/<g data-role="(?:level-mark|dim-outer|scale-bar)"[^>]*>[\s\S]*?<\/g>/g, '')
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, '')
    .replace(/<rect x="0" y="0" width="[^"]*" height="[^"]*" fill="#ffffff"\/>/, '');
}

/** Recorta o SVG da fachada ao desenho, no quadro `aspect` (sem faixas vazias nem legendas), e o deixa responsivo. */
export function cropElevation(doc: { svg: string; width: number; height: number }, aspect = THUMB_ASPECT): string {
  let w = doc.width - MARGIN.l - MARGIN.r + 28;
  let h = doc.height - MARGIN.t - MARGIN.b + 22;
  let x = MARGIN.l - 14;
  let y = MARGIN.t - 8;
  if (w / h < aspect) {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  }
  const r = (n: number) => Math.round(n * 10) / 10;
  return stripAnnotations(doc.svg).replace(/^<svg([^>]*)>/, (_m, attrs: string) => {
    const rest = attrs.replace(/\s(viewBox|width|height)="[^"]*"/g, '');
    return `<svg${rest} viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Fachada do modelo">`;
  });
}

export function presetThumbnailSvg(project: Project): string {
  const model = buildModel(project, getCatalog());
  return cropElevation(elevationSvg(model, 'front', { idPrefix: 'thumb' }));
}
