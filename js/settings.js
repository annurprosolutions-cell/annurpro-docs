(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});
  const str = (v) => (v == null ? '' : String(v)).trim();

  AI.MY_BANKS = ['MAYBANK', 'CIMB BANK', 'PUBLIC BANK', 'RHB BANK', 'HONG LEONG BANK', 'AMBANK', 'BANK ISLAM', 'BANK RAKYAT',
    'BANK MUAMALAT', 'BSN', 'AFFIN BANK', 'ALLIANCE BANK', 'AGROBANK', 'OCBC BANK', 'UOB', 'HSBC', 'STANDARD CHARTERED', 'MBSB BANK'];
  AI.DOC_TITLES = ['INVOICE', 'TAX INVOICE'];

  // Medan yang disunting dalam Tetapan (kunci tab Syarikat)
  AI.PROFILE_KEYS = ['nama', 'ssm', 'tin', 'brn', 'alamat', 'emel', 'tel', 'laman', 'bank_nama', 'bank_akaun', 'bank_pemegang',
    'tt_nama', 'tt_jawatan', 'do_tt_nama', 'do_tt_jawatan', 'do_tt_tel', 'warna_aksen'];
  AI.DOCSET_KEYS = ['kod_syarikat', 'prefix_invois', 'prefix_quotation', 'prefix_do', 'tajuk_invois', 'terma_default', 'validity_default',
    'nota_invois_1', 'nota_invois_2', 'nota_invois_3', 'nota_quotation_1', 'nota_quotation_2', 'nota_quotation_3',
    'nota_do_1', 'nota_do_2', 'kongsi_awam', 'sst_berdaftar', 'sst_no'];
  const UPPER = ['kod_syarikat', 'prefix_invois', 'prefix_quotation', 'prefix_do', 'tajuk_invois', 'sst_berdaftar', 'kongsi_awam', 'bank_nama'];

  // ---------- prefix & nombor ----------
  AI.derivePrefixes = (kod) => { const k = str(kod).toUpperCase(); return { invoice: k, quotation: k ? k + '-Q' : '', do: k ? k + '-DO' : '' }; };
  const PKEY = { invoice: 'prefix_invois', quotation: 'prefix_quotation', do: 'prefix_do' };
  // Prefix berkesan: nilai sendiri jika diisi, jika tidak diterbit daripada kod syarikat, akhir sekali lalai sistem
  AI.prefixFor = (sk, type) => str(sk && sk[PKEY[type]]).toUpperCase() || AI.derivePrefixes(sk && sk.kod_syarikat)[type] || ({ invoice: 'INV', quotation: 'QT', do: 'DO' })[type];
  // Contoh nombor: PREFIX/MMYY-001 (tarikh ISO YYYY-MM-DD)
  AI.sampleNumber = (prefix, iso, seq) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
    const mmyy = m ? m[2] + m[1].slice(2) : '0000';
    return `${prefix}/${mmyy}-${String(seq || 1).padStart(3, '0')}`;
  };
  // Cadangan kod syarikat daripada nama: huruf awal setiap perkataan (maks 4), atau 3 huruf pertama
  AI.suggestCode = (nama) => {
    const words = str(nama).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !['SDN', 'BHD', 'ENTERPRISE', 'ENT', 'PLT', 'THE', 'AND', '&'].includes(w));
    if (!words.length) return '';
    if (words.length === 1) return words[0].slice(0, 3);
    return words.slice(0, 4).map((w) => w[0]).join('');
  };

  // ---------- normalisasi & validasi ----------
  AI.normalizeSettings = (v) => {
    const o = {};
    Object.keys(v || {}).forEach((k) => {
      let x = v[k] == null ? '' : String(v[k]);
      x = k === 'alamat' || k.startsWith('nota_') ? x.replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim() : x.trim();
      if (UPPER.includes(k)) x = x.toUpperCase();
      if (k === 'warna_aksen') x = x.toLowerCase();
      o[k] = x;
    });
    return o;
  };

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PREFIX = /^[A-Z0-9-]{1,12}$/;
  /**
   * Pulang { medan: mesej } (kosong = sah). `keys` = senarai medan yang disemak (borang semasa sahaja).
   */
  AI.validateSettings = (v, keys) => {
    const e = {};
    const has = (k) => !keys || keys.includes(k);
    const val = (k) => str(v[k]);
    if (has('nama')) { if (!val('nama')) e.nama = 'Nama syarikat wajib diisi.'; else if (val('nama').length > 120) e.nama = 'Maksimum 120 aksara.'; }
    if (has('kod_syarikat') && !/^[A-Z0-9]{2,6}$/.test(val('kod_syarikat').toUpperCase())) e.kod_syarikat = 'Kod 2 hingga 6 huruf atau nombor, tanpa ruang (cth APS).';
    ['prefix_invois', 'prefix_quotation', 'prefix_do'].forEach((k) => {
      if (has(k) && val(k) && !PREFIX.test(val(k).toUpperCase())) e[k] = 'Huruf, nombor dan tanda sempang sahaja (maks 12).';
    });
    if (has('prefix_invois') || has('prefix_quotation') || has('prefix_do')) {
      const sk = Object.assign({}, v); const ps = ['invoice', 'quotation', 'do'].map((t) => AI.prefixFor(sk, t));
      if (new Set(ps).size < 3) e.prefix_do = e.prefix_do || 'Prefix setiap jenis dokumen mesti berbeza.';
    }
    if (has('emel') && val('emel') && !EMAIL.test(val('emel'))) e.emel = 'Format e-mel tidak sah.';
    if (has('warna_aksen') && val('warna_aksen') && !/^#[0-9a-fA-F]{6}$/.test(val('warna_aksen'))) e.warna_aksen = 'Warna mesti dalam format #RRGGBB.';
    if (has('tajuk_invois') && val('tajuk_invois') && !AI.DOC_TITLES.includes(val('tajuk_invois').toUpperCase())) e.tajuk_invois = 'Pilih INVOICE atau TAX INVOICE.';
    if (has('sst_no') && val('sst_berdaftar').toUpperCase() === 'YA' && !val('sst_no')) e.sst_no = 'No. pendaftaran SST wajib jika berdaftar SST.';
    if (has('bank_akaun') && val('bank_akaun') && !/^[0-9 -]{6,24}$/.test(val('bank_akaun'))) e.bank_akaun = 'Nombor akaun: angka sahaja (boleh ada ruang atau sempang).';
    ['alamat', 'nota_invois_1', 'nota_invois_2', 'nota_invois_3', 'nota_quotation_1', 'nota_quotation_2', 'nota_quotation_3', 'nota_do_1', 'nota_do_2']
      .forEach((k) => { if (has(k) && val(k).length > 400) e[k] = 'Maksimum 400 aksara.'; });
    return e;
  };

  // ---------- kod cukai ----------
  AI.validateTaxCode = (c, existing) => {
    const e = {};
    const kod = str(c.kod).toUpperCase();
    if (!/^[A-Z0-9-]{2,24}$/.test(kod)) e.kod = 'Kod 2-24 huruf/nombor/sempang.';
    else if (existing && existing.some((x) => str(x.kod).toUpperCase() === kod)) e.kod = 'Kod ini sudah wujud.';
    if (!str(c.nama)) e.nama = 'Nama wajib diisi.';
    const k = Number(c.kadar);
    if (str(c.kadar) === '' || !Number.isFinite(k) || k < 0 || k > 100 || Math.round(k * 100) !== k * 100) e.kadar = 'Kadar 0 hingga 100, maksimum 2 tempat perpuluhan.';
    if (!['tiada', 'sst_jualan', 'sst_perkhidmatan'].includes(str(c.jenis))) e.jenis = 'Pilih jenis cukai.';
    return e;
  };

  // Kemas kini aktif/tidak aktif kod cukai bila status SST berubah.
  // registered: boolean; enable: senarai kod SST yang dipilih pengguna. Pulang [{kod, aktif}] yang berubah sahaja.
  AI.sstPlan = (codes, registered, enable) => {
    const want = new Set((enable || []).map((k) => str(k).toUpperCase()));
    return (codes || []).map((c) => {
      const kod = str(c.kod).toUpperCase();
      const isSst = str(c.jenis) === 'sst_jualan' || str(c.jenis) === 'sst_perkhidmatan';
      const aktif = !isSst ? (kod === 'TIADA' ? 'YA' : str(c.aktif).toUpperCase() || 'TIDAK') : (registered && want.has(kod) ? 'YA' : 'TIDAK');
      return { kod: c.kod, aktif, before: str(c.aktif).toUpperCase() };
    }).filter((x) => x.aktif !== x.before).map(({ kod, aktif }) => ({ kod, aktif }));
  };

  // Persediaan lengkap bila nama syarikat dan kod syarikat ada
  AI.setupComplete = (sk) => !!(str(sk && sk.nama) && str(sk && sk.kod_syarikat));

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
