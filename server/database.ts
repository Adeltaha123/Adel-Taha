import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), personal INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS members (workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, PRIMARY KEY(workspace_id,user_id));
    CREATE TABLE IF NOT EXISTS invitations (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL, data TEXT, PRIMARY KEY(workspace_id,id));
    CREATE TABLE IF NOT EXISTS preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
  `);
  return db;
}
