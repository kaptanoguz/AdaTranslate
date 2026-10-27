#!/usr/bin/env python3
"""build_bundle.py — data/*.json dosyalarını tek bir JS paketine gömer.

Neden: file:// protokolünde tarayıcılar fetch() ile yerel JSON okumayı engeller
(CORS). Bu paket <script> ile yüklendiği için o kısıtlamaya takılmaz; böylece
index.html sunucusuz, çift tıklayarak da açılabilir.

Ayrıca otomatik yön algılama için Türkçe kelime havuzunu (ADA_TR_WORDS) üretir:
verideki tüm Türkçe karşılık ve tanımlardan çıkarılan 3+ harfli kelimeler.

Kullanım: python3 tools/build_bundle.py
Veri değiştiğinde yeniden çalıştır.
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'js', 'data-bundle.js')


def build_tr_words(rows):
    """Türkçe karşılık (tr) alanlarından 3+ harfli kelime seti çıkar.
    Tanım alanları değil — orada İngilizce terimlerin parantez içi tekrarları
    yanlış pozitife yol açıyordu."""
    words = set()
    for r in rows:
        tr = re.sub(r'\([^)]*\)', '', r.get('tr', ''))  # parantez içi İngilizce'yi at
        for w in re.findall(r'[a-zA-ZçğıöşüÇĞİÖŞÜ]{3,}', tr):
            words.add(w.lower())
    return sorted(words)


def main() -> int:
    rows = []
    for path in sorted(glob.glob(os.path.join(DATA, '*.json'))):
        with open(path, encoding='utf-8') as fh:
            chunk = json.load(fh)
        rows.extend(chunk)
        print('  %-24s %5d' % (os.path.basename(path), len(chunk)))

    tr_words = build_tr_words(rows)

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('/* Otomatik üretildi: python3 tools/build_bundle.py — elle düzenleme. */\n')
        fh.write('window.ADA_DATA = ')
        fh.write(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
        fh.write(';\n')
        fh.write('window.ADA_TR_WORDS = ')
        fh.write(json.dumps(tr_words, ensure_ascii=False, separators=(',', ':')))
        fh.write(';\n')

    print('\n%d terim → js/data-bundle.js (%.1f KB) | %d Türkçe kelime'
          % (len(rows), os.path.getsize(OUT) / 1024, len(tr_words)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
