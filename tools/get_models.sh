#!/usr/bin/env bash
# Çeviri modellerinin ONNX dosyalarını indirir (~1 GB). GitHub 100 MB üstü dosya
# kabul etmediği için depoda yalnızca config/tokenizer dosyaları var.
# Kullanım: bash tools/get_models.sh
set -euo pipefail
cd "$(dirname "$0")/.."
get() {  # $1 = HF deposu, $2 = hedef klasör
  for f in encoder_model_quantized.onnx decoder_model_merged_quantized.onnx; do
    out="models/$2/onnx/$f"
    [ -s "$out" ] && { echo "var: $out"; continue; }
    mkdir -p "models/$2/onnx"
    echo "indiriliyor: $out"
    curl -fL --retry 5 -C - -o "$out" "https://huggingface.co/$1/resolve/main/onnx/$f"
  done
}
get onnx-community/opus-mt-tc-big-en-tr en-tr
get onnx-community/opus-mt-tc-big-tr-en tr-en
echo "tamam"
