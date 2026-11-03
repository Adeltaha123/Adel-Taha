import { useEffect,useState } from 'react';
import { AppState, View } from 'react-native';
import type { Task } from '../../../src/types/domain';
import { checkInTime, scheduleKey } from '../../../shared/checkins';
import { put,useStore } from '../data/store';
import { enableReminders,scheduleCheckIns } from '../platform/notifications';
import { Button,Card,Label,styles,useText } from '../app/ui';
export function CheckIns() {
  const s=useStore(),t=useText(),[now,setNow]=useState(Date.now()),[status,setStatus]=useState('');
  const tasks=Object.values(s.records).filter(r=>r.kind==='task') as unknown as Task[];
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);const listener=AppState.addEventListener('change',v=>{if(v==='active')setNow(Date.now());});return()=>{clearInterval(timer);listener.remove();};},[]);
  useEffect(()=>{void scheduleCheckIns(tasks,s.scope,s.language).catch(()=>setStatus(t('Could not schedule notifications. Check device permissions.','تعذّر جدولة التنبيهات. راجع أذونات الجهاز.')));},[s.records,s.scope,s.language]);
  useEffect(()=>()=>{void scheduleCheckIns([],s.scope,s.language).catch(()=>{});},[]);
  const due=tasks.find(task=>{const at=checkInTime(task);return at!==null&&at<=now;});
  return <View style={{paddingHorizontal:22,gap:8}}>{due&&<Card><Label>{t('Have you completed this task?','هل أنجزت هذه المهمة؟')}</Label><Label big>{due.title}</Label><View style={styles.row}><Button title={t('Yes, completed','نعم، أنجزتها')} onPress={()=>put({...due,done:true,doneAt:Date.now()})}/><Button title={t('In 10 minutes','بعد ١٠ دقائق')} secondary onPress={()=>put({...due,checkInAfter:Date.now()+600000})}/><Button title={t('Dismiss check-in','إغلاق التذكير')} secondary onPress={()=>put({...due,checkInDismissedFor:scheduleKey(due)})}/></View></Card>}{!!status&&<Label>{status}</Label>}</View>;
}
export function ReminderPermission() {
  const t=useText(),[status,setStatus]=useState(''),s=useStore();
  return <View style={{gap:8}}><Button title={t('Enable task reminders','تفعيل تذكيرات المهام')} secondary onPress={()=>void enableReminders().then(async granted=>{setStatus(granted?t('Reminders enabled','تم تفعيل التذكيرات'):t('Allow notifications in device settings. Web check-ins work while the app is open.','اسمح بالتنبيهات في إعدادات الجهاز. في المتصفح تظهر التذكيرات أثناء فتح التطبيق.'));if(granted)await scheduleCheckIns(Object.values(s.records).filter(r=>r.kind==='task') as unknown as Task[],s.scope,s.language);}).catch(()=>setStatus(t('Could not enable reminders.','تعذّر تفعيل التذكيرات.')))}/>{!!status&&<Label>{status}</Label>}</View>;
}
