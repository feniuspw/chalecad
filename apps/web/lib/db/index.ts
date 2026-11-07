/**
 * Acesso ao banco (somente servidor). `DATA_MODE=sqlite` (padrão) usa better-sqlite3 + Drizzle em
 * `./data/chalecad.sqlite` (relativo à raiz do app; `CHALECAD_DB_PATH` sobrescreve). `supabase` ainda não existe aqui.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DDL_STATEMENTS } from './ddl';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export class DbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbUnavailableError';
  }
}

export function dbFilePath(): string {
  return resolve(/*turbopackIgnore: true*/ process.env.CHALECAD_DB_PATH ?? 'data/chalecad.sqlite');
}

/** Abre (e migra) um arquivo SQLite. Use `:memory:` em testes se quiser. */
export function openDb(file: string): { db: Db; close: () => void } {
  if (file !== ':memory:') mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of DDL_STATEMENTS) sqlite.exec(sql);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}

const g = globalThis as unknown as { __chalecadDbs?: Map<string, { db: Db; close: () => void }> };

/** Conexão compartilhada (uma por arquivo, sobrevive ao hot reload). */
export function getDb(): Db {
  const mode = process.env.DATA_MODE ?? 'sqlite';
  if (mode === 'supabase') throw new DbUnavailableError('Supabase não configurado neste ambiente. Use DATA_MODE=sqlite.');
  if (mode !== 'sqlite') throw new DbUnavailableError(`DATA_MODE desconhecido: "${mode}". Use "sqlite".`);
  const file = dbFilePath();
  const cache = (g.__chalecadDbs ??= new Map());
  let h = cache.get(file);
  if (!h) {
    h = openDb(file);
    cache.set(file, h);
  }
  return h.db;
}

/** Fecha e esquece as conexões (testes). */
export function closeAllDbs(): void {
  for (const h of g.__chalecadDbs?.values() ?? []) h.close();
  g.__chalecadDbs?.clear();
}

export { schema };
