/** Conteúdos de engenharia (F17-W2): fundação, estrutura, elétrica e hidrossanitária. */
import type { RendererRegistry } from '../types';
import { renderElectricalPlan, renderLoadTable, renderSingleLine } from './electrical';
import { renderPlumbingPlan, renderSeptic, renderSewerPlan, renderTankDetail, renderWaterIsometric } from './plumbing';
import { renderFoundation, renderFramingPlan, renderRoofFraming, renderStructureNotes, renderWallPanels } from './structure';

export const engRenderers: RendererRegistry = {
  foundation: renderFoundation,
  framing_plan: renderFramingPlan,
  wall_panels: renderWallPanels,
  roof_framing: renderRoofFraming,
  structure_notes: renderStructureNotes,
  electrical_plan: renderElectricalPlan,
  single_line: renderSingleLine,
  load_table: renderLoadTable,
  plumbing_plan: renderPlumbingPlan,
  sewer_plan: renderSewerPlan,
  water_isometric: renderWaterIsometric,
  tank_detail: renderTankDetail,
  septic: renderSeptic,
};
