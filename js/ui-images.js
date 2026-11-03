(function (root) {
  'use strict';
  const AI = root.AI;
  const str = (v) => (v == null ? '' : String(v)).trim();
  const KINDS = ['logo', 'cop', 'tt', 'dott'];
  const HINT = {
    logo: 'Dipaparkan di penjuru kiri atas dokumen. Disyorkan PNG berlatar lutsinar atau putih.',
    cop: 'Tangkap gambar cop di atas kertas putih dengan cahaya terang. Latar putih dibuang secara automatik.',
    tt: 'Tandatangan di atas kertas putih, gambar rapat dan cahaya terang.',
    dott: 'Pilihan. Kosongkan untuk guna tandatangan utama pada Delivery Order.'
  };

  /**
   * S-09 Logo, Cop & Tandatangan.
   * ctx: { UI, esc, icon, toast, render, store(), api(), email() }
   * Keadaan: UI.img = { items:{kind:{id,url,aspect,pending,removed}}, pos, sel, loaded }
   */
  AI.ImagesUI = function (ctx) {
    const { UI, esc } = ctx;
    let imgStore = null;
    const origs = {};                       // gambar asal (belum diproses) untuk proses semula bila toleransi diubah
    const S = () => UI.img || (UI.img = { items: {}, pos: AI.signPos({}), sel: 'cop', loaded: false, busy: false });
    const sk = () => (UI.data && UI.data.syarikat) || {};
    const store = () => {
      if (!imgStore || imgStore.api !== ctx.api()) { imgStore = new AI.ImageStore({ api: ctx.api(), idb: AI.idb, folderId: UI.ws && UI.ws.folders.settings }); imgStore.api = ctx.api(); }
      return imgStore;
    };
    const item = (k) => S().items[k] || (S().items[k] = { id: '', url: '', aspect: 1, pending: null, removed: false });
    const shown = (k) => { const it = item(k); return it.removed ? null : it.pending || (it.url ? it : null); };

    // dimensi sebenar gambar daripada URL data (untuk aspek)
    const measure = (url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalHeight / im.naturalWidth || 1); im.onerror = () => res(1); im.src = url; });

    // Muat gambar tersimpan (cache IndexedDB kemudian Drive). Dipanggil bila ruang kerja dibuka.
    async function loadAll() {
      if (!UI.ws || !UI.ws.ready) return;
      const st = S();
      for (const k of KINDS) {
        const id = str(sk()[AI.IMG_KEYS[k]]);
        const it = item(k);
        if (it.pending || it.removed) continue;
        if (!id) { it.id = ''; it.url = ''; continue; }
        if (it.id === id && it.url) continue;
        try {
          const url = await store().get(id);
          it.id = url ? id : ''; it.url = url || ''; it.aspect = url ? await measure(url) : 1;
        } catch (e) { /* luar talian: pratonton tiada, tetapi fail tidak hilang */ }
      }
      if (!UI.dirty || UI.view !== 'imej') st.pos = AI.signPos(sk());
      st.loaded = true;
      ctx.render();
    }
    function reset() { UI.img = null; imgStore = null; Object.keys(origs).forEach((k) => delete origs[k]); }

    // Untuk pratonton kepala dokumen di skrin lain
    const imgOf = (k) => { const it = item(k); const v = shown(k); return v && v.url ? { url: v.url, aspect: v.aspect || it.aspect || 1 } : null; };
    const signItems = () => ({ cop: imgOf('cop'), tt: imgOf('tt') });
    const signStatic = () => AI.signHtml(AI.signPos(sk()), signItems(), { static: true });

    // ---------- paparan ----------
    function tile(k) {
      const it = item(k), v = shown(k);
      const removable = k === 'cop' || k === 'tt' || k === 'dott';
      const rw = removable && it.pending && origs[k];
      const mainTt = k === 'dott' && !v && imgOf('tt');
      return `<div class="itile" data-kind="${k}">
        <div class="ithumb ${k === 'logo' ? '' : 'chk'}">${v ? `<img src="${esc(v.url)}" alt="${esc(AI.IMG_LABEL[k])}">`
          : mainTt ? `<img class="ghost" src="${esc(mainTt.url)}" alt="">` : `<span>${ctx.icon('image')}<small>Belum ada</small></span>`}</div>
        <div class="imeta"><b>${esc(AI.IMG_LABEL[k])}</b>${k === 'dott' && mainTt ? '<small class="muted">Guna tandatangan utama</small>' : ''}
          <small class="muted">${esc(HINT[k])}</small>
          <div class="iacts">
            <label class="btn sm"><input type="file" accept="image/png,image/jpeg,image/webp" data-imgfile="${k}" hidden>${ctx.icon('upload')}${v ? 'Tukar' : 'Muat naik'}</label>
            ${v ? `<button type="button" class="btn sm" data-act="imgRemove" data-kind="${k}">Buang</button>` : ''}
          </div>
          ${rw ? `<label class="sw sm"><input type="checkbox" data-imgrw="${k}" ${it.pending.removeWhite ? 'checked' : ''}> Buang latar putih</label>
            <div class="tol ${it.pending.removeWhite ? '' : 'off'}"><label for="tol-${k}">Toleransi <span data-tolval="${k}">${it.pending.tol}</span></label>
            <input id="tol-${k}" type="range" min="5" max="80" step="1" value="${it.pending.tol}" data-imgtol="${k}" ${it.pending.removeWhite ? '' : 'disabled'}></div>` : ''}
          ${it.pending ? '<small class="pend">Belum disimpan</small>' : ''}
        </div></div>`;
    }

    function editor() {
      const st = S(), has = { cop: !!imgOf('cop'), tt: !!imgOf('tt') };
      const lim = AI.SIGN_LIMITS;
      const sel = st.sel === 'tt' ? 'tt' : 'cop';
      const p = st.pos[sel];
      if (!has.cop && !has.tt) return `<div class="empty small"><p>Muat naik cop atau tandatangan untuk menyusun kedudukannya.</p></div>`;
      return `<div class="sign-ed">
        <div class="seg" role="group" aria-label="Pilih item untuk disusun">
          <button type="button" class="${sel === 'cop' ? 'on' : ''}" data-act="selSign" data-k="cop" ${has.cop ? '' : 'disabled'}>Cop</button>
          <button type="button" class="${sel === 'tt' ? 'on' : ''}" data-act="selSign" data-k="tt" ${has.tt ? '' : 'disabled'}>Tandatangan</button>
        </div>
        <div class="sbox-wrap" id="sboxWrap">${AI.signHtml(st.pos, signItems(), { selected: sel })}</div>
        <p class="fine">Tarik cop atau tandatangan dengan jari atau tetikus. Boleh bertindih. Dalam PDF, tandatangan sentiasa di atas cop.</p>
        <div class="nudge-row">
          <div class="nudge" role="group" aria-label="Gerak halus 1px">
            <button type="button" data-nudge="0,-1" aria-label="Naik">${ctx.icon('up')}</button>
            <button type="button" data-nudge="-1,0" aria-label="Kiri">${ctx.icon('left')}</button>
            <button type="button" data-nudge="1,0" aria-label="Kanan">${ctx.icon('right')}</button>
            <button type="button" data-nudge="0,1" aria-label="Turun">${ctx.icon('down')}</button>
          </div>
          <div class="size"><label for="signSize">Saiz <span id="sizeVal">${Math.round(p.w)}px</span></label>
            <input id="signSize" type="range" min="${lim[sel].min}" max="${lim[sel].max}" step="1" value="${Math.round(p.w)}" data-signsize></div>
        </div>
        <button type="button" class="btn ghost" data-act="signReset">Reset kedudukan &amp; saiz asal</button>
      </div>`;
    }

    function viewImej() {
      const st = S();
      return `<header class="page-head"><div><button class="link-back" data-act="backToSettings">${ctx.icon('back')}Tetapan</button><h1>Logo, Cop &amp; Tandatangan</h1><small class="muted">Gambar disimpan dalam folder _Tetapan di Drive anda</small></div></header>
        ${st.loaded || !(UI.ws && UI.ws.ready) ? '' : '<p class="muted">Memuatkan gambar...</p>'}
        <div class="split">
          <div class="stack">
            <section class="card"><h2>Gambar</h2><div class="itiles">${KINDS.map(tile).join('')}</div></section>
            <section class="card"><h2>Kedudukan cop &amp; tandatangan</h2>${editor()}</section>
            <div class="save-bar"><button type="button" class="btn" data-act="backToSettings">Batal</button><button type="button" class="btn primary" data-act="saveImej" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Menyimpan...' : 'Simpan'}</button></div>
          </div>
          <aside class="preview-col"><small class="muted">Pratonton</small><div data-live="header">${ctx.header()}</div></aside>
        </div>`;
    }

    // ---------- tindakan ----------
    async function pick(k, file) {
      const bad = AI.checkImageFile(file);
      if (bad) { ctx.toast(bad, true); return; }
      try {
        const src = await AI.loadImageFile(file);
        origs[k] = src;
        const it = item(k);
        const rw = k !== 'logo', tol = (it.pending && it.pending.tol) || 30;
        const out = await AI.processImage(src, { removeWhite: rw, tol });
        it.pending = Object.assign(out, { removeWhite: rw, tol }); it.removed = false;
        UI.dirty = true;
      } catch (e) { ctx.toast(e.message, true); return; }
      ctx.render();
    }
    async function reprocess(k) {
      const it = item(k); if (!it.pending || !origs[k]) return;
      const { removeWhite, tol } = it.pending;
      try {
        const out = await AI.processImage(origs[k], { removeWhite, tol });
        it.pending = Object.assign(out, { removeWhite, tol });
      } catch (e) { ctx.toast(e.message, true); }
      updateTile(k);
    }
    function updateTile(k) {
      const t = document.querySelector(`.itile[data-kind="${k}"] .ithumb`); const v = shown(k);
      if (t && v) t.innerHTML = `<img src="${esc(v.url)}" alt="${esc(AI.IMG_LABEL[k])}">`;
      refreshPreview();
    }
    function refreshPreview() {
      const box = document.getElementById('sboxWrap');
      if (box) { box.innerHTML = AI.signHtml(S().pos, signItems(), { selected: S().sel }); }
      document.querySelectorAll('[data-live="header"]').forEach((el) => { el.innerHTML = ctx.header(); });
    }

    const actions = {
      openImej() {
        const st = S(); st.pos = AI.signPos(sk()); st.sel = 'cop'; UI.dirty = false;
        KINDS.forEach((k) => { const it = item(k); it.pending = null; it.removed = false; });
        UI.view = 'imej'; ctx.render(); root.scrollTo(0, 0); loadAll();
      },
      imgRemove(el) {
        const k = el.dataset.kind, it = item(k);
        if (it.pending) { it.pending = null; delete origs[k]; if (!it.id) it.url = ''; } else it.removed = true;
        UI.dirty = true; ctx.render();
      },
      selSign(el) { S().sel = el.dataset.k; ctx.render(); },
      signReset() { S().pos = AI.signReset(); UI.dirty = true; ctx.render(); },
      async saveImej() {
        const st = S(); if (st.busy) return;
        st.busy = true; ctx.render();
        const upd = {}, drop = [];
        try {
          for (const k of KINDS) {
            const it = item(k);
            if (it.pending) {
              const r = await store().put(k, it.pending.bytes);
              if (it.id) drop.push(it.id);
              upd[AI.IMG_KEYS[k]] = r.id; it.id = r.id; it.url = r.url; it.aspect = it.pending.aspect; it.pending = null; delete origs[k];
            } else if (it.removed) {
              if (it.id) drop.push(it.id);
              upd[AI.IMG_KEYS[k]] = ''; it.id = ''; it.url = ''; it.removed = false;
            }
          }
          Object.assign(upd, AI.signToSettings(st.pos), { dikemaskini: new Date().toISOString() });
          ctx.store().setKV('Syarikat', upd);
          UI.data.syarikat = Object.assign({}, sk(), upd);
          await ctx.store().flush();
          for (const id of drop) await store().drop(id);       // buang fail lama hanya selepas rujukan baharu disimpan
          UI.dirty = false; ctx.toast('Gambar dan kedudukan disimpan.');
        } catch (e) { ctx.toast(AI.googleErrorHint(e), true); }
        st.busy = false; ctx.render();
      }
    };

    // ---------- interaksi (seret, anak panah, gelangsar, fail) ----------
    let drag = null, rep = null;
    const wrap = () => document.getElementById('sboxWrap');
    function apply(k, np, final) {
      const st = S(); st.pos[k] = np;
      const el = document.querySelector(`[data-sitem="${k}"]`);
      if (el) { el.style.left = (np.x / AI.SIGN_BOX.w * 100).toFixed(3) + '%'; el.style.top = (np.y / AI.SIGN_BOX.h * 100).toFixed(3) + '%'; el.style.width = (np.w / AI.SIGN_BOX.w * 100).toFixed(3) + '%'; }
      UI.dirty = true;
      if (final) document.querySelectorAll('[data-live="header"]').forEach((h) => { h.innerHTML = ctx.header(); });
    }
    const aspectOf = (k) => (imgOf(k) ? imgOf(k).aspect : 1);
    function nudge(dx, dy) { const k = S().sel; apply(k, AI.moveItem(S().pos[k], dx, dy, aspectOf(k)), true); }

    function bind(doc) {
      doc.addEventListener('pointerdown', (e) => {
        const nb = e.target.closest('[data-nudge]');
        if (nb) {
          const [dx, dy] = nb.dataset.nudge.split(',').map(Number);
          nudge(dx, dy);
          const t0 = setTimeout(() => { rep = setInterval(() => nudge(dx * 2, dy * 2), 60); }, 350);
          const stop = () => { clearTimeout(t0); clearInterval(rep); rep = null; doc.removeEventListener('pointerup', stop); doc.removeEventListener('pointercancel', stop); };
          doc.addEventListener('pointerup', stop); doc.addEventListener('pointercancel', stop);
          return;
        }
        const it = e.target.closest('[data-sitem]'); if (!it) return;
        const k = it.dataset.sitem, box = wrap().querySelector('[data-sbox]').getBoundingClientRect();
        if (S().sel !== k) { S().sel = k; ctx.render(); }
        const el = document.querySelector(`[data-sitem="${k}"]`);
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
        el.classList.add('sel', 'drag');
        drag = { k, id: e.pointerId, x: e.clientX, y: e.clientY, start: Object.assign({}, S().pos[k]), k2: AI.SIGN_BOX.w / box.width };
        e.preventDefault();
      });
      doc.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = (e.clientX - drag.x) * drag.k2, dy = (e.clientY - drag.y) * drag.k2;
        apply(drag.k, AI.moveItem(drag.start, dx, dy, aspectOf(drag.k)));
      });
      const end = (e) => { if (!drag || e.pointerId !== drag.id) return; const el = document.querySelector(`[data-sitem="${drag.k}"]`); if (el) el.classList.remove('drag'); apply(drag.k, S().pos[drag.k], true); drag = null; };
      doc.addEventListener('pointerup', end); doc.addEventListener('pointercancel', end);

      doc.addEventListener('keydown', (e) => {
        const it = e.target.closest && e.target.closest('[data-sitem]'); if (!it) return;
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key];
        if (!d) return;
        e.preventDefault(); S().sel = it.dataset.sitem; nudge(d[0], d[1]);
      });
    }

    function onChange(el) {
      if (el.dataset && el.dataset.imgfile) { const f = el.files && el.files[0]; el.value = ''; if (f) pick(el.dataset.imgfile, f); return true; }
      if (el.dataset && el.dataset.imgrw) { const k = el.dataset.imgrw; item(k).pending.removeWhite = el.checked; ctx.render(); reprocess(k); return true; }
      return false;
    }
    function onInput(el) {
      if (el.dataset && el.dataset.imgtol) {
        const k = el.dataset.imgtol, v = Number(el.value); item(k).pending.tol = v;
        const lbl = document.querySelector(`[data-tolval="${k}"]`); if (lbl) lbl.textContent = v;
        clearTimeout(onInput.t); onInput.t = setTimeout(() => reprocess(k), 120); return true;
      }
      if (el.dataset && el.dataset.signsize !== undefined) {
        const k = S().sel; apply(k, AI.resizeItem(S().pos[k], k, Number(el.value), aspectOf(k)), true);
        const l = document.getElementById('sizeVal'); if (l) l.textContent = Math.round(S().pos[k].w) + 'px';
        return true;
      }
      return false;
    }

    return { views: { imej: viewImej }, actions, bind, onChange, onInput, loadAll, reset, imgOf, signStatic };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
