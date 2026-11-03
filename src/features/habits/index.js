import { TODAY, addDays, fmtDate, h, svg, toast, uid } from '../../shared/helpers.js';
import { all, patch, put, remove } from '../../data/store.js';
import { go } from '../../shared/events.js';
import { t } from '../../i18n/index.js';

/* habits */
function streakOf(x){ const log=x.log||{}; let k=TODAY(); if(!log[k]) k=addDays(k,-1); let s=0; while(log[k]){s++;k=addDays(k,-1);} return s; }
function toggleHabit(x,day){ const log={...(x.log||{})}; if(log[day]) delete log[day]; else log[day]=true; patch(x.id,{log}); }
function viewHabits(){
  const out=[]; const td=TODAY(); const days=[...Array(7)].map((_,i)=>addDays(td,i-6));
  out.push(h("div",{class:"row"},h("button",{type:"button",class:"iconbtn","aria-label":"Back",onclick:()=>go("today")},svg("back")),h("h1",{class:"grow"},t("habitsT"))));
  const hs=all("habit").sort((a,b)=>(a.created||0)-(b.created||0));
  if(!hs.length) out.push(h("p",{class:"muted"},t("noHabits")));
  for (const x of hs){
    let armed=false;
    const del=h("button",{type:"button",class:"x","aria-label":t("del"),onclick:()=>{ if(!armed){armed=true;del.style.color="var(--danger)";toast(t("confirmDel"));return;} remove(x.id);}},svg("x"));
    const s=streakOf(x);
    out.push(h("div",{class:"card habit"},
      h("div",{class:"hrow"},h("div",{class:"grow"},h("div",{style:"font-weight:600",dir:"auto"},x.name),h("div",{class:"streak"},`${s} ${t("streak")}`)),del),
      h("div",{class:"days"},days.map(d=>{const on=!!(x.log||{})[d];
        return h("button",{type:"button",class:"day","aria-pressed":on?"true":"false","aria-label":fmtDate(d),onclick:()=>toggleHabit(x,d)},
          h("span",{class:"dot"+(on?" on":"")+(d===td?" today":"")},on?svg("check"):null),
          h("span",null,fmtDate(d,{weekday:"narrow"})));}))));
  }
  const inp=h("input",{class:"field grow",id:"hName",dir:"auto",placeholder:t("addHabit")});
  out.push(h("form",{class:"row",style:"flex-wrap:nowrap",onsubmit:e=>{e.preventDefault();const v=inp.value.trim();if(!v)return;inp.value="";put(uid("habit"),{kind:"habit",name:v,log:{},created:Date.now()});}},inp,h("button",{type:"submit",class:"btn primary"},t("add"))));
  return out;
}

export { streakOf, toggleHabit, viewHabits };
