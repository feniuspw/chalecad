import { describe, expect, it } from 'vitest';
import type { InstallationPoint, InstallationPointKind } from '@chalecad/engine';
import { installationLegend, installationSymbols } from './installationSymbols';
import { planSvg } from './plan';
import { handLevel, handModel, handReport } from '../three/installations.fixture';

const KINDS: InstallationPointKind[] = ['light', 'switch', 'outlet', 'outlet_high', 'tue', 'water_cold', 'water_hot', 'sewer', 'drain', 'panel', 'tank'];

const pt = (kind: InstallationPointKind, i: number): InstallationPoint => ({
  id: `p${i}`,
  kind,
  level: 'L0',
  position: [2 + i, 3],
  height: 0.3,
  roomId: null,
  hostId: null,
  furnitureId: null,
  circuitId: null,
  label: kind,
});

describe('installationSymbols', () => {
  const points = KINDS.map(pt);
  const syms = installationSymbols(points);

  it('um símbolo por ponto, com traços dentro de 30 cm', () => {
    expect(syms).toHaveLength(KINDS.length);
    for (const s of syms) {
      expect(s.strokes.length).toBeGreaterThan(0);
      for (const st of s.strokes) for (const [x, y] of st.pts) expect(Math.hypot(x - s.point[0], y - s.point[1])).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('cor por sistema', () => {
    const color = (k: InstallationPointKind) => syms.find((s) => s.kind === k)!.color;
    expect(color('water_cold')).toBe('#2563eb');
    expect(color('water_hot')).toBe('#dc2626');
    expect(color('sewer')).toBe('#78716c');
    expect(color('outlet')).toBe('#f59e0b');
  });

  it('legenda lista só o que existe', () => {
    expect(installationLegend([pt('outlet', 0), pt('outlet', 1), pt('light', 2)]).map((l) => l.kind)).toEqual(['outlet', 'light']);
  });
});

describe('planSvg com instalações', () => {
  it('desenha símbolos e legenda do nível', () => {
    const doc = planSvg(handModel, { levelId: handLevel, installations: handReport.points });
    expect(doc.svg).toContain('data-role="installations"');
    expect(doc.svg).toContain('data-role="installations-legend"');
    expect(doc.svg).toContain('>AF<');
    expect(planSvg(handModel, { levelId: handLevel }).svg).not.toContain('installations');
  });
});
