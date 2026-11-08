/**
 * Texturas PBR procedurais (cor, normal e rugosidade) como `CanvasTexture`, memorizadas por (material, qualidade).
 * Contam referências: `retainPbr`/`releasePbr` descartam as texturas quando ninguém mais usa (varredura adiada,
 * para o desmonta-monta do React não regenerar tudo).
 */
import * as THREE from 'three';
import { describePbr, materialRoughness, normalFromHeight, normalStrength, pbrPixels, pbrRepeat, renderPattern, type PbrTier } from './pbr';
import { applyGain, hexRgb, meanGain, photoFor, photoUrl, type PhotoSpec } from './photoTextures';

export interface PbrMaps {
  id: string;
  tier: PbrTier;
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

interface Entry {
  maps: PbrMaps;
  refs: number;
  /** Carregamento da foto que substitui a procedural (resolve quando termina, com ou sem sucesso). */
  photo?: Promise<void>;
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
  const entry: Entry = { maps, refs: 0 };
  cache.set(k, entry);
  scheduleSweep();
  const photo = photoFor(id, tier);
  if (photo) entry.photo = upgradeToPhoto(maps, photo).catch(() => undefined);
  return maps;
}

const loader = typeof document === 'undefined' ? undefined : new THREE.ImageLoader();

/**
 * Troca as imagens procedurais pelas fotos quando as três carregam (os mesmos objetos `Texture`, então os materiais
 * não precisam ser recriados). `dispose` antes: a GPU realoca a textura com o novo tamanho.
 */
/** Foto em canvas com a média ajustada para `target` (cor do acabamento ou rugosidade do material). */
function normalized(img: HTMLImageElement, target: [number, number, number]): HTMLCanvasElement | undefined {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  applyGain(data.data, meanGain(data.data, target));
  ctx.putImageData(data, 0, 0);
  return c;
}

async function upgradeToPhoto(maps: PbrMaps, photo: PhotoSpec): Promise<void> {
  if (!loader) return;
  const imgs = await Promise.all((['diff', 'nor', 'rough'] as const).map((m) => loader.loadAsync(photoUrl(photo, m)))).catch(() => undefined);
  if (!imgs || cache.get(key(maps.id, maps.tier))?.maps !== maps) return;
  const spec = describePbr(maps.id);
  const rough = Math.round(materialRoughness(maps.id) * 255);
  const diff = spec ? normalized(imgs[0]!, hexRgb(spec.color)) : undefined;
  const rgh = normalized(imgs[2]!, [rough, rough, rough]);
  if (!diff || !rgh) return;
  const images = [diff, imgs[1]!, rgh];
  [maps.map, maps.normalMap, maps.roughnessMap].forEach((t, i) => {
    t.dispose();
    t.image = images[i]!;
    t.repeat.set(1 / photo.size, 1 / photo.size);
    t.rotation = photo.rotate ? Math.PI / 2 : 0;
    t.needsUpdate = true;
  });
}

/** Resolve quando a foto do material terminou de carregar (ou de imediato se não houver foto). */
export function pbrPhotoReady(id: string | undefined, tier: PbrTier): Promise<void> {
  return (id && cache.get(key(id, tier))?.photo) || Promise.resolve();
}

/** Material já gerado na qualidade (sem gerar). */
export function hasPbr(id: string | undefined, tier: PbrTier): boolean {
  return !!id && cache.has(key(id, tier));
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
