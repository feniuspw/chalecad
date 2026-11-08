import { describe, expect, it } from 'vitest';
import { computeAll, loadProject, type BuildingModel, type HostWall, type Project, type ResolvedOpening } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import fixture from '../../../../packages/engine/fixtures/gable-6.5x8.5-mezzanine.json';
import { DXF_LAYERS, DxfWriter, dxfFileName, dxfText, exportDxf } from './dxf';

const loaded = loadProject(fixture);
if (!loaded.ok) throw new Error('fixture inválido');
const project = loaded.project;
const results = computeAll(project, getCatalog(), { today: '2026-11-07' });
const dxf = exportDxf(project, results.model, { date: '2026-11-07' });

interface Ent {
  type: string;
  layer: string;
  pairs: [number, string][];
}

/** Relê os pares código/valor: SECTIONs e entidades da seção ENTITIES. */
function parse(text: string) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  expect(lines.length % 2).toBe(0);
  const pairs: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]);
    expect(Number.isInteger(code)).toBe(true);
    pairs.push([code, lines[i + 1]!]);
  }
  const sections: string[] = [];
  const ents: Ent[] = [];
  const declared = new Set<string>();
  let sec = '';
  let table = '';
  let cur: Ent | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i]!;
    if (c === 0 && v === 'SECTION') {
      sec = pairs[i + 1]![1];
      sections.push(sec);
    } else if (c === 0 && v === 'ENDSEC') sec = '';
    else if (sec === 'TABLES' && c === 0 && v === 'TABLE') table = pairs[i + 1]![1];
    else if (sec === 'TABLES' && table === 'LAYER' && c === 0 && v === 'LAYER') declared.add(pairs[i + 1]![1]);
    else if (sec === 'ENTITIES') {
      if (c === 0) {
        cur = { type: v, layer: '', pairs: [] };
        ents.push(cur);
      } else if (cur) {
        if (c === 8) cur.layer = v;
        cur.pairs.push([c, v]);
      }
    }
  }
  return { sections, ents, declared, pairs };
}

const unescape = (s: string) => s.replace(/\\U\+([0-9A-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

describe('dxf do fixture', () => {
  const r = parse(dxf);
  it('estrutura de seções e fim', () => {
    expect(dxf.startsWith('0\nSECTION')).toBe(true);
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
    expect(r.sections).toEqual(['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
    expect(dxf).toContain('$INSUNITS\n70\n6');
    expect(dxf).toContain('$ACADVER\n1\nAC1009');
  });
  it('todas as camadas usadas estão declaradas', () => {
    const used = new Set(r.ents.map((e) => e.layer));
    for (const l of used) expect(r.declared.has(l)).toBe(true);
    for (const l of DXF_LAYERS) expect(r.declared.has(l.name)).toBe(true);
    for (const must of ['PAREDES', 'PAREDES-INT', 'ABERTURAS', 'ESCADA', 'COMODOS', 'MOVEIS', 'COTAS', 'FACHADA', 'TELHADO', 'EIXOS', 'TEXTO']) {
      if (must === 'MOVEIS' && project.furniture.length === 0) continue;
      if (must === 'COMODOS' && results.model.rooms.length === 0) continue;
      expect(used.has(must), must).toBe(true);
    }
  });
  it('POLYLINE sempre fecha com SEQEND e é ASCII puro', () => {
    const types = r.ents.map((e) => e.type);
    expect(types.filter((t) => t === 'POLYLINE').length).toBe(types.filter((t) => t === 'SEQEND').length);
    expect([...dxf].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
  });
  it('rótulos de cômodo e carimbo', () => {
    const texts = r.ents.filter((e) => e.type === 'TEXT').map((e) => unescape(e.pairs.find(([c]) => c === 1)![1]));
    for (const room of results.model.rooms.filter((x) => x.polygon)) expect(texts).toContain(`${room.name} · ${room.area.toFixed(1).replace('.', ',')} m²`);
    expect(texts).toContain(project.meta.name);
    expect(texts).toContain('Estimativa — não substitui projeto com ART');
    expect(texts.some((t) => t.startsWith('PLANTA'))).toBe(true);
    expect(texts).toContain('FACHADA FRONTAL');
  });
  it('um nível por planta, lado a lado', () => {
    const titles = r.ents.filter((e) => e.type === 'TEXT' && unescape(e.pairs.find(([c]) => c === 1)![1]).startsWith('PLANTA'));
    expect(titles.length).toBe(2);
    const x = titles.map((t) => Number(t.pairs.find(([c]) => c === 10)![1]));
    expect(x[1]! - x[0]!).toBeGreaterThan(3);
  });
});

// Modelo mínimo: uma parede de 4 m.
const wall: HostWall = {
  id: 'w1', kind: 'exterior', level: 'L0', from: [0, 0], to: [4, 0], baseZ: 0, length: 4,
  outline: [[0, 0], [4, 0], [4, 2.7], [0, 2.7]], thickness: 0.1, assemblyId: 'a', exteriorSide: 'right', loadBearing: true, wet: false,
};
const mini = (openings: ResolvedOpening[]): BuildingModel =>
  ({
    typology: 'gable', footprint: [[0, 0], [4, 0], [4, 3], [0, 3]], footprintArea: 12, builtArea: 12, walls: [wall], roofPlanes: [], slabs: [],
    openings, stairs: [], extras: [], rooms: [], furniture: [], ridgeHeight: 3, bbox: { min: [0, 0, 0], max: [4, 3, 3] },
  }) as unknown as BuildingModel;
const door: ResolvedOpening = { id: 'o1', hostId: 'w1', hostKind: 'wall', type: 'door', u0: 1, u1: 1.9, v0: 0, v1: 2.1, valid: true };
const planOnly = (m: BuildingModel) => parse(exportDxf({ ...project, furniture: [] } as Project, m, { date: '2026-01-01', levels: [{ id: 'L0', name: 'Térreo', elevation: 0 }] }));

describe('contagem de entidades', () => {
  it('parede de 4 m sem abertura: 2 LINE em PAREDES', () => {
    const r = planOnly(mini([]));
    expect(r.ents.filter((e) => e.type === 'LINE' && e.layer === 'PAREDES').length).toBe(2);
    expect(r.ents.filter((e) => e.type === 'ARC').length).toBe(0);
  });
  it('porta gera um ARC e corta a face', () => {
    const r = planOnly(mini([door]));
    expect(r.ents.filter((e) => e.type === 'ARC').length).toBe(1);
    expect(r.ents.filter((e) => e.type === 'LINE' && e.layer === 'PAREDES').length).toBe(4);
  });
});

describe('cômodos', () => {
  it('rótulo "Quarto · 9,0 m²" em COMODOS, sem quebrar o arquivo', () => {
    const m = { ...mini([]), rooms: [{ id: 'r1', level: 'L0', use: 'bedroom', name: 'Quarto', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], edges: [], area: 9 }] } as unknown as BuildingModel;
    const r = planOnly(m);
    const t = r.ents.find((e) => e.type === 'TEXT' && e.layer === 'COMODOS')!;
    expect(unescape(t.pairs.find(([c]) => c === 1)![1])).toBe('Quarto · 9,0 m²');
  });
});

describe('texto e utilitários', () => {
  it('acentos viram escapes ASCII que voltam ao original', () => {
    const t = 'Quarto · 9,0 m²';
    const e = dxfText(t);
    expect(e).toBe('Quarto \\U+00B7 9,0 m\\U+00B2');
    expect(unescape(e)).toBe(t);
  });
  it('writer vazio é válido', () => {
    const w = new DxfWriter().toString();
    expect(w.startsWith('0\nSECTION')).toBe(true);
    expect(w.endsWith('0\nEOF\n')).toBe(true);
  });
  it('nome de arquivo', () => {
    expect(dxfFileName('Chalé da Serra #1')).toBe('chale-da-serra-1.dxf');
    expect(dxfFileName('***')).toBe('projeto.dxf');
  });
});
