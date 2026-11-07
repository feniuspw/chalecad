import type { ReactNode } from 'react';
import { Building2, Home, Tent, Warehouse, Waypoints, Square } from 'lucide-react';
import type { TypologyKind } from '@chalecad/engine';
import { AFrameIllustration, CombinedIllustration, FlatRoofIllustration, GableIllustration, GambrelIllustration, ShedIllustration } from '../editor/TypologyIllustrations';

export const TYPOLOGY_ICONS: Record<TypologyKind, typeof Home> = {
  gable_mezzanine: Home,
  a_frame: Tent,
  shed: Building2,
  flat_roof: Square,
  gambrel: Warehouse,
  combined: Waypoints,
};

export const TYPOLOGY_ART: Record<TypologyKind, () => ReactNode> = {
  gable_mezzanine: GableIllustration,
  a_frame: AFrameIllustration,
  shed: ShedIllustration,
  flat_roof: FlatRoofIllustration,
  gambrel: GambrelIllustration,
  combined: CombinedIllustration,
};
