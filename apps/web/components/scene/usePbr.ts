import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { materialMetalness, type PbrTier } from '@/lib/three/pbr';
import { getPbrMaps, releasePbr, retainPbr } from '@/lib/three/pbrTextures';
import { useEditor } from '@/lib/store/editor';
import { effectiveQuality, usePresentationUi } from './presentationUi';

/** Resolução das texturas: Alta 1024, Leve 256 (só na apresentação); fora dela, 512 (leve o bastante para o editor). */
export function usePbrTier(): PbrTier {
  const presentation = useEditor((s) => s.viewMode === 'presentation');
  const quality = effectiveQuality(usePresentationUi((s) => s.quality), usePresentationUi((s) => s.degraded));
  if (!presentation) return 'edit';
  return quality === 'high' ? 'high' : 'light';
}

/** Propriedades de `MeshStandardMaterial` com os três mapas PBR; `roughness` 1 porque o mapa leva o valor absoluto. */
export interface PbrProps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalScale: THREE.Vector2;
  roughness: number;
  metalness: number;
}

const NORMAL_SCALE = new THREE.Vector2(0.8, 0.8);

/** Mapas PBR do material (memorizados por material e qualidade; descartados ao desmontar). */
export function usePbrProps(id: string | undefined, tier?: PbrTier): PbrProps | undefined {
  const auto = usePbrTier();
  const t = tier ?? auto;
  const maps = useMemo(() => getPbrMaps(id, t), [id, t]);
  useEffect(() => {
    retainPbr(id, t);
    return () => releasePbr(id, t);
  }, [id, t]);
  return useMemo(
    () =>
      maps && id
        ? { map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, normalScale: NORMAL_SCALE, roughness: 1, metalness: materialMetalness(id) }
        : undefined,
    [maps, id],
  );
}
