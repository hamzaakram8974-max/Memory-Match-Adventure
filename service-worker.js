const CACHE_NAME = 'memory-match-adventure-v22';
const CACHE_PREFIX = 'memory-match-adventure-';
const APP_SHELL = './memory%20match%20copy.html';
const APP_FILES = [
    APP_SHELL,
    './memory-match.css',
    './memory-match.js',
    './manifest.json',
    './app-icon.svg',
    './features/index.html',
    './features/backgrounds.html',
    './features/themes.html',
    './features/powerups.html',
    './features/rewards.html',
    './features/stats.html',
    './features/streak.html',
    './features/accessibility.html',
    './features/backup.html',
    './features/shop.html',
    './features/features.css',
    './features/features.js',
    './multiplayer/index.html',
    './multiplayer/multiplayer.css',
    './multiplayer/multiplayer.js',
];
const APP_URLS = new Set(APP_FILES.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || !APP_URLS.has(request.url)) return;

    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(CACHE_NAME);
                event.waitUntil(cache.put(request, response.clone()).catch(error => {
                    console.warn('The app resource could not be cached for offline use.', error);
                }));
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) return cached;
            if (request.mode === 'navigate') {
                const appShell = await caches.match(APP_SHELL);
                if (appShell) return appShell;
            }
            throw error;
        }
    })());
});
