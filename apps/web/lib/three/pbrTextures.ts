/**
 * Texturas PBR procedurais (cor, normal e rugosidade) como `CanvasTexture`, memorizadas por (material, qualidade).
 * Contam referências: `retainPbr`/`releasePbr` descartam as texturas quando ninguém mais usa (varredura adiada,
 * para o desmonta-monta do React não regenerar tudo).
 */
import * as THREE from 'three';
import { describePbr, normalFromHeight, normalStrength, pbrPixels, pbrRepeat, renderPattern, type PbrTier } from './pbr';

export interface PbrMaps {
  id: string;
  tier: PbrTier;
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

interface Entry {
  maps: PbrMaps;
  refs: number;
}

const cache = new Map<string, Entry>();
const key = (id: string, tier: PbrTier) => `${id}@${tier}`;

function toCanvas(data: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement | undefined {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;
  ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

function makeTexture(canvas: HTMLCanvasElement, repeat: [number, number], srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // o three limita ao máximo do renderer
  t.anisotropy = 16;
  return t;
}

/** Texturas do material na qualidade (geradas uma vez); undefined sem DOM ou sem padrão. */
export function getPbrMaps(id: string | undefined, tier: PbrTier): PbrMaps | undefined {
  const spec = describePbr(id);
  if (!id || !spec || typeof document === 'undefined') return undefined;
  const k = key(id, tier);
  const hit = cache.get(k);
  if (hit) return hit.maps;
  const [w, h] = pbrPixels(spec, tier);
  const buf = renderPattern(spec, w, h);
  const normal = normalFromHeight(buf.heightMap, w, h, w / spec.tile[0], normalStrength(spec));
  const a = toCanvas(buf.albedo, w, h);
  const n = toCanvas(normal, w, h);
  const r = toCanvas(buf.roughness, w, h);
  if (!a || !n || !r) return undefined;
  const rep = pbrRepeat(spec);
  const maps: PbrMaps = { id, tier, map: makeTexture(a, rep, true), normalMap: makeTexture(n, rep, false), roughnessMap: makeTexture(r, rep, false) };
  cache.set(k, { maps, refs: 0 });
  scheduleSweep();
  return maps;
}

export function retainPbr(id: string | undefined, tier: PbrTier): void {
  if (!id) return;
  const e = cache.get(key(id, tier));
  if (e) e.refs++;
}

export function releasePbr(id: string | undefined, tier: PbrTier): void {
  if (!id) return;
  const e = cache.get(key(id, tier));
  if (e) e.refs = Math.max(0, e.refs - 1);
  scheduleSweep();
}

let sweepTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSweep() {
  if (sweepTimer !== undefined) return;
  sweepTimer = setTimeout(() => {
    sweepTimer = undefined;
    for (const [k, e] of cache) {
      if (e.refs > 0) continue;
      e.maps.map.dispose();
      e.maps.normalMap.dispose();
      e.maps.roughnessMap.dispose();
      cache.delete(k);
    }
  }, 4000);
}

/** Quantas texturas PBR estão em memória (para testes e para o orçamento de texturas). */
export function pbrCacheSize(): number {
  return cache.size;
}
