/* search.js — normalization, scoring, fuzzy matching */
(function (global) {
  'use strict';

  const TR_MAP = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
                   'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u' };

  function norm(s) {
    if (!s) return '';
    let out = '';
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      out += TR_MAP[ch] !== undefined ? TR_MAP[ch] : ch.toLowerCase();
    }
    return out.normalize ? out.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : out;
  }

  /** Bounded Levenshtein: returns >max early. */
  function lev(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev = new Array(lb + 1), cur = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      cur[0] = i;
      let best = cur[0];
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      const t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }

  /** Precompute normalized fields once per term. */
  function index(terms) {
    return terms.map((t) => {
      const nen = norm(t.en);
      const ntr = norm(t.tr);
      return {
        t: t,
        nen: nen,
        ntr: ntr,
        nabbr: norm(t.abbreviation || ''),
        ndef: norm((t.definition_tr || '') + ' ' + (t.definition_en || '')),
        enWords: nen.split(/[^a-z0-9]+/).filter(Boolean),
        trWords: ntr.split(/[^a-z0-9]+/).filter(Boolean)
      };
    });
  }

  function fieldScore(q, full, words) {
    if (!full) return 0;
    if (full === q) return 100;
    if (full.startsWith(q)) return 85;
    for (let i = 0; i < words.length; i++) {
      if (words[i] === q) return 80;
      if (words[i].startsWith(q)) return 70;
    }
    if (full.indexOf(q) !== -1) return 55;
    // fuzzy: only for reasonably long queries
    if (q.length >= 4) {
      const max = q.length <= 5 ? 1 : 2;
      if (lev(q, full, max) <= max) return 45;
      for (let i = 0; i < words.length; i++) {
        if (Math.abs(words[i].length - q.length) <= max && lev(q, words[i], max) <= max) return 40;
      }
    }
    return 0;
  }

  /**
   * @param {Array} idx        indexed terms
   * @param {string} query
   * @param {object} opts      {dir:'en'|'tr', cats:Set|null, limit:number}
   */
  function search(idx, query, opts) {
    opts = opts || {};
    const q = norm(query).trim();
    const cats = opts.cats && opts.cats.size ? opts.cats : null;
    const dir = opts.dir === 'tr' ? 'tr' : 'en';
    const limit = opts.limit || 120;
    const out = [];

    for (let i = 0; i < idx.length; i++) {
      const it = idx[i];
      if (cats) {
        const c = it.t.category || [];
        let hit = false;
        for (let k = 0; k < c.length; k++) if (cats.has(c[k])) { hit = true; break; }
        if (!hit) continue;
      }
      if (!q) { out.push({ it: it, score: 0 }); continue; }

      const primary = dir === 'en'
        ? fieldScore(q, it.nen, it.enWords)
        : fieldScore(q, it.ntr, it.trWords);
      const secondary = dir === 'en'
        ? fieldScore(q, it.ntr, it.trWords)
        : fieldScore(q, it.nen, it.enWords);
      const abbr = it.nabbr && (it.nabbr === q ? 95 : it.nabbr.startsWith(q) ? 60 : 0);
      let score = Math.max(primary, secondary * 0.85, abbr);
      if (!score && it.ndef.indexOf(q) !== -1) score = 20;
      if (score > 0) out.push({ it: it, score: score });
    }

    if (q) {
      out.sort((a, b) => b.score - a.score || a.it.nen.length - b.it.nen.length ||
                          a.it.nen.localeCompare(b.it.nen));
    } else {
      out.sort((a, b) => a.it.nen.localeCompare(b.it.nen));
    }
    return { total: out.length, items: out.slice(0, limit).map((r) => r.it.t) };
  }

  global.AdaSearch = { norm: norm, lev: lev, index: index, search: search };
})(window);
