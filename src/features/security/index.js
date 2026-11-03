import { $, b64, h, sha, svg, toast, unb64 } from '../../shared/helpers.js';
import { S, put, settings } from '../../data/store.js';
import { lang, t } from '../../i18n/index.js';
import { go, render } from '../../shared/events.js';
import { UI, rememberUI } from '../../app/state.js';
import { AI } from '../../services/ai.js';
import { analyze } from '../capture/index.js';
import { closeSheet } from '../../shared/sheet.js';

/* ---------- lock ---------- */
const LOCK = { unlocked:false, hiddenAt:0 };
let BIO_OK=false;
function bioSupported(){ return BIO_OK; }
try{ if (window.PublicKeyCredential && window.isSecureContext && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(v=>{ BIO_OK=!!v; if(BIO_OK && !$("#lock").hidden && settings().bioId && !LOCK.unlocked && !$(".bio-btn")) showLock("unlock"); }).catch(()=>{}); }catch(e){}
async function bioCreate(){
  const cred = await navigator.credentials.create({publicKey:{
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp:{name:"My PA"}, user:{id:new TextEncoder().encode(S.uid.slice(0,60)), name:"owner", displayName:"My PA owner"},
    pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
    authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"discouraged"}, timeout:60000 }});
  return b64(cred.rawId);
}
async function bioVerify(id){
  const a = await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:"public-key",id:unb64(id)}],userVerification:"required",timeout:60000}});
  return !!a;
}
function showLock(mode){
  const L = $("#lock"); L.hidden = false; L.replaceChildren();
  let entered = "", first = null;
  const st = settings();
  const brand = h("div",{class:"brand",style:"flex:none;color:var(--bg)"},h("span",{class:"mark",style:"background:var(--gold);color:var(--ink)"},"PA"),h("span",null,"My PA"));
  const title = h("h1",null, mode==="setup" ? t("setupT") : t("enterPin"));
  const sub = h("p",{class:"sub"}, mode==="setup" ? t("setupSub") : "");
  const dots = h("div",{class:"pins"}, [0,1,2,3].map(()=>h("i")));
  const err = h("div",{class:"err",role:"alert"});
  const paint = () => [...dots.children].forEach((d,i)=>d.classList.toggle("on", i<entered.length));
  const fail = msg => { err.textContent = msg; dots.classList.remove("shake"); void dots.offsetWidth; dots.classList.add("shake"); entered=""; paint(); };
  async function complete(){
    if (mode === "setup"){
      if (first == null){ first = entered; entered=""; paint(); title.textContent = t("confirmPin"); err.textContent=""; return; }
      if (first !== entered){ first=null; title.textContent=t("setupT"); return fail(t("pinMismatch")); }
      await put("settings",{...settings(),kind:"settings",pinHash:await sha(S.uid+":"+entered),lang});
      if (bioSupported() && !settings().bioId){ try{ const id=await bioCreate(); await put("settings",{...settings(),bioId:id}); toast(t("bioOn")); }catch(e){} }
      unlock(); return;
    }
    if (await sha(S.uid+":"+entered) === st.pinHash) unlock(); else fail(t("wrongPin"));
  }
  const press = d => { if (entered.length>=4) return; entered += d; paint(); if (entered.length===4) setTimeout(complete,120); };
  const pad = h("div",{class:"pad"},
    ["1","2","3","4","5","6","7","8","9"].map(d=>h("button",{type:"button",onclick:()=>press(d)},d)),
    h("button",{type:"button",class:"blank",tabindex:"-1","aria-hidden":"true"}),
    h("button",{type:"button",onclick:()=>press("0")},"0"),
    h("button",{type:"button","aria-label":"Delete",onclick:()=>{entered=entered.slice(0,-1);paint();}},svg("back")));
  L.append(brand,title,sub,dots,err,pad);
  if (mode!=="setup" && st.bioId && bioSupported()){
    const b = h("button",{type:"button",class:"bio-btn",onclick:async()=>{ try{ if(await bioVerify(st.bioId)) unlock(); }catch(e){ err.textContent=t("bioNA"); } }},svg("finger"),t("unlockBio"));
    L.append(b);
    setTimeout(async()=>{ try{ if(!LOCK.unlocked && await bioVerify(st.bioId)) unlock(); }catch(e){} },350);
  }
  L.onkeydown = e => { if (/^\d$/.test(e.key)) press(e.key); if (e.key==="Backspace"){entered=entered.slice(0,-1);paint();} };
  L.tabIndex = -1; L.focus();
}
function unlock(){ LOCK.unlocked = true; $("#lock").hidden = true; try{ sessionStorage.setItem("mk_unlock", String(Date.now())); }catch(e){} render(); takeShare(); }
let PENDING_SHARE = null;
async function readShare(){
  const q = new URLSearchParams(location.search);
  if (q.has("shared")){
    try{ const c=await caches.open("mypa-share"); const r=await c.match("shared"); if(r){ PENDING_SHARE=await r.text(); await c.delete("shared"); } }catch(e){}
  } else if (q.has("text") || q.has("title")){
    PENDING_SHARE=[q.get("title"),q.get("text"),q.get("url")].filter(Boolean).join("\n");
  }
  if (q.toString()) try{ history.replaceState(null,"",location.pathname); }catch(e){}
  if (LOCK.unlocked) takeShare();
}
function takeShare(){
  if (!PENDING_SHARE || !LOCK.unlocked) return;
  UI.capText = PENDING_SHARE.slice(0,60000); PENDING_SHARE=null; rememberUI(); go("capture");
  if (AI) analyze({import:true}); else toast(t("aiOff"));
}
function lockNow(){ LOCK.unlocked=false; try{ sessionStorage.removeItem("mk_unlock"); }catch(e){} closeSheet(); showLock("unlock"); }
document.addEventListener("visibilitychange",()=>{
  if (document.hidden) LOCK.hiddenAt = Date.now();
  else if (LOCK.unlocked && LOCK.hiddenAt && Date.now()-LOCK.hiddenAt > 3*60*1000) lockNow();
});

export { LOCK, BIO_OK, bioSupported, bioCreate, bioVerify, showLock, unlock, PENDING_SHARE, readShare, takeShare, lockNow };
