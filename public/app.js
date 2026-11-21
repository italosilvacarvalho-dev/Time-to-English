// Time to English — módulo Traduzir (inglês ⇄ português), offline.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const guardar = {
  ler(k, padrao) { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
  gravar(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const ICONE_OUVIR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICONE_SALVAR = (cheio) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${cheio ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
const ICONE_REMOVER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';

/* ---------- Direções de tradução ---------- */
const DIRECOES = {
  "en-pt": {
    origem: "Inglês", destino: "Português",
    placeholder: "Digite em inglês…", rotulo: "Palavra ou frase em inglês",
    subDestino: "Em português",
    modeloTitulo: "Tradutor offline: inglês → português",
    inverterLabel: "Inverter: traduzir de português para inglês",
    exemplos: ["What's up?", "I'm broke", "Hang out", "No way!", "It's a piece of cake", "I'm good"],
  },
  "pt-en": {
    origem: "Português", destino: "Inglês",
    placeholder: "Digite em português…", rotulo: "Palavra ou frase em português",
    subDestino: "Em inglês",
    modeloTitulo: "Tradutor offline: português → inglês",
    inverterLabel: "Inverter: traduzir de inglês para português",
    exemplos: ["Tô morrendo de fome", "Tô duro", "Foi mal", "É moleza", "Deixa pra lá", "Quanto tempo!"],
  },
};
let direcao = guardar.ler("tte.direcao", "en-pt");
if (!DIRECOES[direcao]) direcao = "en-pt";

// Migra a marcação da versão anterior (só existia inglês → português).
if (guardar.ler("tte.modelo", null) === "pronto") {
  guardar.gravar("tte.modelo.en-pt", "pronto");
  guardar.gravar("tte.origem.en-pt", guardar.ler("tte.modelo.origem", null));
  guardar.gravar("tte.modelo", null);
  guardar.gravar("tte.modelo.origem", null);
}

/* ---------- Tema claro/escuro ---------- */
function aplicarTema(t) {
  document.documentElement.dataset.tema = t;
  $("#btn-tema").setAttribute("aria-label", t === "escuro" ? "Ativar modo claro" : "Ativar modo escuro");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "escuro" ? "#0F1115" : "#F4F5F7"));
}
$("#btn-tema").addEventListener("click", () => {
  const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  try { localStorage.setItem("tte.tema", novo); } catch (e) {}
  aplicarTema(novo);
});
aplicarTema(document.documentElement.dataset.tema || "claro");

/* ---------- Navegação entre abas ---------- */
const TITULOS = { traduzir: "Traduzir", salvas: "Salvas", falar: "Falar" };
function irPara() {
  const aba = (location.hash.slice(1) in TITULOS) ? location.hash.slice(1) : "traduzir";
  for (const nome of Object.keys(TITULOS)) $("#tela-" + nome).hidden = nome !== aba;
  document.querySelectorAll(".abas a").forEach((a) => {
    if (a.dataset.aba === aba) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("#titulo").textContent = TITULOS[aba];
  if (aba === "salvas") mostrarSalvas();
}
window.addEventListener("hashchange", irPara);

/* ---------- Pronúncia (voz do próprio celular) ---------- */
function ouvir(texto) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto.replace(/…/g, ""));
  u.lang = "en-US";
  u.rate = 0.95;
  const vozes = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  const voz = vozes.find((v) => v.lang === "en-US" && v.localService) || vozes.find((v) => v.lang === "en-US") || vozes[0];
  if (voz) u.voice = voz;
  speechSynthesis.speak(u);
}
if ("speechSynthesis" in window) speechSynthesis.getVoices();

/* ---------- Frases salvas ---------- */
let salvas = guardar.ler("tte.salvas", []);
const estaSalva = (en) => salvas.some((s) => s.en.toLowerCase() === en.toLowerCase());
function alternarSalva(en, pt) {
  if (estaSalva(en)) salvas = salvas.filter((s) => s.en.toLowerCase() !== en.toLowerCase());
  else salvas.unshift({ en, pt, quando: Date.now() });
  guardar.gravar("tte.salvas", salvas);
}
function mostrarSalvas() {
  const lista = $("#lista-salvas");
  if (!salvas.length) {
    lista.innerHTML = '<div class="vazio">Nada salvo ainda.<br>Toque no marcador de uma tradução para guardar aqui.</div>';
    return;
  }
  lista.innerHTML = salvas.map((s, i) => `
    <div class="item-salvo">
      <div class="txt"><b>${esc(s.en)}</b><span>${esc(s.pt)}</span></div>
      <button class="btn-icone sem-borda" type="button" data-ouvir="${esc(s.en)}" aria-label="Ouvir ${esc(s.en)}">${ICONE_OUVIR}</button>
      <button class="btn-icone sem-borda" type="button" data-remover="${i}" aria-label="Remover ${esc(s.en)}">${ICONE_REMOVER}</button>
    </div>`).join("");
}
$("#lista-salvas").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.ouvir) ouvir(b.dataset.ouvir);
  if (b.dataset.remover) {
    salvas.splice(Number(b.dataset.remover), 1);
    guardar.gravar("tte.salvas", salvas);
    mostrarSalvas();
  }
});

/* ---------- Dicionário de expressões (funciona offline desde o início) ---------- */
const norm = (t) => String(t || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[…?!.,;:"“”()]/g, " ").replace(/\s+/g, " ").trim();
let expressoes = [];
// Índices por idioma: forma exata -> expressão, e formas com 2+ palavras para achar dentro de frases.
const indices = { en: { exato: new Map(), frases: [] }, pt: { exato: new Map(), frases: [] } };

function indexar(lingua, forma, e) {
  const n = norm(forma);
  if (!n) return;
  const idx = indices[lingua];
  if (!idx.exato.has(n)) idx.exato.set(n, e);
  if (n.includes(" ")) idx.frases.push([n, e]);
}

async function carregarDicionario() {
  const r = await fetch("/data/expressoes.json");
  expressoes = await r.json();
  for (const e of expressoes) {
    for (const forma of [e.en, ...(e.aliases || [])]) indexar("en", forma, e);
    // "Tô sem grana / Tô duro" vira duas formas; o que está entre parênteses é explicação.
    const formasPt = String(e.pt).replace(/\([^)]*\)/g, " ").split(/\s*\/\s*|,\s*/);
    for (const forma of [...formasPt, ...(e.ptAliases || [])]) indexar("pt", forma, e);
  }
  for (const l of ["en", "pt"]) indices[l].frases.sort((a, b) => b[0].length - a[0].length);
}

/* ---------- Português de internet → português que o tradutor entende ---------- */
// O modelo aprendeu com textos mais formais: "eai", "vc", "belezinha" o confundem.
// O texto que você digitou continua aparecendo igual; só o que vai para o tradutor é ajustado.
const GIRIAS_PT = [
  [/\b(eai|eae|eaí|e ae|e ai|iai|iae)\b/gi, "e aí"],
  [/\b(vc|vcê|cê|ce)\b/gi, "você"],
  [/\bvcs\b/gi, "vocês"],
  [/\b(tb|tbm|tmb)\b/gi, "também"],
  [/\b(pq|pk)\b/gi, "porque"],
  [/\b(blz|belezinha|beleza pura)\b/gi, "beleza"],
  [/\b(td|tdo)\b/gi, "tudo"],
  [/\b(mto|mt)\b/gi, "muito"],
  [/\b(msm)\b/gi, "mesmo"],
  [/\b(hj)\b/gi, "hoje"],
  [/\b(qnd|qdo)\b/gi, "quando"],
  [/\b(obg|brigado|brigada|vlw|valeu)\b/gi, "obrigado"],
  [/\b(maninho|maninha|mano|mana|brother|bro|véi|vei|velho)\b/gi, "amigo"],
];
// Só para o tradutor (deixa a frase mais "certinha"); o dicionário já conhece estas formas.
const FORMAS_FALADAS_PT = [
  [/\b(tô|to)\b/gi, "estou"],
  [/\b(tá|ta)\b/gi, "está"],
  [/\b(pra|pro)\b/gi, "para"],
  [/\b(bora|borá)\b/gi, "vamos"],
  [/\b(q)\b/gi, "que"],
  [/\b(n|ñ)\b/gi, "não"],
];
// \b do JavaScript não entende acentos; estas fronteiras entendem.
const FRONTEIRA = (re) => new RegExp(re.source.replace(/^\\b/, "(?<![\\p{L}\\p{N}])").replace(/\\b$/, "(?![\\p{L}\\p{N}])"), "giu");
const GIRIAS_PT_U = GIRIAS_PT.map(([re, troca]) => [FRONTEIRA(re), troca]);
const FORMAS_FALADAS_PT_U = FORMAS_FALADAS_PT.map(([re, troca]) => [FRONTEIRA(re), troca]);
function ajustarPortugues(texto, paraTradutor = false) {
  let t = String(texto);
  for (const [re, troca] of GIRIAS_PT_U) t = t.replace(re, troca);
  if (paraTradutor) for (const [re, troca] of FORMAS_FALADAS_PT_U) t = t.replace(re, troca);
  return t.replace(/\s+/g, " ").trim();
}

// Se o modelo ainda assim se perder e repetir palavras ("hey, hey, hey…"), corta a repetição.
function limparRepeticao(saida, entrada) {
  let t = String(saida).trim();
  const antes = t;
  // mesma palavra ou par de palavras repetido 3+ vezes seguidas → fica uma vez só
  t = t.replace(/(\b[\p{L}'’]+(?:\s+[\p{L}'’]+)?)(?:[\s,.!?;-]+\1\b){2,}/giu, "$1");
  const longaDemais = t.split(/\s+/).length > entrada.split(/\s+/).length * 4 + 6;
  return { texto: t, duvidosa: t !== antes || longaDemais };
}

function buscarExpressoes(texto, lingua, ignorar = []) {
  const n = norm(texto);
  const idx = indices[lingua];
  const exata = idx.exato.get(n) || null;
  const dentro = [];
  const alvo = ` ${n} `;
  for (const [forma, e] of idx.frases) {
    if (e === exata || dentro.includes(e) || ignorar.includes(e)) continue;
    if (alvo.includes(` ${forma} `)) dentro.push(e);
    if (dentro.length >= 4) break;
  }
  return { exata, dentro };
}

/* ---------- Direção na tela ---------- */
function aplicarDirecao() {
  const d = DIRECOES[direcao];
  $("#lingua-origem").textContent = d.origem;
  $("#lingua-destino").textContent = d.destino;
  $("#entrada").placeholder = d.placeholder;
  $("#rotulo-entrada").textContent = d.rotulo;
  $("#btn-inverter").setAttribute("aria-label", d.inverterLabel);
  $("#modelo-titulo").textContent = d.modeloTitulo;
  mostrarExemplos("");
  atualizarCartaoModelo();
  atualizarSelo();
}

$("#btn-inverter").addEventListener("click", () => {
  const anterior = $("#cartao-traducao .pt:not(.carregando)");
  direcao = direcao === "en-pt" ? "pt-en" : "en-pt";
  guardar.gravar("tte.direcao", direcao);
  // Se já havia uma tradução, ela vira o novo texto de entrada (como nos tradutores conhecidos).
  if (anterior) $("#entrada").value = anterior.textContent;
  ajustarAltura();
  aplicarDirecao();
  $("#resultado").innerHTML = "";
  if (modeloJaBaixado(direcao)) iniciarWorker().postMessage({ tipo: "carregar", direcao, origem: origemDoModelo(direcao) });
  if ($("#entrada").value.trim()) traduzir($("#entrada").value);
});

function mostrarExemplos(ativo) {
  $("#exemplos").innerHTML = DIRECOES[direcao].exemplos.map((x) =>
    `<button type="button" class="chip" data-ex="${esc(x)}" aria-pressed="${norm(x) === norm(ativo)}">${esc(x)}</button>`).join("");
}
$("#exemplos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ex]");
  if (!b) return;
  $("#entrada").value = b.dataset.ex;
  ajustarAltura();
  traduzir(b.dataset.ex);
});

/* ---------- Tradutor offline (modelos de IA no navegador) ---------- */
let worker = null;
const modeloPronto = { "en-pt": false, "pt-en": false };
const baixando = { "en-pt": false, "pt-en": false };
let pedidoId = 0;
const pendentes = new Map();

const modeloJaBaixado = (d) => guardar.ler("tte.modelo." + d, null) === "pronto";
const origemDoModelo = (d) => guardar.ler("tte.origem." + d, null);

function iniciarWorker() {
  if (worker) return worker;
  worker = new Worker("/translator-worker.js", { type: "module" });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === "progresso") {
      if (m.direcao === direcao) mostrarProgresso(m.pct);
    } else if (m.tipo === "pronto") {
      modeloPronto[m.direcao] = true;
      baixando[m.direcao] = false;
      guardar.gravar("tte.modelo." + m.direcao, "pronto");
      guardar.gravar("tte.origem." + m.direcao, m.origem);
      atualizarCartaoModelo();
      atualizarSelo();
      const atual = $("#entrada").value.trim();
      if (m.direcao === direcao && atual && document.querySelector("[data-aguardando-modelo]")) traduzir(atual);
    } else if (m.tipo === "traducao") {
      const p = pendentes.get(m.id);
      if (p) { pendentes.delete(m.id); p.resolve(m.texto); }
    } else if (m.tipo === "erro") {
      if (m.id && pendentes.has(m.id)) { pendentes.get(m.id).reject(new Error(m.mensagem)); pendentes.delete(m.id); }
      falhaNoModelo(m.direcao, m.mensagem);
    }
  };
  return worker;
}

function pedirTraducao(texto, d) {
  iniciarWorker();
  const id = ++pedidoId;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    worker.postMessage({ tipo: "traduzir", id, texto, direcao: d, origem: origemDoModelo(d) });
  });
}

function baixarModelo() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  baixando[direcao] = true;
  atualizarCartaoModelo();
  mostrarProgresso(0);
  iniciarWorker().postMessage({ tipo: "carregar", direcao, origem: null });
}
$("#btn-baixar").addEventListener("click", baixarModelo);

function mostrarProgresso(pct) {
  $("#modelo-barra").style.width = pct + "%";
  $("#modelo-pct").textContent = pct + "%";
}
function falhaNoModelo(d, msg) {
  console.warn("Falha no tradutor:", d, msg);
  if (!d) return;
  // Se os arquivos sumiram do celular (limpeza do navegador), pede para baixar de novo.
  guardar.gravar("tte.modelo." + d, null);
  modeloPronto[d] = false;
  baixando[d] = false;
  if (d !== direcao) return;
  atualizarSelo();
  atualizarCartaoModelo();
  $("#btn-baixar").textContent = "Tentar de novo";
  $("#modelo-desc").textContent = navigator.onLine
    ? "Não deu para baixar o tradutor. Tente de novo daqui a pouco."
    : "Sem internet. Conecte-se uma vez para baixar o tradutor; depois ele funciona offline.";
  const aguardando = $("#cartao-traducao [data-aguardando-modelo]");
  if (aguardando) aguardando.outerHTML = '<p class="aviso" data-aguardando-modelo>O tradutor offline desta direção precisa ser baixado (veja o aviso abaixo).</p>';
}
function atualizarCartaoModelo() {
  const pronto = modeloPronto[direcao] || modeloJaBaixado(direcao);
  $("#cartao-modelo").hidden = pronto;
  $("#modelo-progresso").hidden = !baixando[direcao];
  $("#btn-baixar").hidden = baixando[direcao];
  $("#btn-baixar").textContent = "Baixar tradutor";
  $("#modelo-desc").textContent = baixando[direcao]
    ? "Baixando… pode continuar usando o app. Na próxima vez não precisa baixar de novo."
    : "Baixe uma vez (cerca de 115 MB, de preferência no Wi-Fi) para traduzir qualquer frase sem internet. As expressões do dicionário já funcionam offline.";
}
function atualizarSelo() {
  const selo = $("#selo-offline");
  if (modeloPronto[direcao]) {
    selo.hidden = false; selo.className = "selo selo-ok"; selo.textContent = "Offline pronto";
  } else if (!navigator.onLine) {
    selo.hidden = false; selo.className = "selo selo-alerta"; selo.textContent = "Sem internet";
  } else {
    selo.hidden = true;
  }
}
window.addEventListener("online", atualizarSelo);
window.addEventListener("offline", atualizarSelo);

/* ---------- Banco de frases reais (Tatoeba), offline ---------- */
let busca = null;
let buscaId = 0;
const buscasPendentes = new Map();
function iniciarBusca() {
  if (busca) return busca;
  busca = new Worker("/busca-worker.js");
  busca.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === "resultado") {
      const r = buscasPendentes.get(m.id);
      if (r) { buscasPendentes.delete(m.id); r(m.itens); }
    } else if (m.tipo === "status" && m.estado === "indisponivel") {
      console.warn("Banco de frases:", m.mensagem);
    }
  };
  busca.postMessage({ tipo: "iniciar" });
  return busca;
}
function buscarFrases(texto, lingua) {
  iniciarBusca();
  const id = ++buscaId;
  return new Promise((resolve) => {
    buscasPendentes.set(id, resolve);
    busca.postMessage({ tipo: "buscar", id, texto, lingua });
    setTimeout(() => { if (buscasPendentes.has(id)) { buscasPendentes.delete(id); resolve([]); } }, 20000);
  });
}
function cartaoFrases(itens) {
  const achou = itens[0].nota >= 0.95;
  return `
  <article class="cartao" id="frases-parecidas">
    <p class="rotulo">${achou ? "Frase encontrada" : "Frases parecidas"}</p>
    ${itens.map((f) => `
      <div class="frase">
        <div class="frase-txt"><span class="frase-en">${esc(f.en)}</span><span class="frase-pt">${esc(f.pt)}</span></div>
        <button class="btn-icone sem-borda" type="button" data-ouvir="${esc(f.en)}" aria-label="Ouvir ${esc(f.en)}">${ICONE_OUVIR}</button>
        ${botaoSalvar(f.en, f.pt)}
      </div>`).join("")}
    <span class="credito">Traduções feitas por pessoas · Tatoeba (CC BY 2.0 FR)</span>
  </article>`;
}

/* ---------- Resultado ---------- */
function botaoSalvar(en, pt) {
  const s = estaSalva(en);
  return `<button class="btn-icone sem-borda ${s ? "ativo" : ""}" type="button" data-salvar="${esc(en)}" data-pt="${esc(pt)}" aria-pressed="${s}" aria-label="${s ? "Remover das salvas" : "Salvar"}">${ICONE_SALVAR(s)}</button>`;
}

function cartaoExpressao(e, titulo) {
  const ptEn = direcao === "pt-en";
  return `
  <article class="cartao">
    ${titulo ? `<p class="rotulo">${esc(titulo)}</p>` : ""}
    <div class="cab">
      <div class="cab-texto">
        ${ptEn ? '<span class="sub">Em inglês</span>' : ""}
        <span class="en">${esc(e.en)}</span>
      </div>
      <div class="acoes">
        ${botaoSalvar(e.en, e.pt)}
        <button class="btn-ouvir" type="button" data-ouvir="${esc(e.en.includes("…") ? e.exEn : e.en)}" aria-label="Ouvir pronúncia">${ICONE_OUVIR}</button>
      </div>
    </div>
    <div class="cab-texto">
      <span class="sub">${ptEn ? "Significa" : "Em português"}</span>
      <p class="pt">${esc(e.pt)}</p>
    </div>
    <span class="etiqueta etiqueta-laranja">${esc(e.tag)}</span>
    <div class="cab-texto">
      <span style="font-size:13px;font-weight:600">Contexto</span>
      <p class="nota">${esc(e.nota)}</p>
    </div>
    <div class="exemplo">
      <span class="sub" style="text-transform:none;letter-spacing:0">Exemplo</span>
      <p class="ex-en">${esc(e.exEn)}</p>
      <p class="ex-pt">${esc(e.exPt)}</p>
      <button class="btn-icone sem-borda" style="align-self:flex-start;margin-left:-10px" type="button" data-ouvir="${esc(e.exEn)}" aria-label="Ouvir o exemplo">${ICONE_OUVIR}</button>
    </div>
    ${e.alt && e.alt.length ? `<div class="bloco"><span class="sub">Também se diz</span><div class="chips">${e.alt.map((a) => `<span class="chip selecionavel">${esc(a)}</span>`).join("")}</div></div>` : ""}
  </article>`;
}

// Cartão da tradução de uma frase livre.
// Inglês → português: o inglês (que você digitou) em cima, com som; a tradução embaixo.
// Português → inglês: o português em cima; a tradução em inglês embaixo, grande e com som.
function cartaoTraducao(texto, conteudo) {
  const ptEn = direcao === "pt-en";
  const topo = ptEn
    ? `<div class="cab-texto"><span class="sub">Você escreveu</span><span class="selecionavel" style="font-size:17px;line-height:1.4;color:var(--text2);overflow-wrap:anywhere">${esc(texto)}</span></div>`
    : `<div class="cab-texto"><span class="en">${esc(texto)}</span></div>`;
  return `
  <article class="cartao" id="cartao-traducao">
    <div class="cab">
      ${topo}
      <div class="acoes" id="acoes-traducao">
        ${ptEn ? "" : `<button class="btn-ouvir" type="button" data-ouvir="${esc(texto)}" aria-label="Ouvir pronúncia">${ICONE_OUVIR}</button>`}
      </div>
    </div>
    <div class="cab-texto">
      <span class="sub">${DIRECOES[direcao].subDestino}</span>
      ${conteudo}
    </div>
  </article>`;
}

let ultimaBusca = 0;
async function traduzir(textoBruto) {
  const texto = textoBruto.trim();
  if (!texto) return;
  const minhaBusca = ++ultimaBusca;
  const d = direcao;
  const ptEn = d === "pt-en";
  mostrarExemplos(texto);
  let { exata, dentro } = buscarExpressoes(texto, ptEn ? "pt" : "en");
  if (ptEn) {
    // Tenta também com as gírias de internet ajustadas ("eai" → "e aí", "belezinha" → "beleza").
    const ajustada = buscarExpressoes(ajustarPortugues(texto), "pt", dentro);
    exata = exata || ajustada.exata;
    dentro = [...dentro, ...ajustada.dentro.filter((e) => e !== exata)].slice(0, 4);
  }
  const res = $("#resultado");
  const frasesP = buscarFrases(ptEn ? ajustarPortugues(texto, true) : texto, ptEn ? "pt" : "en");
  const anexarFrases = () => frasesP.then((itens) => {
    if (minhaBusca !== ultimaBusca || !itens.length) return;
    res.insertAdjacentHTML("beforeend", cartaoFrases(itens));
  });
  const tituloExtra = ptEn ? "Como falam na rua" : "Expressão nesta frase";

  // 1) A expressão está no dicionário: mostra direto, com contexto.
  if (exata) {
    res.innerHTML = cartaoExpressao(exata) + dentro.map((e) => cartaoExpressao(e, "Também nesta frase")).join("");
    anexarFrases();
    return;
  }

  // 2) Frase livre: tradutor offline + expressões encontradas.
  const extras = dentro.map((e) => cartaoExpressao(e, tituloExtra)).join("");

  if (!modeloPronto[d] && !modeloJaBaixado(d) && !baixando[d]) {
    res.innerHTML = cartaoTraducao(texto,
      `<p class="aviso" data-aguardando-modelo>Para traduzir frases livres nesta direção, baixe o tradutor offline (só uma vez, cerca de 115 MB).${dentro.length ? " Enquanto isso, veja as expressões desta frase." : ""}</p>
       <button class="btn-secundario" type="button" data-baixar>Baixar tradutor</button>`) + extras;
    anexarFrases();
    return;
  }

  res.innerHTML = cartaoTraducao(texto,
    `<p class="pt carregando" data-aguardando-modelo>${modeloPronto[d] ? "Traduzindo…" : "Preparando o tradutor…"}</p>`) + extras;
  anexarFrases();

  try {
    const bruta = await pedirTraducao(ptEn ? ajustarPortugues(texto, true) : texto, d);
    if (minhaBusca !== ultimaBusca || d !== direcao) return;
    const alvo = $("#cartao-traducao .carregando");
    if (!alvo) return;
    const { texto: traducao, duvidosa } = limparRepeticao(bruta, texto);
    alvo.outerHTML = `<p class="pt">${esc(traducao)}</p>` + (duvidosa
      ? `<p class="aviso">O tradutor offline se confundiu com essa frase. Tente escrever de um jeito mais simples ou em partes menores.</p>`
      : "");
    const en = ptEn ? traducao : texto;
    const pt = ptEn ? texto : traducao;
    $("#acoes-traducao").insertAdjacentHTML("afterbegin",
      botaoSalvar(en, pt) + (ptEn ? `<button class="btn-ouvir" type="button" data-ouvir="${esc(traducao)}" aria-label="Ouvir pronúncia">${ICONE_OUVIR}</button>` : ""));
    // Português → inglês: procura expressões do dia a dia também no inglês traduzido.
    if (ptEn) {
      const maisExpressoes = buscarExpressoes(traducao, "en", dentro);
      const novas = [maisExpressoes.exata, ...maisExpressoes.dentro].filter((e) => e && !dentro.includes(e));
      if (novas.length) {
        const html = novas.map((e) => cartaoExpressao(e, tituloExtra)).join("");
        const frases = $("#frases-parecidas");
        if (frases) frases.insertAdjacentHTML("beforebegin", html); else res.insertAdjacentHTML("beforeend", html);
      }
    }
  } catch (err) {
    if (minhaBusca !== ultimaBusca) return;
    const alvo = $("#cartao-traducao .carregando");
    if (alvo) alvo.outerHTML = `<p class="aviso">Não consegui traduzir agora. Tente de novo.</p>`;
    console.warn(err);
  }
}

$("#resultado").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.ouvir) ouvir(b.dataset.ouvir);
  if ("baixar" in b.dataset) {
    b.remove();
    baixarModelo();
    $("#cartao-modelo").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (b.dataset.salvar) {
    alternarSalva(b.dataset.salvar, b.dataset.pt);
    b.outerHTML = botaoSalvar(b.dataset.salvar, b.dataset.pt);
  }
});

/* ---------- Campo de texto ---------- */
const entrada = $("#entrada");
function ajustarAltura() { entrada.style.height = "auto"; entrada.style.height = Math.min(entrada.scrollHeight, 160) + "px"; }
entrada.addEventListener("input", ajustarAltura);
entrada.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); traduzir(entrada.value); }
});
$("#form-traduzir").addEventListener("submit", (e) => { e.preventDefault(); entrada.blur(); traduzir(entrada.value); });

/* ---------- Início ---------- */
(async function iniciar() {
  irPara();
  aplicarDirecao();
  try { await carregarDicionario(); } catch (e) { console.warn("Dicionário indisponível", e); }
  iniciarBusca(); // baixa (na primeira vez) e prepara o banco de frases em segundo plano

  // Já baixou o tradutor desta direção? Carrega do armazenamento do celular, sem internet.
  if (modeloJaBaixado(direcao)) iniciarWorker().postMessage({ tipo: "carregar", direcao, origem: origemDoModelo(direcao) });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("Service worker:", e));
  }
})();
