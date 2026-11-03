import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const template = await readFile('scripts/service-worker.js', 'utf8');
function worker() {
  const handlers = new Map();
  const stores = new Map();
  const deleted = [];
  const network = [];
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(paths) {
          for (const path of paths) store.set(new URL(path, 'https://example.test/Adel-Taha/').href, new Response(path));
        },
        async match(key) { return store.get(typeof key === 'string' ? key : key.url)?.clone(); },
        async put(key, response) { store.set(key, response); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(key) { deleted.push(key); return stores.delete(key); },
  };
  const self = {
    registration: { scope: 'https://example.test/Adel-Taha/' },
    addEventListener: (name, handler) => handlers.set(name, handler),
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
  };
  vm.runInNewContext(template.replace('__CACHE_VERSION__', 'test').replace('__SHELL_FILES__', JSON.stringify(['./', './index.html', './assets/app.js'])), {
    self, caches, URL, Response, fetch: async request => { network.push(request.url); throw new Error('offline'); },
  });
  async function lifecycle(name) {
    let promise;
    handlers.get(name)({ waitUntil: value => { promise = value; } });
    await promise;
  }
  async function request(request) {
    let promise;
    handlers.get('fetch')({ request, respondWith: value => { promise = value; } });
    return promise;
  }
  return { stores, deleted, network, lifecycle, request };
}

test('offline navigation and hashed assets work under a repository subpath', async () => {
  const app = worker();
  await app.lifecycle('install');
  const page = await app.request({ url: 'https://example.test/Adel-Taha/?text=hello', method: 'GET', mode: 'navigate' });
  assert.equal(await page.text(), './index.html');
  const asset = await app.request({ url: 'https://example.test/Adel-Taha/assets/app.js', method: 'GET', mode: 'cors' });
  assert.equal(await asset.text(), './assets/app.js');
  assert.deepEqual(app.network, []);
  assert.equal(await app.request({ url: 'https://api.openai.com/v1/responses', method: 'POST' }), undefined);
  assert.equal(await app.request({ url: 'https://example.test/other-app/', method: 'GET', mode: 'navigate' }), undefined);
});

test('activation preserves pending shares and unrelated application caches', async () => {
  const app = worker();
  for (const key of ['mypa-share', 'mypa-v9', 'mypa-shell-old', 'other-app']) app.stores.set(key, new Map());
  await app.lifecycle('install');
  await app.lifecycle('activate');
  assert.deepEqual(app.deleted.sort(), ['mypa-shell-old', 'mypa-v9']);
  assert.ok(app.stores.has('mypa-share'));
  assert.ok(app.stores.has('other-app'));
});

test('sharing text redirects into the correct app subpath and keeps the import key', async () => {
  const app = worker();
  const form = new FormData();
  form.set('title', 'Shared note');
  form.set('text', 'Call Ahmed tomorrow');
  form.append('file', new Blob(['Meeting on Thursday'], { type: 'text/plain' }), 'chat.txt');
  const request = new Request('https://example.test/Adel-Taha/share-target', { method: 'POST', body: form });
  const response = await app.request(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://example.test/Adel-Taha/?shared=1');
  assert.equal(await app.stores.get('mypa-share').get('shared').text(), 'Shared note\nCall Ahmed tomorrow\nMeeting on Thursday');
});
