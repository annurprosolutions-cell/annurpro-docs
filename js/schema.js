(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  // Skema Sheet pengguna (docs/05-BSD.md §3A). Baca/tulis sentiasa ikut NAMA lajur, bukan indeks.
  AI.SHEET_FORMAT = 1;
  AI.APP_MARK = 'annurInvoice';           // kunci appProperties pada fail Drive ciptaan app
  AI.FOLDERS = { invoice: 'Invois', quotation: 'Quotation', do: 'Delivery Order', settings: '_Tetapan' };
  AI.ROOT_FOLDER = 'Annur Docs';

  AI.TABS = {
    Meta: ['kunci', 'nilai'],
    Syarikat: ['kunci', 'nilai', 'keterangan'],
    KodCukai: ['kod', 'nama', 'kadar', 'jenis', 'aktif'],
    Pelanggan: ['id', 'nama', 'alamat', 'tel', 'attn', 'emel', 'tin', 'brn', 'arkib', 'dicipta'],
    Dokumen: ['doc_id', 'jenis', 'no_dokumen', 'tarikh', 'status', 'status_quotation', 'pelanggan_id',
      'bill_nama', 'bill_alamat', 'bill_tel', 'attn', 'our_ref', 'your_ref', 'terma', 'validity',
      'ship_nama', 'ship_alamat', 'ship_attn', 'ship_tel', 'sumber_jenis', 'sumber_no', 'ditukar_kepada',
      'subtotal', 'jumlah_cukai', 'jumlah', 'jumlah_perkataan', 'jumlah_qty', 'bil_item', 'items_json',
      'ringkasan_cukai_json', 'pdf_url', 'pdf_id', 'hash_kandungan', 'diterbit_pada', 'diterbit_oleh',
      'dikemaskini_pada', 'dibatalkan_pada', 'sebab_batal', 'skema'],
    Item: ['no_dokumen', 'n', 'desc', 'qty', 'unit', 'price', 'disc', 'tax_code', 'amount']
  };
  AI.TAB_ORDER = ['Dokumen', 'Pelanggan', 'Syarikat', 'KodCukai', 'Item', 'Meta'];

  // Format kolum: teks (kekal sifar depan / tidak jadi tarikh) dan wang
  AI.TAB_FORMAT = {
    Meta: { text: ['nilai'] },
    Syarikat: { text: ['nilai'] },
    KodCukai: { text: ['kod'] },
    Pelanggan: { text: ['tel', 'tin', 'brn'] },
    Dokumen: { text: ['no_dokumen', 'tarikh', 'bill_tel', 'ship_tel', 'our_ref', 'your_ref', 'sumber_no'], money: ['subtotal', 'jumlah_cukai', 'jumlah'] },
    Item: { text: ['no_dokumen'], money: ['price', 'disc', 'amount'] }
  };

  // Senarai pilihan (dropdown dalam Sheet)
  AI.TAB_ENUMS = {
    KodCukai: { jenis: ['tiada', 'sst_jualan', 'sst_perkhidmatan'], aktif: ['YA', 'TIDAK'] },
    Pelanggan: { arkib: ['YA', 'TIDAK'] },
    Dokumen: { jenis: ['invoice', 'quotation', 'do'], status: ['Terbit', 'Batal'], status_quotation: ['', 'Menunggu', 'Ditukar'] }
  };

  // Tetapan syarikat default: [kunci, nilai, keterangan]. Hanya kunci yang belum wujud ditambah.
  AI.SYARIKAT_DEFAULTS = [
    ['nama', '', 'Nama syarikat (wajib)'],
    ['ssm', '', 'No. pendaftaran SSM'],
    ['tin', '', 'TIN (pilihan)'],
    ['brn', '', 'BRN (pilihan)'],
    ['sst_berdaftar', 'TIDAK', 'YA / TIDAK'],
    ['sst_no', '', 'No. pendaftaran SST'],
    ['alamat', '', 'Alamat (satu baris = satu baris dokumen)'],
    ['emel', '', 'E-mel'],
    ['tel', '', 'No. telefon'],
    ['laman', '', 'Laman web'],
    ['kod_syarikat', '', 'Kod 2-6 huruf, asas prefix'],
    ['prefix_invois', '', 'Prefix invois (kosong = kod syarikat)'],
    ['prefix_quotation', '', 'Prefix quotation (kosong = kod-Q)'],
    ['prefix_do', '', 'Prefix DO (kosong = kod-DO)'],
    ['tajuk_invois', 'INVOICE', 'INVOICE atau TAX INVOICE'],
    ['bank_nama', '', 'Nama bank'],
    ['bank_akaun', '', 'No. akaun bank'],
    ['bank_pemegang', '', 'Nama pemegang akaun'],
    ['tt_nama', '', 'Nama penandatangan'],
    ['tt_jawatan', '', 'Jawatan penandatangan'],
    ['do_tt_nama', '', 'Penandatangan DO (kosong = sama)'],
    ['do_tt_jawatan', '', 'Jawatan penandatangan DO'],
    ['do_tt_tel', '', 'Telefon penandatangan DO'],
    ['nota_invois_1', 'Thank you for your business.', 'Nota invois 1'],
    ['nota_invois_2', '', 'Nota invois 2'],
    ['nota_invois_3', '', 'Nota invois 3'],
    ['nota_quotation_1', 'Payment terms: 50% deposit upon confirmation, balance upon completion.', 'Nota quotation 1'],
    ['nota_quotation_2', 'Delivery / completion: 2 - 3 weeks upon confirmation of order.', 'Nota quotation 2'],
    ['nota_quotation_3', 'Prices are subject to change after the validity period.', 'Nota quotation 3'],
    ['nota_do_1', 'Please check all goods upon delivery. Any discrepancy must be reported within 24 hours.', 'Nota DO 1'],
    ['nota_do_2', 'Goods received in good order and condition.', 'Nota DO 2'],
    ['terma_default', '', 'Terma default, cth 30 DAYS'],
    ['validity_default', '30 DAYS', 'Tempoh sah quotation'],
    ['warna_aksen', '#0f172a', 'Warna aksen dokumen (hex)'],
    ['kongsi_awam', 'YA', 'PDF boleh dibuka sesiapa dengan pautan'],
    ['logo_id', '', 'Fail logo (Drive)'],
    ['cop_id', '', 'Fail cop (Drive)'],
    ['tt_gambar_id', '', 'Fail tandatangan (Drive)'],
    ['do_tt_gambar_id', '', 'Fail tandatangan DO (Drive)'],
    ['cop_x', '36', 'Kedudukan cop kiri (px)'],
    ['cop_y', '20', 'Kedudukan cop atas (px)'],
    ['cop_saiz', '106', 'Saiz cop (px)'],
    ['tt_x', '24', 'Kedudukan tandatangan kiri (px)'],
    ['tt_y', '28', 'Kedudukan tandatangan atas (px)'],
    ['tt_lebar', '150', 'Lebar tandatangan (px)'],
    ['dikemaskini', '', 'Auto']
  ];

  // Kadar perlu disahkan dengan Kastam sebelum launch (docs/01-PRD.md §8)
  AI.KODCUKAI_SEED = [
    ['TIADA', 'Tiada cukai', 0, 'tiada', 'YA'],
    ['SST-JUALAN-5', 'Cukai Jualan 5%', 5, 'sst_jualan', 'TIDAK'],
    ['SST-JUALAN-10', 'Cukai Jualan 10%', 10, 'sst_jualan', 'TIDAK'],
    ['SST-PERKHIDMATAN-6', 'Cukai Perkhidmatan 6%', 6, 'sst_perkhidmatan', 'TIDAK'],
    ['SST-PERKHIDMATAN-8', 'Cukai Perkhidmatan 8%', 8, 'sst_perkhidmatan', 'TIDAK']
  ];

  // ---------- tukar baris ↔ objek ikut nama lajur ----------
  const str = (v) => (v == null ? '' : String(v)).trim();

  // values: tatasusunan baris (baris 0 = tajuk). Baris kosong dibuang. Setiap objek ada _row (nombor baris Sheet, 1-asas).
  AI.rowsToObjects = (values) => {
    const rows = values || [];
    const head = (rows[0] || []).map(str);
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (!r.some((c) => str(c) !== '')) continue;
      const o = { _row: i + 1 };
      head.forEach((h, j) => { if (h) o[h] = r[j] == null ? '' : r[j]; });
      out.push(o);
    }
    return { head, rows: out };
  };

  // Objek → baris ikut tajuk sedia ada. Medan tiada dalam objek kekal nilai `base` (jika ada) atau ''.
  AI.objectToRow = (head, obj, base) => head.map((h, j) => {
    if (h && Object.prototype.hasOwnProperty.call(obj, h)) return obj[h] == null ? '' : obj[h];
    return base && base[j] != null ? base[j] : '';
  });

  // Tab kunci/nilai → objek biasa
  AI.kvOf = (values) => {
    const o = {};
    AI.rowsToObjects(values).rows.forEach((r) => { const k = str(r.kunci); if (k) o[k] = r.nilai == null ? '' : r.nilai; });
    return o;
  };

  // Nombor lajur (1-asas) → huruf A1 (1 → A, 27 → AA)
  AI.colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
