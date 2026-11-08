/**
 * Kit de formas para montar os móveis em código. Referencial do motor (z para cima), local ao móvel:
 * centro em (0, 0), largura em x, profundidade em y (fundo em +y, frente em −y), base em z = 0.
 * Cada forma leva um `token` de material; no fim as geometrias do mesmo token são fundidas numa só (poucos draw calls).
 * Sem WebGL: só `BufferGeometry`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Token =
  | 'fabric'
  | 'cushion'
  | 'wood'
  | 'body'
  | 'rug'
  | 'rug2'
  | 'linen'
  | 'blanket'
  | 'white'
  | 'dark'
  | 'black'
  | 'stone'
  | 'steel'
  | 'brass'
  | 'glass'
  | 'leaf'
  | 'leaf2'
  | 'pot'
  | 'soil'
  | 'book1'
  | 'book2'
  | 'book3';

export interface Part {
  token: Token;
  geometry: THREE.BufferGeometry;
}

export interface Size {
  w: number;
  d: number;
  h: number;
}

const DEG = Math.PI / 180;

export class Kit {
  private list: Part[] = [];
  private stack: THREE.Matrix4[] = [];

  /** Aplica `m` a tudo que for criado dentro de `fn` (cadeira posicionada, folha inclinada...). */
  with(m: THREE.Matrix4, fn: () => void) {
    const cur = this.stack.length ? this.stack[this.stack.length - 1]!.clone().multiply(m) : m.clone();
    this.stack.push(cur);
    fn();
    this.stack.pop();
  }

  private add(token: Token, g: THREE.BufferGeometry) {
    if (this.stack.length) g.applyMatrix4(this.stack[this.stack.length - 1]!);
    const flat = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
    this.list.push({ token, geometry: flat });
  }

  /** Caixa de cantos arredondados; `z0` é a base e (cx, cy) o centro em planta. */
  box(token: Token, cx: number, cy: number, z0: number, sx: number, sy: number, sz: number, r = 0.012) {
    const rr = Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4);
    const g = rr > 0.002 ? new RoundedBoxGeometry(sx, sy, sz, 2, rr) : new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, cy, z0 + sz / 2);
    this.add(token, g);
  }

  /** Caixa girada `rotXDeg` em torno do eixo x (pivô no centro), útil para encostos inclinados. */
  tilted(token: Token, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotXDeg: number, r = 0.02) {
    const rr = Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4);
    const g = new RoundedBoxGeometry(sx, sy, sz, 2, Math.max(0.002, rr));
    g.rotateX(rotXDeg * DEG);
    g.translate(cx, cy, cz);
    this.add(token, g);
  }

  /** Cilindro (ou tronco) com eixo vertical. */
  cyl(token: Token, cx: number, cy: number, z0: number, rTop: number, rBottom: number, h: number, seg = 20) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    g.rotateX(Math.PI / 2);
    g.translate(cx, cy, z0 + h / 2);
    this.add(token, g);
  }

  /** Cilindro com eixo em y (voltado para a frente): portas redondas, botões. */
  cylY(token: Token, cx: number, cy: number, cz: number, r: number, len: number, seg = 24) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.translate(cx, cy, cz);
    // eixo y do three já é o y do motor aqui: nada a girar
    this.add(token, g);
  }

  /** Cilindro com eixo em x. */
  cylX(token: Token, cx: number, cy: number, cz: number, r: number, len: number, seg = 16) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateZ(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.add(token, g);
  }

  sphere(token: Token, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seg = 14) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
    g.scale(rx, ry, rz);
    g.translate(cx, cy, cz);
    this.add(token, g);
  }

  cone(token: Token, cx: number, cy: number, z0: number, r: number, h: number, seg = 12) {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.rotateX(Math.PI / 2);
    g.translate(cx, cy, z0 + h / 2);
    this.add(token, g);
  }

  /** Anel (porta redonda da máquina), eixo em y. */
  ringY(token: Token, cx: number, cy: number, cz: number, R: number, tube: number) {
    const g = new THREE.TorusGeometry(R, tube, 10, 32);
    g.rotateX(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.add(token, g);
  }

  /** Funde por token. */
  build(): Part[] {
    const by = new Map<Token, THREE.BufferGeometry[]>();
    for (const p of this.list) {
      const a = by.get(p.token) ?? [];
      a.push(p.geometry);
      by.set(p.token, a);
    }
    const out: Part[] = [];
    for (const [token, geos] of by) {
      const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingBox();
      out.push({ token, geometry: merged });
      if (geos.length > 1) for (const g of geos) g.dispose();
    }
    return out;
  }
}

/** Matriz de translação + giro em z (graus) para posicionar sub-objetos. */
export function placeM(x: number, y: number, z = 0, rotZDeg = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(rotZDeg * DEG));
}

/** Caixa envolvente de todas as partes. */
export function partsBox(parts: Part[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  return box;
}
