const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
require('../js/schema.js');
require('../js/google.js');
const AI = require('../js/images.js');
require('../js/sign.js');
const { fakeGoogle } = require('./helpers/fake-google.js');

test('semakan fail gambar', () => {
  assert.equal(AI.checkImageFile({ type: 'image/png', size: 1000 }), '');
  assert.match(AI.checkImageFile({ type: 'image/gif', size: 1000 }), /PNG, JPG atau WebP/);
  assert.match(AI.checkImageFile({ type: 'image/svg+xml', size: 1000 }), /PNG, JPG atau WebP/);
  assert.match(AI.checkImageFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 }), /5 MB/);
  assert.match(AI.checkImageFile({ type: 'image/png', size: 0 }), /kosong/);
  assert.match(AI.checkImageFile(null), /Tiada fail/);
});

test('fitSize: kecilkan sahaja, kekalkan nisbah', () => {
  assert.deepEqual(AI.fitSize(1600, 800, 800), { w: 800, h: 400 });
  assert.deepEqual(AI.fitSize(600, 1200, 800), { w: 400, h: 800 });
  assert.deepEqual(AI.fitSize(300, 200, 800), { w: 300, h: 200 });
  assert.deepEqual(AI.fitSize(1, 5000, 800), { w: 1, h: 800 });
});

const px = (...rows) => Uint8ClampedArray.from(rows.flat());
test('removeWhite: putih jadi lutsinar, tinta kekal, tepi lembut dinyahcampur', () => {
  const d = px([255, 255, 255, 255], [250, 250, 250, 255], [0, 0, 0, 255], [30, 60, 200, 255], [210, 210, 210, 255]);
  const cleared = AI.removeWhite(d, 30);                       // hi=225, lo=185
  assert.equal(cleared, 2);
  assert.equal(d[3], 0); assert.equal(d[7], 0);               // putih dan hampir putih
  assert.deepEqual(Array.from(d.slice(8, 12)), [0, 0, 0, 255]);  // hitam kekal pekat
  assert.deepEqual(Array.from(d.slice(12, 16)), [30, 60, 200, 255]); // biru kekal
  const a = d[19];                                             // kelabu cerah: separa lutsinar
  assert.ok(a > 0 && a < 255, 'alpha separa ' + a);
  assert.ok(d[16] < 210, 'warna dinyahcampur supaya tiada pinggir putih');
});

test('removeWhite: toleransi dihadkan dan menghormati alpha sedia ada', () => {
  const d1 = px([240, 240, 240, 255]), d2 = px([240, 240, 240, 255]);
  AI.removeWhite(d1, 5);     // hi=250, lo=210 → 240 dalam jalur lembut: separa lutsinar, bukan dibuang
  AI.removeWhite(d2, 500);   // dihadkan 80 → hi=175 → dibuang penuh
  assert.ok(d1[3] > 0 && d1[3] < 255, 'alpha separa ' + d1[3]); assert.equal(d2[3], 0);
  const d4 = px([215, 215, 215, 255]); AI.removeWhite(d4, 5);   // di bawah lo(210)+: kekal hampir pekat
  assert.ok(d4[3] > 200);
  const d3 = px([200, 200, 200, 100]); AI.removeWhite(d3, 30);
  assert.ok(d3[3] <= 100);
});

test('trimBounds: potong lutsinar dengan padding, null jika kosong', () => {
  const w = 5, h = 4, d = new Uint8ClampedArray(w * h * 4);
  const set = (x, y) => { d[(y * w + x) * 4 + 3] = 255; };
  set(1, 1); set(3, 2);
  assert.deepEqual(AI.trimBounds(d, w, h, 0), { x: 1, y: 1, w: 3, h: 2 });
  assert.deepEqual(AI.trimBounds(d, w, h, 1), { x: 0, y: 0, w: 5, h: 4 });
  assert.equal(AI.trimBounds(new Uint8ClampedArray(w * h * 4), w, h, 2), null);
});

test('bytesToDataUrl', () => {
  assert.equal(AI.bytesToDataUrl(Uint8Array.from([104, 105]), 'image/png'), 'data:image/png;base64,aGk=');
  const big = new Uint8Array(100000).fill(65);
  assert.equal(AI.bytesToDataUrl(big).length, 'data:image/png;base64,'.length + Math.ceil(100000 / 3) * 4);
});

// ---------- posisi cop & tandatangan ----------
test('signPos: nilai teks dari Sheet, lalai, dan had saiz', () => {
  assert.deepEqual(AI.signPos({}), { cop: { x: 36, y: 20, w: 106 }, tt: { x: 24, y: 28, w: 150 } });
  const p = AI.signPos({ cop_x: '10', cop_y: '', cop_saiz: '999', tt_lebar: '5', tt_x: 'abc' });
  assert.equal(p.cop.x, 10); assert.equal(p.cop.y, 20); assert.equal(p.cop.w, 200);
  assert.equal(p.tt.w, 60); assert.equal(p.tt.x, 24);
  assert.deepEqual(AI.signToSettings({ cop: { x: 10.4, y: 20.6, w: 100 }, tt: { x: 1, y: 2, w: 150 } }),
    { cop_x: '10', cop_y: '21', cop_saiz: '100', tt_x: '1', tt_y: '2', tt_lebar: '150' });
  assert.deepEqual(AI.signReset(), AI.signPos({}));
});

test('moveItem / clampItem / resizeItem kekal dalam kotak', () => {
  const B = AI.SIGN_BOX;                                       // 260 × 140
  const it = { x: 36, y: 20, w: 100 };                        // aspek 1 → tinggi 100
  assert.deepEqual(AI.moveItem(it, 1, -1, 1), { x: 37, y: 19, w: 100 });
  assert.deepEqual(AI.moveItem(it, -500, -500, 1), { x: 0, y: 0, w: 100 });
  assert.deepEqual(AI.moveItem(it, 500, 500, 1), { x: B.w - 100, y: B.h - 100, w: 100 });
  assert.deepEqual(AI.clampItem({ x: 5, y: 5, w: 400 }, 1, B), { x: 0, y: 0, w: 400 }); // lebih besar daripada kotak
  const r = AI.resizeItem({ x: 50, y: 20, w: 100 }, 'cop', 120, 1);
  assert.equal(r.w, 120); assert.equal(r.x, 40); assert.equal(r.y, 10);                // dari tengah
  assert.equal(AI.resizeItem(it, 'cop', 10, 1).w, 40);
  assert.equal(AI.resizeItem(it, 'cop', 9999, 1).w, 200);
  assert.equal(AI.resizeItem({ x: 0, y: 0, w: 150 }, 'tt', 240, 0.4).w, 240);
});

test('signOrder & signHtml: tandatangan di atas cop; hanya item berimej', () => {
  assert.deepEqual(AI.signOrder('cop'), ['tt', 'cop']); assert.deepEqual(AI.signOrder('tt'), ['cop', 'tt']);
  const pos = AI.signPos({});
  const html = AI.signHtml(pos, { cop: { url: 'data:image/png;base64,AA==', aspect: 1 }, tt: null }, { selected: 'cop' });
  assert.match(html, /data-sitem="cop"/); assert.doesNotMatch(html, /data-sitem="tt"/);
  assert.match(html, /left:13\.846%/);                          // 36/260
  const st = AI.signHtml(pos, { cop: { url: 'u1', aspect: 1 }, tt: { url: 'u2', aspect: 0.5 } }, { static: true });
  assert.ok(st.indexOf('u1') < st.indexOf('u2'), 'tt dilukis selepas cop = di atas');
  assert.doesNotMatch(st, /data-sbox/);
});

// ---------- simpanan gambar (Drive palsu) ----------
const TOKEN = 'ya29.test-token-panjang';
const mk = () => {
  const g = fakeGoogle(TOKEN);
  const api = new AI.GoogleApi({ token: async () => TOKEN, fetch: g.fetch, sleep: async () => {} });
  const mem = new Map();
  const idb = { get: async (s, k) => mem.get(s + k), set: async (s, k, v) => { mem.set(s + k, v); }, del: async (s, k) => { mem.delete(s + k); } };
  return { g, api, idb, mem };
};
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

test('ImageStore.put: fail dicipta dalam folder, bertanda, kandungan dimuat naik, dicache', async () => {
  const { g, api, idb, mem } = mk();
  const folder = await api.createFolder('_Tetapan', null);
  const store = new AI.ImageStore({ api, idb, folderId: folder.id });
  const r = await store.put('cop', PNG);
  const f = g.files.get(r.id);
  assert.deepEqual(f.parents, [folder.id]); assert.equal(f.appProperties.annurInvoice, 'image'); assert.equal(f.appProperties.kind, 'cop');
  assert.equal(f.mimeType, 'image/png'); assert.deepEqual(Array.from(f.bytes), Array.from(PNG)); assert.equal(f.contentType, 'image/png');
  assert.match(r.url, /^data:image\/png;base64,/);
  assert.equal(mem.get('kvimg:' + r.id), r.url);
});

test('ImageStore.get: cache dahulu, kemudian Drive; fail hilang → null', async () => {
  const { g, api, idb, mem } = mk();
  const folder = await api.createFolder('_Tetapan', null);
  const writer = new AI.ImageStore({ api, idb, folderId: folder.id });
  const { id, url } = await writer.put('logo', PNG);
  mem.clear();
  const reader = new AI.ImageStore({ api, idb, folderId: folder.id });
  const n = g.calls.length;
  assert.equal(await reader.get(id), url);                       // dari Drive
  assert.ok(g.calls.length > n);
  const n2 = g.calls.length;
  assert.equal(await reader.get(id), url);                       // dari cache
  assert.equal(g.calls.length, n2);
  assert.equal(await reader.get(''), null);
  assert.equal(await reader.get('tiadaFail'), null);
});

test('ImageStore.drop: fail lama ke tong sampah dan cache dibuang; ralat diabaikan', async () => {
  const { g, api, idb, mem } = mk();
  const folder = await api.createFolder('_Tetapan', null);
  const store = new AI.ImageStore({ api, idb, folderId: folder.id });
  const a = await store.put('cop', PNG);
  await store.drop(a.id);
  assert.equal(g.files.get(a.id).trashed, true); assert.equal(mem.has('kvimg:' + a.id), false);
  await store.drop('tidakWujud');                                 // tidak melontar
  await store.drop('');
});

test('ImageStore.put: muat naik gagal → fail separuh dibuang', async () => {
  const { g, api, idb } = mk();
  const folder = await api.createFolder('_Tetapan', null);
  const store = new AI.ImageStore({ api, idb, folderId: folder.id });
  const real = g.fetch; let n = 0;
  const flaky = new AI.GoogleApi({ token: async () => TOKEN, sleep: async () => {}, retries: 0, fetch: (u, i) => (String(u).includes('/upload/') ? Promise.resolve(new Response('{"error":{"message":"boom"}}', { status: 500 })) : (n++, real(u, i))) });
  const s2 = new AI.ImageStore({ api: flaky, idb, folderId: folder.id });
  await assert.rejects(s2.put('cop', PNG), /boom/);
  const imgs = [...g.files.values()].filter((f) => f.appProperties && f.appProperties.annurInvoice === 'image');
  assert.equal(imgs.length, 1); assert.equal(imgs[0].trashed, true);
  assert.ok(store);
});
