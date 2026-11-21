// Reconhecimento de voz offline (Whisper base), fora da tela principal.
import { pipeline, env } from "/vendor/transformers.min.js";

const MODELO = "Xenova/whisper-base";
// Encoder completo (melhor precisão) + decoder compactado: ~140 MB baixados uma vez.
const DTYPE = { encoder_model: "fp32", decoder_model_merged: "q8" };
const TAMANHO_ESTIMADO = 140_000_000;

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = "/vendor/";

let transcritor = null;
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

async function descobrirOrigem() {
  try {
    const r = await fetch(`/models/${MODELO}/config.json`, { method: "HEAD", cache: "no-store" });
    if (r.ok) return "r2";
  } catch (e) { /* sem internet ou sem R2 */ }
  return "huggingface";
}

function carregar(origemSalva) {
  if (transcritor) return Promise.resolve(transcritor);
  if (carregando) return carregando;
  carregando = (async () => {
    const origem = origemSalva || (await descobrirOrigem());
    usarOrigem(origem);
    const arquivos = new Map();
    transcritor = await pipeline("automatic-speech-recognition", MODELO, {
      dtype: DTYPE,
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.file) {
          arquivos.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let lido = 0, total = 0;
          for (const a of arquivos.values()) { lido += a.loaded; total += a.total; }
          self.postMessage({ tipo: "progresso", pct: Math.min(99, Math.round((lido / Math.max(total, TAMANHO_ESTIMADO)) * 100)) });
        }
      },
    });
    self.postMessage({ tipo: "pronto", origem });
    return transcritor;
  })();
  carregando.catch(() => { carregando = null; });
  return carregando;
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.tipo === "carregar") {
      await carregar(m.origem);
    } else if (m.tipo === "transcrever") {
      const t = await carregar(m.origem);
      const saida = await t(m.audio, {
        language: m.lingua === "en" ? "english" : "portuguese",
        task: "transcribe",
        no_repeat_ngram_size: 3,
        max_new_tokens: 120,
      });
      const texto = String((saida && saida.text) || "").trim();
      self.postMessage({ tipo: "texto", id: m.id, texto });
    }
  } catch (e) {
    self.postMessage({ tipo: "erro", id: m.id, mensagem: String((e && e.message) || e) });
  }
};
