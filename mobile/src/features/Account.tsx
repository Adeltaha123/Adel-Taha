import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import type { Workspace } from '../../../shared/api';
import { api, authenticate, conflictVersions, importGuest, refresh, reportError, resolve, selectWorkspace, signOut, sync, useStore } from '../data/store';
import { Button, Card, Field, Label, Notice, styles, useText } from '../app/ui';
import { SocialSignIn } from './SocialSignIn';
import { AssistantNameField } from './AssistantName';
import { setAssistantName } from '../data/store';
import { cleanAssistantName } from '../../../shared/assistant';
import { changePin, lockNow, setPhoneUnlock, useLock } from '../platform/lock';
export function Account() {
  const s = useStore(),t = useText(),[register,setRegister] = useState(false),[email,setEmail] = useState(''),[password,setPassword] = useState(''),[name,setName] = useState(''),[team,setTeam] = useState(''),[code,setCode] = useState(''),[invite,setInvite] = useState(''),[working,setWorking] = useState(false),[linked,setLinked] = useState(''),[assistant,setAssistant] = useState(s.assistantName);
  const busy = working || s.busy;
  const run = (fn:()=>Promise<unknown>) => { if (busy) return; setWorking(true); void fn().catch(reportError).finally(() => setWorking(false)); };
  const active = s.workspaces.find(w => s.scope.endsWith(`:${w.id}`));
  useEffect(() => setInvite(''),[s.scope]);
  useEffect(() => setAssistant(s.assistantName),[s.assistantName]); // The saved name can arrive after this screen opens.
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Label big>{t('Account & team','الحساب والفريق')}</Label>
    <Security/>
    {!s.session ? <Card><Label>{t('Optional: sign in to sync across devices. Local features work without an account.','اختياري: سجّل الدخول للمزامنة. تعمل المهام المحلية بدون حساب.')}</Label>
      <SocialSignIn/>
      {register && <Field label={t('Name','الاسم')} value={name} onChangeText={setName} maxLength={80}/>}{register && <AssistantNameField value={assistant} onChange={setAssistant}/>}
      <Field label={t('Email','البريد الإلكتروني')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>
      <Field label={t('Password (10+ characters)','كلمة المرور (١٠ أحرف على الأقل)')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
      <Button title={register ? t('Create account','إنشاء حساب') : t('Sign in','دخول')} disabled={busy || !email || password.length < 10 || (register && !name.trim())} onPress={() => run(async () => { await authenticate(register ? 'register' : 'login',email.trim(),password,name.trim(),register ? assistant : ''); setPassword(''); })}/>
      <Button title={register ? t('Use existing account','لدي حساب') : t('Register instead','إنشاء حساب جديد')} secondary onPress={() => setRegister(!register)}/></Card> : <>
      <Label>{s.session.user.name} · {s.session.user.email}</Label>
      <Card><Label big>{t('Your assistant','مساعدك')}</Label><AssistantNameField value={assistant} onChange={setAssistant}/><Button title={t('Save name','حفظ الاسم')} disabled={!cleanAssistantName(assistant) || cleanAssistantName(assistant) === s.assistantName} onPress={() => setAssistantName(assistant)}/></Card>
      <Card><Label big>{t('Sign-in methods','طرق تسجيل الدخول')}</Label><Label>{t('Link Google, Apple or Meta to sign in to this account with one tap.','اربط Google أو Apple أو Meta لتدخل إلى هذا الحساب بلمسة واحدة.')}</Label><SocialSignIn link onLinked={p => setLinked(p)}/>{!!linked && <Notice>{t('Linked. You can now sign in with it.','تم الربط. يمكنك الدخول به الآن.')}</Notice>}</Card><Label>{t('Choose a workspace to sync. Device records stay separate.','اختر مساحة للمزامنة. تبقى سجلات الجهاز منفصلة.')}</Label>
      <Button title={t('Refresh workspaces','تحديث المساحات')} disabled={busy} secondary onPress={() => run(refresh)}/>
      {s.workspaces.map(w => <Button key={w.id} title={`${active?.id === w.id ? '✓ ' : ''}${w.name}`} disabled={busy} secondary onPress={() => run(() => selectWorkspace(w.id))}/>)}
      {active && <Card><Label big>{active.name}</Label><Label>{s.status}</Label><Button title={t('Sync now','مزامنة الآن')} disabled={busy} onPress={() => run(sync)}/><Button title={t('Copy device records here','نسخ سجلات الجهاز هنا')} disabled={busy} secondary onPress={importGuest}/>
        {s.members.map(m => <Label key={m.id}>{m.name} · {m.role}</Label>)}
        {!active.personal && active.ownerId === s.session.user.id && <Button title={t('Create invitation','إنشاء دعوة')} disabled={busy} secondary onPress={() => run(async () => { const result = await api<{code:string}>(`/workspaces/${active.id}/invitations`,{}); setInvite(result.code); })}/>}
        {!!invite && <Field label={t('Invitation code (single use, 7 days)','رمز الدعوة (مرة واحدة، ٧ أيام)')} value={invite} editable={false} selectTextOnFocus/>}
      </Card>}
      {s.conflicts.map(id => { const versions = conflictVersions(id); return <Card key={id}><Label big>{t('Resolve conflicting changes','حل تعارض التغييرات')}</Label><Label>{t('Device','الجهاز')}: {JSON.stringify(versions.local ?? 'Deleted')}</Label><Label>{t('Server','الخادم')}: {JSON.stringify(versions.remote ?? 'Deleted')}</Label><Button title={t('Keep device version','احتفظ بنسخة الجهاز')} disabled={busy} onPress={() => resolve(id,'local')}/><Button title={t('Use server version','استخدم نسخة الخادم')} disabled={busy} secondary onPress={() => resolve(id,'remote')}/></Card>; })}
      <Card><Field label={t('New team name','اسم الفريق الجديد')} value={team} onChangeText={setTeam} maxLength={80}/><Button title={t('Create team','إنشاء فريق')} disabled={busy || !team.trim()} onPress={() => run(async () => { const w = await api<Workspace>('/workspaces',{ name:team.trim() }); await refresh(); await selectWorkspace(w.id); setTeam(''); })}/>
      <Field label={t('Join with invitation code','انضم برمز دعوة')} value={code} onChangeText={setCode} autoCapitalize="none"/><Button title={t('Join team','انضم للفريق')} disabled={busy || !code.trim()} onPress={() => run(async () => { const result = await api<{workspaceId:string}>('/invitations/join',{ code:code.trim() }); await refresh(); await selectWorkspace(result.workspaceId); setCode(''); })}/></Card>
      <Button title={t('Sign out','خروج')} disabled={busy} secondary onPress={() => run(signOut)}/>
    </>}
  </ScrollView>;
}

function Security() {
  const lock = useLock(), t = useText(), [failed,setFailed] = useState(false);
  const toggle = async () => { setFailed(false); if (!await setPhoneUnlock(!lock.phoneUnlock,t('Turn on unlock like your phone','فعّل الفتح مثل هاتفك'),t('Cancel','إلغاء'))) setFailed(true); };
  return <Card><Label big>{t('Security','الأمان')}</Label>
    <Label>{t('Unlock like your phone: Face ID, fingerprint, or your phone PIN.','افتح مثل هاتفك: بالوجه أو البصمة أو رمز الهاتف.')}</Label>
    {lock.phoneAvailable ? <Button title={lock.phoneUnlock ? t('Turn off phone unlock','إيقاف الفتح بالهاتف') : t('Turn on phone unlock','تفعيل الفتح بالهاتف')} icon="finger" secondary={lock.phoneUnlock} onPress={() => void toggle()}/>
      : <Notice>{t('Set a screen lock on this phone first. Your PIN still protects the app.','فعّل قفل الشاشة على هاتفك أولاً. الرقم السري ما زال يحمي التطبيق.')}</Notice>}
    {failed && <Notice tone="error">{t('Phone unlock was not confirmed.','لم يتم تأكيد الفتح بالهاتف.')}</Notice>}
    <Button title={t('Lock now','اقفل الآن')} secondary onPress={lockNow}/>
    <Button title={t('Change PIN','تغيير الرقم السري')} secondary onPress={changePin}/>
    <Label small>{t('The PIN hides the app from others; it does not encrypt your data.','الرقم السري يخفي التطبيق عن الآخرين، ولا يشفّر بياناتك.')}</Label></Card>;
}
