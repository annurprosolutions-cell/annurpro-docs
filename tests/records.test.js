const test = require('node:test');
const assert = require('node:assert/strict');
['core', 'schema', 'google', 'workspace', 'store', 'settings', 'calc', 'doc'].forEach((m) => require(`../js/${m}.js`));
const AI = require('../js/records.js');
const { fakeGoogle } = require('./helpers/fake-google.js');

const NOW = Date.parse('2026-11-03T02:00:00Z');
const SK = { kod_syarikat: 'APS', terma_default: '30 DAYS', validity_default: '14 DAYS', sst_berdaftar: 'TIDAK' };
const CODES = [{ kod: 'TIADA', nama: 'Tiada cukai', kadar: 0, jenis: 'tiada', aktif: 'YA' }];
const row = (o) => Object.assign({ doc_id: 'd1', jenis: 'invoice', no_dokumen: 'APS/1126-001', tarikh: '2026-11-03', status: 'Terbit', bill_nama: 'Contoh Trading Sdn Bhd',
  bill_alamat: 'Lot 5', diterbit_pada: '2026-11-03T01:00:00.000Z', items_json: JSON.stringify([{ n: 1, desc: 'Servis', qty: '2', unit: 'JOB', price: '150', disc: '', tax_code: 'TIADA' }]) }, o);

test('docState: Terbit (24 jam) → Dikunci → Batal', () => {
  assert.equal(AI.docState(row(), NOW).key, 'terbit'); assert.equal(AI.docState(row(), NOW).editable, true);
  assert.equal(AI.docState(row(), NOW).until, '2026-11-04T01:00:00.000Z');
  assert.equal(AI.docState(row(), NOW + 24 * 3600e3).key, 'dikunci');
  assert.equal(AI.docState(row({ status: 'Batal' }), NOW).key, 'batal');
  assert.equal(AI.docState(row({ status: 'Batal' }), NOW).voidable, false);
  assert.deepEqual(AI.quoteState(row({ jenis: 'quotation', status_quotation: 'Menunggu' })), { label: 'Menunggu', tone: 'amber' });
  assert.equal(AI.quoteState(row({ jenis: 'quotation', status_quotation: 'Ditukar' })).label, 'Ditukar');
  assert.equal(AI.quoteState(row()), null);
});

test('filterDocs: jenis, status, bulan, carian; susunan terkini dahulu', () => {
  const rows = [row(), row({ doc_id: 'd2', no_dokumen: 'APS-Q/1126-001', jenis: 'quotation', status_quotation: 'Menunggu', bill_nama: 'Beta Engineering', diterbit_pada: '2026-11-03T01:30:00.000Z' }),
    row({ doc_id: 'd3', no_dokumen: 'APS/1026-009', tarikh: '2026-10-20', status: 'Batal', diterbit_pada: '2026-10-20T01:00:00.000Z', your_ref: 'PO-77' })];
  assert.deepEqual(AI.filterDocs(rows, {}, NOW).map((r) => r.doc_id), ['d2', 'd1', 'd3']);
  assert.deepEqual(AI.filterDocs(rows, { jenis: 'quotation' }, NOW).map((r) => r.doc_id), ['d2']);
  assert.deepEqual(AI.filterDocs(rows, { status: 'batal' }, NOW).map((r) => r.doc_id), ['d3']);
  assert.deepEqual(AI.filterDocs(rows, { status: 'menunggu' }, NOW).map((r) => r.doc_id), ['d2']);
  assert.deepEqual(AI.filterDocs(rows, { bulan: '2026-10' }, NOW).map((r) => r.doc_id), ['d3']);
  assert.deepEqual(AI.filterDocs(rows, { q: 'beta' }, NOW).map((r) => r.doc_id), ['d2']);
  assert.deepEqual(AI.filterDocs(rows, { q: '1026' }, NOW).map((r) => r.doc_id), ['d3']);
  assert.deepEqual(AI.filterDocs(rows, { q: 'po-77' }, NOW).map((r) => r.doc_id), ['d3']);
  assert.deepEqual(AI.monthsOf(rows), ['2026-11', '2026-10']);
});

test('draftForEdit: doc_id, nombor, item dan Ship To dipulihkan', () => {
  const d = AI.draftForEdit(row({ your_ref: 'PO-1' }), SK, CODES, 'a@b.my');
  assert.equal(d.doc_id, 'd1'); assert.equal(d.editing, true); assert.deepEqual(d.issued, { number: 'APS/1126-001', issuedAt: '2026-11-03T01:00:00.000Z' });
  assert.equal(d.items[0].desc, 'Servis'); assert.equal(d.items[0].price, '150'); assert.equal(d.your_ref, 'PO-1'); assert.equal(d.tarikh, '2026-11-03');
  const doo = AI.draftForEdit(row({ jenis: 'do', ship_nama: 'Tapak', ship_alamat: 'Jalan 2' }), SK, CODES);
  assert.equal(doo.ship_sama, false); assert.equal(doo.ship_alamat, 'Jalan 2');
  assert.equal(AI.draftForEdit(row({ jenis: 'do', ship_nama: 'Contoh Trading Sdn Bhd', ship_alamat: 'Lot 5' }), SK, CODES).ship_sama, true);
});

test('draftCopy: tiada doc_id/nombor, tarikh hari ini', () => {
  const d = AI.draftCopy(row(), SK, CODES);
  assert.equal(d.doc_id, undefined); assert.equal(d.issued, undefined); assert.equal(d.editing, undefined);
  assert.equal(d.items[0].desc, 'Servis'); assert.equal(d.bill_nama, 'Contoh Trading Sdn Bhd');
});

test('draftConvert: Quotation → Invois (Your Ref = no. quotation jika tiada PO); → DO tanpa harga', () => {
  const q = row({ jenis: 'quotation', no_dokumen: 'APS-Q/1126-001', terma: '14 DAYS' });
  const inv = AI.draftConvert(q, 'invoice', SK, CODES);
  assert.equal(inv.jenis, 'invoice'); assert.equal(inv.sumber_jenis, 'quotation'); assert.equal(inv.sumber_no, 'APS-Q/1126-001');
  assert.equal(inv.your_ref, 'APS-Q/1126-001'); assert.equal(inv.terma, '14 DAYS'); assert.equal(inv.items[0].price, '150');
  assert.equal(AI.draftConvert(row({ jenis: 'quotation', your_ref: 'PO-9' }), 'invoice', SK, CODES).your_ref, 'PO-9');
  const doo = AI.draftConvert(row({ your_ref: 'PO-9' }), 'do', SK, CODES);
  assert.equal(doo.jenis, 'do'); assert.equal(doo.items[0].price, ''); assert.equal(doo.items[0].qty, '2'); assert.equal(doo.your_ref, 'PO-9'); assert.equal(doo.ship_sama, true);
  assert.throws(() => AI.draftConvert(row(), 'invoice', SK, CODES));
  assert.throws(() => AI.draftConvert(row({ jenis: 'do' }), 'do', SK, CODES));
});

test('sourceUpdate: senarai ditukar_kepada tanpa duplikasi; quotation jadi Ditukar', () => {
  const q = row({ jenis: 'quotation', no_dokumen: 'Q1', ditukar_kepada: '' });
  assert.deepEqual(AI.sourceUpdate(q, 'INV1'), { no_dokumen: 'Q1', ditukar_kepada: 'INV1', status_quotation: 'Ditukar' });
  assert.equal(AI.sourceUpdate(row({ ditukar_kepada: 'DO1' }), 'DO2').ditukar_kepada, 'DO1, DO2');
  assert.equal(AI.sourceUpdate(row({ ditukar_kepada: 'DO1' }), 'DO1').ditukar_kepada, 'DO1');
  assert.equal(AI.sourceUpdate(row(), 'DO1').status_quotation, undefined);
});

test('validateCustomer & docsOfCustomer', () => {
  const all = [{ id: 'p1', nama: 'Contoh Trading Sdn. Bhd.' }];
  const r = AI.validateCustomer({ nama: 'contoh trading sdn bhd', emel: 'x@' }, all);
  assert.ok(r.errors.emel); assert.equal(r.duplicate.id, 'p1');
  assert.equal(AI.validateCustomer({ nama: 'Contoh Trading Sdn Bhd' }, all, 'p1').duplicate, null, 'diri sendiri bukan duplikasi');
  assert.ok(AI.validateCustomer({ nama: '' }, all).errors.nama);
  assert.equal(AI.docsOfCustomer({ id: 'p1', nama: 'X' }, [row({ pelanggan_id: 'p1' }), row({ bill_nama: 'x' }), row()]).length, 2);
});

test('Store.replaceRows: tulis di tempat, kosongkan lebihan, tambah kekurangan', async () => {
  const TOKEN = 'ya29.test-token-panjang';
  const g = fakeGoogle(TOKEN);
  const api = new AI.GoogleApi({ token: async () => TOKEN, fetch: g.fetch, sleep: async () => {} });
  const ws = await AI.ensureWorkspace(api, { company: 'X', email: 'a', writer: 'w' });
  const st = new AI.Store(api, { id: ws.id, email: 'a', writer: 'w', debounceMs: 0 });
  await st.load();
  await st.append('Item', [{ no_dokumen: 'A', n: 1, desc: 'a1' }, { no_dokumen: 'B', n: 1, desc: 'b1' }, { no_dokumen: 'A', n: 2, desc: 'a2' }, { no_dokumen: 'A', n: 3, desc: 'a3' }]);
  await st.replaceRows('Item', 'no_dokumen', 'A', [{ no_dokumen: 'A', n: 1, desc: 'A1-baru' }]);
  let rows = AI.rowsToObjects(g.tab(ws.id, 'Item')).rows;
  assert.deepEqual(rows.map((r) => [r.no_dokumen, r.desc]), [['A', 'A1-baru'], ['B', 'b1']]);
  await st.replaceRows('Item', 'no_dokumen', 'B', [{ no_dokumen: 'B', n: 1, desc: 'b1' }, { no_dokumen: 'B', n: 2, desc: 'b2' }]);
  rows = AI.rowsToObjects(g.tab(ws.id, 'Item')).rows;
  assert.deepEqual(rows.map((r) => r.desc).sort(), ['A1-baru', 'b1', 'b2']);
});

test('status bayaran: dueDate, payState, tertunggak, batal, bukan invois', () => {
  assert.equal(AI.dueDate(row({ terma: '30 DAYS', tarikh: '2026-10-01' })), '2026-10-31');
  assert.equal(AI.dueDate(row({ terma: 'COD' })), '2026-11-03');
  assert.equal(AI.dueDate(row({ terma: '' })), '');
  assert.equal(AI.dueDate(row({ terma: '7 DAYS', tarikh: '2026-02-25' })), '2026-03-04');
  // invois lama (lajur kosong) = Belum bayar; belum lewat
  const a = AI.payState(row({ terma: '30 DAYS' }), NOW);
  assert.equal(a.key, 'belum'); assert.equal(a.paid, false); assert.equal(a.due, '2026-12-03');
  // lewat
  const late = AI.payState(row({ terma: '14 DAYS', tarikh: '2026-10-01' }), NOW);
  assert.equal(late.key, 'tertunggak'); assert.equal(late.daysLate, 19); assert.equal(late.tone, 'red');
  // tiada terma berangka: tidak pernah tertunggak
  assert.equal(AI.payState(row({ terma: '', tarikh: '2020-01-01' }), NOW).key, 'belum');
  // dibayar menang walaupun lewat
  const paid = AI.payState(row({ terma: '7 DAYS', tarikh: '2026-10-01', status_bayaran: 'Dibayar', tarikh_bayar: '2026-10-09' }), NOW);
  assert.equal(paid.key, 'dibayar'); assert.equal(paid.paid, true); assert.equal(paid.paidOn, '2026-10-09');
  assert.equal(AI.payState(row({ status: 'Batal' }), NOW), null);
  assert.equal(AI.payState(row({ jenis: 'quotation' }), NOW), null);
  assert.equal(AI.payState(row({ jenis: 'do' }), NOW), null);
});

test('status bayaran: payUpdate, tarikh masa hadapan ditolak, ringkasan jumlah, penapis', () => {
  const r = row({ jumlah: '1000.00' });
  assert.deepEqual(AI.payUpdate(r, true, '2026-11-02', NOW), { doc_id: 'd1', status_bayaran: 'Dibayar', tarikh_bayar: '2026-11-02' });
  assert.deepEqual(AI.payUpdate(r, true, '', NOW), { doc_id: 'd1', status_bayaran: 'Dibayar', tarikh_bayar: '2026-11-03' }, 'lalai hari ini (waktu Malaysia)');
  assert.deepEqual(AI.payUpdate(r, false, '', NOW), { doc_id: 'd1', status_bayaran: 'Belum bayar', tarikh_bayar: '' });
  assert.throws(() => AI.payUpdate(r, true, '2026-11-04', NOW), /masa hadapan/);
  assert.throws(() => AI.payUpdate(r, true, 'esok', NOW), /tidak sah/);
  assert.throws(() => AI.payUpdate(row({ jenis: 'quotation' }), true, '', NOW), /untuk invois/);
  assert.throws(() => AI.payUpdate(row({ status: 'Batal' }), true, '', NOW), /dibatalkan/);

  const rows = [row({ doc_id: 'a', jumlah: '1000.00', status_bayaran: 'Dibayar', tarikh_bayar: '2026-11-01' }),
    row({ doc_id: 'b', jumlah: '250.50', terma: '30 DAYS' }),
    row({ doc_id: 'c', jumlah: '400.00', terma: '7 DAYS', tarikh: '2026-10-01', diterbit_pada: '2026-10-01T01:00:00.000Z' }),
    row({ doc_id: 'd', jumlah: '999.00', status: 'Batal' }), row({ doc_id: 'e', jenis: 'quotation', jumlah: '5000.00' })];
  const t = AI.payTotals(rows, NOW);
  assert.deepEqual(t, { belum: { n: 2, cents: 65050 }, tertunggak: { n: 1, cents: 40000 }, dibayar: { n: 1, cents: 100000 } });
  assert.deepEqual(AI.filterDocs(rows, { bayaran: 'belum' }, NOW).map((x) => x.doc_id).sort(), ['b', 'c']);
  assert.deepEqual(AI.filterDocs(rows, { bayaran: 'tertunggak' }, NOW).map((x) => x.doc_id), ['c']);
  assert.deepEqual(AI.filterDocs(rows, { bayaran: 'dibayar' }, NOW).map((x) => x.doc_id), ['a']);
  assert.equal(AI.filterDocs(rows, { bayaran: 'belum', jenis: 'quotation' }, NOW).length, 0, 'quotation tiada status bayaran');
});
