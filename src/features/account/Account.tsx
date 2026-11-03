import { useState } from 'react';
import { api, authenticate, cloud, conflictRecord, importDeviceRecords, refreshWorkspaces, resolveConflict, selectWorkspace, signOut, syncNow } from '../../cloud/client';
import { useRevision } from '../../app/react-store';
import { lang } from '../../i18n/index.js';
import type { Workspace } from '../../../shared/api';

export function Account() {
  useRevision();
  const ar = lang === 'ar';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState('');
  async function action(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } }
  const workspace = cloud.workspaces.find(w => w.id === cloud.active);
  return <section className="stack">
    <h1>{ar ? 'الحساب والفريق' : 'Account & team'}</h1>
    {error && <p className="banner" role="alert">{error}</p>}
    {!cloud.session ? <>
      <p className="muted">{ar ? 'حساب واحد لمزامنة أجهزة آيفون وأندرويد. بيانات الجهاز لا تُرفع إلا عند اختيار نسخها.' : 'One account for iPhone and Android. Device-only records are copied to your account only when you choose to import them.'}</p>
      <div className="seg"><button onClick={() => setMode('login')} aria-pressed={mode === 'login'}>{ar ? 'دخول' : 'Sign in'}</button><button onClick={() => setMode('register')} aria-pressed={mode === 'register'}>{ar ? 'حساب جديد' : 'Create account'}</button></div>
      <form className="stack card" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void action(() => authenticate(mode, { email: String(data.get('email')), password: String(data.get('password')), ...(mode === 'register' ? { name: String(data.get('name')) } : {}) })); }}>
        {mode === 'register' && <label>{ar ? 'الاسم' : 'Name'}<input className="field" name="name" required maxLength={80} autoComplete="name" /></label>}
        <label>{ar ? 'البريد الإلكتروني' : 'Email'}<input className="field" name="email" type="email" required autoComplete="email" /></label>
        <label>{ar ? 'كلمة المرور (١٠ أحرف على الأقل)' : 'Password (at least 10 characters)'}<input className="field" name="password" type="password" minLength={10} maxLength={128} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button className="btn primary" disabled={busy}>{busy ? '…' : mode === 'login' ? (ar ? 'دخول' : 'Sign in') : (ar ? 'إنشاء الحساب' : 'Create account')}</button>
      </form>
    </> : <>
      <div className="card row"><span className="grow">{cloud.session.user.name}<br /><small>{cloud.session.user.email}</small></span><button className="btn" disabled={busy || cloud.busy} onClick={() => void action(signOut)}>{ar ? 'خروج' : 'Sign out'}</button></div>
      <label>{ar ? 'مساحة العمل' : 'Workspace'}<select className="field" value={cloud.active} disabled={busy || cloud.busy} onChange={e => { setInvite(''); void action(() => selectWorkspace(e.target.value)); }}><option value="" disabled>{ar ? 'اختر مساحة' : 'Choose workspace'}</option>{cloud.workspaces.map(w => <option key={w.id} value={w.id}>{w.personal ? (ar ? 'شخصي' : 'Personal') : w.name}</option>)}</select></label>
      <div className="card stack"><div role="status">{cloud.status}{cloud.lastSync && <small> · {cloud.lastSync}</small>}</div><div className="row"><button className="btn primary" disabled={cloud.busy || !cloud.active} onClick={() => void syncNow()}>{ar ? 'مزامنة الآن' : 'Sync now'}</button><button className="btn" disabled={cloud.busy || !cloud.active} onClick={importDeviceRecords}>{ar ? 'نسخ بيانات الجهاز لهذه المساحة' : 'Import device records here'}</button></div><small className="muted">{ar ? 'النصوص والمهام تتزامن. التسجيلات والمفاتيح ورقم القفل تظل على الجهاز.' : 'Tasks and text sync. Audio recordings, provider keys, and the device PIN stay on this device.'}</small></div>
      {cloud.conflicts.map(id => { const record = conflictRecord(id); return <div className="card stack" key={id}><strong>{ar ? 'تعديلان لنفس العنصر' : 'Two edits to the same item'}</strong><p>{String(record.local?.title ?? record.local?.text ?? id)}</p><details><summary>{ar ? 'مقارنة النسختين' : 'Compare versions'}</summary><pre className="conflict-json">{JSON.stringify(record, null, 2)}</pre></details><div className="row"><button className="btn" disabled={cloud.busy} onClick={() => resolveConflict(id, 'local')}>{ar ? 'احتفظ بتعديلي' : 'Keep my edit'}</button><button className="btn" disabled={cloud.busy} onClick={() => resolveConflict(id, 'remote')}>{ar ? 'استخدم نسخة الفريق' : 'Use cloud version'}</button></div></div>; })}
      <h2>{ar ? 'الفريق' : 'Team'}</h2>
      {cloud.members.map(m => <div className="card row" key={m.id}><strong>{m.name}</strong><span className="muted grow">{m.email}</span><small>{m.role}</small></div>)}
      {workspace && !workspace.personal && workspace.ownerId === cloud.session.user.id && <div className="card stack"><button className="btn" disabled={busy} onClick={() => void action(async () => { const result = await api<{ code: string }>(`/workspaces/${cloud.active}/invitations`, {}); setInvite(result.code); })}>{ar ? 'إنشاء رمز دعوة' : 'Create invitation code'}</button>{invite && <><label>{ar ? 'انسخ الرمز وشاركه بنفسك' : 'Copy this code and share it'}<input className="field" readOnly value={invite} onFocus={e => e.target.select()} /></label><small>{ar ? 'صالح لعضو واحد لمدة ٧ أيام.' : 'Single use; expires in 7 days.'}</small></>}</div>}
      <form className="card stack" onSubmit={e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get('workspace')); void action(async () => { const result = await api<Workspace>('/workspaces', { name }); await refreshWorkspaces(); await selectWorkspace(result.id); }); }}><label>{ar ? 'فريق جديد' : 'New team'}<input className="field" name="workspace" required maxLength={80} /></label><button className="btn" disabled={busy || cloud.busy}>{ar ? 'إنشاء فريق' : 'Create team'}</button></form>
      <form className="card stack" onSubmit={e => { e.preventDefault(); const code = String(new FormData(e.currentTarget).get('code')).trim(); void action(async () => { const result = await api<{ workspaceId: string }>('/invitations/join', { code }); await refreshWorkspaces(); await selectWorkspace(result.workspaceId); }); }}><label>{ar ? 'رمز الدعوة' : 'Invitation code'}<input className="field" name="code" required /></label><button className="btn" disabled={busy || cloud.busy}>{ar ? 'انضم للفريق' : 'Join team'}</button></form>
    </>}
  </section>;
}
