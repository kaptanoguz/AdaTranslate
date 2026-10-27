/* app.js — UI controller */
(function () {
  'use strict';

  const CAT_LABEL = {
    general: 'Genel', maritime: 'Denizcilik', chartering: 'Chartering', chemical_tanker: 'Kimyasal tanker',
    supply: 'İkmal', medical: 'Medikal', pet: 'Genel'
  };

  const $ = (s) => document.querySelector(s);
  const el = {
    q: $('#q'), clear: $('#clear'), dir: $('#dirpill'), meta: $('#meta'), hint: $('#sentence-hint'),
    results: $('#results'), toast: $('#toast'), dict: $('#dict'), translate: $('#translate'),
    tIn: $('#t-in'), tOut: $('#t-out'), tBar: $('#t-bar'), tSrc: $('#t-src-lang'), tDst: $('#t-dst-lang'),
    tSwap: $('#t-swap'), tCopy: $('#t-copy'), tSpeak: $('#t-speak'), tTerms: $('#t-terms'), tTermsH: $('#t-terms-h')
  };

  const terms = window.ADA_DATA || [];
  const idx = AdaSearch.index(terms);
  const byId = new Map(terms.map((t) => [t.id, t]));
  const EXAMPLES = ['demurrage', 'valf', 'notice of readiness', 'went', 'yangın pompası'];

  // Otomatik yön algılama: Türkçe'ye özgü harf ya da Türkçe kelime havuzu → TR→EN.
  const TR_CHARS = /[şŞğĞİöÖçÇüÜı]/;
  const TR_WORD_SET = new Set(window.ADA_TR_WORDS || []);
  function detectDir(q) {
    if (TR_CHARS.test(q)) return 'tr';
    const ws = q.toLowerCase().split(/[^a-zçğıöşü]+/).filter((w) => w.length >= 3);
    let tr = 0;
    for (const w of ws) if (TR_WORD_SET.has(w)) tr++;
    // Cümlede çoğunluk aranır; "pilot", "kat" gibi ortak kelimeler yanıltmasın.
    return ws.length && tr * 2 >= ws.length ? 'tr' : 'en';
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function highlight(text, q) {
    const nq = q && AdaSearch.norm(q);
    if (!nq) return esc(text);
    const nt = AdaSearch.norm(text);
    const i = nt.indexOf(nq);
    if (i === -1 || nt.length !== text.length) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + nq.length)) + '</mark>' + esc(text.slice(i + nq.length));
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1600);
  }

  function speak(text, lang) {
    if (!('speechSynthesis' in window)) { toast('Sesli okuma desteklenmiyor'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'tr' ? 'tr-TR' : 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  const SPEAK_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8v4h3l4 3V5L7 8H4z"/><path d="M14 7.5a3.5 3.5 0 0 1 0 5"/></svg>';

  function entryHTML(t, q) {
    const cats = Array.from(new Set((t.category || []).map((c) => CAT_LABEL[c]).filter(Boolean)));
    return '<li class="entry" data-id="' + esc(t.id) + '">' +
      '<div class="entry-head">' +
        '<span class="hw" lang="en">' + highlight(t.en, q) + '</span>' +
        (t.abbreviation && t.abbreviation !== t.en ? '<span class="abbr">' + esc(t.abbreviation) + '</span>' : '') +
        '<button class="speak" title="Telaffuz" aria-label="Telaffuz">' + SPEAK_ICON + '</button>' +
        '<span class="cat">' + esc(cats.join(' · ')) + '</span>' +
      '</div>' +
      '<div class="tl">' + highlight(t.tr, q) + '</div>' +
      (t.definition_tr ? '<p class="def">' + esc(t.definition_tr) + '</p>' : '') +
      (t.definition_en && !t.definition_tr ? '<p class="def en" lang="en">' + esc(t.definition_en) + '</p>' : '') +
      (t.example_en ? '<p class="ex" lang="en">' + esc(t.example_en) + '</p>' : '') +
      '</li>';
  }

  /* ---------- sözlük ---------- */
  function showIntro() {
    el.results.innerHTML = '';
    el.results.hidden = true;
    el.meta.innerHTML = terms.length.toLocaleString('tr-TR') + ' terim, tamamı cihazda. Örnek: ' +
      EXAMPLES.map((e) => '<button data-ex="' + esc(e) + '">' + esc(e) + '</button>').join(', ');
  }

  function run() {
    const q = el.q.value.trim();
    el.clear.hidden = !q;
    el.dir.hidden = !q;
    const words = q.split(/\s+/).length;
    el.hint.hidden = words < 4;
    if (words >= 4) el.hint.innerHTML = 'Bu bir cümleye benziyor. <button id="to-translate">Çeviride aç →</button>';
    if (!q) { showIntro(); return; }

    const dir = detectDir(q);
    el.dir.textContent = dir === 'tr' ? 'TR → EN' : 'EN → TR';
    const r = AdaSearch.search(idx, q, { dir: dir, limit: 60 });
    el.results.hidden = false;
    el.results.innerHTML = r.items.length ? r.items.map((t) => entryHTML(t, q)).join('') :
      '<li class="empty">Sonuç yok. Farklı bir yazım deneyin.</li>';
    el.meta.textContent = r.total ? r.total.toLocaleString('tr-TR') + ' sonuç' +
      (r.total > r.items.length ? ', ilk ' + r.items.length + ' gösteriliyor' : '') : '';
  }

  /* ---------- çeviri ---------- */
  const LANG = { en: 'İngilizce', tr: 'Türkçe' };
  let worker = null, reqId = 0, tTimer = null, lastOut = '', tdir = null;
  const tDir = () => tdir || detectDir(el.tIn.value);

  function setBar(v) {
    el.tBar.hidden = v == null;
    if (v != null) el.tBar.firstElementChild.style.width = Math.round(v * 100) + '%';
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('js/translate-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.id !== reqId) return;
      if (m.type === 'progress') {
        setBar(m.value);
        if (m.phase === 'load') el.tOut.innerHTML = '<span class="note">Çeviri modeli hazırlanıyor…</span>';
        else if (m.partial) el.tOut.textContent = m.partial;
      } else if (m.type === 'done') {
        setBar(null); lastOut = m.text; el.tOut.textContent = m.text;
      } else {
        setBar(null); el.tOut.innerHTML = '<span class="err">Çeviri yapılamadı: ' + esc(m.message) + '</span>';
      }
    };
    worker.onerror = () => {
      setBar(null); worker = null;
      el.tOut.innerHTML = '<span class="err">Çeviri motoru başlatılamadı.</span>';
    };
    return worker;
  }

  function translateNow() {
    const text = el.tIn.value.trim();
    const dir = tDir();
    el.tSrc.textContent = LANG[dir];
    el.tDst.textContent = LANG[dir === 'en' ? 'tr' : 'en'];
    const hits = text ? AdaSearch.termsIn(idx, text, dir, 12) : [];
    el.tTermsH.hidden = !hits.length;
    el.tTerms.innerHTML = hits.map((t) => entryHTML(t, '')).join('');
    reqId++;
    lastOut = '';
    if (!text) { el.tOut.textContent = ''; setBar(null); return; }
    if (location.protocol === 'file:') {
      el.tOut.innerHTML = '<span class="err">Bu açılış biçiminde cümle çevirisi çalışmaz. ' +
        'Masaüstü uygulamasını ya da baslat betiğini kullanın.</span>';
      return;
    }
    setBar(0);
    getWorker().postMessage({ id: reqId, dir: dir, text: text });
  }

  function setView(v) {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.view === v));
    el.dict.hidden = v !== 'dict';
    el.translate.hidden = v !== 'translate';
    (v === 'dict' ? el.q : el.tIn).focus();
  }

  /* ---------- events ---------- */
  let timer = null;
  el.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  el.clear.addEventListener('click', () => { el.q.value = ''; el.q.focus(); run(); });
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); setView('dict'); });

  el.meta.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ex]');
    if (b) { el.q.value = b.dataset.ex; run(); el.q.focus(); }
  });
  el.hint.addEventListener('click', (e) => {
    if (!e.target.closest('#to-translate')) return;
    el.tIn.value = el.q.value.trim();
    tdir = null;
    setView('translate');
    translateNow();
  });

  function onEntryClick(e) {
    const b = e.target.closest('.speak');
    if (!b) return;
    const t = byId.get(b.closest('.entry').dataset.id);
    if (t) speak(t.en, 'en');
  }
  el.results.addEventListener('click', onEntryClick);
  el.tTerms.addEventListener('click', onEntryClick);

  el.tIn.addEventListener('input', () => {
    if (!el.tIn.value.trim()) tdir = null;
    clearTimeout(tTimer);
    tTimer = setTimeout(translateNow, 500);
  });
  el.tIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { clearTimeout(tTimer); translateNow(); }
  });
  el.tSwap.addEventListener('click', () => {
    tdir = tDir() === 'en' ? 'tr' : 'en';
    if (lastOut) el.tIn.value = lastOut;   // sonucu yeni kaynak yap
    translateNow();
  });
  el.tCopy.addEventListener('click', () => {
    const t = el.tOut.textContent.trim();
    if (t) navigator.clipboard.writeText(t).then(() => toast('Kopyalandı'), () => toast('Kopyalanamadı'));
  });
  el.tSpeak.addEventListener('click', () => {
    const t = el.tOut.textContent.trim();
    if (t) speak(t, tDir() === 'en' ? 'tr' : 'en');
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing && !el.dict.hidden) { e.preventDefault(); el.q.focus(); }
    else if (e.key === 'Escape' && document.activeElement === el.q) { el.q.value = ''; run(); }
  });

  /* ---------- boot ---------- */
  if (!terms.length) {
    el.meta.textContent = 'Veri yüklenemedi: js/data-bundle.js eksik.';
  } else {
    run();
    el.q.focus();
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
