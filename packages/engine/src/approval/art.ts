import type { Catalog } from '@chalecad/catalog';
import type { Discipline, LegalPerson, Project } from '../schema/project';
import type { AreaTable, ArtActivity, ArtSheet, Results } from '../schema/results';
import { isFilled, nf } from './common';
import { professionalFor } from './missing';

const person = (p: LegalPerson) => ({ name: p.name, doc: p.doc, address: p.address });

function siteAddress(project: Project): string {
  const a = project.legal.address;
  const first = [a.street, a.number].filter(isFilled).join(', ');
  const parts = [first, a.complement, a.district, [a.city, isFilled(a.city) ? project.meta.region : ''].filter(isFilled).join('/')].filter(isFilled);
  const line = parts.join(' - ');
  return isFilled(a.cep) ? (line ? `${line} - CEP ${a.cep}` : `CEP ${a.cep}`) : line;
}

/** "Ue90x40x0.95" → "Ue 90×40×0,95". */
function profileLabel(id: string): string {
  const m = /^([A-Za-z]+)([\d.]+(?:x[\d.]+)*)$/.exec(id);
  return m ? `${m[1]} ${m[2]!.replace(/x/g, '×').replace(/\./g, ',')}` : id;
}

export function computeArt(project: Project, results: Results, catalog: Catalog, areas: AreaTable): ArtSheet {
  const l = project.legal;
  const elec = results.installations?.electrical;
  const plumb = results.installations?.plumbing;
  const wood = project.system.structure === 'wood';
  const radierArea = results.quantities.areas.radier;
  const quantities: Record<string, number> = {
    built_area: areas.totalBuilt,
    radier_area: radierArea,
    installed_kva: elec ? elec.circuits.reduce((a, c) => a + c.powerVA, 0) / 1000 : 0,
    demand_kva: elec ? elec.demandKw : 0,
    water_points: plumb ? plumb.layout.points.length : 0,
    septic_volume: plumb?.septic ? plumb.septic.tankLiters / 1000 : 0,
  };

  const archProf = professionalFor(project, 'architecture');
  const sys = project.system;
  const stud = sys.profiles.wallStud;
  const structNotes = wood
    ? `Projeto estrutural em wood frame (madeira serrada tratada, NBR 7190-1), montantes ${stud}, radier e=${nf(sys.foundation.thickness * 100, 0)} cm, área ${nf(radierArea, 1)} m²`
    : `Projeto estrutural em LSF, perfis ${profileLabel(stud)} (NBR 15253), radier e=${nf(sys.foundation.thickness * 100, 0)} cm, área ${nf(radierArea, 1)} m²`;

  const activities: ArtActivity[] = [];
  for (const row of catalog.constants.approval.artActivities) {
    const d = row.discipline as Discipline;
    if (d === 'architecture') {
      const wantCau = archProf?.council === 'CAU';
      if ((row.council === 'CAU') !== wantCau) continue;
    }
    if ((d === 'electrical' || d === 'plumbing') && !results.installations) continue;
    if (row.quantity === 'septic_volume' && !plumb?.septic) continue;

    const prof = professionalFor(project, d);
    const act: ArtActivity = {
      discipline: d,
      council: row.council,
      activity: d === 'structure' && wood ? 'Projeto estrutural de edificação em wood frame (madeira serrada tratada, NBR 7190)' : row.activity,
      quantity: Number((quantities[row.quantity] ?? 0).toFixed(3)),
      unit: row.unit,
      notes: '',
    };
    if (prof) act.professionalId = prof.id;
    const cv = l.contractValues[d];
    if (cv !== undefined) act.contractValue = cv;
    act.notes = noteFor(row.quantity, d, structNotes, areas, results, project);
    activities.push(act);
  }

  const blanks: string[] = [];
  if (!isFilled(l.owner.name)) blanks.push('Nome do proprietário');
  if (!isFilled(l.owner.doc)) blanks.push('CPF/CNPJ do proprietário');
  if (!siteAddress(project)) blanks.push('Endereço da obra');
  if (!l.startDate) blanks.push('Data de início da obra');
  if (!l.endDate) blanks.push('Data prevista de término');
  for (const a of activities) {
    const short = a.activity.length > 60 ? `${a.activity.slice(0, 57)}...` : a.activity;
    if (!a.professionalId) blanks.push(`Profissional responsável: ${short}`);
    if (a.contractValue === undefined) blanks.push(`Valor do contrato: ${short}`);
  }

  const sheet: ArtSheet = {
    owner: person(l.owner),
    contractor: person(l.contractor ?? l.owner),
    siteAddress: siteAddress(project),
    activities,
    blanks,
  };
  if (project.meta.location) sheet.coordinates = { lat: project.meta.location.lat, lon: project.meta.location.lon };
  if (l.startDate) sheet.startDate = l.startDate;
  if (l.endDate) sheet.endDate = l.endDate;
  return sheet;
}

function noteFor(q: string, d: Discipline, structNotes: string, areas: AreaTable, results: Results, project: Project): string {
  const elec = results.installations?.electrical;
  const plumb = results.installations?.plumbing;
  if (d === 'architecture') return `Edificação residencial unifamiliar, ${nf(areas.totalBuilt, 1)} m² construídos em ${areas.levels.length} pavimento(s).`;
  if (d === 'structure') return structNotes;
  if (d === 'foundation') return `Radier de concreto armado, e=${nf(project.system.foundation.thickness * 100, 0)} cm, viga de borda de ${nf(project.system.foundation.edgeBeamDepth * 100, 0)} cm, tensão admissível do solo ${nf(project.design.soilBearingKPa, 0)} kPa.`;
  if (d === 'electrical' && elec) return `Instalações elétricas de baixa tensão (NBR 5410), ${nf(elec.voltage, 0)} V, ${elec.circuits.length} circuito(s), demanda ${nf(elec.demandKw, 1)} kW.`;
  if (d === 'plumbing' && q === 'septic_volume' && plumb?.septic) return `Tanque séptico de ${nf(plumb.septic.tankLiters, 0)} L e disposição final do efluente.`;
  if (d === 'plumbing' && plumb) return `Água fria${plumb.layout.pipes.some((p) => p.system === 'hot') ? ' e quente' : ''}, esgoto e ventilação (NBR 5626 e NBR 8160), reservatório de ${nf(plumb.tank.liters, 0)} L.`;
  return 'Execução da obra conforme os projetos.';
}
