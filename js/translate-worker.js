/* translate-worker.js — offline cümle çevirisi (Marian/OPUS-MT, ONNX, WASM).
 * Arayüzü dondurmamak için ayrı bir Web Worker'da çalışır.
 * Mesajlar:  → {id, dir:'en'|'tr', text}     ← {id, type:'progress'|'done'|'error', ...}
 */
import { env, pipeline } from '../vendor/transformers.js';

const base = new URL('../', self.location.href).href;
env.allowRemoteModels = false;           // asla internete çıkma
env.allowLocalModels = true;
// Göreli yol olmalı: tam URL verilirse kütüphane tokenizer'ı "uzak dosya" sayıp atlıyor.
env.localModelPath = new URL('models/', base).pathname;
env.useBrowserCache = false;             // modeller zaten diskte; ikinci kopya tutma
env.backends.onnx.wasm.wasmPaths = {
  mjs: base + 'vendor/ort-wasm-simd-threaded.asyncify.mjs',
  wasm: base + 'vendor/ort-wasm-simd-threaded.asyncify.wasm'
};
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
  ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const MODELS = { en: 'en-tr', tr: 'tr-en' };
const loaded = {};

function load(dir, onProgress) {
  if (!loaded[dir]) {
    loaded[dir] = pipeline('translation', MODELS[dir], {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) onProgress(p.loaded / p.total);
      }
    }).catch((e) => { delete loaded[dir]; throw e; });
  }
  return loaded[dir];
}

// Cümlelere böl; paragraf (satır) yapısını koru. Kısa parçalar modelin
// uzunluk sınırına takılmaz ve ilerleme cümle cümle gösterilebilir.
function split(text) {
  return text.split(/\n/).map((line) =>
    line.trim() ? line.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g).map((s) => s.trim()).filter(Boolean) : []);
}

// Denizcilikte "vana" değil "valf" kullanılır; Türkçe çıktıyı buna göre düzelt.
const VALF = { '': '', 'sı': 'i', 'yı': 'i', 'ya': 'e', 'da': 'te', 'dan': 'ten', 'nın': 'in', 'sını': 'ini',
  'sına': 'ine', 'sının': 'inin', 'lar': 'ler', 'ları': 'leri', 'ların': 'lerin', 'larını': 'lerini', 'larının': 'lerinin' };
const VALF_RE = new RegExp('(^|[^A-Za-zÇĞİÖŞÜçğıöşü])([Vv])ana(' +
  Object.keys(VALF).filter(Boolean).sort((a, b) => b.length - a.length).join('|') + ')?(?![A-Za-zÇĞİÖŞÜçğıöşü])', 'g');
const fixTr = (s) => s.replace(VALF_RE, (_, pre, v, suf) => pre + v + 'alf' + VALF[suf || '']);

let queue = Promise.resolve();
let latest = 0;

self.onmessage = (e) => {
  const { id, dir, text } = e.data;
  latest = id;
  queue = queue.then(() => run(id, dir, text));
};

async function run(id, dir, text) {
  if (id !== latest) return;            // yeni bir istek geldiyse eskisini atla
  const post = (m) => self.postMessage(Object.assign({ id }, m));
  try {
    const tr = await load(dir, (f) => post({ type: 'progress', phase: 'load', value: f }));
    const lines = split(text);
    const total = lines.reduce((n, l) => n + l.length, 0) || 1;
    const outLines = [];
    let done = 0;
    for (const sents of lines) {
      const out = [];
      for (const s of sents) {
        if (id !== latest) return;
        const r = await tr(s, { max_new_tokens: 256, num_beams: 1 });
        out.push(dir === 'en' ? fixTr(r[0].translation_text) : r[0].translation_text);
        done++;
        post({ type: 'progress', phase: 'translate', value: done / total,
               partial: outLines.concat([out.join(' ')]).join('\n') });
      }
      outLines.push(out.join(' '));
    }
    post({ type: 'done', text: outLines.join('\n') });
  } catch (err) {
    post({ type: 'error', message: String((err && err.message) || err) });
  }
}
