# Ada Translate

Tamamen **offline** çalışan İngilizce ↔ Türkçe denizcilik sözlüğü ve **cümle çevirisi**.
Genel İngilizceyi de kapsar (Oxford 3000, PET B1, phrasal verb'ler, yazışma kalıpları).
Hedef kitle: gemi personeli, chartering/operasyon, teknik & satın alma, sağlık sorumluları.

## Nasıl çalıştırılır

**Masaüstü uygulaması (önerilen):** `Ada Translate.exe` (Windows portable) — her şey çalışır.

**Geliştirme:**

```bash
npm install
bash tools/get_models.sh   # çeviri modelleri (~1 GB, bir kez)
npm start            # Electron ile aç
./baslat.sh          # tarayıcıda aç (Linux/macOS) — Windows: baslat.bat
```

`index.html`'e çift tıklayarak da açılabilir; bu durumda sözlük çalışır ama cümle çevirisi
çalışmaz (tarayıcılar `file://` altında çeviri modelini yüklemeye izin vermez).

## Özellikler

- **Sözlük** — 5.500+ terim (genel İngilizce, denizcilik, chartering, kimyasal tanker, ikmal, medikal).
  Anlık arama, yazım hatası toleransı, Türkçe karakter duyarsız; yön (EN→TR / TR→EN) otomatik.
  Çekimli/düzensiz biçimleri tanır (*went → go, children → child, stopped → stop*).
  Her sonuçta kategori, tanım ve telaffuz düğmesi bulunur.
- **Çeviri** — OPUS-MT büyük modelleri (Helsinki-NLP) iki yönde de tamamen cihazda çalışır.
  Altında metinde geçen sözlük terimleri listelenir (Türkçe ekli biçimler de tanınır:
  *makine dairesinde → engine room*). `Ctrl+Enter` hemen çevirir, `⇄` yönü değiştirir.
- Açık / koyu tema sistem ayarını izler. Klavye: `/` arama kutusu, `Esc` temizle.

## Dosya yapısı

```
AdaTranslate/
├── index.html · manifest.json · sw.js
├── electron-main.js        # masaüstü kabuğu (app:// protokolü, COOP/COEP)
├── css/style.css
├── js/
│   ├── data-bundle.js      # OTOMATİK — data/*.json'dan üretilir
│   ├── search.js           # normalizasyon, skorlama, fuzzy, kök bulma, cümle terimleri
│   ├── translate-worker.js # offline çeviri (Web Worker)
│   └── app.js              # arayüz
├── data/*.json             # sözlük kaynağı (general_a…e, maritime, chartering, …)
├── models/en-tr, tr-en     # ONNX çeviri modelleri (int8)
├── vendor/                 # transformers.js + onnxruntime-web (WASM)
└── tools/                  # build_bundle.py, validate.py, smoke.js, fix_tokenizer.py
```

## Veri değiştirince

```bash
npm run verify       # paketi yeniden üretir, veriyi doğrular, testleri çalıştırır
npm run build        # doğrulama + Windows portable/zip
```

## Lisanslar

Çeviri modelleri: Helsinki-NLP OPUS-MT (CC-BY 4.0) — `opus-mt-tc-big-en-tr`, `opus-mt-tc-big-tr-en`.
onnx-community paketlerindeki tokenizer.json kelime sırası hatalıdır; model güncellenirse
`tools/fix_tokenizer.py` ile düzeltin.
Çalışma ortamı: transformers.js (Apache-2.0), onnxruntime-web (MIT).
