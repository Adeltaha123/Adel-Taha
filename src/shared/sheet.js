import { h } from './helpers.js';

let sheetEl = null;
function closeSheet(){ if (sheetEl){ const f=sheetEl._onclose; sheetEl.remove(); sheetEl=null; if(f) try{f();}catch(e){} } }
function openSheet(build){
  closeSheet();
  const sheet = h("div",{class:"sheet",role:"dialog","aria-modal":"true"});
  sheetEl = h("div",{class:"scrim",onclick:e=>{ if(e.target===sheetEl) closeSheet(); }},sheet);
  sheetEl._build = () => { sheet.replaceChildren(h("div",{class:"grab"}),...build(sheet)); };
  sheetEl._build(); document.body.append(sheetEl);
}
function refreshSheet(){ if (sheetEl && sheetEl._build) sheetEl._build(); }

export { sheetEl, closeSheet, openSheet, refreshSheet };
