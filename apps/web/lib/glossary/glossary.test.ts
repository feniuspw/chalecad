import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCatalog } from '@chalecad/catalog';
import { describe, expect, it } from 'vitest';
import { computeProject } from '../engine/compute';
import { createProject } from '../project/templates';
import { ALERT_EXPLANATIONS, STRUCTURE_FAIL_TEXT, explainAlert } from './alerts';
import { searchSections } from './settingsIndex';
import { plainSummary } from './summary';
import { TERMS, findTerms } from './terms';

describe('findTerms', () => {
  it('acha termos, ignora acento e maiúsculas', () => {
    const ids = findTerms('A Terça fica sobre o Caibro e o PÉ-DIREITO é baixo').map((m) => m.id);
    expect(ids).toEqual(['terca', 'caibro', 'pe_direito']);
  });
  it('não repete o mesmo termo', () => {
    expect(findTerms('radier sobre radier, outro radier')).toHaveLength(1);
  });
  it('não casa dentro de palavras', () => {
    expect(findTerms('radiere')).toHaveLength(0);
    expect(findTerms('o guiado')).toHaveLength(0);
    expect(findTerms('uma arte')).toHaveLength(0);
  });
  it('aceita plural e devolve as posições', () => {
    const [m] = findTerms('Os montantes ficam a cada 40 cm');
    expect(m).toMatchObject({ id: 'montante', start: 3, text: 'montantes' });
  });
  it('siglas só casam com a mesma caixa', () => {
    expect(findTerms('ART do engenheiro').map((m) => m.id)).toEqual(['art']);
    expect(findTerms('art do engenheiro')).toHaveLength(0);
  });
  it('prefere o termo mais longo e não sobrepõe', () => {
    expect(findTerms('telha sanduíche').map((m) => m.id)).toEqual(['telha_sanduiche']);
  });
  it('tem de 40 a 60 termos com ids únicos', () => {
    expect(TERMS.length).toBeGreaterThanOrEqual(40);
    expect(TERMS.length).toBeLessThanOrEqual(60);
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(TERMS.length);
  });
});

function engineCodes(): string[] {
  const root = fileURLToPath(new URL('../../../../packages/engine/src', import.meta.url));
  const codes = new Set<string>();
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) for (const m of readFileSync(p, 'utf8').matchAll(/code: '([a-z_]+\.[a-z_]+)'/g)) codes.add(m[1]!);
    }
  };
  walk(root);
  return [...codes];
}

describe('alertas explicados', () => {
  it('todo código coberto tem as duas frases', () => {
    for (const [code, e] of Object.entries(ALERT_EXPLANATIONS)) {
      expect(e.meaning.length, code).toBeGreaterThan(10);
      expect(e.action.length, code).toBeGreaterThan(10);
    }
  });
  it('cobre ao menos 80% dos códigos emitidos pelo motor', () => {
    const codes = engineCodes();
    expect(codes.length).toBeGreaterThan(30);
    const covered = codes.filter((c) => c in ALERT_EXPLANATIONS);
    expect(covered.length / codes.length).toBeGreaterThanOrEqual(0.8);
  });
  it('cobre os alertas emitidos num projeto real', () => {
    const r = computeProject(createProject('gable_mezzanine'), getCatalog());
    for (const w of r.warnings) if (w.code !== 'engine.partial') expect(explainAlert(w.code), w.code).not.toBeNull();
  });
  it('usa o prefixo quando o código é novo e devolve null para desconhecidos', () => {
    expect(explainAlert('norm.nova')).not.toBeNull();
    expect(explainAlert('xyz.abc')).toBeNull();
  });
  it('tem texto leigo para cada tipo de verificação estrutural', () => {
    for (const k of ['stud', 'gable_stud', 'joist', 'rafter', 'header', 'bracing', 'anchorage', 'soil', 'purlin']) expect(STRUCTURE_FAIL_TEXT[k], k).toBeTruthy();
  });
});

describe('settingsIndex', () => {
  it('"beiral" acha Cobertura e "espaçamento" acha Sistema', () => {
    expect(searchSections('beiral')).toContain('roof');
    expect(searchSections('Espaçamento')).toContain('system');
    expect(searchSections('cor da telha')).toEqual(['roof']);
    expect(searchSections('beiral')).toContain('typology');
  });
  it('vazio mostra todas e sem resultado devolve vazio', () => {
    expect(searchSections('  ')).toHaveLength(11);
    expect(searchSections('zzzz')).toEqual([]);
  });
});

describe('plainSummary', () => {
  it('sem cômodos sugere marcar os cômodos', () => {
    const p = createProject('gable_mezzanine');
    const s = plainSummary({ ...p, rooms: [] }, computeProject({ ...p, rooms: [] }, getCatalog()));
    expect(s.size).toContain('Ainda não há cômodos');
    expect(s.cost).toContain('R$');
    expect(s.structure.length).toBeGreaterThan(10);
  });
  it('com cômodos conta os cômodos', () => {
    const p = createProject('gable_mezzanine');
    const room = { id: 'r1', level: p.levels[0]!.id, use: 'living' as const, seed: [1, 1] as [number, number] };
    const withRooms = { ...p, rooms: [room, { ...room, id: 'r2' }] };
    const s = plainSummary(withRooms, computeProject({ ...p, rooms: [] }, getCatalog()));
    expect(s.size).toContain('2 cômodos marcados');
    expect(s.size).not.toContain('Ainda não');
    expect(s.next).not.toContain('marque os cômodos');
  });
});
