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
| 4 | Logo, cop, tandatangan & tandatangan DO: muat naik ke `_Tetapan`, buang latar putih, penyusun seret/nudge/saiz/reset | Siap |
| 5 | Enjin dokumen: kalkulator SST (sen, cukai peringkat kod), editor Invois/Quotation/DO, pratonton A4 berbilang halaman, draf di peranti, pelanggan dari borang | Siap |
| 6 | Terbit: `/api/issue` (nombor atomik + caj kredit), `/api/void`, `/api/issues`, `/api/ledger`; PDF (html2canvas + jsPDF dalam `vendor/`) ke Drive; kongsi; cuba semula; S-12 | Siap |
| 7 | Rekod penuh (tapis, cari, edit 24 jam, batal), tukar Quotation→Invois / →DO, Pelanggan | Seterusnya |

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
js/images.js           semakan fail, buang latar putih, potong, ImageStore (Drive + cache)
js/sign.js             kedudukan cop & tandatangan (tulen) dan HTML ruang tandatangan
js/ui-images.js        skrin S-09: muat naik, penyusun seret/nudge/saiz
js/calc.js             pengiraan wang dalam sen, SST, jumlah dalam perkataan (tulen)
js/doc.js              model draf, validasi, data paparan, pembahagian halaman A4 (tulen)
js/template.js         HTML A4 Invois/Quotation/DO (css/doc.css, font Carlito)
js/ui-editor.js        skrin S-04 editor, S-05 terbit, S-12 tiada kredit, Rekod (draf + terbit)
js/issue.js            aliran terbit: nombor → Sheet → PDF → Drive (setiap langkah selamat diulang)
js/pdf.js              HTML A4 → PDF (dimuat bila perlu dari vendor/)
vendor/                html2canvas 1.4.1 dan jsPDF 2.5.1 (MIT, lesen disertakan)
js/ui-settings.js      skrin S-02 wizard, S-08 Profil, S-10 Dokumen & Cukai
js/app.js              UI: render() + data-act
worker/index.mjs       API: /api/ping, /api/check, /api/issue, /api/void, /api/issues, /api/ledger
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

## Langkah pemilik (persediaan sekali sahaja)

Jangan tampal sebarang rahsia (token, kunci rahsia) dalam chat. Yang boleh dikongsi dengan Claude hanyalah **Database ID** (D1) dan **Client ID** (Google); kedua-duanya bukan rahsia.

Susunan penting kerana setiap langkah memberi maklumat kepada langkah seterusnya: D1 → Worker → Google.

### 1. Cloudflare: cipta database D1
1. https://dash.cloudflare.com → **Storage & Databases → D1 SQL database → Create database** → nama `annur-invoice`.
2. Buka database itu → tab **Console** → tampal seluruh isi `schema.sql` → **Execute**. Jika ada ralat, jalankan satu `CREATE TABLE` pada satu masa.
3. Tab **Tables** patut menunjukkan 7 jadual: `tenants`, `subscriptions`, `credit_ledger`, `counters`, `doc_issues`, `payments`, `webhook_log`.
4. Salin **Database ID** (di halaman ringkasan database) dan bagi kepada Claude. Claude (atau anda, melalui GitHub) menggantikan `ISI_DATABASE_ID_D1` dalam `wrangler.jsonc`.

### 2. Cloudflare: sambung repo dan deploy
1. **Workers & Pages → Create → Import a repository** → pilih `annurpro-docs`.
2. Branch pengeluaran: branch default repo. Nama projek `annur-invoice`. **Build command kosong**. Deploy command `npx wrangler deploy`.
3. Selepas deploy berjaya, salin alamat Worker (contoh `https://annur-invoice.<subdomain>.workers.dev`).
4. Buka `<alamat>/api/ping`. Jawapan `{"ok":true,...,"db":true}` bermaksud Worker dan D1 bersambung. Jika `db:false`, `database_id` dalam `wrangler.jsonc` belum betul.

### 3. Google Cloud: log masuk
1. https://console.cloud.google.com → cipta projek `Annur Invoice`.
2. **APIs & Services → Library**: aktifkan **Google Sheets API** dan **Google Drive API** (kedua-duanya wajib).
3. **Google Auth Platform / OAuth consent screen**: User type *External*, nama app `Annur Invoice`, e-mel sokongan. Tambah scope `openid`, `.../auth/userinfo.email` dan `.../auth/drive.file`. Biarkan status **Testing**, dan tambah e-mel Google anda dalam **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**. *Authorized JavaScript origins*: tampal alamat Worker dari langkah 2 (tanpa garis condong di hujung). Tiada *redirect URI* diperlukan.
5. Salin **Client ID** (berakhir `.apps.googleusercontent.com`) dan bagi kepada Claude. Jangan bagi *Client secret* (tidak digunakan).

### 4. Letak Client ID dalam kod
`googleClientId` dalam `config.js` **dan** `GOOGLE_CLIENT_ID` dalam `vars` di `wrangler.jsonc` mesti sama. Letakkan dalam `wrangler.jsonc`, bukan hanya dalam dashboard Cloudflare, kerana setiap deploy menimpa pembolehubah dashboard dengan nilai dalam fail. Selepas push, Cloudflare deploy semula dalam lebih kurang 30 saat.

### 5. Uji
1. Buka alamat Worker, tekan **Sambung Google**, pilih akaun test, benarkan akses Drive. Amaran "Google hasn't verified this app" adalah normal dalam mod Testing: **Advanced → Go to Annur Invoice**.
2. Wizard persediaan keluar. Isi nama syarikat, tekan **Seterusnya**: folder `[Nama Syarikat] – Annur Invoice` muncul dalam Google Drive anda bersama Sheet dengan nama sama.
3. Lengkapkan wizard. Skrin Utama menunjukkan **50 kredit (10 dokumen)** dan pill **Tersimpan**.
4. Tetapan → Profil Syarikat dan Dokumen, Penomboran & Cukai boleh disunting dan disimpan; semak Google Sheet (tab `Syarikat`) berubah.

### Masalah biasa
| Gejala | Punca dan penyelesaian |
|--------|------------------------|
| `Error 400: origin_mismatch` | Alamat Worker belum ada dalam *Authorized JavaScript origins*, atau ada garis condong di hujung. |
| `Error 403: access_denied` | E-mel belum ditambah sebagai **Test user**. |
| Butang Sambung Google kelabu, mesej "Client ID belum diisi" | `googleClientId` dalam `config.js` masih kosong (langkah 4). |
| Pill "Ralat storan" | Sheets API atau Drive API belum diaktifkan (langkah 3.2). |
| Skrin Utama kata "Semakan lesen gagal" | `GOOGLE_CLIENT_ID` pada Worker tidak sama dengan `config.js`, atau D1 belum disambung (`/api/ping` tunjuk `db:false`). |
| Deploy gagal pada `database_id` | `ISI_DATABASE_ID_D1` belum diganti. |
| Popup log masuk disekat | Benarkan popup untuk laman ini. |

## Rilis

Setiap kemas kini: naikkan `version` dalam `config.js` dan `CACHE` dalam `sw.js`, kemudian push ke branch yang disambung pada Cloudflare.
