import { TODAY, addDays, toast, uid } from '../shared/helpers.js';
import { lang, t } from '../i18n/index.js';
import { put } from './store.js';
import { go } from '../shared/events.js';

async function loadSample(){
  const td=TODAY(), now=Date.now(); const ar=lang==="ar";
  const rows=[
    {kind:"task",title:ar?"مراجعة التدفق النقدي للربع الرابع مع المدير المالي":"Review Q4 cash-flow forecast with the CFO",q:1,due:td,time:"11:00",top:true,items:[{t:ar?"طلب الأرقام المحدثة":"Request updated numbers",done:true},{t:ar?"مراجعة سيناريو سعر الصرف":"Check FX scenario",done:false},{t:ar?"اعتماد الخطة":"Sign off",done:false}]},
    {kind:"task",title:ar?"الرد على عرض البنك بخصوص التمويل":"Reply to the bank's financing offer",q:1,due:addDays(td,-1),top:true,details:ar?"مقارنة الفائدة مع عرض CIB قبل الرد":"Compare the rate with the CIB offer before replying",items:[]},
    {kind:"task",title:ar?"تجهيز عرض مجلس الإدارة":"Prepare the board meeting deck",q:2,due:addDays(td,8),top:true,items:[{t:ar?"ملخص الأداء":"Performance summary",done:false},{t:ar?"خطة ٢٠٢٧":"2027 plan",done:false}]},
    {kind:"task",title:ar?"مقابلة مرشح مدير المبيعات":"Interview the sales director candidate",q:2,due:addDays(td,2),time:"13:30",items:[]},
    {kind:"task",title:ar?"تأكيد حجز فندق مؤتمر دبي":"Confirm hotel for the Dubai conference",q:3,due:addDays(td,1),time:"09:00",delegate:ar?"منى":"Mona",items:[]},
    {kind:"task",title:ar?"تحديث صورة الملف على لينكدإن":"Update LinkedIn profile photo",q:4,items:[]},
    {kind:"note",type:"note",text:ar?"فكرة: برنامج ولاء لكبار العملاء يبدأ في يناير.":"Idea: loyalty program for top-20 accounts, launch in January."},
    {kind:"habit",name:ar?"مشي ٣٠ دقيقة":"30-min walk",log:{[addDays(td,-1)]:true,[addDays(td,-2)]:true,[addDays(td,-4)]:true}},
    {kind:"habit",name:ar?"قراءة ٢٠ صفحة":"Read 20 pages",log:{[addDays(td,-1)]:true}}
  ];
  let i=0; for(const r of rows){ await put(uid(r.kind),{done:false,...r,example:true,created:now+i++}); }
  toast(t("added")+": "+rows.length); go("today");
}

export { loadSample };
