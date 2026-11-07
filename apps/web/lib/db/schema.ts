/** Schema Drizzle (SQLite). O JSON do projeto é a fonte de verdade; as demais colunas são resumo para a lista. */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    typology: text('typology').notNull(),
    /** Project serializado (JSON). */
    data: text('data').notNull(),
    builtArea: real('built_area'),
    total: real('total'),
    thumbnail: text('thumbnail'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('projects_updated_idx').on(t.updatedAt)],
);

export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    data: text('data').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('versions_project_idx').on(t.projectId, t.createdAt)],
);

export type ProjectRow = typeof projects.$inferSelect;
export type VersionRow = typeof versions.$inferSelect;
