import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as nodeTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const errors = [];
const console = new VirtualConsole();
console.on('jsdomError', error => errors.push(error));
const dom = new JSDOM(await readFile('index.html', 'utf8'), {
  url: 'https://example.test/Adel-Taha/', virtualConsole: console,
});
const { window } = dom;
window.scrollTo = () => {};
for (const name of ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'Event', 'CustomEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? window : window[name] });
}
globalThis.setTimeout = (...args) => { const timer = nodeTimeout(...args); timer.unref(); return timer; };
const salt = 'existing-device';
localStorage.setItem('mk_salt', salt);
localStorage.setItem('mk_items', JSON.stringify([
  ['settings', { id: 'settings', kind: 'settings', pinHash: createHash('sha256').update(`${salt}:1234`).digest('hex') }],
  ['task_existing', { id: 'task_existing', kind: 'task', title: 'Review forecast at 3 pm', q: 2, done: false, items: [] }],
  ['note_existing', { id: 'note_existing', kind: 'note', type: 'note', text: 'Previously saved note' }],
]));
sessionStorage.setItem('mk_unlock', String(Date.now()));

const { startApp } = await import('../src/app/app.js');
const { S, loadLocal } = await import('../src/data/store.js');
const { go } = await import('../src/shared/events.js');
const { setLanguage } = await import('../src/i18n/index.js');
const { CFG } = await import('../src/data/config.js');
const ai = await import('../src/services/ai.js');
startApp();
const clickText = (selector, text) => {
  const element = [...document.querySelectorAll(selector)].find(node => node.textContent.trim() === text);
  assert.ok(element, `Missing ${selector}: ${text}`);
  element.click();
};
after(() => { window.close(); globalThis.setTimeout = nodeTimeout; });

test('boots and retains saved data with the original storage keys', () => {
  assert.equal(document.querySelector('#lock').hidden, true);
  assert.equal(S.uid, salt);
  assert.equal(S.items.get('task_existing').title, 'Review forecast');
  assert.equal(S.items.get('task_existing').time, '15:00');
  assert.equal(S.items.get('note_existing').text, 'Previously saved note');
  assert.ok(document.querySelector('#view h1'));
  assert.deepEqual(errors, []);
});

test('adds a task through the UI, edits its checklist, and persists completion', async () => {
  go('tasks');
  const input = document.querySelector('#newTask');
  input.value = 'Call Ahmed';
  input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  let task = [...S.items.values()].find(item => item.title === 'Call Ahmed');
  assert.ok(task);
  clickText('#view .mini span[dir="auto"]', 'Call Ahmed');
  const step = document.querySelector('#tStep');
  step.value = 'Discuss the budget';
  step.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await delay(10);
  task = S.items.get(task.id);
  assert.deepEqual(task.items, [{ t: 'Discuss the budget', done: false }]);
  clickText('.sheet button', 'Mark done');
  assert.equal(S.items.get(task.id).done, true);
  S.items = new Map();
  loadLocal();
  assert.equal(S.items.get(task.id).done, true);
  assert.deepEqual(errors, []);
});

test('opens every screen and saves a note and habit without AI', () => {
  for (const screen of ['today', 'calendar', 'tasks', 'capture', 'notes', 'habits', 'ask']) {
    go(screen);
    assert.ok(document.querySelector('#view h1'), `Screen ${screen} failed`);
  }
  go('notes');
  document.querySelector('#nText').value = 'ملاحظة جديدة';
  clickText('#view button', 'Save');
  assert.ok([...S.items.values()].some(item => item.text === 'ملاحظة جديدة'));
  go('habits');
  const input = document.querySelector('#hName');
  input.value = 'Walk 30 minutes';
  input.closest('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  assert.ok([...S.items.values()].some(item => item.name === 'Walk 30 minutes'));
  document.querySelector('#view .day').click();
  assert.equal(Object.keys([...S.items.values()].find(item => item.name === 'Walk 30 minutes').log).length, 1);
  assert.deepEqual(errors, []);
});

test('settings switches Arabic layout and refreshes AI selection across modules', () => {
  document.querySelector('#menuBtn').click();
  clickText('.sheet button', 'العربية');
  assert.equal(document.documentElement.lang, 'ar');
  assert.equal(document.documentElement.dir, 'rtl');
  assert.equal(localStorage.getItem('mk_lang'), 'ar');
  document.querySelector('#cfgOpenai').value = 'test-only-key';
  document.querySelector('#cfgProvider').value = 'openai';
  clickText('.sheet button', 'حفظ');
  assert.equal(CFG.openaiKey, 'test-only-key');
  // Read the live binding, rather than a snapshot of AI at import time.
  assert.ok(ai.AI);
  clickText('.sheet button', 'تم');
  setLanguage('en');
  go('today');
  assert.deepEqual(errors, []);
});

test('lock rejects an incorrect PIN and accepts the saved PIN', async () => {
  document.querySelector('#menuBtn').click();
  clickText('.sheet button', 'Lock now');
  const typePin = pin => {
    for (const key of pin) document.querySelector('#lock').dispatchEvent(new window.KeyboardEvent('keydown', { key }));
  };
  const waitFor = async predicate => { const deadline=Date.now()+5000; while(!predicate() && Date.now()<deadline) await delay(20); assert.ok(predicate(),'PIN operation did not finish'); };
  typePin('0000');
  await waitFor(()=>/Wrong PIN/.test(document.querySelector('#lock .err').textContent));
  assert.equal(document.querySelector('#lock').hidden, false);
  assert.match(document.querySelector('#lock .err').textContent, /Wrong PIN/);
  typePin('1234');
  await waitFor(()=>document.querySelector('#lock').hidden);
  assert.equal(document.querySelector('#lock').hidden, true);
  assert.deepEqual(errors, []);
});
