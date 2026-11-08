import type { TechnicalConstants } from '@chalecad/catalog';
import type { Project } from '../schema/project';

const EPS = 1e-9;

export type InstallationsConstants = TechnicalConstants['installations'];

/** Dimensionamento da caixa d'água: consumo diário × dias de reserva, arredondado ao tamanho comercial. */
export function sizeTank(project: Project, k: InstallationsConstants): { liters: number; dailyLiters: number; occupants: number } {
  const bedrooms = project.rooms.filter((r) => r.use === 'bedroom').length;
  const occupants = project.installations.occupants ?? Math.max(2, k.personsPerBedroom * bedrooms);
  const dailyLiters = occupants * k.waterPerPerson;
  const need = dailyLiters * k.reserveDays;
  const sizes = [...k.tankSizes].sort((a, b) => a - b);
  const liters = sizes.find((s) => s >= need - EPS) ?? sizes[sizes.length - 1]!;
  return { liters, dailyLiters, occupants };
}
