import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { WOOD_PROFILES } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { LSF_PROFILES, profileLabel, profilesForStructure, setStructure } from './system';
import { createProject } from './templates';

describe('setStructure', () => {
  it('lsf -> wood -> lsf troca os perfis e mantém o resto', () => {
    const base = createProject('gable_mezzanine');
    const wood = produce(base, (d) => setStructure(d, 'wood'));
    expect(wood.system.structure).toBe('wood');
    expect(wood.system.profiles).toMatchObject(WOOD_PROFILES);
    expect(wood.system.studSpacing).toBe(base.system.studSpacing);
    expect(wood.system.assemblies).toEqual(base.system.assemblies);
    const back = produce(wood, (d) => setStructure(d, 'lsf'));
    expect(back.system.structure).toBe('lsf');
    expect(back.system.profiles).toMatchObject(LSF_PROFILES);
  });
  it('remove gableStud de outro material, mantém se compatível', () => {
    const base = produce(createProject('a_frame'), (d) => void (d.system.profiles.gableStud = 'Ue140x40x0.95'));
    const wood = produce(base, (d) => setStructure(d, 'wood', getCatalog()));
    expect(wood.system.profiles.gableStud).toBeUndefined();
    const w2 = produce(wood, (d) => {
      d.system.profiles.gableStud = 'W38x140';
      setStructure(d, 'wood', getCatalog());
    });
    expect(w2.system.profiles.gableStud).toBe('W38x140');
    const lsf = produce(w2, (d) => setStructure(d, 'lsf', getCatalog()));
    expect(lsf.system.profiles.gableStud).toBeUndefined();
  });
});

describe('profilesForStructure', () => {
  const all = getCatalog().profiles;
  it('wood devolve só Wood', () => {
    const l = profilesForStructure(all, 'wood');
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((p) => p.family === 'Wood')).toBe(true);
  });
  it('lsf não devolve madeira', () => {
    expect(profilesForStructure(all, 'lsf').some((p) => p.family === 'Wood')).toBe(false);
    expect(profilesForStructure(all, 'lsf', 'Ue').every((p) => p.family === 'Ue')).toBe(true);
  });
  it('nome da madeira em mm', () => {
    expect(profileLabel(all.find((p) => p.id === 'W38x89')!)).toBe('38 × 89 mm');
  });
});
