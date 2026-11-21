// Roda o modelo de tradução fora da tela principal, para o app não travar.
import { pipeline, env } from "/vendor/transformers.min.js";

const MODELO = "Xenova/opus-mt-en-ROMANCE";
// Arquivos baixados na primeira vez (encoder + decoder quantizados + tokenizer): ~119 MB.
const TAMANHO_ESTIMADO = 119_300_000;

env.allowLocalModels = false;
env.useBrowserCache = true; // guarda os arquivos no celular (Cache Storage) para uso offline
env.backends.onnx.wasm.wasmPaths = "/vendor/";

let tradutor = null;
let carregando = null;

function usarOrigem(origem) {
  if (origem === "r2") {
    env.remoteHost = self.location.origin + "/models/";
    env.remotePathTemplate = "{model}/";
  } else {
    env.remoteHost = "https://huggingface.co/";
    env.remotePathTemplate = "{model}/resolve/{revision}/";
  }
}

// Prefere o R2 (mesmo endereço do app). Se o R2 ainda não tiver os modelos, usa o Hugging Face.
async function descobrirOrigem() {
  try {
    const r = await fetch(`/models/${MODELO}/config.json`, { method: "HEAD", cache: "no-store" });
    if (r.ok) return "r2";
  } catch (e) { /* sem internet ou sem R2 */ }
  return "huggingface";
}

async function carregar(origemSalva) {
  if (tradutor) return tradutor;
  if (carregando) return carregando;
  carregando = (async () => {
    const origem = origemSalva || (await descobrirOrigem());
    usarOrigem(origem);
    const arquivos = new Map();
    tradutor = await pipeline("translation", MODELO, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.file) {
          arquivos.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let lido = 0, total = 0;
          for (const a of arquivos.values()) { lido += a.loaded; total += a.total; }
          const pct = Math.min(99, Math.round((lido / Math.max(total, TAMANHO_ESTIMADO)) * 100));
          self.postMessage({ tipo: "progresso", pct });
        }
      },
    });
    self.postMessage({ tipo: "pronto", origem });
    return tradutor;
  })();
  try {
    return await carregando;
  } catch (e) {
    carregando = null;
    throw e;
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.tipo === "carregar") {
      await carregar(msg.origem);
    } else if (msg.tipo === "traduzir") {
      const t = await carregar(msg.origem);
      // ">>pt_BR<<" diz ao modelo para traduzir para português do Brasil.
      const saida = await t(">>pt_BR<< " + msg.texto, { max_new_tokens: 256 });
      self.postMessage({ tipo: "traducao", id: msg.id, texto: saida[0].translation_text });
    }
  } catch (e) {
    self.postMessage({ tipo: "erro", id: msg.id, mensagem: String((e && e.message) || e) });
  }
};
