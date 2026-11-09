import type { Discipline, Project } from '../schema/project';
import type { MissingInput } from '../schema/results';
import { isFilled } from './common';

/** Professional com a disciplina (para ART/RRT). */
export const professionalFor = (project: Project, d: Discipline) => project.legal.professionals.find((p) => p.disciplines.includes(d));

/** Dados que faltam para a documentação. `required` depende de `legal.stage`. */
export function computeMissingInputs(project: Project, installationsOn: boolean): MissingInput[] {
  const l = project.legal;
  const legal = l.stage === 'legal' || l.stage === 'executive';
  const exec = l.stage === 'executive';
  const out: MissingInput[] = [];
  const need = (cond: boolean, key: string, label: string, discipline: MissingInput['discipline'], required: boolean) => {
    if (cond) out.push({ key, label, discipline, required });
  };

  need(!isFilled(l.owner.name), 'legal.owner.name', 'Nome do proprietário', 'general', legal);
  need(!isFilled(l.owner.doc), 'legal.owner.doc', 'CPF/CNPJ do proprietário', 'general', false);
  need(!isFilled(l.address.street) || !isFilled(l.address.city), 'legal.address', 'Endereço da obra (logradouro e município)', 'general', legal);
  need(!isFilled(l.address.registry), 'legal.address.registry', 'Matrícula do imóvel', 'general', false);
  need(!l.lot, 'legal.lot', 'Lote (testada, profundidade e posição da edificação)', 'architecture', legal);
  need(!professionalFor(project, 'architecture'), 'legal.professionals.architecture', 'Responsável técnico pelo projeto de arquitetura', 'architecture', legal);

  const z = l.zoning;
  need(z.maxOccupancyPct === undefined, 'legal.zoning.maxOccupancyPct', 'Taxa de ocupação máxima', 'architecture', legal);
  need(z.maxFar === undefined, 'legal.zoning.maxFar', 'Coeficiente de aproveitamento máximo', 'architecture', legal);
  need(z.setbackFront === undefined, 'legal.zoning.setbackFront', 'Recuo frontal mínimo', 'architecture', legal);
  need(z.setbackSide === undefined, 'legal.zoning.setbackSide', 'Recuo lateral mínimo', 'architecture', legal);
  need(z.setbackBack === undefined, 'legal.zoning.setbackBack', 'Recuo de fundos mínimo', 'architecture', legal);
  need(z.minPermeablePct === undefined, 'legal.zoning.minPermeablePct', 'Taxa de permeabilidade mínima', 'architecture', false);
  need(z.maxHeight === undefined, 'legal.zoning.maxHeight', 'Altura máxima', 'architecture', false);
  need(z.maxFloors === undefined, 'legal.zoning.maxFloors', 'Número máximo de pavimentos', 'architecture', false);
  need(z.minCeiling === undefined, 'legal.zoning.minCeiling', 'Pé-direito mínimo do código de obras', 'architecture', false);

  need(l.soil.source === 'assumed' || (l.soil.source === 'spt' && l.soil.boreholes === 0), 'legal.soil', 'Sondagem SPT (tensão admissível do solo)', 'foundation', exec);
  need(!professionalFor(project, 'structure'), 'legal.professionals.structure', 'Responsável técnico pelo projeto estrutural e de fundação', 'structure', exec);
  if (installationsOn || exec) {
    need(!professionalFor(project, 'electrical'), 'legal.professionals.electrical', 'Responsável técnico pelo projeto elétrico', 'electrical', exec && installationsOn);
    need(!professionalFor(project, 'plumbing'), 'legal.professionals.plumbing', 'Responsável técnico pelo projeto hidrossanitário', 'plumbing', exec && installationsOn);
  }
  if (installationsOn) need(!isFilled(l.powerUtility), 'legal.powerUtility', 'Concessionária de energia', 'electrical', false);
  return out;
}
