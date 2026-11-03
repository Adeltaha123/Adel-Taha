import { closeSheet, openSheet, refreshSheet } from '../../shared/sheet.js';
import { S, persist, put, remove, settings } from '../../data/store.js';
import { TODAY, h, svg, toast } from '../../shared/helpers.js';
import { LOCK, bioCreate, bioSupported, lockNow, showLock } from '../security/index.js';
import { lang, setLanguage, t } from '../../i18n/index.js';
import { CFG, saveCfg } from '../../data/config.js';
import { render } from '../../shared/events.js';
import { AI } from '../../services/ai.js';
import { rewriteTasks } from '../capture/index.js';
import { loadSample } from '../../data/sample.js';

/* settings */
function openSettings(){
  openSheet(()=>{
    const st=settings();
    const bioBtn=h("button",{type:"button",class:"btn",disabled:!!st.bioId||!bioSupported(),onclick:async()=>{
      try{ const id=await bioCreate(); await put("settings",{...settings(),bioId:id}); toast(t("bioOn")); refreshSheet(); }
      catch(e){ toast(t("bioNA")); }
    }},svg("finger"),st.bioId?t("bioOn"):t("bioOff"));
    const ck=h("input",{class:"field",id:"cfgClaude",type:"password",autocomplete:"off",placeholder:"sk-ant-…",value:CFG.claudeKey||""});
    const ok=h("input",{class:"field",id:"cfgOpenai",type:"password",autocomplete:"off",placeholder:"sk-…",value:CFG.openaiKey||""});
    const pv=h("select",{class:"field",id:"cfgProvider"},[["claude","Claude (Anthropic)"],["openai","ChatGPT (OpenAI)"]].map(([v,l])=>h("option",{value:v,selected:CFG.provider===v},l)));
    const om=h("select",{class:"field",id:"cfgOModel"},[["gpt-6.1-sol","GPT-6.1 Sol (balanced)"],["gpt-6-astra","GPT-6 Astra (smartest)"],["gpt-6-luna","GPT-6 Luna (fastest, cheapest)"]].map(([v,l])=>h("option",{value:v,selected:CFG.openaiModel===v},l)));
    const md=h("select",{class:"field",id:"cfgModel"},[["claude-sonnet-5-5","Claude Sonnet 5.5"],["claude-opus-5-5","Claude Opus 5.5"],["claude-haiku-5-5","Claude Haiku 5.5 (fastest)"]].map(([v,l])=>h("option",{value:v,selected:CFG.model===v},l)));
    const eng=h("select",{class:"field",id:"cfgEngine"},[["phone",t("engPhone")],["whisper",t("engWhisper")],["server",t("engServer")]].map(([v,l])=>h("option",{value:v,selected:CFG.engine===v},l)));
    const sl=h("select",{class:"field",id:"cfgLang"},[["ar-EG",t("arabic")],["en-US",t("english")]].map(([v,l])=>h("option",{value:v,selected:CFG.speechLang===v},l)));
    const imp=h("input",{type:"file",accept:"application/json,.json",hidden:true,onchange:async e=>{
      const f=e.target.files[0]; if(!f) return;
      try{ const data=JSON.parse(await f.text()); if(!Array.isArray(data.items)) throw 0; S.items=new Map(data.items.map(x=>[x.id,x])); persist(); render(); toast(t("imported")); closeSheet(); }
      catch(err){ toast(lang==="ar"?"الملف ليس نسخة احتياطية من My PA.":"That file isn't a My PA backup."); }
    }});
    return [
      h("div",{class:"row",style:"justify-content:space-between"},h("h2",null,t("settings")),h("button",{type:"button",class:"btn",style:"height:36px",onclick:closeSheet},t("close"))),
      h("div",{class:"section"},h("span",{class:"eyebrow"},t("language")),
        h("span",{class:"small"},lang==="ar"?"لغة التطبيق":"App language"),
        h("div",{class:"seg"},[["en","English"],["ar","العربية"]].map(([k,l])=>h("button",{type:"button","aria-pressed":lang===k?"true":"false",onclick:()=>{setLanguage(k); render(); refreshSheet();}},l))),
        h("span",{class:"small"},lang==="ar"?"لغة كتابة المهام":"Write my tasks in"),
        h("div",{class:"seg"},[["auto",lang==="ar"?"نفس لغة كلامي":"Same as I speak"],["ar","العربية"],["en","English"]].map(([k,l])=>h("button",{type:"button","aria-pressed":(CFG.taskLang||"auto")===k?"true":"false",onclick:()=>{CFG.taskLang=k;saveCfg();refreshSheet();toast(t("saved"));}},l))),
        h("div",{class:"row"},
          h("button",{type:"button",class:"btn grow",disabled:!AI,onclick:e=>rewriteTasks("ar",e.currentTarget)},lang==="ar"?"حوّل مهامي الحالية للعربية":"Rewrite my tasks in Arabic"),
          h("button",{type:"button",class:"btn grow",disabled:!AI,onclick:e=>rewriteTasks("en",e.currentTarget)},lang==="ar"?"حوّلها للإنجليزية":"Rewrite in English"))),
      h("div",{class:"section"},h("span",{class:"eyebrow"},"AI"),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},lang==="ar"?"من يحلل ملاحظاتك":"Who analyzes your notes"),pv),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},t("claudeKey")),ck,h("span",{class:"small muted"},t("claudeKeyHint"))),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},"Claude "+t("model")),md),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},t("openaiKey")),ok,h("span",{class:"small muted"},lang==="ar"?"من platform.openai.com/api-keys. يُحفظ على هذا الهاتف فقط.":"From platform.openai.com/api-keys. Stored only on this phone.")),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},"OpenAI "+t("model")),om),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},t("engine")),eng),
        h("label",{class:"section",style:"gap:4px"},h("span",{class:"small"},t("speechLang")),sl),
        h("button",{type:"button",class:"btn primary",onclick:()=>{ const hadO=!!CFG.openaiKey; CFG.provider=pv.value; CFG.claudeKey=ck.value.trim(); CFG.openaiKey=ok.value.trim(); CFG.model=md.value; CFG.openaiModel=om.value; CFG.engine=(!hadO && CFG.openaiKey && eng.value==="phone") ? "whisper" : eng.value; CFG.engineV=2; CFG.speechLang=sl.value; saveCfg(); render(); toast(t("keysSaved")); }},t("save"))),
      h("div",{class:"section"},h("span",{class:"eyebrow"},t("security")),
        h("div",{class:"card row",style:"justify-content:space-between"},h("span",null,t("bio")),bioBtn),
        !bioSupported()?h("p",{class:"small muted",style:"margin:0"},t("bioNA")):null,
        h("div",{class:"row"},h("button",{type:"button",class:"btn grow",onclick:lockNow},t("lockNow")),h("button",{type:"button",class:"btn grow",onclick:()=>{closeSheet();LOCK.unlocked=false;showLock("setup");}},t("changePin"))),
        h("p",{class:"small muted",style:"margin:0"},t("privacy"))),
      h("div",{class:"section"},h("span",{class:"eyebrow"},t("backup")),
        h("div",{class:"row"},
          h("button",{type:"button",class:"btn grow",onclick:()=>{ const blob=new Blob([JSON.stringify({app:"my-pa",exported:new Date().toISOString(),items:[...S.items.values()]},null,1)],{type:"application/json"}); const a=h("a",{href:URL.createObjectURL(blob),download:"my-pa-backup-"+TODAY()+".json"}); document.body.append(a); a.click(); a.remove(); }},t("exportB")),
          h("button",{type:"button",class:"btn grow",onclick:()=>imp.click()},t("importB")),imp),
        h("p",{class:"small muted",style:"margin:0"},lang==="ar"?"النسخة الاحتياطية تشمل المهام والملاحظات ونصوص الصوتيات، بدون التسجيلات الصوتية والمفاتيح.":"Backups include tasks, notes and voice transcripts, but not audio recordings or API keys.")),
      h("div",{class:"section"},h("span",{class:"eyebrow"},t("sample")),
        h("div",{class:"row"},h("button",{type:"button",class:"btn grow",onclick:()=>{loadSample();closeSheet();}},t("loadSample")),h("button",{type:"button",class:"btn grow",onclick:async()=>{for(const x of [...S.items.values()].filter(x=>x.example)) await remove(x.id); toast(t("saved"));}},t("clearSample"))))
    ];
  });
}

export { openSettings };
