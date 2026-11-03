import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';
import type { Member, User, Workspace, SyncResult } from '../../../shared/api';
import { mergeRecords, mutationsFor, type Records, type Baseline } from '../../../shared/sync';
import { cleanAssistantName } from '../../../shared/assistant';
import { deleteSecret, getSecret, setSecret } from '../platform/secure';
type Session = { token:string; user:User };
type Scope = { records:Records; baseline:Baseline; conflicts:string[] };
type Theme = 'system'|'light'|'dark';
type Saved = { scopes:Record<string,Scope>; language:'en'|'ar'; focusEnd:number|null; activeScope?:string; theme?:Theme; assistantName?:string };
const empty = (): Scope => ({ records:{}, baseline:{}, conflicts:[] });
let saved: Saved = { scopes:{ guest:empty() }, language:'ar', focusEnd:null };
let state = { ready:false, scope:'guest', records:{} as Records, conflicts:[] as string[], session:null as Session|null,
  workspaces:[] as Workspace[], members:[] as Member[], busy:false, status:'', error:'', language:'ar' as 'en'|'ar', focusEnd:null as number|null, undo:false, theme:'system' as Theme, assistantName:'', askName:false };
const listeners = new Set<() => void>();
function patch(value: Partial<typeof state>) { if(Object.entries(value).every(([key,v])=>Object.is(state[key as keyof typeof state],v)))return; state = { ...state, ...value }; listeners.forEach(fn => fn()); }
export const useStore = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
let writes = Promise.resolve();
let undo: { scope:string; before:Records; after:Records } | null = null;
function persist() {
  const value = JSON.stringify(saved);
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem('mypa_expo_v1', value));
  void writes.catch(() => patch({ error:'Could not save on this device. Free storage and try again.' }));
}
function scopeData() { return saved.scopes[state.scope] ?? (saved.scopes[state.scope] = empty()); }
function setRecords(records:Records) { scopeData().records = records; patch({ records }); persist(); }
let syncTimer:ReturnType<typeof setTimeout>|undefined;
function queueSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { if (state.busy) queueSync(); else void sync().catch(() => {}); },1000); }
export function change(records: Records) { undo = { scope:state.scope, before:state.records, after:records }; setRecords(records); patch({ undo:true,status:state.scope === 'guest' ? (state.language === 'ar' ? 'محفوظ على الجهاز' : 'Saved on this device') : (state.language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') }); queueSync(); }
export function put<T extends { id:string }>(record:T) { change({ ...state.records, [record.id]:record as Record<string,unknown> }); }
export function remove(id:string) { const records = { ...state.records }; delete records[id]; change(records); }
export function undoChange() {
  if (!undo || undo.scope !== state.scope || JSON.stringify(state.records) !== JSON.stringify(undo.after)) { undo = null; patch({ undo:false }); return; }
  setRecords(undo.before); undo = null; patch({ undo:false }); queueSync();
}
// Signed-in preferences also live on the server, so a new phone starts with the same language and theme.
type Preferences = { language?:'en'|'ar'; theme?:Theme; assistantName?:string };
function savePreferences(value:Preferences) { if (state.session) void api('/preferences',value).catch(() => {}); }
export function setLanguage(language:'en'|'ar') { if (!state.ready) return; saved.language = language; patch({ language }); persist(); savePreferences({ language }); }
export function setTheme(theme:Theme) { saved.theme = theme; patch({ theme }); persist(); savePreferences({ theme }); }
/** The personal assistant's name the user picked ("My PA Sara"); an invalid or empty name is ignored. */
export function setAssistantName(value:string) {
  const assistantName = cleanAssistantName(value); if (!assistantName) return false;
  saved.assistantName = assistantName; patch({ assistantName,askName:false }); persist(); savePreferences({ assistantName }); return true;
}
export const skipAssistantName = () => patch({ askName:false });
async function loadPreferences() {
  const remote = await api<Preferences>('/preferences').catch(() => ({} as Preferences));
  if (remote.language) { saved.language = remote.language; patch({ language:remote.language }); }
  if (remote.theme) { saved.theme = remote.theme; patch({ theme:remote.theme }); }
  if (remote.assistantName) { saved.assistantName = remote.assistantName; patch({ assistantName:remote.assistantName }); }
  else if (state.assistantName) savePreferences({ assistantName:state.assistantName });
  if (remote.language || remote.theme) persist(); else savePreferences({ language:state.language, theme:state.theme });
}
export function setFocus(focusEnd:number|null) { saved.focusEnd = focusEnd; patch({ focusEnd }); persist(); }
export const clearError = () => patch({ error:'' });
export const reportError = (error:unknown) => patch({ error:error instanceof Error ? error.message : String(error) });
export async function initialize() {
  try {
    const raw = await AsyncStorage.getItem('mypa_expo_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as Saved;
      if (!parsed.scopes?.guest || !['en','ar'].includes(parsed.language)) throw new Error('Stored data could not be read. Do not clear app storage; restore a backup first.');
      saved = parsed;
    }
    const token = await getSecret('mypa_session'); // Kept until sign-out, so the app signs in once per device.
    patch({ ready:true, records:saved.scopes.guest!.records, language:saved.language, focusEnd:saved.focusEnd, theme:saved.theme ?? 'system', assistantName:saved.assistantName ?? '', session:token ? JSON.parse(token) : null });
    if (state.session) {
      if (saved.activeScope?.startsWith(`${state.session.user.id}:`) && saved.scopes[saved.activeScope]) patch({scope:saved.activeScope,records:saved.scopes[saved.activeScope]!.records,conflicts:saved.scopes[saved.activeScope]!.conflicts});
      try { await refresh(); const target = state.workspaces.find(w => state.scope.endsWith(`:${w.id}`)) ?? state.workspaces.find(w => w.personal); if (target) await selectWorkspace(target.id); } catch (e) { reportError(e); }
    }
  } catch (e) { reportError(e); }
}
// An explicit EXPO_PUBLIC_API_URL wins. In development without one (or with "auto"), use the computer
// serving the Metro bundle on API port 3001, so a changed Wi-Fi address doesn't break the phone.
function apiOrigin() {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
  if (configured && configured !== 'auto') return configured;
  const host = (Constants.expoConfig?.hostUri ?? '').split(':')[0] ?? '';
  if (__DEV__ && /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return `http://${host}:3001`;
  if (__DEV__ && Platform.OS === 'web') return 'http://localhost:3001';
  return '';
}
const fixedOrigin = apiOrigin();
export let origin = fixedOrigin;
// Without a fixed address (the published website), use the address the owner's PC published with
// npm run server:online. Its free tunnel address changes on every start, so it is looked up again after a failure.
const SERVER_ADDRESS = 'https://raw.githubusercontent.com/Adeltaha123/Adel-Taha/server-address/server.json';
let lookup:Promise<string>|null = null;
async function currentOrigin() {
  if (fixedOrigin) return fixedOrigin;
  lookup ??= fetch(`${SERVER_ADDRESS}?t=${Date.now()}`, { cache:'no-store' })
    .then(response => response.ok ? response.json() as Promise<{ api?:string|null }> : {})
    .then((value:{ api?:string|null }) => (origin = (value.api ?? '').replace(/\/$/, '')))
    .catch(() => '');
  const found = await lookup;
  if (!found) lookup = null;
  return found;
}
const ar = () => state.language === 'ar';
const offline = () => new Error(ar() ? 'خادم My PA غير متصل الآن. شغّله على الكمبيوتر بالأمر npm run server:online، أو تابع دون حساب.' : 'The My PA server is offline right now. Start it on your PC with npm run server:online, or continue offline.');
export async function api<T>(path:string, body?:unknown, timeout=15000,signal?:AbortSignal):Promise<T> {
  const origin = await currentOrigin();
  if (!origin) throw offline();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  try {
    let response:Response;
    try {
      response = await fetch(`${origin}/api${path}`, { method:body === undefined ? 'GET' : 'POST', signal:controller.signal,
        headers:{ 'Content-Type':'application/json', ...(state.session ? { Authorization:`Bearer ${state.session.token}` } : {}) },
        ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    } catch (e) {
      if (signal?.aborted) throw e;
      if (!fixedOrigin) { lookup = null; throw offline(); }
      throw new Error(ar() ? `تعذّر الوصول إلى خادم My PA على ${origin}. شغّل npm run expo:dev على الكمبيوتر وتأكد أن الهاتف على نفس شبكة Wi-Fi.` : `Can't reach the My PA server at ${origin}. Run npm run expo:dev on your computer and keep the phone on the same Wi-Fi.`);
    }
    const result = await response.json().catch(() => ({ error:'API returned an invalid response.' }));
    if (response.status === 401 && state.session && path !== '/auth/logout') await forgetSession();
    if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
    return result;
  } finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
}
export async function acceptSession(session:Session) {
  await setSecret('mypa_session',JSON.stringify(session));
  patch({session});await refresh();
}
export async function finishSignIn() { await loadPreferences(); const personal=state.workspaces.find(w=>w.personal);if(personal)await selectWorkspace(personal.id); }
export type SocialProvider = 'google'|'apple'|'facebook';
/* The browser signs in with the provider on the server; the server redirects back here with a one-time
   hand-off, and only this app (which holds the poll token) can exchange it for a session. */
export async function socialSignIn(provider:SocialProvider, link=false):Promise<'signed-in'|'linked'|'cancelled'> {
  if (state.busy) return 'cancelled';
  patch({ busy:true });
  let outcome:'signed-in'|'linked'|'cancelled' = 'cancelled';
  try {
    const flow = await api<{ flowId:string; pollToken:string; authorizeUrl:string; returnUrl:string }>('/auth/oauth/start',{ provider,link,returnUrl:Linking.createURL('auth') });
    const result = await WebBrowser.openAuthSessionAsync(flow.authorizeUrl,flow.returnUrl);
    if (result.type !== 'success') return outcome;
    const handoff = Linking.parse(result.url).queryParams?.handoff;
    if (typeof handoff !== 'string') throw new Error(ar() ? 'لم يكتمل تسجيل الدخول. حاول مرة أخرى.' : 'Sign-in did not finish. Please try again.');
    const done = await api<{ status:string; session?:Session }>('/auth/oauth/poll',{ flowId:flow.flowId,pollToken:flow.pollToken,handoff });
    if (done.status === 'linked') outcome = 'linked';
    else if (done.status === 'complete' && done.session) { await acceptSession(done.session); outcome = 'signed-in'; }
    else throw new Error(ar() ? 'لم يكتمل تسجيل الدخول. حاول مرة أخرى.' : 'Sign-in did not finish. Please try again.');
  } finally { patch({ busy:false }); }
  if (outcome === 'signed-in') { await finishSignIn(); if (!state.assistantName) patch({ askName:true }); } // Social sign-up skips the form, so ask for the name once.
  return outcome;
}
export const providers = () => api<Record<SocialProvider,{ enabled:boolean }>>('/auth/providers');
export async function refresh() { const workspaces = await api<Workspace[]>('/workspaces'); patch({ workspaces }); }
export async function authenticate(mode:'login'|'register', email:string, password:string, name:string, assistantName='') {
  if (state.busy) return;
  patch({ busy:true });
  try {
    const session = await api<Session>(`/auth/${mode}`, { email,password,name });
    await acceptSession(session);
    if (assistantName) setAssistantName(assistantName);
  } finally { patch({ busy:false }); }
  await finishSignIn();
}
export async function selectWorkspace(id:string) {
  if (state.busy || !state.session || !state.workspaces.some(w => w.id === id)) return;
  patch({ busy:true });
  try {
    const members = await api<Member[]>(`/workspaces/${id}/members`);
    const scope = `${state.session.user.id}:${id}`;
    const data = saved.scopes[scope] ?? (saved.scopes[scope] = empty());
    saved.activeScope = scope; undo = null; patch({ scope, records:data.records, conflicts:data.conflicts, members, undo:false }); persist();
  } finally { patch({ busy:false }); }
  await sync();
}
export async function signOut() {
  if (state.busy) return;
  patch({ busy:true });
  try {
    try { await api('/auth/logout', {}); } catch { /* Local logout works offline. */ }
    await forgetSession();
  } finally { patch({ busy:false }); }
}
/** Drops the session on this device and returns to device records; the server session is already gone or expired. */
async function forgetSession() {
  await deleteSecret('mypa_session');
  delete saved.assistantName; persist(); // The name belongs to the account, not the phone.
  undo = null; patch({ assistantName:'', askName:false, session:null, scope:'guest', records:saved.scopes.guest!.records, conflicts:[], members:[], workspaces:[], undo:false, status:'' });
}
export async function sync() {
  if (state.busy || !state.session || state.scope === 'guest') return;
  patch({ busy:true, status:'Syncing…' });
  const before = state.records, data = scopeData(), workspace = state.scope.split(':')[1];
  try {
    const members = await api<Member[]>(`/workspaces/${workspace}/members`);
    patch({ members });
    const mutations = mutationsFor(before, data.baseline, data.conflicts);
    const conflicts = new Set(data.conflicts);
    let result:SyncResult = { records:[], conflicts:[] };
    for (let i = 0; i < Math.max(1,mutations.length); i += 100) {
      result = await api<SyncResult>(`/workspaces/${workspace}/sync`, { mutations:mutations.slice(i,i+100) });
      result.conflicts.forEach(id => conflicts.add(id));
    }
    if(!mutations.length && !result.conflicts.length && result.records.every(r=>data.baseline[r.id]?.version===r.version)) {
      patch({status:data.conflicts.length?(state.language==='ar'?'راجع التعارضات في الحساب':'Review conflicts in Account'):(state.language==='ar'?'محفوظ في قاعدة البيانات':'Synced')});return;
    }
    const records = mergeRecords(before,state.records,result.records,[...conflicts]);
    result.records.forEach(r => { data.baseline[r.id] = r; });
    data.conflicts = [...conflicts]; setRecords(records);
    patch({ conflicts:data.conflicts, status:conflicts.size ? (state.language === 'ar' ? 'راجع التعارضات في الحساب' : 'Review conflicts in Account') : (state.language === 'ar' ? 'محفوظ في قاعدة البيانات' : 'Synced') });
  } catch (e) { patch({ status:state.language === 'ar' ? 'دون اتصال · تغييرات بانتظار الحفظ' : 'Offline / pending changes' }); throw e; }
  finally { patch({ busy:false }); }
}
export function conflictVersions(id:string) { return { local:state.records[id], remote:scopeData().baseline[id]?.data }; }
export function resolve(id:string, choice:'local'|'remote') {
  if (state.busy) return;
  const data = scopeData();
  if (choice === 'remote') {
    const records = { ...state.records }, remote = data.baseline[id]?.data;
    if (remote) records[id] = remote; else delete records[id];
    setRecords(records);
  }
  data.conflicts = data.conflicts.filter(value => value !== id); patch({ conflicts:data.conflicts }); persist();
}
export function importGuest() {
  if (state.scope === 'guest') return;
  const records = { ...state.records };
  for (const [id,record] of Object.entries(saved.scopes.guest!.records)) if (!records[id]) { records[id] = { ...record }; delete records[id]!.assigneeId; }
  change(records);
}
// What the voice task screen has heard or drafted but not saved yet, so closing the screen or the app keeps it.
export type VoiceDraft = { text:string; drafts:unknown[]; reply:string };
const VOICE_DRAFT = 'mypa_voice_task_draft';
export async function loadVoiceDraft():Promise<VoiceDraft|null> {
  try { const value = JSON.parse(await AsyncStorage.getItem(VOICE_DRAFT) ?? 'null') as VoiceDraft|null; return value && (value.text?.trim() || value.drafts?.length) ? value : null; } catch { return null; }
}
export function saveVoiceDraft(value:VoiceDraft|null) {
  void (value && (value.text.trim() || value.drafts.length) ? AsyncStorage.setItem(VOICE_DRAFT,JSON.stringify(value)) : AsyncStorage.removeItem(VOICE_DRAFT)).catch(() => {});
}
