// E2E Fasa 1–2: log masuk Google (dimock) → /api/check (Worker sebenar + D1 palsu) → skrin Utama
// → wizard persediaan (folder ikut nama syarikat) → Tetapan Profil & Dokumen/Cukai → dialog konflik.
// Jalankan: node --no-warnings tests/e2e.mjs [folder-screenshot]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { handle } from '../worker/index.mjs';
import { createD1 } from './helpers/d1.mjs';

const require = createRequire(import.meta.url);
const { fakeGoogle } = require('./helpers/fake-google.js');
const G = fakeGoogle('ya29.TOK-E2E-LONG');
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv[2] || '';

// ---------- PNG sebenar untuk muat naik (tanpa pustaka) ----------
function makePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const c = px(x, y); const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255; } }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)) >>> 0, 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const WHITE = [255, 255, 255];
const STAMP = makePng(200, 200, (x, y) => { const d = Math.hypot(x - 100, y - 100); return d < 80 && d > 66 ? [198, 40, 40] : WHITE; });          // cincin merah, latar putih
const STAMP2 = makePng(160, 160, (x, y) => (Math.hypot(x - 80, y - 80) < 60 ? [30, 58, 138] : WHITE));                                         // cakera biru
const SIGN = makePng(300, 120, (x, y) => (Math.abs(y - (110 - x * 0.3)) < 4 ? [30, 60, 200] : WHITE));                                         // garis tulisan tangan
const LOGO = makePng(240, 120, (x) => (x < 120 ? [11, 29, 77] : [198, 40, 40]));                                                                // logo penuh (tiada latar putih)
const CLIENT = 'e2e-client.apps.googleusercontent.com';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

const BCL_KEY = 'e2e-' + 'k'.repeat(40);
const BCL_TX = {};
const env = { GOOGLE_CLIENT_ID: CLIENT, DB: createD1(), BUY_URL_SUB: 'https://bcl.test/form', BCL_WEBHOOK_KEY: BCL_KEY, BCL_API_TOKEN: 'bcl_e2e',
  BCL_API_URL: 'https://api.bcl.test/v1', OWNER_EMAILS: 'pemilik@contoh.my' };
const fakeFetch = async (url) => {
  if (String(url).startsWith('https://api.bcl.test/v1/transactions/')) {
    const id = decodeURIComponent(String(url).split('/transactions/')[1]);
    return BCL_TX[id] ? new Response(JSON.stringify({ success: true, data: BCL_TX[id] }), { status: 200 }) : new Response('{}', { status: 404 });
  }
  const tok = decodeURIComponent(String(url).split('access_token=')[1] || '');
  return new Response(JSON.stringify({ aud: CLIENT, email: tok === 'ya29.TOK-E2E-LONG' ? 'pemilik@contoh.my' : '', email_verified: 'true' }), { status: tok === 'ya29.TOK-E2E-LONG' ? 200 : 400 });
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/bcl/')) {
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

let FAIL_PDF_UPLOAD = 0;
const pdfFiles = () => [...G.files.values()].filter((f) => f.mimeType === 'application/pdf');
const pdfPages = (f) => (Buffer.from(f.bytes).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
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
      if (FAIL_PDF_UPLOAD > 0 && rq.url().includes('/upload/drive/') && (rq.headers()['content-type'] || '').includes('pdf')) {
        FAIL_PDF_UPLOAD--; await route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":{"code":400,"message":"Simulasi muat naik gagal"}}' }); return;
      }
      const res = await G.fetch(rq.url(), { method: rq.method(), headers: { Authorization: rq.headers().authorization, 'Content-Type': rq.headers()['content-type'] }, body: rq.postDataBuffer() || undefined });
      await route.fulfill({ status: res.status, contentType: res.headers.get('content-type') || 'application/json', body: Buffer.from(await res.arrayBuffer()) });
    };
    await page.route('https://sheets.googleapis.com/**', toFake);
    await page.route('https://www.googleapis.com/drive/**', toFake);
    await page.route('https://www.googleapis.com/upload/drive/**', toFake);

    const AI_rows = (id) => { const t = G.tab(id, 'Dokumen') || []; const h = t[0] || []; return t.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] == null ? '' : r[i]]))); };
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
      assert.equal(await page.locator('[data-live="folder"]').innerText(), 'AZN Power Solution – Annur Docs');
      await shot('s02-1');
      await page.getByRole('button', { name: 'Seterusnya' }).click();
      await page.getByRole('heading', { name: 'Penomboran' }).waitFor({ timeout: 8000 });
      const sh = sheetsNow();
      assert.equal(sh.length, 1);
      assert.equal(sh[0].name, 'AZN Power Solution – Annur Docs');
      assert.equal(G.files.get(sh[0].parents[0]).name, 'AZN Power Solution – Annur Docs');
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

      // S-09 pada telefon: muat naik dan tiada skrol mendatar
      await page.getByRole('button', { name: /Logo, Cop & Tandatangan/ }).click();
      await page.locator('[data-imgfile="cop"]').setInputFiles({ name: 'cop.png', mimeType: 'image/png', buffer: STAMP });
      await page.locator('[data-sitem="cop"]').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar pada S-09 telefon');
      await shot('s09-telefon', true);
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: 'Tetapan' }).first().click();

      // S-04 pada telefon (SST 8% aktif): tab Borang/Pratonton, bar jumlah, tiada skrol mendatar
      await page.locator('.bottom').getByRole('button', { name: 'Dokumen baharu' }).click();
      await page.getByRole('heading', { name: 'Invois baharu' }).waitFor();
      assert.equal(await page.locator('.bottom').isVisible(), false, 'nav bawah disembunyikan dalam editor');
      await page.getByLabel('Nama (Bill To)').fill('Contoh Trading Sdn Bhd');
      await page.locator('[name="it:0:desc"]').fill('Consulting');
      await page.locator('[name="it:0:price"]').fill('100');
      assert.equal(await page.locator('[name="it:0:tax_code"]').inputValue(), 'SST-PERKHIDMATAN-8');
      await until(async () => (await page.locator('[data-total-short]').innerText()) === 'RM108.00', 3000, 'SST 8% dalam bar');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar editor telefon');
      await shot('s04-telefon-borang', false);
      await page.getByRole('tab', { name: 'Pratonton' }).click();
      await page.locator('.pv-page').first().waitFor();
      assert.match(await page.locator('[data-pv]').innerText(), /Cukai Perkhidmatan 8%/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar pratonton telefon');
      await shot('s04-telefon-pratonton', false);
      await page.locator('.ed-bar').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
      const pnum = await page.locator('.bignum').innerText();
      assert.match(pnum, /^AZN\/\d{4}-001$/);
      await until(() => AI_rows(sid).some((r) => r.no_dokumen === pnum && r.pdf_id), 6000, 'baris telefon');
      const prow = AI_rows(sid).find((r) => r.no_dokumen === pnum);
      assert.equal(prow.jumlah, 108); assert.equal(prow.jumlah_cukai, 8); assert.equal(prow.subtotal, 100);
      assert.match(prow.ringkasan_cukai_json, /SST-PERKHIDMATAN-8/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar dialog terbit telefon');
      await shot('s05-telefon', false);
      await page.getByRole('button', { name: 'Selesai' }).click();
      await page.locator('.lic .big').waitFor();
      assert.equal(await page.locator('.lic .big').innerText(), '45 kredit');
      // S-06 & S-07 pada telefon: tiada skrol mendatar
      await page.locator('.bottom').getByRole('button', { name: 'Rekod' }).click();
      await page.getByRole('button', { name: 'Menu ' + pnum }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar menu rekod telefon');
      await shot('s06-telefon', false);
      await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
      await page.locator('.bottom').getByRole('button', { name: 'Pelanggan' }).click();
      await page.getByText('Belum ada pelanggan.').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar pelanggan telefon');
      await shot('s07-telefon', false);
      await page.locator('.bottom').getByRole('button', { name: 'Tetapan' }).click();

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
      const NEW = 'AZN Power Solution Sdn Bhd – Annur Docs';
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

      // ---------- S-09 Logo, Cop & Tandatangan ----------
      const saved = async () => { try { await page.locator('#toast.show', { hasText: 'Gambar dan kedudukan disimpan.' }).waitFor({ timeout: 8000 }); } catch (e) { throw new Error('Simpan gambar gagal; toast: ' + (await page.locator('#toast').innerText()) + ' | sync: ' + (await page.locator('.topbar .pill').first().innerText()) + ' | calls: ' + G.calls.slice(-5).join(' ; ')); } };
      const save = async () => {
        await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 6000 });   // toast lama hilang dahulu
        await page.getByRole('button', { name: 'Simpan' }).click();
        await saved();
      };
      const settingsId = G.files.get(sid).parents[0] && kv(sid, 'Meta').folder_tetapan;
      const driveImgs = () => [...G.files.values()].filter((f) => f.appProperties && f.appProperties.annurInvoice === 'image');
      const alphaAt = (sel, x, y) => page.evaluate(async ([q, px, py]) => {
        const im = document.querySelector(q); await im.decode();
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        return { w: im.naturalWidth, a: g.getImageData(px, py, 1, 1).data[3] };
      }, [sel, x, y]);
      await page.getByRole('button', { name: /Logo, Cop & Tandatangan/ }).click();
      await page.getByRole('heading', { name: 'Logo, Cop & Tandatangan' }).waitFor();
      await page.locator('.sign-ed, .empty.small').first().waitFor();
      assert.match(await page.locator('.empty.small').innerText(), /Muat naik cop atau tandatangan/);

      // fail bukan gambar ditolak
      await page.locator('[data-imgfile="cop"]').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hai') });
      await page.getByText('Hanya gambar PNG, JPG atau WebP dibenarkan.').waitFor();

      // cop: latar putih dibuang dan dipotong; matikan pilihan → latar putih kekal
      await page.locator('[data-imgfile="cop"]').setInputFiles({ name: 'cop.png', mimeType: 'image/png', buffer: STAMP });
      await page.locator('.itile[data-kind="cop"] .ithumb img').waitFor();
      let r = await alphaAt('.itile[data-kind="cop"] .ithumb img', 0, 0);
      assert.equal(r.a, 0, 'sudut lutsinar'); assert.ok(r.w < 200 && r.w > 150, 'dipotong ke kandungan: ' + r.w);
      await shot('s09-a');
      await page.locator('[data-imgrw="cop"]').uncheck();
      await until(async () => (await alphaAt('.itile[data-kind="cop"] .ithumb img', 0, 0)).a === 255, 5000, 'latar putih kekal bila dimatikan');
      await page.locator('[data-imgrw="cop"]').check();
      await until(async () => (await alphaAt('.itile[data-kind="cop"] .ithumb img', 0, 0)).a === 0, 5000, 'latar dibuang semula');

      await page.locator('[data-imgfile="tt"]').setInputFiles({ name: 'tt.png', mimeType: 'image/png', buffer: SIGN });
      await page.locator('.itile[data-kind="tt"] .ithumb img').waitFor();
      await page.locator('[data-imgfile="logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
      await page.locator('.itile[data-kind="logo"] .ithumb img').waitFor();
      assert.equal((await alphaAt('.itile[data-kind="logo"] .ithumb img', 0, 0)).a, 255, 'logo tidak dibuang latarnya');
      assert.equal(driveImgs().length, 0, 'belum disimpan = belum dimuat naik');

      // seret cop dengan tetikus; nudge; saiz
      await page.locator('[data-sitem="cop"]').waitFor();
      await page.locator('#sboxWrap').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const before = await page.evaluate(() => window.AI.app.UI.img.pos.cop.x);
      const bb = await page.locator('[data-sitem="cop"]').boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 24, bb.y + bb.height / 2 + 6, { steps: 4 }); await page.mouse.up();
      const after = await page.evaluate(() => window.AI.app.UI.img.pos.cop);
      assert.ok(after.x > before + 5, `cop bergerak ke kanan: ${before} → ${after.x}`);
      await page.locator('[data-nudge="1,0"]').click();
      assert.equal(await page.evaluate(() => Math.round(window.AI.app.UI.img.pos.cop.x * 10) / 10), Math.round((after.x + 1) * 10) / 10, 'nudge 1px');
      await page.locator('[data-sitem="cop"]').focus();
      await page.keyboard.press('Shift+ArrowDown');
      assert.ok((await page.evaluate(() => window.AI.app.UI.img.pos.cop.y)) > after.y + 5, 'Shift+anak panah = 10px');
      await page.locator('#signSize').fill('120');
      assert.equal(await page.evaluate(() => Math.round(window.AI.app.UI.img.pos.cop.w)), 120);
      await page.getByRole('button', { name: 'Tandatangan', exact: true }).click();
      await page.locator('[data-sitem="tt"]').waitFor();
      await shot('s09-b', true);

      // simpan → Drive: fail dalam _Tetapan, id & kedudukan dalam Sheet
      await save();
      await until(() => driveImgs().length === 3, 5000, '3 fail gambar dalam Drive');
      driveImgs().forEach((f) => { assert.deepEqual(f.parents, [settingsId]); assert.deepEqual(Array.from(f.bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]); assert.ok(!f.trashed); });
      await until(() => kv(sid, 'Syarikat').cop_id && kv(sid, 'Syarikat').tt_gambar_id && kv(sid, 'Syarikat').logo_id, 6000, 'id gambar dalam Sheet');
      let sy = kv(sid, 'Syarikat');
      assert.equal(sy.do_tt_gambar_id, '');
      assert.equal(sy.cop_saiz, '120'); assert.notEqual(sy.cop_x, '36');
      const oldCop = sy.cop_id;

      // muat semula: gambar dimuat dari cache/Drive, kedudukan kekal
      await page.reload();
      await page.locator('.lic .big').waitFor({ timeout: 8000 });
      await navBar().getByRole('button', { name: 'Tetapan' }).click();
      await page.getByRole('button', { name: /Logo, Cop & Tandatangan/ }).click();
      await page.locator('.itile[data-kind="cop"] .ithumb img').waitFor({ timeout: 8000 });
      await page.locator('[data-sitem="cop"]').waitFor();
      assert.equal(await page.evaluate(() => Math.round(window.AI.app.UI.img.pos.cop.w)), 120);

      // ganti cop: fail lama ke tong sampah selepas rujukan baharu disimpan
      await page.locator('[data-imgfile="cop"]').setInputFiles({ name: 'cop2.png', mimeType: 'image/png', buffer: STAMP2 });
      await page.getByText('Belum disimpan').first().waitFor();
      await save();
      await until(() => kv(sid, 'Syarikat').cop_id && kv(sid, 'Syarikat').cop_id !== oldCop, 6000, 'cop baharu');
      assert.equal(G.files.get(oldCop).trashed, true, 'cop lama dibuang');
      assert.equal(driveImgs().filter((f) => !f.trashed).length, 3);

      // buang tandatangan DO tiada → tile menunjuk tandatangan utama sebagai hantu; buang tandatangan utama
      assert.ok(await page.locator('.itile[data-kind="dott"] img.ghost').count(), 'DO guna tandatangan utama');
      const oldTt = kv(sid, 'Syarikat').tt_gambar_id;
      await page.locator('.itile[data-kind="tt"]').getByRole('button', { name: 'Buang' }).click();
      await save();
      await until(() => kv(sid, 'Syarikat').tt_gambar_id === '', 6000, 'tandatangan dibuang');
      assert.equal(G.files.get(oldTt).trashed, true, 'tandatangan lama dibuang: ' + JSON.stringify({ oldTt, calls: G.calls.slice(-8), items: await page.evaluate(() => Object.fromEntries(Object.entries(window.AI.app.UI.img.items).map(([k, v]) => [k, v.id]))) }));

      // reset kedudukan
      await page.getByRole('button', { name: /Reset kedudukan/ }).click();
      await save();
      await until(() => kv(sid, 'Syarikat').cop_x === '36' && kv(sid, 'Syarikat').cop_saiz === '106', 6000, 'kedudukan lalai');

      // pratonton kepala dokumen di Profil memaparkan logo sebenar
      await page.getByRole('button', { name: 'Tetapan' }).first().click();
      await page.getByRole('button', { name: /Profil Syarikat/ }).click();
      await page.locator('.dh-logo img').waitFor({ timeout: 5000 });
      await shot('s08-logo', true);
      await page.getByRole('button', { name: 'Tetapan' }).first().click();

      // ---------- S-04 Editor dokumen (desktop, tanpa SST) ----------
      const pv = () => page.locator('[data-pv]').innerText();
      await page.getByRole('button', { name: 'Dokumen baharu' }).first().click();
      await page.getByRole('heading', { name: 'Invois baharu' }).waitFor();
      await page.locator('[data-pv] .a4').first().waitFor();
      assert.match(await pv(), /INVOICE/); assert.match(await pv(), /AZN\/\d{4}-XXX/); assert.match(await pv(), /DRAF/);
      assert.match(await pv(), /AZN Power Solution Sdn Bhd/);
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByText('Nama pelanggan (Bill To) wajib diisi.').first().waitFor();
      await page.getByLabel('Nama (Bill To)').fill('Contoh Trading Sdn Bhd');
      await page.getByLabel('Alamat', { exact: true }).fill('Lot 5, Jalan Industri\n40000 Shah Alam');
      await page.locator('[name="it:0:desc"]').fill('Website maintenance');
      await page.locator('[name="it:0:qty"]').fill('2');
      await page.locator('[name="it:0:price"]').fill('150');
      await until(async () => /RM300\.00/.test(await page.locator('[data-totals]').innerText()), 3000, 'jumlah 300');
      assert.match(await page.locator('[data-totals]').innerText(), /RINGGIT MALAYSIA THREE HUNDRED ONLY/);
      assert.match(await pv(), /300\.00/); assert.doesNotMatch(await pv(), /Disc \(RM\)/);
      await page.getByRole('button', { name: 'Tambah item' }).click();
      await page.locator('[name="it:1:desc"]').fill('Hosting');
      await page.locator('[name="it:1:price"]').fill('99.90');
      await page.locator('[name="it:1:disc"]').fill('9.90');
      await until(async () => /RM390\.00/.test(await page.locator('[data-totals]').innerText()), 3000, 'jumlah 390');
      assert.match(await pv(), /Disc \(RM\)/);

      // simpan pelanggan baharu ke Sheet
      await page.getByRole('button', { name: 'Simpan ke senarai pelanggan' }).click();
      await until(() => (G.tab(sid, 'Pelanggan') || []).slice(1).some((r) => r.includes('Contoh Trading Sdn Bhd')), 6000, 'pelanggan disimpan');

      // susun semula item
      await page.getByRole('button', { name: 'Turunkan item 1' }).click();
      assert.equal(await page.locator('[name="it:0:desc"]').inputValue(), 'Hosting');
      assert.ok((await pv()).indexOf('Hosting') < (await pv()).indexOf('Website maintenance'));

      // tukar jenis: Quotation, DO, kembali Invois (data kekal)
      await page.locator('.doc-seg').getByRole('button', { name: 'Quotation' }).click();
      await page.getByLabel('Tempoh sah (validity)').waitFor();
      assert.match(await pv(), /QUOTATION/); assert.match(await pv(), /Validity/);
      await page.locator('.doc-seg').getByRole('button', { name: 'Delivery Order' }).click();
      await until(async () => /DELIVERY ORDER/.test(await pv()), 3000, 'DO');
      assert.doesNotMatch(await pv(), /Price \(RM\)/); assert.match(await pv(), /Received By/i); assert.match(await pv(), /Total quantity: 3/);
      await page.getByLabel('Sama dengan Bill To').uncheck();
      await page.getByLabel('Alamat hantar').fill('Tapak Projek, Jalan 2');
      await until(async () => /Deliver To[\s\S]*Tapak Projek/i.test(await pv()), 3000, 'ship to');
      await shot('s04-do', false);
      await page.locator('.doc-seg').getByRole('button', { name: 'Invois' }).click();
      await until(async () => /RM390\.00/.test(await page.locator('[data-totals]').innerText()), 3000, 'jumlah kekal');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('dialog').getByText('Terbit Invois?').waitFor();
      assert.match(await page.getByRole('dialog').innerText(), /5 kredit akan digunakan/);
      await shot('s04-invois', false);
      await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();

      // berbilang halaman A4
      await page.evaluate(() => { const d = window.AI.app.UI.ed.d; for (let i = 0; i < 45; i++) d.items.push({ desc: 'Komponen ' + (i + 1), qty: '1', unit: 'PCS', price: '10', disc: '', tax_code: 'TIADA' }); window.AI.app.render(); });
      assert.ok((await page.locator('[data-pv] .a4').count()) >= 2, 'berbilang halaman');
      assert.match(await pv(), /\(continued\)/);
      await page.evaluate(() => { window.AI.app.UI.ed.d.items.splice(2); window.AI.app.render(); });

      // draf: simpan, Rekod, buka semula, padam
      await page.locator('.ed-acts').getByRole('button', { name: 'Simpan draf' }).click();
      await page.locator('#toast.show', { hasText: 'Draf disimpan di peranti ini.' }).waitFor();
      await page.getByRole('button', { name: 'Utama' }).first().click();
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      await page.getByRole('button', { name: /Contoh Trading Sdn Bhd/ }).waitFor();
      assert.match(await page.locator('section', { hasText: 'Draf di peranti ini' }).locator('.dlist').innerText(), /RM390\.00/);
      await page.getByRole('button', { name: /Contoh Trading Sdn Bhd/ }).click();
      await page.getByRole('heading', { name: 'Invois (draf)' }).waitFor();
      assert.equal(await page.locator('[name="it:1:desc"]').inputValue(), 'Website maintenance');
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      page.once('dialog', (dg) => dg.accept());
      await page.getByRole('button', { name: 'Padam draf' }).click();
      await page.getByText('Tiada draf.').waitFor();

      // cadangan pelanggan dalam invois baharu
      await page.getByRole('button', { name: 'Dokumen baharu' }).first().click();
      await page.getByLabel('Nama (Bill To)').fill('contoh');
      await page.locator('.sugg').getByRole('button', { name: /Contoh Trading Sdn Bhd/ }).click();
      assert.match(await page.getByLabel('Alamat', { exact: true }).inputValue(), /Shah Alam/);
      assert.equal(await page.locator('.sugg').count(), 0);

      // ---------- S-05 Terbit sebenar: nombor, Sheet, PDF sebenar (html2canvas + jsPDF), Drive ----------
      await page.locator('[name="it:0:desc"]').fill('Annual support contract');
      await page.locator('[name="it:0:price"]').fill('250');
      const credBefore = await page.evaluate(() => window.AI.app.UI.lic.credits);
      const nPdf = pdfFiles().length;
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
      const num1 = await page.locator('.bignum').innerText();
      assert.match(num1, /^AZN\/\d{4}-\d{3}$/);
      await shot('s05-desktop', false);
      assert.equal(pdfFiles().length, nPdf + 1);
      const pdf1 = pdfFiles().find((f) => f.name.startsWith(num1.replace(/\//g, '-')));
      assert.ok(pdf1, 'PDF dinamakan ikut nombor');
      assert.deepEqual(pdf1.parents, [kv(sid, 'Meta').folder_invois]);
      assert.equal(Buffer.from(pdf1.bytes.slice(0, 5)).toString(), '%PDF-');
      assert.ok(pdf1.bytes.length > 15000, 'PDF ada kandungan imej: ' + pdf1.bytes.length);
      assert.equal(pdfPages(pdf1), 1);
      if (SHOTS) (await import('node:fs')).writeFileSync(`${SHOTS}/invois-${name}.pdf`, Buffer.from(pdf1.bytes));
      assert.deepEqual(pdf1.permissions, [{ role: 'reader', type: 'anyone' }]);
      assert.match(await page.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\/\?text=/);
      assert.match(await page.getByRole('link', { name: 'Muat turun' }).getAttribute('download'), /\.pdf$/);
      const drow = () => AI_rows(sid).find((r) => r.no_dokumen === num1);
      await until(() => drow() && drow().pdf_id === pdf1.id, 6000, 'baris Dokumen dengan pautan PDF');
      assert.equal(drow().jumlah, 250); assert.equal(drow().status, 'Terbit'); assert.equal(drow().bill_nama, 'Contoh Trading Sdn Bhd');
      assert.match(drow().hash_kandungan, /^[0-9a-f]{64}$/);
      await page.getByRole('button', { name: 'Selesai' }).click();
      await page.locator('.lic .big').waitFor();
      assert.equal(await page.evaluate(() => window.AI.app.UI.lic.credits), credBefore - 5, 'kredit ditolak 5');
      assert.ok((await page.locator('.dlist').first().innerText()).includes(num1), 'dokumen terkini di Utama');

      // gagal semasa muat naik PDF → Cuba lagi: nombor sama, kredit sekali, satu PDF
      await page.getByRole('button', { name: 'Dokumen baharu' }).first().click();
      await page.getByLabel('Nama (Bill To)').fill('Syarikat Ujian Retry');
      await page.locator('[name="it:0:desc"]').fill('Item retry'); await page.locator('[name="it:0:price"]').fill('10');
      FAIL_PDF_UPLOAD = 1;
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Terbit belum selesai').waitFor({ timeout: 60000 });
      assert.match(await page.getByRole('dialog').innerText(), /Simulasi muat naik gagal/);
      assert.match(await page.getByRole('dialog').innerText(), /sudah dikeluarkan/);
      const credMid = await page.evaluate(() => window.AI.app.UI.lic.credits);
      assert.equal(credMid, credBefore - 10, 'kad lesen dikemas kini walaupun terbit belum selesai');
      await page.getByRole('button', { name: 'Cuba lagi' }).click();
      await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
      const num2 = await page.locator('.bignum').innerText();
      assert.equal(pdfFiles().filter((f) => f.name.startsWith(num2.replace(/\//g, '-'))).length, 1, 'satu PDF sahaja');
      assert.equal(AI_rows(sid).filter((r) => r.no_dokumen === num2).length, 1, 'satu baris sahaja');
      assert.equal(await page.evaluate(() => window.AI.app.UI.lic.credits), credMid, 'cuba semula tidak mengecaj lagi');
      const ledger = await env.DB.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason = 'issue'").first('n');
      assert.equal(ledger, (await env.DB.prepare('SELECT COUNT(*) AS n FROM doc_issues').first('n')), 'satu caj setiap nombor');
      await page.getByRole('button', { name: 'Selesai' }).click();

      // tiada kredit → S-12
      await env.DB.prepare('UPDATE tenants SET credits = 0').run();
      await page.getByRole('button', { name: 'Dokumen baharu' }).first().click();
      await page.getByLabel('Nama (Bill To)').fill('Pelanggan Tanpa Kredit');
      await page.locator('[name="it:0:desc"]').fill('Item'); await page.locator('[name="it:0:price"]').fill('1');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Tidak dapat terbit').waitFor({ timeout: 15000 });
      assert.match(await page.getByRole('dialog').innerText(), /Baki kredit tidak cukup \(0 kredit/);
      assert.equal(await page.getByRole('link', { name: 'Langgan' }).getAttribute('href'), 'https://bcl.test/form');
      await shot('s12-desktop', false);
      await page.getByRole('button', { name: 'Tutup' }).click();
      assert.equal(AI_rows(sid).filter((r) => r.bill_nama === 'Pelanggan Tanpa Kredit').length, 0);
      await page.getByRole('button', { name: 'Utama' }).first().click();
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      await page.getByText(num2).waitFor();
      assert.ok(await page.getByRole('link', { name: 'PDF' }).count() >= 2);
      await shot('s06-desktop', true);

      // ================= Fasa 7 =================
      await env.DB.prepare('UPDATE tenants SET credits = 100').run();
      const recList = () => page.locator('[data-reclist]').innerText();
      const qbox = page.locator('[data-form="rekod"] input[name="q"]');
      await qbox.fill('retry');
      await until(async () => (await recList()).includes(num2) && !(await recList()).includes(num1), 8000, 'carian rekod');
      await qbox.fill('');
      await page.locator('.rfilters').getByRole('button', { name: 'Quotation' }).click();
      await page.getByText('Tiada dokumen sepadan.').waitFor();
      await page.locator('.rfilters').getByRole('button', { name: 'Semua' }).click();

      // Edit dalam 24 jam: nombor & fail PDF sama, jumlah dikemas kini, tiada caj
      const pdfBefore = Buffer.from(pdf1.bytes).toString('base64');
      const credEdit = await env.DB.prepare('SELECT credits FROM tenants').first('credits');
      await page.getByRole('button', { name: 'Menu ' + num1 }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
      await page.getByRole('heading', { name: 'Edit Invois ' + num1 }).waitFor();
      assert.equal(await page.locator('.doc-seg').count(), 0, 'jenis tidak boleh ditukar semasa edit');
      await page.locator('[name="it:0:price"]').fill('300');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('dialog').getByText('Simpan perubahan Invois?').waitFor();
      assert.match(await page.getByRole('dialog').innerText(), /Tiada kredit digunakan/);
      await page.getByRole('button', { name: 'Simpan & jana semula PDF' }).click();
      await page.getByRole('dialog').getByText('Invois dikemas kini').waitFor({ timeout: 60000 });
      assert.equal(await page.locator('.bignum').innerText(), num1);
      await until(() => drow().jumlah === 300, 6000, 'jumlah dikemas kini');
      assert.equal(drow().pdf_id, pdf1.id, 'fail PDF sama');
      assert.notEqual(Buffer.from(G.files.get(pdf1.id).bytes).toString('base64'), pdfBefore, 'kandungan PDF diganti');
      assert.equal(AI_rows(sid).filter((r) => r.no_dokumen === num1).length, 1);
      assert.equal(await env.DB.prepare('SELECT credits FROM tenants').first('credits'), credEdit, 'edit tidak mengecaj');
      await page.getByRole('button', { name: 'Selesai' }).click();

      // Quotation → Invois → DO
      await page.getByRole('button', { name: 'Dokumen baharu' }).first().click();
      await page.locator('.doc-seg').getByRole('button', { name: 'Quotation' }).click();
      await page.getByLabel('Nama (Bill To)').fill('Gamma Sdn Bhd');
      await page.locator('[name="it:0:desc"]').fill('Panel install'); await page.locator('[name="it:0:qty"]').fill('4'); await page.locator('[name="it:0:price"]').fill('500');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Quotation diterbit').waitFor({ timeout: 60000 });
      const qnum = await page.locator('.bignum').innerText();
      assert.match(qnum, /^QT\/\d{4}-001$/);
      await page.getByRole('button', { name: 'Selesai' }).click();
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      await page.getByRole('button', { name: 'Menu ' + qnum }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Tukar jadi Invois' }).click();
      await page.getByRole('heading', { name: 'Invois baharu' }).waitFor();
      assert.match(await page.locator('.editor').innerText(), new RegExp('Dibuat daripada Quotation ' + qnum.replace('/', '\\/')));
      assert.equal(await page.getByLabel('Your Ref. / PO No.').inputValue(), qnum);
      assert.equal(await page.locator('[name="it:0:qty"]').inputValue(), '4');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
      const inum = await page.locator('.bignum').innerText();
      await page.getByRole('button', { name: 'Selesai' }).click();
      const rowOf = (n) => AI_rows(sid).find((r) => r.no_dokumen === n);
      await until(() => rowOf(qnum).status_quotation === 'Ditukar' && rowOf(qnum).ditukar_kepada === inum, 6000, 'quotation ditukar');
      assert.equal(rowOf(inum).sumber_no, qnum); assert.equal(rowOf(inum).jumlah, 2000);
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      await page.locator('[data-form="rekod"] select[name="status"]').selectOption('ditukar');
      await until(async () => JSON.stringify(await page.locator('[data-reclist] .drow.rec .dopen > b').allInnerTexts()) === JSON.stringify([qnum]), 3000, 'tapis ditukar');
      await page.locator('[data-form="rekod"] select[name="status"]').selectOption('');
      await page.getByRole('button', { name: 'Menu ' + inum }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Buat Delivery Order' }).click();
      await page.getByRole('heading', { name: 'Delivery Order baharu' }).waitFor();
      assert.equal(await page.locator('[name="it:0:price"]').count(), 0, 'DO tanpa harga');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Delivery Order diterbit').waitFor({ timeout: 60000 });
      const dnum = await page.locator('.bignum').innerText();
      await page.getByRole('button', { name: 'Selesai' }).click();
      await until(() => rowOf(inum).ditukar_kepada === dnum, 6000, 'invois → DO');
      assert.equal(rowOf(dnum).sumber_jenis, 'invoice'); assert.equal(rowOf(dnum).jumlah_qty, 4);

      // Batal dokumen
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      await page.getByRole('button', { name: 'Menu ' + num2 }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Batal dokumen' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Batal dokumen' }).click();
      await page.getByText('Nyatakan sebab').waitFor();
      await page.locator('#voidReason').fill('Harga salah');
      await shot('s06-batal', false);
      await page.getByRole('dialog').getByRole('button', { name: 'Batal dokumen' }).click();
      await page.locator('#toast.show', { hasText: num2 + ' dibatalkan.' }).waitFor({ timeout: 8000 });
      await until(() => rowOf(num2).status === 'Batal' && rowOf(num2).sebab_batal === 'Harga salah', 6000, 'baris Batal');
      assert.equal(await env.DB.prepare('SELECT status FROM doc_issues WHERE number = ?').bind(num2).first('status'), 'void');
      await page.getByRole('button', { name: 'Menu ' + num2 }).click();
      assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).count(), 0);
      assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Batal dokumen' }).count(), 0);
      await page.getByRole('dialog').getByRole('button', { name: 'Salin sebagai draf baharu' }).click();
      await page.getByRole('heading', { name: 'Invois baharu' }).waitFor();
      assert.equal(await page.getByLabel('Nama (Bill To)').inputValue(), 'Syarikat Ujian Retry');
      await page.getByRole('button', { name: 'Utama' }).first().click();
      await navBar().getByRole('button', { name: 'Rekod' }).click();
      await shot('s06-penuh', true);

      // ---------- S-07 Pelanggan ----------
      await navBar().getByRole('button', { name: 'Pelanggan' }).click();
      await page.getByRole('button', { name: /Contoh Trading Sdn Bhd/ }).waitFor();
      assert.match(await page.locator('[data-custlist]').innerText(), /\d+ dokumen/);
      await page.getByRole('button', { name: 'Tambah' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
      await page.getByText('Nama pelanggan wajib diisi.').waitFor();
      await page.locator('#c-nama').fill('contoh trading sdn bhd');
      await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
      await page.getByText('Nama ini sama dengan pelanggan sedia ada').waitFor();
      await page.locator('#c-nama').fill('Delta Engineering');
      await page.locator('#c-alamat').fill('No 9, Jalan Teknologi\n47810 Petaling Jaya');
      await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
      const pel = () => { const t = G.tab(sid, 'Pelanggan') || []; const h = t[0] || []; return t.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] == null ? '' : r[i]]))); };
      await until(() => pel().some((c) => c.nama === 'Delta Engineering'), 6000, 'pelanggan baharu');
      await page.getByRole('button', { name: /Delta Engineering/ }).click();
      await page.locator('#c-tel').fill('03-5555 1234');
      await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
      await until(() => (pel().find((c) => c.nama === 'Delta Engineering') || {}).tel === '03-5555 1234', 6000, 'pelanggan dikemas kini');
      await page.getByRole('button', { name: /Delta Engineering/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Arkibkan' }).click();
      await until(() => (pel().find((c) => c.nama === 'Delta Engineering') || {}).arkib === 'YA', 6000, 'diarkib');
      assert.equal(await page.getByRole('button', { name: /Delta Engineering/ }).count(), 0, 'arkib disembunyikan');
      await page.getByLabel('Tunjuk arkib').check();
      await page.getByRole('button', { name: /Delta Engineering/ }).waitFor();
      await shot('s07-desktop', false);
      await page.locator('.drow', { hasText: 'Contoh Trading Sdn Bhd' }).getByRole('button', { name: 'Invois baharu' }).click();
      await page.getByRole('heading', { name: 'Invois baharu' }).waitFor();
      assert.match(await page.getByLabel('Alamat', { exact: true }).inputValue(), /Shah Alam/);
      await page.getByRole('button', { name: 'Utama' }).first().click();
      await navBar().getByRole('button', { name: 'Tetapan' }).click();

      // ================= Fasa 8 =================
      // S-11: arahan bayar, sejarah kredit
      await page.getByRole('button', { name: /Langganan & Kredit/ }).click();
      await page.getByRole('heading', { name: 'Langganan & Kredit' }).waitFor();
      assert.equal(await page.locator('.copyrow code').innerText(), 'pemilik@contoh.my');
      assert.equal(await page.getByRole('link', { name: 'Buka borang langganan' }).getAttribute('href'), 'https://bcl.test/form');
      await page.locator('table.ltab').first().waitFor({ timeout: 8000 });
      const ltxt = await page.locator('table.ltab').first().innerText();
      assert.match(ltxt, /Terbit dokumen/); assert.match(ltxt, /Kredit percubaan/);
      await shot('s11-sebelum', true);
      // bayaran BCL sebenar ke Worker → langganan aktif
      BCL_TX['BCL-E2E-0001'] = { record_id: 'r1', main_data: { order_number: 'BCL-E2E-0001', status: 3, is_paid: true, amount: '20.00', subtotal_amount: '20.00', items: [{ item: 'Langganan Bulanan', quantity: 1, price: '20.00' }], payer_email: 'pasangan@x.my' },
        custom_fields_data: { 'E-mel Google untuk sistem': 'pemilik@contoh.my' } };
      const wh = await fetch(BASE + '/bcl/' + BCL_KEY, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'payment-success', data: { record_id: 'r1', main_data: { order_number: 'BCL-E2E-0001', amount: '20.00' }, custom_fields_data: { 'E-mel Google untuk sistem': 'pemilik@contoh.my' } } }) }).then((r) => r.json());
      assert.equal(wh.ok, true); assert.equal(wh.months, 1);
      await page.getByRole('button', { name: 'Saya sudah bayar, semak semula' }).click();
      await until(async () => /Tanpa had/.test(await page.locator('.lic').innerText()), 6000, 'langganan aktif');
      assert.match(await page.locator('.lic').innerText(), /Langganan Bulanan/);
      await until(async () => /Langganan Bulanan/.test(await page.locator('section', { hasText: 'Bayaran' }).last().innerText()), 6000, 'bayaran disenarai');
      await shot('s11-selepas', true);
      // terbit semasa langganan: tiada caj
      const credSub = await env.DB.prepare('SELECT credits FROM tenants').first('credits');
      await page.getByRole('button', { name: 'Dokumen baharu' }).first().click();
      await page.getByLabel('Nama (Bill To)').fill('Pelanggan Langganan');
      await page.locator('[name="it:0:desc"]').fill('Servis'); await page.locator('[name="it:0:price"]').fill('80');
      await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
      assert.match(await page.getByRole('dialog').innerText(), /Langganan aktif: tiada kredit digunakan/);
      await page.getByRole('button', { name: 'Terbit sekarang' }).click();
      await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
      assert.equal(await env.DB.prepare('SELECT credits FROM tenants').first('credits'), credSub, 'langganan: kredit tidak ditolak');
      await page.getByRole('button', { name: 'Selesai' }).click();

      // S-14 Dashboard pemilik
      await page.goto(BASE + '/admin/');
      await page.getByRole('button', { name: 'Sambung Google' }).click();
      await page.getByText('Dashboard Pemilik').first().waitFor();
      await page.locator('.stats').waitFor({ timeout: 8000 });
      assert.match(await page.locator('.stats').innerText(), /Berlangganan\s*1/);
      const trow = page.locator('tr[data-email="pemilik@contoh.my"]');
      assert.match(await trow.innerText(), /Langganan/);
      const expBefore = await env.DB.prepare('SELECT expires FROM subscriptions').first('expires');
      page.once('dialog', (d) => d.accept());
      await trow.getByRole('button', { name: '+1 bln' }).click();
      await until(async () => (await env.DB.prepare('SELECT expires FROM subscriptions').first('expires')) > expBefore, 6000, '+1 bulan');
      const credAdm = await env.DB.prepare('SELECT credits FROM tenants').first('credits');
      const answers = ['25', 'Ganti rugi ujian'];
      const onDlg = (d) => d.accept(answers.shift());
      page.on('dialog', onDlg);
      await page.locator('tr[data-email="pemilik@contoh.my"]').getByRole('button', { name: 'Kredit ±' }).click();
      await until(async () => (await env.DB.prepare('SELECT credits FROM tenants').first('credits')) === credAdm + 25, 6000, 'laras kredit');
      page.off('dialog', onDlg);
      await page.getByRole('button', { name: /Bayaran \(1\)/ }).click();
      assert.match(await page.locator('.atab').innerText(), /BCL-E2E-0001/);
      await page.getByRole('button', { name: 'Log webhook' }).click();
      assert.match(await page.locator('.atab').innerText(), /OK/);
      await page.getByRole('button', { name: 'Tindakan' }).click();
      await page.locator('#voOrder').fill('BCL-TIADA-999');
      await page.getByRole('button', { name: /Sahkan/ }).click();
      await page.locator('pre.detail').waitFor();
      assert.match(await page.locator('pre.detail').innerText(), /api-bcl-404/);
      await shot('s14-desktop', true);
      await page.goto(BASE + '/');
      await page.locator('.lic .big').waitFor({ timeout: 8000 });
      await navBar().getByRole('button', { name: 'Tetapan' }).click();
    }

    await page.getByRole('button', { name: 'Log keluar' }).click();
    await page.getByRole('button', { name: 'Sambung Google' }).waitFor();

    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hscroll, false, 'skrol mendatar pada ' + name);
    assert.deepEqual(errors, [], 'ralat JS pada ' + name);
    console.log('ok', name);
    await ctx.close();
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason = 'trial'").first('n');
  assert.equal(n, 1, 'kredit percubaan sekali sahaja');
  console.log('E2E lulus');
} catch (e) {
  failed = true; console.error('E2E GAGAL:', e.message);
} finally {
  await browser.close(); server.close();
}
process.exit(failed ? 1 : 0);
