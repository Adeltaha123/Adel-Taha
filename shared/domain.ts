/** Contracts for new TypeScript features. Existing JS is migrated incrementally. */
export type Language = 'en' | 'ar';
export type Quadrant = 1 | 2 | 3 | 4;
export type Screen = 'today' | 'calendar' | 'tasks' | 'capture' | 'notes' | 'habits' | 'ask' | 'account' | 'commands' | 'reminders';

interface RecordBase {
  id: string;
  created?: number;
  updated?: number;
  example?: boolean;
}
export interface Task extends RecordBase {
  kind: 'task';
  title: string;
  q: Quadrant;
  done: boolean;
  due?: string | null;
  time?: string | null;
  remind?: number | null;
  top?: boolean;
  doneAt?: number | null;
  delegate?: string | null;
  assigneeId?: string;
  details?: string | null;
  items: Array<{ t: string; done: boolean }>;
  voiceId?: string;
  source?: string;
  said?: string;
  checkInAfter?: number;
  checkInDismissedFor?: string;
}
export interface Note extends RecordBase {
  kind: 'note';
  type: 'note' | 'journal';
  text: string;
  day?: string;
}
export interface Habit extends RecordBase {
  kind: 'habit';
  name: string;
  log: Record<string, boolean>;
}
export interface VoiceNote extends RecordBase {
  kind: 'voice';
  text: string;
  audioId?: string;
  dur?: number;
  organized?: boolean;
  summary?: string;
}
export interface Conversation {id:string;kind:'conversation';messages:Array<{id:string;role:'user'|'assistant';content:string}>;updated?:number;}
