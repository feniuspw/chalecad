import * as THREE from 'three';

interface Entry {
  material: THREE.SpriteMaterial;
  /** Largura / altura do texto. */
  aspect: number;
}
const cache = new Map<string, Entry>();

/** Material de sprite com o texto (cor + contorno branco para ler sobre piso e paredes). Um por texto e cor. */
export function labelSprite(text: string, color: string): Entry {
  const key = `${text}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const px = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `700 ${px}px Helvetica, Arial, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.width = w;
  canvas.height = px + 24;
  ctx.font = `700 ${px}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeText(text, w / 2, canvas.height / 2 + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, canvas.height / 2 + 3);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const entry = { material, aspect: w / canvas.height };
  cache.set(key, entry);
  return entry;
}
