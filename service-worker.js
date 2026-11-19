"use strict";

const scope = new URL(self.registration.scope);
const cachePrefix = `vostok-shell:${scope.href}:`;
const shellCache = `${cachePrefix}2`;
const entry = new URL("index.html", scope).href;
const shellFiles = [
  "index.html", "styles.css", "appearance.css", "appearance.js", "charts.js",
  "app.js", "geocoding.js", "analytics.js", "manifest.webmanifest", "assets/vostok-retro-display.ttf",
  "assets/original-header.svg", "assets/retro-header.svg",
  "assets/original-horizon.svg", "assets/retro-horizon.svg",
  "assets/icons/apple-touch-icon.png", "assets/icons/vostok-192.png",
  "assets/icons/vostok-512.png", "assets/icons/vostok-maskable-512.png",
].map((path) => new URL(path, scope).href);

self.addEventListener("install", (event) => {
  // A versão em espera ativa pelo ciclo normal, depois que os clientes anteriores saírem.
  event.waitUntil(caches.open(shellCache).then((cache) => cache.addAll(
    shellFiles.map((url) => new Request(url, { cache: "reload" }))
  )));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(cachePrefix) && key !== shellCache)
      .map((key) => caches.delete(key))
  )));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  let asset = url.href;
  if (request.mode === "navigate" &&
      (url.pathname === scope.pathname || url.pathname === new URL(entry).pathname)) {
    asset = entry;
  }
  if (!shellFiles.includes(asset)) return;

  // Cada sessão controlada lê a mesma versão de todos os arquivos essenciais.
  event.respondWith(caches.open(shellCache).then(async (cache) =>
    (await cache.match(asset)) || new Response("Interface indisponível. Reabra com conexão.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  ));
});
