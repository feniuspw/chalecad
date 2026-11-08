/**
 * Preparo assíncrono da apresentação: gera as texturas, carrega as fotos e calcula a paisagem e o terreno em etapas,
 * cedendo ao navegador entre elas (a tela nunca congela), com progresso de 0 a 1 e cancelamento por `AbortSignal`.
 * O resultado fica memorizado por uma assinatura do projeto (mais qualidade e cenário): entrar de novo com a mesma
 * assinatura é imediato. As texturas preparadas ficam retidas até a assinatura mudar.
 */
import { create } from 'zustand';
import type { BuildingModel, Project, TerrainReport } from '@chalecad/engine';
import { scenarioSprites, SCENARIOS, type ScenarioId } from './foliage';
import { getLandscapeData, type LandscapeOptions } from './landscapeData';
import { describePbr, hashStr, type PbrTier } from './pbr';
import { getPbrMaps, pbrPhotoReady, releasePbr, retainPbr } from './pbrTextures';
import { disposeSpriteTextures, getSpriteTexture } from './sprites';
import { buildTerrainBuffers, type TerrainBuffers } from './terrain';
import { bboxToThree } from './convert';

export interface PrepInput {
  project: Project;
  model: BuildingModel;
  terrain: TerrainReport | null;
  quality: 'high' | 'light';
  scenario: ScenarioId;
  vegetation: boolean;
}

export interface PrepResult {
  signature: string;
}

export interface PrepDeps {
  /** Cede o fio principal (padrão: `requestIdleCallback` com limite curto, ou `setTimeout(0)`). */
  yieldFn?: () => Promise<void>;
  /** Tempo máximo (ms) esperando as fotos. */
  photoTimeoutMs?: number;
}

/** Etapas e pesos (somam 1). */
export const PREP_STEPS = [
  { id: 'textures', label: 'Gerando texturas', weight: 0.55 },
  { id: 'photos', label: 'Carregando fotos', weight: 0.2 },
  { id: 'landscape', label: 'Montando a paisagem', weight: 0.15 },
  { id: 'terrain', label: 'Preparando o terreno', weight: 0.1 },
] as const;

export class PrepAborted extends Error {
  constructor() {
    super('Preparo cancelado');
    this.name = 'AbortError';
  }
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/** JSON com as chaves em ordem alfabética: o mesmo conteúdo dá sempre o mesmo texto. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

/** Assinatura do que a apresentação desenha: projeto (sem as anotações livres), qualidade, cenário e vegetação. */
export function presentationSignature(project: Project, quality: 'high' | 'light', scenario: ScenarioId, vegetation: boolean): string {
  const { notes: _notes, ...meta } = project.meta;
  void _notes;
  const json = stableStringify({ ...project, meta });
  const tail = `${quality}|${scenario}|${vegetation ? 1 : 0}`;
  return `${json.length}:${hashStr(json).toString(36)}:${hashStr(`${tail}|${json.split('').reverse().join('')}`).toString(36)}:${tail}`;
}

// ---------------------------------------------------------------------------
// Materiais usados
// ---------------------------------------------------------------------------

/** Materiais PBR (acabamentos, deck, telha, radier e chão do cenário) que a apresentação do projeto usa. */
export function presentationMaterials(project: Project, scenario: ScenarioId): string[] {
  const ids = new Set<string>(['roof_sandwich', 'concrete']);
  for (const r of project.rooms) {
    if (r.floor) ids.add(r.floor);
    if (r.walls) ids.add(r.walls);
  }
  if (project.finishes.facade) ids.add(project.finishes.facade);
  if (project.finishes.interiorRoof) ids.add(project.finishes.interiorRoof);
  for (const e of project.extras) {
    if (e.kind === 'deck') ids.add('deck_wood');
    if ('roof' in e && e.roof) ids.add('roof_sandwich');
  }
  const sc = SCENARIOS[scenario];
  ids.add(sc.ground.texture === 'sand' ? 'sand' : 'grass');
  if (scenario !== 'none') ids.add('gravel');
  return [...ids].filter((id) => !!describePbr(id));
}

// ---------------------------------------------------------------------------
// Terreno memorizado
// ---------------------------------------------------------------------------

const terrainCache = new WeakMap<TerrainReport['mesh'], Map<number, TerrainBuffers>>();

/** Buffers de render do terreno, memorizados por malha e escala de UV. */
export function getTerrainBuffers(mesh: TerrainReport['mesh'], uvScale: number): TerrainBuffers {
  let m = terrainCache.get(mesh);
  if (!m) terrainCache.set(mesh, (m = new Map()));
  let b = m.get(uvScale);
  if (!b) m.set(uvScale, (b = buildTerrainBuffers(mesh, uvScale)));
  return b;
}

// ---------------------------------------------------------------------------
// Estado e memória do que foi preparado
// ---------------------------------------------------------------------------

export interface PrepStatus {
  phase: 'idle' | 'preparing' | 'ready';
  /** 0 a 1. */
  progress: number;
  label: string;
  signature: string | null;
  /** A cena da apresentação está montando (overlay "Montando a cena…"). */
  mounting: boolean;
}

export const usePrepStatus = create<PrepStatus>()(() => ({ phase: 'idle', progress: 0, label: '', signature: null, mounting: false }));

let prepared: { signature: string; held: [string, PbrTier][] } | null = null;
let sceneActive = false;

/** A cena de apresentação está montada (impede descartar texturas de sprites em uso). */
export function setSceneActive(v: boolean): void {
  sceneActive = v;
}

export const isPrepared = (signature: string): boolean => prepared?.signature === signature;
export const hasPrepared = (): boolean => prepared !== null;

/** Solta as texturas retidas e esquece o preparo. */
export function releasePrepared(): void {
  if (!prepared) return;
  for (const [id, tier] of prepared.held) releasePbr(id, tier);
  prepared = null;
  if (!sceneActive) disposeSpriteTextures();
}

// ---------------------------------------------------------------------------
// Preparo
// ---------------------------------------------------------------------------

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => {
    const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve(), { timeout: 60 });
    else setTimeout(resolve, 0);
  });

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new PrepAborted();
}

/**
 * Prepara a apresentação para `input`. Chama `onProgress(0..1, rótulo)` a cada passo e cede ao navegador entre eles.
 * Rejeita com `PrepAborted` se `signal` abortar. As texturas ficam retidas até `releasePrepared()` ou até outro
 * preparo substituir este.
 */
export async function preparePresentation(signal: AbortSignal, onProgress: (progress: number, label: string) => void, input: PrepInput, deps: PrepDeps = {}): Promise<PrepResult> {
  const yieldFn = deps.yieldFn ?? defaultYield;
  const signature = presentationSignature(input.project, input.quality, input.scenario, input.vegetation);
  if (isPrepared(signature)) {
    onProgress(1, 'Pronto');
    return { signature };
  }
  releasePrepared(); // outro preparo (assinatura diferente) deixa de valer
  const tier: PbrTier = input.quality === 'high' ? 'high' : 'light';
  const materials = presentationMaterials(input.project, input.scenario);
  const held: [string, PbrTier][] = [];
  let done = 0;
  const report = (stepIdx: number, frac: number, label: string) => {
    const before = PREP_STEPS.slice(0, stepIdx).reduce((s, x) => s + x.weight, 0);
    onProgress(Math.min(1, before + PREP_STEPS[stepIdx]!.weight * Math.min(1, Math.max(0, frac))), label);
  };
  const cleanup = () => {
    for (const [id, t] of held) releasePbr(id, t);
  };
  try {
    onProgress(0, PREP_STEPS[0].label);
    await yieldFn();
    // 1. texturas: um material por etapa
    for (const id of materials) {
      throwIfAborted(signal);
      if (getPbrMaps(id, tier)) {
        retainPbr(id, tier);
        held.push([id, tier]);
      }
      done++;
      report(0, done / materials.length, PREP_STEPS[0].label);
      await yieldFn();
    }
    // 2. fotos (nunca esperam para sempre)
    throwIfAborted(signal);
    const photoWait = Math.max(0, deps.photoTimeoutMs ?? 8000);
    report(1, 0, PREP_STEPS[1].label);
    await Promise.race([
      Promise.all(held.map(([id, t]) => pbrPhotoReady(id, t))).then(() => undefined),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, photoWait);
        signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
      }),
    ]);
    throwIfAborted(signal);
    report(1, 1, PREP_STEPS[1].label);
    await yieldFn();
    // 3. folhagem e paisagem (funções puras, memorizadas por modelo)
    const b = bboxToThree(input.model.bbox);
    const opts: LandscapeOptions = {
      model: input.model,
      terrain: input.terrain,
      site: input.project.site,
      projectName: input.project.meta.name,
      center: [b.center[0], b.center[2]],
      radius: b.radius,
      groundY: b.min[1],
      scenario: input.scenario,
      vegetation: input.vegetation,
      quality: input.quality,
    };
    report(2, 0, PREP_STEPS[2].label);
    getLandscapeData(opts);
    await yieldFn();
    throwIfAborted(signal);
    if (input.vegetation && input.scenario !== 'none') {
      const ids = scenarioSprites(input.scenario);
      for (let i = 0; i < ids.length; i++) {
        getSpriteTexture(ids[i]!, input.quality === 'high' ? 1 : 0.5);
        report(2, (i + 1) / ids.length, PREP_STEPS[2].label);
        await yieldFn();
        throwIfAborted(signal);
      }
    }
    // 4. terreno
    report(3, 0, PREP_STEPS[3].label);
    if (input.terrain) getTerrainBuffers(input.terrain.mesh, 1);
    await yieldFn();
    throwIfAborted(signal);
    report(3, 1, PREP_STEPS[3].label);
  } catch (e) {
    cleanup();
    throw e;
  }
  prepared = { signature, held };
  return { signature };
}
