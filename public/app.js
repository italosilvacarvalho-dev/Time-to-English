// Time to English — módulo Traduzir (inglês → português), offline.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const guardar = {
  ler(k, padrao) { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const ICONE_OUVIR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICONE_SALVAR = (cheio) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${cheio ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
const ICONE_REMOVER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';

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
const indice = new Map(); // forma normalizada -> expressão
const indiceFrases = []; // formas com 2+ palavras, para achar dentro de frases

async function carregarDicionario() {
  const r = await fetch("/data/expressoes.json");
  expressoes = await r.json();
  for (const e of expressoes) {
    for (const forma of [e.en, ...(e.aliases || [])]) {
      const n = norm(forma);
      if (!n) continue;
      if (!indice.has(n)) indice.set(n, e);
      if (n.includes(" ")) indiceFrases.push([n, e]);
    }
  }
  indiceFrases.sort((a, b) => b[0].length - a[0].length);
}

function buscarExpressoes(texto) {
  const n = norm(texto);
  const exata = indice.get(n) || null;
  const dentro = [];
  const alvo = ` ${n} `;
  for (const [forma, e] of indiceFrases) {
    if (e === exata || dentro.includes(e)) continue;
    if (alvo.includes(` ${forma} `)) dentro.push(e);
    if (dentro.length >= 4) break;
  }
  return { exata, dentro };
}

const EXEMPLOS = ["What's up?", "I'm broke", "Hang out", "No way!", "It's a piece of cake", "I'm good"];
function mostrarExemplos(ativo) {
  $("#exemplos").innerHTML = EXEMPLOS.map((x) =>
    `<button type="button" class="chip" data-ex="${esc(x)}" aria-pressed="${norm(x) === norm(ativo)}">${esc(x)}</button>`).join("");
}
$("#exemplos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ex]");
  if (!b) return;
  $("#entrada").value = b.dataset.ex;
  ajustarAltura();
  traduzir(b.dataset.ex);
});

/* ---------- Tradutor offline (modelo de IA no navegador) ---------- */
let worker = null;
let modeloPronto = false;
let modeloOrigem = guardar.ler("tte.modelo.origem", null);
let pedidoId = 0;
const pendentes = new Map();

function iniciarWorker() {
  if (worker) return worker;
  worker = new Worker("/translator-worker.js", { type: "module" });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === "progresso") mostrarProgresso(m.pct);
    else if (m.tipo === "pronto") {
      modeloPronto = true;
      modeloOrigem = m.origem;
      guardar.gravar("tte.modelo", "pronto");
      guardar.gravar("tte.modelo.origem", m.origem);
      atualizarCartaoModelo();
      atualizarSelo();
      const atual = $("#entrada").value.trim();
      if (atual && document.querySelector("[data-aguardando-modelo]")) traduzir(atual);
    } else if (m.tipo === "traducao") {
      const p = pendentes.get(m.id);
      if (p) { pendentes.delete(m.id); p.resolve(m.texto); }
    } else if (m.tipo === "erro") {
      if (m.id && pendentes.has(m.id)) { pendentes.get(m.id).reject(new Error(m.mensagem)); pendentes.delete(m.id); }
      else falhaNoDownload(m.mensagem);
    }
  };
  return worker;
}

function pedirTraducao(texto) {
  iniciarWorker();
  const id = ++pedidoId;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    worker.postMessage({ tipo: "traduzir", id, texto, origem: modeloOrigem });
  });
}

function baixarModelo() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  $("#btn-baixar").hidden = true;
  $("#modelo-progresso").hidden = false;
  $("#modelo-desc").textContent = "Baixando… pode continuar usando o app. Na próxima vez não precisa baixar de novo.";
  mostrarProgresso(0);
  iniciarWorker().postMessage({ tipo: "carregar", origem: null });
}
$("#btn-baixar").addEventListener("click", baixarModelo);

function mostrarProgresso(pct) {
  $("#modelo-barra").style.width = pct + "%";
  $("#modelo-pct").textContent = pct + "%";
}
function falhaNoDownload(msg) {
  console.warn("Falha no tradutor:", msg);
  // Se os arquivos sumiram do celular (limpeza do navegador), pede para baixar de novo.
  guardar.gravar("tte.modelo", null);
  modeloPronto = false;
  atualizarSelo();
  const aguardando = $("#cartao-traducao [data-aguardando-modelo]");
  if (aguardando) aguardando.outerHTML = '<p class="aviso" data-aguardando-modelo>O tradutor offline precisa ser baixado de novo (veja o aviso abaixo).</p>';
  $("#cartao-modelo").hidden = false;
  $("#modelo-progresso").hidden = true;
  $("#btn-baixar").hidden = false;
  $("#btn-baixar").textContent = "Tentar de novo";
  $("#modelo-desc").textContent = navigator.onLine
    ? "Não deu para baixar o tradutor. Tente de novo daqui a pouco."
    : "Sem internet. Conecte-se uma vez para baixar o tradutor; depois ele funciona offline.";
}
function atualizarCartaoModelo() {
  const jaBaixado = guardar.ler("tte.modelo", null) === "pronto";
  $("#cartao-modelo").hidden = modeloPronto || jaBaixado;
}
function atualizarSelo() {
  const selo = $("#selo-offline");
  if (modeloPronto) {
    selo.hidden = false; selo.className = "selo selo-ok"; selo.textContent = "Offline pronto";
  } else if (!navigator.onLine) {
    selo.hidden = false; selo.className = "selo selo-alerta"; selo.textContent = "Sem internet";
  } else {
    selo.hidden = true;
  }
}
window.addEventListener("online", atualizarSelo);
window.addEventListener("offline", atualizarSelo);

/* ---------- Resultado ---------- */
function botaoSalvar(en, pt) {
  const s = estaSalva(en);
  return `<button class="btn-icone sem-borda ${s ? "ativo" : ""}" type="button" data-salvar="${esc(en)}" data-pt="${esc(pt)}" aria-pressed="${s}" aria-label="${s ? "Remover das salvas" : "Salvar"}">${ICONE_SALVAR(s)}</button>`;
}

function cartaoExpressao(e, titulo) {
  return `
  <article class="cartao">
    ${titulo ? `<p class="rotulo">${esc(titulo)}</p>` : ""}
    <div class="cab">
      <div class="cab-texto"><span class="en">${esc(e.en)}</span></div>
      <div class="acoes">
        ${botaoSalvar(e.en, e.pt)}
        <button class="btn-ouvir" type="button" data-ouvir="${esc(e.exEn && e.en.includes("…") ? e.exEn : e.en)}" aria-label="Ouvir pronúncia">${ICONE_OUVIR}</button>
      </div>
    </div>
    <div class="cab-texto">
      <span class="sub">Em português</span>
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
    ${e.alt && e.alt.length ? `<div class="bloco"><span class="sub">Também se diz</span><div class="chips">${e.alt.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div></div>` : ""}
  </article>`;
}

function cartaoTraducao(en, conteudoPt) {
  return `
  <article class="cartao" id="cartao-traducao">
    <div class="cab">
      <div class="cab-texto"><span class="en">${esc(en)}</span></div>
      <div class="acoes" id="acoes-traducao">
        <button class="btn-ouvir" type="button" data-ouvir="${esc(en)}" aria-label="Ouvir pronúncia">${ICONE_OUVIR}</button>
      </div>
    </div>
    <div class="cab-texto">
      <span class="sub">Em português</span>
      ${conteudoPt}
    </div>
  </article>`;
}

let ultimaBusca = 0;
async function traduzir(textoBruto) {
  const texto = textoBruto.trim();
  if (!texto) return;
  const minhaBusca = ++ultimaBusca;
  mostrarExemplos(texto);
  const { exata, dentro } = buscarExpressoes(texto);
  const res = $("#resultado");

  // 1) A expressão está no dicionário: mostra direto, com contexto.
  if (exata) {
    res.innerHTML = cartaoExpressao(exata) + dentro.map((e) => cartaoExpressao(e, "Também nesta frase")).join("");
    return;
  }

  // 2) Frase livre: tradutor offline + expressões encontradas dentro dela.
  const extras = dentro.map((e) => cartaoExpressao(e, "Expressão nesta frase")).join("");
  const jaBaixado = guardar.ler("tte.modelo", null) === "pronto";

  if (!modeloPronto && !jaBaixado) {
    res.innerHTML = cartaoTraducao(texto,
      `<p class="aviso" data-aguardando-modelo>Para traduzir frases livres, baixe o tradutor offline (só uma vez, cerca de 115 MB).${dentro.length ? " Enquanto isso, veja as expressões desta frase." : ""}</p>
       <button class="btn-secundario" type="button" data-baixar>Baixar tradutor</button>`) + extras;
    return;
  }

  res.innerHTML = cartaoTraducao(texto,
    `<p class="pt carregando" data-aguardando-modelo>${modeloPronto ? "Traduzindo…" : "Preparando o tradutor…"}</p>`) + extras;

  try {
    const pt = await pedirTraducao(texto);
    if (minhaBusca !== ultimaBusca) return;
    const alvo = $("#cartao-traducao .carregando");
    if (alvo) {
      alvo.outerHTML = `<p class="pt">${esc(pt)}</p>`;
      $("#acoes-traducao").insertAdjacentHTML("afterbegin", botaoSalvar(texto, pt));
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
    $("#cartao-modelo").hidden = false;
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
  mostrarExemplos("");
  atualizarCartaoModelo();
  atualizarSelo();
  try { await carregarDicionario(); } catch (e) { console.warn("Dicionário indisponível", e); }

  // Já baixou o tradutor antes? Carrega do armazenamento do celular, sem internet.
  if (guardar.ler("tte.modelo", null) === "pronto") iniciarWorker().postMessage({ tipo: "carregar", origem: modeloOrigem });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("Service worker:", e));
  }
})();
