/**
 * Cliente do Web Worker do motor (singleton). Se o Worker não puder ser criado ou falhar,
 * cai para o cálculo na thread principal, com aviso no console.
 */
import * as Comlink from 'comlink';
import type { EngineWorkerApi } from '../store/types';
import { createEngineApi } from './api';

let client: EngineWorkerApi | null = null;

function createClient(): EngineWorkerApi {
  const local = createEngineApi();
  let fallback = typeof Worker === 'undefined';
  let remote: Comlink.Remote<EngineWorkerApi> | null = null;
  let failure: Promise<never> | null = null;

  const useFallback = (why: unknown) => {
    if (!fallback) console.warn('[engine] Web Worker indisponível, calculando na thread principal:', why);
    fallback = true;
  };

  if (!fallback) {
    try {
      const worker = new Worker(new URL('../../workers/engine.worker.ts', import.meta.url), { type: 'module' });
      remote = Comlink.wrap<EngineWorkerApi>(worker);
      // Falha de carregamento do script não rejeita as chamadas pendentes: rejeita-as aqui.
      failure = new Promise<never>((_, reject) => {
        worker.addEventListener('error', (ev) => {
          useFallback(ev.message || 'erro ao carregar o worker');
          reject(new Error(ev.message || 'worker error'));
        });
      });
      failure.catch(() => {});
    } catch (e) {
      useFallback(e);
    }
  }

  const call = async <K extends keyof EngineWorkerApi>(method: K, args: Parameters<EngineWorkerApi[K]>): Promise<Awaited<ReturnType<EngineWorkerApi[K]>>> => {
    if (!fallback && remote && failure) {
      try {
        const fn = remote[method] as unknown as (...a: unknown[]) => Promise<Awaited<ReturnType<EngineWorkerApi[K]>>>;
        return await Promise.race([fn(...args), failure]);
      } catch (e) {
        useFallback(e);
      }
    }
    const fn = local[method] as unknown as (...a: unknown[]) => Promise<Awaited<ReturnType<EngineWorkerApi[K]>>>;
    return fn(...args);
  };

  return {
    compute: (project, opts) => call('compute', [project, opts]),
    validate: (json) => call('validate', [json]),
    computeMany: (projects) => call('computeMany', [projects]),
  };
}

export function getEngine(): EngineWorkerApi {
  client ??= createClient();
  return client;
}
