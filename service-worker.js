// ÁNGELA · permite instalarla como app y que se actualice sola.
// Siempre busca la versión más nueva en internet; si no hay conexión, abre la última guardada.
// No toca /api (chat, Gmail, imágenes) ni páginas de otros sitios.
const CACHE = 'angela-app';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/API/')) return;
  e.respondWith(
    fetch(r, { cache: 'no-store' })
      .then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })
      .catch(() => caches.match(r).then(m => m || caches.match('./')))
  );
});
