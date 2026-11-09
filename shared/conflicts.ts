import type { Task, Language } from './domain.js';
import { validDay } from './productivity.js';

// Warns when a task is scheduled at the same time as another open task, or close to one. It only warns: two things
// at once can be intended. Tasks with a date but no time are all-day and never clash.
export const NEAR_MINUTES = 60;
export type Slot = { id?:string; title?:string; due?:string|null; time?:string|null };
export type Clash = { title:string; time:string; minutes:number };
const minuteOf = (slot:Slot) => slot.due && validDay(slot.due) && slot.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)
  ? new Date(`${slot.due}T${slot.time}:00`).getTime() / 60_000 : null;

/** Open tasks (and other drafts) at the same time as the slot or within NEAR_MINUTES of it, closest first. */
export function scheduleClashes(slot:Slot, others:Slot[], near = NEAR_MINUTES):Clash[] {
  const at = minuteOf(slot);
  if (at === null) return [];
  return others
    .filter(other => other !== slot && (!slot.id || other.id !== slot.id) && !(other as Partial<Task>).done)
    .map(other => ({ other, at:minuteOf(other) }))
    .filter((v):v is { other:Slot; at:number } => v.at !== null && Math.abs(v.at - at) <= near)
    .map(({ other, at:theirs }) => ({ title:other.title?.trim() || '…', time:other.time!, minutes:Math.round(Math.abs(theirs - at)) }))
    .sort((a, b) => a.minutes - b.minutes);
}

/** One line for the closest clash, plus how many more there are. */
export function clashWarning(clashes:Clash[], language:Language) {
  const [first] = clashes;
  if (!first) return '';
  const title = first.title.length > 50 ? `${first.title.slice(0, 49)}…` : first.title, more = clashes.length - 1, ar = language === 'ar';
  const line = first.minutes === 0
    ? ar ? `⚠️ عندك «${title}» في نفس الوقت (${first.time})` : `⚠️ You already have “${title}” at the same time (${first.time})`
    : ar ? `⚠️ قريبة من «${title}» (${first.time}) — بينهم ${first.minutes} دقيقة` : `⚠️ ${first.minutes} min from “${title}” (${first.time})`;
  return more > 0 ? line + (ar ? ` و${more} غيرها` : ` and ${more} more`) : line;
}
