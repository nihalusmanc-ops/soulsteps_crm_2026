import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// M2 starting schema. Not a claim of implemented API persistence.
export const users = sqliteTable('users', { id: text('id').primaryKey(), email: text('email').notNull().unique(), role: text('role', { enum: ['staff', 'manager'] }).notNull(), active: integer('active', { mode: 'boolean' }).notNull().default(true) });
