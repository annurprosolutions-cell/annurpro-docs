// Tangkapan skrin sebenar daripada mod demo untuk halaman jualan & panduan → media/*.jpg
// Jalankan: node --no-warnings tools/capture.mjs   (perlu Playwright)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'media');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
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
const shot = async (page, name, o) => { await page.waitForTimeout(250); await (o && o.el ? page.locator(o.el).first() : page).screenshot({ path: join(OUT, name + '.jpg'), type: 'jpeg', quality: 82, fullPage: !!(o && o.full) }); console.log('  ' + name); };
const hideToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = 'toast'; });

async function session(viewport, scale) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale || 1, serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Asia/Kuala_Lumpur' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/?demo');
  await page.locator('.topbar .pill', { hasText: 'Tersimpan' }).waitFor({ timeout: 15000 });
  await page.addStyleTag({ content: '.demo-bar{display:none!important}' });   // gambar pemasaran tanpa jalur demo
  return { ctx, page };
}
async function issueSample(page, bar, o) {
  o = o || {};
  await page.locator(bar === '.ed-bar' ? '.bottom' : '.side').getByRole('button', { name: 'Dokumen baharu' }).click();
  if (o.type) await page.locator('.doc-seg').getByRole('button', { name: o.type }).click();
  await page.getByLabel('Nama (Bill To)').fill(o.cust || 'contoh');
  await page.locator('.sugg').getByRole('button').first().click();
  const items = o.items || [['Pembangunan laman web korporat', '1', 'JOB', '3500'], ['Hosting & penyelenggaraan (12 bulan)', '1', 'LOT', '1200'], ['Latihan pengguna', '2', 'DAY', '450']];
  for (let i = 0; i < items.length; i++) {
    if (i) await page.getByRole('button', { name: 'Tambah item' }).click();
    const [d, q, u, p] = items[i];
    await page.locator(`[name="it:${i}:desc"]`).fill(d); await page.locator(`[name="it:${i}:qty"]`).fill(q); await page.locator(`[name="it:${i}:unit"]`).fill(u);
    if (await page.locator(`[name="it:${i}:price"]`).count()) await page.locator(`[name="it:${i}:price"]`).fill(p);
  }
  await page.getByLabel(/Your Ref|PO No/).fill('PO-2026-0815');
}

try {
  // ---------- desktop ----------
  let { ctx, page } = await session({ width: 1366, height: 860 });
  await shot(page, 'utama-desktop');
  await issueSample(page, '.ed-acts');
  await page.locator('[data-pv] .a4').first().waitFor();
  await hideToast(page); await shot(page, 'editor-desktop');
  // salinan A4 saiz penuh (tanpa skala pratonton) untuk gambar dokumen
  await page.evaluate(() => {
    const h = document.createElement('div'); h.id = 'docshot';
    h.style.cssText = 'position:fixed;left:0;top:0;z-index:999;background:#fff;box-shadow:0 0 0 1px #e5e7eb';
    h.innerHTML = document.querySelector('[data-pv] .a4').outerHTML; document.body.appendChild(h);
  });
  await page.setViewportSize({ width: 1366, height: 1130 });
  await shot(page, 'dokumen-invois', { el: '#docshot' });
  // versi "diterbit": nombor rasmi, tanpa tera DRAF (untuk video)
  await page.evaluate(() => {
    const h = document.getElementById('docshot');
    h.querySelectorAll('.dv-draft').forEach((n) => n.remove());
    h.innerHTML = h.innerHTML.replace(/APS\/1126-XXX/g, 'APS/1126-001');
  });
  await shot(page, 'dokumen-invois-terbit', { el: '#docshot' });
  await page.evaluate(() => document.getElementById('docshot').remove());
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click();
  await shot(page, 'terbit-sahkan');
  await page.getByRole('button', { name: 'Terbit sekarang' }).click();
  await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 });
  await shot(page, 'terbit-berjaya');
  await page.getByRole('button', { name: 'Selesai' }).click();
  // quotation + DO untuk rekod
  await issueSample(page, '.ed-acts', { type: 'Quotation', cust: 'beta', items: [['Sistem kawalan akses (4 pintu)', '1', 'SET', '8800']] });
  await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click(); await page.getByRole('button', { name: 'Terbit sekarang' }).click();
  await page.getByRole('dialog').getByText('Quotation diterbit').waitFor({ timeout: 60000 }); await page.getByRole('button', { name: 'Selesai' }).click();
  await page.locator('.side').getByRole('button', { name: 'Rekod' }).click();
  await page.getByRole('button', { name: /Menu APS-Q\// }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tukar jadi Invois' }).click();
  await page.locator('.ed-acts').getByRole('button', { name: 'Terbit' }).click(); await page.getByRole('button', { name: 'Terbit sekarang' }).click();
  await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 }); await page.getByRole('button', { name: 'Selesai' }).click();
  await page.locator('.side').getByRole('button', { name: 'Rekod' }).click();
  await page.locator('[data-reclist] .drow').first().waitFor(); await hideToast(page);
  await shot(page, 'rekod-desktop');
  await page.getByRole('button', { name: /Menu APS\// }).first().click();
  await shot(page, 'rekod-menu');
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
  await page.locator('.side').getByRole('button', { name: 'Pelanggan' }).click(); await hideToast(page);
  await shot(page, 'pelanggan-desktop');
  await page.locator('.side').getByRole('button', { name: 'Tetapan' }).click();
  await shot(page, 'tetapan-desktop');
  await page.getByRole('button', { name: /Profil Syarikat/ }).click(); await shot(page, 'profil-desktop');
  await page.getByRole('button', { name: 'Tetapan' }).first().click();
  await page.getByRole('button', { name: /Dokumen, Penomboran & Cukai/ }).click(); await shot(page, 'dokumen-cukai-desktop', { full: true });
  await page.getByRole('button', { name: 'Tetapan' }).first().click();
  await page.getByRole('button', { name: /Logo, Cop & Tandatangan/ }).click(); await page.locator('[data-sitem="cop"]').waitFor(); await shot(page, 'logo-cop-desktop', { full: true });
  await page.getByRole('button', { name: 'Tetapan' }).first().click();
  await page.getByRole('button', { name: /Langganan & Kredit/ }).click(); await page.locator('table.ltab').first().waitFor(); await hideToast(page); await shot(page, 'langganan-desktop'); await shot(page, 'pek-kredit', { el: 'section.card:has(.packs)' });
  await page.evaluate(() => window.AI.app.actions.resumeSetup());
  await page.getByRole('heading', { name: 'Penomboran' }).waitFor(); await shot(page, 'wizard-desktop');
  await ctx.close();

  // ---------- telefon ----------
  ({ ctx, page } = await session({ width: 390, height: 844 }, 2));
  await shot(page, 'utama-telefon');
  await issueSample(page, '.ed-bar');
  await hideToast(page); await page.evaluate(() => window.scrollTo(0, 620)); await shot(page, 'editor-telefon');
  await page.getByRole('tab', { name: 'Pratonton' }).click(); await page.locator('.pv-page').first().waitFor(); await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, 'pratonton-telefon');
  await page.locator('.ed-bar').getByRole('button', { name: 'Terbit' }).click(); await page.getByRole('button', { name: 'Terbit sekarang' }).click();
  await page.getByRole('dialog').getByText('Invois diterbit').waitFor({ timeout: 60000 }); await shot(page, 'terbit-telefon');
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.locator('.bottom').getByRole('button', { name: 'Rekod' }).click(); await hideToast(page); await shot(page, 'rekod-telefon');
  await ctx.close();
  console.log('Siap: media/');
} finally { await browser.close(); server.close(); }
