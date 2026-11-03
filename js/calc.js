(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  // Semua pengiraan wang dalam SEN (integer) supaya tiada ralat titik terapung.
  // Pusingan separuh-menjauhi-sifar pada setiap langkah yang dinyatakan dalam docs/05-BSD.md §3A.
  const rhalf = (x) => (x < 0 ? -Math.round(-x - 1e-9) : Math.round(x + 1e-9));
  const num = (v) => { const s = String(v == null ? '' : v).replace(/,/g, '').trim(); if (s === '') return 0; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
  AI.toCents = (v) => { const n = num(v); return Number.isNaN(n) ? NaN : rhalf(n * 100); };
  AI.fromCents = (c) => c / 100;

  // Format wang: 1234567 sen → "12,345.67"
  AI.fmtMoney = (cents) => {
    const neg = cents < 0, c = Math.abs(Math.round(cents));
    const r = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + r + '.' + String(c % 100).padStart(2, '0');
  };
  AI.fmtQty = (q) => { const n = num(q); if (Number.isNaN(n)) return ''; return String(Math.round(n * 1000) / 1000); };

  // Jumlah satu baris: round(qty × harga) − diskaun, dalam sen
  AI.lineCents = (it) => {
    const qm = rhalf(num(it.qty) * 1000);           // kuantiti dalam perseribu (maks 3 tempat perpuluhan)
    const pc = AI.toCents(it.price);
    const dc = AI.toCents(it.disc);
    if ([qm, pc, dc].some(Number.isNaN)) return NaN;
    return rhalf(qm * pc / 1000) - dc;
  };

  /**
   * Kira dokumen.
   * items: [{qty, price, disc, tax_code}] ; codes: senarai KodCukai [{kod, nama, kadar}] ; o: { taxable: boolean, jenis }
   * Pulang { lines:[{amount, gross, disc}], subtotal, discount, tax, total, taxes:[{kod, nama, kadar, base, tax}], qty }
   * Cukai dikira pada peringkat kod: round(Σ jumlah baris kod × kadar), bukan setiap baris.
   */
  AI.calcDoc = (items, codes, o) => {
    o = o || {};
    const byCode = {};
    (codes || []).forEach((c) => { byCode[String(c.kod).toUpperCase()] = c; });
    const lines = []; let subtotal = 0, discount = 0, qty = 0;
    const groups = {};
    (items || []).forEach((it) => {
      const q = num(it.qty); qty += Number.isNaN(q) ? 0 : q;
      if (o.jenis === 'do') { lines.push({ amount: 0, gross: 0, disc: 0 }); return; }
      const amount = AI.lineCents(it);
      const disc = AI.toCents(it.disc) || 0;
      const a = Number.isNaN(amount) ? 0 : amount;
      lines.push({ amount: a, gross: a + disc, disc, invalid: Number.isNaN(amount) });
      subtotal += a; discount += disc;
      const kod = String(it.tax_code || 'TIADA').toUpperCase();
      if (o.taxable && byCode[kod] && Number(byCode[kod].kadar) > 0) groups[kod] = (groups[kod] || 0) + a;
    });
    const taxes = Object.keys(groups).sort().map((kod) => {
      const c = byCode[kod], bp = rhalf(Number(c.kadar) * 100);   // kadar dalam basis poin (8% = 800)
      return { kod, nama: c.nama, kadar: Number(c.kadar), base: groups[kod], tax: rhalf(groups[kod] * bp / 10000) };
    });
    const tax = taxes.reduce((s, t) => s + t.tax, 0);
    return { lines, subtotal, discount, tax, total: subtotal + tax, taxes, qty: Math.round(qty * 1000) / 1000 };
  };

  // ---------- jumlah dalam perkataan (English, gaya invois Malaysia) ----------
  const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const under1000 = (n) => {
    const h = Math.floor(n / 100), r = n % 100, out = [];
    if (h) out.push(ONES[h] + ' HUNDRED');
    if (r) out.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : ''));
    return out.join(' ');
  };
  AI.intWords = (n) => {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'ZERO';
    const scales = [[1e9, 'BILLION'], [1e6, 'MILLION'], [1e3, 'THOUSAND']];
    const out = [];
    for (const [v, name] of scales) { if (n >= v) { out.push(under1000(Math.floor(n / v)) + ' ' + name); n %= v; } }
    if (n) out.push(under1000(n));
    return out.join(' ');
  };
  // 123456 sen → "RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED THIRTY-FOUR AND CENTS FIFTY-SIX ONLY"
  AI.amountWords = (cents) => {
    if (!Number.isFinite(cents)) return '';
    const c = Math.abs(Math.round(cents)), rm = Math.floor(c / 100), sen = c % 100;
    let s = 'RINGGIT MALAYSIA ' + AI.intWords(rm);
    if (sen) s += ' AND CENTS ' + AI.intWords(sen);
    return s + ' ONLY';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
