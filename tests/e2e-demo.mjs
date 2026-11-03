// E2E mod demo (/?demo) dan luar talian: tiada Google, tiada Worker. Jalankan: node --no-warnings tests/e2e-demo.mjs [folder-screenshot]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv[2] || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  try { const buf = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(buf); }
  catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;
const browser = await chromium.launch();
let failed = false;
try {
  // ---------- demo ----------
  for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['telefon', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [], outside = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { const u = new URL(r.url()); if (/google/.test(u.hostname) || u.pathname.startsWith('/api/') || u.pathname.startsWith('/bcl/')) outside.push(r.url()); });
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Cuba demo dahulu (tanpa log masuk)' }).click();
    await page.locator('.demo-bar').waitFor({ timeout: 10000 });
    await page.locator('.lic .big').waitFor();
    assert.equal(await page.locator('.lic .big').innerText(), '50 kredit');
    await page.locator('.topbar .pill', { hasText: 'Tersimpan' }).waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.page-head h1').innerText(), 'AnnurPro Solutions');
    const nav = page.locator(name === 'telefon' ? '.bottom' : '.side');
    await nav.getByRole('button', { name: 'Dokumen baharu' }).click();
    await page.getByLabel('Nama (Bill To)').fill('contoh');
    await page.locator('.sugg').getByRole('button', { name: /Contoh Trading Sdn Bhd/ }).click();
    await page.locator('[name="it:0:desc"]').fill('Pembangunan laman web');
    await page.locator('[name="it:0:price"]').fill('100');
    assert.equal(await page.locator('[name="it:0:tax_code"]').inputValue(), 'SST-PERKHIDMATAN-8');
    const bar = name === 'telefon' ? '.ed-bar' : '.ed-acts';
    await page.locator(bar).getByRole('button', { name: 'Terbit' }).click();
    await page.getByRole('button', { name: 'Terbit sekarang' }).click();
    await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
    assert.match(await page.locator('.bignum').innerText(), /^APS\/\d{4}-001$/);
    assert.match(await page.getByRole('link', { name: 'Buka PDF' }).getAttribute('href'), /^blob:/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo-terbit-${name}.png` });
    await page.getByRole('button', { name: 'Selesai' }).click();
    assert.equal(await page.locator('.lic .big').innerText(), '45 kredit');
    await nav.getByRole('button', { name: 'Rekod' }).click();
    await page.getByRole('button', { name: /Menu APS\// }).first().waitFor();
    assert.match(await page.locator('[data-reclist]').innerText(), /RM108\.00/);
    await nav.getByRole('button', { name: 'Tetapan' }).click();
    await page.getByRole('button', { name: /Bantuan & Sokongan/ }).click();
    assert.equal(await page.locator('.faq details').count(), 11);
    await page.locator('.faq summary').first().click();
    assert.match(await page.locator('.faq details').first().innerText(), /Google Sheet/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'skrol mendatar ' + name);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/bantuan-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Tetapan' }).first().click();
    await page.getByRole('button', { name: 'Log keluar' }).click();
    await page.getByRole('button', { name: 'Sambung Google' }).waitFor();
    assert.deepEqual(outside, [], 'mod demo tidak menghubungi Google/Worker');
    assert.deepEqual(errors, [], 'ralat JS ' + name);
    console.log('ok demo', name);
    await ctx.close();
  }

  // ---------- luar talian (service worker) ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/?demo');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.locator('.lic .big').waitFor({ timeout: 10000 });
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'halaman dikawal service worker');
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('.lic .big').waitFor({ timeout: 10000 });
  await page.getByText('Luar talian: draf boleh dicipta').waitFor();
  await page.locator('.bottom').getByRole('button', { name: 'Dokumen baharu' }).click();
  await page.getByLabel('Nama (Bill To)').fill('Draf luar talian');
  await page.locator('.ed-bar').getByRole('button', { name: 'Terbit' }).click();
  await page.locator('#toast.show', { hasText: 'Terbit dokumen perlukan internet' }).waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/luar-talian.png` });
  console.log('ok luar talian');
  await ctx.close();
  console.log('E2E demo lulus');
} catch (e) {
  failed = true; console.error('E2E demo GAGAL:', e.message);
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
