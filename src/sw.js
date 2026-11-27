/* Service worker aplikacji studia: offline (precache) + powiadomienia Web Push */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// nawigacja w aplikacji studia → index.html; strony klienta obsługujemy osobno
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/umow\//, /\/zlecenie\//, /\/prywatnosc\//, /\/rejestracja\//, /\/regulamin\//] }));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'DetailDesk', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DetailDesk', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: data.tag,
      data: { url: data.url || self.registration.scope },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          await c.focus();
          if ('navigate' in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
