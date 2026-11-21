#!/usr/bin/env bash
# Baixa os modelos de IA do Hugging Face e envia para o bucket R2.
# Rodar uma vez (ou quando trocar de modelo). Precisa estar logado: `npx wrangler login`
# ou ter CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID definidos.
set -euo pipefail

BUCKET="${BUCKET:-time-to-english-modelos}"

# Tradutores (inglês → português e português → inglês)
TRADUTOR=(
  config.json
  generation_config.json
  tokenizer.json
  tokenizer_config.json
  special_tokens_map.json
  onnx/encoder_model_quantized.onnx
  onnx/decoder_model_merged_quantized.onnx
)
# Reconhecimento de voz (Whisper base)
VOZ=(
  config.json
  generation_config.json
  preprocessor_config.json
  tokenizer.json
  tokenizer_config.json
  special_tokens_map.json
  added_tokens.json
  normalizer.json
  onnx/encoder_model.onnx
  onnx/decoder_model_merged_quantized.onnx
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

enviar() {
  local MODELO="$1"; shift
  for arq in "$@"; do
    echo "↓ $MODELO/$arq"
    mkdir -p "$TMP/$MODELO/$(dirname "$arq")"
    curl -fL --retry 3 -o "$TMP/$MODELO/$arq" "https://huggingface.co/$MODELO/resolve/main/$arq"
    case "$arq" in
      *.json) tipo="application/json" ;;
      *) tipo="application/octet-stream" ;;
    esac
    echo "↑ r2://$BUCKET/$MODELO/$arq"
    npx --yes wrangler@4 r2 object put "$BUCKET/$MODELO/$arq" --file "$TMP/$MODELO/$arq" --content-type "$tipo" --remote
    rm -f "$TMP/$MODELO/$arq"
  done
}

# Escolha o que enviar com a variável MODELOS (padrão: todos). Ex.: MODELOS=voz
MODELOS="${MODELOS:-todos}"
if [[ "$MODELOS" == "todos" || "$MODELOS" == *tradutor* ]]; then
  enviar Xenova/opus-mt-en-ROMANCE "${TRADUTOR[@]}"
  enviar Xenova/opus-mt-ROMANCE-en "${TRADUTOR[@]}"
fi
if [[ "$MODELOS" == "todos" || "$MODELOS" == *voz* ]]; then
  enviar Xenova/whisper-base "${VOZ[@]}"
fi

echo "Pronto! Modelos enviados para o R2 ($BUCKET)."
