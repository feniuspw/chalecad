import { group, line, rect, tag, text, type Attrs } from '../plan2d/svg';

export const lineSvg = line;
export const rectSvg = rect;
export const textSvg = text;
export const groupSvg = group;
export const circleSvg = (cx: number, cy: number, r: number, a: Attrs = {}) => tag('circle', { cx, cy, r, ...a });
