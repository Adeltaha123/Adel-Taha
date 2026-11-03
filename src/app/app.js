import { navigation, rememberUI } from './state.js';
import { go, render } from '../shared/events.js';
import { S, loadLocal, settings } from '../data/store.js';
import { viewCalendar } from '../features/calendar/index.js';
import { viewToday } from '../features/today/index.js';
import { viewTasks } from '../features/tasks/index.js';
import { viewCapture } from '../features/capture/index.js';
import { viewNotes } from '../features/notes/index.js';
import { viewHabits } from '../features/habits/index.js';
import { viewAsk } from '../features/assistant/index.js';
import { $ } from '../shared/helpers.js';
import { scheduleReminders } from '../services/reminders.js';
import { refreshSheet, sheetEl } from '../shared/sheet.js';
import { openSettings } from '../features/settings/index.js';
import { openVoice } from '../features/voice/index.js';
import { applyLang } from '../i18n/index.js';
import { readShare, showLock, unlock } from '../features/security/index.js';

/* ---------- render ----------
   The app runs in React mode (src/main.ts). The plain-DOM path below is what the JSDOM regression tests boot. */
let reactMode = false;
function navigate(tab){ navigation.tab=tab; if(tab!=="ask") rememberUI(); window.scrollTo({top:0}); render(); }
function renderApp(){
  if (!S.ready) return;
  if (reactMode) { scheduleReminders(); if (sheetEl && !document.activeElement.closest?.('.sheet')) refreshSheet(); return; }
  const views={calendar:viewCalendar,today:viewToday,tasks:viewTasks,capture:viewCapture,notes:viewNotes,habits:viewHabits,ask:viewAsk};
  const active=document.activeElement; const aid=active&&active.id; const sel=aid&&("selectionStart" in active)?[active.selectionStart,active.selectionEnd]:null;
  const keep = aid ? active.value : null;
  $("#view").replaceChildren(...(views[navigation.tab]||viewToday)().flat());
  if (aid){ const n=document.getElementById(aid); if(n && !n.closest(".sheet")){ if(keep!=null && n.value!==keep && aid!=="capText") n.value=keep; n.focus({preventScroll:true}); if(sel) try{n.setSelectionRange(sel[0],sel[1]);}catch(e){} } }
  document.querySelectorAll("nav.tabs [data-tab]").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===navigation.tab?"page":"false"));
  scheduleReminders();
  if (sheetEl && !document.activeElement.closest?.(".sheet")) refreshSheet();
}

function startApp(options = {}){
  reactMode = !!options.reactMode;
  document.addEventListener("mypa:render", renderApp);
  document.addEventListener("mypa:navigate", event => navigate(event.detail));
  document.querySelectorAll("nav.tabs [data-tab]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.tab)));
  $("#askBtn").addEventListener("click",()=>go("ask"));
  $("#menuBtn").addEventListener("click",openSettings);
  $("#fabMic").addEventListener("click",()=>openVoice());

  /* ---------- boot ---------- */
  applyLang();
  loadLocal();
  S.ready=true; render();
  const st=settings();
  let fresh=false; try{ const u=+sessionStorage.getItem("mk_unlock"); fresh = u && Date.now()-u < 10*60*1000; }catch(e){}
  if (!st.pinHash) showLock("setup");
  else if (fresh) unlock();
  else showLock("unlock");
  readShare();
}

export { navigate, renderApp, startApp };
