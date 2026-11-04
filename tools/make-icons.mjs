// Jana ikon PWA (dokumen berlipat + semak) ke icons/. Jalankan: NODE_PATH=$(npm root -g) node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
// pad = jarak selamat (maskable memerlukan kandungan dalam ~80% tengah)
const svg = (pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2149b8"/><stop offset="1" stop-color="#0b1d4d"/></linearGradient></defs>
<rect width="512" height="512" rx="${round ? 112 : 0}" fill="url(#g)"/>
<g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
<path d="M150 92h150l82 82v246a24 24 0 0 1-24 24H150a24 24 0 0 1-24-24V116a24 24 0 0 1 24-24z" fill="#fff"/>
<path d="M300 92v58a24 24 0 0 0 24 24h58z" fill="#c8d6ff"/>
<rect x="166" y="206" width="132" height="16" rx="8" fill="#3b63d6"/>
<rect x="166" y="244" width="180" height="16" rx="8" fill="#c8d4f0"/>
<rect x="166" y="282" width="180" height="16" rx="8" fill="#c8d4f0"/>
<rect x="166" y="320" width="110" height="16" rx="8" fill="#c8d4f0"/>
<circle cx="336" cy="364" r="58" fill="#ffcf5a"/>
<path d="M310 364l20 20 36-42" fill="none" stroke="#2a1d00" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</g></svg>`;
const jobs = [['icon-512.png', 512, 0.02, true], ['icon-192.png', 192, 0.02, true], ['apple-touch-icon.png', 180, 0.02, false], ['icon-maskable-512.png', 512, 0.22, false]];
const browser = await chromium.launch();
for (const [file, size, pad, round] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg(pad, round).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body>`);
  await page.screenshot({ path: join(OUT, file), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('Siap:', jobs.map((j) => j[0]).join(', '));
