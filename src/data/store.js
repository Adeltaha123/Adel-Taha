import { toast, uid } from '../shared/helpers.js';
import { render } from '../shared/events.js';
import { IDB } from './audio.js';

/* ---------- store (this device) ---------- */
const S = { uid:"local", items:new Map(), ready:false };
try { let salt=localStorage.getItem("mk_salt"); if(!salt){ salt=uid("dev"); localStorage.setItem("mk_salt",salt); } S.uid=salt; } catch(e){}
function all(kind){ return [...S.items.values()].filter(x=>x.kind===kind); }
function settings(){ return S.items.get("settings") || {kind:"settings"}; }
function persist(){ try{ localStorage.setItem("mk_items", JSON.stringify([...S.items.entries()])); }catch(e){ toast("Storage is full. Export a backup and delete old voice notes."); } }
async function put(id, data){ data = {...data, id}; S.items.set(id, data); persist(); render(); }
async function patch(id, fields){ const cur=S.items.get(id); if(!cur) return; return put(id,{...cur,...fields,updated:Date.now()}); }
async function remove(id){ const x=S.items.get(id); S.items.delete(id); persist(); render(); if(x && x.audioId) IDB.del(x.audioId).catch(()=>{}); }
function loadLocal(){ try{ const raw=localStorage.getItem("mk_items"); if(raw) S.items=new Map(JSON.parse(raw)); }catch(e){} fixTitleTimes(); }
const toLatin = v => String(v).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
function fixTitleTimes(){
  let changed=false;
  for (const x of S.items.values()){
    if (x.kind!=="task" || x.time || !x.title) continue;
    let m = x.title.match(/^(.*\S)\s+(?:at|@)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*$/i);
    let title, hh, mm;
    if (m){ title=m[1]; hh=+m[2]; mm=m[3]||"00"; if(m[4]){ const pm=/pm/i.test(m[4]); if(pm&&hh<12) hh+=12; if(!pm&&hh===12) hh=0; } }
    else { m = x.title.match(/^(.*\S)\s+(?:الساعة|الساعه)\s*([0-9٠-٩]{1,2})(?:[:.]([0-9٠-٩]{2}))?\s*$/); if(m){ title=m[1]; hh=+toLatin(m[2]); mm=m[3]?toLatin(m[3]):"00"; } }
    if (!m || hh>23) continue;
    x.title=title; x.time=String(hh).padStart(2,"0")+":"+mm; changed=true;
  }
  if (changed) persist();
}

export { S, all, settings, persist, put, patch, remove, loadLocal, toLatin, fixTitleTimes };
