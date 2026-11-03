import { TODAY, addDays, fmtDate, h, svg } from './helpers.js';
import { lang, t } from '../i18n/index.js';

function checkBtn(on, onclick, label){ return h("button",{type:"button",class:"check"+(on?" on":""),"aria-pressed":on?"true":"false","aria-label":label||t("done"),onclick:e=>{e.stopPropagation();onclick();}},svg("check")); }
const normTime = v => { const m=String(v||"").trim().match(/^(\d{1,2})[:.](\d{2})/); if(!m) return null; const hh=+m[1], mm=+m[2]; return (hh>23||mm>59)?null:String(hh).padStart(2,"0")+":"+m[2]; };
function fmtTime(tm){ if(!tm) return ""; const [a,b]=tm.split(":").map(Number); return new Date(2000,0,1,a,b).toLocaleTimeString(lang==="ar"?"ar-EG":"en-GB",{hour:"numeric",minute:"2-digit"}); }
function dueChip(due, time){
  if (!due) return null; const td=TODAY(); const tm = time ? " · "+fmtTime(time) : "";
  if (due < td) return h("span",{class:"chip late"},t("late")+" · "+fmtDate(due)+tm);
  if (due === td) return h("span",{class:"chip today"},t("dueToday")+tm);
  if (due === addDays(td,1)) return h("span",{class:"chip"},t("tomorrow")+tm);
  return h("span",{class:"chip"},fmtDate(due)+tm);
}

export { checkBtn, normTime, fmtTime, dueChip };
