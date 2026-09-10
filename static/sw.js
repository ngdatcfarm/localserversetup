// CFarm Service Worker v19
// ----------------------
// Responsibilities:
//   1. Cache static shell + manifest + icons → fast first paint + offline fallback
//   2. Network-first for /api/* GETs with cache fallback → stale-while-offline
//   3. Network-only (no cache) for mutations / auth → never replay writes
//   4. Handle Web Push (notification + click) → used by AlertService
//   5. Accept messages from clients (skipWaiting on update)
//
// v19 (2026-08-26): bump version to flush stale shell + api.js + app.css +
// pages/security.js after adding the Cloudflare Worker relay (Telegram
// notification channel) — "📡 Kênh thông báo" card + Bind Telegram modal.
// Without the bump, browsers serve stale shell and the new /api/relay/*
// routes + API.relay namespace silently fail to appear.
//
// v18 (2026-08-26): bump version to flush stale shell + app.js + api.js +
// pages/security.js + app.css after adding the Anti-theft / Person Detection
// page. Without the bump, browsers serve stale shell and the new /security
// route + API.security namespace + sidebar entry silently fail to appear.
//
// v17 (2026-08-25): bump version to flush stale inverter.js + app.css after
// adding "⚠ chưa verify" badges for unverified telemetry fields (grid power,
// EPS load, battery power). Also flags the polling reliability issue — the
// strict response validation (magic + version + LEN) added in inverter_client
// means fewer corrupt samples will be stored in DB; users will see fewer
// anomalous values like "soc=12340%" in history charts.
// v16 (2026-08-25): bump version to flush stale inverter.js + app.css after
// adding the data-freshness indicator (header pill + banner above KPIs) so
// users always see how old the displayed numbers are. Without the bump,
// browsers serve stale pages/inverter.js and the freshness banner doesn't
// appear — users stare at stale numbers without realising the dongle timed
// out 2 minutes ago.
// v15 (2026-08-25): bump version to flush stale app.js, api.js, app.css and
// pages/inverter.js after adding the Luxpower inverter dashboard. Without the
// bump, browsers serve stale shell from cache and the new /inverter route +
// API.inverter namespace appear silently missing.
// v14 (2026-08-22): bump version to flush stale app.css after adding 1px green
// border to .cf-btn-save so it matches the 1px gray border on .cf-btn-outline
// — keeps both "Tải lại" and "Lưu tất cả" at identical 34px height. v13 fixed
// the padding/radius mismatch but border vs no-border still caused 2px diff.
// v13 (2026-08-22): bump version to flush stale medications.js + app.css after
// aligning "Tải lại" and "Lưu tất cả" button sizes. Both now use cf-btn-sm
// base; "Lưu tất cả" uses new .cf-btn-save class (green primary, cf-btn-sm size)
// when picks exist, .cf-btn-outline (gray, cf-btn-sm size) when disabled.
// v12 (2026-08-22): bump version to flush stale medications.js after making
// "Lưu tất cả" button always visible (disabled when no picks) instead of
// hidden behind v-if — better discoverability. v10/v11 had it hidden until
// a row was picked, which users missed.
// v11 (2026-08-22): bump version to flush stale medications.js after fixing
// template-literal backtick bug in "Lưu tất cả" :title (backticks inside the
// template string closed the outer template literal early, causing Vue compile
// SyntaxError: Unexpected identifier 'Lưu').
// v10 (2026-08-22): bump version to flush stale medications.js after adding
// "Lưu tất cả" bulk-save button next to "Tải lại" in manual cleanup section.
// v9 (2026-08-22): bump version to flush stale medications.js after manual
// cleanup section fix (reactive({}) instead of ref({}) for freeTextPick,
// Gán button always enabled with clearer hint text).
// v8 (2026-08-22): bump version to flush stale medications + care page modules
// after AI alias-suggestion feature. v7 → v8 keeps old medications.js missing
// the AI gợi ý gộp tên thuốc section, and care.js missing the "Đã dùng gần
// đây" recent-med suggestions chips. Without the bump, browsers serve stale
// code from cache and the user-facing changes appear silently missing.
// v7 (2026-08-22): bump version to flush stale care + care-water page modules.
// v6 → v7 keeps old care.js, care-water.js in module cache — neither page
// exposed edit support (Sửa), shift status indicators (recorded/⚠ Chưa ghi),
// or prominent-history-above-form layout. Without the bump, browsers serve
// stale code from cache and the user-facing changes appear silently missing.
// v6: fmtNum exposed in setup() return — fixes "+ kg" → "+100 kg" rendering.

const VERSION = 'cfarm-sw-v19';
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
