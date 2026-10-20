self.powerRuntimeVersion = "5a1f7b8931cac37c";
'use strict';
var gameScope = new URL(self.registration.scope);
var assetCache = 'power-assets-v1:' + gameScope.href;
var runtimePrefix = 'power-runtime-v1:' + gameScope.href + ':';
var runtimeCache = runtimePrefix + self.powerRuntimeVersion;
var pendingResponses = new Map();

async function requestedResponse(request, cacheName) {
  if (!cacheName) return fetch(request);
  var cache = null;
  try {
    cache = await caches.open(cacheName);
    var existing = await cache.match(request);
    if (existing) return existing;
  } catch (_) { /* Storage restrictions must not prevent game play. */ }
  var key = cacheName + ':' + request.url;
  var pending = pendingResponses.get(key);
  if (!pending) {
    pending = fetch(request).then(async function(response) {
      if (cache && response.ok && response.status === 200 && response.type !== 'opaque') {
        try { await cache.put(request, response.clone()); } catch (_) {}
      }
      return response;
    }).finally(function() { pendingResponses.delete(key); });
    pendingResponses.set(key, pending);
  }
  return (await pending).clone();
}

self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', function(event) {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    (async function() {
      try {
        var names = await caches.keys();
        await Promise.all(names.filter(function(name) {
          return name.indexOf(runtimePrefix) === 0 && name !== runtimeCache;
        }).map(function(name) { return caches.delete(name); }));
      } catch (_) {}
    })()
  ]));
});
self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  var url = new URL(request.url);
  if ((request.method && request.method !== 'GET') || url.origin !== gameScope.origin ||
      url.pathname.indexOf(gameScope.pathname) !== 0) return;
  var relative = url.pathname.substring(gameScope.pathname.length);
  var cacheName = null;
  if (/^web-assets\/[0-9a-f]{16}(-[0-9a-f]{16})?-(zstd|raw)(-[0-9]+)?\.pwa$/.test(relative) ||
      relative === 'web-assets.json' && /^[0-9a-f]{16}$/.test(url.searchParams.get('v') || ''))
    cacheName = assetCache;
  else if (/^PowerGame\.(js|wasm|data|worker\.js)$/.test(relative) &&
           url.searchParams.get('v') === self.powerRuntimeVersion)
    cacheName = runtimeCache;
  event.respondWith(requestedResponse(request, cacheName).then(function(response) {
    if (response.status === 0 || response.type === 'opaque') return response;
    var headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(response.body, {
      status: response.status, statusText: response.statusText, headers: headers
    });
  }));
});
