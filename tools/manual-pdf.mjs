// panduan/index.html → panduan/Panduan-Annur-Invoice.pdf (A4). Jalankan selepas tools/capture.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(await readFile(join(ROOT, p))); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/panduan/`, { waitUntil: 'networkidle' });
await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
await page.pdf({ path: join(ROOT, 'panduan', 'Panduan-Annur-Invoice.pdf'), format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
  displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Panduan Annur Invoice · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
await browser.close(); server.close();
console.log('Siap: panduan/Panduan-Annur-Invoice.pdf');
