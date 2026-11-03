import { LOCK } from '../features/security/index.js';
import { all } from '../data/store.js';
import { remindAt } from './calendar.js';
import { TODAY, fmtDate, toast } from '../shared/helpers.js';
import { t } from '../i18n/index.js';
import { fmtTime } from '../shared/task-ui.js';
import { render } from '../shared/events.js';

/* in-app notifications */
const NOTI={timers:[],deb:null};
function notifiedSet(){ try{ return new Set(JSON.parse(localStorage.getItem("mk_notified")||"[]")); }catch(e){ return new Set(); } }
function markNotified(k){ const st=notifiedSet(); st.add(k); try{ localStorage.setItem("mk_notified",JSON.stringify([...st].slice(-400))); }catch(e){} }
function scheduleReminders(){
  if (document.documentElement.dataset.nativeNotifications === 'true') return;
  clearTimeout(NOTI.deb);
  NOTI.deb=setTimeout(()=>{
    NOTI.timers.forEach(clearTimeout); NOTI.timers=[]; if(!LOCK.unlocked) return;
    const now=Date.now(), seen=notifiedSet();
    for (const x of all("task")){ const at=remindAt(x); if(at==null) continue; const key=x.id+"@"+at; if(seen.has(key)) continue;
      if (at<=now){ if (now-at<6*3600e3) fireReminder(x,key); continue; }
      if (at-now<24*3600e3) NOTI.timers.push(setTimeout(()=>fireReminder(x,key),at-now)); }
  },300);
}
async function fireReminder(x,key){
  markNotified(key);
  const body=(x.due===TODAY()?t("dueToday"):fmtDate(x.due))+(x.time?" · "+fmtTime(x.time):"");
  toast("⏰ "+x.title+" · "+body);
  try{ if ("Notification" in window && Notification.permission==="granted"){ const reg=navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification(x.title,{body,tag:x.id,icon:"icon-192.png",badge:"icon-192.png",vibrate:[200,100,200]}); else new Notification(x.title,{body}); } }catch(e){}
}
async function enableNotifications(){
  if (document.documentElement.dataset.nativeNotifications === 'true') { document.dispatchEvent(new Event('mypa:enable-reminders')); return; }
  if (!("Notification" in window)) return toast(t("notifBlocked"));
  const r = await Notification.requestPermission();
  toast(r==="granted"?t("notifOnDone"):t("notifBlocked")); scheduleReminders(); render();
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) scheduleReminders(); });

export { NOTI, notifiedSet, markNotified, scheduleReminders, fireReminder, enableNotifications };
