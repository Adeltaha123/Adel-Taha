import type { DatabaseSync } from 'node:sqlite';
import { FREE_AI_PER_MONTH, monthKey, type Plan, type PlanInfo } from '../shared/plans.js';
import { PublicError } from './public-error.js';

const MONTH_MS = 30 * 86400_000;
type PlanRow = { plan:Plan; plan_until:number|null };
export function planOf(db:DatabaseSync, userId:string, now = Date.now()) {
  const row = db.prepare('SELECT plan,plan_until FROM users WHERE id=?').get(userId) as PlanRow | undefined;
  const plan = row?.plan ?? 'free', until = row?.plan_until ?? null;
  return { plan, until, active:plan !== 'free' && (until === null || until > now) };
}
/** A paid team covers its members' AI use; returns the first such team's name. */
function coveringTeam(db:DatabaseSync, userId:string, now:number) {
  const teams = db.prepare('SELECT w.name,w.owner_id FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? AND w.personal=0').all(userId) as { name:string; owner_id:string }[];
  return teams.find(team => { const owner = planOf(db,team.owner_id,now); return owner.active && owner.plan === 'team'; })?.name ?? null;
}
export function planInfo(db:DatabaseSync, userId:string, now = Date.now()):PlanInfo {
  const own = planOf(db,userId,now), coveredByTeam = own.active ? null : coveringTeam(db,userId,now);
  const used = db.prepare('SELECT count FROM ai_usage WHERE user_id=? AND month=?').get(userId,monthKey(new Date(now))) as { count:number } | undefined;
  return { ...own, aiUsed:used?.count ?? 0, aiLimit:own.active || coveredByTeam ? null : FREE_AI_PER_MONTH, coveredByTeam, contact:process.env.SUBSCRIBE_CONTACT?.trim() ?? '' };
}
/** Refuses an AI or voice request when a free account has used this month's allowance; returns the function that counts it once it succeeded. */
export function useAi(db:DatabaseSync, userId:string, now = Date.now()) {
  const info = planInfo(db,userId,now);
  if (info.aiLimit !== null && info.aiUsed >= info.aiLimit) throw new PublicError(402,`You've used this month's ${info.aiLimit} free AI and voice requests. Upgrade to Personal for unlimited use.`,'ai_limit');
  return () => { db.prepare('INSERT INTO ai_usage VALUES (?,?,1) ON CONFLICT(user_id,month) DO UPDATE SET count=count+1').run(userId,monthKey(new Date(now))); };
}
export function requireTeamPlan(db:DatabaseSync, ownerId:string) {
  const owner = planOf(db,ownerId);
  if (!owner.active || owner.plan !== 'team') throw new PublicError(402,'Teams need an active Team plan for the team owner.','team_plan');
}
/** Sets a plan for an account, extending a current paid period of the same plan. Used by npm run plan. */
export function setPlan(db:DatabaseSync, email:string, plan:Plan, months = 1, now = Date.now()) {
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase()) as { id:string } | undefined;
  if (!user) throw new Error(`No account uses ${email}.`);
  const current = planOf(db,user.id,now);
  const start = current.active && current.plan === plan && current.until ? current.until : now;
  const until = plan === 'free' ? null : start + months * MONTH_MS;
  db.prepare('UPDATE users SET plan=?,plan_until=? WHERE id=?').run(plan,until,user.id);
  return { plan, until };
}
