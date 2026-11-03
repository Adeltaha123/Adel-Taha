import { S, all, patch, put, remove } from '../../data/store.js';
import { $, TODAY, addDays, fmtDate, h, svg, toast, uid } from '../../shared/helpers.js';
import { Q, UI, qColor, rememberUI } from '../../app/state.js';
import { checkBtn, dueChip, fmtTime, normTime } from '../../shared/task-ui.js';
import { lang, t } from '../../i18n/index.js';
import { render } from '../../shared/events.js';
import { gcalUrl, remOf } from '../../services/calendar.js';
import { closeSheet, openSheet, refreshSheet } from '../../shared/sheet.js';
import { IDB } from '../../data/audio.js';

function toggleTask(x){ patch(x.id,{done:!x.done,doneAt:!x.done?Date.now():null, top: x.done ? x.top : false}); }
function taskRow(x){
  const items = x.items||[]; const dn = items.filter(i=>i.done).length;
  return h("div",{class:"task"+(x.done?" done":""),style:`--qc:${qColor(x.q)}`},
    checkBtn(x.done,()=>toggleTask(x)),
    h("div",{class:"body",onclick:()=>openTask(x.id)},
      h("div",{class:"title",dir:"auto"},x.title),
      x.details?h("div",{class:"detail-line",dir:"auto"},x.details.split("\n")[0]):null,
      h("div",{class:"meta"},
        x.top && !x.done ? h("span",{class:"chip star"},"★ Top 3") : null,
        h("span",{class:"chip"},t("q"+(x.q||2))),
        dueChip(!x.done && x.due, x.time),
        items.length ? h("span",{class:"chip"},`☑ ${dn}/${items.length}`) : null,
        x.delegate ? h("span",{class:"chip",dir:"auto"},"→ "+x.delegate) : null,
        x.example ? h("span",{class:"chip"},t("example")) : null)));
}
function sortTasks(a,b){ return (a.done-b.done) || ((b.top?1:0)-(a.top?1:0)) || ((a.q||2)-(b.q||2)) || String(a.due||"9999").localeCompare(String(b.due||"9999")) || (a.created||0)-(b.created||0); }

/* Non-React task screen; the JSDOM regression tests drive the JS feature modules through it. */
function viewTasks(){
  const ar=lang==="ar", today=TODAY();
  const shown=all("task").filter(x=>UI.showDone||!x.done), open=all("task").filter(x=>!x.done), day=UI.taskDay||"all";
  const list=shown.filter(x=>day==="all"?true:day==="late"?x.due&&x.due<today&&!x.done:day==="nodate"?!x.due:x.due===day)
    .sort((a,b)=>(day!=="all"&&day!=="nodate"&&(a.time||"99").localeCompare(b.time||"99"))||sortTasks(a,b));
  const out=[];
  out.push(h("div",{class:"section-head"},h("h1",null,t("tasks")),h("button",{type:"button",class:"btn ghost",style:"height:34px;font-size:13px",onclick:()=>{UI.showDone=!UI.showDone;render();}},UI.showDone?t("hideDone"):t("showDone"))));
  const input=h("input",{class:"field grow",id:"newTask",dir:"auto",placeholder:t("addTask"),autocomplete:"off"});
  out.push(h("form",{class:"row",style:"flex-wrap:nowrap",onsubmit:e=>{ e.preventDefault(); const v=input.value.trim(); if(!v) return; input.value="";
    put(uid("task"),{kind:"task",title:v,q:2,due:/^\d{4}-/.test(day)?day:null,done:false,items:[],created:Date.now()}); toast(t("added")); }},input,h("button",{class:"btn primary",type:"submit"},t("add"))));
  const late=open.filter(x=>x.due&&x.due<today).length, undated=open.filter(x=>!x.due).length;
  const chip=k=>h("button",{type:"button",class:"dchip wide","aria-pressed":day===k?"true":"false",onclick:()=>{UI.taskDay=k;render();}});
  const strip=h("div",{class:"daystrip",role:"group","aria-label":t("calendar")});
  const allChip=chip("all"); allChip.append(h("b",null,String(open.length)),t("allTasks")); strip.append(allChip);
  if (late){ const c=chip("late"); c.classList.add("late"); c.append(h("b",null,String(late)),t("overdue")); strip.append(c); }
  for (let i=0;i<14;i++){
    const k=addDays(today,i), due=open.filter(x=>x.due===k).sort((a,b)=>(a.q||2)-(b.q||2));
    strip.append(h("button",{type:"button",class:"dchip"+(i===0?" today":""),"aria-pressed":day===k?"true":"false","aria-label":fmtDate(k,{weekday:"long",day:"numeric",month:"long"}),onclick:()=>{UI.taskDay=k;render();}},
      h("span",null,i===0?t("dueToday"):fmtDate(k,{weekday:"short"})),
      h("b",null,new Date(...k.split("-").map((v,j)=>j===1?v-1:+v)).toLocaleDateString(ar?"ar-EG":"en-GB",{day:"numeric"})),
      h("span",{class:"dots"},due.slice(0,4).map(x=>h("i",{style:`--qc:${qColor(x.q)}`})))));
  }
  if (undated){ const c=chip("nodate"); c.append(h("b",null,String(undated)),t("noDate")); strip.append(c); }
  out.push(strip);
  if (day!=="all") out.push(h("div",{class:"row",style:"justify-content:space-between"},
    h("h2",null,day==="late"?t("overdue"):day==="nodate"?t("noDate"):fmtDate(day,{weekday:"long",day:"numeric",month:"long"})),
    h("button",{type:"button",class:"btn ghost",style:"height:32px;font-size:13px",onclick:()=>{UI.taskDay="all";render();}},t("allTasks"))));
  out.push(h("div",{class:"seg",role:"group"},["matrix","list"].map(m=>h("button",{type:"button","aria-pressed":UI.taskMode===m?"true":"false",onclick:()=>{UI.taskMode=m;rememberUI();render();}},t(m)))));
  if (UI.taskMode==="matrix"){
    UI.qOpen=UI.qOpen||{}; const dated=/^\d{4}-/.test(day);
    out.push(h("div",{class:"matrix"},Q.map(q=>{
      const inQ=list.filter(x=>(x.q||2)===q), visible=UI.qOpen[q]?inQ:inQ.slice(0,6);
      return h("div",{class:"quad",style:`--qc:${qColor(q)}`},
        h("h3",null,h("span",null,t("q"+q)),h("span",{class:"chip"},String(inQ.filter(x=>!x.done).length))),
        h("div",{class:"hint"},t("q"+q+"h")),
        visible.length?visible.map(x=>{ const sub=dated?(x.time?fmtTime(x.time):""):(x.due?whenLabel(x):"");
          return h("div",{class:"mini"+(x.done?" done":""),onclick:()=>openTask(x.id)},checkBtn(x.done,()=>toggleTask(x)),
            h("span",{dir:"auto"},(x.top&&!x.done?"★ ":"")+x.title,sub?h("span",{class:"sub"+(x.due&&x.due<today&&!x.done?" late":"")},sub):null)); }):h("div",{class:"hint"},"—"),
        inQ.length>6?h("button",{type:"button",class:"qmore",onclick:()=>{UI.qOpen[q]=!UI.qOpen[q];render();}},UI.qOpen[q]?(ar?"عرض أقل":"Show less"):`+${inQ.length-6} ${t("more")}`):null);
    })));
  } else out.push(h("div",{class:"stack",style:"gap:8px"},list.length?list.map(taskRow):h("p",{class:"muted"},"—")));
  return out;
}

function whenLabel(x){
  if (!x.due) return t("noDate");
  const td=TODAY(); const d = x.due===td?t("dueToday"):x.due===addDays(td,1)?t("tomorrow"):fmtDate(x.due,{weekday:"short",day:"numeric",month:"short"});
  return d+(x.time?" · "+fmtTime(x.time):"");
}
function remLabel(x){ const r=remOf(x); if(r===-1||!x.due) return null; const ar=lang==="ar";
  if (r===0) return x.time?(ar?"في الموعد":"at the time"):(ar?"صباح اليوم":"morning of"); if (r===1440) return ar?"قبل يوم":"1 day before";
  return r>=60?(ar?`قبل ${r/60} س`:`${r/60}h before`):(ar?`قبل ${r} د`:`${r} min before`); }
function openTask(id){
  let armed = false;
  openSheet(() => {
    const x = S.items.get(id); if (!x){ setTimeout(closeSheet); return []; }
    const ar = lang==="ar";
    const items = x.items||[]; const dn = items.filter(i=>i.done).length;
    const title = h("textarea",{class:"ts-title",id:"tTitle",dir:"auto",rows:"1","aria-label":t("title"),onchange:e=>patch(id,{title:e.target.value.trim()||x.title})});
    title.value = x.title;
    const details = h("textarea",{class:"field",id:"tDetails",dir:"auto",rows:"3",style:"min-height:84px",placeholder:t("detailsPh"),onchange:e=>patch(id,{details:e.target.value.trim()||null})});
    details.value = x.details||"";
    const stepIn = h("input",{class:"field grow",id:"tStep",dir:"auto",placeholder:t("addStep")});
    const addStep = e => { e.preventDefault(); const v=stepIn.value.trim(); if(!v) return; patch(id,{items:[...items,{t:v,done:false}]}).then(()=>{refreshSheet(); setTimeout(()=>$("#tStep")?.focus(),30);}); };
    const delBtn = h("button",{type:"button",class:"btn danger ghost",onclick:()=>{ if(!armed){armed=true;delBtn.textContent=t("confirmDel");return;} remove(id); closeSheet(); }},t("del"));
    const said = x.said || (x.source && x.source.length<=220 ? x.source : null);
    const voice = x.voiceId ? S.items.get(x.voiceId) : null;
    const audioBox = h("div");
    const rem = remLabel(x);
    return [
      h("div",{class:"ts-head"},
        h("span",{class:"qdot",style:`--qc:${qColor(x.q)}`},t("q"+(x.q||2))),
        x.top&&!x.done?h("span",{class:"chip star"},"★ Top 3"):null,
        h("span",{class:"grow"}),
        h("button",{type:"button",class:"btn",style:"height:36px",onclick:closeSheet},t("close"))),
      title,
      h("div",{class:"ts-meta"},
        h("span",{class:"chip"+(x.due&&x.due<TODAY()&&!x.done?" late":x.due===TODAY()?" today":"")},"📅 "+whenLabel(x)),
        rem?h("span",{class:"chip"},"⏰ "+rem):null,
        x.delegate?h("span",{class:"chip",dir:"auto"},"→ "+x.delegate):null,
        items.length?h("span",{class:"chip"},`☑ ${dn}/${items.length}`):null),
      h("div",{class:"ts-actions"},
        h("button",{type:"button",class:"btn"+(x.done?"":" primary"),onclick:()=>{ toggleTask(x); if(!x.done){ toast("✓ "+x.title); closeSheet(); } else refreshSheet(); }},svg("check"),x.done?t("reopen"):t("markDone")),
        x.due ? h("a",{class:"btn",href:gcalUrl(x),target:"_blank",rel:"noopener",style:"text-decoration:none"},svg("cal"),t("addCal"))
              : h("button",{type:"button",class:"btn",onclick:()=>{ document.getElementById("tDue")?.showPicker?.(); document.getElementById("tDue")?.focus(); }},svg("cal"),t("due"))),
      h("div",{class:"ts-sec"},h("span",{class:"eyebrow"},t("details")),details),
      said ? h("div",{class:"ts-sec"},
        h("div",{class:"section-head"},h("span",{class:"eyebrow"},t("youSaid")),
          voice&&voice.audioId?h("button",{type:"button",class:"btn ghost",style:"height:30px;font-size:13px;padding-inline:8px",onclick:async e=>{ e.currentTarget.remove(); try{ const b=await IDB.get(voice.audioId); if(b) audioBox.replaceChildren(h("audio",{controls:true,autoplay:true,src:URL.createObjectURL(b)})); }catch(err){} }},svg("play"),t("playVoice")):null),
        h("div",{class:"quote",dir:"auto"},said), audioBox) : null,
      h("div",{class:"ts-sec"},
        h("div",{class:"section-head"},h("span",{class:"eyebrow"},t("checklist")),items.length?h("span",{class:"small muted",style:"font-variant-numeric:tabular-nums"},`${dn} ${t("of")} ${items.length}`):null),
        items.length?h("div",{class:"progress"},h("i",{style:`width:${Math.round(dn/items.length*100)}%`})):null,
        items.length?h("div",null,items.map((it,i)=>h("div",{class:"cl-item"+(it.done?" done":"")},
          checkBtn(it.done,()=>{ const n=items.map((v,j)=>j===i?{...v,done:!v.done}:v); patch(id,{items:n}).then(refreshSheet); }),
          h("span",{dir:"auto"},it.t),
          h("button",{type:"button",class:"x","aria-label":t("del"),onclick:()=>patch(id,{items:items.filter((_,j)=>j!==i)}).then(refreshSheet)},svg("x"))))):null,
        h("form",{class:"row",style:"flex-wrap:nowrap",onsubmit:addStep},stepIn,h("button",{type:"submit",class:"btn"},t("add")))),
      h("div",{class:"ts-sec"},h("span",{class:"eyebrow"},t("when")),
        h("div",{class:"row",style:"flex-wrap:nowrap"},
          h("label",{class:"fieldlbl grow"},h("span",{class:"small muted"},t("due")),
            h("input",{type:"date",class:"field",id:"tDue",value:x.due||"",onchange:e=>patch(id,{due:e.target.value||null}).then(refreshSheet)})),
          h("label",{class:"fieldlbl grow"},h("span",{class:"small muted"},t("time")),
            h("input",{type:"time",class:"field",id:"tTime",value:x.time||"",onchange:e=>patch(id,{time:normTime(e.target.value)}).then(refreshSheet)}))),
        h("div",{class:"row",style:"flex-wrap:nowrap"},
          h("label",{class:"fieldlbl grow"},h("span",{class:"small muted"},t("reminder")),
            h("select",{class:"field",id:"tRem",disabled:!x.due,onchange:e=>patch(id,{remind:+e.target.value}).then(refreshSheet)},
              [[-1,"remNone"],[0,"remAt"],[10,"rem10"],[30,"rem30"],[60,"rem60"],[1440,"rem1d"]].filter(([v])=>x.time||[-1,0,1440].includes(v)).map(([v,k])=>h("option",{value:String(v),selected:remOf(x)===v},t(k==="remAt"&&!x.time?"remMorning":k))))),
          h("label",{class:"fieldlbl grow"},h("span",{class:"small muted"},t("delegateTo")),
            h("input",{class:"field",id:"tDel",dir:"auto",value:x.delegate||"",onchange:e=>patch(id,{delegate:e.target.value.trim()||null}).then(refreshSheet)})))),
      h("div",{class:"ts-sec"},h("span",{class:"eyebrow"},t("priority")),
        h("div",{class:"qmini"},Q.map(q=>h("button",{type:"button",style:`--qc:${qColor(q)}`,"aria-pressed":(x.q||2)===q?"true":"false",title:t("q"+q+"h"),onclick:()=>patch(id,{q}).then(refreshSheet)},t("q"+q))))),
      h("div",{class:"row",style:"justify-content:space-between;padding-top:4px"},
        h("button",{type:"button",class:"btn",onclick:()=>{ const tops=all("task").filter(y=>y.top&&!y.done&&y.id!==id); if(!x.top && tops.length>=3){ patch(tops[tops.length-1].id,{top:false}); } patch(id,{top:!x.top}).then(refreshSheet); }},svg("star"),x.top?t("unstar"):t("starTop")),
        delBtn)
    ];
  });
}

export { toggleTask, taskRow, sortTasks, viewTasks, whenLabel, remLabel, openTask };
