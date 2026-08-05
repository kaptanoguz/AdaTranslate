/* db.js — IndexedDB layer (no external deps) */
(function (global) {
  'use strict';

  const DB_NAME = 'ada-translate';
  const DB_VERSION = 1;
  const STORE = 'terms';
  const META = 'meta';

  // Bump DATA_VERSION when the JSON files change -> triggers re-import.
  const DATA_VERSION = '1.1.0';
  const FILES = [
    'data/general_a.json',
    'data/general_b.json',
    'data/general_c.json',
    'data/maritime.json',
    'data/chartering.json',
    'data/chemical_tanker.json',
    'data/supply.json',
    'data/glossary_1.json',
    'data/glossary_2.json',
    'data/medical.json',
    'data/pet.json'
  ];

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('en', 'en', { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'k' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function getMeta(db, k) {
    return new Promise((res) => {
      const r = tx(db, META, 'readonly').get(k);
      r.onsuccess = () => res(r.result ? r.result.v : null);
      r.onerror = () => res(null);
    });
  }

  function setMeta(db, k, v) {
    return new Promise((res, rej) => {
      const t = db.transaction(META, 'readwrite');
      t.objectStore(META).put({ k: k, v: v });
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }

  function putAll(db, rows) {
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      rows.forEach((r) => s.put(r));
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }

  function clearStore(db) {
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).clear();
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }

  function getAll(db) {
    return new Promise((res, rej) => {
      const r = tx(db, STORE, 'readonly').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  async function fetchAllFiles(onProgress) {
    // file:// altında fetch engellenir; o durumda gömülü paketi kullan.
    if (location.protocol === 'file:' && Array.isArray(global.ADA_DATA)) {
      if (onProgress) onProgress(FILES.length, FILES.length);
      return global.ADA_DATA.slice();
    }
    const out = [];
    for (let i = 0; i < FILES.length; i++) {
      const f = FILES[i];
      try {
        const resp = await fetch(f, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(resp.status + ' ' + f);
        const arr = await resp.json();
        if (Array.isArray(arr)) out.push.apply(out, arr);
      } catch (e) {
        console.warn('[ada] veri dosyası atlandı:', f, e.message);
      }
      if (onProgress) onProgress(i + 1, FILES.length);
    }
    // Ağdan hiçbir şey gelmediyse gömülü pakete düş.
    if (!out.length && Array.isArray(global.ADA_DATA)) {
      console.warn('[ada] JSON okunamadı, gömülü paket kullanılıyor');
      return global.ADA_DATA.slice();
    }
    return out;
  }

  /**
   * Load terms: from IndexedDB when already imported at the current
   * DATA_VERSION, otherwise fetch the JSON files and import them.
   *
   * file:// protokolünde (çift tıklayarak açılış) IndexedDB ve fetch çoğu
   * tarayıcıda kısıtlıdır; bu durumda gömülü ADA_DATA paketine düşülür.
   * Windows'ta çift tıklama ile açılışta da bu sayede veri her zaman yüklenir.
   */
  async function load(onProgress) {
    const isFile = location.protocol === 'file:';

    // file:// → IndexedDB/fetch uğraştırmadan gömülü paketi kullan.
    if (isFile) {
      const terms = await fetchAllFiles(onProgress);
      if (terms.length) return { terms: terms, cached: false };
    }

    let db;
    try {
      db = await open();
    } catch (e) {
      console.warn('[ada] IndexedDB yok, bellekten çalışılıyor:', e);
      return { terms: await fetchAllFiles(onProgress), cached: false };
    }

    const ver = await getMeta(db, 'dataVersion');
    if (ver === DATA_VERSION) {
      const rows = await getAll(db);
      if (rows.length) return { terms: rows, cached: true };
    }

    const terms = await fetchAllFiles(onProgress);
    if (terms.length) {
      await clearStore(db);
      await putAll(db, terms);
      await setMeta(db, 'dataVersion', DATA_VERSION);
      await setMeta(db, 'importedAt', new Date().toISOString());
    }
    return { terms: terms, cached: false };
  }

  global.AdaDB = { load: load, DATA_VERSION: DATA_VERSION, FILES: FILES };
})(window);
