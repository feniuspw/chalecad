import { describe, expect, it } from 'vitest';
import type { Piece } from '@chalecad/engine';
import { buildPieceBatches, pieceLayer, roleColor, sectionOutline, writePieceMatrix } from './skeleton';

const piece = (id: string, over: Partial<Piece> = {}): Piece => ({
  id, hostId: 'ext-front', role: 'stud', profileId: 'Ue90x40x0.95', length: 2, start: [0, 0, 0], end: [2, 0, 0], webNormal: [0, 0, 1], ...over,
});

describe('writePieceMatrix', () => {
  it('X = eixo * comprimento, Y = webNormal, Z = X x Y, translação no meio', () => {
    const m = new Float32Array(16);
    writePieceMatrix(piece('a'), m);
    expect(Array.from(m)).toEqual([2, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 1]);
  });
  it('ortogonaliza webNormal não perpendicular', () => {
    const m = new Float32Array(16);
    writePieceMatrix(piece('a', { webNormal: [0.5, 0, 1] }), m);
    expect(m[4]).toBeCloseTo(0);
    expect(m[6]).toBeCloseTo(1);
  });
  it('webNormal paralela ao eixo não gera NaN', () => {
    const m = new Float32Array(16);
    writePieceMatrix(piece('a', { webNormal: [1, 0, 0] }), m);
    expect(Array.from(m).every(Number.isFinite)).toBe(true);
  });
  it('peça vertical', () => {
    const m = new Float32Array(16);
    writePieceMatrix(piece('a', { start: [1, 1, 0], end: [1, 1, 2.4], webNormal: [0, 1, 0] }), m);
    expect(m[2]).toBeCloseTo(2.4);
    expect(m[14]).toBeCloseTo(1.2);
  });
});

describe('buildPieceBatches', () => {
  it('agrupa por perfil e camada e preserva ids na ordem das matrizes', () => {
    const batches = buildPieceBatches([
      piece('s1'), piece('s2'), piece('t1', { role: 'track_top', profileId: 'U90x40x0.95' }),
      piece('r1', { role: 'rafter', profileId: 'Ue140x40x0.95' }), piece('p1', { role: 'purlin', profileId: 'Ue140x40x0.95' }),
    ]);
    expect(batches).toHaveLength(3);
    const studs = batches.find((b) => b.profileId === 'Ue90x40x0.95')!;
    expect(studs.ids).toEqual(['s1', 's2']);
    expect(studs.matrices.length).toBe(32);
    expect(batches.find((b) => b.profileId === 'Ue140x40x0.95')?.layer).toBe('roof');
  });
  it('2.000 peças geram poucas malhas', () => {
    const many = Array.from({ length: 2400 }, (_, i) => piece(`p${i}`, { profileId: i % 2 ? 'A' : 'B' }));
    expect(buildPieceBatches(many)).toHaveLength(2);
  });
});

describe('cores e seção', () => {
  it('cor por função', () => {
    expect(roleColor('stud')).toBe(roleColor('king'));
    expect(roleColor('stud')).not.toBe(roleColor('purlin'));
    expect(pieceLayer('rafter')).toBe('roof');
    expect(pieceLayer('joist')).toBe('structure');
  });
  it('seção em C tem 12 pontos com lábio; fita é retângulo', () => {
    expect(sectionOutline({ web: 90, flange: 40, lip: 12, thickness: 0.95 })).toHaveLength(12);
    expect(sectionOutline({ web: 70, flange: 0, lip: 0, thickness: 0.95 })).toHaveLength(4);
    expect(sectionOutline({ web: 90, flange: 40, lip: 0, thickness: 0.95 })).toHaveLength(8);
  });
});
