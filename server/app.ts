import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { migrate, type Db, type Statement } from './db.js';
import { recordSchema } from './records.js';
import { registerAssistant, type AssistantOptions } from './assistant.js';
import { PublicError } from './public-error.js';
import { registerOAuth, type OAuthOptions } from './oauth.js';
import { HttpError, body, errorResponse, rateLimiter } from './http.js';
import { dummyCheck, hashPassword, needsRehash, verifyPassword } from './passwords.js';
import { ASSISTANT_NAME } from '../shared/assistant.js';
import { TEAM_MAX_MEMBERS, assignableRoles, canChangeMember, canManageTeam, canWrite, type Role } from '../shared/plans.js';
import { planInfo, redeemPromo, requireTeamPlan, useAi } from './plans.js';
import { registerAdmin } from './admin.js';
import type { CloudRecord, User, Workspace } from '../shared/api.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const credentials = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) });
const registration = credentials.extend({ name: z.string().trim().min(1).max(80) });
const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const syncSchema = z.object({ mutations: z.array(z.object({
  id: idSchema, expectedVersion: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()).nullable(),
})).max(100) });
const roleSchema = z.enum(['admin', 'member', 'viewer']);
const DAY_MS = 24 * 3600_000, SESSION_MS = 30 * DAY_MS;
const disabled = () => new HttpError(403, 'This account has been disabled. Contact the app owner.');
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export interface ApiOptions { origins?: string[]; rateLimit?: boolean; assistant?: AssistantOptions; oauth?: OAuthOptions }
export const DEFAULT_ORIGINS = ['http://localhost:8081', 'http://127.0.0.1:8081', 'https://adeltaha123.github.io'];

/** The whole API, independent of where it runs: server/node.ts serves it with node:sqlite, server/worker.ts on Cloudflare with D1. */
export function buildApp(db: Db, options: ApiOptions = {}) {
  const app = new Hono();
  const ready = migrate(db);
  const limit = rateLimiter(options.rateLimit !== false);
  app.onError(errorResponse);
  app.notFound(c => c.json({ error: 'Not found.' }, 404));
  app.use('*', cors({ origin: options.origins ?? DEFAULT_ORIGINS, allowMethods: ['GET', 'POST'], allowHeaders: ['Content-Type', 'Authorization'] }));
  app.use('*', async (c, next) => { await ready; await next(); c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff'); });
  app.use('/api/*', limit('all', 180));
  app.use('/api/*', async (c, next) => c.req.path === '/api/assistant/transcribe' ? next() : bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({ error: 'Request is too large.' }, 413) })(c, next));

  async function userFor(c: Context): Promise<User> {
    const token = c.req.header('authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{43})$/)?.[1];
    if (!token) throw new HttpError(401, 'Sign in to continue.');
    const now = Date.now();
    const row = await db.get<User & { expires: number; disabled: number; last_seen: number | null }>('SELECT u.id,u.email,u.name,u.disabled,u.last_seen,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?', hash(token), now);
    if (!row) throw new HttpError(401, 'Your session expired. Sign in again.');
    if (row.disabled) throw disabled();
    // Sliding expiry: a session in use is renewed (at most daily), so people sign in once per device.
    if (row.expires - now < SESSION_MS - DAY_MS) await db.run('UPDATE sessions SET expires=? WHERE hash=?', now + SESSION_MS, hash(token));
    // "Last active" for the admin panel, written at most hourly to keep database writes low.
    if (!row.last_seen || now - row.last_seen > 3600_000) await db.run('UPDATE users SET last_seen=? WHERE id=?', now, row.id);
    return { id: row.id, email: row.email, name: row.name };
  }
  async function workspaceFor(c: Context): Promise<{ user: User; workspace: Workspace; role: Role }> {
    const user = await userFor(c);
    const id = idSchema.parse(c.req.param('id'));
    const row = await db.get<Workspace & { role: Role }>('SELECT w.id,w.name,w.owner_id AS ownerId,w.personal,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=?', id, user.id);
    if (!row) throw new HttpError(404, 'Workspace not found.');
    const { role, ...workspace } = row;
    return { user, workspace: { ...workspace, personal: Boolean(row.personal) }, role };
  }
  /** The statements that create a workspace with its owner, for a batch with whatever else must happen together. */
  function workspaceStatements(userId: string, name: string, personal: boolean) {
    const workspace = { id: randomUUID(), name, ownerId: userId, personal };
    const statements: Statement[] = [
      ['INSERT INTO workspaces VALUES (?,?,?,?)', workspace.id, name, userId, Number(personal)],
      ['INSERT INTO members VALUES (?,?,?)', workspace.id, userId, 'owner'],
    ];
    return { workspace, statements };
  }
  async function session(user: User) {
    const token = randomBytes(32).toString('base64url');
    await db.batch([['DELETE FROM sessions WHERE expires<=?', Date.now()], ['INSERT INTO sessions VALUES (?,?,?)', hash(token), user.id, Date.now() + SESSION_MS]]);
    return { token, user };
  }

  registerAssistant(app, userFor, limit, options.assistant, user => useAi(db, user.id));
  registerOAuth(app, db, { session, workspaceStatements, userFor, limit }, options.oauth);
  app.get('/api/health', c => c.json({ ok: true }));
  app.get('/api/plan', async c => c.json(await planInfo(db, (await userFor(c)).id)));
  app.post('/api/plan/promo', limit('promo', 10), async c => {
    const user = await userFor(c), { code } = await body(c, z.object({ code: z.string().trim().min(1).max(40) }));
    await redeemPromo(db, user.id, code);
    return c.json(await planInfo(db, user.id));
  });

  // Per-user settings (not per workspace), so they follow the person to every device and are never shared with a team.
  const preferences = z.object({ language: z.enum(['en', 'ar']).optional(), theme: z.enum(['system', 'light', 'dark']).optional(), assistantName: z.string().trim().regex(ASSISTANT_NAME).optional() }).strict();
  app.get('/api/preferences', async c => {
    const row = await db.get<{ data: string }>('SELECT data FROM preferences WHERE user_id=?', (await userFor(c)).id);
    return c.json(row ? JSON.parse(row.data) : {});
  });
  app.post('/api/preferences', async c => {
    const user = await userFor(c), next = await body(c, preferences);
    const row = await db.get<{ data: string }>('SELECT data FROM preferences WHERE user_id=?', user.id);
    const merged = { ...(row ? JSON.parse(row.data) : {}), ...next };
    await db.run('INSERT INTO preferences VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data', user.id, JSON.stringify(merged));
    return c.json(merged);
  });

  const taken = () => new HttpError(409, 'Unable to register with this email. Try signing in.');
  app.post('/api/auth/register', limit('auth', 10), async c => {
    const input = await body(c, registration);
    if (await db.get('SELECT id FROM users WHERE email=?', input.email)) throw taken();
    const user = { id: randomUUID(), name: input.name, email: input.email };
    const personal = workspaceStatements(user.id, 'Personal', true);
    // The email column is unique, so a registration racing this one fails here instead of creating a second account.
    try { await db.batch([['INSERT INTO users (id,email,name,password,created) VALUES (?,?,?,?,?)', user.id, user.email, user.name, await hashPassword(input.password), Date.now()], ...personal.statements]); }
    catch (error) { if (/UNIQUE/i.test(String(error))) throw taken(); throw error; }
    return c.json(await session(user), 201);
  });
  app.post('/api/auth/login', limit('auth', 10), async c => {
    const input = await body(c, credentials);
    const row = await db.get<{ id: string; name: string; email: string; password: string; disabled: number }>('SELECT id,name,email,password,disabled FROM users WHERE email=?', input.email);
    const wrong = () => new HttpError(401, 'Email or password is incorrect.');
    if (!row) { await dummyCheck(input.password); throw wrong(); }
    if (!await verifyPassword(input.password, row.password)) throw wrong();
    if (row.disabled) throw disabled();
    if (needsRehash(row.password)) await db.run('UPDATE users SET password=? WHERE id=?', await hashPassword(input.password), row.id);
    return c.json(await session({ id: row.id, name: row.name, email: row.email }));
  });
  app.get('/api/auth/me', async c => c.json(await userFor(c)));
  app.post('/api/auth/logout', async c => {
    await userFor(c);
    await db.run('DELETE FROM sessions WHERE hash=?', hash(c.req.header('authorization')!.slice(7)));
    return c.json({ ok: true });
  });

  app.get('/api/workspaces', async c => {
    const user = await userFor(c);
    const rows = await db.all<Workspace>('SELECT w.id,w.name,w.owner_id AS ownerId,w.personal FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.personal DESC,w.name', user.id);
    return c.json(rows.map(w => ({ ...w, personal: Boolean(w.personal) })));
  });
  app.post('/api/workspaces', async c => {
    const user = await userFor(c);
    const { name } = await body(c, z.object({ name: z.string().trim().min(1).max(80) }));
    await requireTeamPlan(db, user.id);
    const team = workspaceStatements(user.id, name, false);
    await db.batch(team.statements);
    return c.json(team.workspace, 201);
  });
  app.get('/api/workspaces/:id/members', async c => {
    const { workspace } = await workspaceFor(c);
    return c.json(await db.all("SELECT u.id,u.name,u.email,m.role FROM users u JOIN members m ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,u.name", workspace.id));
  });
  const memberCount = async (workspaceId: string) => (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM members WHERE workspace_id=?', workspaceId))!.n;
  const teamFull = () => new PublicError(403, `This team already has ${TEAM_MAX_MEMBERS} members, the Team plan limit.`, 'team_full');
  app.post('/api/workspaces/:id/invitations', async c => {
    const { workspace, role } = await workspaceFor(c);
    const { role: invited } = await body(c, z.object({ role: roleSchema.default('member') }));
    if (workspace.personal || !canManageTeam(role)) throw new HttpError(403, 'Only the team owner or an admin can invite people.');
    if (!assignableRoles(role).includes(invited)) throw new HttpError(403, 'Only the team owner can invite admins.');
    await requireTeamPlan(db, workspace.ownerId);
    if (await memberCount(workspace.id) >= TEAM_MAX_MEMBERS) throw teamFull();
    const code = randomBytes(24).toString('base64url');
    await db.batch([['DELETE FROM invitations WHERE expires<=?', Date.now()], ['INSERT INTO invitations (hash,workspace_id,expires,role) VALUES (?,?,?,?)', hash(code), workspace.id, Date.now() + 7 * 86400_000, invited]]);
    return c.json({ code, expiresInDays: 7, role: invited });
  });
  /** Checks that the actor may change this member and returns the member's current role. */
  async function manageable(c: Context) {
    const { workspace, role, user } = await workspaceFor(c);
    const userId = idSchema.parse(c.req.param('userId'));
    const target = await db.get<{ role: Role }>('SELECT role FROM members WHERE workspace_id=? AND user_id=?', workspace.id, userId);
    if (!target) throw new HttpError(404, 'Member not found.');
    return { workspace, role, user, userId, target: target.role };
  }
  app.post('/api/workspaces/:id/members/:userId/role', async c => {
    const { workspace, role, userId, target } = await manageable(c);
    const { role: next } = await body(c, z.object({ role: roleSchema }));
    if (workspace.personal || !canChangeMember(role, target) || !assignableRoles(role).includes(next)) throw new HttpError(403, 'You cannot give this member that role.');
    await db.run('UPDATE members SET role=? WHERE workspace_id=? AND user_id=?', next, workspace.id, userId);
    return c.json({ ok: true });
  });
  // Removes a member, or lets members other than the owner leave. Their tasks stay with the team.
  app.post('/api/workspaces/:id/members/:userId/remove', async c => {
    const { workspace, role, user, userId, target } = await manageable(c);
    const leaving = userId === user.id && target !== 'owner';
    if (workspace.personal || (!leaving && !canChangeMember(role, target))) throw new HttpError(403, 'You cannot remove this member.');
    await db.run('DELETE FROM members WHERE workspace_id=? AND user_id=?', workspace.id, userId);
    return c.json({ ok: true });
  });
  app.post('/api/invitations/join', async c => {
    const user = await userFor(c);
    const { code } = await body(c, z.object({ code: z.string().min(20).max(100) }));
    const invite = await db.get<{ workspace_id: string; role: Role }>('SELECT workspace_id,role FROM invitations WHERE hash=? AND expires>?', hash(code), Date.now());
    if (!invite) throw new HttpError(404, 'Invitation is invalid, expired, or already used.');
    if (await memberCount(invite.workspace_id) >= TEAM_MAX_MEMBERS) throw teamFull();
    // Deleting first makes the code single use even when two people redeem it at the same moment.
    if (!await db.run('DELETE FROM invitations WHERE hash=?', hash(code))) throw new HttpError(404, 'Invitation is invalid, expired, or already used.');
    await db.run('INSERT OR IGNORE INTO members VALUES (?,?,?)', invite.workspace_id, user.id, invite.role);
    return c.json({ workspaceId: invite.workspace_id });
  });

  app.post('/api/workspaces/:id/sync', async c => {
    const { workspace, role, user } = await workspaceFor(c);
    const { mutations } = await body(c, syncSchema);
    if (new Set(mutations.map(m => m.id)).size !== mutations.length) throw new HttpError(400, 'Duplicate record IDs.');
    const members = new Set((await db.all<{ user_id: string }>('SELECT user_id FROM members WHERE workspace_id=?', workspace.id)).map(m => m.user_id));
    for (const mutation of mutations) {
      const data = mutation.data;
      if (!data) continue;
      recordSchema.parse(data);
      // Audio blobs and their device-specific database references remain local.
      delete data.audioId;
      if (data.id !== mutation.id || !['task', 'note', 'habit', 'voice', 'conversation'].includes(String(data.kind))) throw new HttpError(400, 'Unsupported record. Device security settings cannot be synced.');
      if (JSON.stringify(data).length > 100_000) throw new HttpError(400, 'Record is too large.');
      if (data.assigneeId && !members.has(String(data.assigneeId))) throw new HttpError(400, 'Assignee must be a workspace member.');
    }
    type Stored = { id: string; version: number; data: string | null; deleted: number; created_by: string | null };
    const stored = new Map<string, Stored>();
    for (const ids of chunks(mutations.map(m => m.id), 90)) { // D1 allows at most 100 bound parameters per query.
      for (const row of await db.all<Stored>(`SELECT id,version,data,deleted,created_by FROM records WHERE workspace_id=? AND id IN (${ids.map(() => '?').join(',')})`, workspace.id, ...ids)) stored.set(row.id, row);
    }
    // Changes the member's role does not allow are rejected; the app restores the stored version. Each write only
    // applies if the stored version is still the one checked here, so concurrent syncs turn into conflicts.
    const conflicts: string[] = [], rejected: string[] = [], writes: { id: string; statement: Statement }[] = [];
    for (const mutation of mutations) {
      const existing = stored.get(mutation.id);
      const serialized = mutation.data ? JSON.stringify(mutation.data) : null, deleted = Number(mutation.data === null);
      // An identical retry is already applied, including when the previous response was lost.
      if (existing && existing.data === serialized && Boolean(existing.deleted) === (mutation.data === null)) continue;
      if (!workspace.personal && !canWrite(role, user.id, existing ? { createdBy: existing.created_by, data: existing.data ? JSON.parse(existing.data) : null } : null, mutation.data)) { rejected.push(mutation.id); continue; }
      if ((existing?.version ?? 0) !== mutation.expectedVersion) { conflicts.push(mutation.id); continue; }
      writes.push({ id: mutation.id, statement: existing
        ? ['UPDATE records SET version=version+1,deleted=?,data=? WHERE workspace_id=? AND id=? AND version=?', deleted, serialized, workspace.id, mutation.id, existing.version]
        : ['INSERT INTO records (workspace_id,id,version,deleted,data,created_by) VALUES (?,?,1,?,?,?) ON CONFLICT(workspace_id,id) DO NOTHING', workspace.id, mutation.id, deleted, serialized, user.id] });
    }
    const changed = await db.batch(writes.map(w => w.statement));
    writes.forEach((w, i) => { if (!changed[i]) conflicts.push(w.id); });
    const rows = await db.all<{ id: string; version: number; deleted: number; data: string | null }>('SELECT id,version,deleted,data FROM records WHERE workspace_id=?', workspace.id);
    const records: CloudRecord[] = rows.map(row => ({ id: String(row.id), version: Number(row.version), deleted: Boolean(row.deleted), data: row.data ? JSON.parse(String(row.data)) : null }));
    return c.json({ records, conflicts, rejected });
  });

  registerAdmin(app, db, { userFor, limit });
  return app;
}
