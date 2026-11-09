import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '../../src';
import { buildConstructionGuide, buildEngineerPackage } from '../../src/reports';
import { loadFixture } from '../helpers/load';
import { mk } from '../helpers/inline';

/**
 * Card F4-E9: mover constantes técnicas para o catálogo não pode mudar nenhum resultado.
 * Os números abaixo foram capturados ANTES da refatoração; o hash cobre o resultado inteiro (sem tempos).
 */
const catalog = getCatalog();
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
// `approval` (F17) é campo novo e tem testes próprios: o hash continua cobrindo só o que existia antes dele.
const strip = <T extends { timingsMs: unknown; approval?: unknown }>({ approval: _approval, ...r }: T) => ({ ...r, timingsMs: {} });

const house = { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 };
const everything = () =>
  mk(house, {
    site: {
      type: 'sloped', slopePct: 40, downhillAzimuthDeg: 0,
      platformMargin: { front: 3, back: 3, left: 3, right: 3 }, platformElevation: 0,
      cutSlopeHV: 0.2, fillSlopeHV: 0.5, disposalDistanceKm: 10,
    },
    extras: [
      { id: 'm1', kind: 'wall', path: [[10, -5], [20, -5]], height: 2, system: 'concrete_block', foundation: 'strip' },
      { id: 'm2', kind: 'wall', path: [[0, 0], [4, 0], [4, 3]], closed: true, height: 1, system: 'structural_block', foundation: 'grade_beam' },
      { id: 'm3', kind: 'wall', path: [[0, -13], [6, -13]], height: 2, system: 'lsf_board' },
      { id: 'c1', kind: 'fence', path: [[-5, -25], [15, -25], [15, -35]], closed: false, height: 1.8, postType: 'eucalyptus', postSpacing: 2.5, mesh: 'barbed', baseWallHeight: 0.4 },
      { id: 'd1', kind: 'deck', side: 'front', depth: 2, elevation: 0.3, guardrail: true, covered: true },
      { id: 'r1', kind: 'retaining', path: [[0, 12], [8, 12]], height: 1.5 },
      { id: 'r2', kind: 'retaining', path: [[0, 16], [8, 16]], height: 2, type: 'concrete' },
      { id: 'r3', kind: 'retaining', path: [[0, 20], [8, 20]], height: 1, type: 'block' },
    ],
  });

describe('F4-E9: snapshot de resultados (nada muda ao mover constantes)', () => {
  test('fixture 6,5 x 8,5: números-chave', () => {
    const r = computeAll(loadFixture('gable-6.5x8.5-mezzanine.json'), catalog);
    expect({
      total: r.budget.total,
      steelKg: r.quantities.steelKg,
      pieces: r.pieces.length,
      summary: r.structure!.summary,
    }).toMatchSnapshot();
  });

  test('hash do resultado completo (fixture, A-frame, extras + terreno)', () => {
    const out = {
      gable: hash(strip(computeAll(loadFixture('gable-6.5x8.5-mezzanine.json'), catalog))),
      aframe: hash(strip(computeAll(loadFixture('aframe-minimal.json'), catalog))),
      everything: hash(strip(computeAll(everything(), catalog))),
    };
    expect(out).toMatchSnapshot();
  });

  test('hash do roteiro de obra e do pacote do engenheiro', () => {
    const p = loadFixture('gable-6.5x8.5-mezzanine.json');
    const res = computeAll(p, catalog);
    expect({
      guide: hash(buildConstructionGuide(p, res, catalog)),
      engineer: hash(buildEngineerPackage(p, res, catalog)),
    }).toMatchSnapshot();
  });
});
