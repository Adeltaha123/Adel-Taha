// Build-time tokens are filled by build-service-worker.mjs.
const CACHE = 'mypa-shell-__CACHE_VERSION__';
const SHARE_CACHE = 'mypa-share';
const SHELL = __SHELL_FILES__;
const base = new URL(self.registration.scope);
const indexUrl = new URL('index.html', base).href;
const shellUrls = new Set(SHELL.map(path => new URL(path, base).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  // Wait for existing pages to close before activating a new bundle.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE && key !== SHARE_CACHE &&
      (key.startsWith('mypa-shell-') || /^mypa-v\d+$/.test(key))).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  if (event.request.method === 'POST' && url.pathname === new URL('share-target', base).pathname) {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const parts = [form.get('title'), form.get('text'), form.get('url')].filter(value => typeof value === 'string');
      for (const file of form.getAll('file')) if (file && typeof file.text === 'function') parts.push(await file.text());
      const cache = await caches.open(SHARE_CACHE);
      // Retain the original key so readShare() can consume it after an upgrade.
      await cache.put('shared', new Response(parts.join('\n')));
      return Response.redirect(new URL('./?shared=1', base).href, 303);
    })());
    return;
  }
  if (event.request.method !== 'GET') return;
  if (event.request.mode !== 'navigate' && !shellUrls.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Serve one coherent version until the waiting worker can activate.
    if (event.request.mode === 'navigate') {
      const cached = await cache.match(indexUrl);
      if (cached) return cached;
    }
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindow = windows.find(client => client.url.startsWith(base.href));
    if (appWindow) return appWindow.focus();
    return self.clients.openWindow(base.href);
  })());
});
