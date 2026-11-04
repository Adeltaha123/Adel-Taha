// Subscription plans and team roles, shared by the API (which enforces them) and the app (which explains them).
export type Plan = 'free'|'personal'|'team';
export type Role = 'owner'|'admin'|'member'|'viewer';
export const PLANS = {
  free:{ priceEgp:0, aiPerMonth:60 },
  personal:{ priceEgp:149, aiPerMonth:null },
  team:{ priceEgp:499, aiPerMonth:null, maxMembers:10 },
} as const;
/** A free account's AI and voice uses per calendar month; Personal, Team, and members of a paid team are unlimited. */
export const FREE_AI_PER_MONTH = PLANS.free.aiPerMonth;
export const TEAM_MAX_MEMBERS = PLANS.team.maxMembers;
export const monthKey = (now = new Date()) => `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
export type PromoPlan = 'personal'|'team'|'any';
/** A discount the super admin offers: a percentage off one plan's price (or any plan's). */
export interface Promo { code:string; plan:PromoPlan; percent:number; maxUses:number|null; uses:number; expires:number|null; active:boolean; note:string; created:number }
export interface PlanInfo {
  plan:Plan; until:number|null; active:boolean;
  aiUsed:number; aiLimit:number|null; coveredByTeam:string|null; contact:string;
  prices:{ personal:number; team:number };
  /** The promo code this account entered, if it is still valid. */
  promo:{ code:string; plan:PromoPlan; percent:number }|null;
  isAdmin:boolean;
}
/** A plan's monthly price after a promo code that applies to it, rounded to whole pounds. */
export const discountedPrice = (price:number, plan:'personal'|'team', promo:PlanInfo['promo']) =>
  promo && (promo.plan === 'any' || promo.plan === plan) ? Math.round(price * (100 - promo.percent) / 100) : price;

/** OpenAI prices in US dollars, entered by the super admin, used to estimate what each account costs. */
export interface AiPricing { chatInputPerM:number; chatOutputPerM:number; transcribeInputPerM:number; transcribeOutputPerM:number; transcribePerMinute:number }
/** Everything the super admin can change without a new release. */
export interface AppSettings { freeAiPerMonth:number; personalPrice:number; teamPrice:number; contact:string; pricing:AiPricing }
export const DEFAULT_SETTINGS:AppSettings = {
  freeAiPerMonth:PLANS.free.aiPerMonth, personalPrice:PLANS.personal.priceEgp, teamPrice:PLANS.team.priceEgp, contact:'',
  pricing:{ chatInputPerM:0, chatOutputPerM:0, transcribeInputPerM:0, transcribeOutputPerM:0, transcribePerMinute:0 },
};
export interface AiTotals { requests:number; inputTokens:number; outputTokens:number; audioSeconds:number; cost:number }
/** Estimated dollars for one kind of request's totals. Transcription may be billed per token or per minute. */
export function aiCost(pricing:AiPricing, kind:string, input:number, output:number, seconds:number) {
  return kind === 'transcribe'
    ? input / 1e6 * pricing.transcribeInputPerM + output / 1e6 * pricing.transcribeOutputPerM + seconds / 60 * pricing.transcribePerMinute
    : input / 1e6 * pricing.chatInputPerM + output / 1e6 * pricing.chatOutputPerM;
}

/** One account as the super admin sees it. Passwords are stored as one-way hashes and are never shown. */
export interface AdminUser {
  id:string; email:string; name:string; created:number|null; lastSeen:number|null; disabled:boolean; isAdmin:boolean;
  plan:Plan; until:number|null; active:boolean; promoCode:string|null; workspaces:number; records:number; ai:AiTotals;
}
export interface AdminOverview {
  month:string; users:number; activeLast30Days:number; newThisMonth:number; disabled:number;
  plans:Record<Plan,number>; ai:AiTotals; promosRedeemed:number;
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
