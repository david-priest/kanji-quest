// Service worker for Kanji Quest.
//
// Strategy: precache the app shell on install, then serve those URLs
// cache-first. For data/* files (which can be regenerated), prefer the
// network but fall back to cache when offline.
//
// Bump CACHE_VERSION whenever the precache list changes or you ship a
// breaking update to any precached file — that triggers the new SW to
// clean out old caches on activate.

const CACHE_VERSION = "v9";
const APP_CACHE = `kanji-quest-app-${CACHE_VERSION}`;
const DATA_CACHE = `kanji-quest-data-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/app.js",
  "./js/srs.js",
  "./js/gamification.js",
  "./js/storage.js",
  "./js/kaeru.js",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Data files: network-first, fall back to cache (so updates land
  // immediately when online, and the app still works offline).
  if (url.pathname.includes("/data/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache-first.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // Opportunistically cache anything else in the app cache too
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(APP_CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
