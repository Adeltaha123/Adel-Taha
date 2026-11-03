import { memo, useMemo, useState } from 'react';
import { S, patch, put, remove } from '../../data/store.js';
import { uid, TODAY } from '../../shared/helpers.js';
import { lang, t } from '../../i18n/index.js';
import { openTask } from './index.js';
import { rememberAction, undoLabel, undoLast } from '../../data/actions';
import { cloud } from '../../cloud/client';
import { useRevision } from '../../app/react-store';
import type { Task } from '../../types/domain';

const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
const Row = memo(function Row({ task, ar }: { task: Task; ar: boolean }) {
  return <article className={`task ${task.done ? 'done' : ''}`} style={{ borderInlineStartColor: `var(--q${task.q || 2})` }}>
    <input className="task-checkbox" type="checkbox" checked={task.done} aria-label={`${ar ? 'إنجاز' : 'Complete'} ${task.title}`} onChange={async () => { const before = structuredClone(task); await patch(task.id, { done: !task.done, doneAt: !task.done ? Date.now() : null, top: task.done ? task.top : false }); rememberAction(task.id, before as unknown as Record<string, unknown>, ar ? 'تغيير حالة المهمة' : 'Task status changed'); }} />
    <button className="task-open grow" onClick={() => openTask(task.id)}><span className="title" dir="auto">{task.title}</span><span className="meta"><span className="chip">{t(`q${task.q || 2}`)}</span>{task.due && <span className={`chip ${!task.done && task.due < TODAY() ? 'late' : ''}`}>{task.due} {task.time}</span>}{task.delegate && <span className="chip">→ {task.delegate}</span>}{task.items?.length > 0 && <span className="chip">{task.items.filter(i => i.done).length}/{task.items.length}</span>}</span></button>
    <button className="x" aria-label={`${ar ? 'حذف' : 'Delete'} ${task.title}`} onClick={async () => { const before = structuredClone(task); await remove(task.id); rememberAction(task.id, before as unknown as Record<string, unknown>, ar ? 'حذف المهمة' : 'Task deleted'); }}>×</button>
  </article>;
});
export function Tasks() {
  const revision = useRevision(); const ar = lang === 'ar';
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('open'); const [limit, setLimit] = useState(50); const [matrix, setMatrix] = useState(false); const [undoError, setUndoError] = useState('');
  const tasks = useMemo(() => {
    const query = normalized(search);
    return ([...S.items.values()] as Task[]).filter(x => x.kind === 'task')
      .filter(x => filter === 'all' || (filter === 'done' ? x.done : !x.done && (filter !== 'overdue' || Boolean(x.due && x.due < TODAY())) && (filter !== 'mine' || x.assigneeId === cloud.session?.user.id)))
      .filter(x => !query || normalized(`${x.title} ${x.details ?? ''} ${x.delegate ?? ''} ${(x.items ?? []).map(i => i.t).join(' ')}`).includes(query))
      .sort((a, b) => Number(a.done) - Number(b.done) || Number(Boolean(b.top)) - Number(Boolean(a.top)) || (a.q || 2) - (b.q || 2) || (a.due || '9999').localeCompare(b.due || '9999'));
  }, [revision, search, filter]);
  const visible = tasks.slice(0, limit);
  return <section className="stack">
    <div className="section-head"><h1>{t('tasks')}</h1><span className="chip">{tasks.length}</span></div>
    <form className="card stack" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); const title = String(data.get('title')).trim(); if (!title) return;
      const member = cloud.members.find(m => m.id === String(data.get('assignee') || '')); const id = uid('task');
      await put(id, { kind: 'task', title, q: Number(data.get('q') || 2), due: String(data.get('due') || '') || null, time: String(data.get('time') || '') || null, done: false, items: [], created: Date.now(), ...(member ? { assigneeId: member.id, delegate: member.email } : {}) });
      rememberAction(id, null, ar ? 'إضافة المهمة' : 'Task added'); form.reset();
    }}>
      <label className="sr-only" htmlFor="react-new-task">{t('addTask')}</label><input id="react-new-task" className="field" name="title" required maxLength={500} placeholder={t('addTask')} dir="auto" />
      <div className="task-fields"><label>{t('due')}<input className="field" type="date" name="due" /></label><label>{t('time')}<input className="field" type="time" name="time" /></label><label>{t('priority')}<select className="field" name="q" defaultValue="2">{[1,2,3,4].map(q => <option value={q} key={q}>{t(`q${q}`)}</option>)}</select></label></div>
      {cloud.members.length > 1 && <label>{ar ? 'إسناد لعضو' : 'Assign to a teammate'}<select className="field" name="assignee"><option value="">{ar ? 'بدون إسناد' : 'Unassigned'}</option>{cloud.members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}</select></label>}
      <button className="btn primary" type="submit">{t('add')}</button>
    </form>
    {undoLabel() && <div className="banner row" role="status"><span className="grow">{undoLabel()}</span><button className="btn" onClick={async () => { if (!await undoLast()) setUndoError(ar ? 'تم تعديل العنصر بعد ذلك؛ لم نغير النسخة الجديدة.' : 'This item has a newer edit, so it was left unchanged.'); }}>{ar ? 'تراجع' : 'Undo'}</button></div>}
    {undoError && <p role="status">{undoError}</p>}
    <label>{ar ? 'بحث في المهام والتفاصيل' : 'Search tasks and details'}<input className="field" type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} /></label>
    <div className="row"><select className="field grow" style={{ width: 'auto' }} aria-label={ar ? 'تصفية المهام' : 'Task filter'} value={filter} onChange={e => { setFilter(e.target.value); setLimit(50); }}><option value="open">{ar ? 'مفتوحة' : 'Open'}</option><option value="overdue">{t('overdue')}</option><option value="done">{t('done')}</option><option value="all">{t('allTasks')}</option>{cloud.session && <option value="mine">{ar ? 'مسندة لي' : 'Assigned to me'}</option>}</select><button className="btn" onClick={() => setMatrix(!matrix)}>{matrix ? t('list') : t('matrix')}</button></div>
    {!tasks.length && <p className="muted">{ar ? 'لا توجد مهام مطابقة.' : 'No matching tasks.'}</p>}
    {matrix ? <div className="matrix">{[1,2,3,4].map(q => <section className="stack" key={q}><h2>{t(`q${q}`)}</h2>{visible.filter(x => (x.q || 2) === q).map(task => <Row task={task} ar={ar} key={task.id} />)}</section>)}</div> : <div className="stack" data-testid="task-list">{visible.map(task => <Row task={task} ar={ar} key={task.id} />)}</div>}
    {tasks.length > limit && <button className="btn" onClick={() => setLimit(limit + 50)}>{ar ? 'عرض المزيد' : 'Show more'} ({tasks.length - limit})</button>}
  </section>;
}
