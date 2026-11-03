import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { openDatabase } from './database.js';
import { recordSchema } from './records.js';
import { registerAssistant, type AssistantOptions } from './assistant.js';
import { PublicError } from './public-error.js';
import { registerOAuth,type OAuthOptions } from './oauth.js';
import { ASSISTANT_NAME } from '../shared/assistant.js';
import type { CloudRecord, User, Workspace } from '../shared/api.js';

const scrypt = promisify(scryptCallback);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const credentials = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) });
const registration = credentials.extend({ name: z.string().trim().min(1).max(80) });
const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const syncSchema = z.object({ mutations: z.array(z.object({
  id: idSchema, expectedVersion: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()).nullable(),
})).max(100) });
class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }

export async function createApi(options: { databasePath?: string; origins?: string[]; rateLimit?: boolean; assistant?:AssistantOptions;oauth?:OAuthOptions } = {}) {
  const db = openDatabase(options.databasePath ?? 'data/my-pa.sqlite');
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024, logger: false });
  const origins = options.origins ?? ['http://localhost:8081', 'http://127.0.0.1:8081', 'https://adeltaha123.github.io'];
  await app.register(cors, { origin: origins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] });
  if (options.rateLimit !== false) await app.register(rateLimit, { max: 180, timeWindow: '1 minute' });
  app.addHook('onClose', async () => db.close());
  app.addHook('onSend', async (_req, reply) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff'); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid request', details: error.issues.map(i => i.message) });
    const status = (error as HttpError).statusCode ?? 500;
    reply.code(status).send({ error: status >= 500 && !(error instanceof PublicError) ? 'The server could not complete this request.' : (error as Error).message });
  });

  const DAY_MS = 24 * 3600_000, SESSION_MS = 30 * DAY_MS;
  function userFor(request: FastifyRequest): User {
    const token = request.headers.authorization?.match(/^Bearer ([a-zA-Z0-9_-]{43})$/)?.[1];
    if (!token) throw new HttpError(401, 'Sign in to continue.');
    const now = Date.now();
    const row = db.prepare('SELECT u.id,u.email,u.name,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').get(hash(token), now) as unknown as (User & { expires: number }) | undefined;
    if (!row) throw new HttpError(401, 'Your session expired. Sign in again.');
    // Sliding expiry: a session in use is renewed (at most daily), so people sign in once per device.
    if (row.expires - now < SESSION_MS - DAY_MS) db.prepare('UPDATE sessions SET expires=? WHERE hash=?').run(now + SESSION_MS, hash(token));
    const { expires: _, ...user } = row;
    return user;
  }
  function workspaceFor(request: FastifyRequest): { user: User; workspace: Workspace } {
    const user = userFor(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const row = db.prepare('SELECT w.id,w.name,w.owner_id AS ownerId,w.personal FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=?').get(id, user.id) as unknown as Workspace | undefined;
    if (!row) throw new HttpError(404, 'Workspace not found.');
    return { user, workspace: { ...row, personal: Boolean(row.personal) } };
  }
  function createWorkspace(userId: string, name: string, personal: boolean) {
    const id = randomUUID();
    db.prepare('INSERT INTO workspaces VALUES (?,?,?,?)').run(id, name, userId, Number(personal));
    db.prepare('INSERT INTO members VALUES (?,?,?)').run(id, userId, 'owner');
    return { id, name, ownerId: userId, personal };
  }
  function session(user: User) {
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, Date.now() + SESSION_MS);
    return { token, user };
  }
  registerAssistant(app,userFor,options.assistant);
  registerOAuth(app,db,{session,createWorkspace,userFor},options.oauth);
  const authConfig = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  app.get('/api/health', async () => ({ ok: true }));
  // Per-user settings (not per workspace), so they follow the person to every device and are never shared with a team.
  const preferences = z.object({ language: z.enum(['en', 'ar']).optional(), theme: z.enum(['system', 'light', 'dark']).optional(), assistantName: z.string().trim().regex(ASSISTANT_NAME).optional() }).strict();
  app.get('/api/preferences', async request => {
    const row = db.prepare('SELECT data FROM preferences WHERE user_id=?').get(userFor(request).id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : {};
  });
  app.post('/api/preferences', async request => {
    const user = userFor(request), next = preferences.parse(request.body);
    const row = db.prepare('SELECT data FROM preferences WHERE user_id=?').get(user.id) as { data: string } | undefined;
    const merged = { ...(row ? JSON.parse(row.data) : {}), ...next };
    db.prepare('INSERT INTO preferences VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(user.id, JSON.stringify(merged));
    return merged;
  });
  app.post('/api/auth/register', { config: authConfig }, async (request, reply) => {
    const body = registration.parse(request.body);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(body.email)) throw new HttpError(409, 'Unable to register with this email. Try signing in.');
    const salt = randomBytes(16).toString('hex');
    const digest = (await scrypt(body.password, salt, 64) as Buffer).toString('hex');
    // Hashing yields to other registrations; recheck before the atomic insert.
    if (db.prepare('SELECT id FROM users WHERE email=?').get(body.email)) throw new HttpError(409, 'Unable to register with this email. Try signing in.');
    const user = { id: randomUUID(), name: body.name, email: body.email };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id, user.email, user.name, `${salt}:${digest}`);
      createWorkspace(user.id, 'Personal', true);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return reply.code(201).send(session(user));
  });
  app.post('/api/auth/login', { config: authConfig }, async request => {
    const body = credentials.parse(request.body);
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(body.email) as { id: string; name: string; email: string; password: string } | undefined;
    const [salt, expected] = (row?.password ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':') as [string, string];
    const digest = await scrypt(body.password, salt, 64) as Buffer;
    if (!row || !timingSafeEqual(digest, Buffer.from(expected, 'hex'))) throw new HttpError(401, 'Email or password is incorrect.');
    return session({ id: row.id, name: row.name, email: row.email });
  });
  app.get('/api/auth/me', async request => userFor(request));
  app.post('/api/auth/logout', async request => {
    userFor(request);
    db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(request.headers.authorization!.slice(7)));
    return { ok: true };
  });
  app.get('/api/workspaces', async request => {
    const user = userFor(request);
    return (db.prepare('SELECT w.id,w.name,w.owner_id AS ownerId,w.personal FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.personal DESC,w.name').all(user.id) as unknown as Workspace[]).map(w => ({ ...w, personal: Boolean(w.personal) }));
  });
  app.post('/api/workspaces', async (request, reply) => {
    const user = userFor(request);
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(request.body);
    return reply.code(201).send(createWorkspace(user.id, name, false));
  });
  app.get('/api/workspaces/:id/members', async request => {
    const { workspace } = workspaceFor(request);
    return db.prepare('SELECT u.id,u.name,u.email,m.role FROM users u JOIN members m ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.role DESC,u.name').all(workspace.id);
  });
  app.post('/api/workspaces/:id/invitations', async request => {
    const { workspace, user } = workspaceFor(request);
    if (workspace.personal || workspace.ownerId !== user.id) throw new HttpError(403, 'Only a team owner can create invitations.');
    const code = randomBytes(24).toString('base64url');
    db.prepare('DELETE FROM invitations WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO invitations VALUES (?,?,?)').run(hash(code), workspace.id, Date.now() + 7 * 86400_000);
    return { code, expiresInDays: 7 };
  });
  app.post('/api/invitations/join', async request => {
    const user = userFor(request);
    const { code } = z.object({ code: z.string().min(20).max(100) }).parse(request.body);
    const invite = db.prepare('SELECT workspace_id FROM invitations WHERE hash=? AND expires>?').get(hash(code), Date.now()) as { workspace_id: string } | undefined;
    if (!invite) throw new HttpError(404, 'Invitation is invalid, expired, or already used.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT OR IGNORE INTO members VALUES (?,?,?)').run(invite.workspace_id, user.id, 'member');
      db.prepare('DELETE FROM invitations WHERE hash=?').run(hash(code));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { workspaceId: invite.workspace_id };
  });
  app.post('/api/workspaces/:id/sync', async request => {
    const { workspace } = workspaceFor(request);
    const { mutations } = syncSchema.parse(request.body);
    if (new Set(mutations.map(m => m.id)).size !== mutations.length) throw new HttpError(400, 'Duplicate record IDs.');
    for (const mutation of mutations) {
      const data = mutation.data;
      if (!data) continue;
      recordSchema.parse(data);
      // Audio blobs and their device-specific database references remain local.
      delete data.audioId;
      if (data.id !== mutation.id || !['task', 'note', 'habit', 'voice','conversation'].includes(String(data.kind))) throw new HttpError(400, 'Unsupported record. Device security settings cannot be synced.');
      if (JSON.stringify(data).length > 100_000) throw new HttpError(400, 'Record is too large.');
      if (data.assigneeId && !db.prepare('SELECT user_id FROM members WHERE workspace_id=? AND user_id=?').get(workspace.id, String(data.assigneeId))) throw new HttpError(400, 'Assignee must be a workspace member.');
    }
    const conflicts: string[] = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const mutation of mutations) {
        const existing = db.prepare('SELECT version,data,deleted FROM records WHERE workspace_id=? AND id=?').get(workspace.id, mutation.id) as { version: number; data: string | null; deleted: number } | undefined;
        const serialized = mutation.data ? JSON.stringify(mutation.data) : null;
        // An identical retry is already applied, including when the previous response was lost.
        if (existing && existing.data === serialized && Boolean(existing.deleted) === (mutation.data === null)) continue;
        if ((existing?.version ?? 0) !== mutation.expectedVersion) { conflicts.push(mutation.id); continue; }
        db.prepare('INSERT INTO records VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET version=excluded.version,deleted=excluded.deleted,data=excluded.data').run(workspace.id, mutation.id, (existing?.version ?? 0) + 1, Number(mutation.data === null), serialized);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const records: CloudRecord[] = db.prepare('SELECT id,version,deleted,data FROM records WHERE workspace_id=?').all(workspace.id).map(row => ({ id: String(row.id), version: Number(row.version), deleted: Boolean(row.deleted), data: row.data ? JSON.parse(String(row.data)) : null }));
    return { records, conflicts };
  });
  return app;
}
