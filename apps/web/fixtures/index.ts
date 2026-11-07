import type { BuildingModel } from '@chalecad/engine';
import raw from './model-gable.json';

/** Chalé 6,5 x 8,5 m gerado por `make-model.mjs` (o motor real virá em outro card). */
export const gableModel = raw as unknown as BuildingModel;
