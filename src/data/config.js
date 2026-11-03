/* settings kept outside the synced items so keys never land in a backup by accident */
const CFG = { taskLang:"auto", provider:"claude", claudeKey:"", openaiKey:"", model:"claude-sonnet-5-5", openaiModel:"gpt-6.1-sol", engine:"phone", speechLang:"ar-EG" };
try { Object.assign(CFG, JSON.parse(localStorage.getItem("mk_cfg")||"{}")); } catch(e){}
if (!CFG.engineV){ if (CFG.openaiKey) CFG.engine="whisper"; CFG.engineV=2; try{ localStorage.setItem("mk_cfg", JSON.stringify(CFG)); }catch(e){} }
function saveCfg(){ try{ localStorage.setItem("mk_cfg", JSON.stringify(CFG)); }catch(e){} document.dispatchEvent(new Event("mypa:config")); }

export { CFG, saveCfg };
