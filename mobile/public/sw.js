// Lets browsers install My PA on the home screen. Every request goes to the network as usual: nothing is cached,
// so the app always loads its newest version and the API is never served stale.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
