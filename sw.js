"use strict";
/*
 * Service worker — Atlas / Edison Deck Builder (Fase 0, task 0.1)
 *
 * Strategia:
 *  - App shell (index.html, manifest.json, icone): cache-first, precaricata all'install.
 *    Cosi' l'app si apre e funziona offline anche alla primissima visita dopo l'install.
 *  - Immagini carte (images.ygoprodeck.com): cache-first runtime. Le immagini non
 *    cambiano una volta pubblicate: prenderle dalla cache evita richieste ripetute
 *    e aiuta il rispetto dei rate limit di YGOPRODeck (D3 in 04_DECISIONS.md).
 *  - API carte (db.ygoprodeck.com): network-first con fallback cache. I dati possono
 *    aggiornarsi (carte nuove, banlist), quindi si preferisce la rete quando c'e',
 *    ma offline si torna all'ultima risposta salvata invece di fallire.
 *  - Tutto il resto: passa diretto alla rete, nessuna cache speciale.
 *
 * Bump CACHE_VERSION quando cambia l'app shell, cosi' la vecchia cache viene ripulita
 * all'attivazione della nuova versione.
 */

const CACHE_VERSION = "atlas-v1";
const SHELL_CACHE = CACHE_VERSION + "-shell";
const IMG_CACHE = CACHE_VERSION + "-images";
const API_CACHE = CACHE_VERSION + "-api";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("atlas-") && ![SHELL_CACHE, IMG_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isImageRequest(url) {
  return url.hostname === "images.ygoprodeck.com";
}
function isApiRequest(url) {
  return url.hostname === "db.ygoprodeck.com";
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // non toccare POST/altro

  const url = new URL(req.url);

  // App shell: stesso origine del sito che ospita index.html
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // tutto il resto: passa alla rete senza intervenire
});
