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

/** Convert an explicitly approved proposal to the existing record contracts. */
export function proposedRecord(action:AssistantAction,id:string,created:number):import('../src/types/domain.js').Task|import('../src/types/domain.js').Note {
  if (action.type === 'add_task') return { id,created,kind:'task',title:action.title,q:([1,2,3,4] as const).find(q => q === action.priority) ?? 2,done:false,due:action.due,time:action.time,items:[] };
  if (action.type === 'add_note') return { id,created,kind:'note',type:'note',text:action.title };
  throw new Error('Completion requires an existing task.');
}
/** A user-chosen assistant name such as "Sara" or "سارة": 1–30 letters in any script, with spaces, apostrophes or hyphens. */
export const ASSISTANT_NAME = /^[\p{L}\p{M}][\p{L}\p{M} '’-]{0,29}$/u;
export function cleanAssistantName(value:string) { const name = value.trim().replace(/\s+/g,' '); return ASSISTANT_NAME.test(name) ? name : ''; }
