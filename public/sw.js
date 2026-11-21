// Service worker: guarda o app no celular para abrir sem internet.
// Ao mudar arquivos do app, aumente VERSAO para o celular pegar a atualização.
const VERSAO = "v1";
const CACHE_APP = `tte-app-${VERSAO}`;
const CACHE_VENDOR = "tte-vendor-transformers-3.8.1";

const ARQUIVOS_APP = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/translator-worker.js",
  "/manifest.webmanifest",
  "/data/expressoes.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];
const ARQUIVOS_VENDOR = [
  "/vendor/transformers.min.js",
  "/vendor/ort-wasm-simd-threaded.jsep.mjs",
  "/vendor/ort-wasm-simd-threaded.jsep.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await (await caches.open(CACHE_APP)).addAll(ARQUIVOS_APP);
    const vendor = await caches.open(CACHE_VENDOR);
    for (const url of ARQUIVOS_VENDOR) {
      if (!(await vendor.match(url))) await vendor.add(url);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const manter = new Set([CACHE_APP, CACHE_VENDOR]);
    for (const nome of await caches.keys()) {
      // "transformers-cache" guarda o modelo de tradução: nunca apagar.
      if (nome.startsWith("tte-") && !manter.has(nome)) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

function comTempoLimite(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("tempo esgotado")), ms);
    promessa.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Hugging Face etc.: o próprio tradutor cuida do cache
  if (url.pathname.startsWith("/models/")) return; // modelos: guardados pelo tradutor (transformers-cache)

  // Bibliotecas grandes: primeiro do celular, depois da rede.
  if (url.pathname.startsWith("/vendor/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VENDOR);
      const salvo = await cache.match(req, { ignoreSearch: true });
      if (salvo) return salvo;
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  // App: tenta a rede (para pegar atualizações) e, sem internet, usa a cópia guardada.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_APP);
    try {
      const resp = await comTempoLimite(fetch(req), 3500);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      const salvo = await cache.match(req, { ignoreSearch: true });
      if (salvo) return salvo;
      if (req.mode === "navigate") return (await cache.match("/index.html")) || Response.error();
      return Response.error();
    }
  })());
});
