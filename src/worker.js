// Cloudflare Worker: serve o app (arquivos de /public) e os modelos de IA guardados no R2.
//   /models/<caminho>  -> arquivo do bucket R2 (binding MODELS)
//   qualquer outro     -> arquivos estáticos do app (binding ASSETS)

const TIPOS = {
  json: "application/json; charset=utf-8",
  onnx: "application/octet-stream",
  spm: "application/octet-stream",
  txt: "text/plain; charset=utf-8",
  bin: "application/octet-stream",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/models/")) return servirModelo(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function servirModelo(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Método não permitido", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  if (!env.MODELS) return new Response("R2 não configurado", { status: 503 });

  const chave = decodeURIComponent(url.pathname.slice("/models/".length));
  if (!chave || chave.includes("..")) return new Response("Não encontrado", { status: 404 });

  const objeto = request.method === "HEAD"
    ? await env.MODELS.head(chave)
    : await env.MODELS.get(chave, { range: request.headers, onlyIf: request.headers });

  if (!objeto) return new Response("Não encontrado", { status: 404 });

  const headers = new Headers();
  objeto.writeHttpMetadata(headers);
  const ext = chave.split(".").pop().toLowerCase();
  if (!headers.has("content-type")) headers.set("content-type", TIPOS[ext] || "application/octet-stream");
  headers.set("etag", objeto.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("cross-origin-resource-policy", "same-origin");

  // HEAD, ou condição If-None-Match atendida: sem corpo.
  if (request.method === "HEAD") {
    headers.set("content-length", String(objeto.size));
    return new Response(null, { status: 200, headers });
  }
  if (!("body" in objeto) || !objeto.body) {
    return new Response(null, { status: 304, headers });
  }

  if (objeto.range && request.headers.has("range")) {
    const r = objeto.range;
    const inicio = "offset" in r ? r.offset : "suffix" in r ? objeto.size - r.suffix : 0;
    const tamanho = "length" in r ? r.length : objeto.size - inicio;
    headers.set("content-range", `bytes ${inicio}-${inicio + tamanho - 1}/${objeto.size}`);
    headers.set("content-length", String(tamanho));
    return new Response(objeto.body, { status: 206, headers });
  }

  headers.set("content-length", String(objeto.size));
  return new Response(objeto.body, { status: 200, headers });
}
