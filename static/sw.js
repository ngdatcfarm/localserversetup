// CFarm Service Worker - Minimal version for testing
console.log('[SW] Installing...');

self.addEventListener('install', (event) => {
    console.log('[SW] Install event');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activate event');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    if (event.data) {
        const data = event.data.json();
        self.registration.showNotification(data.title || 'CFarm Alert', {
            body: data.body || 'You have a new alert',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'cfarm-alert'
        });
    }
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.notification);
    event.notification.close();

    const data = event.notification.data ? event.notification.data : {};
    const url = data.url || '/?tab=care';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it and navigate
            for (const client of clientList) {
                if (client.url.includes('/') && 'focus' in client) {
                    client.focus();
                    client.navigate(url);
                    return;
                }
            }
            // Otherwise open a new window
            return clients.openWindow(url);
        })
    );
});

console.log('[SW] Script loaded');
