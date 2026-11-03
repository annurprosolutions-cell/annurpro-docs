// E2E Fasa 1–2: log masuk Google (dimock) → /api/check (Worker sebenar + D1 palsu) → skrin Utama
// → wizard persediaan (folder ikut nama syarikat) → Tetapan Profil & Dokumen/Cukai → dialog konflik.
// Jalankan: node --no-warnings tests/e2e.mjs [folder-screenshot]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../worker/index.mjs';
import { createD1 } from './helpers/d1.mjs';

const require = createRequire(import.meta.url);
const { fakeGoogle } = require('./helpers/fake-google.js');
const G = fakeGoogle('ya29.TOK-E2E-LONG');
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv[2] || '';
const CLIENT = 'e2e-client.apps.googleusercontent.com';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

const env = { GOOGLE_CLIENT_ID: CLIENT, DB: createD1(), BUY_URL_SUB: 'https://bcl.test/form' };
const fakeFetch = async (url) => {
  const tok = decodeURIComponent(String(url).split('access_token=')[1] || '');
  return new Response(JSON.stringify({ aud: CLIENT, email: tok === 'ya29.TOK-E2E-LONG' ? 'pemilik@contoh.my' : '', email_verified: 'true' }), { status: tok === 'ya29.TOK-E2E-LONG' ? 200 : 400 });
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, { fetch: fakeFetch });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  try { const buf = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;

const GIS_MOCK = `window.google = { accounts: { oauth2: {
  initTokenClient: (o) => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'ya29.TOK-E2E-LONG', expires_in: 3600 }), 20) }),
  revoke: (t, cb) => cb && cb() } } };`;

const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, viewport] of [['telefon', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(GIS_MOCK);
    await page.route('**/config.js', async (route) => {
      const body = (await readFile(join(ROOT, 'config.js'), 'utf8')).replace(/googleClientId: '[^']*'/, `googleClientId: '${CLIENT}'`);
      await route.fulfill({ body, contentType: 'text/javascript' });
    });
    await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (r) => r.fulfill({ json: { email: 'pemilik@contoh.my' } }));
    // Sheets + Drive → Google palsu yang dikongsi antara konteks (meniru satu akaun Drive)
    const toFake = async (route) => {
      const rq = route.request();
      const res = await G.fetch(rq.url(), { method: rq.method(), headers: { Authorization: rq.headers().authorization }, body: rq.postData() || undefined });
      await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
    };
    await page.route('https://sheets.googleapis.com/**', toFake);
    await page.route('https://www.googleapis.com/drive/**', toFake);

    const sheetsNow = () => [...G.files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.spreadsheet' && !f.trashed);
    const kv = (sid, tab) => Object.fromEntries((G.tab(sid, tab) || []).slice(1).map((r) => [r[0], r[1] == null ? '' : r[1]]));
    const until = async (fn, ms, what) => { const t = Date.now(); while (Date.now() - t < (ms || 6000)) { if (await fn()) return; await page.waitForTimeout(100); } throw new Error('Tamat masa menunggu: ' + what); };
    const shot = async (n, full) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}-${name}.png`, fullPage: !!full }); };
    const navBar = () => page.locator(name === 'telefon' ? '.bottom' : '.side');

    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'Sambung Google' }).waitFor();
    await shot('s01');
    await page.getByRole('button', { name: 'Sambung Google' }).click();

    if (name === 'telefon') {
      // ---------- pengguna baharu: wizard S-02, folder ikut nama syarikat ----------
      await page.getByRole('heading', { name: 'Syarikat' }).waitFor({ timeout: 8000 });
      assert.equal(sheetsNow().length, 0, 'tiada Sheet sebelum nama syarikat diisi');
      await page.getByRole('button', { name: 'Seterusnya' }).click();
      await page.getByText('Nama syarikat wajib diisi.').waitFor();
      await page.getByLabel('Nama syarikat').fill('AZN Power Solution');
      await page.getByLabel('Alamat').fill('NO 32 LORONG 12\nTAMAN HALAMAN INDAH\n14200 SUNGAI JAWI');
      assert.equal(await page.locator('[data-live="folder"]').innerText(), 'AZN Power Solution – Annur Invoice');
      await shot('s02-1');
      await page.getByRole('button', { name: 'Seterusnya' }).click();
      await page.getByRole('heading', { name: 'Penomboran' }).waitFor({ timeout: 8000 });
      const sh = sheetsNow();
      assert.equal(sh.length, 1);
      assert.equal(sh[0].name, 'AZN Power Solution – Annur Invoice');
      assert.equal(G.files.get(sh[0].parents[0]).name, 'AZN Power Solution – Annur Invoice');
      assert.equal(await page.getByLabel('Kod syarikat').inputValue(), 'APS', 'kod dicadangkan');
      await page.getByLabel('Kod syarikat').fill('azn');
      assert.equal(await page.getByLabel('Kod syarikat').inputValue(), 'AZN', 'huruf besar automatik');
      assert.match(await page.locator('[data-live="no-quotation"]').innerText(), /^AZN-Q\/\d{4}-001$/);
      await shot('s02-2');
      await page.getByRole('button', { name: 'Seterusnya' }).click();
      await page.getByRole('heading', { name: 'Penandatangan' }).waitFor();
      await page.getByLabel('Nama penandatangan').fill('SITI FATIMAH BINTI JAMAL');
      await page.getByLabel('Jawatan').fill('MANAGING DIRECTOR');
      await page.getByRole('button', { name: 'Seterusnya' }).click();
      await page.getByRole('heading', { name: 'Bank' }).waitFor();
      await page.getByLabel('Nama bank').fill('maybank');
      await page.getByLabel('No. akaun').fill('557102161049');
      await page.getByRole('button', { name: 'Seterusnya' }).click();
      await page.getByRole('heading', { name: 'SST' }).waitFor();
      await page.getByLabel('Ya').check();
      await page.getByRole('button', { name: 'Siap' }).click();
      await page.getByText('No. pendaftaran SST wajib').waitFor();
      await page.getByLabel('No. pendaftaran SST').fill('w10-1808-32000001');
      await page.getByLabel(/Cukai Perkhidmatan 8%/).check();
      await shot('s02-5');
      await page.getByRole('button', { name: 'Siap' }).click();
      await page.locator('.lic .big').waitFor({ timeout: 8000 });
      assert.equal(await page.locator('.lic .big').innerText(), '50 kredit');
      const sid = sh[0].id;
      await until(() => kv(sid, 'Syarikat').sst_no === 'W10-1808-32000001', 6000, 'Syarikat disimpan');
      const sk = kv(sid, 'Syarikat');
      assert.equal(sk.nama, 'AZN Power Solution'); assert.equal(sk.kod_syarikat, 'AZN'); assert.equal(sk.tt_nama, 'SITI FATIMAH BINTI JAMAL');
      assert.equal(sk.bank_nama, 'MAYBANK'); assert.equal(sk.bank_akaun, '557102161049'); assert.equal(sk.sst_berdaftar, 'YA');
      assert.match(sk.alamat, /TAMAN HALAMAN INDAH/);
      const tax = Object.fromEntries(G.tab(sid, 'KodCukai').slice(1).map((r) => [r[0], r[4]]));
      assert.equal(tax['SST-PERKHIDMATAN-8'], 'YA'); assert.equal(tax['SST-JUALAN-10'], 'TIDAK');
      await page.locator('.topbar .pill', { hasText: 'Tersimpan' }).waitFor({ timeout: 6000 });
      await shot('s03', true);

      // muat semula: terus ke Utama (tiada wizard), tiada Sheet berganda
      await page.reload();
      await page.locator('.lic .big').waitFor();
      await page.locator('.topbar .pill', { hasText: 'Tersimpan' }).waitFor({ timeout: 6000 });
      assert.equal(sheetsNow().length, 1);

      // ---------- S-17 konflik ----------
      await navBar().getByRole('button', { name: 'Tetapan' }).click();
      const metaRows = G.tab(sid, 'Meta');
      const ri = metaRows.findIndex((r) => r[0] === 'dikemaskini'), pi = metaRows.findIndex((r) => r[0] === 'penulis');
      G.edit(sid, 'Meta', ri, 1, '2030-01-01T00:00:00.000Z'); G.edit(sid, 'Meta', pi, 1, 'peranti-lain');
      await page.evaluate(() => { window.AI.app.store().setKV('Syarikat', { nama: 'UJIAN KONFLIK' }).catch(() => {}); });
      await page.getByRole('dialog').getByText('Sheet telah diubah di tempat lain').waitFor({ timeout: 5000 });
      await shot('s17');
      await page.getByRole('button', { name: 'Muat data terkini' }).click();
      await page.locator('.topbar .pill', { hasText: 'Tersimpan' }).waitFor({ timeout: 5000 });
      assert.equal(kv(sid, 'Syarikat').nama, 'AZN Power Solution', 'tiada timpaan senyap');
    } else {
      // ---------- peranti kedua: jumpa ruang kerja, persediaan lengkap → terus Utama ----------
      await page.locator('.lic .big').waitFor({ timeout: 8000 });
      await page.locator('.topbar .pill', { hasText: 'Tersimpan' }).waitFor({ timeout: 8000 });
      assert.equal(sheetsNow().length, 1, 'Sheet dijumpai semula, bukan dicipta');
      const sid = sheetsNow()[0].id;
      assert.equal(await page.locator('.page-head h1').innerText(), 'AZN Power Solution', 'nama perniagaan dari /api/check');
      await shot('s03', true);

      // S-08 Profil: validasi, simpan, tukar nama folder atas persetujuan
      await navBar().getByRole('button', { name: 'Tetapan' }).click();
      await page.getByRole('button', { name: /Profil Syarikat/ }).click();
      await page.getByRole('heading', { name: 'Profil Syarikat' }).waitFor();
      await page.getByLabel('E-mel').fill('salah@');
      await page.getByRole('button', { name: 'Simpan' }).click();
      await page.getByText('Format e-mel tidak sah.').waitFor();
      await page.getByLabel('E-mel').fill('aznpowersolution@gmail.com');
      await page.getByLabel('Nama syarikat').fill('AZN Power Solution Sdn Bhd');
      await page.getByLabel('Kod warna').fill('#7c2d12');
      await shot('s08', true);
      await page.getByRole('button', { name: 'Simpan' }).click();
      await page.getByRole('dialog').getByText('Tukar nama folder & Sheet juga?').waitFor();
      await page.getByRole('button', { name: 'Ya, tukar nama' }).click();
      const NEW = 'AZN Power Solution Sdn Bhd – Annur Invoice';
      await until(() => G.files.get(sid).name === NEW && G.files.get(G.files.get(sid).parents[0]).name === NEW, 6000, 'nama Sheet & folder ditukar');
      await until(() => kv(sid, 'Syarikat').emel === 'aznpowersolution@gmail.com', 6000, 'profil disimpan');
      assert.equal(kv(sid, 'Syarikat').warna_aksen, '#7c2d12');

      // S-10 Dokumen & Cukai: prefix sendiri, matikan SST
      await page.getByRole('button', { name: 'Tetapan' }).first().click();
      await page.getByRole('button', { name: /Dokumen, Penomboran & Cukai/ }).click();
      await page.getByLabel('Prefix Quotation').fill('qt');
      assert.match(await page.locator('[data-live="no-quotation"]').innerText(), /^QT\/\d{4}-001$/);
      await page.getByLabel('Tidak').check();
      await shot('s10', true);
      await page.getByRole('button', { name: 'Simpan' }).click();
      await until(() => kv(sid, 'Syarikat').prefix_quotation === 'QT', 6000, 'prefix disimpan');
      await until(() => Object.fromEntries(G.tab(sid, 'KodCukai').slice(1).map((r) => [r[0], r[4]]))['SST-PERKHIDMATAN-8'] === 'TIDAK', 6000, 'SST dimatikan');
      assert.equal(kv(sid, 'Syarikat').sst_berdaftar, 'TIDAK');
      await page.getByRole('button', { name: 'Tetapan' }).first().click();
    }

    await page.getByRole('button', { name: 'Log keluar' }).click();
    await page.getByRole('button', { name: 'Sambung Google' }).waitFor();

    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hscroll, false, 'skrol mendatar pada ' + name);
    assert.deepEqual(errors, [], 'ralat JS pada ' + name);
    console.log('ok', name);
    await ctx.close();
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM credit_ledger').first('n');
  assert.equal(n, 1, 'kredit percubaan sekali sahaja');
  console.log('E2E lulus');
} catch (e) {
  failed = true; console.error('E2E GAGAL:', e.message);
} finally {
  await browser.close(); server.close();
}
process.exit(failed ? 1 : 0);
