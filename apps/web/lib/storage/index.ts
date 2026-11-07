import { IndexedDbAdapter } from './indexeddb';
import type { StorageAdapter } from './types';

let adapter: StorageAdapter | null = null;

/** Adaptador de armazenamento ativo. Por enquanto sempre IndexedDB (autosave local, offline). */
export function getStorage(): StorageAdapter {
  adapter ??= new IndexedDbAdapter();
  return adapter;
}

export type { ProjectSummary, ProjectVersion, StorageAdapter } from './types';
