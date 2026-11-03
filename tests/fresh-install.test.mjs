import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setTimeout as nodeTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

test('a fresh installation can create a PIN and start using the app', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const { window } = new JSDOM(await readFile('index.html', 'utf8'), {
    url: 'https://example.test/', virtualConsole,
  });
  window.scrollTo = () => {};
  for (const name of ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'Event', 'CustomEvent']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? window : window[name] });
  }
  globalThis.setTimeout = (...args) => { const timer = nodeTimeout(...args); timer.unref(); return timer; };
  try {
    const { startApp } = await import('../src/app/app.js');
    startApp();
    assert.match(document.querySelector('#lock h1').textContent, /Secure your assistant/);
    assert.ok(localStorage.getItem('mk_salt'));
    for (let round = 0; round < 2; round++) {
      for (const digit of '1234') {
        [...document.querySelectorAll('#lock .pad button')].find(button => button.textContent === digit).click();
      }
      await delay(160);
    }
    // PIN hashing is async; poll instead of trusting a fixed delay on a busy machine.
    for (let waited = 0; !document.querySelector('#lock').hidden && waited < 3000; waited += 50) await delay(50);
    assert.equal(document.querySelector('#lock').hidden, true);
    const settings = JSON.parse(localStorage.getItem('mk_items')).find(([id]) => id === 'settings')[1];
    assert.equal(settings.pinHash.length, 64);
    assert.ok(document.querySelector('#view h1'));
    assert.deepEqual(errors, []);
  } finally {
    window.close();
    globalThis.setTimeout = nodeTimeout;
  }
});
