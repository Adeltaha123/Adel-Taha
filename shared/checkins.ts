import type { Task } from '../src/types/domain.js';
import { validDay } from './productivity.js';
export const scheduleKey = (task:Task) => `${task.due ?? ''}T${task.time ?? ''}`;
export function checkInTime(task:Task):number|null {
  if(task.done || !task.due || !validDay(task.due) || !task.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.time) || task.checkInDismissedFor === scheduleKey(task)) return null;
  const due=new Date(`${task.due}T${task.time}:00`).getTime();
  return Number.isFinite(due) ? Math.max(due,task.checkInAfter ?? 0) : null;
}
export function upcomingCheckIns(tasks:Task[],now:number) {return tasks.map(task=>({task,at:checkInTime(task)})).filter((v):v is {task:Task;at:number}=>v.at!==null&&v.at>now).sort((a,b)=>a.at-b.at).slice(0,60);}
