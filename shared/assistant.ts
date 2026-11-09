export interface AssistantAction {
  type: 'add_task' | 'complete_task' | 'add_note';
  title: string;
  due: string | null;
  time: string | null;
  targetId: string | null;
  /** Eisenhower quadrant 1–4 suggested by the assistant; null when unclear. */
  priority?: number | null;
}
export interface AssistantReply { reply:string; actions:AssistantAction[] }
export type ContextTask = { id:string; title:string; done:boolean; due:string|null; time:string|null; q:number };
/**
 * The workspace tasks sent with a message (at most 50), with their dates and times so the assistant can warn about
 * clashes: open tasks from today on come first, soonest first, then other open tasks, then finished ones.
 */
export function contextTasks(records:Array<Record<string, unknown>>, today:string, max = 50):ContextTask[] {
  const rank = (r:Record<string, unknown>) => r.done ? 2 : typeof r.due === 'string' && r.due >= today ? 0 : 1;
  const when = (r:Record<string, unknown>) => `${typeof r.due === 'string' ? r.due : '9999'} ${typeof r.time === 'string' ? r.time : '99'}`;
  return records.filter(r => r.kind === 'task' && typeof r.id === 'string' && typeof r.title === 'string')
    .sort((a, b) => rank(a) - rank(b) || when(a).localeCompare(when(b))).slice(0, max)
    .map(r => ({ id:String(r.id), title:String(r.title).slice(0, 500), done:!!r.done, due:typeof r.due === 'string' && r.due ? r.due : null,
      time:typeof r.time === 'string' && r.time ? r.time : null, q:([1, 2, 3, 4] as const).find(q => q === r.q) ?? 2 }));
}

/** Convert an explicitly approved proposal to the existing record contracts. */
export function proposedRecord(action:AssistantAction,id:string,created:number):import('./domain.js').Task|import('./domain.js').Note {
  if (action.type === 'add_task') return { id,created,kind:'task',title:action.title,q:([1,2,3,4] as const).find(q => q === action.priority) ?? 2,done:false,due:action.due,time:action.time,items:[] };
  if (action.type === 'add_note') return { id,created,kind:'note',type:'note',text:action.title };
  throw new Error('Completion requires an existing task.');
}
/** A user-chosen assistant name such as "Sara" or "سارة": 1–30 letters in any script, with spaces, apostrophes or hyphens. */
export const ASSISTANT_NAME = /^[\p{L}\p{M}][\p{L}\p{M} '’-]{0,29}$/u;
export function cleanAssistantName(value:string) { const name = value.trim().replace(/\s+/g,' '); return ASSISTANT_NAME.test(name) ? name : ''; }
