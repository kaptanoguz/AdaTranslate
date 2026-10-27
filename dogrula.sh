#!/usr/bin/env bash
# Ada Translate doğrulama: sözdizimi → paket → veri → fonksiyonel duman testi.
# Kullanım: ./dogrula.sh   (herhangi bir adım düşerse çıkış kodu 1)
set -euo pipefail
cd "$(dirname "$0")"

echo "== sözdizimi"
for f in js/app.js js/search.js sw.js electron-main.js tools/smoke.js; do node --check "$f"; done
node --check --input-type=module < js/translate-worker.js
bash -n baslat.sh
python3 -m py_compile tools/*.py && rm -rf tools/__pycache__
echo "   ok"

echo "== gömülü paket"
python3 tools/build_bundle.py | tail -1

echo "== veri bütünlüğü"
if out=$(python3 tools/validate.py); then
  echo "$out" | tail -3
else
  echo "$out" | grep -E '^(HATA|UYARI)' || true
  echo "BAŞARISIZ"
  exit 1
fi

echo "== fonksiyonel"
node tools/smoke.js
