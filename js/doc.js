(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const str = (v) => (v == null ? '' : String(v)).trim();

  AI.DOC_TYPES = {
    invoice: { label: 'Invois', title: 'INVOICE' },
    quotation: { label: 'Quotation', title: 'QUOTATION' },
    do: { label: 'Delivery Order', title: 'DELIVERY ORDER' }
  };
  AI.UNITS = ['UNIT', 'PCS', 'SET', 'LOT', 'JOB', 'NOS', 'BOX', 'KG', 'METER', 'DAY', 'HOUR', 'TRIP', 'MONTH'];
  AI.TERMS = ['CASH', 'COD', '7 DAYS', '14 DAYS', '30 DAYS', '60 DAYS'];
  AI.MAX_ITEMS = 100;
  AI.todayMY = (now) => new Date((now == null ? Date.now() : now) + 8 * 3600e3).toISOString().slice(0, 10);

  const isReg = (sk) => str(sk && sk.sst_berdaftar).toUpperCase() === 'YA';
  AI.activeCodes = (codes) => (codes || []).filter((c) => str(c.aktif).toUpperCase() === 'YA' || str(c.kod).toUpperCase() === 'TIADA');
  // Kod cukai lalai item baharu: satu-satunya kod SST aktif jika berdaftar, jika tidak TIADA
  AI.defaultTaxCode = (sk, codes) => {
    if (!isReg(sk)) return 'TIADA';
    const sst = AI.activeCodes(codes).filter((c) => str(c.jenis) !== 'tiada');
    return sst.length === 1 ? sst[0].kod : 'TIADA';
  };
  // "Cukai Perkhidmatan 8%" sudah menyebut kadar → jangan tambah "(8%)" lagi
  AI.taxLabel = (c) => { const k = Number(c.kadar), n = str(c.nama); return n.includes(k + '%') ? n : `${n} (${k}%)`; };
  AI.blankItem = (sk, codes) => ({ desc: '', qty: '1', unit: 'UNIT', price: '', disc: '', tax_code: AI.defaultTaxCode(sk, codes) });

  AI.newDraft = (jenis, sk, codes, o) => {
    o = o || {};
    sk = sk || {};
    return {
      id: '', jenis: AI.DOC_TYPES[jenis] ? jenis : 'invoice', email: o.email || '', tarikh: AI.todayMY(o.now),
      pelanggan_id: '', bill_nama: '', bill_alamat: '', bill_tel: '', attn: '',
      our_ref: '', your_ref: '', terma: str(sk.terma_default), validity: str(sk.validity_default) || '30 DAYS',
      ship_sama: true, ship_nama: '', ship_alamat: '', ship_attn: '', ship_tel: '',
      sumber_jenis: '', sumber_no: '', items: [AI.blankItem(sk, codes)]
    };
  };

  const itemEmpty = (it) => !str(it.desc) && !str(it.price) && !str(it.disc) && (str(it.qty) === '' || str(it.qty) === '1');
  AI.cleanItems = (items) => (items || []).filter((it) => !itemEmpty(it));
  const dp = (v, n) => { const s = str(v).replace(/,/g, ''); const m = s.match(/\.(\d+)$/); return !m || m[1].length <= n; };

  /**
   * Validasi sebelum terbit. Pulang { medan: mesej }; item sebagai "it:<indeks>:<medan>".
   */
  AI.validateDraft = (d, sk, codes) => {
    const e = {};
    const doo = d.jenis === 'do';
    if (!str(d.bill_nama)) e.bill_nama = 'Nama pelanggan (Bill To) wajib diisi.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(d.tarikh)) || Number.isNaN(Date.parse(d.tarikh))) e.tarikh = 'Tarikh tidak sah.';
    if (doo && !d.ship_sama && !str(d.ship_alamat)) e.ship_alamat = 'Alamat hantar wajib jika berbeza daripada Bill To.';
    const items = d.items || [];
    const filled = items.map((it, i) => [it, i]).filter(([it]) => !itemEmpty(it));
    if (!filled.length) e.items = 'Tambah sekurang-kurangnya satu item.';
    if (filled.length > AI.MAX_ITEMS) e.items = `Maksimum ${AI.MAX_ITEMS} item setiap dokumen.`;
    const active = new Set(AI.activeCodes(codes).map((c) => str(c.kod).toUpperCase()));
    filled.forEach(([it, i]) => {
      const k = (f) => `it:${i}:${f}`;
      if (!str(it.desc)) e[k('desc')] = 'Penerangan wajib.';
      const q = Number(str(it.qty).replace(/,/g, ''));
      if (!(q > 0) || !dp(it.qty, 3)) e[k('qty')] = 'Kuantiti mesti lebih 0 (maks 3 perpuluhan).';
      if (doo) return;
      const p = Number(str(it.price).replace(/,/g, ''));
      if (str(it.price) === '' || !(p >= 0) || !dp(it.price, 2)) e[k('price')] = 'Harga mesti 0 atau lebih (maks 2 perpuluhan).';
      const dc = str(it.disc) === '' ? 0 : Number(str(it.disc).replace(/,/g, ''));
      const gross = AI.lineCents({ qty: it.qty, price: it.price, disc: 0 });
      if (!(dc >= 0) || !dp(it.disc, 2)) e[k('disc')] = 'Diskaun tidak sah.';
      else if (Number.isFinite(gross) && AI.toCents(dc) > gross) e[k('disc')] = 'Diskaun melebihi jumlah baris.';
      if (isReg(sk) && !active.has(str(it.tax_code || 'TIADA').toUpperCase())) e[k('tax_code')] = 'Kod cukai tidak aktif.';
    });
    return e;
  };

  // ---------- data paparan dokumen (untuk templat & PDF) ----------
  const lines = (s) => str(s).split('\n').map((x) => x.trim()).filter(Boolean);
  const noteKeys = { invoice: ['nota_invois_1', 'nota_invois_2', 'nota_invois_3'], quotation: ['nota_quotation_1', 'nota_quotation_2', 'nota_quotation_3'], do: ['nota_do_1', 'nota_do_2'] };

  AI.docView = (d, sk, codes, o) => {
    o = o || {}; sk = sk || {};
    const jenis = d.jenis, doo = jenis === 'do', reg = isReg(sk);
    const items = AI.cleanItems(d.items);
    const calc = AI.calcDoc(items, codes, { taxable: reg, jenis });
    const mmyy = (str(d.tarikh).match(/^(\d{4})-(\d{2})/) || []);
    const number = o.number || `${AI.prefixFor ? AI.prefixFor(sk, jenis) : 'DOC'}/${mmyy[2] || '00'}${(mmyy[1] || '0000').slice(2)}-XXX`;
    const title = jenis === 'invoice' ? (str(sk.tajuk_invois) || 'INVOICE').toUpperCase() : AI.DOC_TYPES[jenis].title;
    const showDisc = !doo && calc.discount > 0;
    const showTax = !doo && reg && calc.taxes.length > 0;
    const codeName = {}; (codes || []).forEach((c) => { codeName[str(c.kod).toUpperCase()] = c; });
    const meta = [['No.', number], ['Date', AI.fmtDate(d.tarikh)]];
    if (jenis === 'quotation') meta.push(['Validity', str(d.validity)]);
    if (!doo && str(d.terma)) meta.push(['Terms', str(d.terma)]);
    if (doo) {
      if (str(d.sumber_no) || str(d.our_ref)) meta.push(['Ref No.', str(d.sumber_no) || str(d.our_ref)]);
      if (str(d.your_ref)) meta.push(['PO No.', str(d.your_ref)]);
    } else {
      if (str(d.our_ref)) meta.push(['Our Ref.', str(d.our_ref)]);
      if (str(d.your_ref)) meta.push(['Your Ref.', str(d.your_ref)]);
    }
    const rows = items.map((it, i) => {
      const ln = calc.lines[i] || {};
      const tc = codeName[str(it.tax_code || 'TIADA').toUpperCase()];
      return {
        n: i + 1, desc: str(it.desc), qty: AI.fmtQty(it.qty), unit: str(it.unit),
        price: doo ? '' : AI.fmtMoney(AI.toCents(it.price) || 0), disc: ln.disc ? AI.fmtMoney(ln.disc) : '',
        tax: showTax && tc && Number(tc.kadar) > 0 ? `${Number(tc.kadar)}%` : '', amount: doo ? '' : AI.fmtMoney(ln.amount || 0)
      };
    });
    const signer = doo && str(sk.do_tt_nama)
      ? { name: str(sk.do_tt_nama), title: str(sk.do_tt_jawatan), tel: str(sk.do_tt_tel) }
      : { name: str(sk.tt_nama), title: str(sk.tt_jawatan), tel: doo ? str(sk.do_tt_tel) : '' };
    const ship = doo ? (d.ship_sama ? null : { name: str(d.ship_nama), address: lines(d.ship_alamat), attn: str(d.ship_attn), tel: str(d.ship_tel) }) : null;
    return {
      jenis, title, number, isDraft: !o.number, accent: /^#[0-9a-f]{6}$/i.test(str(sk.warna_aksen)) ? str(sk.warna_aksen) : '#0f172a',
      co: {
        name: str(sk.nama), reg: str(sk.ssm), address: lines(sk.alamat), tel: str(sk.tel), email: str(sk.emel), web: str(sk.laman),
        sst: reg ? str(sk.sst_no) : '', tin: str(sk.tin)
      },
      bill: { name: str(d.bill_nama), address: lines(d.bill_alamat), tel: str(d.bill_tel), attn: str(d.attn) },
      ship, meta, rows, showDisc, showTax,
      totals: doo ? { qty: AI.fmtQty(calc.qty) } : {
        subtotal: AI.fmtMoney(calc.subtotal), taxes: calc.taxes.map((t) => ({ label: AI.taxLabel(t), base: AI.fmtMoney(t.base), amount: AI.fmtMoney(t.tax) })),
        total: AI.fmtMoney(calc.total), words: AI.amountWords(calc.total), cents: calc
      },
      notes: noteKeys[jenis].map((k) => str(sk[k])).filter(Boolean),
      bank: jenis === 'invoice' && (str(sk.bank_nama) || str(sk.bank_akaun)) ? { name: str(sk.bank_nama), acc: str(sk.bank_akaun), holder: str(sk.bank_pemegang) || str(sk.nama) } : null,
      signer, received: doo
    };
  };

  // ---------- baris Sheet untuk dokumen terbit (docs/05-BSD.md §3A) ----------
  AI.docRow = (d, v, issued, email) => {
    const doo = d.jenis === 'do', c = v.totals.cents || { subtotal: 0, tax: 0, total: 0, taxes: [] };
    const items = AI.cleanItems(d.items).map((it, i) => ({ n: i + 1, desc: str(it.desc), qty: str(it.qty), unit: str(it.unit),
      price: doo ? '' : str(it.price), disc: doo ? '' : str(it.disc), tax_code: doo ? '' : str(it.tax_code || 'TIADA'),
      amount: doo ? '' : AI.fromCents((c.lines && c.lines[i] && c.lines[i].amount) || 0) }));
    const ship = doo ? (d.ship_sama ? { n: d.bill_nama, a: d.bill_alamat, at: d.attn, t: d.bill_tel } : { n: d.ship_nama, a: d.ship_alamat, at: d.ship_attn, t: d.ship_tel }) : { n: '', a: '', at: '', t: '' };
    return {
      doc_id: d.doc_id, jenis: d.jenis, no_dokumen: issued.number, tarikh: d.tarikh, status: 'Terbit', status_quotation: d.jenis === 'quotation' ? 'Menunggu' : '',
      pelanggan_id: str(d.pelanggan_id), bill_nama: str(d.bill_nama), bill_alamat: str(d.bill_alamat), bill_tel: str(d.bill_tel), attn: str(d.attn),
      our_ref: str(d.our_ref), your_ref: str(d.your_ref), terma: doo ? '' : str(d.terma), validity: d.jenis === 'quotation' ? str(d.validity) : '',
      ship_nama: str(ship.n), ship_alamat: str(ship.a), ship_attn: str(ship.at), ship_tel: str(ship.t),
      sumber_jenis: str(d.sumber_jenis), sumber_no: str(d.sumber_no), ditukar_kepada: '',
      subtotal: doo ? '' : AI.fromCents(c.subtotal), jumlah_cukai: doo ? '' : AI.fromCents(c.tax), jumlah: doo ? '' : AI.fromCents(c.total),
      jumlah_perkataan: doo ? '' : v.totals.words, jumlah_qty: doo ? Number(v.totals.qty) || 0 : '', bil_item: items.length,
      items_json: JSON.stringify(items), ringkasan_cukai_json: doo || !c.taxes.length ? '' : JSON.stringify(c.taxes.map((t) => ({ kod: t.kod, kadar: t.kadar, asas: AI.fromCents(t.base), cukai: AI.fromCents(t.tax) }))),
      pdf_url: '', pdf_id: '', hash_kandungan: '', diterbit_pada: issued.issuedAt, diterbit_oleh: email || '', dikemaskini_pada: issued.issuedAt,
      dibatalkan_pada: '', sebab_batal: '', skema: 1
    };
  };
  AI.itemRows = (row) => JSON.parse(row.items_json || '[]').map((it) => ({ no_dokumen: row.no_dokumen, n: it.n, desc: it.desc, qty: it.qty, unit: it.unit, price: it.price, disc: it.disc, tax_code: it.tax_code, amount: it.amount }));
  // Kandungan kanonik untuk hash (bukti ubahsuai): medan yang dicetak pada dokumen
  const HASH_KEYS = ['no_dokumen', 'jenis', 'tarikh', 'bill_nama', 'bill_alamat', 'bill_tel', 'attn', 'our_ref', 'your_ref', 'terma', 'validity',
    'ship_nama', 'ship_alamat', 'ship_attn', 'ship_tel', 'subtotal', 'jumlah_cukai', 'jumlah', 'jumlah_qty', 'items_json', 'ringkasan_cukai_json'];
  AI.hashInput = (row) => JSON.stringify(HASH_KEYS.map((k) => [k, row[k] == null ? '' : String(row[k])]));
  AI.sha256Hex = async (text) => {
    const buf = await (root.crypto || globalThis.crypto).subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  AI.pdfName = (number, bill) => (String(number).replace(/\//g, '-') + ' - ' + str(bill).slice(0, 40)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
  AI.newDocId = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

  // ---------- pembahagian halaman A4 (anggaran tinggi; sama untuk pratonton & PDF) ----------
  AI.PAGE = { first: 640, next: 880, rowPad: 10, lineH: 15 };
  AI.rowLines = (desc, cpl) => {
    const ls = String(desc || '').split('\n');
    return ls.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / cpl)), 0);
  };
  AI.footerHeight = (v) => {
    const notes = v.notes.length * 16;
    if (v.jenis === 'do') return 60 + notes + 170;
    return 60 + (1 + v.totals.taxes.length + 1) * 20 + 34 + notes + (v.bank ? 44 : 0) + 170;
  };
  // Pulang [{ rows:[...indeks], last }]. Jika ruang tidak cukup untuk jumlah/tandatangan, ia ke halaman baharu.
  AI.paginate = (v, P) => {
    P = Object.assign({}, AI.PAGE, P || {});
    const cpl = v.showDisc || v.showTax ? 44 : 58;
    const hs = v.rows.map((r) => P.rowPad + P.lineH * AI.rowLines(r.desc, cpl));
    const pages = []; let cur = [], used = 0, cap = P.first;
    hs.forEach((h, i) => {
      if (cur.length && used + h > cap) { pages.push({ rows: cur }); cur = []; used = 0; cap = P.next; }
      cur.push(i); used += h;
    });
    const foot = AI.footerHeight(v);
    if (used + foot > cap && cur.length) { pages.push({ rows: cur }); cur = []; }
    pages.push({ rows: cur });
    pages.forEach((p, i) => { p.last = i === pages.length - 1; p.no = i + 1; p.of = pages.length; });
    return pages;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
