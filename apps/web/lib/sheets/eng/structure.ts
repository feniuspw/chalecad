/** Conteúdos de estrutura: fundação, planta de painéis, painéis de parede, cobertura e notas gerais (F17-W2). */
import { DISCLAIMER, type HostWall, type Piece, type PieceRole, type Vec2 } from '@chalecad/engine';
import { isVertical } from '../../plumb/geometry';
import { fmt } from '../../project/format';
import type { ContentRenderer, SheetContext } from '../types';
import {
  FONT, GREY, INK, LIGHT, TXT, W, arrow, bounds, ci, dimAligned, dimH, dimV, g, groundElevation, legendItem, ln, m2, makeFrame, normList, normRef, offsetPolygon, pgon, pline, rc, rendered,
  resolveLevel, spacingOf, table, tx, wallCodes, wallFrame, wallPolygon, wallsAtLevel, wrap,
} from './kit';

const STUD_ROLES: PieceRole[] = ['stud', 'stud_corner', 'king', 'jack'];

const GROUPS: { label: string; roles: PieceRole[] }[] = [
  { label: 'Montantes', roles: ['stud', 'stud_corner', 'king', 'jack', 'cripple'] },
  { label: 'Guias', roles: ['track_bottom', 'track_top'] },
  { label: 'Vergas e peitoris', roles: ['header', 'sill'] },
  { label: 'Bloqueadores', roles: ['blocking'] },
  { label: 'Fitas de contraventamento', roles: ['strap'] },
  { label: 'Vigas de piso e bordas', roles: ['joist', 'rim'] },
  { label: 'Caibros', roles: ['rafter'] },
  { label: 'Terças', roles: ['purlin'] },
  { label: 'Cumeeira', roles: ['ridge'] },
  { label: 'Linhas (tirantes)', roles: ['collar_tie'] },
  { label: 'Longarinas de escada', roles: ['stair_stringer'] },
];

/** Perfis por elemento, em linhas de texto: "Montantes: Ue90x40x0.95 (141 pç)". */
export function profileLines(pieces: Piece[]): string[] {
  const out: string[] = [];
  for (const gr of GROUPS) {
    const by = new Map<string, number>();
    for (const p of pieces) if (gr.roles.includes(p.role)) by.set(p.profileId, (by.get(p.profileId) ?? 0) + 1);
    if (by.size === 0) continue;
    out.push(`${gr.label}: ${[...by.entries()].map(([id, n]) => `${id} (${n} pç)`).join(', ')}`);
  }
  return out;
}

const piecesOf = (ctx: SheetContext, host: string, roles?: PieceRole[]) => ctx.results.pieces.filter((p) => p.hostId === host && (!roles || roles.includes(p.role)));

function levelOrder(ctx: SheetContext) {
  const el = new Map(ctx.project.levels.map((l) => [l.id, l.elevation]));
  return (id: string) => el.get(id) ?? 0;
}

// ---------------------------------------------------------------------------
// Fundação
// ---------------------------------------------------------------------------

const SOIL_SOURCE = { assumed: 'valor assumido, sem sondagem', spt: 'sondagem SPT', other: 'outra fonte' } as const;

export const renderFoundation: ContentRenderer = (ctx, content, scale) => {
  const { results, project, catalog } = ctx;
  const radier = results.model.slabs.find((s) => s.kind === 'radier');
  if (!radier || radier.polygon.length < 3) return null;
  const sc = scale || 50;
  const k = catalog.constants;
  const fnd = project.system.foundation;
  const poly = radier.polygon;
  const f = makeFrame(poly, sc, { l: 24, t: 14, r: 10, b: 26 });
  const P = f.P;
  const out: string[] = [];

  // Paredes do térreo (referência) e contorno do radier.
  const ground = groundElevation(ctx);
  const gWalls = results.model.walls.filter((w) => w.level && Math.abs(w.baseZ - ground) < 1e-6);
  out.push(g(gWalls.map((w) => pgon(wallPolygon(w).map(P), W.thin, { stroke: GREY })).join(''), { 'data-role': 'walls-ref' }));
  out.push(pgon(poly.map(P), W.main, { 'data-role': 'radier' }));

  // Viga de borda (tracejada).
  const bw = k.radier.edgeBeamWidth;
  const inner = offsetPolygon(poly, bw);
  out.push(pgon(inner.map(P), W.sec, { 'stroke-dasharray': '3 1.5', 'data-role': 'edge-beam' }));

  // Chumbadores: ao longo das guias inferiores do térreo, nas pontas dos painéis e a cada anchorSpacing.
  const spacing = k.lsf.anchorSpacing;
  const anchors: Vec2[] = [];
  const seen = new Set<string>();
  const addAnchor = (x: number, y: number) => {
    const key = `${Math.round(x * 20)}:${Math.round(y * 20)}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push([x, y]);
  };
  const groundIds = new Set(gWalls.map((w) => w.id));
  for (const p of results.pieces) {
    if (p.role !== 'track_bottom' || !groundIds.has(p.hostId) || Math.abs(p.start[2] - ground) > 0.05) continue;
    const n = Math.max(1, Math.ceil(p.length / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // recua 5 cm nas pontas para o furo não cair na emenda
      addAnchor(p.start[0] + (p.end[0] - p.start[0]) * t, p.start[1] + (p.end[1] - p.start[1]) * t);
    }
  }
  out.push(
    g(
      anchors
        .map((a) => {
          const [x, y] = P(a);
          return ci(x, y, 0.9, W.sec, { fill: '#fff' }) + ln(x - 0.9, y, x + 0.9, y, W.thin) + ln(x, y - 0.9, x, y + 0.9, W.thin);
        })
        .join(''),
      { 'data-role': 'anchors', 'data-count': anchors.length },
    ),
  );

  // Esperas de água e esgoto (pontos da hidráulica no térreo).
  const pl = results.installations?.plumbing;
  const spots: string[] = [];
  let spotCount = 0;
  if (pl) {
    const kp = k.plumbing;
    const groundLevels = new Set(project.levels.filter((l) => Math.abs(l.elevation - ground) < 1e-6).map((l) => l.id));
    const labelAt = (x: number, y: number, s: string) => tx(x + 2, y + 3.4, s, { anchor: 'start', halo: true });
    for (const pt of pl.layout.points.filter((p) => groundLevels.has(p.level))) {
      const spec = kp.water.fixtures[pt.fixture];
      const [x, y] = P(pt.position);
      if (spec && spec.q > 0) {
        spots.push(ci(x - 2.6, y, 1.1, W.sec, { stroke: '#1E88E5', fill: '#fff' }) + tx(x - 4.4, y + 0.9, 'AF', { anchor: 'end', halo: true }));
        spotCount++;
      }
      if (spec && (spec.sewerDn ?? 0) > 0) {
        spots.push(rc(x - 1.2, y - 1.2, 2.4, 2.4, W.sec, { stroke: '#6D4C41', fill: '#fff' }) + labelAt(x, y, `ES Ø${spec.sewerDn}`));
        spotCount++;
      }
    }
    const sewerDn = new Map(pl.sewer.pipes.map((p) => [p.pipeId, p.dn]));
    for (const p of pl.layout.pipes.filter((q) => q.system === 'sewer')) {
      const path = p.path as [number, number, number][];
      if (isVertical(path)) {
        const [x, y] = P([path[0]![0], path[0]![1]]);
        spots.push(ci(x, y, 1.6, W.sec, { stroke: '#6D4C41', fill: '#fff' }) + ci(x, y, 0.6, W.sec, { stroke: '#6D4C41', fill: '#6D4C41' }) + tx(x + 2.4, y + 3.4, `TQ Ø${sewerDn.get(p.id) ?? 100}`, { anchor: 'start', halo: true }));
        spotCount++;
      }
    }
    const outlets = pl.layout.pipes.filter((q) => q.system === 'sewer' && groundLevels.has(q.level) && !isVertical(q.path as [number, number, number][]));
    const starts = new Set(outlets.map((q) => `${Math.round(q.path[0]![0] * 50)}:${Math.round(q.path[0]![1] * 50)}`));
    const exit = outlets.find((q) => !starts.has(`${Math.round(q.path[q.path.length - 1]![0] * 50)}:${Math.round(q.path[q.path.length - 1]![1] * 50)}`));
    if (exit) {
      const e = exit.path[exit.path.length - 1]!;
      const [x, y] = P([e[0], e[1]]);
      spots.push(rc(x - 1.6, y - 1.6, 3.2, 3.2, W.sec, { stroke: '#6D4C41', fill: '#6D4C41' }) + tx(x + 2.4, y + 3.4, `Saída esgoto Ø${sewerDn.get(exit.id) ?? 100}`, { anchor: 'start', halo: true }));
      spotCount++;
    }
  }
  out.push(g(spots.join(''), { 'data-role': 'sleeves', 'data-count': spotCount }));

  // Cotas: totais e, em contornos não retangulares, cada lado.
  const bb = bounds(poly.map(P));
  const wM = f.maxX - f.minX;
  const hM = f.maxY - f.minY;
  out.push(dimH(bb.minX, bb.maxX, bb.maxY + 9, m2(wM), bb.maxY));
  out.push(dimV(bb.minY, bb.maxY, bb.minX - 9, m2(hM), bb.minX));
  if (poly.length > 4) {
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l * f.k < 14) return;
      const [x1, y1] = P(a);
      const [x2, y2] = P(b);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      out.push(tx(cx, cy - 1.2, m2(l), { rotate: ang > 90 || ang < -90 ? ang + 180 : ang, halo: true }));
    });
  }
  out.push(tx(bb.minX + (bb.maxX - bb.minX) / 2, f.top - 6, `RADIER e = ${fmt(radier.thickness * 100, 0)} cm · ${fmt(radier.area, 2)} m²`, { bold: true }));

  // Detalhe A (corte da viga de borda) à direita da planta, 1:10.
  const dx = bb.maxX + 22;
  const dy = f.top + 6;
  const kd = 100; // mm por metro (1:10)
  const t = radier.thickness;
  const depth = Math.max(fnd.edgeBeamDepth, t);
  const slabLen = 0.5;
  const x0 = dx + 14;
  const yTop = dy + 6;
  const det: string[] = [];
  det.push(tx(dx, dy - 4, 'DETALHE A — VIGA DE BORDA (esc. 1:10)', { anchor: 'start', bold: true }));
  // lastro de brita e lona
  const gr = k.radier.gravelThickness;
  const yb = yTop + depth * kd;
  det.push(rc(x0 - 6, yb, (bw + slabLen) * kd + 12, gr * kd, W.sec, { 'stroke-dasharray': '1 1', fill: 'none' }));
  det.push(tx(x0 + (bw + slabLen) * kd + 8, yb + gr * kd * 0.5 + 1, `brita ${fmt(gr * 100, 0)} cm`, { anchor: 'start' }));
  // concreto
  det.push(
    pgon(
      [
        [x0, yTop],
        [x0 + (bw + slabLen) * kd, yTop],
        [x0 + (bw + slabLen) * kd, yTop + t * kd],
        [x0 + bw * kd, yTop + t * kd],
        [x0 + bw * kd, yTop + depth * kd],
        [x0, yTop + depth * kd],
      ],
      W.main,
      { fill: '#f5f5f4' },
    ),
  );
  // tela no meio da laje e armadura da viga (esquemática)
  det.push(ln(x0 + 3, yTop + t * kd * 0.5, x0 + (bw + slabLen) * kd - 3, yTop + t * kd * 0.5, W.sec, { 'stroke-dasharray': '3 1' }));
  for (const [px, py] of [[4, depth * kd - 4], [bw * kd - 4, depth * kd - 4], [4, 5], [bw * kd - 4, 5]] as const) det.push(ci(x0 + px, yTop + py, 0.9, W.sec, { fill: INK }));
  // quebra
  det.push(pline([[x0 + (bw + slabLen) * kd - 1.5, yTop - 1], [x0 + (bw + slabLen) * kd + 1.5, yTop + t * kd / 2], [x0 + (bw + slabLen) * kd - 1.5, yTop + t * kd + 1]], W.thin));
  // cotas
  det.push(dimH(x0, x0 + bw * kd, yTop - 4, m2(bw), yTop));
  det.push(dimV(yTop, yTop + t * kd, x0 + (bw + slabLen) * kd + 7, m2(t), x0 + (bw + slabLen) * kd));
  det.push(dimV(yTop, yTop + depth * kd, x0 - 7, m2(depth), x0));
  // níveis
  const lvl = (y: number, label: string, xx: number) => ln(xx, y, xx + 9, y, W.thin) + pgon([[xx + 4.5, y], [xx + 3, y - 2], [xx + 6, y - 2]], W.thin, { fill: INK }) + tx(xx + 10, y + 0.9, label, { anchor: 'start' });
  det.push(lvl(yTop, '+0,00 topo do radier', x0 + (bw + slabLen) * kd + 14).replace('+0,00 topo do radier', '+0,00 topo'));
  det.push(lvl(yTop + t * kd, `${fmt(-t, 2)} fundo da laje`, x0 + (bw + slabLen) * kd + 14));
  det.push(lvl(yTop + depth * kd, `${fmt(-depth, 2)} fundo da viga`, x0 + (bw + slabLen) * kd + 14));
  det.push(tx(x0 + bw * kd / 2, yTop + depth * kd / 2 + 1, 'viga', { fill: GREY }));
  det.push(tx(x0 + (bw + slabLen / 2) * kd, yTop + t * kd + 6, 'laje (tela)', { fill: GREY }));
  // chamada no plano
  const [cx, cy] = P([f.minX + bw / 2, f.maxY - 0.6]);
  out.push(tx(cx + 3, cy, 'DET. A', { anchor: 'start', bold: true, halo: true }), ln(cx, cy - 0.8, cx + 2.4, cy - 0.8, W.thin));
  out.push(g(det.join(''), { 'data-role': 'detail-a' }));

  const width = dx + (bw + slabLen) * kd + 14 + 50;
  const height = Math.max(f.bottom + 26, yb + 20);

  const mesh = results.quantities.lines.find((l) => /^mesh/.test(l.itemId))?.name ?? 'tela soldada';
  const soil = project.legal.soil;
  const notes = [
    `Radier em concreto armado, espessura ${fmt(t * 100, 0)} cm, com viga de borda ${fmt(bw * 100, 0)} × ${fmt(depth * 100, 0)} cm (largura × profundidade total); lastro de brita ${fmt(gr * 100, 0)} cm e lona plástica sob a laje; armadura: ${mesh}.`,
    `fck do concreto, cobrimento e classe de agressividade: a definir pelo responsável técnico (${normRef(catalog, 'nbr6118')}).`,
    `Tensão admitida do solo: ${fmt(project.design.soilBearingKPa, 0)} kPa; origem: ${SOIL_SOURCE[soil.source]}${soil.reference ? ` (${soil.reference})` : ''}${soil.source === 'spt' ? `, ${soil.boreholes} furo(s)` : ''}. Confirmar com sondagem (${normRef(catalog, 'nbr6484')}) e projeto de fundações (${normRef(catalog, 'nbr6122')}).`,
    `Chumbadores (${anchors.length} indicados) nas guias inferiores do térreo: nas pontas dos painéis e a cada ${fmt(spacing, 2)} m no máximo; carga de projeto ${fmt(k.anchorage.anchorKN, 0)} kN por chumbador (${fmt(k.anchorage.holdDownKN, 0)} kN nos tirantes de canto). Tipo e diâmetro a definir pelo responsável.`,
    pl ? 'Esperas de água (AF) e esgoto (ES, TQ) conferem com as pranchas de hidrossanitário; locar antes da concretagem.' : 'Sem instalações calculadas: esperas de água e esgoto a locar em projeto.',
    'Cotas em metros; níveis referidos ao topo do radier (+0,00). Verificar locação em obra.',
  ];
  const legend = [
    legendItem(pgon([[0.5, 0.5], [9.5, 0.5], [9.5, 4.5], [0.5, 4.5]], W.main), 'Contorno do radier'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { 'stroke-dasharray': '3 1.5' }), 'Viga de borda'),
    legendItem(ci(5, 2.5, 0.9, W.sec, { fill: '#fff' }) + ln(4.1, 2.5, 5.9, 2.5, W.thin) + ln(5, 1.6, 5, 3.4, W.thin), 'Chumbador (CH)'),
    legendItem(ci(5, 2.5, 1.1, W.sec, { stroke: '#1E88E5', fill: '#fff' }), 'Espera de água fria (AF)'),
    legendItem(rc(3.8, 1.3, 2.4, 2.4, W.sec, { stroke: '#6D4C41', fill: '#fff' }), 'Furo/espera de esgoto (ES)'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'foundation' }), width, height, 'PLANTA DE FUNDAÇÃO — RADIER', { scale: sc, notes, legend });
};

// ---------------------------------------------------------------------------
// Planta de painéis (framing_plan)
// ---------------------------------------------------------------------------

export const renderFramingPlan: ContentRenderer = (ctx, content, scale) => {
  const { results, project, catalog } = ctx;
  const level = resolveLevel(ctx, content.target);
  if (!level) return null;
  const walls = wallsAtLevel(results.model, level);
  if (walls.length === 0) return null;
  const sc = scale || 50;
  const codes = wallCodes(results.model, levelOrder(ctx));
  const polys = walls.flatMap(wallPolygon);
  const f = makeFrame(polys, sc, { l: 30, t: 16, r: 14, b: 28 });
  const P = f.P;
  const out: string[] = [];
  const mezz = results.model.slabs.filter((s) => s.level === level.id && s.kind === 'mezzanine');

  // Vigas de piso do mezanino (sob o piso: tracejadas).
  for (const s of mezz) {
    const joists = results.pieces.filter((p) => p.hostId === s.id && p.role === 'joist');
    const rims = results.pieces.filter((p) => p.hostId === s.id && p.role === 'rim');
    out.push(pgon(s.polygon.map(P), W.thin, { stroke: LIGHT, 'data-role': 'floor-slab' }));
    out.push(g(joists.map((p) => ln(...P([p.start[0], p.start[1]]), ...P([p.end[0], p.end[1]]), W.sec, { 'stroke-dasharray': '4 1.2' })).join(''), { 'data-role': 'joists', 'data-count': joists.length }));
    out.push(g(rims.map((p) => ln(...P([p.start[0], p.start[1]]), ...P([p.end[0], p.end[1]]), W.main, { 'stroke-dasharray': '4 1.2' })).join(''), { 'data-role': 'rims' }));
    const sp = spacingOf(joists);
    if (sp) {
      const a = P([sp.a.start[0], sp.a.start[1]]);
      const b = P([sp.b.start[0], sp.b.start[1]]);
      const dirv: [number, number] = [sp.a.end[0] - sp.a.start[0], -(sp.a.end[1] - sp.a.start[1])];
      const l = Math.hypot(...dirv) || 1;
      out.push(dimAligned(a, b, [(-dirv[0] / l) * 5, (-dirv[1] / l) * 5], m2(sp.gap)));
      const prof = joists[0]?.profileId ?? '';
      const c = P([(Math.min(...s.polygon.map((p) => p[0])) + Math.max(...s.polygon.map((p) => p[0]))) / 2, (Math.min(...s.polygon.map((p) => p[1])) + Math.max(...s.polygon.map((p) => p[1]))) / 2]);
      out.push(tx(c[0], P([0, Math.min(...s.polygon.map((p) => p[1]))])[1] + 5, `Vigas de piso ${prof} c/ ${m2(sp.gap)}`, { halo: true, fill: GREY }));
    }
  }

  // Paredes: contorno, montantes em traços e eixo.
  const wallPieces = new Map<string, Piece[]>();
  for (const p of results.pieces) if (STUD_ROLES.includes(p.role)) wallPieces.set(p.hostId, [...(wallPieces.get(p.hostId) ?? []), p]);
  const studSpacings: number[] = [];
  for (const w of walls) {
    const { d, n, at } = wallFrame(w);
    out.push(pgon(wallPolygon(w).map(P), W.sec, { fill: '#fff', 'data-role': 'wall', 'data-id': w.id }));
    const studs = (wallPieces.get(w.id) ?? []);
    const h = w.thickness / 2;
    out.push(
      g(
        studs
          .map((p) => {
            const a = P([p.start[0] + n[0] * h, p.start[1] + n[1] * h]);
            const b = P([p.start[0] - n[0] * h, p.start[1] - n[1] * h]);
            return ln(...a, ...b, W.sec, { 'data-role': 'stud' });
          })
          .join(''),
        { 'data-role': 'studs', 'data-wall': w.id },
      ),
    );
    out.push(ln(...P(at(-0.25, 0)), ...P(at(w.length + 0.25, 0)), W.thin, { stroke: GREY, 'stroke-dasharray': '5 1 0.8 1' }));
    // espaçamento dos montantes de linha
    const line = studs.filter((p) => p.role === 'stud').map((p) => (p.start[0] - w.from[0]) * d[0] + (p.start[1] - w.from[1]) * d[1]).sort((a, b) => a - b);
    for (let i = 0; i + 1 < line.length; i++) {
      const gap = line[i + 1]! - line[i]!;
      if (gap > 0.1) studSpacings.push(gap);
    }
  }
  const spacing = studSpacings.length ? studSpacings.sort((a, b) => a - b)[Math.floor(studSpacings.length / 2)]! : project.system.studSpacing;

  // Cota de espaçamento em um trecho: parede externa horizontal mais longa com dois montantes consecutivos no espaçamento corrente.
  const horiz = walls.filter((w) => Math.abs(w.from[1] - w.to[1]) < 1e-6).sort((a, b) => b.length - a.length);
  for (const w of horiz) {
    const { d, at } = wallFrame(w);
    const line = (wallPieces.get(w.id) ?? []).filter((p) => p.role === 'stud').map((p) => (p.start[0] - w.from[0]) * d[0]).sort((a, b) => a - b);
    const i = line.findIndex((u, j) => j + 1 < line.length && Math.abs(line[j + 1]! - u - spacing) < 0.02);
    if (i < 0) continue;
    const inside = w.exteriorSide === 'left' ? -1 : 1;
    const sgn = inside * (d[0] >= 0 ? 1 : -1);
    const y0 = P(at(line[i]!, inside * w.thickness / 2))[1];
    const x1 = P(at(line[i]!, 0))[0];
    const x2 = P(at(line[i + 1]!, 0))[0];
    void sgn;
    out.push(dimH(Math.min(x1, x2), Math.max(x1, x2), y0 + (inside * (w.to[0] >= w.from[0] ? 1 : -1) > 0 ? -5 : 5), m2(spacing), y0));
    break;
  }

  // Código de cada parede e contraventamento.
  const strapHosts = new Set(results.pieces.filter((p) => p.role === 'strap').map((p) => p.hostId));
  const bracingLabel = (w: HostWall) => (strapHosts.has(w.id) ? 'FX' : w.kind !== 'interior' && project.system.bracing === 'osb' ? 'OSB' : '');
  for (const w of walls) {
    const { n, at } = wallFrame(w);
    const out_ = w.exteriorSide === 'left' ? 1 : w.exteriorSide === 'right' ? -1 : 1;
    const off = (w.thickness / 2) * f.k + 5.2;
    const mid = P(at(w.length * (w.kind === 'interior' ? 0.5 : 0.5), 0));
    const sx = n[0] * out_;
    const sy = -n[1] * out_;
    const cx = mid[0] + sx * off;
    const cy = mid[1] + sy * off;
    out.push(ci(cx, cy, 3.4, W.sec, { fill: '#fff' }), tx(cx, cy + 0.9, codes.get(w.id) ?? w.id));
    const br = bracingLabel(w);
    if (br) out.push(tx(cx + 4.2, cy + 0.9, br, { fill: GREY, anchor: 'start', halo: true }));
  }

  const bb = bounds(polys.map(P));
  out.push(dimH(bb.minX, bb.maxX, bb.maxY + 16, m2(f.maxX - f.minX), bb.maxY));
  out.push(dimV(bb.minY, bb.maxY, bb.minX - 16, m2(f.maxY - f.minY), bb.minX));

  const pieces = results.pieces.filter((p) => walls.some((w) => w.id === p.hostId) || mezz.some((s) => s.id === p.hostId));
  const notes = [
    `Painéis em light steel framing conforme ${normList(catalog, ['nbr16970', 'nbr15253'])}; dimensionamento por ${normRef(catalog, 'nbr14762')}.`,
    `Montantes a cada ${m2(spacing)} m; códigos P01... identificam as paredes (as mesmas da prancha de painéis).`,
    'Contraventamento: FX = fitas de aço em X; OSB = placas de OSB fixadas aos painéis (a conferir pelo responsável).',
    ...profileLines(pieces).map((s) => `Perfil — ${s}`),
  ];
  const legend = [
    legendItem(ln(1, 0.5, 1, 4.5, W.sec) + ln(3.5, 0.5, 3.5, 4.5, W.sec) + ln(6, 0.5, 6, 4.5, W.sec) + ln(8.5, 0.5, 8.5, 4.5, W.sec), 'Montante (traço)'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.thin, { stroke: GREY, 'stroke-dasharray': '3 0.8 0.6 0.8' }), 'Eixo da parede'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { 'stroke-dasharray': '3 1' }), 'Viga de piso (sob o piso)'),
    legendItem(ci(5, 2.5, 2.2, W.sec) + tx(5, 3.4, 'P01', { size: 2 }), 'Código da parede'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'framing-plan' }), bb.maxX + 18, f.bottom + 28, `PLANTA DE PAINÉIS — ${level.name.toUpperCase()}`, { scale: sc, notes, legend });
};

// ---------------------------------------------------------------------------
// Painéis de parede (elevações)
// ---------------------------------------------------------------------------

const MAX_ROW_MM = 520;

export const renderWallPanels: ContentRenderer = (ctx, _content, scale) => {
  const { results, project, catalog } = ctx;
  const sc = scale || 50;
  const k = 1000 / sc;
  const codes = wallCodes(results.model, levelOrder(ctx));
  const order = levelOrder(ctx);
  const walls = [...results.model.walls].filter((w) => results.pieces.some((p) => p.hostId === w.id)).sort((a, b) => order(a.level) - order(b.level) || (codes.get(a.id) ?? '').localeCompare(codes.get(b.id) ?? ''));
  if (walls.length === 0) return null;

  const GAP = 16;
  const TITLE = 9;
  const DIMS = 12;
  const panels: { w: HostWall; x: number; y: number; pw: number; ph: number }[] = [];
  let x = 12;
  let y = 0;
  let rowH = 0;
  let totalW = 0;
  for (const w of walls) {
    const pw = w.length * k;
    const ph = Math.max(...w.outline.map((p) => p[1])) * k;
    if (x > 12 && x + pw > MAX_ROW_MM) {
      x = 12;
      y += rowH + GAP;
      rowH = 0;
    }
    panels.push({ w, x, y, pw, ph });
    x += pw + GAP;
    totalW = Math.max(totalW, x - GAP);
    rowH = Math.max(rowH, TITLE + ph + DIMS);
  }
  const height = y + rowH;
  const out: string[] = [];
  const studProfile = (id: string) => results.pieces.find((p) => p.hostId === id && p.role === 'stud')?.profileId ?? '';
  for (const { w, x: px, y: py, ph } of panels) {
    const top = py + TITLE;
    const { d } = wallFrame(w);
    const U = (u: number) => px + u * k;
    const V = (v: number) => top + ph - v * k;
    const items: string[] = [];
    items.push(pgon(w.outline.map(([u, v]) => [U(u), V(v)] as [number, number]), W.thin, { stroke: GREY, 'data-role': 'outline' }));
    const dashed = new Set<PieceRole>(['strap']);
    for (const p of piecesOf(ctx, w.id)) {
      const u1 = (p.start[0] - w.from[0]) * d[0] + (p.start[1] - w.from[1]) * d[1];
      const u2 = (p.end[0] - w.from[0]) * d[0] + (p.end[1] - w.from[1]) * d[1];
      const v1 = p.start[2] - w.baseZ;
      const v2 = p.end[2] - w.baseZ;
      const heavy = p.role === 'track_bottom' || p.role === 'track_top' || p.role === 'header' || p.role === 'sill';
      const width = heavy ? W.main : p.role === 'blocking' ? W.thin : W.sec;
      items.push(ln(U(u1), V(v1), U(u2), V(v2), width, { 'stroke-dasharray': dashed.has(p.role) ? '2.5 1' : undefined, 'data-role': p.role }));
    }
    for (const o of results.model.openings.filter((q) => q.hostId === w.id && q.hostKind === 'wall' && q.valid)) {
      items.push(rc(U(o.u0), V(o.v1), (o.u1 - o.u0) * k, (o.v1 - o.v0) * k, W.sec, { fill: '#fff', 'fill-opacity': 0.0, stroke: GREY, 'stroke-dasharray': '1.5 1', 'data-role': 'opening' }));
      const label = `${m2(o.u1 - o.u0)} × ${m2(o.v1 - o.v0)}`;
      const cx = U((o.u0 + o.u1) / 2);
      const cy = V((o.v0 + o.v1) / 2);
      items.push(tx(cx, cy - 0.4, label, { halo: true, size: TXT }));
      if ((o.v1 - o.v0) * k > 9) items.push(tx(cx, cy + 3, o.v0 > 0.01 ? `peitoril ${m2(o.v0)}` : o.type === 'door' ? 'porta' : '', { halo: true, fill: GREY }));
    }
    // cotas: comprimento total, trechos entre aberturas e altura
    const ops = results.model.openings.filter((q) => q.hostId === w.id && q.hostKind === 'wall' && q.valid).sort((a, b) => a.u0 - b.u0);
    const yb = top + ph;
    const stops: number[] = [0];
    for (const o of ops) stops.push(o.u0, o.u1);
    stops.push(w.length);
    if (ops.length > 0) for (let i = 0; i + 1 < stops.length; i++) if (stops[i + 1]! - stops[i]! > 0.05) items.push(dimH(U(stops[i]!), U(stops[i + 1]!), yb + 5, m2(stops[i + 1]! - stops[i]!), yb));
    items.push(dimH(U(0), U(w.length), yb + (ops.length > 0 ? 10 : 5), m2(w.length), yb));
    items.push(dimV(top, top + ph, px - 5, m2(ph / k), px));
    const sp = spacingOfWall(ctx, w);
    items.push(tx(px, py + 3, `${codes.get(w.id) ?? w.id} · ${w.id} · ${m2(w.length)} m`, { anchor: 'start', bold: true }));
    items.push(tx(px, py + 6.6, `${studProfile(w.id)}${sp ? ` c/ ${m2(sp)}` : ''}`, { anchor: 'start', fill: GREY }));
    out.push(g(items.join(''), { 'data-role': 'panel', 'data-wall': w.id, 'data-code': codes.get(w.id) }));
  }

  const notes = [
    `Painéis em light steel framing conforme ${normList(catalog, ['nbr16970', 'nbr15253'])}; verificações por ${normRef(catalog, 'nbr14762')}.`,
    'Elevação vista do lado do eixo from→to de cada parede; cotas em metros; códigos iguais aos da planta de painéis.',
    'Vergas, ombreiras (king/jack) e peitoris conforme verificação de vergas; fitas e bloqueadores nos locais indicados.',
    ...profileLines(results.pieces.filter((p) => walls.some((w) => w.id === p.hostId))).map((s) => `Perfil — ${s}`),
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main), 'Guia, verga, peitoril'),
    legendItem(ln(2, 0.5, 2, 4.5, W.sec) + ln(5, 0.5, 5, 4.5, W.sec) + ln(8, 0.5, 8, 4.5, W.sec), 'Montante, ombreira, pendural'),
    legendItem(ln(0.5, 4.5, 9.5, 0.5, W.sec, { 'stroke-dasharray': '2.5 1' }), 'Fita de contraventamento'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.thin), 'Bloqueador'),
    legendItem(rc(1.5, 0.8, 7, 3.4, W.sec, { stroke: GREY, 'stroke-dasharray': '1.5 1' }), 'Abertura (largura × altura)'),
  ];
  void project;
  return rendered(g(out.join(''), { 'data-role': 'wall-panels' }), totalW + 6, height + 2, 'PAINÉIS DE PAREDE — ELEVAÇÕES', { scale: sc, notes, legend });
};

function spacingOfWall(ctx: SheetContext, w: HostWall): number | null {
  const { d } = wallFrame(w);
  const u = ctx.results.pieces.filter((p) => p.hostId === w.id && p.role === 'stud').map((p) => (p.start[0] - w.from[0]) * d[0] + (p.start[1] - w.from[1]) * d[1]).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 0; i + 1 < u.length; i++) if (u[i + 1]! - u[i]! > 0.1) gaps.push(u[i + 1]! - u[i]!);
  return gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]! : null;
}

// ---------------------------------------------------------------------------
// Cobertura (roof_framing)
// ---------------------------------------------------------------------------

export const renderRoofFraming: ContentRenderer = (ctx, _content, scale) => {
  const { results, catalog } = ctx;
  const roles: PieceRole[] = ['rafter', 'purlin', 'ridge', 'collar_tie'];
  const roof = results.pieces.filter((p) => roles.includes(p.role));
  if (roof.length === 0) return null;
  const sc = scale || 50;
  const planes = results.model.roofPlanes;
  const pts: Vec2[] = [...planes.flatMap((p) => p.vertices.map((v) => [v[0], v[1]] as Vec2)), ...roof.flatMap((p) => [[p.start[0], p.start[1]] as Vec2, [p.end[0], p.end[1]] as Vec2])];
  const f = makeFrame(pts, sc, { l: 22, t: 14, r: 40, b: 22 });
  const P = f.P;
  const out: string[] = [];
  // contexto: paredes externas do térreo
  const ground = groundElevation(ctx);
  out.push(g(results.model.walls.filter((w) => w.kind !== 'interior' && Math.abs(w.baseZ - ground) < 1e-6).map((w) => pgon(wallPolygon(w).map(P), W.thin, { stroke: LIGHT })).join(''), { 'data-role': 'walls-ref' }));
  for (const pl of planes) out.push(pgon(pl.vertices.map((v) => P([v[0], v[1]])), W.thin, { stroke: GREY, 'stroke-dasharray': '4 1.5', 'data-role': 'roof-plane', 'data-id': pl.id }));
  const seg = (p: Piece, w: number, dash?: string) => ln(...P([p.start[0], p.start[1]]), ...P([p.end[0], p.end[1]]), w, { 'stroke-dasharray': dash, 'data-role': p.role });
  out.push(g(roof.filter((p) => p.role === 'collar_tie').map((p) => seg(p, W.thin, '1.5 1')).join(''), { 'data-role': 'collar-ties' }));
  out.push(g(roof.filter((p) => p.role === 'rafter').map((p) => seg(p, W.sec)).join(''), { 'data-role': 'rafters' }));
  out.push(g(roof.filter((p) => p.role === 'purlin').map((p) => seg(p, W.sec, '4 1')).join(''), { 'data-role': 'purlins' }));
  out.push(g(roof.filter((p) => p.role === 'ridge').map((p) => seg(p, W.main)).join(''), { 'data-role': 'ridge' }));

  // espaçamentos e rótulos (um por tipo, na água com mais peças)
  const best = (role: PieceRole) => {
    const by = new Map<string, Piece[]>();
    for (const p of roof.filter((q) => q.role === role)) by.set(p.hostId, [...(by.get(p.hostId) ?? []), p]);
    return [...by.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  };
  const rafters = best('rafter');
  const rs = spacingOf(rafters);
  if (rs) {
    const a = P([rs.a.start[0], rs.a.start[1]]);
    const b = P([rs.b.start[0], rs.b.start[1]]);
    const dv: [number, number] = [rs.a.end[0] - rs.a.start[0], -(rs.a.end[1] - rs.a.start[1])];
    const l = Math.hypot(...dv) || 1;
    out.push(dimAligned(a, b, [(-dv[0] / l) * 5, (-dv[1] / l) * 5], m2(rs.gap)));
    const c = P([(rs.a.start[0] + rs.a.end[0]) / 2, (rs.a.start[1] + rs.a.end[1]) / 2]);
    out.push(tx(c[0] + 2, c[1] - 2, `Caibros ${rafters[0]!.profileId} c/ ${m2(rs.gap)}`, { anchor: 'start', halo: true }));
  }
  const purlins = best('purlin');
  const ps = spacingOf(purlins);
  if (purlins.length) {
    const p = purlins[Math.floor(purlins.length / 2)]!;
    const c = P([(p.start[0] + p.end[0]) / 2, (p.start[1] + p.end[1]) / 2]);
    out.push(tx(c[0], c[1] + 4.2, `Terças ${purlins[0]!.profileId}${ps ? ` c/ ${m2(ps.gap)}` : ''}`, { halo: true }));
  }
  const ridges = roof.filter((p) => p.role === 'ridge');
  if (ridges.length) {
    const r = ridges[0]!;
    const c = P([(r.start[0] + r.end[0]) / 2, (r.start[1] + r.end[1]) / 2]);
    out.push(tx(c[0] + 2, c[1] - 2, `Cumeeira ${r.profileId}`, { anchor: 'start', halo: true, bold: true }));
  }
  const bb = bounds(pts.map(P));
  out.push(dimH(bb.minX, bb.maxX, bb.maxY + 9, m2(f.maxX - f.minX), bb.maxY));
  out.push(dimV(bb.minY, bb.maxY, bb.minX - 9, m2(f.maxY - f.minY), bb.minX));

  const notes = [
    `Cobertura em perfis de aço formado a frio conforme ${normList(catalog, ['nbr16970', 'nbr15253'])}; verificação de caibros e terças por ${normRef(catalog, 'nbr14762')}.`,
    `Ações de vento e sobrecarga conforme ${normList(catalog, ['nbr6123', 'nbr6120'])}; fixação da telha e das terças a definir pelo responsável.`,
    'Espaçamentos medidos entre eixos, na direção perpendicular às peças (no plano da água).',
    ...profileLines(roof).map((s) => `Perfil — ${s}`),
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec), 'Caibro'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { 'stroke-dasharray': '4 1' }), 'Terça / cartola'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main), 'Cumeeira'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.thin, { 'stroke-dasharray': '1.5 1' }), 'Linha (tirante)'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.thin, { stroke: GREY, 'stroke-dasharray': '4 1.5' }), 'Contorno da água'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'roof-framing' }), f.right + 40, f.bottom + 22, 'PLANTA DE COBERTURA — ESTRUTURA', { scale: sc, notes, legend });
};

// ---------------------------------------------------------------------------
// Notas gerais de estrutura
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  stud: 'Montantes',
  gable_stud: 'Montantes de empena',
  joist: 'Vigas de piso',
  rafter: 'Caibros',
  header: 'Vergas',
  bracing: 'Contraventamento',
  anchorage: 'Ancoragem ao radier',
  soil: 'Solo sob o radier',
  purlin: 'Terças',
};
const STATUS_LABEL = { ok: 'Atende', warn: 'Atenção', fail: 'Não atende' } as const;
const CATEGORY_ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export const renderStructureNotes: ContentRenderer = (ctx) => {
  const { results, project, catalog } = ctx;
  const st = results.structure;
  if (!st) return null;
  const c = catalog.constants;
  const WIDTH = 250;
  const out: string[] = [];
  let y = 0;
  const h = (s: string) => {
    y += 3;
    out.push(tx(0, y + 2.5, s, { anchor: 'start', bold: true }), ln(0, y + 4, WIDTH, y + 4, W.sec));
    y += 7.5;
  };
  const p = (s: string, indent = 0) => {
    for (const l of wrap(s, WIDTH - indent)) {
      out.push(tx(indent, y + 2.2, l, { anchor: 'start' }));
      y += 3.6;
    }
  };
  const tbl = (head: string[], rows: string[][], align: ('l' | 'r' | 'c')[], opts: { maxW?: Record<number, number> } = {}) => {
    const t = table({ x: 0, y, head, rows, align, ...opts });
    out.push(t.svg);
    y += t.height + 2;
  };

  h('1. NORMAS ADOTADAS');
  for (const id of ['nbr16970', 'nbr14762', 'nbr15253', 'nbr6120', 'nbr6123', 'nbr8681', 'nbr6118', 'nbr6122']) {
    const n = c.approval.norms.find((x) => x.id === id);
    if (n) p(`${normRef(catalog, id)} — ${n.title}${n.confirmed ? '' : ' (edição a conferir)'}`, 2);
  }

  h('2. AÇO E REVESTIMENTO');
  const used = new Set(results.pieces.map((q) => q.profileId));
  const fy = [...new Set(catalog.profiles.filter((q) => used.has(q.id) && q.material === 'steel').map((q) => q.fy))].sort((a, b) => a - b);
  p(`Perfis de aço formados a frio, fy = ${fy.length ? fy.map((v) => fmt(v, 0)).join(' / ') : '—'} MPa (módulo de elasticidade ${fmt(c.steelE, 0)} MPa), conforme ${normRef(catalog, 'nbr15253')}.`, 2);
  p('Revestimento: aço zincado por imersão a quente; massa de zinco mínima a definir pelo responsável (referência usual Z275, a confirmar).', 2);
  p(`Perfis em uso: ${[...used].sort().join(', ')}.`, 2);

  h('3. PARAFUSOS E LIGAÇÕES');
  p(`Montantes fixados às guias com ${c.lsf.screwsPerStud} parafusos autoperfurantes por montante (bitola e cabeça a definir pelo responsável).`, 2);
  p(`Ancoragem ao radier por chumbadores a cada ${fmt(c.lsf.anchorSpacing, 2)} m no máximo; ${fmt(c.anchorage.anchorKN, 0)} kN por chumbador e ${fmt(c.anchorage.holdDownKN, 0)} kN nos tirantes de canto (holdown).`, 2);

  h('4. CARGAS ADOTADAS');
  const L = st.loads;
  tbl(
    ['Ação', 'Valor (kPa)', 'Origem'],
    [
      ['Permanente — cobertura', fmt(L.deadRoofKPa, 2), 'peso próprio + sobreposta (catálogo)'],
      ['Sobrecarga — cobertura', fmt(L.liveRoofKPa, 2), normRef(catalog, 'nbr6120')],
      ['Permanente — piso do mezanino', fmt(L.deadFloorKPa, 2), 'peso próprio + sobreposta (catálogo)'],
      ['Sobrecarga — piso do mezanino', fmt(L.liveFloorKPa, 2), normRef(catalog, 'nbr6120')],
      ['Vento — pressão dinâmica q', fmt(L.windQKPa, 2), normRef(catalog, 'nbr6123')],
      ['Vento — parede (barlavento)', fmt(L.windWallKPa, 2), 'q × coeficientes de forma'],
      ['Vento — sucção na cobertura', fmt(L.windRoofUpliftKPa, 2), 'q × coeficientes de forma'],
    ],
    ['l', 'r', 'l'],
  );
  p(`Combinações conforme ${normRef(catalog, 'nbr8681')}: γg = ${fmt(c.loads.gammaG, 2)}, γq = ${fmt(c.loads.gammaQ, 2)}, γw = ${fmt(c.loads.gammaW, 2)}. Flechas limite: piso L/${c.deflection.floor}, cobertura L/${c.deflection.roof}, vergas L/${c.deflection.header}.`, 2);

  h('5. VENTO');
  const cat = project.design.terrainCategory;
  const s2 = c.loads.s2ByCategory[cat - 1];
  p(`Velocidade básica V0 = ${fmt(project.design.windV0, 0)} m/s; categoria de rugosidade ${CATEGORY_ROMAN[cat - 1] ?? cat} (S2 = ${s2 !== undefined ? fmt(s2, 2) : '—'}); S1 = ${fmt(c.loads.s1, 2)}; S3 = ${fmt(c.loads.s3, 2)}; q = ${fmt(L.windQKPa, 2)} kPa (${normRef(catalog, 'nbr6123')}).`, 2);

  h('6. RESUMO DAS VERIFICAÇÕES (PIOR CASO POR TIPO)');
  const rows: string[][] = [];
  for (const kind of Object.keys(KIND_LABEL)) {
    const cs = st.checks.filter((q) => q.kind === kind);
    if (cs.length === 0) continue;
    const worst = cs.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    rows.push([KIND_LABEL[kind]!, String(cs.length), worst.label, `${fmt(worst.ratio * 100, 0)} %`, STATUS_LABEL[worst.status]]);
  }
  tbl(['Tipo', 'Qtd.', 'Pior caso', 'Uso', 'Situação'], rows, ['l', 'r', 'l', 'r', 'l'], { maxW: { 2: 130 } });
  p(`Total: ${st.summary.ok} atendem, ${st.summary.warn} em atenção, ${st.summary.fail} não atendem; maior taxa de uso ${fmt(st.summary.maxRatio * 100, 0)} %. Atenção a partir de ${fmt(c.usage.warn * 100, 0)} % e reprovação a partir de ${fmt(c.usage.fail * 100, 0)} % de uso.`, 2);

  h('7. PREMISSAS E LIMITAÇÕES');
  p('Pré-dimensionamento automático por regras simplificadas (elementos isolados, apoios simples); não considera análise global, ligações detalhadas, efeitos de segunda ordem nem ações sísmicas.', 2);
  p(`Tensão admitida do solo ${fmt(project.design.soilBearingKPa, 0)} kPa (${SOIL_SOURCE[project.legal.soil.source]}). Dimensões e cargas do modelo, não do canteiro.`, 2);
  p('Fck, cobrimento, bitolas de parafusos e chumbadores, e detalhes de ligação: a definir pelo responsável técnico.', 2);
  p(DISCLAIMER, 2);

  const notes = [
    `Normas: ${normList(catalog, ['nbr16970', 'nbr14762', 'nbr15253', 'nbr6120', 'nbr6123', 'nbr8681'])}.`,
    'Pré-dimensionamento de apoio; a responsabilidade técnica é do profissional que assina a ART/RRT.',
  ];
  void FONT;
  void arrow;
  void rc;
  return rendered(g(out.join(''), { 'data-role': 'structure-notes' }), WIDTH + 2, y + 2, 'NOTAS GERAIS DE ESTRUTURA', { notes });
};
