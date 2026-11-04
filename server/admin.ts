import type { Context, Hono, MiddlewareHandler } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db.js';
import { body, HttpError } from './http.js';
import { hashPassword } from './passwords.js';
import { getSettings, listPlans, planOf, saveSettings, setPlan } from './plans.js';
import { aiCost, monthKey, type AdminOverview, type AdminUser, type AiTotals, type Plan, type Promo } from '../shared/plans.js';
import type { User } from '../shared/api.js';

// The super admin panel's API. Access: a signed-in account marked as super admin, or ADMIN_TOKEN (npm run plan).
const sha = (value: string) => createHash('sha256').update(value).digest();
const monthRange = (month: string) => {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return [Date.UTC(year, m - 1, 1), Date.UTC(year, m, 1)] as const;
};
const emptyTotals = (): AiTotals => ({ requests:0, inputTokens:0, outputTokens:0, audioSeconds:0, cost:0 });
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const pricingSchema = z.object({ chatInputPerM:z.number().min(0).max(10000), chatOutputPerM:z.number().min(0).max(10000), transcribeInputPerM:z.number().min(0).max(10000), transcribeOutputPerM:z.number().min(0).max(10000), transcribePerMinute:z.number().min(0).max(100) });
const settingsSchema = z.object({ freeAiPerMonth:z.number().int().min(0).max(10000), personalPrice:z.number().int().min(0).max(1_000_000), teamPrice:z.number().int().min(0).max(1_000_000), contact:z.string().trim().max(200), pricing:pricingSchema });

export function registerAdmin(app: Hono, db: Db, hooks: { userFor: (c: Context) => Promise<User>; limit: (name: string, max: number) => MiddlewareHandler }) {
  /** Returns the acting super admin, or null when the request used ADMIN_TOKEN. Anyone else gets a plain 404. */
  async function admin(c: Context): Promise<User | null> {
    const token = c.req.header('authorization')?.replace(/^Bearer /, '') ?? '', expected = process.env.ADMIN_TOKEN ?? '';
    if (expected.length >= 32 && timingSafeEqual(sha(token), sha(expected))) return null;
    const user = await hooks.userFor(c).catch(() => null);
    if (!user || !(await db.get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id=?', user.id))?.is_admin) throw new HttpError(404, 'Not found.');
    return user;
  }
  app.use('/api/admin/*', hooks.limit('admin', 120));

  /** This month's AI totals per user: requests from the monthly counter, tokens and cost from the request log. */
  async function aiByUser(month: string) {
    const [from, to] = monthRange(month), pricing = (await getSettings(db)).pricing, totals = new Map<string, AiTotals>();
    const get = (id: string) => totals.get(id) ?? totals.set(id, emptyTotals()).get(id)!;
    for (const row of await db.all<{ user_id: string; count: number }>('SELECT user_id,count FROM ai_usage WHERE month=?', month)) get(row.user_id).requests = row.count;
    for (const row of await db.all<{ user_id: string; kind: string; input: number; output: number; seconds: number }>('SELECT user_id,kind,SUM(input_tokens) AS input,SUM(output_tokens) AS output,SUM(audio_seconds) AS seconds FROM ai_events WHERE at>=? AND at<? GROUP BY user_id,kind', from, to)) {
      const t = get(row.user_id);
      t.inputTokens += row.input; t.outputTokens += row.output; t.audioSeconds += row.seconds;
      t.cost += aiCost(pricing, row.kind, row.input, row.output, row.seconds);
    }
    return totals;
  }

  app.get('/api/admin/overview', async c => {
    await admin(c);
    const month = monthSchema.parse(c.req.query('month') ?? monthKey()), [from] = monthRange(month), now = Date.now();
    const users = await db.all<{ id: string; created: number | null; last_seen: number | null; disabled: number; promo_code: string | null }>('SELECT id,created,last_seen,disabled,promo_code FROM users');
    const plans: Record<Plan, number> = { free:0, personal:0, team:0 };
    for (const user of users) { const p = await planOf(db, user.id, now); plans[p.active ? p.plan : 'free']++; }
    const ai = emptyTotals();
    for (const t of (await aiByUser(month)).values()) { ai.requests += t.requests; ai.inputTokens += t.inputTokens; ai.outputTokens += t.outputTokens; ai.audioSeconds += t.audioSeconds; ai.cost += t.cost; }
    const overview: AdminOverview = { month, users:users.length, activeLast30Days:users.filter(u => u.last_seen && now - u.last_seen < 30 * 86400_000).length,
      newThisMonth:users.filter(u => u.created && u.created >= from).length, disabled:users.filter(u => u.disabled).length, plans, ai, promosRedeemed:users.filter(u => u.promo_code).length };
    return c.json(overview);
  });

  app.get('/api/admin/users', async c => {
    await admin(c);
    const month = monthSchema.parse(c.req.query('month') ?? monthKey()), q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 100), now = Date.now();
    const rows = await db.all<{ id: string; email: string; name: string; created: number | null; last_seen: number | null; disabled: number; is_admin: number; promo_code: string | null; workspaces: number; records: number }>(
      `SELECT u.id,u.email,u.name,u.created,u.last_seen,u.disabled,u.is_admin,u.promo_code,
        (SELECT COUNT(*) FROM members m WHERE m.user_id=u.id) AS workspaces,
        (SELECT COUNT(*) FROM records r JOIN workspaces w ON w.id=r.workspace_id WHERE w.owner_id=u.id AND r.deleted=0) AS records
       FROM users u ${q ? 'WHERE lower(u.email) LIKE ? OR lower(u.name) LIKE ?' : ''} ORDER BY COALESCE(u.last_seen,0) DESC, u.email`, ...(q ? [`%${q}%`, `%${q}%`] : []));
    const ai = await aiByUser(month);
    const users: AdminUser[] = await Promise.all(rows.map(async r => ({ id:r.id, email:r.email, name:r.name, created:r.created, lastSeen:r.last_seen, disabled:Boolean(r.disabled), isAdmin:Boolean(r.is_admin),
      ...await planOf(db, r.id, now), promoCode:r.promo_code, workspaces:r.workspaces, records:r.records, ai:ai.get(r.id) ?? emptyTotals() })));
    return c.json(users);
  });

  const userAction = z.object({
    plan:z.enum(['free', 'personal', 'team']).optional(), months:z.number().int().min(1).max(36).default(1),
    disabled:z.boolean().optional(), isAdmin:z.boolean().optional(), password:z.string().min(10).max(128).optional(),
    resetAi:z.boolean().optional(), clearPromo:z.boolean().optional(),
  });
  app.post('/api/admin/users/:id', async c => {
    const actor = await admin(c), id = z.string().min(1).max(120).parse(c.req.param('id')), input = await body(c, userAction);
    const target = await db.get<{ email: string }>('SELECT email FROM users WHERE id=?', id);
    if (!target) throw new HttpError(404, 'Account not found.');
    // A super admin cannot lock themselves out by mistake.
    if (actor?.id === id && (input.disabled || input.isAdmin === false)) throw new HttpError(400, 'You cannot disable or demote your own account.');
    if (input.plan) await setPlan(db, target.email, input.plan, input.months);
    if (input.disabled !== undefined) await db.batch([['UPDATE users SET disabled=? WHERE id=?', Number(input.disabled), id], ...(input.disabled ? [['DELETE FROM sessions WHERE user_id=?', id] as [string, string]] : [])]);
    if (input.isAdmin !== undefined) await db.run('UPDATE users SET is_admin=? WHERE id=?', Number(input.isAdmin), id);
    // A new password signs the account out everywhere; the old password cannot be read, only replaced.
    if (input.password) await db.batch([['UPDATE users SET password=? WHERE id=?', await hashPassword(input.password), id], ['DELETE FROM sessions WHERE user_id=?', id]]);
    if (input.resetAi) await db.run('DELETE FROM ai_usage WHERE user_id=? AND month=?', id, monthKey());
    if (input.clearPromo) await db.run('UPDATE users SET promo_code=NULL WHERE id=?', id);
    return c.json({ ok:true });
  });

  type PromoRow = { code: string; plan: Promo['plan']; percent: number; max_uses: number | null; uses: number; expires: number | null; active: number; note: string; created: number };
  const promo = (r: PromoRow): Promo => ({ code:r.code, plan:r.plan, percent:r.percent, maxUses:r.max_uses, uses:r.uses, expires:r.expires, active:Boolean(r.active), note:r.note, created:r.created });
  app.get('/api/admin/promos', async c => { await admin(c); return c.json((await db.all<PromoRow>('SELECT * FROM promo_codes ORDER BY created DESC')).map(promo)); });
  app.post('/api/admin/promos', async c => {
    await admin(c);
    const input = await body(c, z.object({ code:z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, 'Use 3–30 letters, digits, - or _.'), plan:z.enum(['personal', 'team', 'any']), percent:z.number().int().min(1).max(100),
      maxUses:z.number().int().min(1).max(1_000_000).nullable().default(null), expiresInDays:z.number().int().min(1).max(3650).nullable().default(null), note:z.string().trim().max(200).default('') }));
    const code = input.code.toUpperCase();
    try { await db.run('INSERT INTO promo_codes (code,plan,percent,max_uses,uses,expires,active,created,note) VALUES (?,?,?,?,0,?,1,?,?)', code, input.plan, input.percent, input.maxUses, input.expiresInDays ? Date.now() + input.expiresInDays * 86400_000 : null, Date.now(), input.note); }
    catch (error) { if (/UNIQUE|PRIMARY/i.test(String(error))) throw new HttpError(409, 'That code already exists.'); throw error; }
    return c.json(promo((await db.get<PromoRow>('SELECT * FROM promo_codes WHERE code=?', code))!), 201);
  });
  app.post('/api/admin/promos/:code', async c => {
    await admin(c);
    const { active } = await body(c, z.object({ active:z.boolean() }));
    if (!await db.run('UPDATE promo_codes SET active=? WHERE code=?', Number(active), c.req.param('code').toUpperCase())) throw new HttpError(404, 'Promo code not found.');
    return c.json({ ok:true });
  });

  app.get('/api/admin/settings', async c => { await admin(c); return c.json(await getSettings(db)); });
  app.post('/api/admin/settings', async c => { await admin(c); return c.json(await saveSettings(db, await body(c, settingsSchema))); });

  // npm run plan (ADMIN_TOKEN) keeps working.
  app.get('/api/admin/plans', async c => { await admin(c); return c.json(await listPlans(db)); });
  app.post('/api/admin/plans', async c => {
    await admin(c);
    const input = await body(c, z.object({ email:z.string().email(), plan:z.enum(['free', 'personal', 'team']), months:z.number().int().min(1).max(36).default(1) }));
    return c.json(await setPlan(db, input.email, input.plan, input.months));
  });
}
