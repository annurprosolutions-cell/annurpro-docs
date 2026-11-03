// E2E Fasa 1: log masuk Google (dimock) → /api/check (Worker sebenar + D1 palsu) → skrin Utama.
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
      const body = (await readFile(join(ROOT, 'config.js'), 'utf8')).replace("googleClientId: ''", `googleClientId: '${CLIENT}'`);
      await route.fulfill({ body, contentType: 'text/javascript' });
    });
    await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (r) => r.fulfill({ json: { email: 'pemilik@contoh.my' } }));

    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'Sambung Google' }).waitFor();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/s01-${name}.png` });
    await page.getByRole('button', { name: 'Sambung Google' }).click();
    await page.locator('.lic .big').waitFor({ timeout: 5000 });
    assert.match(await page.locator('.lic').innerText(), /Percubaan percuma[\s\S]*10 dokumen/);
    assert.equal(await page.locator('.lic .big').innerText(), '50 kredit');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/s03-${name}.png`, fullPage: true });

    // muat semula: sesi kekal (sessionStorage), tiada akaun berganda
    await page.reload();
    await page.locator('.lic .big').waitFor();
    assert.equal(await page.locator('.lic .big').innerText(), '50 kredit');

    // navigasi & log keluar
    await page.locator(name === 'telefon' ? '.bottom' : '.side').getByRole('button', { name: 'Tetapan' }).click();
    await page.getByText('pemilik@contoh.my').waitFor();
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
