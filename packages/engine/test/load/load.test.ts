import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadProject } from '../../src/load';

const dir = join(import.meta.dirname, '../../fixtures');
const raw = (p: string) => readFileSync(join(dir, p), 'utf8');

describe('loadProject', () => {
  test.each(['gable-6.5x8.5-mezzanine.json', 'aframe-minimal.json'])('%s carrega (string e objeto)', (f) => {
    for (const input of [raw(f), JSON.parse(raw(f))]) {
      const r = loadProject(input);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.migrated).toBe(false);
    }
  });

  const expected: Record<string, string> = {
    'wrong-version.json': 'schemaVersion',
    'missing-wall.json': 'openings.0.host',
    'opening-too-wide.json': 'openings.0',
    'unknown-typology.json': 'typology.kind',
    'duplicate-ids.json': 'levels.1.id',
  };
  test.each(readdirSync(join(dir, 'invalid')))('invalid/%s tem issue com path', (f) => {
    const r = loadProject(raw(`invalid/${f}`));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.length).toBeGreaterThan(0);
      expect(r.issues.map((i) => i.path)).toContain(expected[f]);
      for (const i of r.issues) expect(i.message.length).toBeGreaterThan(0);
    }
  });

  test('JSON quebrado vira issue com path vazio', () => {
    const r = loadProject('{ "a": ');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0]!.path).toBe('');
      expect(r.issues[0]!.message).toMatch(/JSON inválido/);
    }
  });

  test('mensagens em pt-BR', () => {
    const base = JSON.parse(raw('aframe-minimal.json'));
    const msgs = (mut: (p: any) => void): Record<string, string> => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const p = structuredClone(base);
      mut(p);
      const r = loadProject(p);
      if (r.ok) throw new Error('esperava falha');
      return Object.fromEntries([...r.issues].reverse().map((i) => [i.path, i.message]));
    };
    expect(msgs((p) => delete p.meta.name)['meta.name']).toBe('Campo obrigatório.');
    expect(msgs((p) => (p.meta.name = 5))['meta.name']).toMatch(/Tipo inválido: esperado texto/);
    expect(msgs((p) => (p.typology.width = 1))['typology.width']).toBe('O valor mínimo é 2.');
    expect(msgs((p) => (p.typology.width = 99))['typology.width']).toBe('O valor máximo é 30.');
    expect(msgs((p) => (p.typology.frontGable = 'x'))['typology.frontGable']).toMatch(/^Valor inválido\. Opções: "closed"/);
    expect(msgs((p) => (p.levels = []))['levels']).toBe('Mínimo de 1 itens.');
    expect(msgs((p) => (p.schemaVersion = 2))['schemaVersion']).toBe('O valor deve ser 1.');
    expect(msgs((p) => (p.typology.kind = 'igloo'))['typology.kind']).toMatch(/opções válidas/);
    expect(msgs((p) => (p.openings[0].host = 'nada'))['openings.0.host']).toBe('Parede inexistente: nada');
  });

  test('versão antiga sem migração falha com mensagem', () => {
    const p = JSON.parse(raw('aframe-minimal.json'));
    p.schemaVersion = 0;
    const r = loadProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/migração/);
  });
});
