/** DDL idempotente. Mantido igual ao de `scripts/migrate.mjs` (há um teste que compara os dois). */
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
] as const;
