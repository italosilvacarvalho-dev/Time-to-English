// Busca no banco de frases (Tatoeba) sem travar a tela.
// Guarda o arquivo no celular (Cache Storage "tte-dados") para funcionar offline.

const URL_FRASES = "/dados/frases-pt-en.tsv";
const CACHE = "tte-dados";

let pares = [];                 // [[pt, en], ...]
const idx = { pt: null, en: null };
let pronto = null;

const semAcento = (t) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "");
const tokens = (t) => semAcento(String(t).toLowerCase()).replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);

function indexar(lingua, col) {
  const postings = new Map();
  const pesoDoc = new Float32Array(pares.length);
  const toksDoc = new Array(pares.length);
  pares.forEach((p, i) => {
    const ts = [...new Set(tokens(p[col]))];
    toksDoc[i] = ts;
    for (const t of ts) {
      let l = postings.get(t);
      if (!l) postings.set(t, (l = []));
      l.push(i);
    }
  });
  const N = pares.length;
  const idf = new Map();
  for (const [t, l] of postings) idf.set(t, Math.log(1 + N / l.length));
  toksDoc.forEach((ts, i) => { let s = 0; for (const t of ts) s += idf.get(t); pesoDoc[i] = s; });
  idx[lingua] = { postings, idf, pesoDoc };
}

async function obterTexto() {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) {}
  const salvo = cache ? await cache.match(URL_FRASES) : null;
  if (salvo) {
    // Usa o que já está no celular e, se houver internet, atualiza em segundo plano para a próxima vez.
    fetch(URL_FRASES, { cache: "no-cache" })
      .then((r) => { if (r.ok && cache) cache.put(URL_FRASES, r); })
      .catch(() => {});
    return salvo.text();
  }
  const r = await fetch(URL_FRASES);
  if (!r.ok) throw new Error("Banco de frases indisponível (" + r.status + ")");
  if (cache) await cache.put(URL_FRASES, r.clone());
  return r.text();
}

function iniciar() {
  if (pronto) return pronto;
  pronto = (async () => {
    const texto = await obterTexto();
    pares = [];
    for (const linha of texto.split("\n")) {
      const tab = linha.indexOf("\t");
      if (tab > 0) pares.push([linha.slice(0, tab), linha.slice(tab + 1)]);
    }
    indexar("pt", 0);
    indexar("en", 1);
    self.postMessage({ tipo: "status", estado: "pronto", total: pares.length });
  })().catch((e) => {
    pronto = null;
    self.postMessage({ tipo: "status", estado: "indisponivel", mensagem: String(e.message || e) });
    throw e;
  });
  return pronto;
}

// Pontua cada frase pelas palavras em comum, dando mais peso às palavras raras.
// Combina "quanto da sua frase aparece nela" com "quanto dela é a sua frase".
function buscar(texto, lingua, limite = 3) {
  const I = idx[lingua];
  if (!I) return [];
  const qs = [...new Set(tokens(texto))].filter((t) => I.idf.has(t));
  if (!qs.length) return [];
  const pesoQ = qs.reduce((s, t) => s + I.idf.get(t), 0);
  const totalQ = [...new Set(tokens(texto))].reduce((s, t) => s + (I.idf.get(t) || Math.log(1 + pares.length)), 0);
  const pontos = new Map();
  for (const t of qs) {
    const w = I.idf.get(t);
    const l = I.postings.get(t);
    if (l.length > 20000 && qs.length > 1) continue; // palavras comuníssimas ("o", "the") não puxam candidatos sozinhas
    for (const i of l) pontos.set(i, (pontos.get(i) || 0) + w);
  }
  const res = [];
  for (const [i, s] of pontos) {
    const cobreBusca = s / totalQ;
    const cobreFrase = s / I.pesoDoc[i];
    const nota = 0.6 * cobreBusca + 0.4 * cobreFrase;
    if (nota >= 0.45 && s >= pesoQ * 0.5) res.push([nota, i]);
  }
  res.sort((a, b) => b[0] - a[0] || pares[a[1]][0].length - pares[b[1]][0].length);
  return res.slice(0, limite).map(([nota, i]) => ({ pt: pares[i][0], en: pares[i][1], nota: Math.round(nota * 100) / 100 }));
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.tipo === "iniciar") await iniciar();
    else if (m.tipo === "buscar") {
      await iniciar();
      self.postMessage({ tipo: "resultado", id: m.id, itens: buscar(m.texto, m.lingua, m.limite) });
    }
  } catch (e) {
    if (m.id) self.postMessage({ tipo: "resultado", id: m.id, itens: [] });
  }
};
