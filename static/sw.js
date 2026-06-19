// CFarm Service Worker v2
// ----------------------
// Responsibilities:
//   1. Cache static shell + manifest + icons → fast first paint + offline fallback
//   2. Network-first for /api/* GETs with cache fallback → stale-while-offline
//   3. Network-only (no cache) for mutations / auth → never replay writes
//   4. Handle Web Push (notification + click) → used by AlertService
//   5. Accept messages from clients (skipWaiting on update)

const VERSION = 'cfarm-sw-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Files to precache so the app boots offline. Paths are absolute because the SW
// root is the page origin, not /static.
const SHELL_FILES = [
    '/',
    '/static/manifest.json',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
    '/static/css/app.css',
    '/static/vendor/vue.global.prod.js',
    '/static/vendor/vue-router.global.prod.js',
];

// ── Install: precache shell ──────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log(`[SW ${VERSION}] Installing...`);
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_FILES).catch((err) => {
                // Don't fail install if some optional shell files are missing
                console.warn('[SW] Shell precache partial:', err);
            }))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log(`[SW ${VERSION}] Activating...`);
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch handler ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Only handle same-origin GETs
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // API: network-first, fallback to cached
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(req));
        return;
    }

    // Navigation / static: cache-first with network refresh
    event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
        const fresh = await fetch(req);
        // Only cache 2xx responses — don't poison cache with 401/500
        if (fresh && fresh.ok) {
            cache.put(req, fresh.clone());
        }
        return fresh;
    } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        // No cache → return a synthetic 503 so the app shows a friendly error
        return new Response(JSON.stringify({ detail: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    if (cached) {
        // Refresh in background
        fetch(req).then((fresh) => {
            if (fresh && fresh.ok) cache.put(req, fresh.clone());
        }).catch(() => {});
        return cached;
    }
    try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
    } catch (err) {
        // Last-ditch: try the shell index for navigation requests
        if (req.mode === 'navigate') {
            const shell = await caches.match('/');
            if (shell) return shell;
        }
        return new Response('Offline', { status: 503 });
    }
}

// ── Push notifications ──────────────────────────────────────────
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'CFarm Alert', body: event.data ? event.data.text() : '' };
    }
    event.waitUntil(
        self.registration.showNotification(data.title || 'CFarm Alert', {
            body: data.body || 'Bạn có thông báo mới',
            icon: '/static/icons/icon-192.png',
            badge: '/static/icons/icon-192.png',
            tag: data.tag || 'cfarm-alert',
            data: data.url || '/',
            vibrate: [200, 100, 200],
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    return client.navigate(url);
                }
            }
            return clients.openWindow(url);
        })
    );
});

// ── Client messages (skip waiting on user prompt) ───────────────
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

console.log(`[SW ${VERSION}] Script loaded`);
