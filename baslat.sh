#!/usr/bin/env bash
# Ada Translate'i yerel sunucuyla açar (Service Worker + PWA tam çalışır).
# Kullanım: ./baslat.sh   ·  Durdurmak için terminalde Ctrl+C
cd "$(dirname "$0")" || exit 1

PORT=8123
while ss -ltn 2>/dev/null | grep -q ":$PORT "; do PORT=$((PORT+1)); done

URL="http://localhost:$PORT/index.html"
echo "Ada Translate → $URL"
echo "Kapatmak için Ctrl+C"

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM

sleep 1
xdg-open "$URL" >/dev/null 2>&1 || echo "Tarayıcıda aç: $URL"
wait $SRV
