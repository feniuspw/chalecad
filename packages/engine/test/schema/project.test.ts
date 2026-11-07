import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { Project } from '../../src/schema';

const dir = join(import.meta.dirname, '../../fixtures');
const read = (p: string): unknown => JSON.parse(readFileSync(join(dir, p), 'utf8'));

describe('Project schema v1', () => {
  test.each(['gable-6.5x8.5-mezzanine.json', 'aframe-minimal.json'])('%s é válido', (f: string) => {
    const r = Project.safeParse(read(f));
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  test('aplica defaults', () => {
    const p = Project.parse(read('aframe-minimal.json'));
    expect(p.site).toEqual({ type: 'flat' });
    expect(p.system.studSpacing).toBe(0.6);
    expect(p.system.profiles.wallStud).toBe('Ue90x40x0.95');
    expect(p.budget.contingencyPct).toBe(15);
    expect(p.meta.region).toBe('SP');
    expect(p.walls).toEqual([]);
  });

  const expected: Record<string, string> = {
    'wrong-version.json': 'schemaVersion',
    'missing-wall.json': 'openings.0.host',
    'opening-too-wide.json': 'openings.0',
    'unknown-typology.json': 'typology.kind',
    'duplicate-ids.json': 'levels.1.id',
  };
  test.each(readdirSync(join(dir, 'invalid')))('invalid/%s falha no caminho esperado', (f: string) => {
    const r = Project.safeParse(read(`invalid/${f}`));
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain(expected[f]);
  });
});
