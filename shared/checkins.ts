import type { Task, Language } from './domain.js';
import { dayKey, validDay } from './productivity.js';
export const scheduleKey = (task:Task) => `${task.due ?? ''}T${task.time ?? ''}`;
/** How long after the due time the follow-up asks whether the task was done. */
export const FOLLOW_UP_MS = 60 * 60_000;
/** A task with a date but no time is reminded about on the morning of its day and asked about in the evening. */
export const DAY_REMINDER = '09:00', DAY_FOLLOW_UP = '20:00';
const validTime = (time:string|null|undefined): time is string => !!time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function checkInTime(task:Task):number|null {
  if(task.done || !task.due || !validDay(task.due) || (task.time && !validTime(task.time)) || task.checkInDismissedFor === scheduleKey(task)) return null;
  const due=new Date(`${task.due}T${task.time || DAY_REMINDER}:00`).getTime();
  return Number.isFinite(due) ? Math.max(due,task.checkInAfter ?? 0) : null;
}
/** 'due' reminds at the task's time; 'followup' asks later whether it was done. A snoozed task only gets the follow-up. */
export type CheckInKind = 'due'|'followup';
export function checkInsFor(task:Task):{kind:CheckInKind;at:number}[] {
  const at=checkInTime(task);
  if(at===null) return [];
  if(task.checkInAfter && at===task.checkInAfter) return [{kind:'followup',at}];
  const evening=new Date(`${task.due}T${DAY_FOLLOW_UP}:00`).getTime();
  return [{kind:'due',at},{kind:'followup',at:task.time ? at+FOLLOW_UP_MS : Math.max(evening,at+FOLLOW_UP_MS)}];
}
export function upcomingCheckIns(tasks:Task[],now:number) {
  return tasks.flatMap(task=>checkInsFor(task).map(c=>({task,...c}))).filter(v=>v.at>now).sort((a,b)=>a.at-b.at).slice(0,60);
}
/** Moves a task to the same time tomorrow and clears its snooze/dismissal, so it is checked in on again. */
export function moveToTomorrow(task:Task, now=new Date()):Task {
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  const { checkInAfter:_a, checkInDismissedFor:_d, ...rest } = task;
  return { ...rest, due:dayKey(next) };
}

// Notification wording: a greeting for the time of day the notification arrives, then a short line about the task.
// A few phrasings rotate per task so repeated reminders don't read like a template.
const pick = <T,>(task:Task, options:T[]) => options[[...task.id].reduce((sum,c)=>sum+c.charCodeAt(0),0) % options.length]!;
function greeting(at:number, language:Language, name:string) {
  const hour=new Date(at).getHours(), first=name.trim().split(/\s+/)[0] ?? '';
  const [ar,en,emoji]=hour<12?['صباح الخير','Good morning','☀️']:hour<17?['أهلاً','Hi','👋']:['مساء الخير','Good evening','🌙'];
  return language==='ar' ? `${ar}${first?` يا ${first}`:''} ${emoji}` : `${en}${first?`, ${first}`:''} ${emoji}`;
}
export function checkInMessage(task:Task, kind:CheckInKind, at:number, language:Language, name='') {
  const title=task.title.length>80?`${task.title.slice(0,79)}…`:task.title;
  const allDay = !task.time;
  const body = kind==='due' && allDay
    ? language==='ar' ? `📋 النهاردة: «${title}»` : `📋 Today: “${title}”`
    : kind==='due'
    ? language==='ar'
      ? pick(task,[`⏰ حان وقت «${title}»`,`⏰ ميعاد «${title}» دلوقتي`,`⏰ فاكر «${title}»؟ ده وقتها`])
      : pick(task,[`⏰ It's time for “${title}”`,`⏰ “${title}” is up now`,`⏰ Quick reminder: “${title}”`])
    : allDay
    ? language==='ar' ? `خلّصت «${title}» النهاردة؟ ✅` : `Did you get “${title}” done today? ✅`
    : language==='ar'
      ? pick(task,[`عدّت ساعة على «${title}»، خلّصتها؟ ✅`,`إيه أخبار «${title}»؟ خلصت؟`,`«${title}» تمّت؟ لو لسه أأجلها لك.`])
      : pick(task,[`An hour since “${title}”. Did you get it done? ✅`,`How did “${title}” go? All done?`,`Is “${title}” done? If not, I can move it.`]);
  return { title:greeting(at,language,name), body };
}
