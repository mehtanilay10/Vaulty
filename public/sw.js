/* Vaulty service worker: offline caching, asset caching, push delivery, and notification click handling. */

const CACHE_NAME = "vaulty-static-v1";
const PRECACHE_ASSETS = ["/manifest.json", "/favicon.svg", "/vaulty-icon.svg", "/offline"];

// 1. Install Event: Cache offline fallback and critical brand assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// 2. Activate Event: Clean up legacy caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith("vaulty-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// 3. Fetch Event: NetworkFirst for HTML navigations; CacheFirst/StaleWhileRevalidate for static assets
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Ignore non-GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ignore API requests, auth calls, and HMR
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Navigation requests: NetworkFirst falling back to /offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedOffline = await cache.match("/offline");
        return cachedOffline || Response.error();
      }),
    );
    return;
  }

  // Static Assets (icons, images, fonts, manifests): StaleWhileRevalidate
  const isStaticAsset =
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname === "/manifest.json";

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }),
    );
  }
});

// 4. Push Event: Push delivery
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || "You have a new Vaulty notification." };
  }
  const title = data.title || "Vaulty reminder";
  const options = {
    body: data.body || "You have an update in Vaulty.",
    icon: data.icon || "/vaulty-icon.svg",
    badge: data.badge || "/favicon.svg",
    data: { url: data.url || "/notifications" },
    tag: data.tag || "vaulty-notification",
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification Click Event
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const parsedTarget = new URL(
    event.notification.data?.url || "/notifications",
    self.location.origin,
  );
  const target =
    parsedTarget.origin === self.location.origin
      ? parsedTarget.href
      : new URL("/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
