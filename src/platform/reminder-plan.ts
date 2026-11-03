import type { Task } from '../types/domain';
export interface ReminderPreferences { quiet: boolean; quietStart: number; quietEnd: number }
export const defaultReminderPreferences: ReminderPreferences = { quiet: false, quietStart: 22, quietEnd: 8 };
export function reminderPlan(tasks: Task[], preferences: ReminderPreferences, now = new Date()) {
  return tasks.filter(task => !task.done && task.due && task.remind !== -1).flatMap(task => {
    const at = new Date(`${task.due}T${task.time || '08:00'}:00`);
    if (!Number.isFinite(at.getTime())) return [];
    const minutes = task.remind ?? (task.time ? 30 : 0);
    at.setMinutes(at.getMinutes() - minutes);
    if (at <= now) return [];
    const hour = at.getHours(); const { quietStart: start, quietEnd: end } = preferences;
    const inQuiet = start > end ? hour >= start || hour < end : hour >= start && hour < end;
    if (preferences.quiet && start !== end && inQuiet) {
      if (start > end && hour >= start) at.setDate(at.getDate() + 1);
      at.setHours(end, 0, 0, 0);
    }
    return [{ taskId: task.id, title: task.title, at }];
  }).sort((a,b) => a.at.getTime() - b.at.getTime()).slice(0, 60);
}
