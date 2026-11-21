#!/usr/bin/env bash
# Baixa os modelos de tradução do Hugging Face e envia para o bucket R2.
# Rodar uma vez (ou quando trocar de modelo). Precisa estar logado: `npx wrangler login`
# ou ter CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID definidos.
set -euo pipefail

BUCKET="${BUCKET:-time-to-english-modelos}"
# inglês → português e português → inglês
MODELOS=(
  Xenova/opus-mt-en-ROMANCE
  Xenova/opus-mt-ROMANCE-en
)
ARQUIVOS=(
  config.json
  generation_config.json
  tokenizer.json
  tokenizer_config.json
  special_tokens_map.json
  onnx/encoder_model_quantized.onnx
  onnx/decoder_model_merged_quantized.onnx
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for MODELO in "${MODELOS[@]}"; do
  for arq in "${ARQUIVOS[@]}"; do
    echo "↓ $MODELO/$arq"
    mkdir -p "$TMP/$MODELO/$(dirname "$arq")"
    curl -fL --retry 3 -o "$TMP/$MODELO/$arq" "https://huggingface.co/$MODELO/resolve/main/$arq"
    case "$arq" in
      *.json) tipo="application/json" ;;
      *) tipo="application/octet-stream" ;;
    esac
    echo "↑ r2://$BUCKET/$MODELO/$arq"
    npx --yes wrangler@4 r2 object put "$BUCKET/$MODELO/$arq" --file "$TMP/$MODELO/$arq" --content-type "$tipo" --remote
  done
done

echo "Pronto! Modelos enviados para o R2 ($BUCKET)."
