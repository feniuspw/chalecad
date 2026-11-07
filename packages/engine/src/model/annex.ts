import { dot3, sub3, type Vec2 } from '../geometry';
import type { Typology } from '../schema/project';
import type { HostWall, RoofPlane } from '../schema/results';
import { makePlane } from './planes';

type AFrame = Extract<Typology, { kind: 'a_frame' }>;
type WallSpec = Pick<HostWall, 'id' | 'kind' | 'from' | 'to' | 'outline'>;

const DEG = Math.PI / 180;
/** Pé-direito mínimo no lado baixo do anexo. */
const MIN_LOW_HEIGHT = 2.0;

export interface AnnexGeometry {
  side: 'left' | 'right';
  /** Água do A-frame recortada pelo anexo. */
  hostPlaneId: 'roof-a' | 'roof-b';
  y0: number;
  y1: number;
  /** Quanto sai para fora (eixo a eixo). */
  width: number;
  /** Distância horizontal, para dentro da base do A-frame, onde a água do anexo encontra a do A-frame. */
  reach: number;
  /** Cota desse encontro. */
  meetZ: number;
  height: number;
  lowHeight: number;
  walls: WallSpec[];
  roofPlane: RoofPlane;
  /** Retângulo do anexo em planta (eixo a eixo). */
  rect: { x0: number; x1: number; y0: number; y1: number };
  /** Cota da água do anexo num ponto x da planta. */
  roofZ: (x: number) => number;
}

/**
 * Geometria dos anexos laterais do A-frame. A água do anexo sobe em direção ao A-frame e continua para dentro
 * da linha da base até cruzar a água do A-frame (em `reach`, na cota `meetZ`). As paredes de ponta do anexo
 * fecham também esse trecho (triângulo entre as duas águas), por isso o contorno delas tem a base inclinada.
 * A água do anexo é um retângulo: nas pontas, o beiral segue reto até o encontro, por cima da água do A-frame.
 */
export function annexGeometry(t: AFrame): AnnexGeometry[] {
  const W = t.width;
  const D = t.depth;
  const k = t.kneeWallHeight;
  const tanP = (t.ridgeHeight - k) / (W / 2);
  return t.annexes.map((a) => {
    const y0 = a.offset;
    const y1 = a.offset + a.length;
    if (y1 > D + 1e-6) throw new Error(`O anexo ${lado(a.side)} passa do fundo do chalé.`);
    const ta = Math.tan(a.pitchDeg * DEG);
    if (ta >= tanP - 0.05) throw new Error(`A água do anexo ${lado(a.side)} precisa ser menos inclinada que a do A-frame.`);
    const H = a.height;
    if (H <= k + 0.3) throw new Error(`O anexo ${lado(a.side)} precisa ser pelo menos 30 cm mais alto que a mureta.`);
    const reach = (H - k) / (tanP - ta);
    const meetZ = H + reach * ta;
    if (reach > W / 2 - 0.3) throw new Error(`O anexo ${lado(a.side)} é alto demais: a água dele chegaria perto da cumeeira.`);
    const w = a.width;
    const low = H - w * ta;
    if (low < MIN_LOW_HEIGHT - 1e-9) {
      throw new Error(`O lado baixo do anexo ${lado(a.side)} fica com ${low.toFixed(2)} m: aumente a altura ou reduza a inclinação/largura.`);
    }
    const e = a.eave;
    const L = w + reach;
    // Contornos das paredes de ponta: começando pela ponta interna (tip) ou pelo canto externo (outer).
    const tip: Vec2[] = k > 0 ? [[reach, 0], [L, 0], [L, low], [0, meetZ], [reach, k]] : [[reach, 0], [L, 0], [L, low], [0, meetZ]];
    const outer: Vec2[] = k > 0 ? [[0, 0], [w, 0], [w, k], [L, meetZ], [0, low]] : [[0, 0], [w, 0], [L, meetZ], [0, low]];
    const id = (s: string) => `annex-${a.side}-${s}`;
    const rectOut = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];

    let walls: WallSpec[];
    let plan: Vec2[];
    let rect: AnnexGeometry['rect'];
    let roofZ: (x: number) => number;
    if (a.side === 'left') {
      walls = [
        { id: id('back'), kind: 'exterior', from: [reach, y1], to: [-w, y1], outline: tip },
        { id: id('side'), kind: 'exterior', from: [-w, y1], to: [-w, y0], outline: rectOut(a.length, low) },
        { id: id('front'), kind: 'exterior', from: [-w, y0], to: [reach, y0], outline: outer },
      ];
      plan = [[-w - e, y0 - e], [reach, y0 - e], [reach, y1 + e], [-w - e, y1 + e]];
      rect = { x0: -w, x1: 0, y0, y1 };
      roofZ = (x) => H + x * ta;
    } else {
      walls = [
        { id: id('front'), kind: 'exterior', from: [W - reach, y0], to: [W + w, y0], outline: tip },
        { id: id('side'), kind: 'exterior', from: [W + w, y0], to: [W + w, y1], outline: rectOut(a.length, low) },
        { id: id('back'), kind: 'exterior', from: [W + w, y1], to: [W - reach, y1], outline: outer },
      ];
      plan = [[W - reach, y0 - e], [W + w + e, y0 - e], [W + w + e, y1 + e], [W - reach, y1 + e]];
      rect = { x0: W, x1: W + w, y0, y1 };
      roofZ = (x) => H + (W - x) * ta;
    }
    const roofPlane = makePlane({
      id: id('roof'),
      plan,
      rising: a.side === 'left' ? [1, 0] : [-1, 0],
      slopeRad: a.pitchDeg * DEG,
      refPoint: a.side === 'left' ? [0, 0] : [W, 0],
      refZ: H,
    });
    roofPlane.outline = localOutline(roofPlane);
    return {
      side: a.side,
      hostPlaneId: a.side === 'left' ? 'roof-a' : 'roof-b',
      y0,
      y1,
      width: w,
      reach,
      meetZ,
      height: H,
      lowHeight: low,
      walls,
      roofPlane,
      rect,
      roofZ,
    };
  });
}

/** Contorno da água no referencial (u, v) dela. */
export function localOutline(p: RoofPlane): Vec2[] {
  return p.vertices.map((v): Vec2 => {
    const d = sub3(v, p.origin);
    return [dot3(d, p.uAxis), dot3(d, p.vAxis)];
  });
}

const lado = (s: 'left' | 'right') => (s === 'left' ? 'da esquerda' : 'da direita');
