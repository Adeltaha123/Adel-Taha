import { TODAY, addDays, dkey, h, toast } from '../shared/helpers.js';
import { all } from '../data/store.js';
import { lang, t } from '../i18n/index.js';

/* reminders: remind = minutes before (-1 none). Default 30 min for timed tasks, 8:00 on the day otherwise. */
const remOf = x => x.remind==null ? (x.time?30:0) : x.remind;
function remindAt(x){
  if (!x.due || x.done) return null; const r=remOf(x); if (r===-1) return null;
  const [y,mo,d]=x.due.split("-").map(Number);
  if (x.time){ const [hh,mm]=x.time.split(":").map(Number); return new Date(y,mo-1,d,hh,mm).getTime()-r*60000; }
  return new Date(y,mo-1,d,8,0).getTime()-(r===1440?86400000:0);
}
const TZ = (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||"Africa/Cairo"; }catch(e){ return "Africa/Cairo"; } })();
const compact = k => k.replace(/-/g,"");
function endOf(x){ const [y,mo,d]=x.due.split("-").map(Number); const [hh,mm]=x.time.split(":").map(Number); const e=new Date(y,mo-1,d,hh+1,mm); const z=n=>String(n).padStart(2,"0"); return compact(dkey(e))+"T"+z(e.getHours())+z(e.getMinutes())+"00"; }
function taskDetails(x){ return [x.delegate?("Delegate: "+x.delegate):"",...(x.items||[]).map(i=>"- "+i.t),"Added from My PA"].filter(Boolean).join("\n"); }
function gcalUrl(x){
  const p=new URLSearchParams({action:"TEMPLATE",text:x.title,details:taskDetails(x)});
  if (x.time){ p.set("dates",compact(x.due)+"T"+x.time.replace(":","")+"00/"+endOf(x)); p.set("ctz",TZ); }
  else p.set("dates",compact(x.due)+"/"+compact(addDays(x.due,1)));
  return "https://calendar.google.com/calendar/render?"+p.toString();
}
function icsText(list){
  const esc=v=>String(v).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//My PA//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:My PA"];
  for (const x of list){
    L.push("BEGIN:VEVENT","UID:"+x.id+"@my-pa","DTSTAMP:"+stamp,"SUMMARY:"+esc(x.title),"DESCRIPTION:"+esc(taskDetails(x)));
    if (x.time) L.push("DTSTART:"+compact(x.due)+"T"+x.time.replace(":","")+"00","DTEND:"+endOf(x));
    else L.push("DTSTART;VALUE=DATE:"+compact(x.due),"DTEND;VALUE=DATE:"+compact(addDays(x.due,1)));
    const r=remOf(x);
    if (r!==-1) L.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+esc(x.title),"TRIGGER:"+(x.time?"-PT"+r+"M":(r===1440?"-PT16H":"PT8H")),"END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR"); return L.join("\r\n");
}
function exportIcs(){
  const list=all("task").filter(x=>!x.done&&x.due&&x.due>=TODAY()).sort((a,b)=>(a.due+(a.time||"")).localeCompare(b.due+(b.time||"")));
  if (!list.length) return toast(t("nothingCal"));
  const a=h("a",{href:URL.createObjectURL(new Blob([icsText(list)],{type:"text/calendar"})),download:"my-pa-calendar.ics"}); document.body.append(a); a.click(); a.remove();
  toast(lang==="ar"?`تم تجهيز ${list.length} موعد. افتح الملف واختر التقويم.`:`${list.length} items ready. Open the file and choose your Calendar app.`);
}

export { remOf, remindAt, TZ, compact, endOf, taskDetails, gcalUrl, icsText, exportIcs };
