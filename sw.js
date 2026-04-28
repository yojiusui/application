// Service Worker — KNOWLEDGE ESTATE
const CACHE = 'knowledge-estate-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/supabase.js',
  '/app-core.js',
  '/app-features.js',
  '/app-auth.js',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/apple-touch-icon.svg',
];

// Install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell; network-first for Supabase API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Let Supabase / external API calls go straight to network
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('jsdelivr.net')) {
    return;
  }

  // Cache-first for same-origin assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Only cache successful same-origin GET responses
        if (!resp || resp.status !== 200 || e.request.method !== 'GET') return resp;
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      });
    })
  );
});
