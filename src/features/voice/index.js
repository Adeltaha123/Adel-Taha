import { CFG, saveCfg } from '../../data/config.js';
import { lang, t } from '../../i18n/index.js';
import { closeSheet, openSheet, refreshSheet, sheetEl } from '../../shared/sheet.js';
import { $, h, svg, toast, uid } from '../../shared/helpers.js';
import { IDB } from '../../data/audio.js';
import { all, patch, put, remove } from '../../data/store.js';
import { AI, OAIX, aiErrMsg } from '../../services/ai.js';
import { api, cloud } from '../../cloud/client';
import { parseCommand } from '../commands/parser';
import { addOrganized, organize } from '../capture/index.js';
import { openSettings } from '../settings/index.js';
import { qColor } from '../../app/state.js';
import { dueChip } from '../../shared/task-ui.js';
import { go } from '../../shared/events.js';

/* ---------- voice ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
/* Removes stutter-like repeats from speech recognition, e.g. "a a b a b c" -> "a b c". */
function collapseRepeats(text){
  let w=String(text||"").split(/\s+/).filter(Boolean), changed=true;
  while(changed){ changed=false;
    for(let i=0;i<w.length && !changed;i++) for(let L=Math.min(12,Math.floor((w.length-i)/2));L>=1;L--){
      let same=true; for(let k=0;k<L;k++) if(w[i+k]!==w[i+L+k]){ same=false; break; }
      if(same){ w.splice(i,L); changed=true; break; }
    }
  }
  return w.join(" ");
}
function fmtDur(ms){ const s=Math.round(ms/1000); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); }
const MAX_REC_MS=60000, MAX_UPLOAD=6*1024*1024;
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
/* Capacitor's Android/iOS web views have no SpeechRecognition, so a recorder engine is needed there:
   a personal OpenAI key ("whisper") or the signed-in My PA server ("server"). */
function voiceEngine(){
  if (CFG.engine==="whisper" && CFG.openaiKey && canRecord()) return "whisper";
  if (CFG.engine==="server" && cloud.session && canRecord()) return "server";
  if (SR) return "phone";
  if (CFG.openaiKey && canRecord()) return "whisper";
  if (cloud.session && canRecord()) return "server";
  return "none";
}
async function serverTranscribe(blob, language){
  if (blob.size > MAX_UPLOAD) throw new Error(language==="ar"?"التسجيل طويل جداً. اجعله أقل من دقيقة.":"The recording is too long. Keep it under a minute.");
  const audio = await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onerror=()=>reject(r.error); r.onload=()=>resolve(String(r.result).split(",")[1]||""); r.readAsDataURL(blob); });
  const format = (blob.type.includes("mp4")||blob.type.includes("m4a")) ? "m4a" : "webm";
  return String((await api("/assistant/transcribe",{audio,format,language},60000)).text||"").trim();
}
async function whisper(blob){
  const fd=new FormData(); const ext=(blob.type.includes("mp4")||blob.type.includes("m4a"))?"m4a":"webm";
  fd.append("file",blob,"voice."+ext); fd.append("model","gpt-transcribe");
  fd.append("prompt","Egyptian Arabic and English business voice note. ملاحظة صوتية بالعامية المصرية والإنجليزية عن العمل.");
  const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+CFG.openaiKey},body:fd});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error((j.error&&j.error.message)||("HTTP "+r.status));
  return String(j.text||"").trim();
}
function openVoice(options = {}){
  const V = { state:"idle", lang:CFG.speechLang||"ar-EG", final:"", interim:"", started:0, timer:null, rec:null, mr:null, stream:null, chunks:[], blob:null, err:"", stopAsked:false, result:null, undo:null, voiceId:null, showText:false };
  const engine = voiceEngine();
  const ar = lang==="ar";
  let tickEl=null;
  function stopTracks(){ if(V.stream){ V.stream.getTracks().forEach(tr=>tr.stop()); V.stream=null; } }
  function tick(){ const ms=Date.now()-V.started; if(tickEl) tickEl.textContent=fmtDur(ms); if(V.mr && ms>=MAX_REC_MS) stop(); }
  async function start(){
    V.err=""; V.final=""; V.interim=""; V.blob=null; V.chunks=[]; V.stopAsked=false; V.result=null; V.undo=null; V.voiceId=null; V.showText=false;
    try{
      if (engine==="whisper" || engine==="server"){
        V.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
        const type=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(x=>window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(x))||"";
        V.mr = new MediaRecorder(V.stream, type?{mimeType:type}:undefined);
        V.mr.ondataavailable = e => { if(e.data && e.data.size) V.chunks.push(e.data); };
        V.mr.onstop = async () => {
          stopTracks(); V.blob=new Blob(V.chunks,{type:V.mr.mimeType||type||"audio/webm"});
          V.state="hearing"; refreshSheet();
          try{ V.final = engine==="server" ? await serverTranscribe(V.blob, V.lang.startsWith("ar")?"ar":"en") : await whisper(V.blob); }catch(e){ V.err=(ar?"تعذّر التحويل لنص: ":"Couldn't transcribe: ")+e.message; }
          finish();
        };
        V.mr.start(1000);
      } else {
        const rec = new SR(); V.rec=rec;
        /* One phrase per session, restarted until the user taps stop. Android Chrome
           repeats growing copies of the phrase in continuous mode, so keep only the
           most complete copy of each phrase. */
        rec.lang=V.lang; rec.continuous=false; rec.interimResults=true; rec.maxAlternatives=1;
        V.segs=[]; V.cur="";
        rec.onresult = e => { let best=""; for(let i=0;i<e.results.length;i++){ const tx=(e.results[i][0].transcript||"").trim(); if(tx.length>=best.length) best=tx; } if(best) V.cur=best; V.final=[...V.segs,V.cur].join(" "); };
        /* Fatal errors must stop the restart loop in onend, otherwise it retries forever. */
        rec.onerror = e => {
          if(e.error==="not-allowed"||e.error==="service-not-allowed"){ V.err=t("micDenied"); V.stopAsked=true; }
          else if(e.error==="network"){ V.err=ar?"التعرّف على الكلام يحتاج اتصالاً بالإنترنت. تحقق من الاتصال وحاول مجدداً.":"Speech recognition needs an internet connection. Check your connection and try again."; V.stopAsked=true; }
          else if(e.error==="audio-capture"){ V.err=ar?"لم يتم العثور على ميكروفون يعمل.":"No working microphone was found."; V.stopAsked=true; }
          else if(e.error==="language-not-supported"){ V.err=ar?"هذا المتصفح لا يدعم هذه اللغة. جرّب اللغة الأخرى.":"This browser doesn't support that language. Try the other one."; V.stopAsked=true; }
          else if(e.error!=="no-speech" && e.error!=="aborted"){ V.err=e.error; }
        };
        rec.onend = () => {
          if (V.cur){ const last=V.segs[V.segs.length-1]||""; if (!last || !V.cur.startsWith(last)) V.segs.push(V.cur); else V.segs[V.segs.length-1]=V.cur; V.cur=""; }
          if (!V.stopAsked && V.state==="rec"){ try{ rec.start(); return; }catch(e){} }
          V.final=collapseRepeats(V.segs.join(" ")); clearInterval(V.timer); finish();
        };
        rec.start();
      }
      V.state="rec"; V.started=Date.now(); V.timer=setInterval(tick,500); refreshSheet();
    }catch(e){ stopTracks(); V.err = (e && (e.name==="NotAllowedError"||e.name==="SecurityError")) ? t("micDenied") : String(e.message||e); V.state="idle"; refreshSheet(); }
  }
  function stop(){
    V.stopAsked=true; clearInterval(V.timer); V.dur=Date.now()-V.started;
    if (V.mr && V.mr.state!=="inactive") V.mr.stop();
    if (V.rec) { try{ V.rec.stop(); }catch(e){} }
  }
  async function finish(){
    V.final=(V.final||"").trim();
    if (!V.final){ if(!V.err) V.err = ar?"لم أسمع شيئاً. تحدث قريباً من الميكروفون وحاول مرة أخرى.":"I didn't catch anything. Hold the phone a little closer and try again."; V.state="idle"; refreshSheet(); return; }
    if (!V.voiceId){
      V.voiceId=uid("voice"); let audioId=null;
      if (V.blob){ audioId="a_"+V.voiceId; try{ await IDB.put(audioId,V.blob); }catch(e){ audioId=null; } }
      await put(V.voiceId,{kind:"voice",text:V.final,lang:V.lang,dur:V.dur||0,audioId,created:Date.now()});
    }
    if (options.onTranscript) { options.onTranscript(V.final); closeSheet(); return; }
    if (!AI){ V.state="nokey"; refreshSheet(); return; }
    V.state="thinking"; V.err=""; refreshSheet();
    try{
      V.result = await organize(V.final);
      const res = await addOrganized(V.result, V.final, V.voiceId);
      V.undo = res.undo; V.count = res.count;
      patch(V.voiceId,{organized:true,summary:V.result.summary});
      V.state="done";
    }catch(e){ V.err=aiErrMsg(e); V.state="failed"; }
    refreshSheet();
  }
  setTimeout(()=>{ if(sheetEl) sheetEl._onclose=()=>{ if(V.state==="rec"){ V.err=""; V.stopAsked=true; V.final=""; clearInterval(V.timer); if(V.rec) try{V.rec.abort();}catch(e){} if(V.mr&&V.mr.state!=="inactive"){ V.mr.onstop=()=>stopTracks(); V.mr.stop(); } } }; });
  /* One object URL per recording; the sheet re-renders often and must not leak a URL each time. */
  const audioUrl = () => { if (V.blob && V.urlFor!==V.blob){ if (V.url) URL.revokeObjectURL(V.url); V.url=URL.createObjectURL(V.blob); V.urlFor=V.blob; } return V.url; };
  async function saveAs(kind){
    const text=(V.final||"").trim(); if(!text) return;
    if (kind==="note") await put(uid("note"),{kind:"note",type:"note",text,created:Date.now()});
    else { let cmd=null; try{ cmd=parseCommand("add "+text, all("task")); }catch(e){}
      const add=cmd&&cmd.kind==="add"?cmd:null;
      await put(uid("task"),{kind:"task",title:(add?add.title:text).slice(0,500),q:2,due:add?add.due:null,time:add?add.time:null,done:false,items:[],created:Date.now()}); }
    if (V.voiceId) patch(V.voiceId,{organized:true});
    toast(kind==="note"?(ar?"حُفظت الملاحظة":"Note saved"):(ar?"أُضيفت المهمة":"Task added")); closeSheet();
  }
  const said = () => h("div",{class:"section",style:"gap:6px"},
    h("button",{type:"button",class:"btn ghost",style:"height:34px;font-size:13px;align-self:flex-start",onclick:()=>{V.showText=!V.showText;refreshSheet();}},V.showText?(ar?"إخفاء ما قلته":"Hide what I said"):(ar?"عرض ما قلته":"Show what I said")),
    V.showText?h("div",{class:"card small",dir:"auto",style:"white-space:pre-wrap"},V.final):null,
    V.showText&&V.blob?h("audio",{controls:true,src:audioUrl()}):null);
  openSheet(()=>{
    const out=[
      h("div",{class:"row",style:"justify-content:space-between"},h("h2",null,t("voiceTitle")),h("button",{type:"button",class:"btn",style:"height:36px",onclick:closeSheet},t("close"))),
    ];
    if (engine==="none"){ out.push(h("div",{class:"banner"},t("noSR"))); return out; }
    if (!AI && !options.onTranscript && V.state==="idle") out.push(h("div",{class:"banner row",style:"justify-content:space-between"},h("span",{class:"grow"},ar?"بدون مفتاح ذكاء اصطناعي سأحفظ كلامك كمهمة أو ملاحظة. أضف مفتاح Claude أو OpenAI لتنظيمه تلقائياً.":"Without an AI key I'll save what you say as a task or note. Add a Claude or OpenAI key to have it organized automatically."),h("button",{type:"button",class:"btn",style:"height:34px;font-size:13px",onclick:openSettings},t("openSettings"))));

    if (V.state==="idle" || V.state==="rec"){
      if (engine==="phone") out.push(h("div",{class:"seg",role:"group"},[["ar-EG",t("arabic")],["en-US",t("english")]].map(([k,l])=>h("button",{type:"button","aria-pressed":V.lang===k?"true":"false",disabled:V.state==="rec",onclick:()=>{V.lang=k;CFG.speechLang=k;saveCfg();refreshSheet();}},l))));
      tickEl=h("div",{class:"timer"},V.state==="rec"?fmtDur(Date.now()-V.started):"0:00");
      out.push(h("div",{class:"rec-wrap"},
        h("button",{type:"button",class:"rec-btn"+(V.state==="rec"?" on":""),"aria-label":V.state==="rec"?"Stop":"Record",onclick:()=>V.state==="rec"?stop():start()},V.state==="rec"?h("span",{style:"width:34px;height:34px;border-radius:8px;background:currentColor"}):svg("mic")),
        tickEl,
        h("div",{class:"muted",style:"text-align:center"},V.state==="rec"?(ar?"أسمعك… اضغط عندما تنتهي":"Listening… tap when you're done")+(engine==="phone"?"":(ar?" (حتى دقيقة)":" (up to a minute)")):(ar?"اضغط وتحدث بشكل طبيعي. سأفهم وأنظم كل شيء.":"Tap and speak naturally. I'll understand and organize it."))));
    }
    if (V.state==="hearing" || V.state==="thinking"){
      out.push(h("div",{class:"rec-wrap",style:"padding-block:28px"},
        h("span",{class:"spinner",style:"width:44px;height:44px;border-width:4px;color:var(--accent)"}),
        h("div",{style:"font-weight:600;font-family:var(--f-display);font-size:17px"},V.state==="hearing"?(ar?"أحوّل كلامك إلى نص…":"Turning your voice into text…"):(ar?`${AI===OAIX?"ChatGPT":"Claude"} يحلل ملاحظتك…`:`${AI===OAIX?"ChatGPT":"Claude"} is analyzing your note…`)),
        h("div",{class:"muted small"},ar?"أستخرج المهام والأولويات والمواعيد":"Finding tasks, priorities and deadlines")));
    }
    if (V.state==="done"){
      const r=V.result;
      out.push(h("div",{class:"card stack",style:"gap:10px;border-color:var(--accent)"},
        h("div",{class:"row",style:"gap:10px"},h("span",{class:"check on",style:"width:28px;height:28px"},svg("check")),h("div",{style:"font-weight:600;font-family:var(--f-display);font-size:17px"},ar?`تم. أضفت ${V.count} عنصر`:`Done. I added ${V.count} item${V.count===1?"":"s"}`)),
        r.summary?h("div",{class:"muted",dir:"auto"},r.summary):null));
      if (r.tasks.length) out.push(h("div",{class:"stack",style:"gap:8px"},r.tasks.map(x=>h("div",{class:"result",style:`--qc:${qColor(x.quadrant)}`},
        h("div",{class:"grow"},h("div",{style:"font-weight:500",dir:"auto"},x.title),x.details?h("div",{class:"why",dir:"auto"},x.details):null,
          h("div",{class:"meta"},h("span",{class:"chip"},t("q"+x.quadrant)),dueChip(x.due,x.time),x.checklist.length?h("span",{class:"chip"},"☑ "+x.checklist.length):null,x.delegateTo?h("span",{class:"chip",dir:"auto"},"→ "+x.delegateTo):null))))));
      if (r.notes.length) out.push(h("div",{class:"small muted"},(ar?"ملاحظات محفوظة: ":"Notes saved: ")+r.notes.length));
      if (r.journal) out.push(h("div",{class:"small muted"},ar?"أضفت جزءاً إلى يومية اليوم.":"Added a line to today's journal."));
      out.push(h("div",{class:"small muted"},ar?"الملاحظة الصوتية كاملة محفوظة في ملاحظات ← صوتيات"+(V.blob?" مع التسجيل.":"."):"The full voice note is saved under Notes → Voice"+(V.blob?", with the recording.":".")));
      if (!r.tasks.length && !r.notes.length && !r.journal) out.push(h("p",{class:"muted",style:"margin:0"},ar?"لم أجد مهام في هذه الملاحظة. حفظتها في الصوتيات.":"I didn't find any tasks in this note. It's saved under Voice."));
      out.push(said());
      out.push(h("div",{class:"row"},
        h("button",{type:"button",class:"btn primary grow",onclick:()=>{V.state="idle";refreshSheet();start();}},svg("mic"),ar?"ملاحظة أخرى":"Record another"),
        h("button",{type:"button",class:"btn grow",onclick:()=>{closeSheet();go("tasks");}},ar?"عرض المهام":"View tasks")));
      out.push(h("button",{type:"button",class:"btn ghost",onclick:async()=>{ if(V.undo) await V.undo(); V.undo=null; toast(ar?"تم التراجع":"Undone"); closeSheet(); }},ar?"تراجع عن الإضافة":"Undo"));
    }
    if (V.state==="failed"){
      out.push(h("div",{class:"banner",role:"alert"},V.err));
      out.push(h("p",{class:"small muted",style:"margin:0"},ar?"ملاحظتك محفوظة في الصوتيات، فلن تضيع.":"Your voice note is saved under Voice, so nothing is lost."));
      out.push(h("button",{type:"button",class:"btn primary",onclick:()=>finish()},svg("spark"),ar?"حلل مرة أخرى":"Analyze again"));
      out.push(said());
    }
    if (V.state==="nokey"){
      /* No AI key: the transcript still becomes something useful instead of a dead end. */
      out.push(h("p",{class:"small muted",style:"margin:0"},ar?"هذا ما سمعته. عدّله إن لزم ثم احفظه:":"Here's what I heard. Edit it if needed, then save it:"));
      out.push(h("textarea",{class:"field",id:"voiceText",dir:"auto",rows:"3",style:"min-height:90px","aria-label":ar?"ما قلته":"What you said",oninput:e=>{V.final=e.target.value;}},V.final));
      out.push(h("div",{class:"row"},
        h("button",{type:"button",class:"btn primary grow",onclick:()=>saveAs("task")},svg("check"),ar?"احفظ كمهمة":"Save as task"),
        h("button",{type:"button",class:"btn grow",onclick:()=>saveAs("note")},ar?"احفظ كملاحظة":"Save as note")));
      out.push(h("button",{type:"button",class:"btn ghost",onclick:openSettings},ar?"أضف مفتاح AI للتنظيم التلقائي":"Add an AI key for automatic organizing"));
    }
    if (V.err && V.state==="idle") out.push(h("div",{class:"banner",role:"alert"},V.err));
    if (V.state==="idle") out.push(h("button",{type:"button",class:"btn ghost small",onclick:()=>{ closeSheet(); go("capture"); setTimeout(()=>$("#capText")?.focus(),50); }},t("typeInstead")));
    return out;
  });
}
function voiceCard(v){
  let armed=false; const audioBox=h("div");
  const del=h("button",{type:"button",class:"x","aria-label":t("del"),onclick:()=>{ if(!armed){armed=true;del.style.color="var(--danger)";toast(t("confirmDel"));return;} remove(v.id);}},svg("x"));
  return h("div",{class:"card stack",style:"gap:8px"},
    h("div",{class:"row",style:"justify-content:space-between"},
      h("span",{class:"eyebrow"},new Date(v.created).toLocaleString(lang==="ar"?"ar-EG":"en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+(v.dur?" · "+fmtDur(v.dur):"")),
      h("div",{class:"row",style:"gap:4px"},
        v.audioId?h("button",{type:"button",class:"btn",style:"height:32px;font-size:13px",onclick:async e=>{ e.currentTarget.remove(); try{ const b=await IDB.get(v.audioId); if(b) audioBox.replaceChildren(h("audio",{controls:true,autoplay:true,src:URL.createObjectURL(b)})); }catch(err){} }},"▶ "+t("play")):null,
        del)),
    audioBox,
    h("details",null,h("summary",{class:"small muted",style:"cursor:pointer"},lang==="ar"?"ما قلته":"What I said"),h("div",{class:"note small",dir:"auto",style:"margin-top:6px"},v.text||"—")),
    v.summary?h("div",{class:"small muted",dir:"auto"},"✓ "+v.summary):null,
    AI&&v.text&&!v.organized?h("button",{type:"button",class:"btn",style:"align-self:flex-start;height:36px;font-size:13px",onclick:async e=>{ const b=e.currentTarget; b.disabled=true; b.textContent=lang==="ar"?"جاري التحليل…":"Analyzing…"; try{ const r=await organize(v.text); const res=await addOrganized(r,v.text); await patch(v.id,{organized:true,summary:r.summary}); toast(`${t("added")}: ${res.count}`); }catch(err){ toast(aiErrMsg(err)); b.disabled=false; b.textContent=t("analyze"); } }},svg("spark"),t("analyze")):null);
}

export { SR, collapseRepeats, fmtDur, voiceEngine, whisper, openVoice, voiceCard };
