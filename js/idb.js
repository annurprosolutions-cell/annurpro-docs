(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  // IndexedDB kecil: stor 'kv' (cache tetapan, gambar, tulisan tertangguh) dan 'drafts' (draf dokumen).
  // Jatuh balik ke memori jika IndexedDB tiada (mod peribadi tertentu, ujian Node).
  const DB = 'annur-invoice', VER = 1, STORES = ['kv', 'drafts'];

  function memory() {
    const m = { kv: new Map(), drafts: new Map() };
    return {
      kind: 'memory',
      get: async (s, k) => (m[s].has(k) ? structuredClone(m[s].get(k)) : undefined),
      set: async (s, k, v) => { m[s].set(k, structuredClone(v)); },
      del: async (s, k) => { m[s].delete(k); },
      all: async (s) => Array.from(m[s].values()).map((v) => structuredClone(v))
    };
  }

  function indexed(idb) {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = idb.open(DB, VER);
      r.onupgradeneeded = () => STORES.forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (s, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(s, mode), st = t.objectStore(s);
        const r = fn(st);
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    };
    return {
      kind: 'indexeddb',
      get: (s, k) => tx(s, 'readonly', (st) => st.get(k)),
      set: (s, k, v) => tx(s, 'readwrite', (st) => st.put(v, k)),
      del: (s, k) => tx(s, 'readwrite', (st) => st.delete(k)),
      all: (s) => tx(s, 'readonly', (st) => st.getAll())
    };
  }

  AI.makeIdb = (idb) => {
    if (!idb) return memory();
    const real = indexed(idb), mem = memory();
    let broken = false;
    const wrap = (fn) => async (...a) => { if (broken) return mem[fn](...a); try { return await real[fn](...a); } catch (e) { broken = true; return mem[fn](...a); } };
    return { kind: 'indexeddb', get: wrap('get'), set: wrap('set'), del: wrap('del'), all: wrap('all') };
  };
  AI.idb = AI.makeIdb(root.indexedDB || null);

  // ---------- draf dokumen (disimpan di peranti, tanpa nombor) ----------
  AI.drafts = {
    save: async (d) => {
      const id = d.id || ('d-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      const rec = Object.assign({}, d, { id, dikemaskini: new Date().toISOString() });
      await AI.idb.set('drafts', id, rec);
      return rec;
    },
    list: async (email) => (await AI.idb.all('drafts')).filter((d) => !email || d.email === email).sort((a, b) => String(b.dikemaskini).localeCompare(String(a.dikemaskini))),
    get: (id) => AI.idb.get('drafts', id),
    del: (id) => AI.idb.del('drafts', id)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
