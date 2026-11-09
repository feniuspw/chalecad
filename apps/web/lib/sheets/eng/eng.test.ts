import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, type SheetContentKind } from '@chalecad/engine';
import { DEFAULT_ANSWERS } from '../../project/wizard/answers';
import { generateProject } from '../../project/wizard/generate';
import { fmt } from '../../project/format';
import { registry } from '..';
import type { SheetContext } from '../types';
import { engRenderers } from '.';
import { drGroups, loadRows } from './electrical';

const project = generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true }).project;
project.installations.enabled = true;
const catalog = getCatalog();
const results = computeAll(project, catalog);
const ctx: SheetContext = { project, results, catalog };

const JOBS: [SheetContentKind, string | undefined, number][] = [
  ['foundation', undefined, 50],
  ['framing_plan', 'L0', 50],
  ['framing_plan', 'L1', 50],
  ['wall_panels', undefined, 50],
  ['roof_framing', undefined, 50],
  ['structure_notes', undefined, 50],
  ['electrical_plan', 'L0', 50],
  ['electrical_plan', 'L1', 50],
  ['single_line', undefined, 50],
  ['load_table', undefined, 50],
  ['plumbing_plan', 'L0', 50],
  ['plumbing_plan', 'L1', 50],
  ['sewer_plan', 'L0', 50],
  ['sewer_plan', 'L1', 50],
  ['water_isometric', undefined, 50],
  ['tank_detail', undefined, 20],
  ['septic', undefined, 25],
];
const draw = (kind: SheetContentKind, target: string | undefined, scale: number) => engRenderers[kind]!(ctx, { kind, target, title: kind, scale }, scale);

describe('conteúdos de engenharia', () => {
  it('registra um renderizador por kind de engenharia no registro geral', () => {
    for (const k of ['foundation', 'framing_plan', 'wall_panels', 'roof_framing', 'structure_notes', 'electrical_plan', 'single_line', 'load_table', 'plumbing_plan', 'sewer_plan', 'water_isometric', 'tank_detail', 'septic'] as const) {
      expect(registry[k]).toBeTypeOf('function');
    }
  });

  it.each(JOBS)('%s (%s) devolve desenho com tamanho, corpo, legenda e notas', (kind, target, scale) => {
    const r = draw(kind, target, scale)!;
    expect(r).not.toBeNull();
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.body.length).toBeGreaterThan(100);
    expect(r.title.length).toBeGreaterThan(3);
    expect(r.notes?.length ?? 0).toBeGreaterThan(0);
    expect(r.body).not.toMatch(/NaN|undefined|Infinity/);
    expect(r.notes!.join(' ')).not.toMatch(/NaN|undefined/);
    if (['foundation', 'framing_plan', 'wall_panels', 'roof_framing', 'electrical_plan', 'plumbing_plan', 'sewer_plan'].includes(kind)) expect(r.scale).toBe(scale);
    if (kind !== 'structure_notes' && kind !== 'load_table') expect(r.legend?.length ?? 0).toBeGreaterThan(0);
    if (process.env.ENG_SVG_DIR) {
      mkdirSync(process.env.ENG_SVG_DIR, { recursive: true });
      const p = 4;
      writeFileSync(
        `${process.env.ENG_SVG_DIR}/${kind}${target ? '-' + target : ''}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${(r.width + 2 * p) * 4}" height="${(r.height + 2 * p) * 4}" viewBox="${-p} ${-p} ${r.width + 2 * p} ${r.height + 2 * p}"><rect x="${-p}" y="${-p}" width="100%" height="100%" fill="#fff"/>${r.defs ? `<defs>${r.defs}</defs>` : ''}${r.body}</svg>`,
      );
    }
  });

  it('o texto nunca diz "conforme NBR 5444" e a planta elétrica traz a frase da legenda', () => {
    for (const [kind, target, scale] of JOBS) {
      const r = draw(kind, target, scale)!;
      const all = r.body + (r.notes ?? []).join(' ') + (r.legend ?? []).map((l) => l.label).join(' ');
      expect(all).not.toMatch(/conforme\s+(a\s+)?NBR\s*5444/i);
    }
    expect(draw('electrical_plan', 'L0', 50)!.notes).toContain('Simbologia conforme legenda (a NBR 5444 foi cancelada).');
  });

  it('notas de disciplina citam norma com edição vinda do catálogo', () => {
    const nbr5410 = catalog.constants.approval.norms.find((n) => n.id === 'nbr5410')!;
    expect(draw('load_table', undefined, 50)!.notes!.join(' ')).toContain(`${nbr5410.code}:${nbr5410.edition}`);
    const nbr5626 = catalog.constants.approval.norms.find((n) => n.id === 'nbr5626')!;
    expect(draw('plumbing_plan', 'L0', 50)!.notes!.join(' ')).toContain(`${nbr5626.code}:${nbr5626.edition}`);
    const nbr6122 = catalog.constants.approval.norms.find((n) => n.id === 'nbr6122')!;
    expect(draw('foundation', undefined, 50)!.notes!.join(' ')).toContain(`${nbr6122.code}:${nbr6122.edition}`);
    expect(draw('septic', undefined, 25)!.notes!.join(' ')).toMatch(/conferir pela (ABNT )?NBR 17076:2024/i);
  });

  it('as cotas do radier batem com o modelo e a nota traz fck, tensão e origem', () => {
    const slab = results.model.slabs.find((s) => s.kind === 'radier')!;
    const xs = slab.polygon.map((p) => p[0]);
    const ys = slab.polygon.map((p) => p[1]);
    const r = draw('foundation', undefined, 50)!;
    expect(r.body).toContain(`>${fmt(Math.max(...xs) - Math.min(...xs), 2)}<`);
    expect(r.body).toContain(`>${fmt(Math.max(...ys) - Math.min(...ys), 2)}<`);
    expect(r.body).toContain(`>${fmt(slab.thickness, 2)}<`);
    const notes = r.notes!.join(' ');
    expect(notes).toMatch(/fck.*a definir pelo responsável/);
    expect(notes).toMatch(/cobrimento.*a definir pelo responsável/);
    expect(notes).toContain(`${fmt(project.design.soilBearingKPa, 0)} kPa`);
    expect(notes).toMatch(/valor assumido/);
    // chumbadores e esperas
    expect(r.body).toMatch(/data-role="anchors" data-count="[1-9]/);
    expect(r.body).toMatch(/data-role="sleeves" data-count="[1-9]/);
  });

  it('unifilar: um ramo por circuito e o DR agrupa os circuitos do relatório', () => {
    const e = results.installations!.electrical!;
    const r = draw('single_line', undefined, 50)!;
    expect((r.body.match(/data-role="branch"/g) ?? []).length).toBe(e.circuits.length);
    for (const c of e.circuits) expect(r.body).toContain(`data-circuit="${c.id}"`);
    const drBoxes = r.body.match(/data-role="dr" data-dr="[^"]+"/g) ?? [];
    expect(drBoxes.length).toBe(e.panel.drs.length);
    const groups = drGroups(e).filter((gr) => gr.dr);
    for (const dr of e.panel.drs) expect(groups.find((gr) => gr.dr!.id === dr.id)!.items.map((i) => i.c.id).sort()).toEqual([...dr.circuitIds].sort());
    expect(r.body).toContain(`Aterramento ${project.legal.earthing}`);
    expect(r.body).toMatch(/DPS/);
    expect(r.body).toMatch(/BARRAMENTO N/);
    expect(r.body).toMatch(/BARRAMENTO PE/);
  });

  it('quadro de cargas soma igual ao relatório', () => {
    const e = results.installations!.electrical!;
    const rows = loadRows(e);
    expect(rows.length).toBe(e.circuits.length);
    const total = rows.reduce((s, r) => s + r.circuit.powerVA, 0);
    expect(total / 1000).toBeCloseTo(e.installedKw, 2);
    const r = draw('load_table', undefined, 50)!;
    expect(r.body).toContain(`>${fmt(total, 0)}<`);
    expect(r.body).toContain(fmt(e.installedKw, 2));
    expect(r.body).toContain(fmt(e.demandKw, 2));
    expect(r.body).toMatch(/confirmar com a concessionária/);
    for (const h of ['Circ.', 'Descrição', 'Tensão', 'Potência (VA)', 'Corrente (A)', 'Seção (mm²)', 'Disjuntor', 'DR', 'Queda (%)']) expect(r.body).toContain(`>${h}<`);
  });

  it('painéis: um por parede com peças, com código e comprimento', () => {
    const r = draw('wall_panels', undefined, 50)!;
    const hosts = new Set(results.pieces.map((p) => p.hostId));
    const walls = results.model.walls.filter((w) => hosts.has(w.id));
    expect((r.body.match(/data-role="panel"/g) ?? []).length).toBe(walls.length);
    expect(r.body).toContain('P01');
    expect(r.body).toContain(`${fmt(walls[0]!.length, 2)} m`);
  });

  it('planta de painéis: código de cada parede do nível, espaçamento cotado e vigas do mezanino', () => {
    const r0 = draw('framing_plan', 'L0', 50)!;
    expect(r0.body).toMatch(/data-role="stud"/);
    expect(r0.body).toContain('>P01<');
    const r1 = draw('framing_plan', 'L1', 50)!;
    expect(r1.body).toMatch(/data-role="joists" data-count="[1-9]/);
    expect(r1.notes!.join(' ')).toMatch(/Perfil — Vigas de piso/);
  });

  it('notas de estrutura trazem cargas, vento e o resumo das verificações', () => {
    const r = draw('structure_notes', undefined, 50)!;
    expect(r.body).toContain(`${project.design.windV0}`);
    expect(r.body).toContain(fmt(results.structure!.loads.windQKPa, 2));
    expect(r.body).toMatch(/Pior caso/);
    expect(r.body).toMatch(/não substitui projeto estrutural com ART/i);
  });

  it('conteúdo sem dado devolve null', () => {
    const noInst = { ...ctx, results: { ...results, installations: null } };
    for (const k of ['electrical_plan', 'single_line', 'load_table', 'plumbing_plan', 'sewer_plan', 'water_isometric', 'tank_detail', 'septic'] as const) {
      expect(engRenderers[k]!(noInst, { kind: k, target: 'L0', title: k }, 50)).toBeNull();
    }
    const inst = results.installations!;
    const publicSewer = { ...ctx, results: { ...results, installations: { ...inst, plumbing: { ...inst.plumbing!, septic: null } } } };
    expect(engRenderers.septic!(publicSewer, { kind: 'septic', title: 's' }, 25)).toBeNull();
    const noStruct = { ...ctx, results: { ...results, structure: null } };
    expect(engRenderers.structure_notes!(noStruct, { kind: 'structure_notes', title: 'n' }, 50)).toBeNull();
  });
});
