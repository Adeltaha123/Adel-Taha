import { Platform } from 'react-native';
import type { Task, Language } from '../../../shared/domain';
import { upcomingCheckIns, scheduleKey, checkInMessage } from '../../../shared/checkins';
let queue=Promise.resolve();
const answered=new Set<string>(); // A launch tap can arrive both as the last response and through the listener.
async function notifications() { return await import('expo-notifications'); }
export type CheckInAction = 'done'|'snooze'|'tomorrow'|'open';
export type CheckInResponse = { action:CheckInAction; scope:string; taskId:string; schedule:string };
const CATEGORY='mypa-checkin';
/** The buttons under each check-in. They open the app, which applies the choice to the task. */
async function setCategory(language:Language) {
  const n=await notifications(), ar=language==='ar';
  await n.setNotificationCategoryAsync(CATEGORY,[
    { identifier:'done', buttonTitle:ar?'✅ تمّت':'✅ Done', options:{ opensAppToForeground:true } },
    { identifier:'snooze', buttonTitle:ar?'⏰ بعد ٣٠ دقيقة':'⏰ In 30 min', options:{ opensAppToForeground:true } },
    { identifier:'tomorrow', buttonTitle:ar?'📅 بكرة':'📅 Tomorrow', options:{ opensAppToForeground:true } },
  ]);
}
export async function enableReminders() {
  if(Platform.OS==='web') return false;
  const n=await notifications();
  if(Platform.OS==='android') await n.setNotificationChannelAsync('mypa-checkins',{name:'My PA · تذكير المهام',importance:n.AndroidImportance.HIGH});
  return (await n.requestPermissionsAsync()).granted;
}
export function scheduleCheckIns(tasks:Task[],scope:string,language:Language,name='') {
  queue=queue.catch(()=>{}).then(async()=>{
    if(Platform.OS==='web') return;
    const n=await notifications();
    const existing=await n.getAllScheduledNotificationsAsync();
    for(const item of existing) if(item.content.data?.mypa===true) await n.cancelScheduledNotificationAsync(item.identifier);
    if(!tasks.length) for(const item of await n.getPresentedNotificationsAsync()) if(item.request.content.data?.mypa===true) await n.dismissNotificationAsync(item.request.identifier);
    if(!(await n.getPermissionsAsync()).granted) return;
    n.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
    await setCategory(language);
    for(const {task,at,kind} of upcomingCheckIns(tasks,Date.now())) {
      const message=checkInMessage(task,kind,at,language,name);
      await n.scheduleNotificationAsync({content:{...message,sound:'default',categoryIdentifier:CATEGORY,data:{mypa:true,scope,taskId:task.id,schedule:scheduleKey(task)}},trigger:{type:n.SchedulableTriggerInputTypes.DATE,date:new Date(at),channelId:'mypa-checkins'}});
    }
  });
  return queue;
}
/** Calls back for each check-in the user answers, including the one that launched the app. Returns an unsubscribe function. */
export function onCheckInResponse(handle:(response:CheckInResponse)=>void) {
  if(Platform.OS==='web') return ()=>{};
  let subscription:{remove:()=>void}|null=null, stopped=false;
  void notifications().then(async n=>{
    const read=(r:import('expo-notifications').NotificationResponse|null)=>{
      const data=r?.notification.request.content.data;
      if(!r||data?.mypa!==true||typeof data.taskId!=='string'||typeof data.scope!=='string') return;
      const id=`${r.notification.request.identifier}:${r.actionIdentifier}`;
      if(answered.has(id)) return; answered.add(id);
      const action=(['done','snooze','tomorrow'] as const).find(a=>a===r.actionIdentifier) ?? 'open';
      handle({ action, scope:data.scope, taskId:data.taskId, schedule:String(data.schedule ?? '') });
      void n.dismissNotificationAsync(r.notification.request.identifier).catch(()=>{});
    };
    const last=await n.getLastNotificationResponseAsync();
    if(stopped) return;
    if(last){ await n.clearLastNotificationResponseAsync(); read(last); }
    subscription=n.addNotificationResponseReceivedListener(read);
  });
  return ()=>{ stopped=true; subscription?.remove(); };
}
