(function (root) {
  'use strict';
  const AI = root.AI;
  const str = (v) => (v == null ? '' : String(v)).trim();

  /**
   * S-06 Rekod (dokumen terbit: tapis, cari, menu tindakan, batal) dan S-07 Pelanggan.
   * ctx: { UI, esc, icon, toast, render, store(), email(), worker(), openEditor(draft) }
   */
  AI.RecordsUI = function (ctx) {
    const { UI, esc } = ctx;
    const T = AI.DOC_TYPES;
    const sk = () => (UI.data && UI.data.syarikat) || {};
    const codes = () => (UI.data && UI.data.kodCukai) || [];
    const docs = () => (UI.data && UI.data.dokumen) || [];
    const rf = () => UI.rf || (UI.rf = { jenis: '', status: '', bulan: '', q: '' });
    const byId = (id) => docs().find((r) => str(r.doc_id) === id);
    const money = (r) => (r.jenis === 'do' ? '' : 'RM' + AI.fmtMoney(AI.toCents(r.jumlah) || 0));

    // ---------- S-06 ----------
    function rowHtml(r) {
      const st = AI.docState(r), qs = AI.quoteState(r);
      return `<div class="drow rec"><button class="dopen" data-act="docMenu" data-id="${esc(r.doc_id)}" aria-label="Tindakan untuk ${esc(r.no_dokumen)}">
          <b>${esc(r.no_dokumen)}</b><small class="muted">${esc((T[r.jenis] || {}).label || r.jenis)} · ${esc(AI.fmtDate(r.tarikh))} · ${esc(r.bill_nama)}</small>
          ${str(r.ditukar_kepada) ? `<small class="muted">→ ${esc(r.ditukar_kepada)}</small>` : ''}</button>
        <div class="dright">${money(r) ? `<b>${esc(money(r))}</b>` : ''}<span class="badge ${st.tone}">${st.label}</span>${qs ? `<span class="badge ${qs.tone}">${qs.label}</span>` : ''}
          ${r.pdf_url ? `<a class="btn sm" href="${esc(r.pdf_url)}" target="_blank" rel="noopener">PDF</a>` : '<span class="badge amber">PDF belum siap</span>'}
          <button class="ib" data-act="docMenu" data-id="${esc(r.doc_id)}" aria-label="Menu ${esc(r.no_dokumen)}">⋯</button></div></div>`;
    }
    function listHtml() {
      const all = docs();
      if (!all.length) return `<div class="empty"><p>Belum ada dokumen diterbit.</p></div>`;
      const rows = AI.filterDocs(all, rf());
      if (!rows.length) return `<div class="empty"><p>Tiada dokumen sepadan.</p></div>`;
      return `<p class="fine">${rows.length} dokumen</p><div class="dlist">${rows.map(rowHtml).join('')}</div>`;
    }
    function section() {
      const f = rf(), months = AI.monthsOf(docs());
      const mon = (m) => { const [y, mm] = m.split('-'); return `${mm}/${y}`; };
      return `<section class="card"><h2>Dokumen diterbit</h2>
        <form class="rfilters" data-form="rekod" onsubmit="return false">
          <div class="seg" role="group" aria-label="Jenis">${[['', 'Semua'], ['invoice', 'Invois'], ['quotation', 'Quotation'], ['do', 'DO']].map(([v, l]) => `<button type="button" class="${f.jenis === v ? 'on' : ''}" data-act="recType" data-v="${v}">${l}</button>`).join('')}</div>
          <div class="rf-row">
            <input class="inp" type="search" name="q" value="${esc(f.q)}" placeholder="Cari no. dokumen, pelanggan atau PO" aria-label="Cari">
            <select class="inp" name="status" aria-label="Status">${[['', 'Semua status'], ['terbit', 'Terbit (boleh edit)'], ['dikunci', 'Dikunci'], ['batal', 'Batal'], ['menunggu', 'Quotation menunggu'], ['ditukar', 'Quotation ditukar']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <select class="inp" name="bulan" aria-label="Bulan"><option value="">Semua bulan</option>${months.map((m) => `<option value="${m}" ${f.bulan === m ? 'selected' : ''}>${mon(m)}</option>`).join('')}</select>
          </div>
        </form>
        <div data-reclist>${listHtml()}</div></section>`;
    }
    function onInput(el) {
      const form = el.closest && el.closest('[data-form="rekod"]'); if (!form || !el.name) return false;
      rf()[el.name] = el.value;
      const box = document.querySelector('[data-reclist]'); if (box) box.innerHTML = listHtml();
      return true;
    }

    function menuModal() {
      const r = UI.menuDoc && byId(UI.menuDoc); if (!r) return '';
      const st = AI.docState(r), batal = st.key === 'batal';
      const wa = r.pdf_url ? 'https://wa.me/?text=' + encodeURIComponent(AI.waText(((T[r.jenis] || {}).title) || '', r.no_dokumen, r.bill_nama, r.pdf_url)) : '';
      const b = (act, label, extra) => `<button class="btn${extra || ''}" data-act="${act}" data-id="${esc(r.doc_id)}">${label}</button>`;
      return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="mTitle"><div class="sheet">
        <h2 id="mTitle">${esc(r.no_dokumen)}</h2>
        <p class="muted">${esc((T[r.jenis] || {}).label)} · ${esc(r.bill_nama)}${money(r) ? ' · ' + esc(money(r)) : ''}</p>
        <p><span class="badge ${st.tone}">${st.label}</span> ${st.editable ? `<small class="muted">Boleh diedit sehingga ${esc(new Date(st.until).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' }))}</small>` : ''}
          ${batal ? `<small class="muted">Dibatalkan ${esc(AI.fmtDate(str(r.dibatalkan_pada).slice(0, 10)))}: ${esc(r.sebab_batal)}</small>` : ''}</p>
        <div class="sheet-acts">
          ${r.pdf_url ? `<a class="btn primary" href="${esc(r.pdf_url)}" target="_blank" rel="noopener">Buka PDF</a>` : ''}
          ${st.editable ? b('docEdit', 'Edit') : ''}
          ${!batal && r.jenis === 'quotation' ? b('docToInvoice', 'Tukar jadi Invois') : ''}
          ${!batal && r.jenis !== 'do' ? b('docToDo', 'Buat Delivery Order') : ''}
          ${b('docCopy', 'Salin sebagai draf baharu')}
          ${wa && !batal ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Hantar melalui WhatsApp</a>` : ''}
          ${st.voidable ? b('docVoidAsk', 'Batal dokumen', ' danger-o') : ''}
          <button class="btn ghost" data-act="closeModal">Tutup</button>
        </div></div></div>`;
    }
    function voidModal() {
      const r = UI.menuDoc && byId(UI.menuDoc); if (!r) return '';
      return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="vTitle"><div class="sheet">
        <h2 id="vTitle">Batal ${esc(r.no_dokumen)}?</h2>
        <p>Dokumen akan ditanda <b>Batal</b>. Nombor ini tidak akan digunakan semula, kredit tidak dikembalikan, dan rekod kekal dalam Sheet.</p>
        <div class="fld"><label for="voidReason">Sebab batal <span class="req">*</span></label><textarea id="voidReason" class="inp" rows="2" placeholder="cth Harga salah, pelanggan batal pesanan"></textarea>${UI.voidErr ? `<p class="ferr">${esc(UI.voidErr)}</p>` : ''}</div>
        <div class="sheet-acts"><button class="btn danger" data-act="docVoidGo" data-id="${esc(r.doc_id)}" ${UI.voidBusy ? 'disabled' : ''}>${UI.voidBusy ? 'Membatalkan...' : 'Batal dokumen'}</button>
          <button class="btn ghost" data-act="closeModal">Kembali</button></div></div></div>`;
    }

    // ---------- S-07 Pelanggan ----------
    const custs = () => (UI.data && UI.data.pelanggan) || [];
    const pf = () => UI.pf || (UI.pf = { q: '', arkib: false });
    function custList() {
      const q = AI.normName(pf().q);
      const rows = custs().filter((c) => (pf().arkib || str(c.arkib).toUpperCase() !== 'YA') && (!q || AI.normName(c.nama).includes(q) || AI.normName(c.tel).includes(q)))
        .sort((a, b) => AI.normName(a.nama).localeCompare(AI.normName(b.nama)));
      if (!custs().length) return `<div class="empty">${ctx.icon('users', 'xl')}<p>Belum ada pelanggan.</p><small class="muted">Tambah di sini, atau tekan "Simpan ke senarai pelanggan" semasa mengisi dokumen.</small></div>`;
      if (!rows.length) return `<div class="empty"><p>Tiada pelanggan sepadan.</p></div>`;
      return `<div class="dlist">${rows.map((c) => {
        const n = AI.docsOfCustomer(c, docs()).length, ark = str(c.arkib).toUpperCase() === 'YA';
        return `<div class="drow"><button class="dopen" data-act="custEdit" data-id="${esc(c.id)}"><b>${esc(c.nama)}</b>
          <small class="muted">${esc([str(c.alamat).split('\n')[0], c.tel].filter(Boolean).join(' · ') || '—')}</small></button>
          <div class="dright"><small class="muted">${n} dokumen</small>${ark ? '<span class="badge grey">Arkib</span>' : `<button class="btn sm" data-act="custNewDoc" data-id="${esc(c.id)}">Invois baharu</button>`}</div></div>`;
      }).join('')}</div>`;
    }
    function viewPelanggan() {
      return `<header class="page-head"><h1>Pelanggan</h1><button class="btn primary" data-act="custNew">${ctx.icon('plus')}Tambah</button></header>
        <section class="card"><form class="rfilters" data-form="cust-filter" onsubmit="return false"><div class="rf-row">
          <input class="inp" type="search" name="q" value="${esc(pf().q)}" placeholder="Cari nama atau telefon" aria-label="Cari pelanggan">
          <label class="sw"><input type="checkbox" name="arkib" ${pf().arkib ? 'checked' : ''}> Tunjuk arkib</label></div></form>
          <div data-custlist>${custList()}</div></section>`;
    }
    function custModal() {
      const c = UI.cust; if (!c) return '';
      const e = UI.custErr || {};
      const f = (k, label, o) => { o = o || {}; const id = 'c-' + k;
        const el = o.rows ? `<textarea id="${id}" name="${k}" class="inp" rows="${o.rows}">${esc(c[k])}</textarea>` : `<input id="${id}" name="${k}" class="inp" value="${esc(c[k])}" ${o.type ? `type="${o.type}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} placeholder="${esc(o.placeholder || '')}">`;
        return `<div class="fld"><label for="${id}">${esc(label)}${o.required ? ' <span class="req">*</span>' : ''}</label>${el}${e[k] ? `<p class="ferr">${esc(e[k])}</p>` : ''}</div>`; };
      const ark = str(c.arkib).toUpperCase() === 'YA';
      return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="cTitle"><div class="sheet wide">
        <h2 id="cTitle">${c.id ? 'Edit pelanggan' : 'Pelanggan baharu'}</h2>
        <form data-form="cust" novalidate onsubmit="return false">
          ${f('nama', 'Nama', { required: true, placeholder: 'cth Contoh Trading Sdn Bhd' })}
          ${f('alamat', 'Alamat', { rows: 3 })}
          <div class="grid2">${f('tel', 'No. telefon', { type: 'tel', inputmode: 'tel' })}${f('attn', 'Attn', {})}</div>
          <div class="grid2">${f('emel', 'E-mel', { type: 'email' })}${f('tin', 'TIN (pilihan)', {})}</div>
          ${f('brn', 'BRN (pilihan)', {})}
        </form>
        ${UI.custDup ? `<p class="note warn">Nama ini sama dengan pelanggan sedia ada <b>${esc(UI.custDup.nama)}</b>. Tekan Simpan sekali lagi untuk teruskan juga.</p>` : ''}
        <div class="sheet-acts"><button class="btn primary" data-act="custSave">Simpan</button>
          ${c.id ? `<button class="btn" data-act="custArchive">${ark ? 'Pulihkan dari arkib' : 'Arkibkan'}</button>` : ''}
          <button class="btn ghost" data-act="closeModal">Batal</button></div></div></div>`;
    }
    const readCust = () => {
      const c = Object.assign({}, UI.cust);
      document.querySelectorAll('[data-form="cust"] [name]').forEach((el) => { c[el.name] = el.value.replace(/\r/g, '').trim(); });
      return c;
    };

    const actions = {
      recType(el) { rf().jenis = el.dataset.v; ctx.render(); },
      docMenu(el) { UI.menuDoc = el.dataset.id; UI.modal = 'docmenu'; ctx.render(); },
      docEdit(el) {
        const r = byId(el.dataset.id); if (!r) return;
        if (!AI.docState(r).editable) { ctx.toast('Tempoh edit 24 jam telah tamat. Batalkan dan terbit dokumen baharu.', true); return; }
        UI.modal = ''; ctx.openEditor(AI.draftForEdit(r, sk(), codes(), ctx.email()));
      },
      docToInvoice(el) { const r = byId(el.dataset.id); if (r) { UI.modal = ''; ctx.openEditor(AI.draftConvert(r, 'invoice', sk(), codes(), ctx.email())); } },
      docToDo(el) { const r = byId(el.dataset.id); if (r) { UI.modal = ''; ctx.openEditor(AI.draftConvert(r, 'do', sk(), codes(), ctx.email())); } },
      docCopy(el) { const r = byId(el.dataset.id); if (r) { UI.modal = ''; ctx.openEditor(AI.draftCopy(r, sk(), codes(), ctx.email())); } },
      docVoidAsk(el) { UI.menuDoc = el.dataset.id; UI.voidErr = ''; UI.modal = 'void'; ctx.render(); setTimeout(() => { const t = document.getElementById('voidReason'); if (t) t.focus(); }, 0); },
      async docVoidGo(el) {
        const r = byId(el.dataset.id); if (!r || UI.voidBusy) return;
        const reason = str((document.getElementById('voidReason') || {}).value);
        if (reason.length < 3) { UI.voidErr = 'Nyatakan sebab (sekurang-kurangnya 3 aksara).'; ctx.render(); return; }
        UI.voidBusy = true; ctx.render();
        try {
          const res = await ctx.worker('POST', '/api/void', { docId: r.doc_id });
          if (!res.body || !res.body.ok) throw new Error((res.body && res.body.error) || 'Gagal membatalkan (HTTP ' + res.status + ')');
          const upd = { doc_id: r.doc_id, status: 'Batal', dibatalkan_pada: new Date().toISOString(), sebab_batal: reason };
          ctx.store().update('Dokumen', 'doc_id', upd);
          Object.assign(r, upd);
          await ctx.store().flush();
          UI.modal = ''; UI.menuDoc = null; ctx.toast(r.no_dokumen + ' dibatalkan.');
        } catch (e) { ctx.toast(e.network ? 'Tiada sambungan internet.' : AI.googleErrorHint(e), true); }
        UI.voidBusy = false; ctx.render();
      },

      custNew() { UI.cust = { id: '', nama: '', alamat: '', tel: '', attn: '', emel: '', tin: '', brn: '', arkib: 'TIDAK' }; UI.custErr = {}; UI.custDup = null; UI.modal = 'cust'; ctx.render(); },
      custEdit(el) { const c = custs().find((x) => x.id === el.dataset.id); if (!c) return; UI.cust = Object.assign({}, c); UI.custErr = {}; UI.custDup = null; UI.modal = 'cust'; ctx.render(); },
      custSave() {
        const c = readCust();
        const v = AI.validateCustomer(c, custs(), c.id);
        UI.custErr = v.errors;
        if (Object.keys(v.errors).length) { UI.cust = c; ctx.render(); return; }
        if (v.duplicate && !(UI.custDup && UI.custDup.id === v.duplicate.id)) { UI.cust = c; UI.custDup = v.duplicate; ctx.render(); return; }
        const rec = { id: c.id || 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), nama: c.nama, alamat: c.alamat, tel: c.tel, attn: c.attn, emel: c.emel, tin: c.tin, brn: c.brn,
          arkib: str(c.arkib) || 'TIDAK', dicipta: c.dicipta || new Date().toISOString() };
        if (c.id) { ctx.store().update('Pelanggan', 'id', rec); UI.data.pelanggan = custs().map((x) => (x.id === rec.id ? Object.assign({}, x, rec) : x)); }
        else { ctx.store().append('Pelanggan', [rec], 'id'); UI.data.pelanggan = custs().concat([rec]); }
        UI.modal = ''; UI.cust = null; UI.custDup = null; ctx.toast(rec.nama + ' disimpan.'); ctx.render();
      },
      custArchive() {
        const c = readCust(); if (!c.id) return;
        const arkib = str(c.arkib).toUpperCase() === 'YA' ? 'TIDAK' : 'YA';
        ctx.store().update('Pelanggan', 'id', { id: c.id, arkib });
        UI.data.pelanggan = custs().map((x) => (x.id === c.id ? Object.assign({}, x, { arkib }) : x));
        UI.modal = ''; UI.cust = null; ctx.toast(arkib === 'YA' ? c.nama + ' diarkibkan.' : c.nama + ' dipulihkan.'); ctx.render();
      },
      custNewDoc(el) {
        const c = custs().find((x) => x.id === el.dataset.id); if (!c) return;
        const d = AI.newDraft('invoice', sk(), codes(), { email: ctx.email() });
        Object.assign(d, { pelanggan_id: c.id, bill_nama: str(c.nama), bill_alamat: str(c.alamat), bill_tel: str(c.tel), attn: str(c.attn) });
        ctx.openEditor(d);
      }
    };
    function onInputCust(el) {
      const form = el.closest && el.closest('[data-form="cust-filter"]'); if (!form || !el.name) return false;
      if (el.name === 'arkib') pf().arkib = el.checked; else pf()[el.name] = el.value;
      const box = document.querySelector('[data-custlist]'); if (box) box.innerHTML = custList();
      return true;
    }
    function modal() { return UI.modal === 'docmenu' ? menuModal() : UI.modal === 'void' ? voidModal() : UI.modal === 'cust' ? custModal() : ''; }

    return { section, views: { pelanggan: viewPelanggan }, actions, modal, onInput: (el) => onInput(el) || onInputCust(el) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
