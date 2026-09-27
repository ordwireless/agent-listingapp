// Deliberately caches nothing: the app always loads fresh from the server, so an update can never
// leave the phone showing an old version. This only lets the phone install the app, and shows a
// short message when there is no connection.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline</title><body style="font-family:system-ui,sans-serif;background:#16203a;color:#fff;display:flex;align-items:center;' +
  'justify-content:center;min-height:100vh;margin:0;text-align:center"><div><h1 style="font-size:20px">No connection</h1>' +
  '<p style="opacity:.75">Check your internet and reopen the app.</p></div></body>';

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else goes straight to the network
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});
