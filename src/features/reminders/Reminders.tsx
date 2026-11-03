import { useState } from 'react';
import { S, patch } from '../../data/store.js';
import { lang } from '../../i18n/index.js';
import { useRevision } from '../../app/react-store';
import { enableDeviceReminders, isNative, readPreferences, reminderStatus, savePreferences } from '../../platform/reminders';
import { reminderPlan } from '../../platform/reminder-plan';
import type { Task } from '../../types/domain';
export function Reminders() {
  useRevision(); const ar = lang === 'ar'; const [preferences, setPreferences] = useState(readPreferences); const [error, setError] = useState('');
  const tasks = [...S.items.values()].filter(x => x.kind === 'task') as Task[];
  const plan = reminderPlan(tasks, preferences);
  return <section className="stack"><h1>{ar ? 'التذكيرات' : 'Reminders'}</h1><p role="status">{reminderStatus}</p><button className="btn primary" onClick={() => void enableDeviceReminders().catch(e => setError(e.message))}>{ar ? 'تفعيل التذكيرات' : 'Enable reminders'}</button>{error && <p role="alert">{error}</p>}
    <form className="card stack" onSubmit={e => { e.preventDefault(); savePreferences(preferences); }}>
      <label><input type="checkbox" checked={preferences.quiet} onChange={e => setPreferences({ ...preferences, quiet: e.target.checked })} /> {ar ? 'ساعات الهدوء للتذكيرات الأصلية' : 'Quiet hours for native reminders'}</label>
      <div className="row">{(['quietStart','quietEnd'] as const).map((key,index) => <label key={key}>{index ? (ar ? 'إلى' : 'Until') : (ar ? 'من' : 'From')}<select className="field" value={preferences[key]} onChange={e => setPreferences({ ...preferences, [key]: Number(e.target.value) })}>{Array.from({ length:24 },(_,hour) => <option value={hour} key={hour}>{String(hour).padStart(2,'0')}:00</option>)}</select></label>)}</div>
      <small className="muted">{ar ? 'تُؤجل التنبيهات خلال ساعات الهدوء حتى نهايتها. يُجدول أقرب ٦٠ تنبيهاً ويتم تحديثها عند فتح التطبيق.' : 'Alerts in quiet hours move to the end of that period. The next 60 alerts are scheduled and refreshed when the app opens.'}</small><button className="btn">{ar ? 'حفظ' : 'Save'}</button>
    </form>
    <h2>{ar ? 'التذكيرات القادمة' : 'Upcoming reminders'}</h2>
    {!isNative && <p className="small muted">{ar ? 'هذه معاينة لجدول التطبيق الأصلي. استخدم التقويم للتنبيهات أثناء إغلاق المتصفح.' : 'This previews the native schedule. Use calendar export for alerts when the browser is closed.'}</p>}
    {plan.map(item => <div className="card" key={item.taskId}><strong>{item.title}</strong><p>{item.at.toLocaleString(ar ? 'ar-EG' : 'en-GB')}</p></div>)}
    <h2>{ar ? 'تأجيل مهمة متأخرة' : 'Reschedule overdue tasks'}</h2>
    {tasks.filter(task => !task.done && task.due && new Date(`${task.due}T${task.time || '23:59'}`) < new Date()).map(task => <div className="card row" key={task.id}><span className="grow">{task.title}</span><button className="btn" onClick={() => { const at = new Date(Date.now()+30*60_000); const due = `${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`; void patch(task.id, { due, time: `${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`, remind: 0 }); }}>{ar ? 'بعد ٣٠ دقيقة' : 'In 30 minutes'}</button></div>)}
  </section>;
}
