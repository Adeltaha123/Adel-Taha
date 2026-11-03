import { lang, t } from '../../i18n/index.js';
import { $, TODAY, addDays, fmtDate, h, svg, toast } from '../../shared/helpers.js';
import { S, all, patch } from '../../data/store.js';
import { openTask, sortTasks, taskRow, toggleTask } from '../tasks/index.js';
import { AI, aiErrMsg, ctxLine, taskBrief } from '../../services/ai.js';
import { openSettings } from '../settings/index.js';
import { checkBtn, fmtTime } from '../../shared/task-ui.js';
import { UI } from '../../app/state.js';
import { go, render } from '../../shared/events.js';
import { byWhen } from '../calendar/index.js';
import { toggleHabit } from '../habits/index.js';

function greet(){ const hr=new Date().getHours(); return hr<12?t("goodMorning"):hr<17?t("goodAfternoon"):t("goodEvening"); }

function viewToday(){
  const td = TODAY();
  const open = all("task").filter(x=>!x.done);
  const top = open.filter(x=>x.top).sort(sortTasks).slice(0,3);
  const due = open.filter(x=>x.due && x.due<=td && !x.top).sort(sortTasks);
  const habits = all("habit");
  const out = [];
  out.push(h("div",{class:"section"},
    h("div",{class:"eyebrow"},fmtDate(td,{weekday:"long",day:"numeric",month:"long"})),
    h("h1",null,greet())));
  if (!AI) out.push(h("div",{class:"banner row",style:"justify-content:space-between"},h("span",{class:"grow"},t("aiOff")),h("button",{type:"button",class:"btn",style:"height:34px;font-size:13px",onclick:openSettings},t("openSettings"))));
  const slots = [0,1,2].map(i=>{ const x=top[i];
    return x ? h("div",{class:"slot"},h("span",{class:"num"},String(i+1).padStart(2,"0")),h("span",{class:"t",dir:"auto",style:"cursor:pointer",onclick:()=>openTask(x.id)},x.title),checkBtn(false,()=>toggleTask(x)))
             : null; }).filter(Boolean);
  out.push(h("div",{class:"top3"},
    h("div",{class:"row",style:"justify-content:space-between"},h("span",{class:"eyebrow"},t("top3")),
      h("button",{type:"button",class:"btn",style:"height:34px;font-size:13px;background:var(--gold);border-color:var(--gold);color:var(--ink)",disabled:UI.planBusy||!AI||!open.length,onclick:planDay},UI.planBusy?h("span",{class:"spinner"}):svg("spark"),UI.planBusy?t("planning"):t("planDay"))),
    slots.length ? slots : h("div",{class:"empty"},t("top3Empty"))));
  if (UI.plan){
    const p = UI.plan;
    out.push(h("div",{class:"card stack",style:"gap:10px"},
      h("div",{class:"row",style:"justify-content:space-between"},h("span",{class:"eyebrow"},t("planDay")),h("button",{type:"button",class:"x","aria-label":"Dismiss",onclick:()=>{UI.plan=null;render();}},svg("x"))),
      h("div",{dir:"auto",style:"white-space:pre-wrap"},p.brief||""),
      (p.top3||[]).length ? h("ol",{style:"margin:0;padding-inline-start:20px",dir:"auto"},(p.top3||[]).map(id=>S.items.get(id)).filter(Boolean).map(x=>h("li",null,x.title))) : null,
      (p.tips||[]).length ? h("ul",{class:"small muted",style:"margin:0;padding-inline-start:18px",dir:"auto"},p.tips.map(s=>h("li",null,s))) : null,
      (p.top3||[]).length ? h("button",{type:"button",class:"btn primary",onclick:applyPlan},t("setTop3")) : null));
  }
  const nowKey=TODAY()+"T"+new Date().toTimeString().slice(0,5);
  const nxt=all("task").filter(x=>!x.done&&x.due&&x.time&&(x.due+"T"+x.time)>=nowKey&&x.due<=addDays(td,1)).sort(byWhen)[0];
  if (nxt) out.push(h("div",{class:"next-up",onclick:()=>openTask(nxt.id)},h("span",{class:"tm"},fmtTime(nxt.time)),h("div",{class:"grow"},h("div",{class:"eyebrow"},t("nextUp")+(nxt.due!==td?" · "+t("tomorrow"):"")),h("div",{style:"font-weight:600",dir:"auto"},nxt.title))));
  out.push(h("div",{class:"section"},h("div",{class:"section-head"},h("h2",null,t("dueSoon")),h("span",{class:"small muted"},String(due.length))),
    due.length ? due.map(taskRow) : h("p",{class:"muted small",style:"margin:0"},t("nothingDue"))));
  out.push(h("div",{class:"section"},h("div",{class:"section-head"},h("h2",null,t("habitsToday")),h("button",{type:"button",class:"btn ghost",style:"height:32px;font-size:13px",onclick:()=>go("habits")},habits.length?t("manage"):t("addHabitBtn")))));
  if (habits.length){
    out.push(h("div",{class:"section"},
      h("div",{class:"row"},habits.map(x=>{ const on=!!(x.log||{})[td];
        return h("button",{type:"button",class:"btn"+(on?" primary":""),style:"height:38px;font-size:13px",onclick:()=>toggleHabit(x,td)},on?svg("check"):null,h("span",{dir:"auto"},x.name)); }))));
  }
  const jToday = all("note").find(n=>n.type==="journal" && n.day===td);
  out.push(h("div",{class:"card row",style:"justify-content:space-between"},
    h("div",{class:"grow"},h("div",{style:"font-weight:600"},t("journalPrompt")),jToday?h("div",{class:"small muted",dir:"auto",style:"overflow:hidden;text-overflow:ellipsis;white-space:nowrap"},jToday.text):null),
    h("button",{type:"button",class:"btn",onclick:()=>{UI.notesTab="journal";go("notes");setTimeout(()=>$("#jText")?.focus(),50);}},t("writeJournal"))));
  return out;
}

async function planDay(){
  if (!AI) return toast(t("aiOff"));
  UI.planBusy = true; render();
  try{
    const res = await AI.json(`You are the chief of staff to a CEO. ${ctxLine()}
Here are the CEO's open tasks as JSON (quadrant: 1 do now = urgent+important, 2 schedule = important not urgent, 3 delegate = urgent not important, 4 drop):
${JSON.stringify(taskBrief())}
Pick the three tasks that most deserve the CEO's personal attention today. Favor overdue and due-today quadrant 1 items, then high-leverage quadrant 2 work. Never pick quadrant 4. Suggest delegation for quadrant 3.
Write in ${lang==="ar"?"Egyptian-friendly Modern Standard Arabic":"English"}, direct and brief, as a trusted chief of staff would.
Reply with only JSON: {"top3":["task id", ...up to 3 ids from the list],"brief":"3 short sentences: what to focus on and why","tips":["up to 3 one-line tips, e.g. what to delegate or drop"]}`);
    UI.plan = {top3:(res.top3||[]).filter(id=>S.items.has(id)).slice(0,3),brief:String(res.brief||""),tips:(res.tips||[]).map(String).slice(0,3)};
  }catch(e){ toast(aiErrMsg(e)); }
  UI.planBusy = false; render();
}
async function applyPlan(){
  const ids = new Set(UI.plan.top3);
  for (const x of all("task")) { const want = ids.has(x.id); if (!!x.top !== want) await patch(x.id,{top:want}); }
  UI.plan = null; render(); toast(t("saved"));
}

export { greet, viewToday, planDay, applyPlan };
