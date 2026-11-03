import { TODAY, fmtDate, h, svg, toast, uid } from '../../shared/helpers.js';
import { lang, t } from '../../i18n/index.js';
import { UI, rememberUI } from '../../app/state.js';
import { render } from '../../shared/events.js';
import { all, patch, put, remove } from '../../data/store.js';
import { openVoice, voiceCard } from '../voice/index.js';

/* notes */
function viewNotes(){
  const out=[]; const td=TODAY();
  out.push(h("h1",null,t("notesT")));
  out.push(h("div",{class:"seg",role:"group"},["notes","voice","journal"].map(m=>h("button",{type:"button","aria-pressed":UI.notesTab===m?"true":"false",onclick:()=>{UI.notesTab=m;rememberUI();render();}},t(m==="notes"?"notesT":m)))));
  if (UI.notesTab==="voice"){
    const vs=all("voice").sort((a,b)=>(b.created||0)-(a.created||0));
    out.push(h("button",{type:"button",class:"mic-hero",onclick:()=>openVoice()},h("span",{class:"disc"},svg("mic")),h("span",null,h("b",null,t("tapRec")),h("span",null,t("tapRecSub")))));
    out.push(vs.length?vs.map(voiceCard):h("p",{class:"muted"},t("noVoice")));
    return out;
  }
  if (UI.notesTab==="notes"){
    const ta=h("textarea",{class:"field",id:"nText",dir:"auto",rows:"3",style:"min-height:84px",placeholder:t("newNote")});
    out.push(h("div",{class:"stack",style:"gap:8px"},ta,h("div",{class:"row",style:"justify-content:flex-end"},h("button",{type:"button",class:"btn primary",onclick:()=>{const v=ta.value.trim(); if(!v) return; put(uid("note"),{kind:"note",type:"note",text:v,created:Date.now()}); toast(t("saved"));}},t("save")))));
    const notes=all("note").filter(n=>n.type!=="journal").sort((a,b)=>(b.created||0)-(a.created||0));
    out.push(notes.length?notes.map(noteCard):h("p",{class:"muted"},t("noNotes")));
  } else {
    const cur=all("note").find(n=>n.type==="journal"&&n.day===td);
    const ta=h("textarea",{class:"field",id:"jText",dir:"auto",rows:"5",placeholder:t("journalPrompt")}); ta.value=cur?cur.text:"";
    out.push(h("div",{class:"card stack",style:"gap:10px"},h("span",{class:"eyebrow"},t("entryFor")+" "+fmtDate(td,{weekday:"long",day:"numeric",month:"long"})),ta,
      h("div",{class:"row",style:"justify-content:flex-end"},h("button",{type:"button",class:"btn primary",onclick:()=>{const v=ta.value.trim(); if(!v) return; if(cur) patch(cur.id,{text:v}); else put(uid("note"),{kind:"note",type:"journal",day:td,text:v,created:Date.now()}); toast(t("saved"));}},t("save")))));
    const past=all("note").filter(n=>n.type==="journal"&&n.day!==td).sort((a,b)=>String(b.day).localeCompare(String(a.day)));
    out.push(past.length?past.map(noteCard):h("p",{class:"muted"},t("noJournal")));
  }
  return out;
}
function noteCard(n){
  let armed=false;
  const del=h("button",{type:"button",class:"x","aria-label":t("del"),onclick:()=>{ if(!armed){armed=true;del.style.color="var(--danger)";toast(t("confirmDel"));return;} remove(n.id);}},svg("x"));
  return h("div",{class:"card"},
    n.type==="journal"?h("div",{class:"eyebrow",style:"margin-bottom:6px"},fmtDate(n.day,{weekday:"short",day:"numeric",month:"short"})):null,
    h("div",{class:"note",dir:"auto"},n.text),
    h("div",{class:"note-meta"},h("span",null,n.created?new Date(n.created).toLocaleString(lang==="ar"?"ar-EG":"en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"" , n.example?" · "+t("example"):""),del));
}

export { viewNotes, noteCard };
