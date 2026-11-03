(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const str = (v) => (v == null ? '' : String(v)).trim();

  AI.ISSUE_STEPS = ['Mengeluarkan nombor', 'Menyimpan ke Google Sheet', 'Menjana PDF', 'Memuat naik ke Google Drive'];

  /**
   * Terbit satu dokumen (docs/02-TRD.md §4). Setiap langkah selamat diulang:
   * nombor diikat pada doc_id (Worker), baris Sheet ditulis sekali ikut doc_id, PDF dicari ikut doc_id sebelum dicipta.
   * deps: { sk, codes, api (GoogleApi), store (Store), ws {folders}, email, worker(method, path, body) → {status, body},
   *         makePdf(pagesHtml[], meta) → Uint8Array, assets(jenis) → {logo, sign}, saveDraft(d), dropDraft(id) }
   * onStep(i) dipanggil sebelum setiap langkah.
   * Ralat: e.validation (medan), e.paywall (jawapan 403 Worker), e.step (langkah gagal), selainnya ralat biasa.
   */
  AI.issueDocument = async (deps, draft, onStep) => {
    const step = (i) => { if (onStep) onStep(i); };
    const { sk, codes, api, store } = deps;
    const errs = AI.validateDraft(draft, sk, codes);
    if (Object.keys(errs).length) { const e = new Error('Dokumen belum lengkap'); e.validation = errs; throw e; }
    const now = deps.now ? deps.now() : Date.now();
    if (draft.editing) {
      const t = Date.parse(draft.issued && draft.issued.issuedAt);
      if (!(now - t <= AI.EDIT_HOURS * 3600e3)) { const e = new Error('Tempoh edit 24 jam telah tamat. Batalkan dokumen dan terbit yang baharu.'); e.validation = { _: e.message }; throw e; }
    }
    if (!draft.doc_id) { draft.doc_id = AI.newDocId(); await deps.saveDraft(draft); }
    let at = 0, issued = null;
    try {
      // 1) nombor rasmi (idempotent ikut doc_id)
      step(at = 0);
      const r = await deps.worker('POST', '/api/issue', { docId: draft.doc_id, type: draft.jenis, prefix: AI.prefixFor(sk, draft.jenis), date: draft.tarikh });
      if (r.status === 403) { const e = new Error(r.body.error || 'Tiada kelayakan'); e.paywall = r.body; throw e; }
      if (!r.body || !r.body.ok) { const e = new Error((r.body && r.body.error) || 'Gagal mengeluarkan nombor (HTTP ' + r.status + ')'); e.status = r.status; throw e; }
      issued = r.body;
      if (draft.editing && issued.number !== draft.issued.number) throw new Error('Nombor dokumen tidak sepadan; edit dibatalkan.');
      if (!draft.issued || draft.issued.number !== issued.number) { draft.issued = { number: issued.number, issuedAt: issued.issuedAt }; await deps.saveDraft(draft); }

      // 2) baris Sheet (Dokumen + Item rujukan)
      step(at = 1);
      const view = AI.docView(draft, sk, codes, { number: issued.number, demo: deps.demo });
      const row = AI.docRow(draft, view, issued, deps.email);
      row.hash_kandungan = await AI.sha256Hex(AI.hashInput(row));
      const existing = store.list('Dokumen').find((x) => str(x.doc_id) === draft.doc_id);
      if (draft.editing && existing) {
        // edit: baris & item yang sama diganti; maklumat terbit asal dan pautan PDF dikekalkan
        ['diterbit_pada', 'diterbit_oleh', 'status_quotation', 'ditukar_kepada', 'pdf_url', 'pdf_id'].forEach((k) => { row[k] = existing[k]; });
        row.dikemaskini_pada = new Date(now).toISOString();
        store.update('Dokumen', 'doc_id', row);
        store.replaceRows('Item', 'no_dokumen', issued.number, AI.itemRows(row));
      } else {
        store.append('Dokumen', [row], 'doc_id');
        store.append('Item', AI.itemRows(row), 'no_dokumen');
        // penukaran: tanda dokumen asal (Quotation → Ditukar; senarai ditukar_kepada)
        const src = str(draft.sumber_no) && store.list('Dokumen').find((x) => str(x.no_dokumen) === str(draft.sumber_no));
        if (src) store.update('Dokumen', 'no_dokumen', AI.sourceUpdate(src, issued.number));
      }
      await store.flush();

      // 3) PDF
      step(at = 2);
      const pages = AI.renderDocPages(view, deps.assets(draft.jenis));
      const bytes = await deps.makePdf(pages, { title: `${view.title} ${issued.number}` });

      // 4) Drive: guna semula fail sedia ada untuk doc_id ini (cuba semula), jika tidak cipta
      step(at = 3);
      const folder = deps.ws.folders[draft.jenis] || deps.ws.folders.root;
      let file = (await api.findByProp('doc_id', draft.doc_id, 'application/pdf'))[0];
      if (!file) {
        file = await api.createFile({ name: AI.pdfName(issued.number, draft.bill_nama), mimeType: 'application/pdf', parents: [folder],
          appProperties: { [AI.APP_MARK]: 'pdf', doc_id: draft.doc_id } });
      }
      await api.uploadBytes(file.id, bytes, 'application/pdf');
      const fname = AI.pdfName(issued.number, draft.bill_nama);
      if (file.name && file.name !== fname) { try { await api.updateFile(file.id, { name: fname }); } catch (e) { /* nama lama kekal */ } }
      let shared = false, shareError = '';
      if (str(sk.kongsi_awam).toUpperCase() !== 'TIDAK') {
        try { await api.share(file.id); shared = true; } catch (e) { shareError = AI.googleErrorHint(e); }
      }
      const url = (deps.linkOf && deps.linkOf(file.id)) || file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
      store.update('Dokumen', 'doc_id', { doc_id: draft.doc_id, pdf_url: url, pdf_id: file.id });
      await store.flush();

      if (draft.id) await deps.dropDraft(draft.id);
      return { edited: !!draft.editing, number: issued.number, docId: draft.doc_id, url, fileId: file.id, bytes, shared, shareError, credits: issued.credits, charged: issued.charged, repeat: issued.repeat, view, row };
    } catch (e) {
      if (e.paywall || e.validation) throw e;
      e.step = at; e.issued = issued;   // nombor & baki kredit terkini walaupun langkah kemudian gagal
      throw e;
    }
  };

  // Teks WhatsApp
  AI.waText = (title, number, bill, url) => `${title} ${number}${bill ? ' – ' + bill : ''}\n${url}`;

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
