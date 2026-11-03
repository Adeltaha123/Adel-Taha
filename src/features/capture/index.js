import { $, TODAY, h, svg, toast, uid } from '../../shared/helpers.js';
import { lang, t } from '../../i18n/index.js';
import { openVoice } from '../voice/index.js';
import { UI, qColor, rememberUI } from '../../app/state.js';
import { AI, AIX, LANG_RULE, OAIX, aiErrMsg, ctxLine, isBilling } from '../../services/ai.js';
import { S, all, patch, put, remove } from '../../data/store.js';
import { go, render } from '../../shared/events.js';
import { openSettings } from '../settings/index.js';
import { checkBtn, dueChip, normTime } from '../../shared/task-ui.js';
import { CFG } from '../../data/config.js';
import { refreshSheet } from '../../shared/sheet.js';

/* capture */
function viewCapture(){
  const out = [];
  out.push(h("div",{class:"section"},h("h1",null,t("capTitle")),h("p",{class:"muted",style:"margin:0"},t("capSub"))));
  out.push(h("button",{type:"button",class:"mic-hero",onclick:()=>openVoice()},h("span",{class:"disc"},svg("mic")),h("span",null,h("b",null,t("tapRec")),h("span",null,t("tapRecSub")))));
  out.push(importCard());
  const ta = h("textarea",{class:"field",id:"capText",dir:"auto",rows:"6",placeholder:t("capPh"),oninput:e=>{UI.capText=e.target.value;rememberUI();}});
  ta.value = UI.capText;
  out.push(ta);
  out.push(h("div",{class:"row"},
    h("button",{type:"button",class:"btn primary grow",disabled:UI.capBusy||!AI,onclick:()=>analyze()},UI.capBusy?h("span",{class:"spinner"}):svg("spark"),UI.capBusy?t("analyzing"):t("analyze")),
    h("button",{type:"button",class:"btn",onclick:()=>{ const v=UI.capText.trim(); if(!v) return; put(uid("note"),{kind:"note",type:"note",text:v,created:Date.now()}); UI.capText=""; rememberUI(); render(); toast(t("saved")); }},t("saveNote"))));
  if (!AI && S.ready) out.push(h("div",{class:"banner row",style:"justify-content:space-between"},h("span",{class:"grow"},t("aiOff")),h("button",{type:"button",class:"btn",style:"height:34px;font-size:13px",onclick:openSettings},t("openSettings"))));
  const r = UI.capResult;
  if (r){
    out.push(h("div",{class:"section"},
      h("div",{class:"section-head"},h("h2",null,t("found")+" "+(r.tasks.length+r.notes.length+(r.journal?1:0))),r.language?h("span",{class:"lang-tag"},t("detected")+": "+r.language):null),
      r.summary?h("p",{class:"muted",style:"margin:0",dir:"auto"},r.summary):null,
      r.tasks.map((x,i)=>h("div",{class:"result",style:`--qc:${qColor(x.quadrant)}`},
        checkBtn(x.sel,()=>{x.sel=!x.sel;render();}),
        h("div",{class:"grow"},h("div",{style:"font-weight:500",dir:"auto"},x.title),
          h("div",{class:"meta"},h("span",{class:"chip"},t("q"+x.quadrant)),dueChip(x.due,x.time),x.checklist.length?h("span",{class:"chip"},"☑ "+x.checklist.length):null,x.delegateTo?h("span",{class:"chip",dir:"auto"},"→ "+x.delegateTo):null),
          x.details?h("div",{class:"why",dir:"auto"},x.details):x.reason?h("div",{class:"why",dir:"auto"},x.reason):null))),
      r.notes.map(n=>h("div",{class:"result"},checkBtn(n.sel,()=>{n.sel=!n.sel;render();}),h("div",{class:"grow"},h("span",{class:"chip"},t("noteKind")),h("div",{dir:"auto",style:"margin-top:4px"},n.text)))),
      r.journal?h("div",{class:"result"},checkBtn(r.journal.sel,()=>{r.journal.sel=!r.journal.sel;render();}),h("div",{class:"grow"},h("span",{class:"chip"},t("journalKind")),h("div",{dir:"auto",style:"margin-top:4px"},r.journal.text))):null,
      h("button",{type:"button",class:"btn primary",onclick:addCaptured},t("addSel"))));
  }
  return out;
}
function taskLangRule(){
  const keep = 'Keep people, company, product and technical words the CEO said in English in English letters inside the Arabic text (e.g. "Application", "Foodics", "CRM"), and write common words in Arabic (e.g. "Meeting" → "اجتماع", "follow up" → "متابعة").';
  const tl = CFG.taskLang || "auto";
  if (tl==="ar") return 'Write every task title, checklist step, note and summary in Arabic script, even if the CEO spoke English or Franco. Convert Franco into proper Arabic. '+keep;
  if (tl==="en") return 'Write every task title, checklist step, note and summary in clear English, even if the CEO spoke Arabic or Franco.';
  return 'Write each task title, checklist step and note in the language the CEO used for that item: if they spoke Arabic, even mixed with some English words, write it in Arabic script; if they spoke English, write English; write Franco as proper Arabic script. '+keep+' Write the summary in the main language of the message. Examples: "Meeting مع محمد حسن الساعة ١٢" → title "اجتماع مع محمد حسن", time "12:00"; "عايز اتابع مع خلود الحاجات المفتوحة الخاصة بالـ Application" → title "متابعة مع خلود في النقاط المفتوحة الخاصة بالـ Application"; "call Rafik at National Bank at 9" → title "Call Rafik at National Bank", time "09:00".';
}
/* Rewrites open tasks into one language and moves any clock time out of the title. */
async function rewriteTasks(target, btn){
  if (!AI) return toast(t("aiOff"));
  const list = all("task").filter(x=>!x.done); if (!list.length) return;
  const ar = lang==="ar"; let done=0;
  if (btn){ btn.disabled=true; }
  try{
    for (let i=0;i<list.length;i+=25){
      const chunk = list.slice(i,i+25).map(x=>({id:x.id,title:x.title,time:x.time||null,details:x.details||null,checklist:(x.items||[]).map(it=>it.t)}));
      if (btn) btn.textContent = (ar?"جاري التحويل… ":"Rewriting… ")+done+"/"+list.length;
      const res = await AI.json(`Rewrite these to-do items for a CEO in ${target==="ar"?"Arabic script. Keep people, company, product and technical names in English letters where they were English (e.g. \"Foodics\", \"Application\"); write common words in Arabic (\"Follow up with\" → \"متابعة مع\", \"Meeting with\" → \"اجتماع مع\", \"Call\" → \"اتصال بـ\", \"Review\" → \"مراجعة\").":"clear, short English."}
If a title contains a clock time (e.g. "at 09:00", "الساعة ١٠"), remove it from the title and return it as "time" in 24-hour HH:MM; otherwise return the existing time.
Keep the meaning exactly; do not add or drop items.
Items: ${JSON.stringify(chunk)}
Reply with only JSON: {"items":[{"id":"same id","title":"...","time":"HH:MM or null","details":"rewritten details or null","checklist":["same number of steps, rewritten"]}]}`);
      for (const it of (res.items||[])){
        const x=S.items.get(it.id); if(!x||!it.title) continue;
        const steps=Array.isArray(it.checklist)?it.checklist:[];
        await patch(x.id,{title:String(it.title).trim(), time:normTime(it.time)||x.time||null, details:it.details&&it.details!=="null"?String(it.details):(x.details||null), items:(x.items||[]).map((st,k)=>({...st,t:steps[k]?String(steps[k]):st.t}))});
        done++;
      }
    }
    toast((ar?"تم تحويل ":"Rewrote ")+done+(ar?" مهمة":" tasks"));
  }catch(e){ toast(aiErrMsg(e)); }
  if (btn){ btn.disabled=false; refreshSheet(); }
}
async function organize(text, opt={}){
  const ask = p => AI.json(p).catch(e=>{ const other = AI===OAIX ? (CFG.claudeKey?AIX:null) : (CFG.openaiKey?OAIX:null); if (isBilling(e) && other) return other.json(p); throw e; });
  const res = await ask(`You are the executive assistant of a CEO in Egypt. ${ctxLine()}
${LANG_RULE}
${opt.import?`The text below is copied from another assistant or chat (for example a Meta AI conversation on WhatsApp, possibly a WhatsApp chat export with dates and sender names), or a list the CEO kept. Extract every meeting, appointment, schedule, task and reminder that is still upcoming or open. Skip anything clearly in the past (before ${TODAY()}) or marked done, skip the assistant's own small talk, and merge duplicates that appear more than once. For a meeting or reminder, put its clock time in "time" (e.g. title "Meeting with Mohamed Ragab", time "10:00"). For a recurring item (e.g. every Sunday), title it with the repetition and set the due date to the next occurrence. Keep useful background facts as notes.
`:""}Organize the message below. Be brief: short task titles, no filler. ${taskLangRule()}
Prioritize each task with the Eisenhower matrix: 1 = urgent and important (deadlines today or tomorrow, money, legal, clients, people crises), 2 = important not urgent (strategy, hiring, planning, health, relationships), 3 = urgent not important (routine requests someone else can handle; name a delegate if the message mentions one), 4 = neither.
Resolve relative dates to YYYY-MM-DD. Split a task with several steps into a checklist.
Keep every useful detail: put what is needed to act but is not in the title into "details" (1-3 short lines, same language as the title): the purpose, options mentioned (e.g. candidate days or times, resolved to real dates like "الثلاثاء ٢٧ أكتوبر أو الأربعاء ٢٨ أكتوبر"), people, amounts, places. Use null if there is nothing more. Copy the CEO's own words for each task from the message into "said".
When the task is to arrange something on candidate days (e.g. "عايزين نكلم رفيق المفروض نحدد اجتماع تلات أو أربع"), make one task to do the arranging (e.g. title "اتصال برفيق لتحديد اجتماع"), due today unless the CEO says otherwise, with the candidate days in details. Merge repeated mentions of the same thing into one task. Ignore greetings, filler words and false starts.
Message:
"""${text}"""
Reply with only JSON:
{"language":"english|arabic|franco|mixed","summary":"one short sentence","tasks":[{"title":"short imperative","quadrant":1,"due":"YYYY-MM-DD or null","time":"HH:MM 24-hour or null","details":"text or null","said":"the CEO's words for this task","checklist":["step"],"delegateTo":"name or null","reason":"why this quadrant, under 12 words"}],"notes":["information worth keeping that is not a task"],"journal":"personal reflection or feelings in the message, or null"}`);
  return {
    language:String(res.language||""), summary:String(res.summary||""),
    tasks:(Array.isArray(res.tasks)?res.tasks:[]).map(x=>({title:String(x.title||"").trim(),quadrant:[1,2,3,4].includes(+x.quadrant)?+x.quadrant:2,due:/^\d{4}-\d{2}-\d{2}$/.test(x.due||"")?x.due:null,time:normTime(x.time),details:x.details&&x.details!=="null"?String(x.details).trim():null,said:x.said?String(x.said).trim():null,checklist:(Array.isArray(x.checklist)?x.checklist:[]).map(String).filter(Boolean),delegateTo:x.delegateTo&&x.delegateTo!=="null"?String(x.delegateTo):null,reason:String(x.reason||""),sel:true})).filter(x=>x.title),
    notes:(Array.isArray(res.notes)?res.notes:[]).map(s=>({text:String(s),sel:true})).filter(n=>n.text.trim()),
    journal:res.journal && res.journal!=="null" ? {text:String(res.journal),sel:true} : null };
}
/* Saves the selected parts of an organized result. Returns an undo function. */
async function addOrganized(r, source, voiceId){
  const made=[]; let journalUndo=null; let n=0; const now=Date.now();
  for (const x of r.tasks.filter(x=>x.sel)){ const id=uid("task"); made.push(id); await put(id,{kind:"task",title:x.title,q:x.quadrant,due:x.due,time:x.due?x.time:null,details:x.details||null,said:x.said||null,voiceId:voiceId||null,done:false,delegate:x.delegateTo,items:x.checklist.map(s=>({t:s,done:false})),source:String(source||"").slice(0,500),created:now+n++}); }
  for (const x of r.notes.filter(x=>x.sel)){ const id=uid("note"); made.push(id); await put(id,{kind:"note",type:"note",text:x.text,created:now+n++}); }
  if (r.journal && r.journal.sel){
    const td=TODAY(); const ex=all("note").find(j=>j.type==="journal"&&j.day===td);
    if (ex){ const before=ex.text; journalUndo=()=>patch(ex.id,{text:before}); await patch(ex.id,{text:ex.text+"\n\n"+r.journal.text}); }
    else { const id=uid("note"); made.push(id); await put(id,{kind:"note",type:"journal",day:td,text:r.journal.text,created:now}); }
    n++;
  }
  return { count:n, undo: async()=>{ for(const id of made) await remove(id); if(journalUndo) await journalUndo(); } };
}
async function analyze(opt){
  const text = UI.capText.trim(); if (!text) { $("#capText")?.focus(); return; }
  if (!AI) return toast(t("aiOff"));
  opt = opt || {import: text.length > 600 || /\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/.test(text) || /meta ai/i.test(text)};
  UI.capBusy = true; render();
  try{ UI.capResult = await organize(text, opt); }catch(e){ toast(aiErrMsg(e)); }
  UI.capBusy = false; render();
}
async function addCaptured(){
  const r = UI.capResult; if (!r) return;
  const res = await addOrganized(r, UI.capText);
  UI.capResult=null; UI.capText=""; rememberUI(); toast(`${t("added")}: ${res.count}`); go("tasks");
}

/* import from Meta AI / WhatsApp / any text */
function importCard(){
  const ar = lang==="ar";
  const file = h("input",{type:"file",accept:".txt,text/plain",hidden:true,onchange:async e=>{
    const f=e.target.files[0]; if(!f) return;
    const txt=(await f.text()).slice(0,60000);
    UI.capText=txt; rememberUI(); render(); analyze({import:true});
  }});
  return h("details",{class:"card"},
    h("summary",{style:"cursor:pointer;font-weight:600"},ar?"استيراد من Meta AI أو واتساب":"Import from Meta AI or WhatsApp"),
    h("div",{class:"stack",style:"gap:10px;margin-top:10px"},
      h("ol",{class:"small muted",style:"margin:0;padding-inline-start:18px",dir:"auto"},
        h("li",null,ar?"في واتساب افتح محادثة Meta AI، ثم ⋮ ← المزيد ← تصدير الدردشة ← بدون وسائط، واختر My PA.":"In WhatsApp, open the Meta AI chat, tap ⋮ → More → Export chat → Without media, and pick My PA."),
        h("li",null,ar?"أو انسخ الرسائل والصقها في المربع بالأسفل، ثم اضغط حلّل ونظّم.":"Or copy the messages, paste them in the box below, and tap Analyze & organize."),
        h("li",null,ar?"راجع ما وجدته واضغط أضف المحدد.":"Review what I found, then tap Add selected.")),
      h("button",{type:"button",class:"btn",onclick:()=>file.click()},ar?"اختر ملف .txt":"Choose a .txt file"),file));
}

export { viewCapture, taskLangRule, rewriteTasks, organize, addOrganized, analyze, addCaptured, importCard };
