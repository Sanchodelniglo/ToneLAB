// Bump on every release so installed clients pick up new assets on activate.
const CACHE_NAME = 'tonelab-synth-v12';

// App shell key. Cloudflare Pages redirects /index.html -> /, so we keep both
// entries precached and try both on fallback.
const SHELL_URLS = ['./index.html', './'];

// Everything the app needs to boot offline. All same-origin (Tone.js and
// fonts are vendored), so a single addAll() either fully succeeds or fails.
const PRECACHE_URLS = [
  ...SHELL_URLS,
  './styles.css',
  './js/main.js',
  './js/state.js',
  './js/crt.js',
  './js/pwa.js',
  './js/audio/effects.js',
  './js/audio/synth.js',
  './js/audio/presets.js',
  './js/ui/knobs.js',
  './js/ui/controls.js',
  './js/ui/keyboard.js',
  './js/ui/scope.js',
  './js/ui/wavePreview.js',
  './js/ui/mobile.js',
  './js/ui/randomize.js',
  './js/ui/xypad.js',
  './js/ui/arp.js',
  './manifest.json',
  './vendor/Tone.js',
  './fonts/fonts.css',
  './fonts/orbitron-latin.woff2',
  './fonts/share-tech-mono-latin.woff2',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // `cache: 'reload'` bypasses the HTTP cache, so a new SW version never
      // precaches a stale script.js/styles.css the browser still had on disk.
      cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

async function matchShell(cache) {
  for (const url of SHELL_URLS) {
    const hit = await cache.match(url);
    if (hit) return hit;
  }
  return undefined;
}

// Navigations: network-first so a fresh deploy shows up on the next visit,
// falling back to the cached shell when offline.
async function handleNavigate(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(event.request);
    if (response.ok) {
      event.waitUntil(cache.put(SHELL_URLS[0], response.clone()));
    }
    return response;
  } catch (err) {
    return (await matchShell(cache)) || Response.error();
  }
}

// Assets: stale-while-revalidate. Serve from cache immediately, refresh the
// cached copy in the background so the *next* load gets the new version.
function handleAsset(event) {
  const { request } = event;
  const cachePromise = caches.open(CACHE_NAME);

  const network = fetch(request)
    .then(async response => {
      if (response.ok) {
        const cache = await cachePromise;
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  // Keep the worker alive until the background revalidation has been written,
  // otherwise the browser may kill it right after the cached response is sent.
  event.waitUntil(network);

  return cachePromise
    .then(cache => cache.match(request))
    .then(async cached => cached || (await network) || Response.error());
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let the browser handle third-party requests

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
  } else {
    event.respondWith(handleAsset(event));
  }
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
