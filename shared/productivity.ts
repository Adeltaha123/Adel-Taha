import type { Task } from './domain.js';
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dayKey(date) === value;
}
export function taskSummary(tasks: Task[], today = dayKey()) {
  const open = tasks.filter(t => !t.done);
  return { total:tasks.length, completed:tasks.filter(t => t.done).length, open:open.length,
    overdue:open.filter(t => t.due && t.due < today).length,
    today:open.filter(t => t.due === today).length,
    urgent:open.filter(t => t.q === 1).length };
}
export function focusRemaining(end: number | null, now = Date.now()) { return end ? Math.max(0, Math.ceil((end-now)/1000)) : 0; }
