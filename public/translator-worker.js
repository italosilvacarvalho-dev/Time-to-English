// Roda os modelos de tradução fora da tela principal, para o app não travar.
import { pipeline, env } from "/vendor/transformers.min.js";

// Cada direção usa um modelo. O inglês→português precisa da etiqueta do idioma de destino.
const MODELOS = {
  "en-pt": { id: "Xenova/opus-mt-en-ROMANCE", prefixo: ">>pt_BR<< " },
  "pt-en": { id: "Xenova/opus-mt-ROMANCE-en", prefixo: "" },
};
// Arquivos baixados na primeira vez de cada modelo (encoder + decoder quantizados + tokenizer): ~119 MB.
const TAMANHO_ESTIMADO = 119_300_000;

env.allowLocalModels = false;
env.useBrowserCache = true; // guarda os arquivos no celular (Cache Storage) para uso offline
env.backends.onnx.wasm.wasmPaths = "/vendor/";

const prontos = new Map();   // direção -> tradutor
const carregando = new Map(); // direção -> promessa
let fila = Promise.resolve(); // carrega um modelo de cada vez (a origem é uma configuração global)

function usarOrigem(origem) {
  if (origem === "r2") {
    env.remoteHost = self.location.origin + "/models/";
    env.remotePathTemplate = "{model}/";
  } else {
    env.remoteHost = "https://huggingface.co/";
    env.remotePathTemplate = "{model}/resolve/{revision}/";
  }
}

// Prefere o R2 (mesmo endereço do app). Se o R2 não tiver o modelo, usa o Hugging Face.
async function descobrirOrigem(id) {
  try {
    const r = await fetch(`/models/${id}/config.json`, { method: "HEAD", cache: "no-store" });
    if (r.ok) return "r2";
  } catch (e) { /* sem internet ou sem R2 */ }
  return "huggingface";
}

function carregar(direcao, origemSalva) {
  if (prontos.has(direcao)) return Promise.resolve(prontos.get(direcao));
  if (carregando.has(direcao)) return carregando.get(direcao);
  const modelo = MODELOS[direcao];
  if (!modelo) return Promise.reject(new Error("Direção desconhecida: " + direcao));

  const promessa = (fila = fila.catch(() => {}).then(async () => {
    const origem = origemSalva || (await descobrirOrigem(modelo.id));
    usarOrigem(origem);
    const arquivos = new Map();
    const tradutor = await pipeline("translation", modelo.id, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.file) {
          arquivos.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let lido = 0, total = 0;
          for (const a of arquivos.values()) { lido += a.loaded; total += a.total; }
          const pct = Math.min(99, Math.round((lido / Math.max(total, TAMANHO_ESTIMADO)) * 100));
          self.postMessage({ tipo: "progresso", direcao, pct });
        }
      },
    });
    prontos.set(direcao, tradutor);
    self.postMessage({ tipo: "pronto", direcao, origem });
    return tradutor;
  }));

  carregando.set(direcao, promessa);
  promessa.catch(() => carregando.delete(direcao));
  return promessa;
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.tipo === "carregar") {
      await carregar(msg.direcao, msg.origem);
    } else if (msg.tipo === "traduzir") {
      const t = await carregar(msg.direcao, msg.origem);
      const saida = await t(MODELOS[msg.direcao].prefixo + msg.texto, { max_new_tokens: 256 });
      self.postMessage({ tipo: "traducao", id: msg.id, texto: saida[0].translation_text });
    }
  } catch (e) {
    self.postMessage({ tipo: "erro", id: msg.id, direcao: msg.direcao, mensagem: String((e && e.message) || e) });
  }
};
