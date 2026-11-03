import { useEffect,useRef,useState } from 'react';
import { AppState, View } from 'react-native';
import type { Task } from '../../../shared/domain';
import { checkInTime, scheduleKey, moveToTomorrow, checkInMessage } from '../../../shared/checkins';
import { put,useStore } from '../data/store';
import { enableReminders,onCheckInResponse,scheduleCheckIns,type CheckInAction,type CheckInResponse } from '../platform/notifications';
import { Button,Card,Label,styles,useText } from '../app/ui';
const SNOOZE_MS=30*60_000;
/** Applies a check-in answer to its task; the same choices appear on the notification and in the app. */
function answer(task:Task,action:Exclude<CheckInAction,'open'>|'dismiss') {
  if(action==='done') put({...task,done:true,doneAt:Date.now()});
  else if(action==='snooze') put({...task,checkInAfter:Date.now()+SNOOZE_MS});
  else if(action==='tomorrow') put(moveToTomorrow(task));
  else put({...task,checkInDismissedFor:scheduleKey(task)});
}
export function CheckIns() {
  const s=useStore(),t=useText(),[now,setNow]=useState(Date.now()),[status,setStatus]=useState('');
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
  const due=tasks.find(task=>{const at=checkInTime(task);return at!==null&&at<=now;});
  return <View style={{paddingHorizontal:22,gap:8}}>{due&&<Card><Label>{checkInMessage(due,'followup',now,s.language,name).title}</Label><Label big>{checkInMessage(due,'followup',now,s.language,name).body}</Label><View style={styles.row}>
    <Button title={t('✅ Done','✅ تمّت')} onPress={()=>answer(due,'done')}/>
    <Button title={t('⏰ In 30 min','⏰ بعد ٣٠ دقيقة')} secondary onPress={()=>answer(due,'snooze')}/>
    <Button title={t('📅 Tomorrow','📅 بكرة')} secondary onPress={()=>answer(due,'tomorrow')}/>
    <Button title={t('Dismiss','إغلاق')} secondary onPress={()=>answer(due,'dismiss')}/></View></Card>}{!!status&&<Label>{status}</Label>}</View>;
}
export function ReminderPermission() {
  const t=useText(),[status,setStatus]=useState(''),s=useStore();
  return <View style={{gap:8}}><Button title={t('Enable task reminders','تفعيل تذكيرات المهام')} secondary onPress={()=>void enableReminders().then(async granted=>{setStatus(granted?t('Reminders enabled','تم تفعيل التذكيرات'):t('Allow notifications in device settings. Web check-ins work while the app is open.','اسمح بالتنبيهات في إعدادات الجهاز. في المتصفح تظهر التذكيرات أثناء فتح التطبيق.'));if(granted)await scheduleCheckIns(Object.values(s.records).filter(r=>r.kind==='task') as unknown as Task[],s.scope,s.language,s.session?.user.name ?? '');}).catch(()=>setStatus(t('Could not enable reminders.','تعذّر تفعيل التذكيرات.')))}/>{!!status&&<Label>{status}</Label>}</View>;
}
