/* app.js — UI controller */
(function () {
  'use strict';

  const CATS = [
    { id: 'general',         label: 'Genel',          color: 'var(--cat-general)' },
    { id: 'maritime',        label: 'Denizcilik',     color: 'var(--cat-maritime)' },
    { id: 'chartering',      label: 'Chartering',     color: 'var(--cat-chartering)' },
    { id: 'chemical_tanker', label: 'Chem. Tanker',   color: 'var(--cat-chemical_tanker)' },
    { id: 'supply',          label: 'Marine Supply',  color: 'var(--cat-supply)' },
    { id: 'medical',         label: 'Medikal',        color: 'var(--cat-medical)' },
    { id: 'pet',             label: 'PET (B1)',       color: 'var(--cat-pet)' }
  ];
  const CATMAP = {};
  CATS.forEach((c) => { CATMAP[c.id] = c; });

  const LS = {
    fav: 'ada.favs', notes: 'ada.notes', recent: 'ada.recent'
  };
  const store = {
    get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const $ = (s) => document.querySelector(s);
  const el = {
    q: $('#q'), clear: $('#clear'), chips: $('#chips'), results: $('#results'),
    count: $('#count'), status: $('#status'), recents: $('#recents'),
    az: $('#azindex'), quiz: $('#quiz'), sortinfo: $('#sortinfo'), coord: $('#coord'),
    exportBtn: $('#export'), dirpill: $('#dirpill'), toast: $('#toast'), totop: $('#totop')
  };

  const state = {
    terms: [], idx: [], dir: 'en',
    cats: new Set(), view: 'search', letter: null,
    favs: new Set(store.get(LS.fav, [])),
    notes: store.get(LS.notes, {}),
    recent: store.get(LS.recent, []),
    quiz: { pool: [], i: 0, shown: false }
  };

  // Otomatik yön algılama:
  // 1) Türkçe'ye özgü karakter (ş,ğ,İ,ö,ç,ü,ı) varsa TR→EN
  // 2) yoksa, sorgudaki kelimeler Türkçe havuzunda mı? (vana, gemi gibi karaktersiz Türkçe kelimeler)
  // 3) hiçbiri değilse EN→TR
  const TR_CHARS = /[şŞğĞİöÖçÇüÜıIâîû]/;
  const TR_WORDS = (typeof window.ADA_TR_WORDS !== 'undefined' && window.ADA_TR_WORDS) || [];
  const TR_WORD_SET = new Set(TR_WORDS);
  function detectDir(q) {
    if (TR_CHARS.test(q)) return 'tr';
    const words = q.toLowerCase().split(/[^a-zçğıöşü]+/).filter((w) => w.length >= 3);
    for (const w of words) if (TR_WORD_SET.has(w)) return 'tr';
    return 'en';
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const nq = AdaSearch.norm(q);
    if (!nq) return safe;
    const nt = AdaSearch.norm(text);
    const i = nt.indexOf(nq);
    if (i === -1 || nt.length !== text.length) return safe;
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + nq.length)) + '</mark>' + esc(text.slice(i + nq.length));
  }

  function primaryCat(t) {
    const c = (t.category && t.category[0]) || 'general';
    return CATMAP[c] ? c : 'general';
  }

  let toastTimer = null;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1900);
  }

  function updateDirPill(dir, hasQuery) {
    if (!el.dirpill) return;
    if (!hasQuery) { el.dirpill.hidden = true; return; }
    el.dirpill.hidden = false;
    if (dir === 'tr') {
      el.dirpill.textContent = 'TR → EN';
      el.dirpill.classList.add('tr');
    } else {
      el.dirpill.textContent = 'EN → TR';
      el.dirpill.classList.remove('tr');
    }
  }

  /* ---------- rendering ---------- */
  function cardHTML(t, q, i) {
    const pc = primaryCat(t);
    const color = CATMAP[pc].color;
    const tags = (t.category || []).filter((c) => CATMAP[c]).map((c) =>
      '<span class="tag" style="--c:' + CATMAP[c].color + '">' + esc(CATMAP[c].label.toLowerCase()) + '</span>').join('');
    const badge = t.abbreviation ? '<span class="badge">' + esc(t.abbreviation) + '</span>' : '';
    const subs = (t.subtags || []).slice(0, 2).map((s) =>
      '<span class="subtag">' + esc(s) + '</span>').join('');
    const fav = state.favs.has(t.id);
    const note = state.notes[t.id] || '';
    const delay = ' style="--i:' + Math.min(i, 14) + ';--c:' + color + '"';

    return '<article class="card" data-id="' + esc(t.id) + '"' + delay + '>' +
      '<div class="card-head"><div>' +
        '<div class="term">' + highlight(t.en, q) + '</div>' +
        '<div class="tr">' + highlight(t.tr, q) + '</div>' +
      '</div><div class="tags">' + badge + tags + subs + '</div></div>' +
      (t.definition_tr ? '<p class="def"><span class="deflabel">TR</span>' + esc(t.definition_tr) + '</p>' : '') +
      (t.definition_en ? '<p class="def en"><span class="deflabel">EN</span>' + esc(t.definition_en) + '</p>' : '') +
      (t.example_en ? '<p class="ex">' + esc(t.example_en) + '</p>' : '') +
      '<div class="card-actions">' +
        '<button class="iconbtn act-fav' + (fav ? ' on' : '') + '">' + (fav ? '★ FAVORİDE' : '☆ FAVORİ') + '</button>' +
        '<button class="iconbtn act-speak">🔊 OKU</button>' +
        '<button class="iconbtn act-note">✎ NOT</button>' +
      '</div>' +
      (note ? '<textarea class="note" placeholder="Kişisel not…">' + esc(note) + '</textarea>' : '') +
      '</article>';
  }

  function renderList(items, total, q) {
    if (!items.length) {
      el.results.innerHTML =
        '<div class="empty">' +
          '<svg class="anchor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 0v16M7 10h10M4 15a8 8 0 0 0 16 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
          'SONUÇ BULUNAMADI' +
          '<div class="empty-hint">Farklı bir yazım deneyin veya kategori filtrelerini temizleyin.</div>' +
        '</div>';
    } else {
      el.results.innerHTML = items.map((t, i) => cardHTML(t, q, i)).join('');
    }
    el.count.textContent = total + ' SONUÇ' + (total > items.length ? ' (İLK ' + items.length + ')' : '');
  }

  function currentQuery() { return el.q.value.trim(); }

  function run() {
    el.clear.hidden = !el.q.value;
    el.recents.hidden = true;
    el.az.hidden = true;
    el.quiz.hidden = true;
    el.results.hidden = false;

    const q = currentQuery();
    const dir = detectDir(q);
    updateDirPill(dir, q.length > 0);

    if (state.view === 'quiz') { el.results.hidden = true; el.quiz.hidden = false; renderQuiz(); return; }

    if (state.view === 'fav') {
      const items = state.terms.filter((t) => state.favs.has(t.id));
      el.sortinfo.textContent = 'GÖRÜNÜM: FAVORİLER';
      renderList(items, items.length, '');
      return;
    }

    if (state.view === 'abbr') {
      const nq = AdaSearch.norm(q);
      let items = state.terms.filter((t) => t.abbreviation);
      if (state.cats.size) items = items.filter((t) => (t.category || []).some((c) => state.cats.has(c)));
      if (nq) items = items.filter((t) => AdaSearch.norm(t.abbreviation).indexOf(nq) !== -1 ||
                                          AdaSearch.norm(t.en).indexOf(nq) !== -1);
      items.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
      el.sortinfo.textContent = 'GÖRÜNÜM: KISALTMALAR';
      renderList(items.slice(0, 400), items.length, q);
      return;
    }

    if (state.view === 'az') {
      el.az.hidden = false;
      renderAZ();
      const key = dir === 'tr' ? 'tr' : 'en';
      let items = state.terms.slice();
      if (state.cats.size) items = items.filter((t) => (t.category || []).some((c) => state.cats.has(c)));
      if (state.letter) items = items.filter((t) => AdaSearch.norm(t[key]).charAt(0) === state.letter);
      items.sort((a, b) => AdaSearch.norm(a[key]).localeCompare(AdaSearch.norm(b[key])));
      el.sortinfo.textContent = 'GÖRÜNÜM: A–Z' + (state.letter ? ' · ' + state.letter.toUpperCase() : '');
      renderList(items.slice(0, 300), items.length, '');
      return;
    }

    // default: search
    if (!q) {
      renderRecents();
      el.sortinfo.textContent = 'SIRALAMA: ALFABETİK';
      const r = AdaSearch.search(state.idx, '', { dir: dir, cats: state.cats, limit: 60 });
      renderList(r.items, r.total, '');
      return;
    }
    el.sortinfo.textContent = 'SIRALAMA: İLGİ';
    const r = AdaSearch.search(state.idx, q, { dir: dir, cats: state.cats, limit: 120 });
    renderList(r.items, r.total, q);
  }

  function renderRecents() {
    if (!state.recent.length) { el.recents.hidden = true; return; }
    el.recents.hidden = false;
    el.recents.innerHTML = '<span class="rlabel">SON ARAMALAR</span>' +
      state.recent.map((r) => '<button class="rchip">' + esc(r) + '</button>').join('');
  }

  function renderAZ() {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    el.az.innerHTML = '<button class="azbtn' + (state.letter ? '' : ' on') + '" data-l="">·</button>' +
      letters.map((l) => '<button class="azbtn' + (state.letter === l ? ' on' : '') + '" data-l="' + l + '">' +
        l.toUpperCase() + '</button>').join('');
  }

  function renderQuiz() {
    if (!state.quiz.pool.length) newQuizPool();
    const t = state.quiz.pool[state.quiz.i];
    if (!t) { el.quiz.innerHTML = '<p class="empty">KART YOK</p>'; return; }
    const pc = primaryCat(t);
    const dir = detectDir(el.q.value);
    const front = dir === 'tr' ? t.tr : t.en;
    const back = dir === 'tr' ? t.en : t.tr;
    el.count.textContent = 'KART ' + (state.quiz.i + 1) + ' / ' + state.quiz.pool.length;
    el.sortinfo.textContent = 'GÖRÜNÜM: FLASHCARD';
    el.quiz.innerHTML =
      '<div class="flash" id="flash" style="--c:' + CATMAP[pc].color + '" tabindex="0" role="button">' +
        '<div class="q">' + esc(front) + '</div>' +
        (state.quiz.shown ? '<div class="a">' + esc(back) + '</div>' +
          (t.definition_tr ? '<div class="hint">' + esc(t.definition_tr) + '</div>' : '')
          : '<div class="hint">CEVABI GÖRMEK İÇİN TIKLA</div>') +
      '</div>' +
      '<div class="quizbar">' +
        '<button class="btn" id="qprev">← ÖNCEKİ</button>' +
        '<button class="btn" id="qshuffle">KARIŞTIR</button>' +
        '<button class="btn" id="qnext">SONRAKİ →</button>' +
      '</div>';
  }

  function newQuizPool() {
    let pool = state.terms.slice();
    if (state.cats.size) pool = pool.filter((t) => (t.category || []).some((c) => state.cats.has(c)));
    if (state.favs.size && state.view === 'quiz' && false) pool = pool.filter((t) => state.favs.has(t.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    state.quiz.pool = pool.slice(0, 60);
    state.quiz.i = 0;
    state.quiz.shown = false;
  }

  /* ---------- events ---------- */
  let timer = null;
  el.q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const dir = detectDir(currentQuery());
      el.q.placeholder = 'İngilizce ya da Türkçe terim yazın… (EN ↔ TR)';
      run();
      const v = currentQuery();
      if (v.length >= 2) {
        state.recent = [v].concat(state.recent.filter((r) => r !== v)).slice(0, 8);
        store.set(LS.recent, state.recent);
      }
    }, 160);
  });

  el.clear.addEventListener('click', () => { el.q.value = ''; el.q.focus(); run(); });

  document.querySelectorAll('.viewbtn').forEach((b) => {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      document.querySelectorAll('.viewbtn').forEach((x) => x.classList.toggle('active', x === b));
      if (state.view === 'quiz') newQuizPool();
      run();
    });
  });

  el.chips.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const id = c.dataset.cat;
    if (state.cats.has(id)) state.cats.delete(id); else state.cats.add(id);
    c.classList.toggle('on', state.cats.has(id));
    if (state.view === 'quiz') newQuizPool();
    run();
  });

  el.recents.addEventListener('click', (e) => {
    const b = e.target.closest('.rchip');
    if (!b) return;
    el.q.value = b.textContent;
    run();
  });

  el.az.addEventListener('click', (e) => {
    const b = e.target.closest('.azbtn');
    if (!b) return;
    state.letter = b.dataset.l || null;
    run();
  });

  el.results.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    const t = state.terms.find((x) => x.id === id);
    if (!t) return;

    if (e.target.closest('.act-fav')) {
      const added = !state.favs.has(id);
      if (added) state.favs.add(id); else state.favs.delete(id);
      store.set(LS.fav, Array.from(state.favs));
      toast(added ? '★ FAVORİLERE EKLENDİ' : '☆ FAVORİLERDEN ÇIKARILDI');
      run();
    } else if (e.target.closest('.act-speak')) {
      speak(t);
    } else if (e.target.closest('.act-note')) {
      let ta = card.querySelector('.note');
      if (!ta) {
        ta = document.createElement('textarea');
        ta.className = 'note';
        ta.placeholder = 'Kişisel not…';
        ta.value = state.notes[id] || '';
        card.appendChild(ta);
      }
      ta.focus();
    }
  });

  el.results.addEventListener('change', (e) => {
    if (!e.target.classList.contains('note')) return;
    const card = e.target.closest('.card');
    const id = card.dataset.id;
    const v = e.target.value.trim();
    if (v) { state.notes[id] = v; toast('NOT KAYDEDİLDİ'); }
    else { delete state.notes[id]; toast('NOT SİLİNDİ'); }
    store.set(LS.notes, state.notes);
  });

  el.quiz.addEventListener('click', (e) => {
    if (e.target.closest('#flash')) { state.quiz.shown = !state.quiz.shown; renderQuiz(); }
    else if (e.target.closest('#qnext')) {
      state.quiz.i = (state.quiz.i + 1) % state.quiz.pool.length; state.quiz.shown = false; renderQuiz();
    } else if (e.target.closest('#qprev')) {
      state.quiz.i = (state.quiz.i - 1 + state.quiz.pool.length) % state.quiz.pool.length;
      state.quiz.shown = false; renderQuiz();
    } else if (e.target.closest('#qshuffle')) { newQuizPool(); renderQuiz(); }
  });

  el.exportBtn.addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      dataVersion: AdaDB.DATA_VERSION,
      favourites: Array.from(state.favs),
      notes: state.notes,
      terms: state.terms
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ada-translate-export.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('JSON DIŞA AKTARILDI');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== el.q) { e.preventDefault(); el.q.focus(); }
    if (e.key === 'Escape' && document.activeElement === el.q) { el.q.value = ''; run(); }
  });

  el.totop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => {
    el.totop.classList.toggle('show', window.scrollY > 500);
  }, { passive: true });

  function speak(t) {
    if (!('speechSynthesis' in window)) { toast('SES DESTEĞİ YOK'); return; }
    const dir = detectDir(el.q.value);
    const u = new SpeechSynthesisUtterance(dir === 'tr' ? t.tr : t.en);
    u.lang = dir === 'tr' ? 'tr-TR' : 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /* ---------- boot ---------- */
  function buildChips() {
    el.chips.innerHTML = CATS.map((c) =>
      '<button class="chip" data-cat="' + c.id + '" style="--c:' + c.color + '">' +
      '<span class="dot"></span>' + esc(c.label) +
      '<span class="chipcount" data-catcount="' + c.id + '">…</span></button>').join('');
  }

  function fillChipCounts() {
    const counts = {};
    state.terms.forEach((t) => {
      (t.category || []).forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    });
    document.querySelectorAll('[data-catcount]').forEach((s) => {
      const id = s.dataset.catcount;
      s.textContent = (counts[id] || 0).toLocaleString('tr-TR');
    });
  }

  function showSkeleton() {
    el.results.innerHTML = Array.from({ length: 4 }).map(() =>
      '<div class="skel"><div class="skel-line w1"></div><div class="skel-line w2"></div><div class="skel-line w3"></div></div>'
    ).join('');
  }

  function setCoord() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const la = p.coords.latitude, lo = p.coords.longitude;
      const f = (v, pos, neg) => {
        const d = Math.floor(Math.abs(v));
        const m = Math.round((Math.abs(v) - d) * 60);
        return String(d).padStart(2, '0') + '°' + String(m).padStart(2, '0') + '′' + (v >= 0 ? pos : neg);
      };
      el.coord.textContent = f(la, 'N', 'S') + ' ' + f(lo, 'E', 'W');
    }, () => {}, { timeout: 4000, maximumAge: 600000 });
  }

  async function boot() {
    buildChips();
    showSkeleton();
    el.status.textContent = 'veri yükleniyor…';
    try {
      const res = await AdaDB.load((i, n) => {
        el.status.textContent = 'veri yükleniyor… ' + i + '/' + n;
      });
      state.terms = res.terms;
      state.idx = AdaSearch.index(state.terms);
      el.status.textContent = state.terms.length.toLocaleString('tr-TR') + ' terim yüklendi · ' +
        (res.cached ? 'cihazda saklı' : 'cihaza kaydedildi');
      fillChipCounts();
    } catch (e) {
      el.status.textContent = 'veri yüklenemedi: ' + e.message;
      el.results.innerHTML = '<p class="empty">VERİ YÜKLENEMEDİ — data/ klasörünü kontrol edin</p>';
      return;
    }
    run();
    setCoord();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})();
