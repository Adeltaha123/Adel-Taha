import { useMemo, useState } from 'react';
import { Modal, ScrollView, View, Pressable, Text, TextInput } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { Task } from '../../../../shared/domain';
import { validDay, dayKey } from '../../../../shared/productivity';
import { put, remove, useStore } from '../../data/store';
import { Button, Chip, Field, Icon, IconButton, Label, Notice, Page, styles, useText, useTheme } from '../../app/ui';
import { SchedulePicker } from './SchedulePicker';
import { ReminderPermission } from '../CheckIns';
import { QUADRANTS } from './quadrants';

const PREVIEW = 6;
const isArabic = (s:string) => /[؀-ۿ]/.test(s);
const addDays = (key:string,n:number) => { const [y,m,d] = key.split('-').map(Number); return dayKey(new Date(y!,m!-1,d!+n)); };
const asDate = (key:string) => { const [y,m,d] = key.split('-').map(Number); return new Date(y!,m!-1,d!); };
const byPriority = (a:Task,b:Task) => Number(a.done)-Number(b.done) || (a.q||2)-(b.q||2) || (a.due||'9999').localeCompare(b.due||'9999') || (a.time||'99').localeCompare(b.time||'99') || (a.created||0)-(b.created||0);

/* Task board modelled on the web app: day strip, Eisenhower matrix, and a plain list. */
export function Tasks({ onVoice, onAnalyze }: { onVoice:()=>void; onAnalyze:(text:string)=>void }) {
  const state = useStore(), t = useText(), c = useTheme(), today = dayKey(), ar = state.language === 'ar', locale = ar ? 'ar-EG' : 'en-GB';
  const [mode,setMode] = useState<'matrix'|'list'>('matrix'), [day,setDay] = useState('all'), [showDone,setShowDone] = useState(false), [quick,setQuick] = useState(''),
    [query,setQuery] = useState(''), [searching,setSearching] = useState(false), [expanded,setExpanded] = useState<Record<number,boolean>>({}), [editing,setEditing] = useState<Task|null>(null);
  const all = useMemo(() => (Object.values(state.records) as unknown as Task[]).filter(x => x.kind === 'task'), [state.records]);
  const open = all.filter(x => !x.done), late = open.filter(x => x.due && x.due < today).length, undated = open.filter(x => !x.due).length;
  const mine = state.session ? open.filter(x => x.assigneeId === state.session!.user.id).length : 0;
  const shown = useMemo(() => all.filter(x => showDone || !x.done).filter(x => {
    if (query.trim() && !`${x.title} ${x.details ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
    return day === 'all' ? true : day === 'late' ? !!x.due && x.due < today && !x.done : day === 'nodate' ? !x.due : day === 'mine' ? x.assigneeId === state.session?.user.id : x.due === day;
  }).sort((a,b) => (/^\d{4}-/.test(day) && (a.time||'99').localeCompare(b.time||'99')) || byPriority(a,b)), [all,showDone,query,day,today,state.session]);
  const when = (x:Task) => {
    if (!x.due) return '';
    const label = x.due === today ? t('Today','اليوم') : x.due === addDays(today,1) ? t('Tomorrow','بكرة') : asDate(x.due).toLocaleDateString(locale,{ weekday:'short',day:'numeric',month:'short' });
    return label + (x.time ? ` · ${x.time}` : '');
  };
  const newTask = (title='') => ({ id:randomUUID(),kind:'task' as const,title,q:2 as const,done:false,items:[],created:Date.now(),due:/^\d{4}-/.test(day) ? day : null,time:null });
  // Signed in, typed text is understood like a voice note (split into tasks with dates, times and priorities) and
  // reviewed before saving. Without an account there is no assistant, so it is saved as written.
  function quickAdd() { const text = quick.trim(); if (!text) return; setQuick(''); if (state.session) onAnalyze(text.slice(0,4000)); else put(newTask(text.slice(0,500))); }
  const toggle = (x:Task) => put({ ...x,done:!x.done,doneAt:x.done ? null : Date.now() });
  const check = (x:Task,size=22) => <Pressable accessibilityRole="button" accessibilityLabel={x.done ? t('Reopen','إعادة فتح') : t('Complete','إنجاز')} onPress={() => toggle(x)} hitSlop={8} style={{ paddingTop:1 }}>
    <View style={{ width:size,height:size,borderWidth:2,borderColor:x.done ? c.accent : c.faint,borderRadius:size*0.3,backgroundColor:x.done ? c.accent : 'transparent',alignItems:'center',justifyContent:'center' }}>{x.done && <Icon name="check" size={size*0.62} color={c.onAccent} width={3}/>}</View></Pressable>;
  const titleText = (x:Task,size:number) => <Text style={{ fontSize:size,lineHeight:size*1.4,color:x.done ? c.faint : c.ink,textDecorationLine:x.done ? 'line-through' : 'none',textAlign:isArabic(x.title) ? 'right' : 'left',writingDirection:isArabic(x.title) ? 'rtl' : 'ltr' }}>{x.title}</Text>;
  const sub = (x:Task) => { const label = /^\d{4}-/.test(day) ? (x.time ?? '') : when(x); if (!label) return null; const overdue = !!x.due && x.due < today && !x.done;
    return <Text style={{ fontSize:13,marginTop:2,color:overdue ? c.q[1] : c.muted,textAlign:isArabic(x.title) ? 'right' : 'left' }}>{label}</Text>; };

  const dayChip = (key:string,top:string,bottom:string,opts:{ wide?:boolean; tone?:string; dots?:Task[]; isToday?:boolean } = {}) => { const on = day === key;
    return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected:on }} accessibilityLabel={`${bottom} ${top}`} onPress={() => setDay(key)}
      style={{ minWidth:opts.wide ? 76 : 62,height:76,paddingHorizontal:10,borderRadius:16,alignItems:'center',justifyContent:'center',gap:2,borderWidth:opts.isToday && !on ? 1.5 : 1,
        borderColor:on ? c.accent : opts.isToday ? c.gold : c.line,backgroundColor:on ? c.accent : c.surface }}>
      {opts.wide ? <><Text style={{ fontSize:20,fontWeight:'800',color:on ? c.onAccent : opts.tone ?? c.ink }}>{top}</Text><Text style={{ fontSize:12,color:on ? c.onAccent : c.muted }}>{bottom}</Text></>
        : <><Text style={{ fontSize:12,color:on ? c.onAccent : c.muted }}>{bottom}</Text><Text style={{ fontSize:19,fontWeight:'700',color:on ? c.onAccent : c.ink }}>{top}</Text>
          <View style={{ flexDirection:'row',gap:3,height:6 }}>{(opts.dots ?? []).slice(0,4).map(x => <View key={x.id} style={{ width:6,height:6,borderRadius:3,backgroundColor:on ? c.onAccent : c.q[x.q] }}/>)}</View></>}
    </Pressable>; };

  const quadrant = (q:typeof QUADRANTS[number]) => {
    const items = shown.filter(x => (x.q||2) === q.q), visible = expanded[q.q] ? items : items.slice(0,PREVIEW), count = items.filter(x => !x.done).length;
    return <View key={q.q} style={{ width:'48.5%',backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.line,borderTopWidth:5,borderTopColor:c.q[q.q],padding:12,gap:10,marginBottom:12 }}>
      <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6 }}><Text style={{ fontSize:16,fontWeight:'800',color:c.ink,flexShrink:1 }}>{t(q.en,q.ar)}</Text>
        <View style={{ minWidth:28,height:28,borderRadius:14,paddingHorizontal:7,backgroundColor:c.sunk,alignItems:'center',justifyContent:'center' }}><Text style={{ fontSize:13,fontWeight:'700',color:c.muted }}>{count}</Text></View></View>
      <Text style={{ fontSize:12,color:c.muted,marginTop:-4 }}>{t(q.hintEn,q.hintAr)}</Text>
      {visible.length ? visible.map(x => <View key={x.id} style={{ flexDirection:'row',alignItems:'flex-start',gap:8 }}>{check(x)}
        <Pressable accessibilityRole="button" accessibilityLabel={t('Edit','تعديل')} onPress={() => setEditing(x)} style={{ flex:1 }}>{titleText(x,14.5)}{sub(x)}</Pressable></View>) : <Text style={{ color:c.faint }}>—</Text>}
      {items.length > PREVIEW && <Pressable accessibilityRole="button" onPress={() => setExpanded(v => ({ ...v,[q.q]:!v[q.q] }))}><Text style={{ color:c.accent,fontWeight:'700',fontSize:13 }}>{expanded[q.q] ? t('Show less','عرض أقل') : `+${items.length-PREVIEW} ${t('more','أخرى')}`}</Text></Pressable>}
    </View>;
  };

  return <>
    <ScrollView contentContainerStyle={[styles.content,{ gap:14 }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.row,{ justifyContent:'space-between',flexWrap:'nowrap' }]}><Text style={{ flex:1,fontSize:30,fontWeight:'800',letterSpacing:-0.8,color:c.ink,textAlign:ar ? 'right' : 'left' }}>{t('Tasks','المهام')}</Text>
        <IconButton icon="search" size={40} active={searching} label={t('Search tasks','بحث المهام')} onPress={() => { setSearching(!searching); setQuery(''); }}/>
        <IconButton icon="mic" size={40} label={t('Say a task','قل مهمة')} onPress={onVoice}/>
        <IconButton icon="plus" size={40} active label={t('Add task','إضافة مهمة')} onPress={() => setEditing(newTask())}/></View>
      {searching && <Field label={t('Search tasks','بحث المهام')} value={query} onChangeText={setQuery} autoFocus/>}
      <View style={{ flexDirection:'row',gap:8 }}>
        <TextInput accessibilityLabel={t('Quick add a task','إضافة سريعة')} value={quick} onChangeText={setQuick} onSubmitEditing={quickAdd} returnKeyType="done" maxLength={500}
          placeholder={t('Add a task… (Arabic, English or Franco)','أضف مهمة… (عربي أو إنجليزي أو فرانكو)')} placeholderTextColor={c.faint}
          style={{ flex:1,minHeight:52,borderRadius:16,borderWidth:1,borderColor:c.line,backgroundColor:c.surface,paddingHorizontal:16,fontSize:16,color:c.ink,textAlign:ar ? 'right' : 'left' }}/>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Add','إضافة')} disabled={!quick.trim()} onPress={quickAdd} style={({ pressed }) => ({ minHeight:52,paddingHorizontal:20,borderRadius:16,backgroundColor:c.accent,justifyContent:'center',opacity:!quick.trim() ? 0.5 : pressed ? 0.85 : 1 })}><Text style={{ color:c.onAccent,fontWeight:'800',fontSize:16 }}>{t('Add','إضافة')}</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8,paddingVertical:2 }} style={{ marginHorizontal:-20 }}><View style={{ width:12 }}/>
        {dayChip('all',String(open.length),t('All','الكل'),{ wide:true })}
        {!!late && dayChip('late',String(late),t('Overdue','متأخرة'),{ wide:true,tone:c.q[1] })}
        {!!mine && dayChip('mine',String(mine),t('Mine','لي'),{ wide:true })}
        {Array.from({ length:14 },(_,i) => { const key = addDays(today,i), date = asDate(key);
          return dayChip(key,date.toLocaleDateString(locale,{ day:'numeric' }),i === 0 ? t('Today','اليوم') : date.toLocaleDateString(locale,{ weekday:'short' }),{ isToday:i === 0,dots:open.filter(x => x.due === key).sort(byPriority) }); })}
        {!!undated && dayChip('nodate',String(undated),t('No date','بدون موعد'),{ wide:true })}<View style={{ width:12 }}/></ScrollView>
      <View style={[styles.row,{ justifyContent:'space-between' }]}>
        <View style={{ flex:1,flexDirection:'row',backgroundColor:c.sunk,borderRadius:14,padding:4 }}>{(['matrix','list'] as const).map(m => <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected:mode === m }} onPress={() => setMode(m)}
          style={{ flex:1,height:40,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:mode === m ? c.surface : 'transparent',shadowColor:'#000',shadowOpacity:mode === m ? 0.08 : 0,shadowRadius:3,elevation:mode === m ? 1 : 0 }}><Text style={{ fontWeight:'700',color:mode === m ? c.ink : c.muted }}>{m === 'matrix' ? t('Matrix','المصفوفة') : t('List','القائمة')}</Text></Pressable>)}</View>
        <Chip title={showDone ? t('Hide completed','إخفاء المنجزة') : t('Show completed','عرض المنجزة')} active={showDone} onPress={() => setShowDone(!showDone)}/></View>
      {day !== 'all' && <View style={[styles.row,{ justifyContent:'space-between' }]}><Text style={{ fontSize:18,fontWeight:'800',color:c.ink }}>{day === 'late' ? t('Overdue','متأخرة') : day === 'nodate' ? t('No date','بدون موعد') : day === 'mine' ? t('Assigned to me','المسندة لي') : asDate(day).toLocaleDateString(locale,{ weekday:'long',day:'numeric',month:'long' })}</Text>
        <Pressable accessibilityRole="button" onPress={() => setDay('all')}><Text style={{ color:c.accent,fontWeight:'700' }}>{t('All tasks','كل المهام')}</Text></Pressable></View>}
      {mode === 'matrix' ? <View style={{ flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between' }}>{QUADRANTS.map(quadrant)}</View>
        : shown.length ? <View style={{ gap:10 }}>{shown.slice(0,200).map(x => <View key={x.id} style={{ flexDirection:'row',alignItems:'flex-start',gap:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,borderRadius:16,padding:14,borderStartWidth:5,borderStartColor:c.q[x.q] }}>{check(x,24)}
            <Pressable accessibilityRole="button" accessibilityLabel={t('Edit','تعديل')} onPress={() => setEditing(x)} style={{ flex:1,gap:4 }}>{titleText(x,16)}{sub(x)}
              {(!!x.items?.length || !!x.delegate) && <Text style={{ fontSize:12,color:c.muted }}>{x.items?.length ? `☑ ${x.items.filter(i => i.done).length}/${x.items.length}  ` : ''}{x.delegate ? `→ ${x.delegate}` : ''}</Text>}</Pressable></View>)}</View>
        : <View style={{ alignItems:'center',padding:30,gap:8 }}><Icon name="tasks" size={34} color={c.faint}/><Label>{t('Nothing here. Add a task or tap the mic.','لا شيء هنا. أضف مهمة أو اضغط الميكروفون.')}</Label></View>}
    </ScrollView>
    {editing && <TaskEditor key={editing.id} task={editing} close={() => setEditing(null)}/>}
  </>;
}
function TaskEditor({ task,close }: { task:Task; close:()=>void }) {
  const t = useText(), state = useStore();
  const [draft,setDraft] = useState<Task>({ ...task,items:task.items ?? [] }), [error,setError] = useState(''), [step,setStep] = useState(''), [confirm,setConfirm] = useState(false);
  function save() {
    if (!draft.title.trim() || draft.title.trim().length > 500) return setError(t('Use a title of 1–500 characters.','اكتب عنواناً من ١ إلى ٥٠٠ حرف.'));
    if (draft.due && !validDay(draft.due)) return setError(t('Use a real date: YYYY-MM-DD.','أدخل تاريخاً صحيحاً: YYYY-MM-DD.'));
    if (draft.time && (!draft.due || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time))) return setError(t('Add a date and a valid time: HH:MM.','أدخل التاريخ ووقتاً صحيحاً: HH:MM.'));
    put({ ...draft,title:draft.title.trim(),due:draft.due || null,time:draft.time || null,updated:Date.now() }); close();
  }
  return <Modal visible animationType="slide" onRequestClose={close}><Page><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Label big>{t('Task details','تفاصيل المهمة')}</Label><Field label={t('Title','العنوان')} value={draft.title} onChangeText={title => setDraft({ ...draft,title })} maxLength={500}/>
    <Field label={t('Details','التفاصيل')} value={draft.details ?? ''} onChangeText={details => setDraft({ ...draft,details })} multiline/>
    <SchedulePicker due={draft.due} time={draft.time} onChange={(due,time) => setDraft({...draft,due,time,checkInAfter:undefined,checkInDismissedFor:undefined})}/>
    {!!draft.due && <ReminderPermission/>}
    <Label>{t('Priority','الأولوية')}</Label>
    <View style={styles.row}>{QUADRANTS.map(x => <Chip key={x.q} title={t(x.en,x.ar)} active={draft.q === x.q} onPress={() => setDraft({ ...draft,q:x.q })}/>)}</View>
    {!!state.members.length && <><Label>{t('Assign to','إسناد إلى')}</Label><View style={styles.row}><Button title={t('Unassigned','بدون إسناد')} secondary onPress={() => setDraft({ ...draft,assigneeId:undefined,delegate:null })}/>{state.members.map(m => <Button key={m.id} title={(draft.assigneeId === m.id ? '✓ ' : '')+m.name} secondary onPress={() => setDraft({ ...draft,assigneeId:m.id,delegate:m.name })}/>)}</View></>}
    <Label>{t('Checklist','قائمة الخطوات')}</Label>{draft.items.map((item,index) => <Button key={index} secondary title={`${item.done ? '✓' : '○'} ${item.t}`} onPress={() => setDraft({ ...draft,items:draft.items.map((v,i) => i === index ? { ...v,done:!v.done } : v) })}/>)}
    <Field label={t('New step','خطوة جديدة')} value={step} onChangeText={setStep} maxLength={5000}/><Button title={t('Add step','إضافة خطوة')} disabled={!step.trim() || draft.items.length >= 500} secondary onPress={() => { setDraft({ ...draft,items:[...draft.items,{ t:step.trim(),done:false }] }); setStep(''); }}/>
    {!!error && <Notice tone="error">{error}</Notice>}<Button title={t('Save task','حفظ المهمة')} onPress={save}/><Button title={t('Cancel','إلغاء')} secondary onPress={close}/>
    {state.records[task.id] && <Button title={confirm ? t('Confirm delete','تأكيد الحذف') : t('Delete task','حذف المهمة')} danger onPress={() => { if (!confirm) setConfirm(true); else { remove(task.id); close(); } }}/>} 
  </ScrollView></Page></Modal>;
}
