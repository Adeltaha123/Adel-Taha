// Subscription plans and team roles, shared by the API (which enforces them) and the app (which explains them).
export type Plan = 'free'|'personal'|'team';
export type Role = 'owner'|'admin'|'member'|'viewer';
export const PLANS = {
  free:{ priceEgp:0, aiPerMonth:20 },
  personal:{ priceEgp:149, aiPerMonth:null },
  team:{ priceEgp:499, aiPerMonth:null, maxMembers:10 },
} as const;
/** A free account's AI and voice uses per calendar month; Personal, Team, and members of a paid team are unlimited. */
export const FREE_AI_PER_MONTH = PLANS.free.aiPerMonth;
export const TEAM_MAX_MEMBERS = PLANS.team.maxMembers;
export const monthKey = (now = new Date()) => `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
export interface PlanInfo {
  plan:Plan; until:number|null; active:boolean;
  aiUsed:number; aiLimit:number|null; coveredByTeam:string|null; contact:string;
}

export const canManageTeam = (role:Role) => role === 'owner' || role === 'admin';
/** Roles the actor may give: only the owner makes admins; nobody makes another owner. */
export const assignableRoles = (actor:Role):Role[] => actor === 'owner' ? ['admin','member','viewer'] : actor === 'admin' ? ['member','viewer'] : [];
/** Whether the actor may change or remove a member who currently has the target role. */
export const canChangeMember = (actor:Role, target:Role) => target !== 'owner' && (actor === 'owner' || (actor === 'admin' && target !== 'admin'));

type Stored = { createdBy:string|null; data:Record<string,unknown>|null } | null;
/**
 * Team record permissions. Owners and admins change anything; viewers change nothing. Members create records,
 * change records they created or that are assigned to them (and records from before roles existed), and may
 * assign only to themselves.
 */
export function canWrite(role:Role, userId:string, existing:Stored, next:Record<string,unknown>|null) {
  if (role === 'owner' || role === 'admin') return true;
  if (role !== 'member') return false;
  const before = existing?.data ?? null;
  if (existing && existing.createdBy !== null && existing.createdBy !== userId && before?.assigneeId !== userId) return false;
  const assignee = next?.assigneeId;
  return assignee === undefined || assignee === null || assignee === userId || assignee === before?.assigneeId;
}
