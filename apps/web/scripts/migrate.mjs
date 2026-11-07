// Cria as tabelas do SQLite (idempotente). Uso: `pnpm db:migrate`. Opcional: CHALECAD_DB_PATH.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mantido igual ao de lib/db/ddl.ts (há um teste que compara os dois).
export const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  typology TEXT NOT NULL,
  data TEXT NOT NULL,
  built_area REAL,
  total REAL,
  thumbnail TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS projects_updated_idx ON projects (updated_at)`,
  `CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS versions_project_idx ON versions (project_id, created_at)`,
];

export function migrate(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    for (const sql of DDL_STATEMENTS) db.exec(sql);
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.env.CHALECAD_DB_PATH ?? 'data/chalecad.sqlite');
  migrate(file);
  console.log(`Banco pronto em ${file}`);
}
