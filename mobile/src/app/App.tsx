import { useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { clearError, initialize, setLanguage, setTheme, sync, undoChange, useStore } from '../data/store';
import { Brand } from './Brand';
import { Button, Chip, Icon, IconButton, Label, Notice, Page, styles, useText, useTheme, type icons } from './ui';
import { Tasks } from '../features/tasks/Tasks';
import { VoiceTask } from '../features/tasks/VoiceTask';
import { Overview } from '../features/Overview';
import { Collections } from '../features/Collections';
import { Account } from '../features/Account';
import { Commands } from '../features/Commands';
import { Assistant } from '../features/Assistant';
import { Login } from '../features/Login';
import { CheckIns } from '../features/CheckIns';
import { AssistantNamePrompt } from '../features/AssistantName';
import { Lock } from '../features/Lock';
import { initializeLock, useLock } from '../platform/lock';
type Tab = 'overview'|'tasks'|'assistant'|'library'|'account';
const tabs:[Tab,keyof typeof icons,string,string][] = [['overview','overview','Today','اليوم'],['tasks','tasks','Tasks','المهام'],['assistant','assistant','Assistant','المساعد'],['library','library','Library','المكتبة'],['account','account','Account','الحساب']];
export default function App() { return <SafeAreaProvider><Shell/></SafeAreaProvider>; }
function Shell() {
  const s = useStore(), lock = useLock(), t = useText(), c = useTheme(), [tab,setTab] = useState<Tab>('overview'), [library,setLibrary] = useState('notes'), [guest,setGuest] = useState(false), [voice,setVoice] = useState(false);
  useEffect(()=>{if(s.session)setGuest(false);},[s.session]);
  useEffect(() => { void initialize(); void initializeLock(); const interval = setInterval(() => { if (AppState.currentState === 'active') void sync().catch(() => {}); },30000);
    const listener = AppState.addEventListener('change',value => { if (value === 'active') void sync().catch(() => {}); });
    return () => { clearInterval(interval); listener.remove(); };
  },[]);
  const inside = s.ready && (s.session || guest);
  const tabButton = ([id,icon,en,ar]:typeof tabs[number]) => { const on = tab === id;
    return <Pressable key={id} accessibilityRole="button" accessibilityLabel={id === 'overview' ? t('Overview','نظرة عامة') : t(en,ar)} accessibilityState={{ selected:on }} onPress={() => setTab(id)} style={{ flex:1,alignItems:'center',gap:4,paddingVertical:4 }}>
      <View style={{ paddingHorizontal:14,paddingVertical:4,borderRadius:999,backgroundColor:on ? c.accentSoft : 'transparent' }}><Icon name={icon} size={22} color={on ? c.accent : c.faint}/></View>
      <Text style={{ fontSize:11,fontWeight:on ? '700' : '500',color:on ? c.accent : c.faint }}>{t(en,ar)}</Text></Pressable>; };
  return <Page><StatusBar style={c.dark ? 'light' : 'dark'}/><KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ paddingHorizontal:20,paddingTop:8,paddingBottom:10,gap:10,backgroundColor:c.bg }}>
      <View style={[styles.row,{ justifyContent:'space-between',flexWrap:'nowrap' }]}><Brand size={34}/>
        <View style={[styles.row,{ flexWrap:'nowrap' }]}>
          <IconButton icon={c.dark ? 'sun' : 'moon'} size={40} label={c.dark ? t('Light mode','الوضع الفاتح') : t('Dark mode','الوضع الداكن')} onPress={() => setTheme(c.dark ? 'light' : 'dark')}/>
          <Chip title={s.language === 'en' ? 'العربية' : 'English'} active={false} onPress={() => setLanguage(s.language === 'en' ? 'ar' : 'en')}/></View></View>
      {inside && <View style={[styles.row,{ justifyContent:'space-between' }]}><View style={{ alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,borderRadius:999,paddingHorizontal:10,paddingVertical:4 }}><View style={{ width:7,height:7,borderRadius:4,backgroundColor:s.session ? c.accent : c.gold }}/><Text style={{ fontSize:12,color:c.muted }}>{s.status || t('Saved on this device','محفوظ على الجهاز')}</Text></View>{s.undo && <Chip title={t('Undo last change','تراجع عن آخر تغيير')} active={false} onPress={undoChange}/>}</View>}
      {!!s.error && <View style={{ gap:8 }}><Notice tone="error">{s.error}</Notice><Button title={t('Dismiss','إغلاق')} secondary onPress={clearError}/></View>}</View>
    {inside && tab === 'library' && <View style={[styles.row,{ paddingHorizontal:20,paddingTop:4 }]}>{[['notes','Notes','ملاحظات'],['habits','Habits','عادات'],['commands','Commands','أوامر']].map(([id,en,ar]) => <Chip key={id} title={t(en!,ar!)} active={library === id} onPress={() => setLibrary(id!)}/>)}</View>}
    {inside && <CheckIns/>}
    {!s.ready ? <View style={styles.content}><Label>{t('Loading saved data…','تحميل البيانات…')}</Label></View> : !inside ? <Login onGuest={() => setGuest(true)}/> : s.session && s.scope === 'guest' ? <Account/> : <View key={`${s.scope}:${s.session?.user.id ?? 'guest'}:${tab}:${library}`} style={{ flex:1 }}>{tab === 'overview' ? <Overview onAssistant={() => setTab('assistant')} onVoice={() => setVoice(true)}/> : tab === 'tasks' ? <Tasks onVoice={() => setVoice(true)}/> : tab === 'assistant' ? <Assistant/> : tab === 'library' ? library === 'commands' ? <Commands/> : <Collections kind={library === 'notes' ? 'note' : 'habit'}/> : <Account/>}</View>}
    {inside && <View style={{ flexDirection:'row',alignItems:'flex-end',borderTopWidth:1,borderColor:c.line,paddingTop:8,paddingBottom:6,backgroundColor:c.surface }}>
      {tabs.slice(0,2).map(tabButton)}
      <View style={{ flex:1,alignItems:'center' }}><Pressable accessibilityRole="button" accessibilityLabel={t('Say a task','قل مهمة')} onPress={() => setVoice(true)} style={({ pressed }) => ({ marginTop:-30,width:62,height:62,borderRadius:31,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',borderWidth:4,borderColor:c.bg,opacity:pressed ? 0.85 : 1,shadowColor:'#000',shadowOpacity:0.18,shadowRadius:10,shadowOffset:{ width:0,height:4 },elevation:6 })}><Icon name="mic" size={26} color={c.onAccent} width={2.1}/></Pressable></View>
      {tabs.slice(2).map(tabButton)}</View>}
    {voice && <VoiceTask close={() => setVoice(false)}/>}
    {s.session && s.askName && <AssistantNamePrompt/>}
  </KeyboardAvoidingView>
    {lock.mode === 'loading' ? <View style={{ position:'absolute',top:0,bottom:0,left:0,right:0,zIndex:100,backgroundColor:c.bg }}/> : lock.mode !== 'open' && <Lock key={lock.mode}/>}</Page>;
}
