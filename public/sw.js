const CACHE = 'priorproof-public-v2';
const publicPages = new Set(['/', '/journey', '/evaluation', '/manifest.json']);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...publicPages])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys
        .filter(key => key.startsWith('priorproof-') && key !== CACHE)
        .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (request.mode === 'navigate' && publicPages.has(url.pathname) && !url.search) {
        event.respondWith(fetch(request).then(async response => {
            if (response.ok) {
                const cache = await caches.open(CACHE);
                await cache.put(request, response.clone());
            }
            return response;
        }).catch(async () => (await caches.match(request)) || Response.error()));
    } else if (url.pathname.startsWith('/_next/static/') || url.pathname === '/admissions-illustration.png') {
        event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(async response => {
            if (response.ok) {
                const cache = await caches.open(CACHE);
                await cache.put(request, response.clone());
            }
            return response;
        })));
    }
});
