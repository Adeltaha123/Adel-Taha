import { CFG } from '../data/config.js';
import { lang, t } from '../i18n/index.js';
import { TODAY } from '../shared/helpers.js';
import { all } from '../data/store.js';

/* ---------- AI (Claude API, called directly from this device) ---------- */
async function claudeCall(body){
  const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":CFG.claudeKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:CFG.model||"claude-sonnet-5-5",max_tokens:8000,...body})});
  let j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok) throw {code:r.status===401?"bad_key":"api",message:(j&&j.error&&j.error.message)||("HTTP "+r.status)};
  return j;
}
const textOf = j => (j.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("");
const AIX = {
  async json(prompt){
    const txt = textOf(await claudeCall({messages:[{role:"user",content:prompt}]}));
    const m = txt.match(/[\[{][\s\S]*[\]}]/);
    try { return JSON.parse(m?m[0]:txt); } catch(e){ throw {code:"invalid_json",message:"Unreadable answer"}; }
  },
  async chat(system, messages, tools){
    const defs = tools.map(x=>({name:x.name,description:x.description,input_schema:x.inputSchema}));
    const msgs = messages.slice();
    for (let round=0; round<6; round++){
      const j = await claudeCall({system,messages:msgs,tools:defs});
      if (j.stop_reason !== "tool_use") return textOf(j);
      msgs.push({role:"assistant",content:j.content});
      const results=[];
      for (const c of j.content.filter(c=>c.type==="tool_use")){
        const tool=tools.find(x=>x.name===c.name);
        try { results.push({type:"tool_result",tool_use_id:c.id,content:JSON.stringify(await tool.execute(c.input||{}))}); }
        catch(e){ results.push({type:"tool_result",tool_use_id:c.id,content:String(e.message||e),is_error:true}); }
      }
      msgs.push({role:"user",content:results});
    }
    return "";
  }
};
/* ---------- AI (OpenAI Responses API) ---------- */
async function oaiCall(body){
  const r = await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","Authorization":"Bearer "+CFG.openaiKey},body:JSON.stringify({model:CFG.openaiModel||"gpt-6.1-sol",reasoning:{effort:"low"},...body})});
  let j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok) throw {code:r.status===401?"bad_key":"api",message:(j&&j.error&&j.error.message)||("HTTP "+r.status)};
  return j;
}
const oaiText = j => (j.output||[]).filter(o=>o.type==="message").flatMap(o=>o.content||[]).filter(c=>c.type==="output_text").map(c=>c.text).join("");
const OAIX = {
  async json(prompt){
    const txt = oaiText(await oaiCall({input:prompt}));
    const m = txt.match(/[\[{][\s\S]*[\]}]/);
    try { return JSON.parse(m?m[0]:txt); } catch(e){ throw {code:"invalid_json",message:"Unreadable answer"}; }
  },
  async chat(system, messages, tools){
    const defs = tools.map(x=>({type:"function",name:x.name,description:x.description,parameters:x.inputSchema}));
    let j = await oaiCall({instructions:system,input:messages.map(m=>({role:m.role,content:m.content})),tools:defs});
    for (let round=0; round<6; round++){
      const calls=(j.output||[]).filter(o=>o.type==="function_call");
      if (!calls.length) return oaiText(j);
      const outs=[];
      for (const c of calls){
        const tool=tools.find(x=>x.name===c.name); let args={}; try{ args=JSON.parse(c.arguments||"{}"); }catch(e){}
        let out; try{ out=JSON.stringify(await tool.execute(args)); }catch(e){ out=JSON.stringify({error:String(e.message||e)}); }
        outs.push({type:"function_call_output",call_id:c.call_id,output:out});
      }
      j = await oaiCall({instructions:system,previous_response_id:j.id,input:outs,tools:defs});
    }
    return oaiText(j);
  }
};
function pickAI(){
  if (CFG.provider==="openai" && CFG.openaiKey) return OAIX;
  if (CFG.provider!=="openai" && CFG.claudeKey) return AIX;
  return CFG.claudeKey ? AIX : CFG.openaiKey ? OAIX : null;
}
let AI = pickAI();
const providerName = () => AI===OAIX ? "OpenAI" : "Claude";
const isBilling = e => !!(e && /credit|quota|billing|insufficient|balance/i.test(e.message||""));
const aiErrMsg = e => isBilling(e) ? (lang==="ar"?`حساب ${providerName()} ليس به رصيد. أضف رصيداً من صفحة الفوترة${providerName()==="OpenAI"?" (platform.openai.com/settings/organization/billing)":" في platform.claude.com"}، أو بدّل المحلل إلى ${providerName()==="OpenAI"?"Claude":"ChatGPT"} من الإعدادات.`:`Your ${providerName()} account has no credit left. Add credit on its billing page${providerName()==="OpenAI"?" (platform.openai.com/settings/organization/billing)":" in platform.claude.com"}, or switch "Who analyzes your notes" to ${providerName()==="OpenAI"?"Claude":"ChatGPT"} in Settings.`) : e && /workspace/i.test(e.message||"") ? (lang==="ar"?"هذا المفتاح غير مرتبط بمساحة عمل. أنشئ مفتاحاً جديداً واختر Default Workspace عند إنشائه.":"This key isn't linked to a workspace. Create a new key and choose the Default Workspace when you create it.") : e && e.code==="bad_key" ? (lang==="ar"?`مفتاح ${providerName()} غير صحيح. راجعه في الإعدادات.`:`Your ${providerName()} API key was rejected. Check it in Settings.`) : (e && e.message ? t("aiErr")+" ("+e.message+")" : t("aiErr"));
function ctxLine(){ const d=new Date(); return `Today is ${TODAY()} (${d.toLocaleDateString("en-GB",{weekday:"long"})}), Cairo time ${d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}. The work week in Egypt is Sunday to Thursday.`; }
const LANG_RULE = `The CEO may write in English, Arabic (Egyptian dialect or MSA), Franco-Arabic (Arabic written in Latin letters with digits: 2=ء 3=ع 5=خ 7=ح 8=غ 9=ق, e.g. "bokra" tomorrow, "ba3d bokra" day after tomorrow, "el esbo3 el gay" next week, "lazem" must), or a mix of all three. Text may be a dictated voice note with no punctuation and transcription mistakes; infer the intended meaning. Egyptian weekday names, including spoken or mis-transcribed forms: الحد/الأحد = Sunday, الاتنين/الإثنين = Monday, التلات/الثلاث/ثلاث/ثلالث/الثلاثاء = Tuesday, الأربع/أربع/الأربعاء = Wednesday, الخميس = Thursday, الجمعة = Friday, السبت = Saturday; a bare weekday means its next occurrence. Speech recognition may repeat words or partial phrases (e.g. "عندنا عندنا بكره عندنا بكره ميتنج"); treat repeats as one mention. English business words are often written phonetically in Arabic script: ميتنج/ميتينج/ميتك = meeting, كول = call, ديدلاين = deadline, بريزنتيشن = presentation, إيميل = email, بروبوزال = proposal. A meeting with a time becomes one task titled like "Meeting with <name>" with that due date and the clock time in the "time" field (24-hour, e.g. "10:00"; "الساعة ٣ العصر" = "15:00"). If a time is given without a day, assume today if it is still ahead, otherwise tomorrow.`;
function taskBrief(){ return all("task").filter(x=>!x.done).map(x=>({id:x.id,title:x.title,quadrant:x.q,due:x.due||null,time:x.time||undefined,details:x.details||undefined,top3:!!x.top,checklist:(x.items||[]).length?`${(x.items||[]).filter(i=>i.done).length}/${x.items.length}`:undefined,delegate:x.delegate||undefined})); }

document.addEventListener("mypa:config", () => { AI = pickAI(); });

export { claudeCall, textOf, AIX, oaiCall, oaiText, OAIX, pickAI, AI, providerName, isBilling, aiErrMsg, ctxLine, LANG_RULE, taskBrief };
