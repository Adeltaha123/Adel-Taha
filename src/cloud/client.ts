import { S, persist } from '../data/store.js';
import { render } from '../shared/events.js';
import type { CloudRecord, Member, SyncResult, User, Workspace } from '../../shared/api.js';
import { mutationsFor, mergeRecords, syncable } from '../../shared/sync.js';

// import.meta.env only exists under Vite; the JSDOM tests load this module directly.
const apiBase = (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '');
type RecordData = Record<string, unknown>;
type Session = { token: string; user: User };
type Baseline = Record<string, CloudRecord>;
const dataItems = () => Object.fromEntries([...S.items].filter(([, v]) => ['task', 'note', 'habit', 'voice'].includes(v.kind))) as Record<string, RecordData>;
const syncItems = () => syncable(dataItems());
const parse = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const session = (() => { try { return JSON.parse(sessionStorage.getItem('mk_session') ?? 'null') as Session | null; } catch { return null; } })();
export const cloud = { session, workspaces: [] as Workspace[], members: [] as Member[], active: '', status: 'Device only', busy: false, conflicts: [] as string[], lastSync: '' };
const changed = () => document.dispatchEvent(new Event('mypa:cloud'));
let scope = localStorage.getItem('mk_active_scope') ?? '';
let baseline: Baseline = {};
let syncing = false;
let autoTimer: ReturnType<typeof setTimeout>;

export async function api<T>(path: string, body?: unknown, timeout = 20_000): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(cloud.session ? { Authorization: `Bearer ${cloud.session.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json().catch(() => ({ error: 'The API is unavailable. Check its address and connection.' }));
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result as T;
}
function saveScope() {
  if (scope) localStorage.setItem(`mk_scope:${scope}`, JSON.stringify(dataItems()));
  else localStorage.setItem('mk_device_records', JSON.stringify(dataItems()));
}
function replaceItems(items: Record<string, RecordData>) {
  const settings = S.items.get('settings');
  // Keep references for unchanged rows so React.memo can skip rendering them.
  S.items = new Map(Object.entries(items).map(([id, data]) => {
    const current = S.items.get(id);
    return [id, current && JSON.stringify(current) === JSON.stringify(data) ? current : data];
  }));
  if (settings) S.items.set('settings', settings);
  persist(); render();
}
export async function refreshWorkspaces() {
  cloud.workspaces = await api<Workspace[]>('/workspaces');
  changed();
}
export async function selectWorkspace(id: string) {
  if (syncing) throw new Error('Wait for the current sync to finish.');
  if (!cloud.session || !cloud.workspaces.some(w => w.id === id)) throw new Error('Workspace unavailable.');
  const members = await api<Member[]>(`/workspaces/${id}/members`);
  const nextScope = `${cloud.session.user.id}:${id}`;
  if (scope !== nextScope) {
    saveScope(); scope = nextScope;
    localStorage.setItem('mk_active_scope', scope);
    replaceItems(parse(`mk_scope:${scope}`, {}));
  }
  cloud.active = id; cloud.members = members;
  baseline = parse(`mk_baseline:${scope}`, {});
  cloud.conflicts = parse(`mk_conflicts:${scope}`, []);
  cloud.status = 'Ready to sync'; changed();
  await syncNow();
}
export async function authenticate(mode: 'login' | 'register', form: { email: string; password: string; name?: string }) {
  cloud.session = await api<Session>(`/auth/${mode}`, form);
  sessionStorage.setItem('mk_session', JSON.stringify(cloud.session));
  await refreshWorkspaces();
  await selectWorkspace(cloud.workspaces[0]!.id);
}
export async function signOut() {
  if (syncing) throw new Error('Wait for the current sync to finish.');
  try { await api('/auth/logout', {}); } catch { /* Local sign-out also works offline. */ }
  saveScope(); scope = ''; localStorage.removeItem('mk_active_scope'); sessionStorage.removeItem('mk_session');
  cloud.session = null; cloud.active = ''; cloud.members = []; cloud.workspaces = []; cloud.conflicts = []; baseline = {};
  replaceItems(parse('mk_device_records', {}));
  cloud.status = 'Device only'; changed();
}
export function importDeviceRecords() {
  if (!scope) return;
  const source = parse<Record<string, RecordData>>('mk_device_records', {});
  // Copy only missing IDs; do not replace existing team records.
  for (const [id, data] of Object.entries(source)) if (!S.items.has(id)) S.items.set(id, { ...data, assigneeId: undefined });
  persist(); render();
  void syncNow();
}

export async function syncNow() {
  if (!cloud.session || !cloud.active || syncing) return;
  syncing = true; cloud.busy = true; cloud.status = 'Syncing…'; changed();
  const startingScope = scope;
  const before = JSON.parse(JSON.stringify(syncItems())) as Record<string, RecordData>;
  try {
    cloud.members = await api<Member[]>(`/workspaces/${cloud.active}/members`);
    const mutations = mutationsFor(before, baseline, cloud.conflicts);
    let result: SyncResult = { records: [], conflicts: [] };
    // Server applies at most 100 mutations per request; use bounded batches.
    const batches = mutations.length ? Array.from({ length: Math.ceil(mutations.length / 100) }, (_, i) => mutations.slice(i * 100, (i + 1) * 100)) : [[]];
    const conflicts = new Set(cloud.conflicts);
    for (const batch of batches) {
      result = await api<SyncResult>(`/workspaces/${cloud.active}/sync`, { mutations: batch });
      result.conflicts.forEach(id => conflicts.add(id));
    }
    if (scope !== startingScope) return;
    const merged = mergeRecords(before, dataItems(), result.records, [...conflicts]);
    for (const record of result.records) baseline[record.id] = record;
    cloud.conflicts = [...conflicts];
    localStorage.setItem(`mk_baseline:${scope}`, JSON.stringify(baseline));
    localStorage.setItem(`mk_conflicts:${scope}`, JSON.stringify(cloud.conflicts));
    replaceItems(merged); saveScope();
    cloud.lastSync = new Date().toLocaleTimeString();
    cloud.status = conflicts.size ? `${conflicts.size} conflict(s) need review` : 'Up to date';
  } catch (error) { cloud.status = `Pending — ${error instanceof Error ? error.message : 'connection unavailable'}`; }
  finally { syncing = false; cloud.busy = false; changed(); }
}
export function conflictRecord(id: string) { return { local: S.items.get(id), remote: baseline[id]?.data }; }
export function resolveConflict(id: string, choice: 'local' | 'remote') {
  if (syncing) return;
  if (choice === 'remote') {
    const remote = baseline[id];
    if (remote?.data) { const audioId = S.items.get(id)?.audioId; S.items.set(id, { ...remote.data, ...(audioId ? { audioId } : {}) }); } else S.items.delete(id);
  }
  cloud.conflicts = cloud.conflicts.filter(value => value !== id);
  localStorage.setItem(`mk_conflicts:${scope}`, JSON.stringify(cloud.conflicts));
  persist(); render(); changed(); void syncNow();
}
export async function initializeCloud() {
  if (cloud.session) {
    try {
      await api('/auth/me'); await refreshWorkspaces();
      const existing = cloud.workspaces.find(w => scope === `${cloud.session!.user.id}:${w.id}`);
      await selectWorkspace((existing ?? cloud.workspaces[0])!.id);
    } catch (error) { cloud.status = `Reconnect — ${error instanceof Error ? error.message : 'API unavailable'}`; changed(); }
  } else if (scope) {
    // A closed/expired session must not expose its active workspace as the guest workspace.
    localStorage.setItem(`mk_scope:${scope}`, JSON.stringify(dataItems()));
    scope = ''; localStorage.removeItem('mk_active_scope'); replaceItems(parse('mk_device_records', {}));
  }
  document.addEventListener('mypa:render', () => {
    if (!syncing && cloud.session && cloud.active) {
      saveScope(); clearTimeout(autoTimer); autoTimer = setTimeout(() => void syncNow(), 1800);
    }
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(); });
  setInterval(() => { if (!document.hidden) void syncNow(); }, 30_000);
}
