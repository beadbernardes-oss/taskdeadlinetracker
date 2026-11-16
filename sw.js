// Service worker: rede primeiro (sempre a versão mais nova), cache como reserva offline.
const CACHE = 'tracker-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Arquivos do próprio app: sempre confere com o servidor (evita CSS/JS velho do cache do navegador)
  const same = new URL(e.request.url).origin === self.location.origin;
  const req = same && e.request.mode !== 'navigate' ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req)
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
    await self.clients.openWindow(ref ? `./?ref=${encodeURIComponent(JSON.stringify(ref))}#/hoje` : './#/hoje');
  })());
});

// Fase 2: push vindo do Supabase.
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Tracker', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, data: { ref: d.ref }, icon: 'icon.svg', tag: d.key }));
});
