import { useEffect, useState } from 'react';
import { ScrollView, Share, View, Text, Pressable } from 'react-native';
import type { Task } from '../../../shared/domain';
import { dayKey, focusRemaining, taskSummary } from '../../../shared/productivity';
import { setFocus, useStore, reportError } from '../data/store';
import { Button, Card, Eyebrow, Icon, Label, styles, useText, useTheme } from '../app/ui';
import { InstallCard } from './Install';
const FOCUS = 25*60;
export function Overview({ onAssistant, onVoice }: { onAssistant:()=>void; onVoice:()=>void }) {
  const state = useStore(), t = useText(), c = useTheme(), [now,setNow] = useState(Date.now()), [hideInstall,setHideInstall] = useState(false);
  useEffect(() => { if (!state.focusEnd) return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); },[state.focusEnd]);
  const tasks = Object.values(state.records).filter(r => r.kind === 'task') as unknown as Task[];
  const summary = taskSummary(tasks), remaining = focusRemaining(state.focusEnd,now), hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning','صباح الخير') : hour < 18 ? t('Good afternoon','نهارك سعيد') : t('Good evening','مساء الخير');
  const progress = summary.total ? summary.completed/summary.total : 0;
  const stats = [[t('Open','مفتوحة'),summary.open],[t('Due today','اليوم'),summary.today],[t('Overdue','متأخرة'),summary.overdue],[t('Completed','منجزة'),summary.completed]] as const;
  const next = tasks.filter(x => !x.done).sort((a,b) => a.q-b.q || (a.due || '9999').localeCompare(b.due || '9999')).slice(0,5);
  const date = new Date().toLocaleDateString(state.language === 'ar' ? 'ar-EG' : 'en-GB',{ weekday:'long',day:'numeric',month:'long' });
  const quick = (icon:'mic'|'assistant',title:string,label:string,onPress:()=>void,primary:boolean) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flex:1,gap:10,padding:16,borderRadius:20,backgroundColor:primary ? c.accent : c.surface,borderWidth:primary ? 0 : 1,borderColor:c.line,opacity:pressed ? 0.85 : 1 })}>
    <View style={{ width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:primary ? 'rgba(255,255,255,0.18)' : c.accentSoft }}><Icon name={icon} size={20} color={primary ? c.onAccent : c.accent} width={2}/></View>
    <Text style={{ color:primary ? c.onAccent : c.ink,fontWeight:'700',fontSize:15 }}>{title}</Text></Pressable>;
  return <ScrollView contentContainerStyle={styles.content}>
    {!hideInstall && <InstallCard onDismiss={() => setHideInstall(true)}/>}
    <View style={{ gap:4 }}><Eyebrow>{date}</Eyebrow><Label big>{greeting}</Label><Label>{t('Make room for what matters','وقت لما يهمك')}</Label></View>
    <View style={{ backgroundColor:c.hero,borderRadius:24,padding:20,gap:14 }}>
      <View style={[styles.row,{ justifyContent:'space-between' }]}><Eyebrow color={c.gold}>{t("TODAY'S PROGRESS",'تقدّم اليوم')}</Eyebrow><Text style={{ color:c.heroInk,fontWeight:'700',fontSize:15 }}>{Math.round(progress*100)}%</Text></View>
      <View style={{ height:8,borderRadius:4,backgroundColor:'rgba(255,255,255,0.12)',overflow:'hidden' }}><View style={{ width:`${progress*100}%`,height:8,borderRadius:4,backgroundColor:c.gold }}/></View>
      <View style={{ flexDirection:'row' }}>{stats.map(([name,value],i) => <View key={name} style={{ flex:1,gap:2 }}><Text style={{ fontSize:26,fontWeight:'700',color:i === 2 && value ? c.q[1] : c.heroInk }}>{value}</Text><Text style={{ fontSize:12,color:c.heroMuted }}>{name}</Text></View>)}</View></View>
    <View style={{ flexDirection:'row',gap:12 }}>{quick('mic',t('Say a task','قل مهمة'),t('Say a task with your voice','قل مهمة بصوتك'),onVoice,true)}{quick('assistant',state.assistantName ? t(`Ask ${state.assistantName}`,`اسأل ${state.assistantName}`) : t('Plan with AI','خطّط مع المساعد'),t('Open assistant','فتح المساعد'),onAssistant,false)}</View>
    <Card><View style={[styles.row,{ justifyContent:'space-between' }]}><View style={{ gap:2 }}><Eyebrow>{t('FOCUS SESSION','جلسة تركيز')}</Eyebrow><Label>{t('One task. 25 calm minutes.','مهمة واحدة. ٢٥ دقيقة هادئة.')}</Label></View>
        <Text style={{ fontSize:34,fontWeight:'700',color:state.focusEnd ? c.accent : c.ink,fontVariant:['tabular-nums'] }}>{state.focusEnd ? `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}` : '25:00'}</Text></View>
      {!!state.focusEnd && <View style={{ height:6,borderRadius:3,backgroundColor:c.sunk,overflow:'hidden' }}><View style={{ width:`${(1-remaining/FOCUS)*100}%`,height:6,backgroundColor:c.accent }}/></View>}
      {state.focusEnd && remaining === 0 && <Label strong>{t('Session complete. Take a short break.','انتهت الجلسة. خذ استراحة قصيرة.')}</Label>}
      <Button secondary={!!state.focusEnd} title={state.focusEnd ? t('Reset timer','إعادة ضبط') : t('Start focus','ابدأ التركيز')} onPress={() => setFocus(state.focusEnd ? null : Date.now()+FOCUS*1000)}/></Card>
    <Card><Eyebrow>{t('NEXT PRIORITIES','الأولويات القادمة')}</Eyebrow>
      {next.map(task => <View key={task.id} style={{ flexDirection:'row',alignItems:'center',gap:12 }}><View style={{ width:10,height:10,borderRadius:5,backgroundColor:c.q[task.q] }}/><View style={{ flex:1 }}><Label strong>{task.title}</Label>{!!task.due && <Label small>{task.due}{task.time ? ` · ${task.time}` : ''}</Label>}</View></View>)}
      {!summary.open && <Label>{t('Nothing pending. Tap the mic to add your next task.','لا توجد مهام معلقة. اضغط الميكروفون لإضافة مهمتك القادمة.')}</Label>}</Card>
    {!!state.members.length && <Card><Eyebrow>{t('TEAM WORKLOAD','مهام الفريق')}</Eyebrow>{state.members.map(m => <Label key={m.id}>{m.name}: {tasks.filter(x => !x.done && x.assigneeId === m.id).length} {t('open','مفتوحة')}</Label>)}</Card>}
    <Button title={t('Share progress report','مشاركة تقرير التقدم')} secondary onPress={() => void Share.share({ message:`My PA · ${dayKey()}\n${stats.map(([name,value]) => `${name}: ${value}`).join('\n')}` }).catch(reportError)}/>
  </ScrollView>;
}
