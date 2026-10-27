/* search.js — normalization, scoring, fuzzy matching, English lemmas */
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
    return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Düzensiz fiil / çoğul biçimleri → sözlükteki kök. "went" → "go", "children" → "child".
  const IRREGULAR = {};
  ('be:am,is,are,was,were,been,being have:has,had,having do:does,did,done go:goes,went,gone ' +
   'get:got,gotten make:made take:took,taken come:came give:gave,given know:knew,known think:thought ' +
   'see:saw,seen say:said tell:told find:found leave:left feel:felt bring:brought begin:began,begun ' +
   'keep:kept hold:held stand:stood hear:heard mean:meant meet:met run:ran pay:paid sit:sat ' +
   'speak:spoke,spoken lie:lay,lain lead:led read:read grow:grew,grown lose:lost fall:fell,fallen ' +
   'send:sent build:built understand:understood draw:drew,drawn break:broke,broken spend:spent ' +
   'rise:rose,risen drive:drove,driven buy:bought wear:wore,worn choose:chose,chosen seek:sought ' +
   'throw:threw,thrown catch:caught deal:dealt win:won forget:forgot,forgotten sell:sold fight:fought ' +
   'teach:taught eat:ate,eaten sing:sang,sung swim:swam,swum write:wrote,written ride:rode,ridden ' +
   'fly:flew,flown blow:blew,blown sink:sank,sunk drink:drank,drunk ring:rang,rung shake:shook,shaken ' +
   'steal:stole,stolen wake:woke,woken hide:hid,hidden bite:bit,bitten freeze:froze,frozen ' +
   'forgive:forgave,forgiven feed:fed sleep:slept sweep:swept weep:wept bend:bent lend:lent ' +
   'shoot:shot light:lit slide:slid hang:hung dig:dug stick:stuck strike:struck swing:swung ' +
   'bear:bore,borne tear:tore,torn swear:swore,sworn become:became overcome:overcame ' +
   'undertake:undertook,undertaken withdraw:withdrew,withdrawn arise:arose,arisen ' +
   'man:men woman:women child:children person:people foot:feet tooth:teeth mouse:mice ' +
   'good:better,best bad:worse,worst far:further,farther,furthest').split(' ').forEach((grp) => {
    const p = grp.split(':');
    p[1].split(',').forEach((f) => { IRREGULAR[f] = p[0]; });
  });

  /** İngilizce tek kelime için olası kök adayları (sırayla). */
  function lemmas(w) {
    const out = [];
    if (IRREGULAR[w]) out.push(IRREGULAR[w]);
    const rules = [['ies', 'y'], ['ied', 'y'], ['ves', 'f'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'],
                   ['ing', ''], ['ing', 'e'], ['ly', ''], ['ier', 'y'], ['iest', 'y']];
    for (const [suf, rep] of rules) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) {
        let stem = w.slice(0, -suf.length) + rep;
        out.push(stem);
        // stopped → stop, running → run
        if (!rep && /([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1));
      }
    }
    return out;
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

  const words = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);

  /** Precompute normalized fields once per term. */
  function index(terms) {
    return terms.map((t) => {
      const nen = norm(t.en);
      const ntr = norm(t.tr);
      return {
        t: t, nen: nen, ntr: ntr,
        nabbr: norm(t.abbreviation || ''),
        ndef: norm((t.definition_tr || '') + ' ' + (t.definition_en || '')),
        enWords: words(nen), trWords: words(ntr)
      };
    });
  }

  function fieldScore(q, full, ws) {
    if (!full) return 0;
    if (full === q) return 100;
    if (full.startsWith(q)) return 85;
    for (let i = 0; i < ws.length; i++) {
      if (ws[i] === q) return 80;
      if (ws[i].startsWith(q)) return 70;
    }
    if (full.indexOf(q) !== -1) return 55;
    if (q.length >= 4) {
      const max = q.length <= 5 ? 1 : 2;
      if (lev(q, full, max) <= max) return 45;
      for (let i = 0; i < ws.length; i++) {
        if (Math.abs(ws[i].length - q.length) <= max && lev(q, ws[i], max) <= max) return 40;
      }
    }
    return 0;
  }

  function inCats(it, cats) {
    const c = it.t.category || [];
    for (let k = 0; k < c.length; k++) if (cats.has(c[k])) return true;
    return false;
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
    const limit = opts.limit || 100;
    // Tek İngilizce kelimede kök adaylarıyla da eşleştir (went → go).
    const alts = dir === 'en' && /^[a-z]+$/.test(q) ? lemmas(q) : [];
    const out = [];

    for (let i = 0; i < idx.length; i++) {
      const it = idx[i];
      if (cats && !inCats(it, cats)) continue;
      if (!q) { out.push({ it: it, score: 0 }); continue; }

      const pri = dir === 'en' ? [it.nen, it.enWords] : [it.ntr, it.trWords];
      const sec = dir === 'en' ? [it.ntr, it.trWords] : [it.nen, it.enWords];
      const abbr = it.nabbr && (it.nabbr === q ? 95 : it.nabbr.startsWith(q) ? 60 : 0);
      let score = Math.max(fieldScore(q, pri[0], pri[1]), fieldScore(q, sec[0], sec[1]) * 0.85, abbr);
      for (let k = 0; k < alts.length && score < 90; k++) {
        if (pri[0] === alts[k] || pri[0] === 'to ' + alts[k]) score = Math.max(score, 90);
        else if (pri[1].indexOf(alts[k]) !== -1) score = Math.max(score, 60);
      }
      if (!score && q.length >= 3 && it.ndef.indexOf(q) !== -1) score = 20;
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

  // Cümle terim listesinde gösterilmeyecek yaygın işlev kelimeleri.
  const STOP = new Set(('will would shall should could might must have been being with from that this ' +
    'then than they them there their what when where which after before into onto over under about ' +
    'also very just only some such your yours ours here were does done make made take took get got ' +
    'bir için ile gibi daha çok kadar sonra önce olan olarak ama veya').split(' '));

  /**
   * Bir cümlede geçen sözlük terimlerini bulur (çok kelimeli terimler önce).
   * Cümle çevirisinin altında "geçen terimler" listesi için kullanılır.
   */
  function termsIn(idx, text, dir, max) {
    const toks = words(norm(text));
    if (!toks.length) return [];
    const cacheKey = dir === 'tr' ? '_phraseTr' : '_phraseEn';
    const byPhrase = idx[cacheKey] || (idx[cacheKey] = new Map());
    if (!byPhrase.size) for (const it of idx) {
      // Türkçe karşılıklar "a, b" biçiminde olabilir; her biri ayrı ifade.
      // Kalıp cümleler ("could you repeat that, please?") tek kelimeye bölünmesin.
      const fixed = (it.t.subtags || []).indexOf('phrase') !== -1;
      const phrases = dir === 'tr' ? (fixed ? [it.ntr] : it.ntr.split(/[,;]/)) : [it.nen];
      phrases.forEach((p, rank) => {
        p = words(p).join(' ');
        if (!p || p.length < 3) return;
        // TR'de karşılığın ilk anlamı öncelikli: "gemi" → ship (tekne, gemi → boat değil).
        const cur = byPhrase.get(p);
        if (!cur || rank < cur.rank) byPhrase.set(p, { it: it, rank: rank });
      });
      // Kısaltmalar da eşleşsin: OOW, ECDIS, UKC.
      const ab = dir === 'en' && words(it.nabbr).join(' ');
      if (ab && ab.length >= 2 && !byPhrase.has(ab)) byPhrase.set(ab, { it: it, rank: 9, abbr: true });
    }
    const seen = new Set(), hits = [];
    const used = new Array(toks.length).fill(false);
    // Türkçe ekler: "makine dairesinde" → makine dairesi, "pompasını" → pompa(sı).
    function trPass() {
      const byFirst = idx._phraseTrFirst || (idx._phraseTrFirst = new Map());
      if (!byFirst.size) byPhrase.forEach((v, p) => {
        const ws = p.split(' ');
        if (ws.length > 4 || (ws.length === 1 && (ws[0].length < 4 || STOP.has(ws[0])))) return;
        const k = ws[0].slice(0, 3);
        if (!byFirst.has(k)) byFirst.set(k, []);
        byFirst.get(k).push({ ws: ws, it: v.it, rank: v.rank });
      });
      // Ek almış biçim: kök aynen korunur, ya da sondaki p/ç/t/k yumuşar (kitap → kitabı).
      const SOFT = { p: 'b', c: 'c', t: 'd', k: 'g' };
      const HARD = { g: 'k', b: 'p', d: 't' };
      const fits = (tok, w) => {
        if (tok === w) return true;
        if (w.length < 3 || tok.length - w.length > 6) return false;
        // Tek ünsüz fazlası ek değil başka kelimedir: yangı ≠ yangın.
        if (tok.startsWith(w)) return !/^[^aeiou]$/.test(tok.slice(w.length));
        if (SOFT[w.slice(-1)] && tok.startsWith(w.slice(0, -1) + SOFT[w.slice(-1)])) return true;
        // Bileşik isimde iyelik eki çoğulda düşer: can yeleği → can yelekleri, tüpü → tüpleri.
        const m = w.match(/^(.{2,}?[^aeiou])s?[iu]$/);
        if (m) {
          const st = m[1], hard = HARD[st.slice(-1)] ? st.slice(0, -1) + HARD[st.slice(-1)] : st;
          return /^l[ae]r/.test(tok.slice(st.length)) && (tok.startsWith(st) || tok.startsWith(hard)) ||
                 /^l[ae]r/.test(tok.slice(hard.length)) && tok.startsWith(hard);
        }
        return false;
      };
      for (let i = 0; i < toks.length; i++) {
        if (used[i]) continue;
        let best = null;
        for (const c of byFirst.get(toks[i].slice(0, 3)) || []) {
          const n = c.ws.length;
          if (i + n > toks.length || seen.has(c.it.t.id)) continue;
          let ok = true;
          for (let k = 0; k < n && ok; k++) ok = !used[i + k] && fits(toks[i + k], c.ws[k]);
          if (ok && (!best || n > best.ws.length || (n === best.ws.length && c.rank < best.rank))) best = c;
        }
        if (best) {
          seen.add(best.it.t.id); hits.push({ t: best.it.t, n: best.ws.length, pos: i });
          for (let k = i; k < i + best.ws.length; k++) used[k] = true;
        }
      }
    }
    for (let n = 7; n >= 1; n--) {
      if (n === 1 && dir === 'tr') trPass();
      for (let i = 0; i + n <= toks.length; i++) {
        if (used.slice(i, i + n).some(Boolean)) continue;
        let cand = [toks.slice(i, i + n).join(' ')];
        // Son kelimenin kökü: "mooring lines" → mooring line, "went" → go.
        if (dir === 'en') {
          const head = toks.slice(i, i + n - 1).join(' ');
          cand = cand.concat(lemmas(toks[i + n - 1]).map((l) => (head ? head + ' ' : '') + l));
        }
        for (const c of cand) {
          const hit = byPhrase.get(c);
          const it = hit && hit.it;
          if (it && !seen.has(it.t.id)) {
            // Tek kelimelik çok kısa/yaygın kelimeleri (the, is…) listeleme; kısaltmalar hariç.
            if (n === 1 && !hit.abbr && (c.length < 4 || STOP.has(c))) break;
            if (n === 1 && hit.abbr && c.length < 3) break;
            seen.add(it.t.id); hits.push({ t: it.t, n: n, pos: i });
            for (let k = i; k < i + n; k++) used[k] = true;
            break;
          }
        }
      }
    }
    // Uzman terimler (çok kelimeli, denizcilik vb.) öne.
    hits.sort((a, b) => b.n - a.n || a.pos - b.pos);
    return hits.slice(0, max || 12).map((h) => h.t);
  }

  global.AdaSearch = { norm: norm, lev: lev, lemmas: lemmas, index: index, search: search, termsIn: termsIn };
})(typeof window !== 'undefined' ? window : globalThis);
