import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyTheme, isDark, setTheme } from './theme';
import { useRevision } from './react-store';
import { navigation } from './state.js';
import { go } from '../shared/events.js';
import { lang, t } from '../i18n/index.js';
import { S } from '../data/store.js';
import { Tasks } from '../features/tasks/Tasks';
import { cloud } from '../cloud/client';
import { viewToday } from '../features/today/index.js';
import { viewCalendar } from '../features/calendar/index.js';
import { viewCapture } from '../features/capture/index.js';
import { viewNotes } from '../features/notes/index.js';
import { viewHabits } from '../features/habits/index.js';
import { viewAsk } from '../features/assistant/index.js';
const Account = lazy(() => import('../features/account/Account').then(module => ({ default: module.Account })));
const Commands = lazy(() => import('../features/commands/Commands').then(module => ({ default: module.Commands })));
const Reminders = lazy(() => import('../features/reminders/Reminders').then(module => ({ default: module.Reminders })));

const legacyViews = { today: viewToday, calendar: viewCalendar, capture: viewCapture, notes: viewNotes, habits: viewHabits, ask: viewAsk };
function LegacyView({ screen, revision }: { screen: keyof typeof legacyViews; revision: number }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!S.ready || !host.current) return;
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const id = active?.id;
    const value = id && 'value' in active! ? active!.value : undefined;
    const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    host.current.replaceChildren(...legacyViews[screen]().flat());
    if (id) {
      const next = host.current.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${CSS.escape(id)}`);
      if (next) { if (value !== undefined && id !== 'capText') next.value = value; next.focus({ preventScroll:true }); if (selection) try { next.setSelectionRange(selection[0], selection[1]); } catch { /* Non-text input. */ } }
    }
  }, [screen, revision]);
  return <div className="stack" ref={host} />;
}

const icon = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>;
const navIcons = {
  today: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  calendar: 'M6 4.5h12a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3V7.5a3 3 0 013-3zM3 9.5h18M8 2.5v4M16 2.5v4',
  tasks: 'M9 6h11M9 12h11M9 18h11M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17',
  notes: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5',
};
const spark = 'M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z';
const gear = 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.8 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 14H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.1V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 10h.1a2 2 0 110 4H21a1.7 1.7 0 00-1.6 1z';
const moon = 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z';
const sun = 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';

export function App() {
  const revision = useRevision(); const ar = lang === 'ar'; const screen = navigation.tab;
  const [dark, setDark] = useState(() => isDark());
  useEffect(() => { applyTheme(); }, []);
  const toggleTheme = () => { setTheme(dark ? 'light' : 'dark'); setDark(!dark); };
  const tab = (name: keyof typeof navIcons) => <button type="button" key={name} data-tab={name} aria-current={screen === name ? 'page' : undefined}>{icon(navIcons[name])}<span>{t(name)}</span></button>;
  return <>
    <div className="app" id="app">
      <header className="top"><div className="brand"><span className="mark">PA</span><span>My PA</span></div>
        <button className="pill-btn" id="askBtn" type="button">{icon(spark)}<span>{t('ask')}</span></button>
        <button className="iconbtn" type="button" onClick={toggleTheme} aria-label={dark ? (ar ? 'الوضع الفاتح' : 'Light mode') : (ar ? 'الوضع الداكن' : 'Dark mode')}>{icon(dark ? sun : moon)}</button>
        <button className="iconbtn" id="menuBtn" type="button" aria-label={t('settings')}>{icon(gear)}</button></header>
      <div className="app-tools" aria-label={ar ? 'أدوات' : 'Tools'}>
        <button onClick={() => go('commands')} aria-current={screen === 'commands' ? 'page' : undefined}>{ar ? 'أوامر' : 'Commands'}</button>
        <button onClick={() => go('habits')} aria-current={screen === 'habits' ? 'page' : undefined}>{t('habits')}</button>
        <button onClick={() => go('reminders')} aria-current={screen === 'reminders' ? 'page' : undefined}>{ar ? 'تذكيرات' : 'Reminders'}</button>
        <button onClick={() => go('account')} aria-current={screen === 'account' ? 'page' : undefined}>{ar ? 'الحساب والفريق' : 'Account & team'}</button>
      </div>
      {cloud.active && <button className="sync-strip" onClick={() => go('account')}>{cloud.workspaces.find(w => w.id === cloud.active)?.name} · {cloud.status}</button>}
      <main id="view" className="stack"><Suspense fallback={<p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}>
        {screen === 'tasks' ? <Tasks /> : screen === 'account' ? <Account /> : screen === 'commands' ? <Commands /> : screen === 'reminders' ? <Reminders /> : <LegacyView key={screen} screen={screen in legacyViews ? screen as keyof typeof legacyViews : 'today'} revision={revision} />}
      </Suspense></main>
    </div>
    <nav className="tabs" aria-label={ar ? 'الرئيسية' : 'Main'}><div className="inner">
      {tab('today')}{tab('calendar')}
      <button type="button" id="fabMic" className="fab" aria-label={ar ? 'ملاحظة صوتية' : 'Voice note'}><span className="disc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/></svg></span></button>
      {tab('tasks')}{tab('notes')}
    </div></nav>
    <div className="lock" id="lock" />
  </>;
}
