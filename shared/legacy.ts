import { validDay } from './productivity.js';

// Records saved by the first My PA web app (localStorage "mk_items": [id, record] pairs), converted to the
// current task/note/habit shapes. Sample data, settings and anything malformed are skipped, never guessed at.
type Plain = Record<string, unknown>;
const isObject = (value: unknown): value is Plain => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const kept = (record: Plain, keys: string[]) => Object.fromEntries(keys.filter(k => record[k] !== undefined && record[k] !== null).map(k => [k, record[k]]));

export function fromLegacyItems(entries: unknown): Record<string, Plain> {
  const out: Record<string, Plain> = {};
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !isObject(entry[1])) continue;
    const id = entry[0].slice(0, 120), r = entry[1];
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || r.example === true) continue;
    const times = { ...(number(r.created) ? { created: r.created } : {}), ...(number(r.updated) ? { updated: r.updated } : {}) };
    if (r.kind === 'task') {
      const title = text(r.title, 500);
      if (!title) continue;
      const q = [1, 2, 3, 4].includes(r.q as number) ? r.q : 2;
      const items = Array.isArray(r.items) ? r.items.filter(isObject).filter(i => typeof i.t === 'string').slice(0, 500).map(i => ({ t: String(i.t).slice(0, 5000), done: Boolean(i.done) })) : [];
      out[id] = { id, kind: 'task', title, q, done: Boolean(r.done), items,
        due: typeof r.due === 'string' && validDay(r.due) ? r.due : null,
        time: typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : null,
        ...times, ...kept(r, ['top', 'doneAt', 'details', 'source', 'said', 'delegate']) };
    } else if (r.kind === 'note') {
      const body = typeof r.text === 'string' ? r.text.slice(0, 100_000) : '';
      if (!body.trim()) continue;
      out[id] = { id, kind: 'note', type: r.type === 'journal' ? 'journal' : 'note', text: body, ...times, ...kept(r, ['day']) };
    } else if (r.kind === 'habit') {
      const name = text(r.name, 500);
      if (!name) continue;
      const log = isObject(r.log) ? Object.fromEntries(Object.entries(r.log).filter(([day, v]) => validDay(day) && typeof v === 'boolean')) : {};
      out[id] = { id, kind: 'habit', name, log, ...times };
    } else if (r.kind === 'voice') {
      // Voice notes become notes with their transcript; the recordings themselves stayed on the old device.
      const body = [text(r.summary, 50_000), text(r.text, 50_000)].filter(Boolean).join('\n\n');
      if (!body) continue;
      out[id] = { id, kind: 'note', type: 'note', text: body, ...times };
    }
  }
  return out;
}

/** What the old address hands to the new one when it forwards. */
export interface Transfer { v: 1; guest: Record<string, Plain>; legacy: unknown; pin?: string | null; language?: string }
