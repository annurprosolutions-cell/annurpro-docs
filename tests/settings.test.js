const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
require('../js/schema.js');
require('../js/google.js');
require('../js/workspace.js');
const AI = require('../js/settings.js');
const { fakeGoogle } = require('./helpers/fake-google.js');

test('nama folder & Sheet ikut syarikat (pilihan A)', () => {
  assert.equal(AI.workspaceName('AZN POWER SOLUTION'), 'AZN POWER SOLUTION – Annur Docs');
  assert.equal(AI.workspaceName('  Kedai   Ali \n Runcit '), 'Kedai Ali Runcit – Annur Docs');
  assert.equal(AI.workspaceName(''), 'Annur Docs');
  assert.equal(AI.workspaceName('x'.repeat(100)).length, 60 + ' – Annur Docs'.length);
});

test('ensureWorkspace guna nama syarikat semasa cipta; findWorkspace tidak mencipta', async () => {
  const TOKEN = 'ya29.test-token-panjang';
  const g = fakeGoogle(TOKEN);
  const api = new AI.GoogleApi({ token: async () => TOKEN, fetch: g.fetch, sleep: async () => {} });
  assert.equal(await AI.findWorkspace(api, {}), null);
  assert.equal(g.files.size, 0, 'findWorkspace tidak mencipta fail');
  const ws = await AI.ensureWorkspace(api, { company: 'AZN POWER SOLUTION', email: 'a@b.my', writer: 'w' });
  assert.equal(g.files.get(ws.id).name, 'AZN POWER SOLUTION – Annur Docs');
  assert.equal(g.files.get(ws.folders.root).name, 'AZN POWER SOLUTION – Annur Docs');
  assert.equal(g.files.get(ws.folders.invoice).name, 'Invois');
  const f = await AI.findWorkspace(api, {});
  assert.equal(f.id, ws.id);
  // nama ditukar pengguna dalam Drive: masih dijumpai (ikut tanda), nama tidak ditimpa
  g.files.get(ws.id).name = 'Fail Invois Saya';
  const again = await AI.ensureWorkspace(api, { company: 'NAMA LAIN', email: 'a@b.my', writer: 'w' });
  assert.equal(again.id, ws.id); assert.equal(g.files.get(ws.id).name, 'Fail Invois Saya');
  // tukar nama atas persetujuan
  await AI.renameWorkspace(api, ws, 'AZN POWER SOLUTION SDN BHD');
  assert.equal(g.files.get(ws.id).name, 'AZN POWER SOLUTION SDN BHD – Annur Docs');
  assert.equal(g.files.get(ws.folders.root).name, 'AZN POWER SOLUTION SDN BHD – Annur Docs');
});

test('prefix: diterbit dari kod, nilai sendiri diutamakan, contoh nombor', () => {
  assert.deepEqual(AI.derivePrefixes('azn'), { invoice: 'AZN', quotation: 'AZN-Q', do: 'AZN-DO' });
  const sk = { kod_syarikat: 'AZN', prefix_invois: '', prefix_quotation: 'QT', prefix_do: '' };
  assert.equal(AI.prefixFor(sk, 'invoice'), 'AZN'); assert.equal(AI.prefixFor(sk, 'quotation'), 'QT'); assert.equal(AI.prefixFor(sk, 'do'), 'AZN-DO');
  assert.equal(AI.prefixFor({}, 'invoice'), 'INV');
  assert.equal(AI.sampleNumber('AZN', '2026-11-03'), 'AZN/1126-001');
  assert.equal(AI.sampleNumber('AZN-Q', '2027-01-15', 12), 'AZN-Q/0127-012');
});

test('cadangan kod syarikat', () => {
  assert.equal(AI.suggestCode('AZN Power Solution'), 'APS');
  assert.equal(AI.suggestCode('Kedai Runcit Ali Sdn Bhd'), 'KRA');
  assert.equal(AI.suggestCode('Annurpro'), 'ANN');
  assert.equal(AI.suggestCode(''), '');
});

test('validasi tetapan', () => {
  assert.deepEqual(AI.validateSettings({ nama: 'AZN', kod_syarikat: 'AZN' }, ['nama', 'kod_syarikat']), {});
  const e = AI.validateSettings({ nama: '', kod_syarikat: 'A Z', emel: 'x@', warna_aksen: 'merah', tajuk_invois: 'BIL', sst_berdaftar: 'YA', sst_no: '', bank_akaun: 'abc' });
  ['nama', 'kod_syarikat', 'emel', 'warna_aksen', 'tajuk_invois', 'sst_no', 'bank_akaun'].forEach((k) => assert.ok(e[k], k));
  // hanya medan borang semasa disemak
  assert.deepEqual(AI.validateSettings({ nama: '' }, ['emel']), {});
  // prefix mesti berbeza
  assert.ok(AI.validateSettings({ kod_syarikat: 'AZN', prefix_invois: 'X', prefix_quotation: 'X', prefix_do: '' }, ['prefix_invois', 'prefix_quotation', 'prefix_do']).prefix_do);
  assert.ok(AI.validateSettings({ prefix_invois: 'AZN/1' }, ['prefix_invois']).prefix_invois);
});

test('normalisasi: huruf besar untuk kod/prefix, alamat dikemas', () => {
  const n = AI.normalizeSettings({ kod_syarikat: ' azn ', prefix_do: 'azn-do', alamat: ' NO 32 \r\n  TAMAN A  \n', warna_aksen: '#AABBCC', nama: ' AZN ' });
  assert.equal(n.kod_syarikat, 'AZN'); assert.equal(n.prefix_do, 'AZN-DO'); assert.equal(n.alamat, 'NO 32\nTAMAN A');
  assert.equal(n.warna_aksen, '#aabbcc'); assert.equal(n.nama, 'AZN');
});

test('kod cukai: validasi dan pelan SST', () => {
  const codes = AI.KODCUKAI_SEED.map((r) => ({ kod: r[0], nama: r[1], kadar: r[2], jenis: r[3], aktif: r[4] }));
  assert.deepEqual(AI.validateTaxCode({ kod: 'SST-KHAS', nama: 'Khas', kadar: '6.5', jenis: 'sst_perkhidmatan' }, codes), {});
  const e = AI.validateTaxCode({ kod: 'TIADA', nama: '', kadar: '101', jenis: 'x' }, codes);
  ['kod', 'nama', 'kadar', 'jenis'].forEach((k) => assert.ok(e[k], k));
  assert.ok(AI.validateTaxCode({ kod: 'ABC', nama: 'a', kadar: '6.555', jenis: 'tiada' }).kadar);
  assert.deepEqual(AI.sstPlan(codes, true, ['SST-PERKHIDMATAN-8']), [{ kod: 'SST-PERKHIDMATAN-8', aktif: 'YA' }]);
  const on = codes.map((c) => Object.assign({}, c, { aktif: c.jenis === 'tiada' ? 'YA' : 'YA' }));
  assert.equal(AI.sstPlan(on, false, []).length, 4, 'semua kod SST dimatikan bila tidak berdaftar');
});

test('setupComplete', () => {
  assert.equal(AI.setupComplete({ nama: 'AZN', kod_syarikat: '' }), false);
  assert.equal(AI.setupComplete({ nama: 'AZN', kod_syarikat: 'AZN' }), true);
});
