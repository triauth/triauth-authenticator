/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// Minimal offline shell for the Triauth Authenticator.
//
// Strategy: NETWORK-FIRST with cache fallback, for same-origin GET requests only.
// While online this worker never serves cached app code - every response comes from
// the network and merely refreshes the offline copy. It exists purely so the app
// still renders offline; it adds no other caching semantics.

const CACHE_NAME = 'triauth-authenticator-v1';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    for (const name of await caches.keys()) {
      if (name !== CACHE_NAME) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const request = event.request;

  // Same-origin GETs only - DoH lookups, attachment downloads, and callback POSTs
  // pass through untouched.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith((async function () {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      throw err;
    }
  })());
});
