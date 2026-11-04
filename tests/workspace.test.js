const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
require('../js/schema.js');
require('../js/google.js');
require('../js/workspace.js');
const AI = require('../js/store.js');
const { fakeGoogle } = require('./helpers/fake-google.js');

const TOKEN = 'ya29.test-token-panjang';
const NOW = Date.parse('2026-11-03T02:00:00Z');
const mkApi = (g, extra) => new AI.GoogleApi(Object.assign({ token: async () => TOKEN, fetch: g.fetch, sleep: async () => {} }, extra || {}));
const OPTS = { email: 'pemilik@contoh.my', writer: 'w1', now: NOW, title: 'Annur Docs – AZN' };

test('ruang kerja baharu: folder, Sheet bertanda, tab, tajuk, seed, Meta', async () => {
  const g = fakeGoogle(TOKEN); const api = mkApi(g);
  const ws = await AI.ensureWorkspace(api, OPTS);
  assert.equal(ws.created, true);
  assert.deepEqual(ws.addedTabs.sort(), AI.TAB_ORDER.slice().sort());
  const f = g.files.get(ws.id);
  assert.equal(f.appProperties.annurInvoice, 'master');
  assert.deepEqual(f.parents, [ws.folders.root]);
  assert.equal(g.files.get(ws.folders.root).appProperties.annurInvoice, 'root');
  ['invoice', 'quotation', 'do', 'settings'].forEach((k) => assert.deepEqual(g.files.get(ws.folders[k]).parents, [ws.folders.root]));
  // tab lalai Sheet1 dibuang
  assert.deepEqual(g.books.get(ws.id).tabs.map((t) => t.title).sort(), AI.TAB_ORDER.slice().sort());
  assert.deepEqual(g.tab(ws.id, 'Dokumen')[0], AI.TABS.Dokumen);
  const sk = AI.kvOf(g.tab(ws.id, 'Syarikat'));
  assert.equal(sk.tajuk_invois, 'INVOICE'); assert.equal(sk.validity_default, '30 DAYS'); assert.equal(sk.dikemaskini, new Date(NOW).toISOString());
  assert.equal(AI.rowsToObjects(g.tab(ws.id, 'KodCukai')).rows.length, 5);
  const meta = AI.kvOf(g.tab(ws.id, 'Meta'));
  assert.equal(meta.format, '1'); assert.equal(meta.folder_invois, ws.folders.invoice); assert.equal(meta.oleh, 'pemilik@contoh.my');
  // format kolum & validasi dihantar
  const fm = g.books.get(ws.id).formats;
  assert.ok(fm.some((r) => r.updateSheetProperties)); assert.ok(fm.some((r) => r.setDataValidation));
});

test('idempotent: jalan kali kedua tidak cipta apa-apa dan tidak menimpa nilai pengguna', async () => {
  const g = fakeGoogle(TOKEN); const api = mkApi(g);
  const a = await AI.ensureWorkspace(api, OPTS);
  await api.setValues(a.id, AI.kvUpsert('Syarikat', g.tab(a.id, 'Syarikat'), { nama: 'AZN POWER SOLUTION', tajuk_invois: 'TAX INVOICE' }));
  const nFiles = g.files.size;
  const b = await AI.ensureWorkspace(api, OPTS);                     // tanpa cache: dijumpai melalui tanda
  const c = await AI.ensureWorkspace(api, Object.assign({ cachedId: a.id }, OPTS));
  assert.equal(b.id, a.id); assert.equal(c.id, a.id);
  assert.equal(b.created, false); assert.deepEqual(b.addedTabs, []);
  assert.equal(g.files.size, nFiles);
  const sk = AI.kvOf(g.tab(a.id, 'Syarikat'));
  assert.equal(sk.nama, 'AZN POWER SOLUTION'); assert.equal(sk.tajuk_invois, 'TAX INVOICE');
  assert.equal(AI.rowsToObjects(g.tab(a.id, 'KodCukai')).rows.length, 5); // seed tidak berganda
  assert.equal(AI.rowsToObjects(g.tab(a.id, 'Syarikat')).rows.length, AI.SYARIKAT_DEFAULTS.length);
});

test('cache id lama (fail dipadam) → jumpa semula melalui tanda atau cipta baharu', async () => {
  const g = fakeGoogle(TOKEN); const api = mkApi(g);
  const a = await AI.ensureWorkspace(api, OPTS);
  g.files.get(a.id).trashed = true;
  const b = await AI.ensureWorkspace(api, Object.assign({ cachedId: a.id }, OPTS));
  assert.notEqual(b.id, a.id); assert.equal(b.created, true);
  assert.equal(b.folders.root, a.folders.root); // folder induk sama
});

test('migrate: tab tiada ditambah, lajur baharu ditambah di hujung tanpa susun semula', async () => {
  const g = fakeGoogle(TOKEN); const api = mkApi(g);
  const a = await AI.ensureWorkspace(api, OPTS);
  const book = g.books.get(a.id);
  book.tabs = book.tabs.filter((t) => t.title !== 'Item');              // pengguna padam tab Item
  const pel = book.tabs.find((t) => t.title === 'Pelanggan');
  pel.rows = [['nama', 'id', 'catatan saya'], ['ALI SDN BHD', 'p1', 'VIP']]; // susunan sendiri + lajur sendiri
  const b = await AI.ensureWorkspace(api, OPTS);
  assert.deepEqual(b.addedTabs, ['Item']);
  const head = g.tab(a.id, 'Pelanggan')[0];
  assert.deepEqual(head.slice(0, 3), ['nama', 'id', 'catatan saya']);
  assert.ok(head.includes('alamat') && head.includes('dicipta'));
  const rows = AI.rowsToObjects(g.tab(a.id, 'Pelanggan')).rows;
  assert.equal(rows[0].nama, 'ALI SDN BHD'); assert.equal(rows[0]['catatan saya'], 'VIP');
  assert.ok(b.migrated.some((m) => m.tab === 'Pelanggan'));
});

test('GoogleApi: cuba semula 429, ralat 401 perlu log masuk, mesej API belum diaktifkan', async () => {
  const g = fakeGoogle(TOKEN);
  let slept = 0;
  const api = mkApi(g, { sleep: async (ms) => { slept += ms; } });
  g.failNext(429, 2);
  const files = await api.listFiles("trashed=false");
  assert.deepEqual(files, []); assert.equal(slept, 1000 + 2000);
  const bad = new AI.GoogleApi({ token: async () => 'salah', fetch: g.fetch, sleep: async () => {} });
  await assert.rejects(bad.listFiles('x'), (e) => e.needsLogin === true);
  assert.match(AI.googleErrorHint({ status: 403, message: 'Google Sheets API has not been used in project 123' }), /belum diaktifkan/);
});

// ---------- Store ----------
async function setupStore(writer, extra) {
  const g = (extra && extra.g) || fakeGoogle(TOKEN); const api = mkApi(g);
  const ws = (extra && extra.ws) || await AI.ensureWorkspace(api, OPTS);
  const statuses = [];
  let persisted = null;
  const store = new AI.Store(api, { id: ws.id, email: 'pemilik@contoh.my', writer, debounceMs: 5, now: () => NOW + 60000,
    persist: (p) => { persisted = p; }, onStatus: (s) => statuses.push(s) });
  await store.load();
  return { g, api, ws, store, statuses, persisted: () => persisted };
}

test('Store: setKV digabung, dikemas kini di tempat, Meta dibump', async () => {
  const { g, ws, store, statuses } = await setupStore('w1');
  store.setKV('Syarikat', { nama: 'AZN' });
  await store.setKV('Syarikat', { nama: 'AZN POWER SOLUTION', ssm: 'LA0050194-P' });
  const sk = AI.kvOf(g.tab(ws.id, 'Syarikat'));
  assert.equal(sk.nama, 'AZN POWER SOLUTION'); assert.equal(sk.ssm, 'LA0050194-P');
  assert.equal(AI.rowsToObjects(g.tab(ws.id, 'Syarikat')).rows.length, AI.SYARIKAT_DEFAULTS.length); // tiada baris berganda
  const meta = AI.kvOf(g.tab(ws.id, 'Meta'));
  assert.equal(meta.dikemaskini, new Date(NOW + 60000).toISOString()); assert.equal(meta.penulis, 'w1');
  assert.equal(store.snapshot().syarikat.nama, 'AZN POWER SOLUTION');
  assert.equal(statuses[statuses.length - 1], 'saved');
});

test('Store: append idempoten ikut id dan update mengekalkan medan lain', async () => {
  const { g, ws, store, api } = await setupStore('w1');
  const p = { id: 'p1', nama: 'ALI SDN BHD', tel: '0123456789', arkib: 'TIDAK' };
  await store.append('Pelanggan', [p], 'id');
  await store.append('Pelanggan', [p], 'id');               // cuba semula tidak berganda
  let rows = AI.rowsToObjects(g.tab(ws.id, 'Pelanggan')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].tel, '0123456789');
  await store.update('Pelanggan', 'id', { id: 'p1', alamat: 'NO 1 JALAN A' });
  rows = AI.rowsToObjects(g.tab(ws.id, 'Pelanggan')).rows;
  assert.equal(rows[0].alamat, 'NO 1 JALAN A'); assert.equal(rows[0].nama, 'ALI SDN BHD');
  assert.equal(store.snapshot().pelanggan.length, 1);
  assert.ok(api);
});

test('Store: konflik bila penulis lain mengubah Sheet; tiada timpaan senyap; reload & overwrite', async () => {
  const A = await setupStore('wA');
  const B = await setupStore('wB', { g: A.g, ws: A.ws });
  await B.store.setKV('Syarikat', { nama: 'DARI PERANTI B' });
  await assert.rejects(A.store.setKV('Syarikat', { nama: 'DARI PERANTI A' }), (e) => e.conflict === true);
  assert.equal(A.store.status, 'conflict');
  assert.equal(AI.kvOf(A.g.tab(A.ws.id, 'Syarikat')).nama, 'DARI PERANTI B');
  assert.equal(A.persisted().length, 1); // masih tertangguh, tidak hilang
  await A.store.resolveConflict('overwrite');
  assert.equal(AI.kvOf(A.g.tab(A.ws.id, 'Syarikat')).nama, 'DARI PERANTI A');
  // B kini konflik; pilih reload → buang tulisan B dan ambil data terkini
  await assert.rejects(B.store.setKV('Syarikat', { ssm: 'X' }), (e) => e.conflict);
  await B.store.resolveConflict('reload');
  assert.equal(B.store.snapshot().syarikat.nama, 'DARI PERANTI A');
  assert.equal(B.store.pending().length, 0);
  assert.equal(B.store.status, 'saved');
});

test('Store: append tidak disekat konflik (dokumen dari dua peranti)', async () => {
  const A = await setupStore('wA');
  const B = await setupStore('wB', { g: A.g, ws: A.ws });
  await B.store.setKV('Syarikat', { nama: 'B' });
  await A.store.append('Dokumen', [{ doc_id: 'd1', jenis: 'invoice', no_dokumen: 'AZN/1126-001', status: 'Terbit' }], 'doc_id');
  assert.equal(AI.rowsToObjects(A.g.tab(A.ws.id, 'Dokumen')).rows.length, 1);
});

test('Store: token tamat → reconnect; luar talian → offline; tulisan kekal dan berjaya selepas pulih', async () => {
  const g = fakeGoogle(TOKEN);
  let tok = TOKEN, online = true;
  const api = new AI.GoogleApi({ token: async () => { if (!tok) { const e = new Error('tamat'); e.needsLogin = true; throw e; } return tok; },
    fetch: (u, i) => (online ? g.fetch(u, i) : Promise.reject(new TypeError('Failed to fetch'))), sleep: async () => {} });
  const ws = await AI.ensureWorkspace(api, OPTS);
  const store = new AI.Store(api, { id: ws.id, email: 'x', writer: 'w1', debounceMs: 5 });
  await store.load();
  tok = '';
  await assert.rejects(store.setKV('Syarikat', { nama: 'X' }));
  assert.equal(store.status, 'reconnect');
  tok = TOKEN; online = false;
  await assert.rejects(store.flush());
  assert.equal(store.status, 'offline');
  online = true;
  await store.flush();
  assert.equal(store.status, 'saved');
  assert.equal(AI.kvOf(g.tab(ws.id, 'Syarikat')).nama, 'X');
});

test('Store.restore: tulisan tertangguh dari sesi lepas ditulis', async () => {
  const { g, ws, store } = await setupStore('w1');
  store.restore([{ type: 'kv', tab: 'Syarikat', values: { emel: 'a@b.my' } }]);
  await store.flush();
  assert.equal(AI.kvOf(g.tab(ws.id, 'Syarikat')).emel, 'a@b.my');
});

test('rowsToObjects / objectToRow / colLetter', () => {
  const { head, rows } = AI.rowsToObjects([['a', 'b'], ['1', ''], ['', ''], ['3', '4']]);
  assert.deepEqual(head, ['a', 'b']); assert.equal(rows.length, 2); assert.equal(rows[1]._row, 4);
  assert.deepEqual(AI.objectToRow(['a', 'b', 'c'], { b: 2 }, ['x', 'y', 'z']), ['x', 2, 'z']);
  assert.equal(AI.colLetter(1), 'A'); assert.equal(AI.colLetter(26), 'Z'); assert.equal(AI.colLetter(39), 'AM');
});
