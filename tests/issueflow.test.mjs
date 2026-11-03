// Aliran terbit hujung ke hujung dalam Node: Worker sebenar (D1 palsu) + Google palsu + PDF tiruan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../worker/index.mjs';
import { createD1 } from './helpers/d1.mjs';
const require = createRequire(import.meta.url);
['core', 'schema', 'google', 'workspace', 'store', 'settings', 'calc', 'sign', 'doc', 'template', 'images', 'records'].forEach((m) => require(`../js/${m}.js`));
const AI = require('../js/issue.js');
const { fakeGoogle } = require('./helpers/fake-google.js');

const TOKEN = 'ya29.test-token-panjang';
const CLIENT = 'cid.apps.googleusercontent.com';
const NOW = Date.parse('2026-11-03T02:00:00Z');

async function setup(o) {
  o = o || {};
  const g = fakeGoogle(TOKEN);
  const api = new AI.GoogleApi({ token: async () => TOKEN, fetch: g.fetch, sleep: async () => {}, retries: 0 });
  const ws = await AI.ensureWorkspace(api, { company: 'AnnurPro Solutions', email: 'p@contoh.my', writer: 'w1', now: NOW });
  const store = new AI.Store(api, { id: ws.id, email: 'p@contoh.my', writer: 'w1', debounceMs: 0 });
  await store.load();
  await store.setKV('Syarikat', Object.assign({ nama: 'AnnurPro Solutions', kod_syarikat: 'APS', tt_nama: 'Ahmad bin Abdullah' }, o.sk || {}));
  const env = { GOOGLE_CLIENT_ID: CLIENT, DB: createD1(), TRIAL_CREDITS: String(o.credits == null ? 50 : o.credits), BUY_URL_SUB: 'https://bcl.test/sub' };
  const tokeninfo = async () => new Response(JSON.stringify({ aud: CLIENT, email: 'p@contoh.my', email_verified: 'true' }), { status: 200 });
  const calls = [];
  const worker = async (method, path, body) => {
    calls.push(path);
    const r = await handle(new Request('https://w.test' + path, { method, headers: { authorization: 'Bearer ' + TOKEN }, body: body ? JSON.stringify(body) : undefined }), env, { fetch: tokeninfo, now: () => NOW });
    return { status: r.status, body: await r.json() };
  };
  const drafts = new Map();
  let pdfCalls = 0;
  const deps = () => {
    const snap = store.snapshot();
    return {
      sk: snap.syarikat, codes: snap.kodCukai, api, store, ws, email: 'p@contoh.my', worker,
      makePdf: async (pages) => { pdfCalls++; return new TextEncoder().encode('%PDF-1.4 fake ' + pages.length + ' pages'); },
      assets: () => ({ logo: null, sign: '' }),
      saveDraft: async (d) => { if (!d.id) d.id = 'draft1'; drafts.set(d.id, structuredClone(d)); }, dropDraft: async (id) => { drafts.delete(id); }
    };
  };
  const draft = () => Object.assign(AI.newDraft('invoice', store.snapshot().syarikat, store.snapshot().kodCukai, { now: NOW }), {
    bill_nama: 'Contoh Trading Sdn Bhd', items: [{ desc: 'Website maintenance', qty: '2', unit: 'JOB', price: '150', disc: '', tax_code: 'TIADA' }] });
  return { g, api, ws, store, env, deps, draft, drafts, calls, pdfCount: () => pdfCalls };
}

test('terbit penuh: nombor, baris Sheet, Item, PDF dalam folder jenis, kongsi awam, draf dipadam', async () => {
  const S = await setup();
  const d = S.draft(); d.id = 'draft1';
  const steps = [];
  const r = await AI.issueDocument(S.deps(), d, (i) => steps.push(i));
  assert.deepEqual(steps, [0, 1, 2, 3]);
  assert.equal(r.number, 'APS/1126-001'); assert.equal(r.credits, 45); assert.equal(r.shared, true);
  const rows = AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows;
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.no_dokumen, 'APS/1126-001'); assert.equal(row.status, 'Terbit'); assert.equal(row.jumlah, 300); assert.equal(row.bill_nama, 'Contoh Trading Sdn Bhd');
  assert.equal(row.pdf_id, r.fileId); assert.match(row.pdf_url, /drive\.google\.com\/file\/d\//); assert.match(row.hash_kandungan, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(row.items_json)[0].desc, 'Website maintenance');
  assert.equal(AI.rowsToObjects(S.g.tab(S.ws.id, 'Item')).rows.length, 1);
  const f = S.g.files.get(r.fileId);
  assert.deepEqual(f.parents, [S.ws.folders.invoice]); assert.equal(f.mimeType, 'application/pdf');
  assert.equal(f.name, 'APS-1126-001 - Contoh Trading Sdn Bhd.pdf');
  assert.equal(f.appProperties.doc_id, d.doc_id); assert.match(new TextDecoder().decode(f.bytes), /^%PDF/);
  assert.deepEqual(f.permissions, [{ role: 'reader', type: 'anyone' }]);
  assert.equal(S.drafts.size, 0, 'draf dipadam selepas berjaya');
});

test('gagal di tengah (muat naik) → cuba semula: nombor sama, tiada caj kedua, tiada baris atau fail berganda', async () => {
  const S = await setup();
  const d = S.draft(); d.id = 'draft1';
  const real = S.g.fetch;
  let failUpload = true;
  const flakyApi = new AI.GoogleApi({ token: async () => TOKEN, sleep: async () => {}, retries: 0,
    fetch: (u, i) => (failUpload && String(u).includes('/upload/') ? Promise.resolve(new Response('{"error":{"message":"Backend Error"}}', { status: 500 })) : real(u, i)) });
  const deps = Object.assign(S.deps(), { api: flakyApi });
  await assert.rejects(AI.issueDocument(deps, d), (e) => e.step === 3);
  assert.equal(S.drafts.get('draft1').issued.number, 'APS/1126-001', 'nombor disimpan dalam draf');
  failUpload = false;
  const r = await AI.issueDocument(Object.assign(S.deps(), { api: flakyApi }), S.drafts.get('draft1'));
  assert.equal(r.number, 'APS/1126-001'); assert.equal(r.repeat, true); assert.equal(r.credits, 45);
  assert.equal(AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows.length, 1);
  assert.equal(AI.rowsToObjects(S.g.tab(S.ws.id, 'Item')).rows.length, 1);
  const pdfs = [...S.g.files.values()].filter((f) => f.mimeType === 'application/pdf');
  assert.equal(pdfs.length, 1, 'fail PDF tidak berganda');
  assert.equal(AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows[0].pdf_id, pdfs[0].id);
});

test('tiada kredit → paywall, tiada baris Sheet; validasi gagal → tiada panggilan Worker', async () => {
  const S = await setup({ credits: 0 });
  const d = S.draft();
  await assert.rejects(AI.issueDocument(S.deps(), d), (e) => e.paywall && e.paywall.reason === 'tiada-kredit' && e.paywall.buyUrls.sub === 'https://bcl.test/sub');
  assert.equal(AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows.length, 0);
  const n = S.calls.length;
  await assert.rejects(AI.issueDocument(S.deps(), Object.assign(S.draft(), { bill_nama: '' })), (e) => !!(e.validation && e.validation.bill_nama));
  assert.equal(S.calls.length, n);
});

test('kongsi awam disekat → dokumen tetap terbit, amaran dipulangkan; kongsi_awam TIDAK → tiada kebenaran', async () => {
  const { fakeGoogle: fg } = require('./helpers/fake-google.js');
  const S = await setup();
  fg.blockShare = true;
  try {
    const r = await AI.issueDocument(S.deps(), S.draft());
    assert.equal(r.shared, false); assert.match(r.shareError, /403|menolak|ditolak/i);
  } finally { fg.blockShare = false; }
  const S2 = await setup({ sk: { kongsi_awam: 'TIDAK' } });
  const r2 = await AI.issueDocument(S2.deps(), S2.draft());
  assert.equal(r2.shared, false); assert.equal(r2.shareError, '');
  assert.deepEqual(S2.g.files.get(r2.fileId).permissions, []);
});

test('quotation & DO: status_quotation, folder ikut jenis, prefix sendiri', async () => {
  const S = await setup();
  const q = Object.assign(S.draft(), { jenis: 'quotation' });
  const rq = await AI.issueDocument(S.deps(), q);
  assert.equal(rq.number, 'APS-Q/1126-001');
  assert.deepEqual(S.g.files.get(rq.fileId).parents, [S.ws.folders.quotation]);
  const doo = Object.assign(S.draft(), { jenis: 'do', ship_sama: false, ship_nama: 'Tapak', ship_alamat: 'Jalan 2' });
  const rd = await AI.issueDocument(S.deps(), doo);
  assert.equal(rd.number, 'APS-DO/1126-001'); assert.equal(rd.charged, 5);
  assert.deepEqual(S.g.files.get(rd.fileId).parents, [S.ws.folders.do]);
  const rows = AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows;
  assert.equal(rows.find((r) => r.jenis === 'quotation').status_quotation, 'Menunggu');
  const drow = rows.find((r) => r.jenis === 'do');
  assert.equal(drow.jumlah, ''); assert.equal(drow.jumlah_qty, 2); assert.equal(drow.ship_alamat, 'Jalan 2');
});

test('hash kandungan stabil dan berubah bila kandungan berubah', async () => {
  const base = { no_dokumen: 'A/1', jumlah: 10, items_json: '[]' };
  const h1 = await AI.sha256Hex(AI.hashInput(base));
  assert.equal(h1, await AI.sha256Hex(AI.hashInput(Object.assign({}, base, { pdf_url: 'x' }))), 'medan bukan kandungan tidak menjejaskan hash');
  assert.notEqual(h1, await AI.sha256Hex(AI.hashInput(Object.assign({}, base, { jumlah: 11 }))));
  assert.equal(AI.pdfName('APS/1126-001', 'A/B:C*D "E"'), 'APS-1126-001 - A-B-C-D -E-.pdf');
});

test('edit dalam 24 jam: nombor & fail PDF sama, baris & Item diganti, tiada caj', async () => {
  const S = await setup();
  const d = S.draft(); d.items.push({ desc: 'Hosting', qty: '1', unit: 'UNIT', price: '50', disc: '', tax_code: 'TIADA' });
  const r1 = await AI.issueDocument(S.deps(), d);
  const row = AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows[0];
  const ed = AI.draftForEdit(row, S.store.snapshot().syarikat, S.store.snapshot().kodCukai, 'p@contoh.my');
  ed.items = [{ desc: 'Website maintenance (revised)', qty: '3', unit: 'JOB', price: '150', disc: '', tax_code: 'TIADA' }];
  ed.bill_nama = 'Contoh Trading (M) Sdn Bhd';
  const r2 = await AI.issueDocument(Object.assign(S.deps(), { now: () => NOW + 3600e3 }), ed);
  assert.equal(r2.number, r1.number); assert.equal(r2.edited, true); assert.equal(r2.charged, 5, 'caj asal (tiada caj baharu)'); assert.equal(r2.credits, 45);
  assert.equal(r2.fileId, r1.fileId, 'fail PDF sama');
  const rows = AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].jumlah, 450); assert.equal(rows[0].bill_nama, 'Contoh Trading (M) Sdn Bhd');
  assert.equal(rows[0].diterbit_pada, row.diterbit_pada); assert.notEqual(rows[0].dikemaskini_pada, row.dikemaskini_pada); assert.equal(rows[0].pdf_id, r1.fileId);
  assert.notEqual(rows[0].hash_kandungan, row.hash_kandungan);
  assert.deepEqual(AI.rowsToObjects(S.g.tab(S.ws.id, 'Item')).rows.map((x) => x.desc), ['Website maintenance (revised)']);
  assert.equal(S.g.files.get(r1.fileId).name, 'APS-1126-001 - Contoh Trading (M) Sdn Bhd.pdf');
  // selepas 24 jam: ditolak
  const late = AI.draftForEdit(rows[0], S.store.snapshot().syarikat, S.store.snapshot().kodCukai);
  await assert.rejects(AI.issueDocument(Object.assign(S.deps(), { now: () => NOW + 25 * 3600e3 }), late), (e) => /24 jam/.test(e.message));
});

test('tukar Quotation → Invois → DO: dokumen asal ditanda', async () => {
  const S = await setup();
  const q = await AI.issueDocument(S.deps(), Object.assign(S.draft(), { jenis: 'quotation' }));
  const qrow = () => AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows.find((r) => r.no_dokumen === q.number);
  const inv = await AI.issueDocument(S.deps(), AI.draftConvert(qrow(), 'invoice', S.store.snapshot().syarikat, S.store.snapshot().kodCukai));
  assert.equal(qrow().status_quotation, 'Ditukar'); assert.equal(qrow().ditukar_kepada, inv.number);
  const irow = () => AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows.find((r) => r.no_dokumen === inv.number);
  assert.equal(irow().sumber_no, q.number); assert.equal(irow().your_ref, q.number);
  const dd = await AI.issueDocument(S.deps(), AI.draftConvert(irow(), 'do', S.store.snapshot().syarikat, S.store.snapshot().kodCukai));
  assert.equal(irow().ditukar_kepada, dd.number);
  const drow = AI.rowsToObjects(S.g.tab(S.ws.id, 'Dokumen')).rows.find((r) => r.no_dokumen === dd.number);
  assert.equal(drow.sumber_jenis, 'invoice'); assert.equal(drow.jumlah_qty, 2);
});
