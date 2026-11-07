/**
 * Gera fixtures/model-gable.json: um BuildingModel coerente de um chalé 6,5 x 8,5 m.
 * Uso: node apps/web/fixtures/make-model.mjs
 *
 * Coordenadas do motor: [x, y, z], z para cima. Cumeeira paralela a y; empenas (ext-front e ext-back)
 * nas extremidades em y. Eixos das paredes sobre o retângulo 0..6,5 x 0..8,5, percorrido anti-horário
 * (interior à esquerda, exterior à direita).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 6.5; // largura (x)
const L = 8.5; // comprimento (y)
const H = 2.8; // pé-direito
const SLOPE = 35;
const EAVE = 0.6; // beiral nas águas (x)
const RAKE = 0.3; // beiral nas empenas (y)
const T = 0.14; // espessura de parede
const ROOF_T = 0.04;

const tan = Math.tan((SLOPE * Math.PI) / 180);
const cos = Math.cos((SLOPE * Math.PI) / 180);
const sin = Math.sin((SLOPE * Math.PI) / 180);
const rise = (W / 2) * tan;
const ridgeH = H + rise;
const r = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// --- paredes ---------------------------------------------------------------
const rect = (len, h) => [[0, 0], [len, 0], [len, h], [0, h]];
const gableOutline = [[0, 0], [W, 0], [W, H], [W / 2, ridgeH], [0, H]].map(([a, b]) => [r(a), r(b)]);

const wallBase = { level: 'ground', baseZ: 0, thickness: T, assemblyId: 'lsf-ext', exteriorSide: 'right', loadBearing: true, wet: false };
const walls = [
  { ...wallBase, id: 'ext-front', kind: 'gable', from: [0, 0], to: [W, 0], length: W, outline: gableOutline },
  { ...wallBase, id: 'ext-right', kind: 'exterior', from: [W, 0], to: [W, L], length: L, outline: rect(L, H) },
  { ...wallBase, id: 'ext-back', kind: 'gable', from: [W, L], to: [0, L], length: W, outline: gableOutline },
  { ...wallBase, id: 'ext-left', kind: 'exterior', from: [0, L], to: [0, 0], length: L, outline: rect(L, H) },
];

// --- aberturas ---------------------------------------------------------------
const op = (id, hostId, type, u0, u1, v0, v1) => ({ id, hostId, hostKind: 'wall', type, u0, u1, v0, v1, valid: true });
const openings = [
  op('op-win-front-1', 'ext-front', 'window', 0.8, 2.0, 0.9, 2.1),
  op('op-door-front', 'ext-front', 'door', 2.8, 3.7, 0, 2.1),
  op('op-win-front-2', 'ext-front', 'window', 4.5, 5.7, 0.9, 2.1),
  // ext-right vai de y=0 a y=L (u = y); ext-left vai de y=L a y=0 (u = L - y)
  op('op-win-right', 'ext-right', 'window', 3.4, 4.6, 0.9, 2.1),
  op('op-win-left', 'ext-left', 'window', 3.4, 4.6, 0.9, 2.1),
];

// --- telhado -----------------------------------------------------------------
const zEave = H - EAVE * tan;
const uLength = L + 2 * RAKE;
const vLength = (W / 2 + EAVE) / cos;
const roofArea = r(uLength * vLength, 2);
const roofPlanes = [
  {
    // água esquerda (-x), origem no beiral dos fundos, u = -y para que u x v aponte para fora
    id: 'roof-left',
    vertices: [
      [-EAVE, L + RAKE, zEave],
      [-EAVE, -RAKE, zEave],
      [W / 2, -RAKE, ridgeH],
      [W / 2, L + RAKE, ridgeH],
    ],
    origin: [-EAVE, L + RAKE, zEave],
    uAxis: [0, -1, 0],
    vAxis: [r(cos), 0, r(sin)],
  },
  {
    id: 'roof-right',
    vertices: [
      [W + EAVE, -RAKE, zEave],
      [W + EAVE, L + RAKE, zEave],
      [W / 2, L + RAKE, ridgeH],
      [W / 2, -RAKE, ridgeH],
    ],
    origin: [W + EAVE, -RAKE, zEave],
    uAxis: [0, 1, 0],
    vAxis: [-r(cos), 0, r(sin)],
  },
].map((p) => ({
  ...p,
  vertices: p.vertices.map((v) => v.map((n) => r(n))),
  origin: p.origin.map((n) => r(n)),
  slopeDeg: SLOPE,
  area: roofArea,
  uLength: r(uLength),
  vLength: r(vLength),
  isWall: false,
}));

// --- lajes -------------------------------------------------------------------
const slabs = [
  {
    id: 'radier', kind: 'radier', level: null, topZ: 0, thickness: 0.15,
    polygon: [[-T / 2, -T / 2], [W + T / 2, -T / 2], [W + T / 2, L + T / 2], [-T / 2, L + T / 2]],
    area: r((W + T) * (L + T), 2),
  },
  {
    id: 'mezz-1', kind: 'mezzanine', level: 'mezzanine', topZ: H, thickness: 0.2,
    polygon: [[0, 5], [W, 5], [W, L], [0, L]],
    area: r(W * (L - 5), 2),
  },
];

// --- escada reta: 16 espelhos, 15 degraus (o 16º é o piso do mezanino) -------------
const STEPS = 16;
const riser = H / STEPS;
const going = 0.28;
const stairW = 0.9;
const x0 = T / 2 + 0.03;
const yEnd = 5;
const y0 = yEnd - (STEPS - 1) * going;
const treadT = 0.05;
const treads = Array.from({ length: STEPS - 1 }, (_, i) => ({
  center: [r(x0 + stairW / 2), r(y0 + i * going + going / 2), r((i + 1) * riser - treadT / 2)],
  size: [stairW, going, treadT],
  rotationZDeg: 0,
}));
const stairs = [
  {
    id: 'stair-1', type: 'straight', treads, steps: STEPS, riser: r(riser), going,
    blondel: r(2 * riser + going), footprint: [[x0, y0], [x0 + stairW, y0], [x0 + stairW, yEnd], [x0, yEnd]].map((p) => p.map((n) => r(n))),
  },
];

const footprint = [[0, 0], [W, 0], [W, L], [0, L]];
const model = {
  typology: 'gable_mezzanine',
  footprint,
  footprintArea: r(W * L, 2),
  builtArea: r(W * L + W * (L - 5), 2),
  walls,
  roofPlanes,
  slabs,
  openings,
  stairs,
  ridgeHeight: r(ridgeH),
  bbox: { min: [-EAVE, -RAKE, -0.15], max: [W + EAVE, L + RAKE, r(ridgeH)] },
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'model-gable.json');
writeFileSync(out, JSON.stringify(model, null, 2) + '\n');
console.log(`ok: ${out} (cumeeira ${r(ridgeH, 3)} m, ${ROOF_T * 100} cm de placa)`);
