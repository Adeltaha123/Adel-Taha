import type { Task } from '../../types/domain';
export type Command = { kind: 'add'; title: string; due: string | null; time: string | null } | { kind: 'note'; text: string } | { kind: 'complete'; id: string; title: string };
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function parseCommand(input: string, tasks: Task[], now = new Date()): Command {
  let text = input.trim().replace(/[٠-٩]/g, value => String('٠١٢٣٤٥٦٧٨٩'.indexOf(value)));
  const note = text.match(/^(?:note|save note|ملاحظة|احفظ ملاحظة)\s+(.+)$/iu);
  if (note) return { kind: 'note', text: note[1]! };
  const complete = text.match(/^(?:complete|finish|mark done|أنجز|انجز|خلصت)\s+(.+)$/iu);
  if (complete) {
    const title = complete[1]!.trim().toLocaleLowerCase();
    const matches = tasks.filter(task => !task.done && task.title.trim().toLocaleLowerCase() === title);
    if (matches.length !== 1) throw new Error(matches.length ? 'Several tasks have that title. Complete the intended task from the task list.' : 'No open task matches that exact title.');
    return { kind: 'complete', id: matches[0]!.id, title: matches[0]!.title };
  }
  if (!/^(?:add(?: task)?|remind me to|أضف(?: مهمة)?|اضف(?: مهمة)?|ضيف(?: مهمة)?)\s+/iu.test(text)) throw new Error('Try “Add call Ahmed tomorrow at 10:30”, “Complete call Ahmed”, or “Note budget approved”.');
  text = text.replace(/^(?:add(?: task)?|remind me to|أضف(?: مهمة)?|اضف(?: مهمة)?|ضيف(?: مهمة)?)\s+/iu, '');
  let time: string | null = null;
  const clock = text.match(/\s+(?:at|الساعة|الساعه)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/iu);
  if (clock) {
    let hour = Number(clock[1]); const minute = Number(clock[2] ?? 0);
    if (minute > 59 || (clock[3] ? hour < 1 || hour > 12 : hour > 23)) throw new Error('Use a valid time, for example 15:30 or 3 pm.');
    if (clock[3]) hour = hour % 12 + (clock[3].toLowerCase() === 'pm' ? 12 : 0);
    time = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    text = text.slice(0, clock.index).trim();
  }
  let due: string | null = null;
  const day = text.match(/\s+(today|tomorrow|اليوم|النهاردة|بكرة|بكره|غداً|غدا)\s*$/iu);
  if (day) { const date = new Date(now); if (!/^(today|اليوم|النهاردة)$/iu.test(day[1]!)) date.setDate(date.getDate()+1); due = dayKey(date); text = text.slice(0, day.index).trim(); }
  if (time && !due) { const date = new Date(now); const [hours, minutes] = time.split(':').map(Number); date.setHours(hours!, minutes!, 0, 0); if (date <= now) date.setDate(date.getDate()+1); due = dayKey(date); }
  if (!text || text.length > 500) throw new Error('Use a task title between 1 and 500 characters.');
  return { kind: 'add', title: text, due, time };
}
