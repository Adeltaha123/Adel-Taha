import { FREE_AI_PER_MONTH, monthKey, type Plan, type PlanInfo } from '../shared/plans.js';
import type { Db } from './db.js';
import { PublicError } from './public-error.js';

const MONTH_MS = 30 * 86400_000;
type PlanRow = { plan:Plan; plan_until:number|null };
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
export async function planInfo(db:Db, userId:string, now = Date.now()):Promise<PlanInfo> {
  const own = await planOf(db,userId,now), coveredByTeam = own.active ? null : await coveringTeam(db,userId,now);
  const used = await db.get<{ count:number }>('SELECT count FROM ai_usage WHERE user_id=? AND month=?', userId, monthKey(new Date(now)));
  return { ...own, aiUsed:used?.count ?? 0, aiLimit:own.active || coveredByTeam ? null : FREE_AI_PER_MONTH, coveredByTeam, contact:process.env.SUBSCRIBE_CONTACT?.trim() ?? '' };
}
/** Refuses an AI or voice request when a free account has used this month's allowance; returns the function that counts it once it succeeded. */
export async function useAi(db:Db, userId:string, now = Date.now()) {
  const info = await planInfo(db,userId,now);
  if (info.aiLimit !== null && info.aiUsed >= info.aiLimit) throw new PublicError(402,`You've used this month's ${info.aiLimit} free AI and voice requests. Upgrade to Personal for unlimited use.`,'ai_limit');
  return async () => { await db.run('INSERT INTO ai_usage VALUES (?,?,1) ON CONFLICT(user_id,month) DO UPDATE SET count=count+1', userId, monthKey(new Date(now))); };
}
export async function requireTeamPlan(db:Db, ownerId:string) {
  const owner = await planOf(db,ownerId);
  if (!owner.active || owner.plan !== 'team') throw new PublicError(402,'Teams need an active Team plan for the team owner.','team_plan');
}
/** Sets a plan for an account, extending a current paid period of the same plan. Used by npm run plan. */
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
