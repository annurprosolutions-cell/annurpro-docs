const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
require('../js/schema.js');
require('../js/settings.js');
require('../js/calc.js');
require('../js/sign.js');
require('../js/doc.js');
const AI = require('../js/template.js');

const CODES = [
  { kod: 'TIADA', nama: 'Tiada cukai', kadar: 0, jenis: 'tiada', aktif: 'YA' },
  { kod: 'SST-PERKHIDMATAN-8', nama: 'Service Tax', kadar: 8, jenis: 'sst_perkhidmatan', aktif: 'YA' },
  { kod: 'SST-JUALAN-10', nama: 'Sales Tax', kadar: 10, jenis: 'sst_jualan', aktif: 'TIDAK' }
];
const SK = { nama: 'AnnurPro Solutions', kod_syarikat: 'APS', ssm: '202401012345', alamat: 'No 1, Jalan Contoh\n50000 Kuala Lumpur', tel: '03-1234 5678', emel: 'hello@annurpro.com',
  sst_berdaftar: 'YA', sst_no: 'W10-0000-00000001', bank_nama: 'MAYBANK', bank_akaun: '5123 4567 8901', tt_nama: 'Ahmad bin Abdullah', tt_jawatan: 'Director',
  nota_invois_1: 'Thank you for your business.', nota_quotation_1: 'Prices valid for 30 days.', nota_do_1: 'Please check goods upon delivery.',
  terma_default: '30 DAYS', validity_default: '14 DAYS', warna_aksen: '#7c2d12', tajuk_invois: 'TAX INVOICE' };
const NOW = Date.parse('2026-11-03T02:00:00Z');

test('draf baharu: lalai dari tetapan, kod cukai lalai', () => {
  const d = AI.newDraft('quotation', SK, CODES, { now: NOW, email: 'a@b.my' });
  assert.equal(d.tarikh, '2026-11-03'); assert.equal(d.terma, '30 DAYS'); assert.equal(d.validity, '14 DAYS');
  assert.equal(d.items.length, 1); assert.equal(d.items[0].tax_code, 'SST-PERKHIDMATAN-8'); // satu-satunya SST aktif
  assert.equal(AI.newDraft('invoice', Object.assign({}, SK, { sst_berdaftar: 'TIDAK' }), CODES).items[0].tax_code, 'TIADA');
  assert.equal(AI.newDraft('jenis-salah', SK, CODES).jenis, 'invoice');
});

test('validasi draf', () => {
  const d = AI.newDraft('invoice', SK, CODES, { now: NOW });
  let e = AI.validateDraft(d, SK, CODES);
  assert.ok(e.bill_nama); assert.ok(e.items);
  d.bill_nama = 'Contoh Trading Sdn Bhd';
  d.items = [{ desc: 'Kerja pemasangan', qty: '0', unit: 'JOB', price: '1.234', disc: '', tax_code: 'SST-JUALAN-10' }, { desc: '', qty: '1', unit: 'UNIT', price: '', disc: '' }];
  e = AI.validateDraft(d, SK, CODES);
  assert.ok(e['it:0:qty']); assert.ok(e['it:0:price']); assert.ok(e['it:0:tax_code'], 'kod tidak aktif'); assert.equal(e['it:1:desc'], undefined, 'baris kosong diabaikan');
  d.items[0] = { desc: 'Kerja pemasangan', qty: '2', unit: 'JOB', price: '100', disc: '250', tax_code: 'SST-PERKHIDMATAN-8' };
  assert.match(AI.validateDraft(d, SK, CODES)['it:0:disc'], /melebihi/);
  d.items[0].disc = '20';
  assert.deepEqual(AI.validateDraft(d, SK, CODES), {});
  const doo = Object.assign(AI.newDraft('do', SK, CODES), { bill_nama: 'X', ship_sama: false, items: [{ desc: 'Kabel', qty: '3', unit: 'METER' }] });
  assert.ok(AI.validateDraft(doo, SK, CODES).ship_alamat);
  doo.ship_alamat = 'Tapak projek'; assert.deepEqual(AI.validateDraft(doo, SK, CODES), {});
});

const filled = (jenis, n, extra) => Object.assign(AI.newDraft(jenis, SK, CODES, { now: NOW }), { bill_nama: 'Contoh Trading Sdn Bhd', bill_alamat: 'Lot 5\nShah Alam', attn: 'Encik Ali', your_ref: 'PO-7781',
  items: Array.from({ length: n }, (_, i) => ({ desc: 'Item ' + (i + 1), qty: '1', unit: 'UNIT', price: '100', disc: '', tax_code: 'SST-PERKHIDMATAN-8' })) }, extra || {});

test('docView invois: tajuk, nombor draf, meta, cukai, perkataan, bank', () => {
  const v = AI.docView(filled('invoice', 2), SK, CODES);
  assert.equal(v.title, 'TAX INVOICE'); assert.equal(v.number, 'APS/1126-XXX'); assert.equal(v.isDraft, true);
  assert.deepEqual(v.meta.map((m) => m[0]), ['No.', 'Date', 'Terms', 'Your Ref.']);
  assert.equal(v.showTax, true); assert.equal(v.showDisc, false);
  assert.equal(v.totals.subtotal, '200.00'); assert.equal(v.totals.taxes[0].amount, '16.00'); assert.equal(v.totals.total, '216.00');
  assert.equal(v.totals.words, 'RINGGIT MALAYSIA TWO HUNDRED SIXTEEN ONLY');
  assert.equal(v.totals.taxes[0].label, 'Service Tax (8%)');
  assert.equal(AI.taxLabel({ nama: 'Cukai Perkhidmatan 8%', kadar: 8 }), 'Cukai Perkhidmatan 8%');
  assert.equal(v.bank.acc, '5123 4567 8901'); assert.equal(v.co.sst, 'W10-0000-00000001'); assert.equal(v.accent, '#7c2d12');
  assert.equal(AI.docView(filled('invoice', 1), SK, CODES, { number: 'APS/1126-007' }).isDraft, false);
});

test('docView quotation & DO', () => {
  const q = AI.docView(filled('quotation', 1), SK, CODES);
  assert.equal(q.title, 'QUOTATION'); assert.ok(q.meta.some(([k, v]) => k === 'Validity' && v === '14 DAYS')); assert.equal(q.bank, null);
  assert.deepEqual(q.notes, ['Prices valid for 30 days.']);
  const d = AI.docView(filled('do', 2, { sumber_no: 'APS/1126-003', ship_sama: false, ship_nama: 'Tapak Projek', ship_alamat: 'Jalan 2' }), SK, CODES);
  assert.equal(d.title, 'DELIVERY ORDER'); assert.equal(d.rows[0].price, ''); assert.equal(d.totals.qty, '2');
  assert.ok(d.meta.some(([k, v]) => k === 'Ref No.' && v === 'APS/1126-003')); assert.ok(d.meta.some(([k]) => k === 'PO No.'));
  assert.equal(d.ship.name, 'Tapak Projek'); assert.equal(d.received, true);
  assert.equal(AI.docView(filled('do', 1, { ship_sama: true }), SK, CODES).ship, null);
  const ds = AI.docView(filled('do', 1), Object.assign({}, SK, { do_tt_nama: 'Lim Wei', do_tt_jawatan: 'Store Keeper', do_tt_tel: '012-0000000' }), CODES);
  assert.deepEqual(ds.signer, { name: 'Lim Wei', title: 'Store Keeper', tel: '012-0000000' });
});

test('paginate: satu halaman untuk dokumen pendek; berbilang halaman, jumlah di halaman akhir', () => {
  const short = AI.docView(filled('invoice', 5), SK, CODES);
  assert.deepEqual(AI.paginate(short).map((p) => p.rows.length), [5]);
  const long = AI.docView(filled('invoice', 80), SK, CODES);
  const pages = AI.paginate(long);
  assert.ok(pages.length >= 3);
  assert.equal(pages.reduce((n, p) => n + p.rows.length, 0), 80);
  assert.ok(pages[pages.length - 1].last && !pages[0].last);
  assert.deepEqual(pages.map((p) => p.no), pages.map((_, i) => i + 1));
  // baris hampir penuh: jumlah/tandatangan tolak ke halaman baharu tanpa item
  const v = AI.docView(filled('invoice', 1), SK, CODES);
  const p = AI.paginate(v, { first: 60 });
  assert.equal(p.length, 2); assert.equal(p[1].rows.length, 0);
  assert.equal(AI.rowLines('a'.repeat(120) + '\nb', 58), 4);
});

test('renderDoc: halaman A4, lajur ikut jenis, escape HTML, tera DRAF', () => {
  const d = filled('invoice', 2);
  d.items[0].desc = '<script>alert(1)</script>\nBaris dua';
  d.items[1].disc = '10';
  const html = AI.renderDoc(AI.docView(d, SK, CODES), { logo: 'data:image/png;base64,AA==', sign: '<div class="sbox static"></div>' });
  assert.equal((html.match(/class="a4"/g) || []).length, 1);
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/); assert.match(html, /Baris dua/);
  assert.match(html, /Disc \(RM\)/); assert.match(html, />Tax</); assert.match(html, /TOTAL \(RM\)/); assert.match(html, /RINGGIT MALAYSIA/);
  assert.match(html, /dv-draft/); assert.match(html, /Authorised Signature/); assert.match(html, /\(202401012345\)/);
  const paren = AI.renderDoc(AI.docView(d, Object.assign({}, SK, { ssm: '202401012345 (1234567-A)' }), CODES), {});
  assert.match(paren, /<span>202401012345 \(1234567-A\)<\/span>/, 'tiada kurungan berganda'); assert.match(html, /src="data:image\/png;base64,AA=="/);
  const doHtml = AI.renderDoc(AI.docView(filled('do', 1), SK, CODES), {});
  assert.doesNotMatch(doHtml, /Price \(RM\)/); assert.match(doHtml, /Received By/); assert.match(doHtml, /Total quantity/);
  const issued = AI.renderDoc(AI.docView(filled('invoice', 1), SK, CODES, { number: 'APS/1126-001' }), {});
  assert.doesNotMatch(issued, /dv-draft/); assert.match(issued, /APS\/1126-001/);
  const multi = AI.renderDoc(AI.docView(filled('quotation', 80), SK, CODES), {});
  assert.ok((multi.match(/class="a4"/g) || []).length >= 3); assert.match(multi, /\(continued\)/); assert.match(multi, /Page 1 of/);
});
