import './styles/app.css';
import './styles/react.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { App } from './app/ReactApp';
import { startApp } from './app/app.js';
import { registerServiceWorker } from './platform/pwa';
import { initializeCloud } from './cloud/client';
import { initializeReminders } from './platform/reminders';
import { applyTheme } from './app/theme';

applyTheme();

const root = createRoot(document.getElementById('root')!);
flushSync(() => root.render(createElement(App)));
initializeReminders();
startApp({ reactMode: true });
void initializeCloud();
void registerServiceWorker();
