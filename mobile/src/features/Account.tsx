import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Workspace } from '../../../shared/api';
import { PLANS, TEAM_MAX_MEMBERS, assignableRoles, canChangeMember, canManageTeam, discountedPrice, type Role } from '../../../shared/plans';
import { api, authenticate, conflictVersions, importGuest, invite, leaveTeam, myRole, pendingGuestRecords, redeemPromo, refresh, removeMember, reportError, resolve, selectWorkspace, setMemberRole, signOut, useStore } from '../data/store';
import { Button, Card, Chip, Eyebrow, Field, Label, Notice, styles, useText, useTheme } from '../app/ui';
import { SocialSignIn } from './SocialSignIn';
import { Admin } from './Admin';
import { AssistantNameField } from './AssistantName';
import { setAssistantName } from '../data/store';
import { cleanAssistantName } from '../../../shared/assistant';
import { changePin, lockNow, setPhoneUnlock, useLock } from '../platform/lock';
type Run = (fn:()=>Promise<unknown>) => void;
type T = ReturnType<typeof useText>;
const roleName = (role:Role, t:T) => role === 'owner' ? t('Owner','المالك') : role === 'admin' ? t('Admin','مشرف') : role === 'member' ? t('Member','عضو') : t('Viewer','مشاهد');
const roleHelp = (role:Role, t:T) => role === 'owner' ? t('Manages the plan, members and all tasks.','يدير الباقة والأعضاء وكل المهام.')
  : role === 'admin' ? t('Invites and removes members, changes roles, and assigns tasks to anyone.','يدعو الأعضاء ويحذفهم ويغيّر أدوارهم ويسند المهام لأي شخص.')
  : role === 'member' ? t('Adds tasks and edits their own and the ones assigned to them.','يضيف مهام ويعدّل مهامه والمهام المسندة إليه.')
  : t('Sees the team’s tasks but cannot change them.','يرى مهام الفريق ولا يستطيع تعديلها.');
export function Account() {
  const s = useStore(),t = useText(),[register,setRegister] = useState(false),[email,setEmail] = useState(''),[password,setPassword] = useState(''),[name,setName] = useState(''),[working,setWorking] = useState(false),[linked,setLinked] = useState(''),[admin,setAdmin] = useState(false),[assistant,setAssistant] = useState(s.assistantName);
  const busy = working || s.busy;
  const run:Run = fn => { if (busy) return; setWorking(true); void fn().catch(reportError).finally(() => setWorking(false)); };
  const active = s.workspaces.find(w => s.scope.endsWith(`:${w.id}`));
  useEffect(() => { if (s.session) void refresh().catch(() => {}); },[!!s.session]); // New teams and plan changes appear when Account opens.
  useEffect(() => setAssistant(s.assistantName),[s.assistantName]); // The saved name can arrive after this screen opens.
  if (!s.session) return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Label big>{t('Account','الحساب')}</Label>
    <Card><Label>{t('Optional: sign in to sync across devices. Local features work without an account.','اختياري: سجّل الدخول للمزامنة. تعمل المهام المحلية بدون حساب.')}</Label>
      <SocialSignIn/>
      {register && <Field label={t('Name','الاسم')} value={name} onChangeText={setName} maxLength={80}/>}{register && <AssistantNameField value={assistant} onChange={setAssistant}/>}
      <Field label={t('Email','البريد الإلكتروني')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>
      <Field label={t('Password (10+ characters)','كلمة المرور (١٠ أحرف على الأقل)')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
      <Button title={register ? t('Create account','إنشاء حساب') : t('Sign in','دخول')} disabled={busy || !email || password.length < 10 || (register && !name.trim())} onPress={() => run(async () => { await authenticate(register ? 'register' : 'login',email.trim(),password,name.trim(),register ? assistant : ''); setPassword(''); })}/>
      <Button title={register ? t('Use existing account','لدي حساب') : t('Register instead','إنشاء حساب جديد')} secondary onPress={() => setRegister(!register)}/></Card>
    <Security/></ScrollView>;
  const pending = pendingGuestRecords();
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={{ gap:2 }}><Label big>{s.session.user.name}</Label><Label small>{s.session.user.email}</Label></View>
    <PlanCard run={run} busy={busy}/>
    {s.plan?.isAdmin && <Button title={t('Super admin panel','لوحة المشرف العام')} icon="account" onPress={() => setAdmin(true)}/>}
    {admin && <Admin close={() => setAdmin(false)}/>}
    <View style={{ gap:8 }}><Eyebrow>{t('WORKSPACES','المساحات')}</Eyebrow>
      <View style={styles.row}>{s.workspaces.map(w => <Chip key={w.id} title={w.personal ? t('Personal','شخصي') : w.name} active={active?.id === w.id} onPress={() => { if (active?.id !== w.id) run(() => selectWorkspace(w.id)); }}/>)}</View></View>
    {active && !active.personal && <TeamCard team={active} busy={busy} run={run}/>}
    {active && pending > 0 && <Card><Label>{t(`${pending} item(s) you saved while offline on this device are not in this workspace yet.`,`${pending} عنصر حفظته دون اتصال على هذا الجهاز ليس في هذه المساحة بعد.`)}</Label><Button title={t('Copy them here','انسخها هنا')} disabled={busy} secondary onPress={importGuest}/></Card>}
    {s.conflicts.map(id => { const versions = conflictVersions(id); return <Card key={id}><Label big>{t('Resolve conflicting changes','حل تعارض التغييرات')}</Label><Label>{t('Device','الجهاز')}: {JSON.stringify(versions.local ?? 'Deleted')}</Label><Label>{t('Server','الخادم')}: {JSON.stringify(versions.remote ?? 'Deleted')}</Label><Button title={t('Keep device version','احتفظ بنسخة الجهاز')} disabled={busy} onPress={() => resolve(id,'local')}/><Button title={t('Use server version','استخدم نسخة الخادم')} disabled={busy} secondary onPress={() => resolve(id,'remote')}/></Card>; })}
    <NewTeam busy={busy} run={run}/>
    <Card><Label big>{t('Your assistant','مساعدك')}</Label><AssistantNameField value={assistant} onChange={setAssistant}/><Button title={t('Save name','حفظ الاسم')} disabled={!cleanAssistantName(assistant) || cleanAssistantName(assistant) === s.assistantName} onPress={() => setAssistantName(assistant)}/></Card>
    <Card><Label big>{t('Sign-in methods','طرق تسجيل الدخول')}</Label><Label>{t('Link Google, Apple or Meta to sign in to this account with one tap.','اربط Google أو Apple أو Meta لتدخل إلى هذا الحساب بلمسة واحدة.')}</Label><SocialSignIn link onLinked={p => setLinked(p)}/>{!!linked && <Notice>{t('Linked. You can now sign in with it.','تم الربط. يمكنك الدخول به الآن.')}</Notice>}</Card>
    <Security/>
    <Button title={t('Sign out','خروج')} disabled={busy} secondary onPress={() => run(signOut)}/>
  </ScrollView>;
}

function PlanCard({ run, busy }:{ run:Run; busy:boolean }) {
  const s = useStore(), t = useText(), c = useTheme(), plan = s.plan, [code,setCode] = useState('');
  if (!plan) return null;
  const until = plan.until ? new Date(plan.until).toLocaleDateString(s.language === 'ar' ? 'ar-EG' : 'en-GB',{ day:'numeric', month:'long' }) : '';
  const current = !plan.active ? t('Free','مجانية') : plan.plan === 'team' ? t('Team','الفريق') : t('Personal','الشخصية');
  const free = plan.aiLimit ?? PLANS.free.aiPerMonth;
  /** The monthly price, with the promo code's discount when it applies to this plan. */
  const price = (which:'personal'|'team') => {
    const full = plan.prices[which], now = discountedPrice(full,which,plan.promo);
    return now === full ? t(`${full} EGP / month`,`${full} جنيه / شهر`) : t(`${now} EGP / month (was ${full})`,`${now} جنيه / شهر (بدلاً من ${full})`);
  };
  const rows:[string,string,string,boolean][] = [
    [t('Free','مجانية'),t('0 EGP','٠ جنيه'),t(`Tasks, notes, habits, reminders and sync. ${free} AI and voice requests a month.`,`المهام والملاحظات والعادات والتذكيرات والمزامنة. ${free} طلب ذكاء اصطناعي وصوت شهرياً.`),!plan.active],
    [t('Personal','الشخصية'),price('personal'),t('Everything in Free, with unlimited AI assistant and voice tasks.','كل ما في المجانية، مع مساعد ذكي ومهام صوتية بلا حدود.'),plan.active && plan.plan === 'personal'],
    [t('Team','الفريق'),price('team'),t(`Teams of up to ${TEAM_MAX_MEMBERS} people with roles and task assignment. Unlimited AI for every member.`,`فرق حتى ${TEAM_MAX_MEMBERS} أشخاص بأدوار وإسناد مهام. ذكاء اصطناعي بلا حدود لكل عضو.`),plan.active && plan.plan === 'team'],
  ];
  const promoPlan = plan.promo?.plan === 'team' ? t('the Team plan','باقة الفريق') : plan.promo?.plan === 'personal' ? t('the Personal plan','الباقة الشخصية') : t('any plan','أي باقة');
  return <Card><Eyebrow>{t('YOUR PLAN','باقتك')}</Eyebrow>
    <Label big>{current}{plan.active && until ? t(` · until ${until}`,` · حتى ${until}`) : ''}</Label>
    {plan.aiLimit !== null ? <View style={{ gap:6 }}><Label small>{t(`AI and voice this month: ${plan.aiUsed} of ${plan.aiLimit}`,`الذكاء الاصطناعي والصوت هذا الشهر: ${plan.aiUsed} من ${plan.aiLimit}`)}</Label>
      <View style={{ height:6, borderRadius:3, backgroundColor:c.sunk, overflow:'hidden' }}><View style={{ width:`${Math.min(100,plan.aiUsed/plan.aiLimit*100)}%`, height:6, backgroundColor:plan.aiUsed >= plan.aiLimit ? c.danger : c.accent }}/></View></View>
      : <Label small>{plan.coveredByTeam ? t(`Unlimited AI through the ${plan.coveredByTeam} team.`,`ذكاء اصطناعي بلا حدود عن طريق فريق ${plan.coveredByTeam}.`) : t('Unlimited AI and voice.','ذكاء اصطناعي وصوت بلا حدود.')}</Label>}
    {rows.map(([name,price,about,on]) => <View key={name} style={{ borderWidth:1, borderColor:on ? c.accent : c.line, backgroundColor:on ? c.accentSoft : 'transparent', borderRadius:14, padding:12, gap:4 }}>
      <View style={[styles.row,{ justifyContent:'space-between' }]}><Label strong>{name}{on ? t(' · current',' · الحالية') : ''}</Label><Label strong>{price}</Label></View><Label small>{about}</Label></View>)}
    {plan.promo ? <Notice>{t(`Promo code ${plan.promo.code}: ${plan.promo.percent}% off ${promoPlan}. Mention it when you pay.`,`كود الخصم ${plan.promo.code}: خصم ${plan.promo.percent}٪ على ${promoPlan}. اذكره عند الدفع.`)}</Notice>
      : <View style={{ gap:8 }}><Field label={t('Have a promo code?','عندك كود خصم؟')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={40}/>
        <Button title={t('Apply code','تطبيق الكود')} secondary disabled={busy || !code.trim()} onPress={() => run(async () => { await redeemPromo(code); setCode(''); })}/></View>}
    <Label small>{plan.contact
      ? t(`To subscribe or renew, contact ${plan.contact} with your email (${s.session?.user.email}). Your plan turns on as soon as payment is confirmed.`,`للاشتراك أو التجديد، تواصل مع ${plan.contact} وأرسل بريدك (${s.session?.user.email}). تتفعّل باقتك فور تأكيد الدفع.`)
      : t(`To subscribe or renew, contact the app owner with your email (${s.session?.user.email}). Your plan turns on as soon as payment is confirmed.`,`للاشتراك أو التجديد، تواصل مع صاحب التطبيق وأرسل بريدك (${s.session?.user.email}). تتفعّل باقتك فور تأكيد الدفع.`)}</Label>
  </Card>;
}

function TeamCard({ team, busy, run }:{ team:Workspace; busy:boolean; run:Run }) {
  const s = useStore(), t = useText(), c = useTheme(), mine = myRole(), [code,setCode] = useState(''), [invited,setInvited] = useState<Exclude<Role,'owner'>>('member'), [removing,setRemoving] = useState('');
  useEffect(() => { setCode(''); setRemoving(''); },[team.id]);
  const roles = assignableRoles(mine) as Exclude<Role,'owner'>[];
  return <Card><Eyebrow>{t('TEAM','الفريق')}</Eyebrow><Label big>{team.name}</Label>
    <Label small>{t(`Your role: ${roleName(mine,t)}. ${roleHelp(mine,t)}`,`دورك: ${roleName(mine,t)}. ${roleHelp(mine,t)}`)}</Label>
    <Label strong>{t(`Members (${s.members.length} of ${TEAM_MAX_MEMBERS})`,`الأعضاء (${s.members.length} من ${TEAM_MAX_MEMBERS})`)}</Label>
    {s.members.map(m => { const me = m.id === s.session?.user.id, editable = !me && canChangeMember(mine,m.role);
      return <View key={m.id} style={{ borderTopWidth:1, borderColor:c.line, paddingTop:10, gap:8 }}>
        <View style={[styles.row,{ justifyContent:'space-between' }]}><Label strong>{m.name}{me ? t(' (you)',' (أنت)') : ''}</Label><Label small>{roleName(m.role,t)}</Label></View>
        {editable && <View style={styles.row}>{roles.map(r => <Chip key={r} title={roleName(r,t)} active={m.role === r} onPress={() => { if (m.role !== r) run(() => setMemberRole(m.id,r)); }}/>)}
          <Chip title={removing === m.id ? t('Tap again to remove','اضغط مرة أخرى للحذف') : t('Remove','حذف')} active={false} onPress={() => { if (removing !== m.id) setRemoving(m.id); else run(() => removeMember(m.id)); }}/></View>}
      </View>; })}
    {canManageTeam(mine) && <View style={{ gap:8 }}><Label strong>{t('Invite someone','ادعُ شخصاً')}</Label>
      <View style={styles.row}>{roles.map(r => <Chip key={r} title={roleName(r,t)} active={invited === r} onPress={() => setInvited(r)}/>)}</View>
      <Label small>{roleHelp(invited,t)}</Label>
      <Button title={t('Create invitation code','إنشاء رمز دعوة')} disabled={busy || s.members.length >= TEAM_MAX_MEMBERS} secondary onPress={() => run(async () => setCode(await invite(invited)))}/>
      {!!code && <Field label={t('Send this code (single use, 7 days)','أرسل هذا الرمز (مرة واحدة، ٧ أيام)')} value={code} editable={false} selectTextOnFocus/>}</View>}
    {mine !== 'owner' && <Button title={t('Leave this team','مغادرة الفريق')} disabled={busy} secondary danger onPress={() => run(leaveTeam)}/>}
  </Card>;
}

function NewTeam({ busy, run }:{ busy:boolean; run:Run }) {
  const s = useStore(), t = useText(), [team,setTeam] = useState(''), [code,setCode] = useState('');
  const canCreate = !!s.plan?.active && s.plan.plan === 'team';
  return <Card><Label big>{t('Teams','الفرق')}</Label>
    {canCreate ? <><Field label={t('New team name','اسم الفريق الجديد')} value={team} onChangeText={setTeam} maxLength={80}/><Button title={t('Create team','إنشاء فريق')} disabled={busy || !team.trim()} onPress={() => run(async () => { const w = await api<Workspace>('/workspaces',{ name:team.trim() }); await refresh(); await selectWorkspace(w.id); setTeam(''); })}/></>
      : <Label small>{t('Creating a team needs the Team plan. You can still join a team with an invitation code.','إنشاء فريق يحتاج باقة الفريق. ويمكنك الانضمام لفريق برمز دعوة.')}</Label>}
    <Field label={t('Join with invitation code','انضم برمز دعوة')} value={code} onChangeText={setCode} autoCapitalize="none"/><Button title={t('Join team','انضم للفريق')} disabled={busy || !code.trim()} secondary onPress={() => run(async () => { const result = await api<{workspaceId:string}>('/invitations/join',{ code:code.trim() }); await refresh(); await selectWorkspace(result.workspaceId); setCode(''); })}/></Card>;
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
