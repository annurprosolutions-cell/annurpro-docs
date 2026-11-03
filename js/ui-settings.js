(function (root) {
  'use strict';
  const AI = root.AI;
  const str = (v) => (v == null ? '' : String(v)).trim();

  /**
   * Skrin persediaan & tetapan: S-02 (wizard), S-08 (Profil Syarikat), S-10 (Dokumen, Penomboran & Cukai).
   * ctx: { UI, esc, icon, toast, render, store(), createWorkspace(company, folderName), renameWorkspace(company), saveBusinessName(nama), email() }
   */
  AI.SettingsUI = function (ctx) {
    const { UI, esc } = ctx;
    const WIZ_KEY = () => 'ai-wiz:' + ctx.email();
    const STEPS = [
      ['syarikat', 'Syarikat'], ['kod', 'Penomboran'], ['penandatangan', 'Penandatangan'], ['bank', 'Bank'], ['sst', 'SST']
    ];
    const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const sk = () => (UI.data && UI.data.syarikat) || {};
    const codes = () => (UI.data && UI.data.kodCukai) || [];

    // ---------- borang ----------
    const f = () => UI.form || (UI.form = {});
    const err = (k) => (UI.formErr && UI.formErr[k] ? `<p class="ferr" id="e-${k}">${esc(UI.formErr[k])}</p>` : '');
    function field(k, label, o) {
      o = o || {};
      const v = f()[k] == null ? '' : f()[k];
      const id = 'f-' + k.replace(/[^a-z0-9_-]/gi, '_');
      const bad = UI.formErr && UI.formErr[k];
      const common = `id="${id}" name="${esc(k)}" ${o.required ? 'required aria-required="true"' : ''} ${bad ? `aria-invalid="true" aria-describedby="e-${k}"` : ''} ${o.upper ? 'data-upper="1"' : ''} placeholder="${esc(o.placeholder || '')}" ${o.max ? `maxlength="${o.max}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} autocomplete="off"`;
      let input;
      if (o.rows) input = `<textarea ${common} rows="${o.rows}" class="inp${o.upper ? ' up' : ''}">${esc(v)}</textarea>`;
      else if (o.select) input = `<select ${common} class="inp">${o.select.map(([val, t]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      else input = `<input ${common} type="${o.type || 'text'}" class="inp${o.upper ? ' up' : ''}" value="${esc(v)}" ${o.list ? `list="${o.list}"` : ''}>`;
      return `<div class="fld ${o.wide ? 'wide' : ''}"><label for="${id}">${esc(label)}${o.required ? ' <span class="req">*</span>' : ''}</label>${input}${o.hint ? `<small class="hint">${o.hint}</small>` : ''}${err(k)}</div>`;
    }
    const banks = () => `<datalist id="bankList">${AI.MY_BANKS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>`;

    // ---------- pratonton kepala dokumen (dikongsi wizard & tetapan) ----------
    function docHeader(v) {
      const accent = /^#[0-9a-f]{6}$/i.test(str(v.warna_aksen)) ? v.warna_aksen : '#0f172a';
      const addr = str(v.alamat).split('\n').filter(Boolean);
      const reg = [str(v.ssm) && `(${esc(v.ssm)})`].filter(Boolean).join(' ');
      const contact = [str(v.tel) && 'Tel: ' + esc(v.tel), str(v.emel) && esc(v.emel), str(v.laman) && esc(v.laman)].filter(Boolean).join(' · ');
      const sst = str(v.sst_berdaftar).toUpperCase() === 'YA' && str(v.sst_no) ? `<div>SST No: ${esc(v.sst_no)}</div>` : '';
      const no = AI.sampleNumber(AI.prefixFor(v, 'invoice'), today());
      const bank = str(v.bank_nama) || str(v.bank_akaun) ? `<div class="dh-bank"><b>Bank:</b> ${esc(v.bank_nama)} ${esc(v.bank_akaun)}${str(v.bank_pemegang) ? ' · ' + esc(v.bank_pemegang) : ''}</div>` : '';
      const imgSign = ctx.signStatic ? ctx.signStatic() : '';
      const hasImgs = /class="sitem/.test(imgSign);
      const sign = str(v.tt_nama) || hasImgs ? `<div class="dh-sign">${hasImgs ? imgSign : '<span></span>'}${str(v.tt_nama) ? `<b>${esc(v.tt_nama)}</b><small>${esc(v.tt_jawatan)}</small>` : ''}</div>` : '';
      const lg = ctx.imgOf && ctx.imgOf('logo');
      return `<div class="dh" style="--acc:${esc(accent)}" aria-label="Pratonton dokumen">
        <div class="dh-top"><div class="dh-logo ${lg ? 'has' : ''}">${lg ? `<img src="${esc(lg.url)}" alt="Logo">` : 'LOGO'}</div><div class="dh-co">
          <b>${esc(str(v.nama) || 'NAMA SYARIKAT ANDA')}</b> <small>${reg}</small>
          ${addr.map((l) => `<div>${esc(l)}</div>`).join('') || '<div class="muted">Alamat syarikat</div>'}
          ${contact ? `<div>${contact}</div>` : ''}${sst}
        </div></div>
        <div class="dh-title"><span>${esc(str(v.tajuk_invois) || 'INVOICE')}</span><small>No: <b>${esc(no)}</b> · Tarikh: ${esc(AI.fmtDate(today()))}</small></div>
        <div class="dh-table"><div></div><div></div><div></div></div>
        ${bank}${sign}
        <p class="fine">Pratonton ringkas. Templat penuh dengan logo, cop dan tandatangan dalam editor dokumen.</p>
      </div>`;
    }

    // kemas kini bahagian "live" tanpa render semula (kursor kekal dalam input)
    function live() {
      const v = Object.assign({}, sk(), f());
      document.querySelectorAll('[data-live]').forEach((el) => {
        const k = el.dataset.live;
        if (k === 'folder') el.textContent = str(v._folder) || AI.workspaceName(v.nama);
        else if (k === 'header') el.innerHTML = docHeader(v);
        else if (k.startsWith('no-')) el.textContent = AI.sampleNumber(AI.prefixFor(v, k.slice(3)), today());
        else if (k.startsWith('ph-')) { const inp = document.querySelector(`[name="${k.slice(3)}"]`); if (inp) inp.placeholder = AI.derivePrefixes(v.kod_syarikat)[{ prefix_invois: 'invoice', prefix_quotation: 'quotation', prefix_do: 'do' }[k.slice(3)]] || ''; }
      });
      document.querySelectorAll('[data-show-if]').forEach((el) => { const [k, val] = el.dataset.showIf.split('='); el.hidden = str(v[k]).toUpperCase() !== val; });
    }

    function onInput(el) {
      const form = el.closest('[data-form]'); if (!form || !el.name) return;
      if (el.type === 'checkbox') {
        if (el.name.startsWith('tax:')) f()[el.name] = el.checked ? 'YA' : 'TIDAK';
        else f()[el.name] = el.checked ? (el.value || 'YA') : 'TIDAK';
      } else if (el.type === 'radio') { if (el.checked) f()[el.name] = el.value; }
      else {
        if (el.dataset.upper && el.value !== el.value.toUpperCase()) { const p = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(p, p); } catch (e) { /* jenis input tanpa kursor */ } }
        f()[el.name] = el.value;
      }
      if (el.name === 'warna_aksen' && /^#[0-9a-f]{6}$/i.test(el.value)) document.querySelectorAll('[name="warna_aksen"]').forEach((x) => { if (x !== el) x.value = el.value; });
      if (el.name.startsWith('tax:') && UI.formErr && UI.formErr.sst_codes) { delete UI.formErr.sst_codes; const e = document.getElementById('e-sst_codes'); if (e) e.remove(); }
      if (UI.formErr && UI.formErr[el.name]) { delete UI.formErr[el.name]; const e = document.getElementById('e-' + el.name); if (e) e.remove(); el.removeAttribute('aria-invalid'); }
      if (form.dataset.form === 'wizard') AI.local.set(WIZ_KEY(), { step: UI.wizStep, form: f() });
      UI.dirty = form.dataset.form !== 'wizard';
      live();
    }

    function focusFirstError() {
      setTimeout(() => { const el = document.querySelector('[aria-invalid="true"]'); if (el) el.focus(); }, 0);
    }

    // ---------- S-02 wizard ----------
    function startWizard() {
      const saved = AI.local.get(WIZ_KEY(), null);
      UI.form = Object.assign({}, pick(sk(), AI.PROFILE_KEYS.concat(AI.DOCSET_KEYS)), saved && saved.form);
      UI.wizStep = saved && saved.step && (UI.ws && UI.ws.ready) ? saved.step : (UI.ws && UI.ws.ready && str(sk().nama) ? 1 : 0);
      if (!str(UI.form.bank_pemegang) && str(UI.form.nama)) UI.form.bank_pemegang = UI.form.nama;
      UI.formErr = {};
      UI.view = 'setup';
    }
    function pick(o, keys) { const r = {}; keys.forEach((k) => { if (o && o[k] != null) r[k] = o[k]; }); return r; }

    const STEP_FIELDS = {
      syarikat: ['nama', 'ssm', 'alamat', 'tel', 'emel'],
      kod: ['kod_syarikat', 'prefix_invois', 'prefix_quotation', 'prefix_do'],
      penandatangan: ['tt_nama', 'tt_jawatan'],
      bank: ['bank_nama', 'bank_akaun', 'bank_pemegang'],
      sst: ['sst_berdaftar', 'sst_no']
    };

    function viewSetup() {
      const step = UI.wizStep || 0;
      const [key, title] = STEPS[step];
      const v = Object.assign({}, sk(), f());
      let body = '';
      if (key === 'syarikat') {
        body = `<p class="muted">Maklumat ini dipaparkan pada setiap Invois, Quotation dan DO.</p>
          ${field('nama', 'Nama syarikat', { required: true, max: 120, placeholder: 'cth AnnurPro Solutions' })}
          ${field('ssm', 'No. pendaftaran (SSM)', { upper: true, placeholder: 'cth 202401012345 (1234567-A)' })}
          ${field('alamat', 'Alamat', { rows: 3, hint: 'Satu baris = satu baris pada dokumen.' })}
          <div class="grid2">${field('tel', 'No. telefon', { type: 'tel', inputmode: 'tel' })}${field('emel', 'E-mel', { type: 'email', inputmode: 'email' })}</div>
          <div class="folder-note">${ctx.icon('folder')}<div><small class="muted">Folder dan Google Sheet akan dicipta dalam Drive anda:</small><b data-live="folder">${esc(str(v._folder) || AI.workspaceName(v.nama))}</b>
          ${UI.ws && UI.ws.ready ? '<small class="muted">Sudah dicipta. Nama boleh ditukar dalam Tetapan.</small>' : `<details><summary>Ubah nama folder</summary>${field('_folder', 'Nama folder & Sheet', { max: 100, placeholder: AI.workspaceName(v.nama) })}</details>`}</div></div>`;
      } else if (key === 'kod') {
        if (!str(f().kod_syarikat)) f().kod_syarikat = AI.suggestCode(v.nama);
        const d = AI.derivePrefixes(f().kod_syarikat);
        body = `<p class="muted">Nombor dokumen dikeluarkan secara berturutan setiap bulan, contohnya <b data-live="no-invoice">${esc(AI.sampleNumber(AI.prefixFor(Object.assign({}, v, f()), 'invoice'), today()))}</b>.</p>
          ${field('kod_syarikat', 'Kod syarikat', { required: true, upper: true, max: 6, placeholder: 'cth APS', hint: '2 hingga 6 huruf atau nombor. Asas kepada prefix nombor dokumen.' })}
          <div class="prefix-grid">
            ${[['invoice', 'prefix_invois', 'Invois'], ['quotation', 'prefix_quotation', 'Quotation'], ['do', 'prefix_do', 'Delivery Order']].map(([t, k, l]) => `<div class="pcard">
              ${field(k, 'Prefix ' + l, { upper: true, max: 12, placeholder: d[t] })}<span data-live="ph-${k}" hidden></span>
              <small class="muted">Contoh: <b data-live="no-${t}">${esc(AI.sampleNumber(AI.prefixFor(v, t), today()))}</b></small></div>`).join('')}
          </div><p class="fine">Biarkan prefix kosong untuk guna kod syarikat. Prefix boleh diubah kemudian dalam Tetapan.</p>`;
      } else if (key === 'penandatangan') {
        body = `<p class="muted">Nama dan jawatan di bawah ruang tandatangan.</p>
          ${field('tt_nama', 'Nama penandatangan', { placeholder: 'cth Ahmad bin Abdullah' })}
          ${field('tt_jawatan', 'Jawatan', { placeholder: 'cth Director' })}
          <p class="note info">Gambar logo, cop dan tandatangan boleh dimuat naik dalam Tetapan selepas persediaan.</p>`;
      } else if (key === 'bank') {
        body = `<p class="muted">Dipaparkan pada invois supaya pelanggan tahu ke mana untuk bayar.</p>
          ${field('bank_nama', 'Nama bank', { upper: true, list: 'bankList', placeholder: 'cth MAYBANK' })}${banks()}
          ${field('bank_akaun', 'No. akaun', { inputmode: 'numeric', placeholder: 'cth 5123 4567 8901' })}
          ${field('bank_pemegang', 'Nama pemegang akaun', { upper: true })}`;
      } else {
        const reg = str(v.sst_berdaftar).toUpperCase() === 'YA';
        const sstCodes = codes().filter((c) => c.jenis !== 'tiada');
        body = `<p class="muted">Jika syarikat anda berdaftar dengan Kastam untuk SST, cukai akan dikira pada dokumen.</p>
          <fieldset class="radios"><legend>Berdaftar SST?</legend>
            <label><input type="radio" name="sst_berdaftar" value="TIDAK" ${!reg ? 'checked' : ''}> Tidak</label>
            <label><input type="radio" name="sst_berdaftar" value="YA" ${reg ? 'checked' : ''}> Ya</label></fieldset>
          <div data-show-if="sst_berdaftar=YA" ${reg ? '' : 'hidden'}>
            ${field('sst_no', 'No. pendaftaran SST', { required: true, upper: true })}
            <fieldset class="checks"><legend>Kod cukai yang digunakan</legend>
              ${sstCodes.map((c) => `<label><input type="checkbox" name="tax:${esc(c.kod)}:aktif" ${str(f()['tax:' + c.kod + ':aktif'] || c.aktif).toUpperCase() === 'YA' ? 'checked' : ''}> ${esc(c.nama)} <small class="muted">(${esc(c.kadar)}%)</small></label>`).join('')}
            </fieldset>${err('sst_codes')}
            <p class="fine">Kadar default perlu disemak dengan Kastam. Kadar boleh diubah dalam Tetapan → Dokumen & Cukai.</p>
          </div>`;
      }
      const last = step === STEPS.length - 1;
      return `<div class="wiz">
        <header class="wiz-head"><div class="brand"><img src="brand/annurpro-icon-64.png" alt="" width="32" height="32"><div><b>Persediaan</b><small>Langkah ${step + 1} daripada ${STEPS.length}</small></div></div>
          <ol class="steps">${STEPS.map(([, t], i) => `<li class="${i < step ? 'done' : i === step ? 'on' : ''}" ${i === step ? 'aria-current="step"' : ''}><span>${i + 1}</span>${esc(t)}</li>`).join('')}</ol></header>
        <div class="wiz-body">
          <form class="card wiz-form" data-form="wizard" novalidate onsubmit="return false">
            <h1>${esc(title)}</h1>${body}
            <div class="wiz-acts">
              ${step > 0 ? '<button type="button" class="btn" data-act="wizBack">Kembali</button>' : '<span></span>'}
              <div class="row-end">${step >= 2 && !last ? '<button type="button" class="btn ghost" data-act="wizSkip">Langkau</button>' : ''}
              <button type="submit" class="btn primary" data-act="wizNext" ${UI.busy ? 'disabled' : ''}>${UI.busy ? 'Menyediakan Drive...' : last ? 'Siap' : 'Seterusnya'}</button></div>
            </div>
          </form>
          <aside class="wiz-preview"><small class="muted">Pratonton</small><div data-live="header">${docHeader(v)}</div></aside>
        </div></div>`;
    }

    function validateStep(key) {
      const v = AI.normalizeSettings(f());
      const e = AI.validateSettings(Object.assign({}, sk(), v), STEP_FIELDS[key]);
      if (key === 'sst' && str(v.sst_berdaftar) === 'YA') {
        const any = codes().filter((c) => c.jenis !== 'tiada').some((c) => str(f()['tax:' + c.kod + ':aktif'] || c.aktif).toUpperCase() === 'YA');
        if (!any) e.sst_codes = 'Pilih sekurang-kurangnya satu kod cukai SST.';
      }
      return e;
    }
    function stepValues(key) {
      const v = AI.normalizeSettings(f());
      const out = {}; STEP_FIELDS[key].forEach((k) => { if (k in v) out[k] = v[k]; });
      if (key === 'kod') ['prefix_invois', 'prefix_quotation', 'prefix_do'].forEach((k) => { out[k] = v[k] || ''; });
      return out;
    }
    function taxUpdates() {
      const reg = str(f().sst_berdaftar || sk().sst_berdaftar).toUpperCase() === 'YA';
      const chosen = codes().filter((c) => str(f()['tax:' + c.kod + ':aktif'] || c.aktif).toUpperCase() === 'YA').map((c) => c.kod);
      return AI.sstPlan(codes(), reg, chosen);
    }

    const actions = {
      async wizNext() {
        const [key] = STEPS[UI.wizStep];
        UI.formErr = validateStep(key);
        if (Object.keys(UI.formErr).length) { ctx.render(); focusFirstError(); return; }
        try {
          if (key === 'syarikat' && !(UI.ws && UI.ws.ready)) {
            UI.busy = true; ctx.render();
            await ctx.createWorkspace(AI.normalizeSettings(f()).nama, str(f()._folder));
            UI.busy = false;
            if (!(UI.ws && UI.ws.ready)) { ctx.render(); return; }   // ralat dipaparkan oleh pill
          }
          const st = ctx.store();
          st.setKV('Syarikat', Object.assign(stepValues(key), { dikemaskini: new Date().toISOString() }));
          if (key === 'syarikat') ctx.saveBusinessName(AI.normalizeSettings(f()).nama);
          if (key === 'sst') taxUpdates().forEach((u) => st.update('KodCukai', 'kod', u));
          if (UI.wizStep === STEPS.length - 1) {
            UI.busy = true; ctx.render();
            await st.flush();
            UI.busy = false;
            AI.local.del(WIZ_KEY());
            UI.form = {}; UI.view = 'home';
            ctx.toast('Persediaan siap. Anda boleh mula cipta dokumen.');
          } else {
            UI.wizStep++;
            AI.local.set(WIZ_KEY(), { step: UI.wizStep, form: f() });
          }
        } catch (e) {
          UI.busy = false;
          ctx.toast(AI.googleErrorHint(e), true);
        }
        ctx.render(); root.scrollTo(0, 0);
      },
      wizBack() { UI.formErr = {}; UI.wizStep = Math.max(UI.ws && UI.ws.ready ? 1 : 0, UI.wizStep - 1); if (UI.wizStep === 0 && UI.ws && UI.ws.ready) UI.wizStep = 0; ctx.render(); },
      wizSkip() { UI.formErr = {}; UI.wizStep = Math.min(STEPS.length - 1, UI.wizStep + 1); AI.local.set(WIZ_KEY(), { step: UI.wizStep, form: f() }); ctx.render(); root.scrollTo(0, 0); },

      openProfil() { UI.form = pick(sk(), AI.PROFILE_KEYS); UI.formErr = {}; UI.dirty = false; UI.view = 'profil'; ctx.render(); root.scrollTo(0, 0); },
      openDocset() {
        UI.form = pick(sk(), AI.DOCSET_KEYS); UI.formErr = {}; UI.dirty = false;
        codes().forEach((c) => { UI.form['tax:' + c.kod + ':nama'] = c.nama; UI.form['tax:' + c.kod + ':kadar'] = String(c.kadar); UI.form['tax:' + c.kod + ':aktif'] = str(c.aktif).toUpperCase(); });
        UI.view = 'docset'; ctx.render(); root.scrollTo(0, 0);
      },
      backToSettings() {
        if (UI.dirty && !root.confirm('Perubahan belum disimpan. Keluar juga?')) return;
        UI.dirty = false; UI.form = {}; UI.formErr = {}; UI.view = 'tetapan'; ctx.render();
      },

      saveProfil() {
        const v = AI.normalizeSettings(f());
        UI.formErr = AI.validateSettings(Object.assign({}, sk(), v), AI.PROFILE_KEYS);
        if (Object.keys(UI.formErr).length) { ctx.render(); focusFirstError(); return; }
        const oldName = str(sk().nama);
        const upd = pick(v, AI.PROFILE_KEYS); upd.dikemaskini = new Date().toISOString();
        ctx.store().setKV('Syarikat', upd);
        UI.data.syarikat = Object.assign({}, sk(), upd);   // paparan segera; Sheet disegerakkan oleh Store
        UI.dirty = false;
        if (v.nama && v.nama !== oldName) {
          ctx.saveBusinessName(v.nama);
          UI.renameTo = v.nama; UI.modal = 'rename';
        } else ctx.toast('Profil syarikat disimpan.');
        ctx.render();
      },

      saveDocset() {
        const v = AI.normalizeSettings(f());
        const keys = AI.DOCSET_KEYS;
        UI.formErr = AI.validateSettings(Object.assign({}, sk(), v), keys);
        const reg = str(v.sst_berdaftar) === 'YA';
        const edits = codes().map((c) => ({ kod: c.kod, jenis: c.jenis, nama: str(f()['tax:' + c.kod + ':nama']), kadar: str(f()['tax:' + c.kod + ':kadar']),
          aktif: c.kod === 'TIADA' ? 'YA' : str(f()['tax:' + c.kod + ':aktif'] || 'TIDAK').toUpperCase() }));
        edits.forEach((c) => { const e = AI.validateTaxCode(c); delete e.kod; if (e.nama) UI.formErr['tax:' + c.kod + ':nama'] = e.nama; if (e.kadar) UI.formErr['tax:' + c.kod + ':kadar'] = e.kadar; });
        if (reg && !edits.some((c) => c.jenis !== 'tiada' && c.aktif === 'YA')) UI.formErr.sst_codes = 'Pilih sekurang-kurangnya satu kod cukai SST yang aktif.';
        if (Object.keys(UI.formErr).length) { ctx.render(); focusFirstError(); return; }
        if (!reg) edits.forEach((c) => { if (c.jenis !== 'tiada') c.aktif = 'TIDAK'; });
        const upd = pick(v, keys); ['prefix_invois', 'prefix_quotation', 'prefix_do'].forEach((k) => { upd[k] = v[k] || ''; });
        upd.dikemaskini = new Date().toISOString();
        const st = ctx.store();
        st.setKV('Syarikat', upd);
        edits.forEach((c) => {
          const cur = codes().find((x) => x.kod === c.kod) || {};
          if (str(cur.nama) !== c.nama || String(cur.kadar) !== String(Number(c.kadar)) || str(cur.aktif).toUpperCase() !== c.aktif) {
            st.update('KodCukai', 'kod', { kod: c.kod, nama: c.nama, kadar: Number(c.kadar), aktif: c.aktif });
          }
        });
        UI.data.syarikat = Object.assign({}, sk(), upd);
        UI.data.kodCukai = codes().map((x) => { const e = edits.find((c) => c.kod === x.kod); return e ? Object.assign({}, x, { nama: e.nama, kadar: Number(e.kadar), aktif: e.aktif }) : x; });
        UI.dirty = false;
        ctx.toast('Tetapan dokumen disimpan.');
        ctx.render();
      },

      addTaxCode() {
        const c = { kod: str(f().new_kod).toUpperCase(), nama: str(f().new_nama), kadar: str(f().new_kadar), jenis: str(f().new_jenis) || 'sst_perkhidmatan' };
        const e = AI.validateTaxCode(c, codes());
        UI.formErr = {}; Object.keys(e).forEach((k) => { UI.formErr['new_' + k] = e[k]; });
        if (Object.keys(e).length) { ctx.render(); focusFirstError(); return; }
        const row = { kod: c.kod, nama: c.nama, kadar: Number(c.kadar), jenis: c.jenis, aktif: 'YA' };
        ctx.store().append('KodCukai', [row], 'kod');
        UI.data.kodCukai = codes().concat([row]);
        ['nama', 'kadar', 'aktif'].forEach((k) => { f()['tax:' + c.kod + ':' + k] = String(row[k]); });
        ['new_kod', 'new_nama', 'new_kadar', 'new_jenis'].forEach((k) => { delete f()[k]; });
        ctx.toast('Kod cukai ' + c.kod + ' ditambah.');
        ctx.render();
      },

      async renameYes() {
        UI.modal = ''; ctx.render();
        try { const n = await ctx.renameWorkspace(UI.renameTo); ctx.toast('Folder & Sheet kini: ' + n); }
        catch (e) { ctx.toast(AI.googleErrorHint(e), true); }
      },
      renameNo() { UI.modal = ''; ctx.toast('Profil syarikat disimpan. Nama folder tidak diubah.'); ctx.render(); }
    };

    // ---------- S-08 Profil ----------
    function pageHead(title, sub) {
      return `<header class="page-head"><div><button class="link-back" data-act="backToSettings">${ctx.icon('back')}Tetapan</button><h1>${esc(title)}</h1>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</div></header>`;
    }
    function viewProfil() {
      const v = Object.assign({}, sk(), f());
      return `${pageHead('Profil Syarikat', 'Maklumat pada setiap dokumen')}
        <div class="split">
          <form class="stack" data-form="profil" novalidate onsubmit="return false">
            <section class="card"><h2>Syarikat</h2>
              ${field('nama', 'Nama syarikat', { required: true, max: 120 })}
              <div class="grid2">${field('ssm', 'No. pendaftaran (SSM)', { upper: true })}${field('laman', 'Laman web')}</div>
              <div class="grid2">${field('tin', 'TIN', { upper: true, hint: 'Pilihan' })}${field('brn', 'BRN', { upper: true, hint: 'Pilihan' })}</div>
              ${field('alamat', 'Alamat', { rows: 3 })}
              <div class="grid2">${field('tel', 'No. telefon', { type: 'tel', inputmode: 'tel' })}${field('emel', 'E-mel', { type: 'email', inputmode: 'email' })}</div>
            </section>
            <section class="card"><h2>Bank</h2>
              ${field('bank_nama', 'Nama bank', { upper: true, list: 'bankList' })}${banks()}
              <div class="grid2">${field('bank_akaun', 'No. akaun', { inputmode: 'numeric' })}${field('bank_pemegang', 'Nama pemegang akaun', { upper: true })}</div>
            </section>
            <section class="card"><h2>Penandatangan</h2>
              <div class="grid2">${field('tt_nama', 'Nama', { upper: true })}${field('tt_jawatan', 'Jawatan', { upper: true })}</div>
              <h3>Penandatangan Delivery Order</h3><p class="fine">Biarkan kosong untuk guna penandatangan utama.</p>
              <div class="grid3">${field('do_tt_nama', 'Nama', { upper: true })}${field('do_tt_jawatan', 'Jawatan', { upper: true })}${field('do_tt_tel', 'No. telefon', { type: 'tel' })}</div>
            </section>
            <section class="card"><h2>Warna dokumen</h2>
              <div class="color-row"><input type="color" name="warna_aksen" value="${esc(/^#[0-9a-f]{6}$/i.test(str(v.warna_aksen)) ? v.warna_aksen : '#0f172a')}" aria-label="Warna aksen">
              ${field('warna_aksen', 'Kod warna', { placeholder: '#0f172a', max: 7 })}</div>
              <p class="fine">Digunakan untuk kepala jadual dan kotak jumlah pada dokumen.</p>
            </section>
            <div class="save-bar"><button type="button" class="btn" data-act="backToSettings">Batal</button><button type="submit" class="btn primary" data-act="saveProfil">Simpan</button></div>
          </form>
          <aside class="preview-col"><small class="muted">Pratonton</small><div data-live="header">${docHeader(v)}</div></aside>
        </div>`;
    }

    // ---------- S-10 Dokumen, Penomboran & Cukai ----------
    function viewDocset() {
      const v = Object.assign({}, sk(), f());
      const d = AI.derivePrefixes(v.kod_syarikat);
      const reg = str(v.sst_berdaftar).toUpperCase() === 'YA';
      const taxRows = codes().map((c) => {
        const k = (x) => 'tax:' + c.kod + ':' + x;
        const fixed = c.kod === 'TIADA';
        return `<tr><td><b>${esc(c.kod)}</b><small class="muted">${esc({ tiada: 'Tiada cukai', sst_jualan: 'Cukai jualan', sst_perkhidmatan: 'Cukai perkhidmatan' }[c.jenis] || c.jenis)}</small></td>
          <td>${field(k('nama'), 'Nama', {})}</td><td class="w-rate">${field(k('kadar'), 'Kadar %', { inputmode: 'decimal' })}</td>
          <td class="w-on"><label class="sw"><input type="checkbox" name="${esc(k('aktif'))}" ${str(f()[k('aktif')] || c.aktif).toUpperCase() === 'YA' || fixed ? 'checked' : ''} ${fixed ? 'disabled' : ''}> Aktif</label></td></tr>`;
      }).join('');
      return `${pageHead('Dokumen, Penomboran & Cukai')}
        <div class="split">
          <form class="stack" data-form="docset" novalidate onsubmit="return false">
            <section class="card"><h2>Penomboran</h2>
              ${field('kod_syarikat', 'Kod syarikat', { required: true, upper: true, max: 6, hint: '2 hingga 6 huruf atau nombor.' })}
              <div class="prefix-grid">${[['invoice', 'prefix_invois', 'Invois'], ['quotation', 'prefix_quotation', 'Quotation'], ['do', 'prefix_do', 'Delivery Order']].map(([t, k, l]) => `<div class="pcard">
                ${field(k, 'Prefix ' + l, { upper: true, max: 12, placeholder: d[t] })}<span data-live="ph-${k}" hidden></span>
                <small class="muted">Contoh: <b data-live="no-${t}">${esc(AI.sampleNumber(AI.prefixFor(v, t), today()))}</b></small></div>`).join('')}</div>
              <p class="fine">Nombor dikeluarkan oleh pelayan, berturutan setiap bulan dan setiap jenis. Menukar prefix tidak mengubah dokumen yang sudah diterbit.</p>
            </section>
            <section class="card"><h2>Kandungan default</h2>
              <div class="grid2">${field('tajuk_invois', 'Tajuk invois', { select: AI.DOC_TITLES.map((t) => [t, t]) })}${field('terma_default', 'Terma bayaran', { placeholder: 'cth 30 DAYS' })}</div>
              ${field('validity_default', 'Tempoh sah quotation', { placeholder: '30 DAYS' })}
              <h3>Nota invois</h3>${field('nota_invois_1', 'Nota 1', { rows: 2 })}${field('nota_invois_2', 'Nota 2', { rows: 2 })}${field('nota_invois_3', 'Nota 3', { rows: 2 })}
              <h3>Nota quotation</h3>${field('nota_quotation_1', 'Nota 1', { rows: 2 })}${field('nota_quotation_2', 'Nota 2', { rows: 2 })}${field('nota_quotation_3', 'Nota 3', { rows: 2 })}
              <h3>Nota delivery order</h3>${field('nota_do_1', 'Nota 1', { rows: 2 })}${field('nota_do_2', 'Nota 2', { rows: 2 })}
            </section>
            <section class="card"><h2>Perkongsian PDF</h2>
              <label class="sw"><input type="checkbox" name="kongsi_awam" value="YA" ${str(v.kongsi_awam).toUpperCase() !== 'TIDAK' ? 'checked' : ''}> PDF boleh dibuka sesiapa yang ada pautan</label>
              <p class="fine">Sesuai untuk hantar melalui WhatsApp. Jika dimatikan, hanya anda boleh membuka pautan; hantar fail PDF secara manual.</p>
            </section>
            <section class="card"><h2>SST</h2>
              <fieldset class="radios"><legend>Berdaftar SST?</legend>
                <label><input type="radio" name="sst_berdaftar" value="TIDAK" ${!reg ? 'checked' : ''}> Tidak</label>
                <label><input type="radio" name="sst_berdaftar" value="YA" ${reg ? 'checked' : ''}> Ya</label></fieldset>
              <div data-show-if="sst_berdaftar=YA" ${reg ? '' : 'hidden'}>${field('sst_no', 'No. pendaftaran SST', { required: true, upper: true })}</div>
              <div class="table-wrap"><table class="tax"><thead><tr><th>Kod</th><th>Nama</th><th>Kadar</th><th></th></tr></thead><tbody>${taxRows}</tbody></table></div>
              ${err('sst_codes')}
              <p class="fine">Kadar default perlu disahkan dengan Kastam. Anda bertanggungjawab ke atas ketepatan cukai. Kod tidak dipadam supaya dokumen lama kekal betul; matikan sahaja jika tidak digunakan.</p>
              <details class="add-tax"><summary>Tambah kod cukai</summary>
                <div class="grid2">${field('new_kod', 'Kod', { upper: true, placeholder: 'cth SST-KHAS' })}${field('new_nama', 'Nama', { placeholder: 'cth Cukai Perkhidmatan Khas' })}</div>
                <div class="grid2">${field('new_kadar', 'Kadar %', { inputmode: 'decimal' })}${field('new_jenis', 'Jenis', { select: [['sst_perkhidmatan', 'Cukai perkhidmatan'], ['sst_jualan', 'Cukai jualan'], ['tiada', 'Tiada cukai']] })}</div>
                <button type="button" class="btn" data-act="addTaxCode">Tambah</button>
              </details>
            </section>
            <div class="save-bar"><button type="button" class="btn" data-act="backToSettings">Batal</button><button type="submit" class="btn primary" data-act="saveDocset">Simpan</button></div>
          </form>
          <aside class="preview-col"><small class="muted">Pratonton</small><div data-live="header">${docHeader(v)}</div></aside>
        </div>`;
    }

    function renameModal() {
      if (UI.modal !== 'rename') return '';
      return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="rTitle"><div class="sheet">
        <h2 id="rTitle">Tukar nama folder & Sheet juga?</h2>
        <p>Profil disimpan. Mahu tukar nama folder dan Google Sheet dalam Drive anda kepada <b>${esc(AI.workspaceName(UI.renameTo))}</b>?</p>
        <div class="sheet-acts"><button class="btn primary" data-act="renameYes">Ya, tukar nama</button><button class="btn" data-act="renameNo">Tidak, kekalkan</button></div>
      </div></div>`;
    }

    ctx.header = () => docHeader(Object.assign({}, sk(), f()));
    return { views: { setup: viewSetup, profil: viewProfil, docset: viewDocset }, actions, onInput, live, startWizard, renameModal, docHeader };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
