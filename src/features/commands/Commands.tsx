import { useState } from 'react';
import { parseCommand, type Command } from './parser';
import { S, patch, put } from '../../data/store.js';
import { uid } from '../../shared/helpers.js';
import { openVoice } from '../voice/index.js';
import { lang } from '../../i18n/index.js';
import { rememberAction, undoLast, undoLabel } from '../../data/actions';
import { useRevision } from '../../app/react-store';
import type { Task } from '../../types/domain';
export function Commands() {
  useRevision(); const ar = lang === 'ar';
  const [text, setText] = useState(''); const [command, setCommand] = useState<Command | null>(null); const [message, setMessage] = useState('');
  function preview(value = text) { try { setCommand(parseCommand(value, [...S.items.values()].filter(x => x.kind === 'task') as Task[])); setMessage(''); } catch (error) { setCommand(null); setMessage((error as Error).message); } }
  async function apply() {
    if (!command) return;
    if (command.kind === 'complete') {
      const before = S.items.get(command.id);
      if (!before || before.done || before.title !== command.title) { setCommand(null); setMessage(ar ? 'المهمة تغيرت. راجع الأمر من جديد.' : 'The task changed. Preview the command again.'); return; }
      await patch(command.id, { done: true, doneAt: Date.now(), top: false }); rememberAction(command.id, before, ar ? 'أمر سريع' : 'Quick command');
    } else {
      const id = uid(command.kind === 'add' ? 'task' : 'note');
      await put(id, command.kind === 'add' ? { kind: 'task', title: command.title, due: command.due, time: command.time, q: 2, done: false, items: [], created: Date.now() } : { kind: 'note', type: 'note', text: command.text, created: Date.now() });
      rememberAction(id, null, ar ? 'أمر سريع' : 'Quick command');
    }
    setCommand(null); setText(''); setMessage(ar ? 'تم الحفظ.' : 'Saved.');
  }
  return <section className="stack"><h1>{ar ? 'أوامر سريعة' : 'Quick commands'}</h1><p className="muted">{ar ? 'تحدث أو اكتب، ثم راجع النتيجة قبل حفظها. الأوامر البسيطة لا تحتاج مفتاح ذكاء اصطناعي.' : 'Speak or type, then review before saving. Simple commands work without an AI key.'}</p>
    <div className="card small">{ar ? 'أضف اتصل بأحمد بكرة الساعة ١٠:٣٠' : 'Add call Ahmed tomorrow at 10:30'}<br />{ar ? 'خلصت اتصل بأحمد' : 'Complete call Ahmed'}<br />{ar ? 'ملاحظة تمت الموافقة على الميزانية' : 'Note budget approved'}</div>
    <button className="btn" onClick={() => openVoice({ onTranscript: (value: string) => { setText(value); preview(value); } })}>{ar ? 'تحدث بأمر' : 'Speak a command'}</button>
    <label>{ar ? 'الأمر' : 'Command'}<textarea className="field" value={text} onChange={e => { setText(e.target.value); setCommand(null); }} /></label><button className="btn" onClick={() => preview()}>{ar ? 'معاينة الأمر' : 'Preview command'}</button>
    {message && <p role="status">{message}</p>}
    {command && <div className="card stack"><strong>{command.kind === 'add' ? (ar ? 'إضافة مهمة' : 'Add task') : command.kind === 'note' ? (ar ? 'حفظ ملاحظة' : 'Save note') : (ar ? 'إنجاز المهمة' : 'Complete task')}</strong><p dir="auto">{command.kind === 'note' ? command.text : command.title}</p>{command.kind === 'add' && <p>{command.due} {command.time}</p>}<button className="btn primary" onClick={() => void apply()}>{ar ? 'تأكيد' : 'Apply command'}</button></div>}
    {undoLabel() && <button className="btn" onClick={() => void undoLast().then(ok => setMessage(ok ? (ar ? 'تم التراجع.' : 'Undone.') : (ar ? 'توجد تعديلات أحدث.' : 'A newer edit was kept.')))}>{ar ? 'تراجع عن آخر إجراء' : 'Undo last action'}</button>}
  </section>;
}
