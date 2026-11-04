// Render video 1080x1920 (TikTok), deterministik: setiap bingkai dilukis oleh video.html pada masa t.
// Guna:
//   node render.mjs still <intro|sistem> <t1,t2,...> <folder-output>       (PNG untuk semakan)
//   node render.mjs video <intro|sistem> <audio.wav> <out.mp4> [fps=30] [workers=3]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = fileURLToPath(new URL('.', import.meta.url));
const URL_PAGE = pathToFileURL(join(HERE, 'video.html')).href;
const [mode, name, a3, a4, a5, a6] = process.argv.slice(2);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(URL_PAGE);
  await page.evaluate((n) => window.loadTimeline(n), name);
  await page.evaluate(() => window.ready());
  return page;
}

const browser = await chromium.launch();
if (mode === 'still') {
  const out = resolve(a4); mkdirSync(out, { recursive: true });
  const page = await openPage(browser);
  for (const t of a3.split(',').map(Number)) {
    await page.evaluate((x) => window.setT(x), t);
    await page.screenshot({ path: join(out, `${name}-${String(t).replace('.', '_')}.png`) });
  }
  await browser.close();
} else {
  const audio = resolve(a3), outFile = resolve(a4), fps = Number(a5 || 30), W = Number(a6 || 3);
  const tmp = join(resolve(outFile, '..'), '.video-tmp-' + name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const probe = await new Promise((r) => { let s = ''; const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]); p.stdout.on('data', (d) => (s += d)); p.on('close', () => r(parseFloat(s))); });
  const total = Math.ceil(probe * fps), per = Math.ceil(total / W);
  console.log(`audio ${probe.toFixed(2)}s -> ${total} bingkai, ${W} pekerja`);
  let done = 0; const t0 = Date.now();
  const segs = await Promise.all(Array.from({ length: W }, async (_, w) => {
    const from = w * per, to = Math.min(total, from + per); if (from >= to) return null;
    const seg = join(tmp, `seg${w}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'veryfast', '-r', String(fps), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((r) => ff.on('close', r));
    const page = await openPage(browser);
    for (let f = from; f < to; f++) {
      await page.evaluate((x) => window.setT(x), f / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (++done % 300 === 0) console.log(`  ${done}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await closed; return seg;
  }));
  await browser.close();
  const list = join(tmp, 'list.txt'); writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', outFile], { stdio: 'inherit' }).on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  rmSync(tmp, { recursive: true, force: true });
  console.log('Siap:', outFile, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
