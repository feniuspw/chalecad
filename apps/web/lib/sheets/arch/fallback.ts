/** Pranchas da etapa `legal` quando `results.approval` não existe (o motor F17-E1 ainda não entrou). */
import type { Project, Results, SheetSpec } from '@chalecad/engine';
import { deriveLevels } from '../../plan2d/plan';

export function fallbackSheets(project: Project, results: Results): SheetSpec[] {
  const model = results.model;
  const levels = deriveLevels(model, project);
  const bb = model.bbox;
  const maxDim = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]);
  const drawScale = maxDim > 12 ? (maxDim > 18 ? 100 : 75) : 50;
  const lot = project.legal.lot;
  const smallLot = lot ? lot.front * lot.depth < 360 : false;
  const sheets: SheetSpec[] = [
    {
      code: 'ARQ-01',
      discipline: 'architecture',
      title: 'Situação, implantação e quadro de áreas',
      format: 'A3',
      contents: [
        { kind: 'situation', title: 'PLANTA DE SITUAÇÃO', scale: 500 },
        { kind: 'implantation', title: 'PLANTA DE IMPLANTAÇÃO', scale: smallLot ? 100 : 200 },
        { kind: 'areas', title: 'QUADRO DE ÁREAS' },
      ],
    },
    {
      code: 'ARQ-02',
      discipline: 'architecture',
      title: 'Plantas baixas',
      format: 'A3',
      contents: levels.map((l) => ({ kind: 'plan' as const, target: l.id, title: `PLANTA BAIXA — ${l.name.toUpperCase()}`, scale: drawScale })),
    },
    {
      code: 'ARQ-03',
      discipline: 'architecture',
      title: 'Cortes A e B',
      format: 'A3',
      contents: [
        { kind: 'section', target: 'A', title: 'CORTE A — TRANSVERSAL', scale: drawScale },
        { kind: 'section', target: 'B', title: 'CORTE B — LONGITUDINAL', scale: drawScale },
      ],
    },
    {
      code: 'ARQ-04',
      discipline: 'architecture',
      title: 'Fachadas',
      format: 'A3',
      contents: (['front', 'back', 'left', 'right'] as const).map((s) => ({
        kind: 'elevation' as const,
        target: s,
        title: `FACHADA ${{ front: 'FRONTAL', back: 'POSTERIOR', left: 'LATERAL ESQUERDA', right: 'LATERAL DIREITA' }[s]}`,
        scale: drawScale,
      })),
    },
    {
      code: 'ARQ-05',
      discipline: 'architecture',
      title: 'Planta de cobertura',
      format: 'A3',
      contents: [{ kind: 'roof', title: 'PLANTA DE COBERTURA', scale: 100 }],
    },
  ];
  return sheets;
}
