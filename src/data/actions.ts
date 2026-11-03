import { S, put, remove } from './store.js';
import { render } from '../shared/events.js';
type Action = { id: string; before: Record<string, unknown> | null; after: string; scope: string | null; label: string };
let last: Action | null = null;
export function rememberAction(id: string, before: Record<string, unknown> | null, label: string) {
  last = { id, before: before ? structuredClone(before) : null, after: JSON.stringify(S.items.get(id) ?? null), scope: localStorage.getItem('mk_active_scope'), label };
  render();
}
export function undoLabel() { return last?.scope === localStorage.getItem('mk_active_scope') ? last.label : ''; }
export async function undoLast() {
  const action = last; last = null;
  if (!action || action.scope !== localStorage.getItem('mk_active_scope')) return false;
  if (JSON.stringify(S.items.get(action.id) ?? null) !== action.after) { render(); return false; }
  if (action.before) await put(action.id, action.before); else await remove(action.id);
  return true;
}
