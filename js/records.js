(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const str = (v) => (v == null ? '' : String(v)).trim();
  AI.EDIT_HOURS = 24;
  AI.normName = (s) => str(s).toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');

  // Status paparan dokumen terbit: Terbit (boleh edit) → Dikunci (selepas 24 jam) ; Batal
  AI.docState = (row, now) => {
    now = now == null ? Date.now() : now;
    if (str(row.status) === 'Batal') return { key: 'batal', label: 'Batal', tone: 'red', editable: false, voidable: false };
    const t = Date.parse(row.diterbit_pada);
    const editable = Number.isFinite(t) && now - t <= AI.EDIT_HOURS * 3600e3;
    return editable ? { key: 'terbit', label: 'Terbit', tone: 'green', editable: true, voidable: true, until: new Date(t + AI.EDIT_HOURS * 3600e3).toISOString() }
      : { key: 'dikunci', label: 'Dikunci', tone: 'blue', editable: false, voidable: true };
  };
  AI.quoteState = (row) => (row.jenis !== 'quotation' || str(row.status) === 'Batal' ? null
    : str(row.status_quotation) === 'Ditukar' ? { label: 'Ditukar', tone: 'green' } : { label: 'Menunggu', tone: 'amber' });

  AI.monthsOf = (rows) => Array.from(new Set((rows || []).map((r) => str(r.tarikh).slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))).sort().reverse();

  // f: { jenis: ''|invoice|quotation|do, status: ''|terbit|dikunci|batal|menunggu|ditukar, bulan: ''|YYYY-MM, q }
  AI.filterDocs = (rows, f, now) => {
    f = f || {};
    const q = AI.normName(f.q);
    return (rows || []).filter((r) => {
      if (f.jenis && r.jenis !== f.jenis) return false;
      if (f.bulan && str(r.tarikh).slice(0, 7) !== f.bulan) return false;
      if (f.status) {
        const st = AI.docState(r, now).key, qs = AI.quoteState(r);
        if (['terbit', 'dikunci', 'batal'].includes(f.status) && st !== f.status) return false;
        if (f.status === 'menunggu' && !(qs && qs.label === 'Menunggu')) return false;
        if (f.status === 'ditukar' && !(qs && qs.label === 'Ditukar')) return false;
      }
      if (q && !(AI.normName(r.no_dokumen).includes(q) || AI.normName(r.bill_nama).includes(q) || AI.normName(r.your_ref).includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.diterbit_pada).localeCompare(String(a.diterbit_pada)));
  };

  // Baris Sheet → item draf
  const itemsOf = (row) => { try { return JSON.parse(row.items_json || '[]'); } catch (e) { return []; } };
  const toItem = (it, jenis, sk, codes) => ({ desc: str(it.desc), qty: str(it.qty) || '1', unit: str(it.unit) || 'UNIT',
    price: jenis === 'do' ? '' : str(it.price), disc: jenis === 'do' ? '' : str(it.disc), tax_code: str(it.tax_code) || AI.defaultTaxCode(sk, codes) });
  const base = (row, jenis, sk, codes) => {
    const items = itemsOf(row).map((it) => toItem(it, jenis, sk, codes));
    return { pelanggan_id: str(row.pelanggan_id), bill_nama: str(row.bill_nama), bill_alamat: str(row.bill_alamat), bill_tel: str(row.bill_tel), attn: str(row.attn),
      items: items.length ? items : [AI.blankItem(sk, codes)] };
  };

  // Edit dalam 24 jam: nombor, jenis dan tarikh kekal (nombor terikat pada doc_id dan bulan)
  AI.draftForEdit = (row, sk, codes, email) => {
    const doo = row.jenis === 'do';
    const sameShip = doo && str(row.ship_nama) === str(row.bill_nama) && str(row.ship_alamat) === str(row.bill_alamat);
    return Object.assign(AI.newDraft(row.jenis, sk, codes, { email }), base(row, row.jenis, sk, codes), {
      doc_id: row.doc_id, editing: true, issued: { number: row.no_dokumen, issuedAt: row.diterbit_pada },
      tarikh: str(row.tarikh), our_ref: str(row.our_ref), your_ref: str(row.your_ref), terma: str(row.terma), validity: str(row.validity),
      ship_sama: !doo || sameShip, ship_nama: str(row.ship_nama), ship_alamat: str(row.ship_alamat), ship_attn: str(row.ship_attn), ship_tel: str(row.ship_tel),
      sumber_jenis: str(row.sumber_jenis), sumber_no: str(row.sumber_no)
    });
  };

  // Salin sebagai draf baharu (tarikh hari ini, tiada nombor)
  AI.draftCopy = (row, sk, codes, email) => Object.assign(AI.newDraft(row.jenis, sk, codes, { email }), base(row, row.jenis, sk, codes), {
    our_ref: str(row.our_ref), your_ref: str(row.your_ref), terma: str(row.terma) || str(sk && sk.terma_default), validity: str(row.validity) || str(sk && sk.validity_default) || '30 DAYS'
  });

  // Tukar: Quotation → Invois ; Invois/Quotation → DO
  AI.draftConvert = (row, to, sk, codes, email) => {
    if (!((row.jenis === 'quotation' && to === 'invoice') || (to === 'do' && (row.jenis === 'invoice' || row.jenis === 'quotation')))) throw new Error('Penukaran tidak disokong');
    const d = Object.assign(AI.newDraft(to, sk, codes, { email }), base(row, to, sk, codes), { sumber_jenis: row.jenis, sumber_no: str(row.no_dokumen) });
    if (to === 'invoice') Object.assign(d, { your_ref: str(row.your_ref) || str(row.no_dokumen), our_ref: str(row.our_ref), terma: str(row.terma) || d.terma });
    else Object.assign(d, { your_ref: str(row.your_ref), our_ref: '', ship_sama: true });
    return d;
  };

  // Kemas kini dokumen asal selepas penukaran diterbit
  AI.sourceUpdate = (src, newNumber) => {
    const list = str(src.ditukar_kepada).split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.includes(newNumber)) list.push(newNumber);
    const upd = { no_dokumen: src.no_dokumen, ditukar_kepada: list.join(', ') };
    if (src.jenis === 'quotation') upd.status_quotation = 'Ditukar';
    return upd;
  };

  // ---------- pelanggan ----------
  AI.validateCustomer = (c, all, editingId) => {
    const e = {};
    if (!str(c.nama)) e.nama = 'Nama pelanggan wajib diisi.';
    if (str(c.emel) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(c.emel))) e.emel = 'Format e-mel tidak sah.';
    const dup = (all || []).find((x) => x.id !== editingId && AI.normName(x.nama) === AI.normName(c.nama));
    return { errors: e, duplicate: dup || null };
  };
  AI.docsOfCustomer = (c, docs) => (docs || []).filter((r) => (c.id && str(r.pelanggan_id) === c.id) || AI.normName(r.bill_nama) === AI.normName(c.nama));

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
