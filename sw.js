// Service worker: rede primeiro (sempre a versão mais nova), cache como reserva offline.
const CACHE = 'tracker-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});

// Clique na notificação: foca o app e abre o item certo.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ref = e.notification.data?.ref;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) { await all[0].focus(); all[0].postMessage({ ref }); return; }
    await self.clients.openWindow('./#/hoje');
  })());
});

// Fase 2: push vindo do Supabase.
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Tracker', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, data: { ref: d.ref }, icon: 'icon.svg', tag: d.key }));
});
