(function (root) {
  'use strict';
  const AI = root.AI;
  const str = (v) => (v == null ? '' : String(v)).trim();
  const norm = (s) => str(s).toUpperCase().replace(/\s+/g, ' ');

  /**
   * S-04 Editor Dokumen + senarai draf (sebahagian S-06).
   * ctx: { UI, esc, icon, toast, render, store(), email(), imgOf(k) }
   * Keadaan: UI.ed = { d: draf, err: {}, tab: 'form'|'preview', saved: '' }
   */
  AI.EditorUI = function (ctx) {
    const { UI, esc } = ctx;
    const sk = () => (UI.data && UI.data.syarikat) || {};
    const codes = () => (UI.data && UI.data.kodCukai) || [];
    const customers = () => ((UI.data && UI.data.pelanggan) || []).filter((c) => str(c.arkib).toUpperCase() !== 'YA');
    const reg = () => str(sk().sst_berdaftar).toUpperCase() === 'YA';
    const ed = () => UI.ed;
    const d = () => UI.ed.d;
    let saveT = null;

    // ---------- pratonton ----------
    function assets(jenis) {
      const im = (k) => ctx.imgOf(k);
      const tt = jenis === 'do' ? (im('dott') || im('tt')) : im('tt');
      const items = { cop: im('cop'), tt };
      const sign = items.cop || items.tt ? AI.signHtml(AI.signPos(sk()), items, { static: true }) : '';
      const logo = im('logo');
      return { logo: logo && logo.url, sign };
    }
    const view = () => AI.docView(d(), sk(), codes());
    function previewHtml() {
      return AI.renderDocPages(view(), assets(d().jenis)).map((p) => `<div class="pv-page">${p}</div>`).join('');
    }
    function fitPreview() {
      document.querySelectorAll('[data-pv]').forEach((el) => {
        const w = el.clientWidth; if (!w) return;
        el.style.setProperty('--k', Math.min(1, (w - 4) / 794).toFixed(4));
      });
    }

    // ---------- borang ----------
    const errOf = (k) => (ed().err && ed().err[k] ? `<p class="ferr" id="e-${esc(k.replace(/:/g, '_'))}">${esc(ed().err[k])}</p>` : '');
    function inp(k, label, val, o) {
      o = o || {};
      const id = 'ed-' + k.replace(/[^a-z0-9_-]/gi, '_');
      const bad = ed().err && ed().err[k];
      const a = `id="${id}" name="${esc(k)}" ${bad ? `aria-invalid="true" aria-describedby="e-${esc(k.replace(/:/g, '_'))}"` : ''} placeholder="${esc(o.placeholder || '')}" autocomplete="off" ${o.inputmode ? `inputmode="${o.inputmode}"` : ''}`;
      let el;
      if (o.rows) el = `<textarea ${a} rows="${o.rows}" class="inp">${esc(val)}</textarea>`;
      else if (o.select) el = `<select ${a} class="inp">${o.select.map(([v, t]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      else el = `<input ${a} type="${o.type || 'text'}" class="inp${o.cls ? ' ' + o.cls : ''}" value="${esc(val)}" ${o.list ? `list="${o.list}"` : ''}>`;
      return `<div class="fld ${o.wrap || ''}"><label for="${id}">${esc(label)}${o.required ? ' <span class="req">*</span>' : ''}</label>${el}${o.hint ? `<small class="hint">${o.hint}</small>` : ''}${errOf(k)}</div>`;
    }

    function suggestions() {
      const q = norm(d().bill_nama);
      if (!q) return '';
      const exact = customers().find((c) => norm(c.nama) === q);
      const hits = customers().filter((c) => norm(c.nama).includes(q) && !(exact && c.id === exact.id && d().pelanggan_id === c.id)).slice(0, 6);
      const list = hits.length ? `<ul class="sugg" role="listbox" aria-label="Pelanggan sedia ada">${hits.map((c) => `<li><button type="button" data-act="pickCustomer" data-id="${esc(c.id)}"><b>${esc(c.nama)}</b><small>${esc(str(c.alamat).split('\n')[0] || c.tel || '')}</small></button></li>`).join('')}</ul>` : '';
      const save = !exact ? `<button type="button" class="btn sm ghost" data-act="saveCustomer">${ctx.icon('plus')}Simpan ke senarai pelanggan</button>` : '';
      return list + save;
    }

    function itemCard(it, i, n) {
      const doo = d().jenis === 'do';
      const k = (f) => `it:${i}:${f}`;
      const ln = AI.calcDoc([it], codes(), { taxable: reg(), jenis: d().jenis }).lines[0];
      const taxOpts = AI.activeCodes(codes()).map((c) => [c.kod, AI.taxLabel(c)]);
      return `<div class="itcard" data-i="${i}">
        <div class="ithead"><b>Item ${i + 1}</b>${doo ? '' : `<span class="amt" data-amt="${i}">RM${esc(AI.fmtMoney(ln.amount))}</span>`}
          <div class="itbtns">
            <button type="button" class="ib" data-act="edMove" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan item ${i + 1}">${ctx.icon('up')}</button>
            <button type="button" class="ib" data-act="edMove" data-i="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Turunkan item ${i + 1}">${ctx.icon('down')}</button>
            <button type="button" class="ib danger" data-act="edDel" data-i="${i}" ${n === 1 ? 'disabled' : ''} aria-label="Buang item ${i + 1}">${ctx.icon('trash')}</button>
          </div></div>
        ${inp(k('desc'), 'Penerangan', it.desc, { rows: 2, placeholder: 'cth Website maintenance (November 2026)' })}
        <div class="itgrid ${doo ? 'do' : ''}">
          ${inp(k('qty'), 'Qty', it.qty, { inputmode: 'decimal' })}
          ${inp(k('unit'), 'Unit', it.unit, { list: 'unitList' })}
          ${doo ? '' : inp(k('price'), 'Harga (RM)', it.price, { inputmode: 'decimal', placeholder: '0.00' })}
          ${doo ? '' : inp(k('disc'), 'Diskaun (RM)', it.disc, { inputmode: 'decimal', placeholder: '0.00' })}
          ${!doo && reg() ? inp(k('tax_code'), 'Cukai', it.tax_code || 'TIADA', { select: taxOpts, wrap: 'span2' }) : ''}
        </div></div>`;
    }

    function totalsHtml() {
      const v = view();
      if (d().jenis === 'do') return `<div class="tc-row big"><span>Jumlah kuantiti</span><b>${esc(v.totals.qty)}</b></div>`;
      return `<div class="tc-row"><span>Jumlah kecil</span><span>RM${esc(v.totals.subtotal)}</span></div>
        ${v.totals.taxes.map((t) => `<div class="tc-row"><span>${esc(t.label)}</span><span>RM${esc(t.amount)}</span></div>`).join('')}
        <div class="tc-row big"><span>Jumlah</span><b>RM${esc(v.totals.total)}</b></div>
        <div class="tc-words">${esc(v.totals.words)}</div>`;
    }
    const totalShort = () => { const v = view(); return d().jenis === 'do' ? `${v.totals.qty} unit` : 'RM' + v.totals.total; };

    function viewEditor() {
      const x = d(), doo = x.jenis === 'do', T = AI.DOC_TYPES;
      const tab = ed().tab || 'form';
      const shipHidden = !doo || x.ship_sama;
      return `<div class="editor tab-${tab}">
        <header class="page-head"><div><button class="link-back" data-act="edClose">${ctx.icon('back')}Utama</button>
          <h1>${esc(T[x.jenis].label)} ${x.id ? '(draf)' : 'baharu'}</h1><small class="muted" data-edsaved>${ed().saved ? 'Draf disimpan di peranti ini · ' + esc(ed().saved) : 'Draf disimpan automatik di peranti ini'}</small></div></header>
        <div class="seg doc-seg" role="group" aria-label="Jenis dokumen">${Object.keys(T).map((t) => `<button type="button" class="${x.jenis === t ? 'on' : ''}" data-act="edType" data-t="${t}">${esc(T[t].label)}</button>`).join('')}</div>
        <div class="seg ed-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab === 'form'}" class="${tab === 'form' ? 'on' : ''}" data-act="edTab" data-t="form">Borang</button><button type="button" role="tab" aria-selected="${tab === 'preview'}" class="${tab === 'preview' ? 'on' : ''}" data-act="edTab" data-t="preview">Pratonton</button></div>
        <div class="ed-grid">
          <form class="ed-form stack" data-form="editor" novalidate onsubmit="return false">
            <section class="card"><h2>Pelanggan</h2>
              <div class="cust">${inp('bill_nama', 'Nama (Bill To)', x.bill_nama, { placeholder: 'cth Contoh Trading Sdn Bhd' })}<div data-sugg>${suggestions()}</div></div>
              ${inp('bill_alamat', 'Alamat', x.bill_alamat, { rows: 3 })}
              <div class="grid2">${inp('bill_tel', 'No. telefon', x.bill_tel, { type: 'tel', inputmode: 'tel' })}${inp('attn', 'Attn', x.attn, { placeholder: 'Nama penerima' })}</div>
              ${errOf('bill_nama')}
            </section>
            <section class="card"><h2>Maklumat ${esc(T[x.jenis].label)}</h2>
              <div class="grid2">${inp('tarikh', 'Tarikh', x.tarikh, { type: 'date' })}${doo ? '' : inp('terma', 'Terma', x.terma, { list: 'termList', placeholder: 'cth 30 DAYS' })}</div>
              ${x.jenis === 'quotation' ? inp('validity', 'Tempoh sah (validity)', x.validity, { placeholder: 'cth 30 DAYS' }) : ''}
              <div class="grid2">${inp('our_ref', doo ? 'Ref No.' : 'Our Ref.', x.our_ref, {})}${inp('your_ref', doo ? 'PO No.' : 'Your Ref. / PO No.', x.your_ref, { placeholder: 'cth PO-2026-0815' })}</div>
              <p class="fine">Nombor dokumen dikeluarkan secara automatik semasa terbit.</p>
            </section>
            ${doo ? `<section class="card"><h2>Hantar ke (Ship To)</h2>
              <label class="sw"><input type="checkbox" name="ship_sama" ${x.ship_sama ? 'checked' : ''}> Sama dengan Bill To</label>
              <div data-ship ${shipHidden ? 'hidden' : ''}>${inp('ship_nama', 'Nama / lokasi', x.ship_nama, { placeholder: 'cth Tapak projek / gudang' })}
                ${inp('ship_alamat', 'Alamat hantar', x.ship_alamat, { rows: 3 })}
                <div class="grid2">${inp('ship_attn', 'Contact person', x.ship_attn, {})}${inp('ship_tel', 'No. telefon', x.ship_tel, { type: 'tel' })}</div></div>
            </section>` : ''}
            <section class="card"><h2>Item <small class="muted" data-itemcount>(${AI.cleanItems(x.items).length})</small></h2>
              <div class="items">${x.items.map((it, i) => itemCard(it, i, x.items.length)).join('')}</div>
              ${errOf('items')}
              <button type="button" class="btn dashed block" data-act="edAdd" ${x.items.length >= AI.MAX_ITEMS ? 'disabled' : ''}>${ctx.icon('plus')}Tambah item</button>
              <datalist id="unitList">${AI.UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>
              <datalist id="termList">${AI.TERMS.map((u) => `<option value="${u}">`).join('')}</datalist>
            </section>
            <section class="card tcard" data-totals>${totalsHtml()}</section>
            <div class="ed-acts"><button type="button" class="btn" data-act="edSaveDraft">Simpan draf</button><button type="button" class="btn primary" data-act="edIssue">Terbit</button></div>
          </form>
          <aside class="ed-preview"><div class="pv" data-pv>${previewHtml()}</div></aside>
        </div>
        <div class="ed-bar"><div><small>Jumlah</small><b data-total-short>${esc(totalShort())}</b></div><button type="button" class="btn" data-act="edSaveDraft">Draf</button><button type="button" class="btn primary" data-act="edIssue">Terbit</button></div>
      </div>`;
    }

    // ---------- kemas kini separa (tanpa render penuh supaya kursor kekal) ----------
    function live(changed) {
      const t = document.querySelector('[data-totals]'); if (t) t.innerHTML = totalsHtml();
      const ts = document.querySelector('[data-total-short]'); if (ts) ts.textContent = totalShort();
      const ic = document.querySelector('[data-itemcount]'); if (ic) ic.textContent = `(${AI.cleanItems(d().items).length})`;
      const pv = document.querySelector('[data-pv]'); if (pv) { pv.innerHTML = previewHtml(); fitPreview(); }
      if (changed && changed.startsWith('it:')) {
        const i = Number(changed.split(':')[1]); const it = d().items[i];
        const a = document.querySelector(`[data-amt="${i}"]`);
        if (a && it) a.textContent = 'RM' + AI.fmtMoney(AI.calcDoc([it], codes(), { taxable: reg() }).lines[0].amount);
      }
      if (changed === 'bill_nama') { const s = document.querySelector('[data-sugg]'); if (s) s.innerHTML = suggestions(); }
      if (changed === 'ship_sama') { const s = document.querySelector('[data-ship]'); if (s) s.hidden = d().ship_sama; }
    }

    async function saveNow(quiet) {
      clearTimeout(saveT); saveT = null;
      if (!UI.ed || !UI.ed.d) return;
      const x = d();
      if (!x.id && !str(x.bill_nama) && !AI.cleanItems(x.items).length) return;   // draf kosong tidak disimpan
      const rec = await AI.drafts.save(Object.assign({}, x, { email: ctx.email() }));
      if (UI.ed && UI.ed.d === x) x.id = rec.id;
      if (UI.ed) {
        UI.ed.saved = new Date(rec.dikemaskini).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
        const el = document.querySelector('[data-edsaved]'); if (el) el.textContent = 'Draf disimpan di peranti ini · ' + UI.ed.saved;
      }
      if (!quiet) ctx.toast('Draf disimpan di peranti ini.');
    }
    const autosave = () => { clearTimeout(saveT); saveT = setTimeout(() => saveNow(true), 800); };

    function onInput(el) {
      const form = el.closest && el.closest('[data-form="editor"]');
      if (!form || !el.name || !UI.ed) return false;
      const name = el.name;
      if (name.startsWith('it:')) { const [, i, f] = name.split(':'); d().items[Number(i)][f] = el.value; }
      else if (name === 'ship_sama') d().ship_sama = el.checked;
      else {
        d()[name] = el.value;
        if (name === 'bill_nama') { const c = customers().find((x) => x.id === d().pelanggan_id); if (c && norm(c.nama) !== norm(el.value)) d().pelanggan_id = ''; }
      }
      if (ed().err && ed().err[name]) { delete ed().err[name]; const e = document.getElementById('e-' + name.replace(/:/g, '_')); if (e) e.remove(); el.removeAttribute('aria-invalid'); }
      live(name); autosave();
      return true;
    }

    // ---------- tindakan ----------
    const open = (draft) => { UI.ed = { d: draft, err: {}, tab: 'form', saved: '' }; UI.view = 'editor'; ctx.render(); root.scrollTo(0, 0); setTimeout(fitPreview, 0); };
    const actions = {
      newDoc(el) { open(AI.newDraft(el.dataset.t || 'invoice', sk(), codes(), { email: ctx.email() })); },
      edType(el) {
        const t = el.dataset.t; if (!AI.DOC_TYPES[t] || d().jenis === t) return;
        d().jenis = t; if (t === 'quotation' && !str(d().validity)) d().validity = str(sk().validity_default) || '30 DAYS';
        ed().err = {}; ctx.render(); fitPreview(); autosave();
      },
      edTab(el) { ed().tab = el.dataset.t; ctx.render(); fitPreview(); root.scrollTo(0, 0); },
      edAdd() {
        if (d().items.length >= AI.MAX_ITEMS) return;
        d().items.push(AI.blankItem(sk(), codes())); ctx.render(); fitPreview();
        const last = document.querySelector(`[name="it:${d().items.length - 1}:desc"]`); if (last) last.focus();
      },
      edDel(el) { const i = Number(el.dataset.i); if (d().items.length > 1) { d().items.splice(i, 1); ed().err = {}; ctx.render(); fitPreview(); autosave(); } },
      edMove(el) {
        const i = Number(el.dataset.i), j = i + Number(el.dataset.dir), it = d().items;
        if (j < 0 || j >= it.length) return;
        [it[i], it[j]] = [it[j], it[i]]; ed().err = {}; ctx.render(); fitPreview(); autosave();
      },
      pickCustomer(el) {
        const c = customers().find((x) => x.id === el.dataset.id); if (!c) return;
        Object.assign(d(), { pelanggan_id: c.id, bill_nama: str(c.nama), bill_alamat: str(c.alamat), bill_tel: str(c.tel), attn: str(c.attn) });
        delete ed().err.bill_nama; ctx.render(); fitPreview(); autosave();
      },
      saveCustomer() {
        const x = d(); const nama = str(x.bill_nama); if (!nama) return;
        const rec = { id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), nama, alamat: str(x.bill_alamat), tel: str(x.bill_tel), attn: str(x.attn), emel: '', tin: '', brn: '', arkib: 'TIDAK', dicipta: new Date().toISOString() };
        ctx.store().append('Pelanggan', [rec], 'id');
        UI.data.pelanggan = (UI.data.pelanggan || []).concat([rec]); x.pelanggan_id = rec.id;
        ctx.toast(nama + ' disimpan ke senarai pelanggan.');
        const s = document.querySelector('[data-sugg]'); if (s) s.innerHTML = suggestions();
        autosave();
      },
      async edSaveDraft() { await saveNow(false); },
      edIssue() {
        ed().err = AI.validateDraft(d(), sk(), codes());
        if (Object.keys(ed().err).length) {
          ed().tab = 'form'; ctx.render(); fitPreview();
          ctx.toast('Semak medan yang ditanda merah.', true);
          setTimeout(() => { const el = document.querySelector('[aria-invalid="true"]') || document.querySelector('.ferr'); if (el) { el.scrollIntoView({ block: 'center' }); if (el.focus) el.focus(); } }, 0);
          return;
        }
        if (root.navigator && root.navigator.onLine === false) { ctx.toast('Terbit dokumen perlukan internet. Draf disimpan di peranti ini.', true); saveNow(true); return; }
        UI.issue = { phase: 'confirm', step: 0 }; UI.modal = 'issue'; ctx.render();
      },
      async issueGo() {
        const x = d(); if (!x || (UI.issue && UI.issue.phase === 'running')) return;
        UI.issue = { phase: 'running', step: 0 }; ctx.render();
        if (!x.id) await saveNow(true);
        const deps = {
          sk: sk(), codes: codes(), api: ctx.api(), store: ctx.store(), ws: UI.ws, email: ctx.email(), worker: ctx.worker,
          makePdf: AI.makePdf, assets,
          saveDraft: async (dd) => { const rec = await AI.drafts.save(Object.assign({}, dd, { email: ctx.email() })); dd.id = rec.id; },
          dropDraft: (id) => AI.drafts.del(id)
        };
        try {
          const r = await AI.issueDocument(deps, x, (i) => { UI.issue.step = i; updateSteps(); });
          UI.issue = { phase: 'done', result: r, jenis: x.jenis, bill: x.bill_nama };
          ctx.onIssued(r);
          UI.ed = null; UI.view = 'home';
        } catch (e) {
          if (e.paywall) { UI.issue = null; UI.pay = e.paywall; UI.modal = 'paywall'; ctx.render(); return; }
          if (e.validation) { UI.issue = null; UI.modal = ''; ed().err = e.validation; ctx.render(); return; }
          if (e.issued) ctx.onIssued(e.issued);
          UI.issue = { phase: 'error', step: e.step || 0, message: e.network ? 'Tiada sambungan internet.' : AI.googleErrorHint(e), number: x.issued && x.issued.number };
        }
        ctx.render();
      },
      issueDone() { if (UI.issue && UI.issue.url) URL.revokeObjectURL(UI.issue.url); UI.issue = null; UI.modal = ''; UI.view = 'home'; ctx.render(); root.scrollTo(0, 0); },
      issueNew(el) { const t = (UI.issue && UI.issue.jenis) || 'invoice'; UI.issue = null; UI.modal = ''; actions.newDoc({ dataset: { t } }); },
      async issueCopy() {
        const u = UI.issue && UI.issue.result && UI.issue.result.url; if (!u) return;
        try { await root.navigator.clipboard.writeText(u); ctx.toast('Pautan disalin.'); } catch (e) { ctx.toast('Tidak dapat menyalin. Pautan: ' + u, true); }
      },
      async issueShare() {
        const r = UI.issue && UI.issue.result; if (!r) return;
        const name = AI.pdfName(r.number, UI.issue.bill);
        try {
          const file = root.File ? new File([r.bytes], name, { type: 'application/pdf' }) : null;
          if (file && root.navigator.canShare && root.navigator.canShare({ files: [file] })) await root.navigator.share({ files: [file], title: r.number });
          else await root.navigator.share({ title: r.number, url: r.url });
        } catch (e) { /* pengguna batal */ }
      },
      payClose() { UI.pay = null; UI.modal = ''; ctx.render(); },
      async payRecheck() { await ctx.recheck(); UI.pay = null; UI.modal = ''; ctx.render(); ctx.toast(UI.lic && UI.lic.canIssue ? 'Kelayakan dikemas kini. Cuba terbit semula.' : 'Belum ada perubahan. Selesaikan bayaran dahulu.', !(UI.lic && UI.lic.canIssue)); },
      async edClose() { await saveNow(true); UI.ed = null; UI.view = 'home'; ctx.render(); },
      async openDraft(el) { const rec = await AI.drafts.get(el.dataset.id); if (rec) open(rec); else ctx.toast('Draf tidak dijumpai.', true); },
      async delDraft(el) {
        if (!root.confirm('Padam draf ini? Tindakan ini tidak boleh dibatalkan.')) return;
        await AI.drafts.del(el.dataset.id); await loadDrafts(); ctx.toast('Draf dipadam.');
      }
    };

    // ---------- dialog S-05 (terbit) dan S-12 (tiada kelayakan) ----------
    function updateSteps() {
      const el = document.querySelector('[data-steps]'); if (el && UI.issue) el.innerHTML = stepsHtml(UI.issue.step, UI.issue.phase);
    }
    function stepsHtml(at, phase) {
      return AI.ISSUE_STEPS.map((t, i) => {
        const st = phase === 'error' && i === at ? 'bad' : i < at || phase === 'done' ? 'ok' : i === at ? 'run' : '';
        return `<li class="${st}"><span>${st === 'ok' ? '✓' : st === 'bad' ? '!' : i + 1}</span>${esc(t)}${st === 'run' ? '...' : ''}</li>`;
      }).join('');
    }
    function modal() {
      if (UI.modal === 'paywall' && UI.pay) {
        const p = UI.pay, sub = p.buyUrls && p.buyUrls.sub, pack = p.buyUrls && p.buyUrls.pack;
        const msg = p.reason === 'tamat' ? 'Langganan anda telah tamat.' : `Baki kredit tidak cukup (${p.credits || 0} kredit; perlu ${p.creditsPerDoc || 5} untuk satu dokumen).`;
        return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="pTitle"><div class="sheet">
          <h2 id="pTitle">Tidak dapat terbit</h2><p>${esc(msg)} Draf anda selamat di peranti ini.</p>
          <p class="muted">Langgan RM20 sebulan untuk terbit tanpa had${pack ? ', atau beli kredit' : ''}.</p>
          <div class="sheet-acts">
            ${sub ? `<a class="btn primary" href="${esc(sub)}" target="_blank" rel="noopener">Langgan</a>` : '<p class="note warn">Pautan bayaran belum disediakan. Hubungi sokongan.</p>'}
            ${pack ? `<a class="btn" href="${esc(pack)}" target="_blank" rel="noopener">Beli kredit</a>` : ''}
            <button class="btn" data-act="payRecheck">Saya sudah bayar, semak semula</button>
            <button class="btn ghost" data-act="payClose">Tutup</button></div></div></div>`;
      }
      if (UI.modal !== 'issue' || !UI.issue) return '';
      const I = UI.issue, x = UI.ed && UI.ed.d, label = AI.DOC_TYPES[(x && x.jenis) || I.jenis].label;
      if (I.phase === 'confirm') {
        const L = UI.lic || {}, per = L.creditsPerDoc || 5;
        const cost = x && x.issued ? `Nombor ${esc(x.issued.number)} sudah dikeluarkan untuk dokumen ini. Tiada kredit tambahan.`
          : L.mode === 'langganan' || L.mode === 'ihsan' ? 'Langganan aktif: tiada kredit digunakan.'
            : `${per} kredit akan digunakan. Baki selepas ini: ${Math.max(0, (L.credits || 0) - per)} kredit.`;
        return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="iTitle"><div class="sheet">
          <h2 id="iTitle">Terbit ${esc(label)}?</h2>
          <p>Nombor rasmi akan dikeluarkan dan PDF disimpan dalam Google Drive anda. Anda boleh mengedit dokumen ini dalam 24 jam selepas terbit.</p>
          <p class="note info">${cost}</p>
          <div class="sheet-acts"><button class="btn primary" data-act="issueGo">Terbit sekarang</button><button class="btn ghost" data-act="closeModal">Batal</button></div></div></div>`;
      }
      if (I.phase === 'running' || I.phase === 'error') {
        return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="iTitle" aria-busy="${I.phase === 'running'}"><div class="sheet">
          <h2 id="iTitle">${I.phase === 'error' ? 'Terbit belum selesai' : 'Menerbit ' + esc(label)}</h2>
          <ol class="isteps" data-steps>${stepsHtml(I.step, I.phase)}</ol>
          ${I.phase === 'error' ? `<p class="note danger">${esc(I.message)}</p>
            ${I.number ? `<p>Nombor <b>${esc(I.number)}</b> sudah dikeluarkan dan disimpan untuk dokumen ini. Cuba lagi tidak menggunakan kredit tambahan.</p>` : ''}
            <div class="sheet-acts"><button class="btn primary" data-act="issueGo">Cuba lagi</button><button class="btn ghost" data-act="closeModal">Tutup (draf disimpan)</button></div>`
            : '<p class="fine">Jangan tutup app sehingga selesai.</p>'}</div></div>`;
      }
      const r = I.result;
      if (!I.url) I.url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
      const wa = 'https://wa.me/?text=' + encodeURIComponent(AI.waText(r.view.title, r.number, I.bill, r.url));
      return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="iTitle"><div class="sheet">
        <div class="ok-badge">✓</div>
        <h2 id="iTitle">${esc(label)} diterbit</h2>
        <p class="bignum">${esc(r.number)}</p>
        <p class="muted center">${esc(I.bill)}${r.view.jenis === 'do' ? '' : ' · RM' + esc(r.view.totals.total)}${r.charged ? ` · ${r.charged} kredit digunakan` : ''}</p>
        ${!r.shared ? `<p class="note warn">${r.shareError ? 'Perkongsian awam disekat oleh akaun Google anda. ' : 'Perkongsian awam dimatikan dalam Tetapan. '}Pautan hanya boleh dibuka oleh anda; hantar fail PDF secara manual.</p>` : ''}
        <div class="sheet-acts">
          <a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener">Buka PDF di Google Drive</a>
          <div class="acts3">
            ${r.shared ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            ${r.shared ? '<button class="btn" data-act="issueCopy">Salin pautan</button>' : ''}
            <a class="btn" href="${esc(I.url)}" download="${esc(AI.pdfName(r.number, I.bill))}">Muat turun</a>
            ${root.navigator && root.navigator.share ? '<button class="btn" data-act="issueShare">Kongsi</button>' : ''}
          </div>
          <button class="btn ghost" data-act="issueNew">Cipta ${esc(label)} baharu</button>
          <button class="btn ghost" data-act="issueDone">Selesai</button>
        </div></div></div>`;
    }

    // ---------- Rekod: draf ----------
    async function loadDrafts() {
      UI.drafts = await AI.drafts.list(ctx.email()); ctx.render();
      try {
        const since = new Date(Date.now() - 60 * 864e5).toISOString();
        const r = await ctx.worker('GET', '/api/issues?since=' + encodeURIComponent(since));
        if (r.body && r.body.ok) { UI.issuesRemote = r.body.issues; ctx.render(); }
      } catch (e) { /* luar talian: pendamaian kemudian */ }
    }
    function viewRekod() {
      const ds = UI.drafts;
      const T = AI.DOC_TYPES;
      const list = ds == null ? '<p class="muted">Memuatkan...</p>' : !ds.length ? `<div class="empty">${ctx.icon('doc', 'xl')}<p>Tiada draf.</p><small class="muted">Draf disimpan automatik semasa anda mengisi borang.</small></div>`
        : `<div class="dlist">${ds.map((x) => {
          const v = AI.calcDoc(AI.cleanItems(x.items), codes(), { taxable: reg(), jenis: x.jenis });
          return `<div class="drow"><button class="dopen" data-act="openDraft" data-id="${esc(x.id)}"><b>${esc(str(x.bill_nama) || '(tiada nama pelanggan)')}</b>
            <small class="muted">${esc(T[x.jenis] ? T[x.jenis].label : x.jenis)} · ${esc(AI.fmtDate(x.tarikh))} · ${AI.cleanItems(x.items).length} item</small></button>
            <div class="dright">${x.jenis === 'do' ? '' : `<b>RM${esc(AI.fmtMoney(v.total))}</b>`}${x.issued ? `<span class="badge amber" title="Nombor sudah dikeluarkan">Belum siap · ${esc(x.issued.number)}</span>` : '<span class="badge grey">Draf</span>'}
            <button class="ib danger" data-act="delDraft" data-id="${esc(x.id)}" aria-label="Padam draf">${ctx.icon('trash')}</button></div></div>`;
        }).join('')}</div>`;
      return `<header class="page-head"><h1>Rekod</h1></header>
        <section class="card"><h2>Draf di peranti ini</h2>${list}</section>
        ${orphanNotice()}
        <section class="card"><h2>Dokumen diterbit</h2>${issuedList()}</section>`;
    }
    const ST = (r) => (r.status === 'Batal' ? ['red', 'Batal'] : Date.now() - Date.parse(r.diterbit_pada) > 24 * 3600e3 ? ['blue', 'Dikunci'] : ['green', 'Terbit']);
    function issuedList() {
      const rows = ((UI.data && UI.data.dokumen) || []).slice().sort((a, b) => String(b.diterbit_pada).localeCompare(String(a.diterbit_pada)));
      if (!rows.length) return `<div class="empty"><p>Belum ada dokumen diterbit.</p></div>`;
      return `<div class="dlist">${rows.map((r) => {
        const [tone, label] = ST(r);
        return `<div class="drow"><div class="dopen"><b>${esc(r.no_dokumen)}</b><small class="muted">${esc((AI.DOC_TYPES[r.jenis] || {}).label || r.jenis)} · ${esc(AI.fmtDate(r.tarikh))} · ${esc(r.bill_nama)}</small></div>
          <div class="dright">${r.jenis === 'do' ? '' : `<b>RM${esc(AI.fmtMoney(AI.toCents(r.jumlah) || 0))}</b>`}<span class="badge ${tone}">${label}</span>
          ${r.pdf_url ? `<a class="btn sm" href="${esc(r.pdf_url)}" target="_blank" rel="noopener">PDF</a>` : '<span class="badge amber">PDF belum siap</span>'}</div></div>`;
      }).join('')}</div>`;
    }
    // Nombor dikeluarkan Worker tetapi tiada baris dalam Sheet (cth app ditutup semasa terbit)
    function orphanNotice() {
      const iss = UI.issuesRemote; if (!iss || !iss.length) return '';
      const have = new Set(((UI.data && UI.data.dokumen) || []).map((r) => str(r.no_dokumen)));
      const local = new Set((UI.drafts || []).filter((x) => x.issued).map((x) => x.issued.number));
      const miss = iss.filter((x) => x.status === 'issued' && !have.has(x.number));
      if (!miss.length) return '';
      return `<div class="notice warn"><span>Nombor berikut sudah dikeluarkan tetapi belum disimpan ke Sheet: <b>${miss.map((x) => esc(x.number)).join(', ')}</b>.
        ${miss.some((x) => local.has(x.number)) ? 'Buka draf bertanda "Belum siap" dan tekan Terbit untuk menyambung (tiada kredit tambahan).' : 'Draf tiada pada peranti ini; buka app pada peranti asal untuk menyambung.'}</span></div>`;
    }

    return { views: { editor: viewEditor, rekod: viewRekod }, actions, onInput, fitPreview, saveNow, loadDrafts, modal };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
