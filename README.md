# Annur Invoice

Penjana Invois, Quotation dan Delivery Order berlangganan untuk perniagaan Malaysia. PWA statik (tiada build), data pengguna dalam Google Sheet/Drive milik mereka, dan satu Cloudflare Worker + D1 untuk lesen, kredit, penomboran dan bayaran BCL.

Dokumen perancangan: [`docs/`](docs/) (PRD, TRD, AFD, DBD, BSD, IPD). Rujukan seni bina: repo `ruztimetable` dan skill `micro-saas-builder`.

## Status

| Fasa | Kandungan | Status |
|------|-----------|--------|
| 0 | Struktur repo, `wrangler.jsonc`, `schema.sql`, Worker `/api/ping`, ujian, CI | Siap (perlu langkah pemilik di bawah) |
| 1 | Log masuk Google, `/api/check` (akaun + 50 kredit percubaan sekali), kad lesen, notis, cache 7 hari, shell app + navigasi | Siap |
| 2 | Ruang kerja Sheet/Drive (`ensureWorkspace`), lapisan storan (queue, debounce, cuba semula, konflik), pill status, dialog S-17, IndexedDB (cache, draf, tulisan tertangguh) | Siap |
| 3 | Wizard persediaan 5 langkah (folder & Sheet ikut nama syarikat), Profil Syarikat, Dokumen/Penomboran/Cukai, tukar nama folder atas persetujuan | Siap |
| 4 | Logo, cop & tandatangan (muat naik, buang latar putih, seret/nudge/saiz) | Seterusnya |

## Struktur

```
index.html, config.js, sw.js, manifest.webmanifest, privasi.html
css/app.css            token warna dan komponen (docs/04-DBD.md)
js/core.js             utiliti (esc, tarikh DD/MM/YYYY, storan selamat)
js/auth.js             log masuk Google (GIS token model)
js/license.js          keputusan lesen + notis (fungsi tulen, diuji)
js/schema.js           skema tab Sheet, default Syarikat, seed KodCukai, baris ↔ objek
js/google.js           klien Sheets v4 + Drive v3 (backoff 429/5xx)
js/workspace.js        ensureWorkspace(): cipta/jumpa Sheet + folder (idempotent)
js/store.js            Store: baca ikut nama lajur, tulis berbaris, konflik
js/idb.js              IndexedDB: cache, draf, tulisan tertangguh
js/settings.js         validasi tetapan, prefix, contoh nombor, kod cukai (tulen)
js/ui-settings.js      skrin S-02 wizard, S-08 Profil, S-10 Dokumen & Cukai
js/app.js              UI: render() + data-act
worker/index.mjs       API: /api/ping, /api/check
schema.sql             jadual D1 (docs/05-BSD.md §3B)
tests/                 node --test (unit) + e2e.mjs (Playwright)
```

## Ujian

```bash
npm test
```

```bash
node --no-warnings tests/e2e.mjs
```

`npm test` menjalankan ujian unit Worker (dengan D1 palsu atas `node:sqlite` yang memuatkan `schema.sql` sebenar) dan logik lesen. `tests/e2e.mjs` memerlukan Playwright dan menguji log masuk hingga skrin Utama pada saiz telefon dan desktop, dengan Google dimock.

## Langkah pemilik (Fasa 0) — sekali sahaja

Jangan tampal sebarang rahsia (token, kunci) dalam chat. Letakkan terus dalam dashboard.

**A. Google Cloud (log masuk)**
1. Buka https://console.cloud.google.com → pilih atau cipta projek `Annur Invoice`.
2. **APIs & Services → Library**: aktifkan **Google Sheets API** dan **Google Drive API**.
3. **OAuth consent screen**: User type *External*, nama app `Annur Invoice`, emel sokongan, scope `openid`, `email`, `.../auth/drive.file`. Kekal **Testing** dan tambah emel kau sebagai *Test user*.
4. **Credentials → Create credentials → OAuth client ID → Web application**. *Authorized JavaScript origins*: alamat Worker (contoh `https://annur-invoice.<akaun>.workers.dev`) dan domain nanti.
5. Salin **Client ID** (bukan secret) dan bagi pada Claude, atau isi sendiri dalam `config.js` (`googleClientId`) dan var Worker `GOOGLE_CLIENT_ID`.

**B. Cloudflare (hos + D1)**
1. https://dash.cloudflare.com → **Storage & Databases → D1 → Create** → nama `annur-invoice`.
2. Buka database itu → **Console** → tampal seluruh isi `schema.sql` → **Execute**.
3. Salin **Database ID** → ganti `ISI_DATABASE_ID_D1` dalam `wrangler.jsonc`.
4. **Workers & Pages → Create → Import a repository** → pilih `annurpro-docs`. Build command kosong; deploy command `npx wrangler deploy`.
5. Worker → **Settings → Variables and Secrets**: semak var dalam `wrangler.jsonc` (`GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`). Rahsia BCL ditambah pada Fasa 8.
6. Buka `https://<worker>/api/ping`. Jawapan `{"ok":true,...,"db":true}` bermaksud Worker dan D1 bersambung.

**C. Uji log masuk**
Buka alamat Worker → **Sambung Google** → pilih akaun test → skrin Utama menunjukkan **50 kredit (10 dokumen)** Akaun baharu masuk ke wizard persediaan. Selepas langkah 1 (nama syarikat), Google Drive akan ada folder **[Nama Syarikat] – Annur Invoice** (subfolder Invois, Quotation, Delivery Order, _Tetapan) dan Sheet dengan nama sama, bertab Dokumen, Pelanggan, Syarikat, KodCukai, Item, Meta. Habis wizard, skrin Utama menunjukkan **50 kredit (10 dokumen)** dan pill **Tersimpan**.

## Rilis

Setiap kemas kini: naikkan `version` dalam `config.js` dan `CACHE` dalam `sw.js`, kemudian push ke branch yang disambung pada Cloudflare.
