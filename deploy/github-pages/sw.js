// Retires the service worker from the earlier web app, which cached that app for offline use.
// Browsers that still run it fetch this file, install it, and then: delete the old caches,
// unregister, and reload open tabs so they load the current app from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).map(key => caches.delete(key)));
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type:'window' })) client.navigate(client.url);
  })());
});
