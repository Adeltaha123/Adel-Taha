import { DEFAULT_SETTINGS, monthKey, type AppSettings, type Plan, type PlanInfo, type PromoPlan } from '../shared/plans.js';
import type { Db } from './db.js';
import { PublicError } from './public-error.js';

const MONTH_MS = 30 * 86400_000;
type PlanRow = { plan:Plan; plan_until:number|null };

/** Settings the super admin changes in the panel, over the built-in defaults. SUBSCRIBE_CONTACT stays as a fallback. */
export async function getSettings(db:Db):Promise<AppSettings> {
  const row = await db.get<{ value:string }>("SELECT value FROM settings WHERE key='app'");
  const saved = row ? JSON.parse(row.value) as Partial<AppSettings> : {};
  return { ...DEFAULT_SETTINGS, contact:process.env.SUBSCRIBE_CONTACT?.trim() ?? '', ...saved, pricing:{ ...DEFAULT_SETTINGS.pricing, ...saved.pricing } };
}
export async function saveSettings(db:Db, settings:AppSettings) {
  await db.run("INSERT INTO settings VALUES ('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(settings));
  return settings;
}

export async function planOf(db:Db, userId:string, now = Date.now()) {
  const row = await db.get<PlanRow>('SELECT plan,plan_until FROM users WHERE id=?', userId);
  const plan = row?.plan ?? 'free', until = row?.plan_until ?? null;
  return { plan, until, active:plan !== 'free' && (until === null || until > now) };
}
/** A paid team covers its members' AI use; returns the first such team's name. */
async function coveringTeam(db:Db, userId:string, now:number) {
  const teams = await db.all<{ name:string; owner_id:string }>('SELECT w.name,w.owner_id FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? AND w.personal=0', userId);
  for (const team of teams) { const owner = await planOf(db,team.owner_id,now); if (owner.active && owner.plan === 'team') return team.name; }
  return null;
}
type PromoRow = { code:string; plan:PromoPlan; percent:number; max_uses:number|null; uses:number; expires:number|null; active:number };
const usable = (promo:PromoRow|undefined, now:number) => !!promo && !!promo.active && (promo.expires === null || promo.expires > now);
export async function planInfo(db:Db, userId:string, now = Date.now()):Promise<PlanInfo> {
  const [own, settings, user] = await Promise.all([planOf(db,userId,now), getSettings(db), db.get<{ promo_code:string|null; is_admin:number }>('SELECT promo_code,is_admin FROM users WHERE id=?', userId)]);
  const coveredByTeam = own.active ? null : await coveringTeam(db,userId,now);
  const used = await db.get<{ count:number }>('SELECT count FROM ai_usage WHERE user_id=? AND month=?', userId, monthKey(new Date(now)));
  const promo = user?.promo_code ? await db.get<PromoRow>('SELECT * FROM promo_codes WHERE code=?', user.promo_code) : undefined;
  return { ...own, aiUsed:used?.count ?? 0, aiLimit:own.active || coveredByTeam ? null : settings.freeAiPerMonth, coveredByTeam, contact:settings.contact,
    prices:{ personal:settings.personalPrice, team:settings.teamPrice },
    promo:usable(promo,now) ? { code:promo!.code, plan:promo!.plan, percent:promo!.percent } : null,
    isAdmin:Boolean(user?.is_admin) };
}
/** What OpenAI reported for one successful request. */
export interface AiUsage { kind:'chat'|'transcribe'; model:string; inputTokens?:number; outputTokens?:number; audioSeconds?:number }
const count = (value:unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
/** Refuses an AI or voice request when a free account has used this month's allowance; returns the function that records it once it succeeded. */
export async function useAi(db:Db, userId:string, now = Date.now()) {
  const info = await planInfo(db,userId,now);
  if (info.aiLimit !== null && info.aiUsed >= info.aiLimit) throw new PublicError(402,`You've used this month's ${info.aiLimit} free AI and voice requests. Upgrade to Personal for unlimited use.`,'ai_limit');
  return async (usage:AiUsage) => {
    await db.batch([
      ['INSERT INTO ai_usage VALUES (?,?,1) ON CONFLICT(user_id,month) DO UPDATE SET count=count+1', userId, monthKey(new Date(now))],
      ['INSERT INTO ai_events (user_id,at,kind,model,input_tokens,output_tokens,audio_seconds) VALUES (?,?,?,?,?,?,?)', userId, now, usage.kind, usage.model.slice(0,80), count(usage.inputTokens), count(usage.outputTokens), count(usage.audioSeconds)],
    ]);
  };
}
export async function requireTeamPlan(db:Db, ownerId:string) {
  const owner = await planOf(db,ownerId);
  if (!owner.active || owner.plan !== 'team') throw new PublicError(402,'Teams need an active Team plan for the team owner.','team_plan');
}
/** Sets a plan for an account, extending a current paid period of the same plan. Used by npm run plan and the admin panel. */
export async function setPlan(db:Db, email:string, plan:Plan, months = 1, now = Date.now()) {
  const user = await db.get<{ id:string }>('SELECT id FROM users WHERE email=?', email.toLowerCase());
  if (!user) throw new PublicError(404,`No account uses ${email}.`);
  const current = await planOf(db,user.id,now);
  const start = current.active && current.plan === plan && current.until ? current.until : now;
  const until = plan === 'free' ? null : start + months * MONTH_MS;
  await db.run('UPDATE users SET plan=?,plan_until=? WHERE id=?', plan, until, user.id);
  return { plan, until };
}
/** Every account and its plan, for npm run plan. */
export async function listPlans(db:Db, now = Date.now()) {
  const users = await db.all<{ id:string; email:string; name:string }>('SELECT id,email,name FROM users ORDER BY email');
  return Promise.all(users.map(async user => ({ email:user.email, name:user.name, ...await planOf(db,user.id,now) })));
}
/** Attaches a promo code to an account; a code counts once per account. */
export async function redeemPromo(db:Db, userId:string, code:string, now = Date.now()) {
  const normalized = code.trim().toUpperCase();
  const promo = await db.get<PromoRow>('SELECT * FROM promo_codes WHERE code=?', normalized);
  const invalid = () => new PublicError(404,'This promo code is not valid or has expired.','promo_invalid');
  if (!usable(promo,now)) throw invalid();
  const user = await db.get<{ promo_code:string|null }>('SELECT promo_code FROM users WHERE id=?', userId);
  if (user?.promo_code === normalized) return;
  // Counting the use is conditional, so the last available use cannot be taken twice.
  if (!await db.run('UPDATE promo_codes SET uses=uses+1 WHERE code=? AND (max_uses IS NULL OR uses<max_uses)', normalized)) throw new PublicError(409,'This promo code has been fully used.','promo_used_up');
  await db.run('UPDATE users SET promo_code=? WHERE id=?', normalized, userId);
}
