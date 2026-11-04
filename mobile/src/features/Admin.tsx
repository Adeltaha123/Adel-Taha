import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import type { AdminOverview, AdminUser, AiTotals, AppSettings, Plan, Promo, PromoPlan } from '../../../shared/plans';
import { api, useStore } from '../data/store';
import { Button, Card, Chip, Eyebrow, Field, IconButton, Label, Notice, Page, styles, useText } from '../app/ui';

// The super admin panel: every account with its plan and OpenAI usage, promo codes, and app-wide settings.
// Only accounts marked as super admin see it; the API refuses everyone else.
type Tab = 'overview'|'users'|'promos'|'settings';
type T = ReturnType<typeof useText>;
const tokens = (n:number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}k` : String(n);
const dollars = (n:number) => n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
const day = (ms:number|null, ar:boolean) => ms ? new Date(ms).toLocaleDateString(ar ? 'ar-EG' : 'en-GB',{ day:'numeric', month:'short', year:'numeric' }) : '—';
const planName = (plan:Plan|PromoPlan, t:T) => plan === 'team' ? t('Team','الفريق') : plan === 'personal' ? t('Personal','الشخصية') : plan === 'any' ? t('Any plan','أي باقة') : t('Free','مجانية');
const usage = (ai:AiTotals, t:T) => t(`${ai.requests} AI requests · ${tokens(ai.inputTokens)} in / ${tokens(ai.outputTokens)} out tokens · ${dollars(ai.cost)}`,`${ai.requests} طلب ذكاء اصطناعي · ${tokens(ai.inputTokens)} داخل / ${tokens(ai.outputTokens)} خارج · ${dollars(ai.cost)}`);

export function Admin({ close }:{ close:()=>void }) {
  const t = useText(), [tab,setTab] = useState<Tab>('overview'), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const run = (fn:()=>Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); void fn().catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); };
  const tabs:[Tab,string,string][] = [['overview','Overview','نظرة عامة'],['users','Users','المستخدمون'],['promos','Promo codes','أكواد الخصم'],['settings','Settings','الإعدادات']];
  return <Modal visible animationType="slide" onRequestClose={close}><Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={[styles.row,{ justifyContent:'space-between',flexWrap:'nowrap' }]}><View style={{ flex:1,gap:4 }}><Eyebrow>{t('SUPER ADMIN','المشرف العام')}</Eyebrow><Label big>{t('Control panel','لوحة التحكم')}</Label></View><IconButton icon="close" label={t('Close','إغلاق')} onPress={close}/></View>
    <View style={styles.row}>{tabs.map(([id,en,ar]) => <Chip key={id} title={t(en,ar)} active={tab === id} onPress={() => setTab(id)}/>)}</View>
    {!!error && <Notice tone="error">{error}</Notice>}
    {tab === 'overview' ? <Overview run={run}/> : tab === 'users' ? <Users run={run} busy={busy}/> : tab === 'promos' ? <Promos run={run} busy={busy}/> : <SettingsTab run={run} busy={busy}/>}
  </ScrollView></Page></Modal>;
}
type Run = (fn:()=>Promise<unknown>) => void;

function Overview({ run }:{ run:Run }) {
  const t = useText(), [data,setData] = useState<AdminOverview|null>(null);
  useEffect(() => run(async () => setData(await api<AdminOverview>('/admin/overview'))),[]);
  if (!data) return <Label>{t('Loading…','جارٍ التحميل…')}</Label>;
  const tile = (value:string, en:string, ar:string) => <Card style={{ flexBasis:'46%',flexGrow:1,gap:2 }}><Label big>{value}</Label><Label small>{t(en,ar)}</Label></Card>;
  return <View style={{ gap:12 }}>
    <View style={styles.row}>{tile(String(data.users),'Accounts','الحسابات')}{tile(String(data.activeLast30Days),'Active in 30 days','نشط خلال ٣٠ يوماً')}{tile(String(data.newThisMonth),'New this month','جديد هذا الشهر')}{tile(String(data.disabled),'Disabled','معطّل')}</View>
    <Card><Eyebrow>{t('PLANS','الباقات')}</Eyebrow><Label>{t(`Free ${data.plans.free} · Personal ${data.plans.personal} · Team ${data.plans.team}`,`مجانية ${data.plans.free} · شخصية ${data.plans.personal} · فريق ${data.plans.team}`)}</Label><Label small>{t(`${data.promosRedeemed} account(s) entered a promo code.`,`${data.promosRedeemed} حساب أدخل كود خصم.`)}</Label></Card>
    <Card><Eyebrow>{t(`OPENAI THIS MONTH (${data.month})`,`OpenAI هذا الشهر (${data.month})`)}</Eyebrow>
      <Label big>{dollars(data.ai.cost)}</Label>
      <Label>{t(`${data.ai.requests} requests · ${tokens(data.ai.inputTokens)} input and ${tokens(data.ai.outputTokens)} output tokens · ${Math.round(data.ai.audioSeconds/60)} min of audio`,`${data.ai.requests} طلب · ${tokens(data.ai.inputTokens)} توكن داخل و${tokens(data.ai.outputTokens)} خارج · ${Math.round(data.ai.audioSeconds/60)} دقيقة صوت`)}</Label>
      <Label small>{t('Cost is estimated from the OpenAI prices in Settings. Tokens are counted from now on; older requests only have counts.','التكلفة تقديرية حسب أسعار OpenAI في الإعدادات. التوكنز تُحسب من الآن؛ الطلبات الأقدم لها عدد فقط.')}</Label></Card>
  </View>;
}

function Users({ run, busy }:{ run:Run; busy:boolean }) {
  const t = useText(), s = useStore(), [query,setQuery] = useState(''), [users,setUsers] = useState<AdminUser[]|null>(null), [open,setOpen] = useState<string|null>(null);
  const load = () => run(async () => setUsers(await api<AdminUser[]>(`/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)));
  useEffect(load,[]);
  return <View style={{ gap:12 }}>
    <Field label={t('Search by name or email','ابحث بالاسم أو البريد')} value={query} onChangeText={setQuery} onSubmitEditing={load} autoCapitalize="none"/>
    <Button title={t('Search','بحث')} secondary disabled={busy} onPress={load}/>
    {users?.length === 0 && <Label>{t('No accounts match.','لا توجد حسابات مطابقة.')}</Label>}
    {users?.map(u => <Card key={u.id}>
      <Label strong>{u.name}{u.isAdmin ? t(' · super admin',' · مشرف عام') : ''}{u.disabled ? t(' · disabled',' · معطّل') : ''}</Label>
      <Label small>{u.email}</Label>
      <Label small>{t(`${planName(u.active ? u.plan : 'free',t)}${u.active && u.until ? ` until ${day(u.until,false)}` : ''}${u.promoCode ? ` · code ${u.promoCode}` : ''}`,`${planName(u.active ? u.plan : 'free',t)}${u.active && u.until ? ` حتى ${day(u.until,true)}` : ''}${u.promoCode ? ` · كود ${u.promoCode}` : ''}`)}</Label>
      <Label small>{usage(u.ai,t)}</Label>
      <Label small>{t(`Joined ${day(u.created,false)} · last active ${day(u.lastSeen,false)} · ${u.records} items, ${u.workspaces} workspace(s)`,`انضم ${day(u.created,true)} · آخر نشاط ${day(u.lastSeen,true)} · ${u.records} عنصر، ${u.workspaces} مساحة`)}</Label>
      <Button title={open === u.id ? t('Close','إغلاق') : t('Manage','إدارة')} secondary onPress={() => setOpen(open === u.id ? null : u.id)}/>
      {open === u.id && <ManageUser user={u} self={u.id === s.session?.user.id} busy={busy} run={fn => run(async () => { await fn(); await load(); })}/>}
    </Card>)}
  </View>;
}

function ManageUser({ user, self, busy, run }:{ user:AdminUser; self:boolean; busy:boolean; run:Run }) {
  const t = useText(), [plan,setPlan] = useState<Plan>(user.active ? user.plan : 'personal'), [months,setMonths] = useState('1'), [password,setPassword] = useState('');
  const act = (body:Record<string,unknown>) => run(() => api(`/admin/users/${user.id}`,body));
  const count = Number(months);
  return <View style={{ gap:10 }}>
    <Label strong>{t('Plan','الباقة')}</Label>
    <View style={styles.row}>{(['free','personal','team'] as const).map(p => <Chip key={p} title={planName(p,t)} active={plan === p} onPress={() => setPlan(p)}/>)}</View>
    {plan !== 'free' && <Field label={t('Months (adds to a current period of the same plan)','عدد الشهور (يُضاف لمدة نفس الباقة الحالية)')} value={months} onChangeText={setMonths} keyboardType="number-pad" maxLength={2}/>}
    <Button title={t('Apply plan','تطبيق الباقة')} disabled={busy || (plan !== 'free' && !(count >= 1 && count <= 36))} onPress={() => act({ plan, months:plan === 'free' ? 1 : count })}/>
    <Button title={t('Reset this month’s AI count','تصفير عدّاد الذكاء الاصطناعي لهذا الشهر')} secondary disabled={busy} onPress={() => act({ resetAi:true })}/>
    {!!user.promoCode && <Button title={t(`Remove promo code ${user.promoCode}`,`إزالة كود الخصم ${user.promoCode}`)} secondary disabled={busy} onPress={() => act({ clearPromo:true })}/>}
    <Field label={t('Set a new password (10+ characters)','تعيين كلمة مرور جديدة (١٠ أحرف على الأقل)')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
    <Button title={t('Save new password','حفظ كلمة المرور')} secondary disabled={busy || password.length < 10} onPress={() => { act({ password }); setPassword(''); }}/>
    <Label small>{t('Passwords are stored as one-way hashes, so nobody can see them, only set a new one. Saving signs the account out everywhere.','كلمات المرور مخزّنة بشكل مشفّر لا يمكن قراءته، لذا يمكن فقط تعيين كلمة جديدة. الحفظ يُخرج الحساب من كل الأجهزة.')}</Label>
    {!self && <Button title={user.isAdmin ? t('Remove super admin','إزالة صلاحية المشرف العام') : t('Make super admin','جعله مشرفاً عاماً')} secondary disabled={busy} onPress={() => act({ isAdmin:!user.isAdmin })}/>}
    {!self && <Button title={user.disabled ? t('Enable account','تفعيل الحساب') : t('Disable account','تعطيل الحساب')} danger={!user.disabled} secondary={user.disabled} disabled={busy} onPress={() => act({ disabled:!user.disabled })}/>}
  </View>;
}

function Promos({ run, busy }:{ run:Run; busy:boolean }) {
  const t = useText(), s = useStore(), ar = s.language === 'ar', [promos,setPromos] = useState<Promo[]|null>(null);
  const [code,setCode] = useState(''), [plan,setPlan] = useState<PromoPlan>('personal'), [percent,setPercent] = useState('20'), [maxUses,setMaxUses] = useState(''), [days,setDays] = useState(''), [note,setNote] = useState('');
  const load = () => run(async () => setPromos(await api<Promo[]>('/admin/promos')));
  useEffect(load,[]);
  const pct = Number(percent), uses = maxUses.trim() ? Number(maxUses) : null, expires = days.trim() ? Number(days) : null;
  const valid = /^[A-Za-z0-9_-]{3,30}$/.test(code.trim()) && Number.isInteger(pct) && pct >= 1 && pct <= 100 && (uses === null || (Number.isInteger(uses) && uses >= 1)) && (expires === null || (Number.isInteger(expires) && expires >= 1));
  return <View style={{ gap:12 }}>
    <Card><Label big>{t('New promo code','كود خصم جديد')}</Label>
      <Field label={t('Code (letters and digits, e.g. RAMADAN25)','الكود (حروف وأرقام، مثل RAMADAN25)')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={30}/>
      <Label strong>{t('Discount applies to','الخصم على')}</Label>
      <View style={styles.row}>{(['personal','team','any'] as const).map(p => <Chip key={p} title={planName(p,t)} active={plan === p} onPress={() => setPlan(p)}/>)}</View>
      <Field label={t('Discount %','نسبة الخصم ٪')} value={percent} onChangeText={setPercent} keyboardType="number-pad" maxLength={3}/>
      <Field label={t('Maximum uses (empty = unlimited)','أقصى عدد استخدامات (فارغ = بلا حد)')} value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" maxLength={7}/>
      <Field label={t('Expires after days (empty = never)','ينتهي بعد أيام (فارغ = لا ينتهي)')} value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={4}/>
      <Field label={t('Note for yourself (optional)','ملاحظة لك (اختياري)')} value={note} onChangeText={setNote} maxLength={200}/>
      <Button title={t('Create code','إنشاء الكود')} disabled={busy || !valid} onPress={() => run(async () => { await api('/admin/promos',{ code:code.trim(), plan, percent:pct, maxUses:uses, expiresInDays:expires, note }); setCode(''); setNote(''); await load(); })}/></Card>
    {promos?.length === 0 && <Label>{t('No promo codes yet.','لا توجد أكواد خصم بعد.')}</Label>}
    {promos?.map(p => <Card key={p.code}>
      <Label strong>{p.code}{p.active ? '' : t(' · off',' · متوقف')}</Label>
      <Label>{t(`${p.percent}% off ${planName(p.plan,t)}`,`خصم ${p.percent}٪ على ${planName(p.plan,t)}`)}</Label>
      <Label small>{t(`Used ${p.uses}${p.maxUses ? ` of ${p.maxUses}` : ''} · ${p.expires ? `expires ${day(p.expires,false)}` : 'no expiry'}`,`استُخدم ${p.uses}${p.maxUses ? ` من ${p.maxUses}` : ''} · ${p.expires ? `ينتهي ${day(p.expires,true)}` : 'بلا انتهاء'}`)}{p.note ? ` · ${p.note}` : ''}</Label>
      <Button title={p.active ? t('Switch off','إيقاف') : t('Switch on','تشغيل')} secondary disabled={busy} onPress={() => run(async () => { await api(`/admin/promos/${p.code}`,{ active:!p.active }); await load(); })}/>
    </Card>)}
    {!ar && <Label small>Codes are entered by users on their Account screen. The discount shows on their plan prices, and you see the code next to their name when you activate their plan.</Label>}
    {ar && <Label small>يُدخل المستخدمون الكود من شاشة الحساب. يظهر الخصم على أسعار باقاتهم، وترى الكود بجانب اسمهم عند تفعيل باقتهم.</Label>}
  </View>;
}

function SettingsTab({ run, busy }:{ run:Run; busy:boolean }) {
  const t = useText(), [form,setForm] = useState<Record<string,string>|null>(null), [saved,setSaved] = useState(false);
  useEffect(() => run(async () => { const v = await api<AppSettings>('/admin/settings');
    setForm({ freeAiPerMonth:String(v.freeAiPerMonth), personalPrice:String(v.personalPrice), teamPrice:String(v.teamPrice), contact:v.contact, ...Object.fromEntries(Object.entries(v.pricing).map(([k,n]) => [k,String(n)])) }); }),[]);
  if (!form) return <Label>{t('Loading…','جارٍ التحميل…')}</Label>;
  const set = (key:string) => (value:string) => { setSaved(false); setForm({ ...form, [key]:value }); };
  const num = (key:string) => Number(form[key]);
  const numbers = ['freeAiPerMonth','personalPrice','teamPrice','chatInputPerM','chatOutputPerM','transcribeInputPerM','transcribeOutputPerM','transcribePerMinute'];
  const valid = numbers.every(k => form[k]!.trim() !== '' && Number.isFinite(num(k)) && num(k) >= 0) && [num('freeAiPerMonth'),num('personalPrice'),num('teamPrice')].every(Number.isInteger);
  const field = (key:string, en:string, ar:string, decimal = false) => <Field key={key} label={t(en,ar)} value={form[key]} onChangeText={set(key)} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} maxLength={10}/>;
  return <View style={{ gap:12 }}>
    <Card><Label big>{t('Plans','الباقات')}</Label>
      {field('freeAiPerMonth','Free AI and voice requests per month','طلبات الذكاء الاصطناعي المجانية شهرياً')}
      {field('personalPrice','Personal price (EGP / month)','سعر الباقة الشخصية (جنيه / شهر)')}
      {field('teamPrice','Team price (EGP / month)','سعر باقة الفريق (جنيه / شهر)')}
      <Field label={t('Who people contact to subscribe','جهة التواصل للاشتراك')} value={form.contact} onChangeText={set('contact')} maxLength={200} placeholder="WhatsApp 01xxxxxxxxx"/></Card>
    <Card><Label big>{t('OpenAI prices (US dollars)','أسعار OpenAI (دولار)')}</Label>
      <Label small>{t('Copy them from openai.com/api/pricing for the models the server uses. They only estimate costs here.','انسخها من openai.com/api/pricing للموديلات المستخدمة. تُستخدم لتقدير التكلفة فقط.')}</Label>
      {field('chatInputPerM','Assistant: per 1M input tokens','المساعد: لكل مليون توكن داخل',true)}
      {field('chatOutputPerM','Assistant: per 1M output tokens','المساعد: لكل مليون توكن خارج',true)}
      {field('transcribeInputPerM','Voice: per 1M input tokens','الصوت: لكل مليون توكن داخل',true)}
      {field('transcribeOutputPerM','Voice: per 1M output tokens','الصوت: لكل مليون توكن خارج',true)}
      {field('transcribePerMinute','Voice: per minute (if billed by minute)','الصوت: لكل دقيقة (إن كان بالدقيقة)',true)}</Card>
    <Button title={t('Save settings','حفظ الإعدادات')} disabled={busy || !valid} onPress={() => run(async () => {
      await api('/admin/settings',{ freeAiPerMonth:num('freeAiPerMonth'), personalPrice:num('personalPrice'), teamPrice:num('teamPrice'), contact:form.contact!.trim(),
        pricing:{ chatInputPerM:num('chatInputPerM'), chatOutputPerM:num('chatOutputPerM'), transcribeInputPerM:num('transcribeInputPerM'), transcribeOutputPerM:num('transcribeOutputPerM'), transcribePerMinute:num('transcribePerMinute') } });
      setSaved(true); })}/>
    {saved && <Notice>{t('Saved. Everyone sees the new prices and limits right away.','تم الحفظ. يرى الجميع الأسعار والحدود الجديدة فوراً.')}</Notice>}
  </View>;
}
