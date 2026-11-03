import { lang } from '../i18n/index.js';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids){
  const n = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const ICON = {
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v5M9.5 15.5h5"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/></svg>',
  finger:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 11v3a7 7 0 01-1.5 4.3"/><path d="M8.5 7.5A5 5 0 0117 11v1.5a12 12 0 01-.8 4.3"/><path d="M5.6 9.6A7 7 0 0119 11v1"/><path d="M8 11a4 4 0 010-.5M8 13.5a10 10 0 01-1.6 4.8"/><path d="M14.5 13.5a14 14 0 01-1.2 5.5"/><path d="M4 6.5A9.5 9.5 0 0121 9"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flip"><path d="M15 6l-6 6 6 6"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flip"><path d="M4 12l16-8-6 16-2-7z"/></svg>'
};
const svg = k => h("span",{html:ICON[k],style:"display:contents"});
function dkey(d=new Date()){ const z=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()); }
function addDays(k,n){ const [y,m,d]=k.split("-").map(Number); return dkey(new Date(y,m-1,d+n)); }
const TODAY = () => dkey();
function fmtDate(k, opts={day:"numeric",month:"short"}){ if(!k) return ""; const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString(lang==="ar"?"ar-EG":"en-GB",opts); }
const uid = p => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
let toastTimer;
function toast(msg){ document.querySelectorAll(".toast").forEach(n=>n.remove()); const n=h("div",{class:"toast",role:"status"},msg); document.body.append(n); clearTimeout(toastTimer); toastTimer=setTimeout(()=>n.remove(),2600); }
async function sha(s){ const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export { $, h, ICON, svg, dkey, addDays, TODAY, fmtDate, uid, toastTimer, toast, sha, b64, unb64 };
