// One small async database interface for both runtimes: node:sqlite on a PC or VPS, and Cloudflare D1 in the
// Worker. D1 has no interactive transactions, so writes that must happen together go through batch(), and
// writes that depend on what is stored are single conditional statements whose change counts are checked.
export type Value = string | number | null;
export type Statement = [sql: string, ...params: Value[]];
export interface Db {
  get<T>(sql: string, ...params: Value[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: Value[]): Promise<T[]>;
  /** Returns how many rows changed. */
  run(sql: string, ...params: Value[]): Promise<number>;
  /** Runs all statements atomically and returns each one's change count. */
  batch(statements: Statement[]): Promise<number[]>;
}

/** Minimal shape of node:sqlite's DatabaseSync, so this file loads in the Worker without importing it. */
interface SyncDatabase {
  prepare(sql: string): { get(...p: Value[]): unknown; all(...p: Value[]): unknown[]; run(...p: Value[]): { changes: number | bigint } };
  exec(sql: string): void;
}
export function sqliteDb(db: SyncDatabase): Db {
  return {
    async get<T>(sql: string, ...params: Value[]) { return db.prepare(sql).get(...params) as T | undefined; },
    async all<T>(sql: string, ...params: Value[]) { return db.prepare(sql).all(...params) as T[]; },
    async run(sql, ...params) { return Number(db.prepare(sql).run(...params).changes); },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const changes = statements.map(([sql, ...params]) => Number(db.prepare(sql).run(...params).changes));
        db.exec('COMMIT');
        return changes;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

/** The part of Cloudflare's D1 binding used here (declared locally so Node and Worker types don't clash). */
interface D1Statement { bind(...params: Value[]): D1Statement; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes: number } }> }
export interface D1Database { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<{ meta: { changes: number } }[]> }
export function d1Db(d1: D1Database): Db {
  const bind = (sql: string, params: Value[]) => d1.prepare(sql).bind(...params);
  return {
    async get<T>(sql: string, ...params: Value[]) { return (await bind(sql, params).first<T>()) ?? undefined; },
    async all<T>(sql: string, ...params: Value[]) { return (await bind(sql, params).all<T>()).results; },
    async run(sql, ...params) { return (await bind(sql, params).run()).meta.changes; },
    async batch(statements) {
      if (!statements.length) return [];
      return (await d1.batch(statements.map(([sql, ...params]) => bind(sql, params)))).map(result => result.meta.changes);
    },
  };
}

const TABLES = [
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), personal INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS members (workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, PRIMARY KEY(workspace_id,user_id))',
  'CREATE TABLE IF NOT EXISTS invitations (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS records (workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL, data TEXT, PRIMARY KEY(workspace_id,id))',
  'CREATE TABLE IF NOT EXISTS preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires)',
  'CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, month TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id,month))',
  'CREATE TABLE IF NOT EXISTS oauth_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(provider,subject))',
  'CREATE TABLE IF NOT EXISTS oauth_flows (id TEXT PRIMARY KEY, provider TEXT NOT NULL, poll_hash TEXT NOT NULL, state_hash TEXT UNIQUE NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL, user_id TEXT, link_user TEXT, handoff_hash TEXT, return_url TEXT)',
];
// Columns added after the first release; existing databases gain them in place.
const COLUMNS: [table: string, column: string, definition: string][] = [
  ['users', 'plan', "TEXT NOT NULL DEFAULT 'free'"],
  ['users', 'plan_until', 'INTEGER'],
  ['records', 'created_by', 'TEXT'], // NULL for records from before team roles; any member may change those.
  ['invitations', 'role', "TEXT NOT NULL DEFAULT 'member'"],
  ['oauth_flows', 'handoff_hash', 'TEXT'],
  ['oauth_flows', 'return_url', 'TEXT'],
];
/** Creates or upgrades the schema; safe to run on every start. */
export async function migrate(db: Db) {
  for (const sql of TABLES) await db.run(sql);
  for (const [table, column, definition] of COLUMNS) {
    const existing = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!existing.some(c => c.name === column)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
