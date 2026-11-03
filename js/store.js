(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const str = (v) => (v == null ? '' : String(v)).trim();
  const READ_TABS = ['Meta', 'Syarikat', 'KodCukai', 'Pelanggan', 'Dokumen'];

  AI.writerId = () => {
    let w = AI.session ? AI.session.get('ai-writer', '') : '';
    if (!w) { w = 'w' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); if (AI.session) AI.session.set('ai-writer', w); }
    return w;
  };

  /**
   * Lapisan storan atas Sheet pengguna.
   * - Baca ikut nama lajur (pengguna boleh susun semula / tambah lajur sendiri).
   * - Tulisan dibariskan (queue), digabung (debounce) dan disimpan ke peranti (persist) supaya tidak hilang.
   * - Konflik: jika Meta.dikemaskini berubah oleh penulis lain sejak dimuat, tulisan ditahan (tidak ditimpa senyap).
   * opts: { id, email, writer, now(), debounceMs, persist(pending) async, onStatus(state, info) }
   * Status: idle | saving | saved | reconnect | offline | conflict | error
   */
  AI.Store = function (api, opts) {
    const self = this;
    const now = opts.now || (() => Date.now());
    const debounceMs = opts.debounceMs == null ? 800 : opts.debounceMs;
    let values = {};           // tab → baris mentah
    let base = '';             // versi Meta ("dikemaskini|penulis") semasa dimuat / ditulis terakhir
    const rev = (m) => str(m.dikemaskini) + '|' + str(m.penulis);
    let pending = [];          // op belum ditulis
    let timer = null, chain = Promise.resolve(), waiters = [];
    this.status = 'idle'; this.info = {};

    const setStatus = (s, info) => { self.status = s; self.info = info || {}; if (opts.onStatus) opts.onStatus(s, self.info); };
    const save = () => (opts.persist ? Promise.resolve(opts.persist(pending.slice())).catch(() => {}) : Promise.resolve());

    // ---------- baca ----------
    this.load = async () => {
      values = await api.batchGet(opts.id, READ_TABS);
      base = rev(AI.kvOf(values.Meta));
      return self.snapshot();
    };
    this.list = (tab) => AI.rowsToObjects(values[tab]).rows;
    this.kv = (tab) => AI.kvOf(values[tab]);
    this.snapshot = () => ({
      meta: self.kv('Meta'), syarikat: self.kv('Syarikat'), kodCukai: self.list('KodCukai'),
      pelanggan: self.list('Pelanggan'), dokumen: self.list('Dokumen')
    });
    this.pending = () => pending.slice();

    // ---------- tulis (dibariskan) ----------
    const enqueue = (op, delay) => {
      pending.push(op); save();
      clearTimeout(timer);
      const p = new Promise((res, rej) => waiters.push({ res, rej }));
      p.catch(() => {}); // pemanggil boleh abaikan; status dipaparkan melalui onStatus
      timer = setTimeout(() => { self.flush().catch(() => {}); }, delay);
      return p;
    };
    // kunci/nilai (Syarikat, Meta): digabung dengan debounce
    this.setKV = (tab, obj) => enqueue({ type: 'kv', tab, values: obj }, debounceMs);
    // baris baharu; idField menjadikan cuba semula selamat (tidak tambah dua kali)
    this.append = (tab, objs, idField) => enqueue({ type: 'append', tab, rows: objs, idField }, 0);
    // kemas kini satu baris ikut id (medan yang tiada dikekalkan)
    this.update = (tab, idField, obj) => enqueue({ type: 'update', tab, idField, obj }, 0);
    this.restore = (ops) => { if (Array.isArray(ops) && ops.length) { pending = ops.concat(pending); save(); } };

    this.flush = () => {
      clearTimeout(timer);
      const run = chain.then(() => doFlush());
      chain = run.catch(() => {});
      return run;
    };

    async function doFlush() {
      const ops = pending.slice();
      const ws = waiters; waiters = [];
      const settle = (err) => ws.forEach((w) => (err ? w.rej(err) : w.res()));
      if (!ops.length) { if (self.status !== 'conflict') setStatus('saved'); settle(); return; }
      setStatus('saving');
      try {
        const tabs = Array.from(new Set(ops.map((o) => o.tab).concat(['Meta'])));
        const fresh = await api.batchGet(opts.id, tabs);
        const meta = AI.kvOf(fresh.Meta);
        const remote = rev(meta);
        const needCheck = ops.some((o) => o.type !== 'append');
        if (needCheck && base && str(meta.dikemaskini) && remote !== base && str(meta.penulis) !== opts.writer) {
          const e = new Error('Sheet telah diubah di peranti atau tab lain sejak dimuat.'); e.status = 409; e.conflict = true;
          e.remote = { dikemaskini: str(meta.dikemaskini), oleh: str(meta.oleh) };
          throw e;
        }

        const data = [], appends = {};
        const kvMerged = {};
        ops.forEach((o) => {
          const head = ((fresh[o.tab] || [])[0] || []).map(str);
          if (o.type === 'kv') { kvMerged[o.tab] = Object.assign(kvMerged[o.tab] || {}, o.values); return; }
          const parsed = AI.rowsToObjects(fresh[o.tab]);
          const has = (idf, v) => parsed.rows.find((r) => str(r[idf]) === str(v));
          if (o.type === 'update') {
            const hit = has(o.idField, o.obj[o.idField]);
            if (hit) { data.push({ range: AI.range(o.tab, 'A' + hit._row), values: [AI.objectToRow(head, o.obj, fresh[o.tab][hit._row - 1])] }); return; }
            (appends[o.tab] = appends[o.tab] || []).push(AI.objectToRow(head, o.obj)); return;
          }
          o.rows.forEach((obj) => {
            if (o.idField && has(o.idField, obj[o.idField])) return; // sudah ditulis (cuba semula)
            (appends[o.tab] = appends[o.tab] || []).push(AI.objectToRow(head, obj));
          });
        });
        Object.keys(kvMerged).forEach((tab) => data.push(...AI.kvUpsert(tab, fresh[tab], kvMerged[tab])));
        const stamp = new Date(now()).toISOString();
        data.push(...AI.kvUpsert('Meta', fresh.Meta, { dikemaskini: stamp, oleh: opts.email || '', penulis: opts.writer || '' }));

        for (const tab of Object.keys(appends)) await api.append(opts.id, tab, appends[tab]);
        await api.setValues(opts.id, data);

        pending = pending.filter((o) => !ops.includes(o)); save();
        base = stamp + '|' + str(opts.writer);
        const after = await api.batchGet(opts.id, Array.from(new Set(READ_TABS.filter((t) => tabs.includes(t)).concat(['Meta']))));
        Object.assign(values, after);
        setStatus(pending.length ? 'saving' : 'saved', { at: stamp });
        settle();
        if (pending.length) return doFlush();
      } catch (e) {
        if (e.conflict) setStatus('conflict', { remote: e.remote, message: e.message });
        else if (e.needsLogin) setStatus('reconnect', { message: AI.googleErrorHint(e) });
        else if (e.network) setStatus('offline', { message: AI.googleErrorHint(e) });
        else setStatus('error', { message: AI.googleErrorHint(e) });
        settle(e);
        throw e;
      }
    }

    // Konflik: 'reload' buang tulisan tertangguh & muat data terkini; 'overwrite' simpan versi peranti ini juga
    this.resolveConflict = async (mode) => {
      if (mode === 'reload') { pending = []; await save(); await self.load(); setStatus('saved'); return; }
      base = rev(AI.kvOf(await api.getValues(opts.id, 'Meta')));
      return self.flush();
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
