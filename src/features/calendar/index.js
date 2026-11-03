import { lang, t } from '../../i18n/index.js';
import { TODAY, addDays, dkey, fmtDate, h, svg } from '../../shared/helpers.js';
import { UI, qColor } from '../../app/state.js';
import { checkBtn, fmtTime } from '../../shared/task-ui.js';
import { openTask, toggleTask } from '../tasks/index.js';
import { exportIcs, remOf, remindAt } from '../../services/calendar.js';
import { enableNotifications } from '../../services/reminders.js';
import { go, render } from '../../shared/events.js';
import { all } from '../../data/store.js';

/* calendar */
function calItem(x, showDay){
  const ar=lang==="ar";
  return h("div",{class:"cal-item",style:`--qc:${qColor(x.q)}`},
    h("div",{class:"cal-time"}, showDay?h("small",null,fmtDate(x.due,{weekday:"short",day:"numeric",month:"short"})):null, x.time?fmtTime(x.time):h("span",{class:"muted"},t("allDay"))),
    h("div",{class:"body",onclick:()=>openTask(x.id)},
      h("div",{class:"title",dir:"auto",style:"font-weight:500;overflow-wrap:anywhere"},x.title),
      x.details?h("div",{class:"detail-line",dir:"auto"},x.details.split("\n")[0]):null,
      h("div",{class:"meta"},h("span",{class:"chip"},t("q"+(x.q||2))),x.delegate?h("span",{class:"chip",dir:"auto"},"→ "+x.delegate):null,(x.items||[]).length?h("span",{class:"chip"},`☑ ${(x.items||[]).filter(i=>i.done).length}/${x.items.length}`):null,remindAt(x)!=null&&x.time?h("span",{class:"chip"},"⏰ "+(remOf(x)?(remOf(x)>=60?(remOf(x)/60)+(ar?" س":"h"):remOf(x)+(ar?" د":"m")):(ar?"في الموعد":"on time"))):null)),
    checkBtn(false,()=>toggleTask(x)));
}
const byWhen=(a,b)=>(a.due+(a.time||"99")).localeCompare(b.due+(b.time||"99"))||((a.q||2)-(b.q||2));
function remindersCard(){
  const perm = ("Notification" in window) ? Notification.permission : "denied";
  return h("details",{class:"card",open:perm!=="granted"},
    h("summary",{style:"cursor:pointer;font-weight:600"},"⏰ "+t("getRem")),
    h("div",{class:"stack",style:"gap:10px;margin-top:10px"},
      h("p",{class:"small muted",style:"margin:0"},t("getRemSub")),
      h("button",{type:"button",class:"btn primary",onclick:exportIcs},t("exportIcs")),
      perm==="granted" ? h("p",{class:"small muted",style:"margin:0"},"✓ "+t("notifOnDone"))
        : perm==="denied" ? h("p",{class:"small muted",style:"margin:0"},t("notifBlocked"))
        : h("button",{type:"button",class:"btn",onclick:enableNotifications},t("notifOn"))));
}
function viewCalendar(){
  const ar=lang==="ar", td=TODAY(), out=[];
  out.push(h("h1",null,t("calendar")));
  out.push(remindersCard());
  out.push(h("div",{class:"seg",role:"group"},["agenda","month"].map(m=>h("button",{type:"button","aria-pressed":(UI.calMode||"agenda")===m?"true":"false",onclick:()=>{UI.calMode=m;render();}},t(m)))));
  const open=all("task").filter(x=>!x.done && x.due).sort(byWhen);
  const undated=all("task").filter(x=>!x.done && !x.due).length;
  if ((UI.calMode||"agenda")==="agenda"){
    const dow=new Date().getDay(), weekEnd=addDays(td,6-dow), nextEnd=addDays(weekEnd,7), tm=addDays(td,1);
    const groups=[
      ["overdue", x=>x.due<td, true, ""],
      ["dueToday", x=>x.due===td, false, fmtDate(td,{weekday:"long",day:"numeric",month:"short"})],
      ["tomorrow", x=>x.due===tm, false, fmtDate(tm,{weekday:"long",day:"numeric",month:"short"})],
      ["thisWeek", x=>x.due>tm && x.due<=weekEnd, true, ""],
      ["nextWeek", x=>x.due>weekEnd && x.due<=nextEnd, true, fmtDate(addDays(weekEnd,1))+" – "+fmtDate(nextEnd)],
      ["later", x=>x.due>nextEnd, true, ""]];
    let any=false;
    for (const [k,fn,showDay,sub] of groups){
      const list=open.filter(fn); if(!list.length && !["dueToday","tomorrow"].includes(k)) continue; any = any || list.length>0;
      out.push(h("div",{class:"cal-group"},
        h("div",{class:"cal-head"+(k==="overdue"?" late":"")},h("h2",null,t(k)),h("span",{class:"small muted"},sub||String(list.length))),
        list.length ? list.map(x=>calItem(x,showDay)) : h("p",{class:"small muted",style:"margin:0"},"—")));
    }
    if (!any) out.push(h("p",{class:"muted"},t("nothingCal")));
  } else {
    const base = UI.calMonth || td.slice(0,7);
    const [y,m]=base.split("-").map(Number);
    const first=new Date(y,m-1,1), startKey=addDays(dkey(first),-first.getDay());
    const sel = UI.calDay || td;
    const byDay={}; for(const x of open){ (byDay[x.due]=byDay[x.due]||[]).push(x); }
    const shift=n=>{ const d=new Date(y,m-1+n,1); UI.calMonth=dkey(d).slice(0,7); render(); };
    out.push(h("div",{class:"row",style:"justify-content:space-between;flex-wrap:nowrap"},
      h("button",{type:"button",class:"iconbtn","aria-label":"Previous month",onclick:()=>shift(-1)},svg("back")),
      h("h2",null,first.toLocaleDateString(ar?"ar-EG":"en-GB",{month:"long",year:"numeric"})),
      h("button",{type:"button",class:"iconbtn","aria-label":"Next month",onclick:()=>shift(1)},h("span",{style:"display:grid;transform:scaleX(-1)"},svg("back")))));
    const grid=h("div",{class:"mgrid"});
    for(let i=0;i<7;i++) grid.append(h("div",{class:"dow"},new Date(2026,9,25+i).toLocaleDateString(ar?"ar-EG":"en-GB",{weekday:"narrow"})));
    for(let i=0;i<42;i++){ const k=addDays(startKey,i); const items=byDay[k]||[];
      grid.append(h("button",{type:"button",class:"mday"+(k.slice(0,7)!==base?" out":"")+(k===td?" today":""),"aria-pressed":k===sel?"true":"false","aria-label":fmtDate(k,{weekday:"long",day:"numeric",month:"long"}),onclick:()=>{UI.calDay=k;render();}},
        h("span",null,new Date(...k.split("-").map((v,j)=>j===1?v-1:+v)).toLocaleDateString(ar?"ar-EG":"en-GB",{day:"numeric"})),
        h("span",{class:"dots"},items.slice(0,3).map(x=>h("i",{style:`--qc:${qColor(x.q)}`}))))); }
    out.push(grid);
    const dayList=(byDay[sel]||[]);
    out.push(h("div",{class:"cal-group"},h("div",{class:"cal-head"},h("h2",null,fmtDate(sel,{weekday:"long",day:"numeric",month:"long"})),h("span",{class:"small muted"},String(dayList.length))),
      dayList.length?dayList.map(x=>calItem(x,false)):h("p",{class:"small muted",style:"margin:0"},"—")));
  }
  if (undated) out.push(h("button",{type:"button",class:"btn ghost",style:"align-self:flex-start",onclick:()=>go("tasks")},(lang==="ar"?`${undated} ${t("noDated")} →`:`${undated} task${undated===1?" has":"s have"} no date →`)));
  return out;
}

export { calItem, byWhen, remindersCard, viewCalendar };
