import { $, TODAY, h, svg, toast, uid } from '../../shared/helpers.js';
import { go, render } from '../../shared/events.js';
import { t } from '../../i18n/index.js';
import { AI, LANG_RULE, aiErrMsg, ctxLine, taskBrief } from '../../services/ai.js';
import { S, all, patch, put } from '../../data/store.js';
import { UI } from '../../app/state.js';
import { streakOf } from '../habits/index.js';
import { normTime } from '../../shared/task-ui.js';

/* assistant */
function viewAsk(){
  const out=[];
  out.push(h("div",{class:"row"},h("button",{type:"button",class:"iconbtn","aria-label":"Back",onclick:()=>go("today")},svg("back")),h("div",{class:"grow"},h("h1",null,t("askT")))));
  out.push(h("p",{class:"muted",style:"margin:0"},t("askSub")));
  if(!AI && S.ready) out.push(h("div",{class:"banner"},t("aiOff")));
  const chat=h("div",{class:"chat",id:"chat"},UI.chat.map(m=>h("div",{class:"msg "+m.role,dir:"auto"},m.text||(m.role==="ai"?"…":""))));
  out.push(chat);
  if(!UI.chat.length) out.push(h("div",{class:"suggest"},["s1","s2","s3"].map(k=>h("button",{type:"button",dir:"auto",onclick:()=>sendChat(t(k))},t(k)))));
  const ta=h("textarea",{class:"field grow",id:"chatIn",dir:"auto",rows:"1",placeholder:t("askPh"),onkeydown:e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat(ta.value);}}});
  out.push(h("div",{class:"composer"},ta,h("button",{type:"button",class:"btn primary","aria-label":t("send"),disabled:UI.chatBusy||!AI,style:"width:46px;padding:0;height:46px",onclick:()=>sendChat(ta.value)},UI.chatBusy?h("span",{class:"spinner"}):svg("send"))));
  return out;
}
async function sendChat(text){
  text=(text||"").trim(); if(!text||UI.chatBusy) return; if(!AI) return toast(t("aiOff")); const ci=$("#chatIn"); if(ci) ci.value="";
  UI.chat.push({role:"me",text}); const reply={role:"ai",text:""}; UI.chat.push(reply); UI.chatBusy=true; render();
  const sys=`You are "My PA", the personal assistant of a CEO in Egypt. ${ctxLine()}
${LANG_RULE}
Always reply in the same language and script the CEO used in their latest message: English → English, Arabic → Arabic, Franco → Franco. Be concise, warm and decisive, like a seasoned chief of staff. Use short paragraphs or brief lists; no markdown headings.
You can manage the CEO's task list with the tools. Use add_task when they ask you to add, remember or schedule something, and complete_task when they say something is done. Confirm briefly what you changed.
Use the time field for meetings and appointments. Current open tasks (quadrant 1 do now, 2 schedule, 3 delegate, 4 drop): ${JSON.stringify(taskBrief())}
Habits: ${JSON.stringify(all("habit").map(x=>({name:x.name,doneToday:!!(x.log||{})[TODAY()],streak:streakOf(x)})))}`;
  const history=UI.chat.slice(0,-1).filter(m=>m.role!=="tool").slice(-12).map(m=>({role:m.role==="me"?"user":"assistant",content:m.text||"…"})).filter(m=>m.content);
  while(history.length && history[0].role!=="user") history.shift();
  const tools=[
    {name:"add_task",description:"Add a task to the CEO's list.",inputSchema:{type:"object",properties:{title:{type:"string"},quadrant:{type:"integer",enum:[1,2,3,4]},due:{type:"string",description:"YYYY-MM-DD or empty"},time:{type:"string",description:"HH:MM 24-hour or empty"},details:{type:"string",description:"context, options, people; empty if none"},checklist:{type:"array",items:{type:"string"}},delegateTo:{type:"string"}},required:["title","quadrant"]},
      execute:async i=>{ const id=uid("task"); await put(id,{kind:"task",title:String(i.title),q:[1,2,3,4].includes(+i.quadrant)?+i.quadrant:2,due:/^\d{4}-\d{2}-\d{2}$/.test(i.due||"")?i.due:null,time:normTime(i.time),details:i.details||null,delegate:i.delegateTo||null,items:(i.checklist||[]).map(s=>({t:String(s),done:false})),done:false,created:Date.now()}); UI.chat.splice(UI.chat.length-1,0,{role:"tool",text:"＋ "+i.title}); render(); return {ok:true,id}; }},
    {name:"complete_task",description:"Mark one of the CEO's open tasks as done, by id.",inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"]},
      execute:async i=>{ const x=S.items.get(i.id); if(!x||x.kind!=="task") throw new Error("No task with that id"); await patch(x.id,{done:true,doneAt:Date.now(),top:false}); UI.chat.splice(UI.chat.length-1,0,{role:"tool",text:"✓ "+x.title}); render(); return {ok:true}; }}
  ];
  try{
    reply.text = await AI.chat(sys, history, tools);
  }catch(e){ reply.text = aiErrMsg(e); }
  UI.chatBusy=false; render(); setTimeout(()=>$("#chatIn")?.focus(),30); window.scrollTo({top:document.body.scrollHeight});
}

export { viewAsk, sendChat };
