import type { AttentionSeverity, GuideStep } from '@chalecad/engine';

export const PHASE_LABEL: Record<GuideStep['phase'], string> = {
  layout: 'Locação',
  foundation: 'Fundação',
  walls: 'Paredes',
  mezzanine: 'Mezanino',
  roof: 'Cobertura',
  exterior_closure: 'Fechamento externo',
  services: 'Instalações',
  interior_closure: 'Fechamento interno',
  floor: 'Piso',
  finishing: 'Acabamento',
  extras: 'Extras',
};

export const SEVERITY_LABEL: Record<AttentionSeverity, string> = { info: 'Informação', warn: 'Atenção', fail: 'Revisar' };
export const STATUS_LABEL = { ok: 'Dentro da faixa', warn: 'Atenção', fail: 'Revisar' } as const;

export const CHECK_KIND_LABEL: Record<string, string> = {
  stud: 'Montante',
  joist: 'Viga de piso',
  rafter: 'Caibro',
  header: 'Verga',
  bracing: 'Contraventamento',
  anchorage: 'Ancoragem',
  soil: 'Solo',
  purlin: 'Terça',
};
