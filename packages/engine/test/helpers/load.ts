import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../../src/load';
import type { Project } from '../../src/schema';

const dir = join(import.meta.dirname, '../../fixtures');

/** Carrega um fixture JSON, aplica `mut` ao JSON cru e valida. */
export function loadFixture(file: string, mut?: (p: any) => void): Project { // eslint-disable-line @typescript-eslint/no-explicit-any
  const j = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  mut?.(j);
  const r = loadProject(j);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.project;
}
