// smoke.js — veri paketi + arama motoru için fonksiyonel duman testi (node tools/smoke.js)
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const DISK = fs.readdirSync(path.join(R, 'data')).filter((f) => f.endsWith('.json'))
  .reduce((n, f) => n + JSON.parse(read('data/' + f)).length, 0);

const sb = { console };
sb.window = sb;
vm.createContext(sb);
for (const f of ['js/data-bundle.js', 'js/search.js']) vm.runInContext(read(f), sb);
const S = sb.AdaSearch, idx = S.index(sb.ADA_DATA);

let fail = 0;
const check = (ok, label, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (extra ? ' | ' + extra : ''));
  if (!ok) fail++;
};

check(sb.ADA_DATA.length === DISK, 'bundle ↔ disk senkron', sb.ADA_DATA.length + '/' + DISK);

// Arama: [sorgu, yön, ilk sonuçta beklenen parça]
const PROBES = [
  ['demurrage', 'en', 'sürastarya'], ['tank cleaning', 'en', 'tank temizli'], ['valf', 'tr', 'valve'],
  ['gasket', 'en', 'conta'], ['laytime', 'en', 'astarya'], ['gemiyi terk', 'tr', 'abandon'],
  ['ibuprofen', 'en', 'ibuprofen'], ['went', 'en', 'go'], ['children', 'en', 'child'],
  ['bought', 'en', 'buy'], ['wednesday', 'en', 'çarşamba'], ['carry out', 'en', 'gerçekleştir'],
  ['stopped', 'en', 'stop']
];
let miss = [];
for (const [q, dir, expect] of PROBES) {
  const r = S.search(idx, q, { dir, limit: 1 });
  const hit = r.items[0] ? (r.items[0].en + ' ' + r.items[0].tr).toLowerCase() : '(yok)';
  if (!hit.includes(expect)) miss.push(q + ' → ' + hit);
}
check(!miss.length, 'arama (' + PROBES.length + ' sorgu)', miss.join('; '));

// Cümledeki terimler
const hits = S.termsIn(idx, 'The vessel will tender notice of readiness after free pratique is granted.', 'en', 12)
  .map((t) => t.en.toLowerCase());
check(hits.some((h) => h.includes('notice of readiness')) && hits.some((h) => h.includes('free pratique')),
  'cümledeki terimler (EN)', hits.slice(0, 5).join(', '));

const hitsTr = S.termsIn(idx, 'Makine dairesinde yangın var, yangın pompasını çalıştırın.', 'tr', 12)
  .map((t) => t.en.toLowerCase());
check(hitsTr.some((h) => h.includes('engine room')) && !hitsTr.some((h) => h.includes('inflammation')),
  'cümledeki terimler (TR, ekli)', hitsTr.slice(0, 5).join(', '));

// Statik dosya bütünlüğü
const html = read('index.html'), sw = read('sw.js');
check(html.indexOf('data-bundle.js') < html.indexOf('js/search.js'), 'index.html: bundle search.js\'ten önce');
const assets = (sw.match(/'\.\/[^']+'/g) || []).map((s) => s.slice(3, -1)).filter(Boolean);
const gone = assets.filter((a) => !fs.existsSync(path.join(R, a)));
check(!gone.length, 'sw.js: tüm ASSETS mevcut', gone.join(', '));
const mdl = ['en-tr', 'tr-en'].flatMap((m) => ['config.json', 'tokenizer.json', 'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'].map((f) => 'models/' + m + '/' + f));
const noModel = mdl.filter((f) => !fs.existsSync(path.join(R, f)));
check(!noModel.length, 'çeviri modelleri mevcut', noModel.join(', '));

console.log(fail ? '\n' + fail + ' BAŞARISIZ' : '\nTÜM TESTLER GEÇTİ');
process.exit(fail ? 1 : 0);
