import type { Task } from './domain.js';
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dayKey(date) === value;
}
/**
 * The task board box a task appears in. "Do now" and "Schedule" tasks with a date follow the date: today or overdue
 * shows in Do now (1), a later day in Schedule (2), so tomorrow's task moves into Do now when its day comes.
 * Delegate (3) and Drop (4) stay as chosen, and undated tasks keep their priority.
 */
export function boardQuadrant(task: { q?: number | null; due?: string | null }, today = dayKey()): 1 | 2 | 3 | 4 {
  const q = ([1, 2, 3, 4] as const).find(x => x === task.q) ?? 2;
  if ((q === 1 || q === 2) && task.due && validDay(task.due)) return task.due <= today ? 1 : 2;
  return q;
}
export function taskSummary(tasks: Task[], today = dayKey()) {
  const open = tasks.filter(t => !t.done);
  return { total:tasks.length, completed:tasks.filter(t => t.done).length, open:open.length,
    overdue:open.filter(t => t.due && t.due < today).length,
    today:open.filter(t => t.due === today).length,
    urgent:open.filter(t => boardQuadrant(t, today) === 1).length };
}
export function focusRemaining(end: number | null, now = Date.now()) { return end ? Math.max(0, Math.ceil((end-now)/1000)) : 0; }
