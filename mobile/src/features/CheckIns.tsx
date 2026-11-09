import { useEffect,useRef,useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import type { Task } from '../../../shared/domain';
import { checkInTime, scheduleKey, moveToTomorrow } from '../../../shared/checkins';
import { boardQuadrant, dayKey } from '../../../shared/productivity';
import { put,useStore } from '../data/store';
import { enableReminders,onCheckInResponse,scheduleCheckIns,type CheckInAction,type CheckInResponse } from '../platform/notifications';
import { Button,Icon,Label,useText,useTheme } from '../app/ui';
const SNOOZE_MS=30*60_000;
/** Applies a check-in answer to its task; the same choices appear on the notification and in the app. */
function answer(task:Task,action:Exclude<CheckInAction,'open'>|'dismiss') {
  if(action==='done') put({...task,done:true,doneAt:Date.now()});
  else if(action==='snooze') put({...task,checkInAfter:Date.now()+SNOOZE_MS});
  else if(action==='tomorrow') put(moveToTomorrow(task));
  else put({...task,checkInDismissedFor:scheduleKey(task)});
}
export function CheckIns() {
  const s=useStore(),t=useText(),c=useTheme(),[now,setNow]=useState(Date.now()),[status,setStatus]=useState('');
  const tasks=Object.values(s.records).filter(r=>r.kind==='task') as unknown as Task[];
  const latest=useRef({records:s.records,scope:s.scope});latest.current={records:s.records,scope:s.scope};
  const name=s.session?.user.name ?? '';
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);const listener=AppState.addEventListener('change',v=>{if(v==='active')setNow(Date.now());});return()=>{clearInterval(timer);listener.remove();};},[]);
  useEffect(()=>{void scheduleCheckIns(tasks,s.scope,s.language,name).catch(()=>setStatus(t('Could not schedule notifications. Check device permissions.','تعذّر جدولة التنبيهات. راجع أذونات الجهاز.')));},[s.records,s.scope,s.language,name]);
  useEffect(()=>()=>{void scheduleCheckIns([],s.scope,s.language).catch(()=>{});},[]);
  // Buttons pressed on a notification: apply them to the task if it still has the same schedule. A tap that launched
  // the app can arrive before the signed-in workspace has loaded, so it waits until that workspace is current.
  const pending=useRef<CheckInResponse[]>([]);
  function apply(){
    pending.current=pending.current.filter(({action,scope,taskId,schedule})=>{
      if(scope!==latest.current.scope) return true;
      const task=latest.current.records[taskId] as unknown as Task|undefined;
      if(action!=='open'&&task?.kind==='task'&&!task.done&&(action==='done'||scheduleKey(task)===schedule)) answer(task,action);
      return false;
    });
  }
  useEffect(()=>onCheckInResponse(response=>{pending.current.push(response);apply();}),[]);
  useEffect(apply,[s.scope,s.records]);
  // Tasks whose time has come, earliest first; one compact strip at a time, the next appears after an answer.
  const waiting=tasks.map(task=>({task,at:checkInTime(task)})).filter((v):v is {task:Task;at:number}=>v.at!==null&&v.at<=now).sort((a,b)=>a.at-b.at);
  const due=waiting[0]?.task;
  if(!due) return status?<View style={{paddingHorizontal:20}}><Label small>{status}</Label></View>:null;
  const today=dayKey(), ar=s.language==='ar', overdue=!!due.due&&due.due<today;
  const when=overdue
    ? t(`Overdue since ${new Date(`${due.due}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`,`متأخرة من ${new Date(`${due.due}T12:00:00`).toLocaleDateString('ar-EG',{day:'numeric',month:'short'})}`)
    : due.time ? t(`Today ${due.time} · done?`,`النهاردة ${due.time} · خلّصتها؟`) : t('Today · done?','النهاردة · خلّصتها؟');
  const pill=(label:string,onPress:()=>void,primary=false,a11y?:string)=><Pressable accessibilityRole="button" accessibilityLabel={a11y??label} onPress={onPress} hitSlop={4}
    style={({pressed})=>({height:32,paddingHorizontal:12,borderRadius:16,justifyContent:'center',backgroundColor:primary?c.accent:c.sunk,opacity:pressed?0.75:1})}>
    <Text style={{fontSize:13,fontWeight:'700',color:primary?c.onAccent:c.ink}}>{label}</Text></Pressable>;
  return <View style={{paddingHorizontal:20,paddingBottom:6}}>
    <View accessibilityRole="summary" style={{flexDirection:'row',gap:10,backgroundColor:c.surface,borderWidth:1,borderColor:overdue?c.q[1]:c.line,borderRadius:16,padding:10}}>
      <View style={{width:4,borderRadius:2,backgroundColor:c.q[boardQuadrant(due,today)]}}/>
      <View style={{flex:1,gap:8}}>
        <View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}>
          <View style={{flex:1}}>
            <Text numberOfLines={1} style={{fontSize:15,fontWeight:'700',color:c.ink,textAlign:ar?'right':'left'}}>{due.title}</Text>
            <Text numberOfLines={1} style={{fontSize:12,color:overdue?c.q[1]:c.muted,textAlign:ar?'right':'left'}}>{when}{waiting.length>1?t(` · 1 of ${waiting.length}`,` · ١ من ${waiting.length}`):''}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Dismiss','إغلاق')} onPress={()=>answer(due,'dismiss')} hitSlop={10} style={{padding:2}}><Icon name="close" size={16} color={c.faint} width={2}/></Pressable>
        </View>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
          {pill(t('✓ Done','✓ تمّت'),()=>answer(due,'done'),true,t('Done','تمّت'))}
          {pill(t('⏰ 30 min','⏰ ٣٠ دقيقة'),()=>answer(due,'snooze'),false,t('In 30 min','بعد ٣٠ دقيقة'))}
          {pill(t('📅 Tomorrow','📅 بكرة'),()=>answer(due,'tomorrow'),false,t('Tomorrow','بكرة'))}
        </View>
      </View>
    </View>
  </View>;
}
export function ReminderPermission() {
  const t=useText(),[status,setStatus]=useState(''),s=useStore();
  return <View style={{gap:8}}><Button title={t('Enable task reminders','تفعيل تذكيرات المهام')} secondary onPress={()=>void enableReminders().then(async granted=>{setStatus(granted?t('Reminders enabled','تم تفعيل التذكيرات'):t('Allow notifications in device settings. Web check-ins work while the app is open.','اسمح بالتنبيهات في إعدادات الجهاز. في المتصفح تظهر التذكيرات أثناء فتح التطبيق.'));if(granted)await scheduleCheckIns(Object.values(s.records).filter(r=>r.kind==='task') as unknown as Task[],s.scope,s.language,s.session?.user.name ?? '');}).catch(()=>setStatus(t('Could not enable reminders.','تعذّر تفعيل التذكيرات.')))}/>{!!status&&<Label>{status}</Label>}</View>;
}
