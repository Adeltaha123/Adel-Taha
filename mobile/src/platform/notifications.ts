import { Platform } from 'react-native';
import type { Task, Language } from '../../../shared/domain';
import { upcomingCheckIns, scheduleKey } from '../../../shared/checkins';
let queue=Promise.resolve();
async function notifications() { return await import('expo-notifications'); }
export async function enableReminders() {
  if(Platform.OS==='web') return false;
  const n=await notifications();
  if(Platform.OS==='android') await n.setNotificationChannelAsync('mypa-checkins',{name:'My PA · تذكير المهام',importance:n.AndroidImportance.HIGH});
  return (await n.requestPermissionsAsync()).granted;
}
export function scheduleCheckIns(tasks:Task[],scope:string,language:Language) {
  queue=queue.catch(()=>{}).then(async()=>{
    if(Platform.OS==='web') return;
    const n=await notifications();
    const existing=await n.getAllScheduledNotificationsAsync();
    for(const item of existing) if(item.content.data?.mypa===true) await n.cancelScheduledNotificationAsync(item.identifier);
    if(!tasks.length) for(const item of await n.getPresentedNotificationsAsync()) if(item.request.content.data?.mypa===true) await n.dismissNotificationAsync(item.request.identifier);
    if(!(await n.getPermissionsAsync()).granted) return;
    n.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
    for(const {task,at} of upcomingCheckIns(tasks,Date.now())) await n.scheduleNotificationAsync({content:{title:language==='ar'?'هل أنجزت هذه المهمة؟':'Have you completed this task?',body:task.title,sound:'default',data:{mypa:true,scope,taskId:task.id,schedule:scheduleKey(task)}},trigger:{type:n.SchedulableTriggerInputTypes.DATE,date:new Date(at),channelId:'mypa-checkins'}});
  });
  return queue;
}
