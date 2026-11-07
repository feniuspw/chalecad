/**
 * Muro de arrimo (`retaining`): parâmetros de quantidade por tipo (card F4-E1).
 * Gabião: seção trapezoidal média, base = 0,5 + 0,1·H (m). Concreto armado: fuste 0,2 m + sapata 0,6 x 0,3 m.
 */
export const RETAINING = {
  gabionBase: 0.5,
  gabionBasePerHeight: 0.1,
  concreteStem: 0.2,
  footing: { width: 0.6, depth: 0.3 },
  /** Aço do concreto armado (kg por m³ de concreto). */
  steelKgPerM3: 80,
  /** Geotêxtil atrás do muro: altura do muro + dobra de 0,5 m (m² por m² de face). */
  geotextileExtraHeight: 0.5,
} as const;
