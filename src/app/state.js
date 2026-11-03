/* ---------- views ---------- */
const navigation = { tab: "today" };
const UI = { taskMode:"matrix", showDone:false, notesTab:"notes", capText:"", capResult:null, capBusy:false, plan:null, planBusy:false, chat:[], chatBusy:false, editNote:null };
try { const v = localStorage.getItem("mk_ui"); if (v) Object.assign(UI, {taskMode:"matrix"}, JSON.parse(v)); } catch(e){}
function rememberUI(){ try{ localStorage.setItem("mk_ui", JSON.stringify({taskMode:UI.taskMode,notesTab:UI.notesTab,capText:UI.capText})); }catch(e){} }
const Q = [1,2,3,4];
const qColor = q => `var(--q${q||2})`;

export { navigation, UI, rememberUI, Q, qColor };
