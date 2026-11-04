import type { Hono } from 'hono';
import { openDatabase } from './database.js';
import { sqliteDb, type Db } from './db.js';
import { buildApp, type ApiOptions } from './app.js';

/** A response shaped like the tests expect: status, raw body, headers, and parsed JSON. */
export interface Injected { statusCode: number; body: string; headers: Record<string, string>; json<T = any>(): T }
export interface NodeApi { app: Hono; db: Db; fetch: Hono['fetch']; inject(request: { method?: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<Injected>; close(): Promise<void> }

/** The API on node:sqlite, for the Node server (index.ts), tests, and maintenance scripts. */
export async function createApi(options: ApiOptions & { databasePath?: string } = {}): Promise<NodeApi> {
  const sqlite = openDatabase(options.databasePath ?? 'data/my-pa.sqlite');
  const db = sqliteDb(sqlite), app = buildApp(db, options);
  await app.request('/api/health'); // Runs the schema migration before the first real request.
  return {
    app, db, fetch: app.fetch,
    /** Calls the API in-process; an object payload is sent as JSON. */
    async inject({ method = 'GET', url, headers = {}, payload }) {
      const json = payload !== undefined && typeof payload !== 'string';
      const response = await app.request(url, { method, headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...headers }, ...(payload === undefined ? {} : { body: json ? JSON.stringify(payload) : String(payload) }) });
      const text = await response.text(), received: Record<string, string> = {};
      response.headers.forEach((value, key) => { received[key] = value; });
      return { statusCode: response.status, body: text, headers: received, json: () => JSON.parse(text) };
    },
    async close() { sqlite.close(); },
  };
}
export const apiDatabase = (api: NodeApi) => api.db;
