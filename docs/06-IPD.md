# IPD: Annur Invoice

## 1. Overview
Bina dalam repo `annurprosolutions-cell/annurpro-docs` mengikut pola Annur Time Table dan skill `micro-saas-builder`: PWA statik tanpa build, data pengguna dalam Google Sheet/Drive mereka, satu Cloudflare Worker + D1 untuk lesen, penomboran, kredit dan webhook BCL. Susunan kerja: asas dan lesen dahulu, kemudian penyimpanan Sheet, tetapan, enjin dokumen, terbit + PDF, rekod/tukar, bayaran + dashboard pemilik, dan akhir sekali pengukuhan, ujian, halaman jualan, verifikasi Google dan launch. **v1** = percubaan + langganan; **v1.1** = jualan pek kredit (ledger sudah siap dalam v1, jadi v1.1 kecil).

## 2. Goals
"Siap" bermaksud: sistem live di domain sendiri; pengguna baru boleh daftar, buat persediaan, terbit Invois/Quotation/DO, tukar antara dokumen, bayar langganan (dan kredit pada v1.1) secara automatik; pemilik boleh urus pelanggan dalam dashboard; semua ujian lulus; OAuth Google dalam Production; panduan dan halaman jualan diterbitkan. Bukan prototype.

## 3. Prasyarat
| Perkara | Siapa sedia | Catatan |
|---------|-------------|---------|
| Akaun GitHub (org `annurprosolutions-cell`), repo `annurpro-docs` (siap) | Pemilik | Disyorkan private |
| Akaun Cloudflare (Workers & Pages, D1) | Pemilik | 2FA |
| Projek Google Cloud + OAuth consent screen + OAuth Client ID (Web application) | Pemilik, dibimbing langkah demi langkah | Mod Testing dahulu; Production sebelum jual |
| Domain (cth `annurinvoice.com`) + Google Search Console | Pemilik | Diperlukan untuk verifikasi branding |
| Akaun BCL + API token "API Read" | Pemilik | Borang: Langganan Bulanan RM20, Tahunan RM200; medan wajib "E-mel Google untuk sistem" |
| Logo produk (atau guna logo AnnurPro buat sementara) | Pemilik | Logo selepas nama diluluskan Google |
| Kadar SST semasa dan format dokumen wajib | Pemilik (semak Kastam) | Sebelum launch |
| Nombor WhatsApp dan emel sokongan | Pemilik | Sudah ada pada Annur Time Table |
| Dokumen contoh AZN (PDF invois/quotation/DO) sebagai rujukan susun atur | Pemilik | Jangan commit data pelanggan sebenar ke repo |

## 4. Fasa Pelaksanaan
| Fasa | Kerja | Feature | Hasil yang boleh diuji | Anggaran |
|------|-------|---------|------------------------|----------|
| 0 | Setup projek: repo, struktur folder, Cloudflare Worker + D1 (`schema.sql`), OAuth Client (Testing), `config.js`, `wrangler.jsonc`, `.assetsignore`, CI ujian | - | `*.workers.dev` papar halaman kosong; `/api/ping` balas OK; jadual D1 wujud | 0.5 hari |
| 1 | Asas app + log masuk + lesen: shell PWA, GIS sign-in, `/api/check` (cipta akaun, 50 kredit sekali), kad status lesen, cache 7 hari | F-01 (token), F-15 | Log masuk Google berjaya, akaun dicipta, baki 50 kredit; log masuk kedua tidak tambah | 1.5 hari |
| 2 | Ruang kerja Sheet/Drive: `ensureWorkspace()`, lapisan storan (baca ikut nama lajur, tulis berkelompok, debounce, pill status, konflik S-17), cache IndexedDB | F-01, F-14 (asas) | Sheet + folder dicipta dan dijumpai semula pada peranti lain; ubah Sheet dari luar dikesan | 2 hari |
| 3 | Persediaan & Tetapan: wizard S-02, Profil S-08, Dokumen/Penomboran/Cukai S-10, kod cukai | F-02, F-03, F-05 (kod cukai), F-06 (prefix) | Pengguna siap persediaan; tukar nama syarikat, kekal selepas muat semula | 2 hari |
| 4 | Logo, cop, tandatangan: muat naik, buang latar putih, drag/nudge/saiz, DO signatory, reset (S-09) | F-04 | Pratonton sepadan; gambar tersimpan dalam `_Tetapan` | 1.5 hari |
| 5 | Enjin dokumen: kalkulator (diskaun, cukai per kod, pusingan, perkataan) sebagai fungsi tulen + ujian; editor S-04; templat Invois/Quotation/DO; pratonton; draf | F-05, F-07, F-08, F-09, F-13 (autolengkap asas), F-14 | Isi borang dan lihat pratonton betul untuk tiga jenis, jumlah lulus 5 kes ujian | 3 hari |
| 6 | Terbit: `/api/issue` + `/api/void`, penomboran atomik, caj kredit, dialog S-05/S-12, jana PDF, muat naik Drive, kongsi, pendamaian | F-06, F-11, F-17 | Terbit dokumen berjaya; nombor unik dari dua peranti; kredit dipotong sekali; PDF dalam Drive | 3 hari |
| 7 | Rekod & Tukar: S-06 (tapis, cari, edit 24j, batal, salin sebagai draf), Tukar Quotation→Invois, Buat DO, S-07 Pelanggan | F-10, F-12, F-13 | Perjalanan Journey B dan D berfungsi hujung ke hujung | 2.5 hari |
| 8 | Langganan & bayaran: webhook BCL (idempoten + sahih semula), S-11, notis lesen, tempoh ihsan, Dashboard Pemilik S-14 (pelanggan, lesen, kredit, bayaran, log) | F-16, F-19 | Bayaran RM1 ujian mengaktifkan emel; webhook hantar semula tidak tambah dua kali; pemilik lanjutkan lesen dari dashboard | 3 hari |
| 9 | Pengukuhan: PWA luar talian (service worker), had kadar, ujian E2E Playwright, demo `/?demo`, halaman jualan, privasi, panduan + video, S-13; hantar verifikasi OAuth; UAT bersama pengguna sebenar (AZN) | F-14, F-20 | Semua ujian lulus; demo tanpa log masuk; Google Production + branding diluluskan | 4 hari (+ masa tunggu Google) |
| 10 | **Launch v1:** domain, OAuth Production, RM1 ujian sebenar, pantau 48 jam | semua Wajib | Sistem live dan menerima pelanggan | 0.5 hari |
| 11 | **v1.1 Pek kredit:** item BCL RM10/20/50, penambahan kredit melalui webhook, S-11 beli kredit, notis kredit rendah | F-18 | Bayaran RM10 menambah 110 kredit sekali | 1.5 hari |

Anggaran ≈ 24 hari kerja bersih untuk v1 dengan vibe coding (kebanyakan masa pada pengesahan dan QA); termasuk tunggu Google, sasaran kalendar 5–6 minggu.

## 5. Senarai Task Terperinci
Struktur repo yang dicadang: `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, `css/app.css`, `js/{core,calc,words,sheets,workspace,store,ui-*,pdf,license,images}.js`, `worker/index.mjs`, `schema.sql`, `wrangler.jsonc`, `admin/index.html`, `salepage/`, `panduan/`, `privasi.html`, `tests/`, `tools/`.

### Fasa 0 – Setup
- [x] 0.1 Cipta repo, `.gitignore`, `.assetsignore` (kecualikan `tests/`, `tools/`, `worker/`, `docs/`, `schema.sql`), `wrangler.jsonc` dengan `assets.directory="."`, `run_worker_first: ["/api/*","/bcl/*"]`, binding D1 `DB` (TRD §9).
- [x] 0.2 Letak `docs/01-PRD.md` … `06-IPD.md` dalam repo.
- [ ] 0.3 Cipta D1 `annur-invoice` dan jalankan `schema.sql` (BSD §3B); sahkan jadual wujud.
- [x] 0.4 Skrip `npm test` (`node --test tests/*.test.js tests/*.test.mjs`) dan fail `config.js` (client id, `licenseUrl`, harga, sokongan).
- [x] 0.5 Worker `/api/ping`, CORS ikut `ALLOWED_ORIGINS`.

### Fasa 1 – Asas & lesen (F-01, F-15)
- [x] 1.1 Shell app: `index.html`, navigasi bawah/sisi (DBD §5–6), `render()` tunggal dengan penghantaran `data-act`, token CSS DBD §3.
- [x] 1.2 S-01 Log Masuk: GIS `initTokenClient` dipicu klik; simpan `{email, token, exp}` dalam sessionStorage (hilang bila tab ditutup; bukan localStorage).
- [x] 1.3 Worker: sahkan token via tokeninfo (audience, emel verified) → fungsi `authEmail()` digunakan semua endpoint.
- [x] 1.4 `POST /api/check`: cipta `tenants` + `credit_ledger(trial,+50)` dalam satu batch; pulang status (BSD §3B). Ujian unit: akaun baharu, akaun lama, token salah.
- [x] 1.5 Klien: cache jawapan `/check` 7 hari, notis S-03 (percubaan/ihsan/tamat), kad status lesen.

### Fasa 2 – Ruang kerja (F-01, F-14)
- [x] 2.1 `workspace.js`: `ensureWorkspace()` ikut BSD §6 (idempotent), ujian dengan `fake-sheets.js` daripada skill.
- [x] 2.2 `store.js`: baca tab ikut nama lajur, tulis `values.batchUpdate`/`append`, debounce, backoff pada 429, pill status.
- [x] 2.3 S-17: sambung semula token, konflik bila `Meta.dikemaskini` berubah (jangan timpa senyap), tulisan tertangguh.
- [x] 2.4 IndexedDB: draf dan cache tetapan/gambar.

### Fasa 3 – Persediaan & Tetapan (F-02, F-03, F-05, F-06)
- [x] 3.1 S-02 wizard 5 langkah dengan pratonton dokumen contoh (AFD Journey A).
- [x] 3.2 S-08 Profil Syarikat; medan dan validasi mengikut `Syarikat` (BSD §3A).
- [x] 3.3 S-10: prefix (regex), nota, terma, validity, tajuk, `kongsi_awam`, urus `KodCukai` (aktif/kadar).
- [x] 3.4 Pengaktifan automatik kod SST bila `sst_berdaftar` = YA; `sst_no` wajib.

### Fasa 4 – Gambar (F-04)
- [x] 4.1 `images.js`: ubah saiz ≤ 800px, buang latar putih (toleransi boleh laras, potong ke kandungan), simpan PNG ke `_Tetapan`, ganti dan buang fail lama ke tong sampah Drive hanya selepas rujukan baharu disimpan.
- [x] 4.2 S-09: seret/nudge/slider/reset; DO signatory berasingan; kedudukan sama dalam pratonton dan PDF.

### Fasa 5 – Enjin dokumen (F-05, F-07 – F-09, F-13, F-14)
- [x] 5.1 `calc.js` (tulen): `lineAmount`, `taxSummary`, `totals`, pusingan ikut BSD §3A; `words.js` (English). Ujian: tiada cukai, SST 6%, SST 8%, campuran, diskaun, nilai sempadan (0.005), nilai besar.
- [x] 5.2 S-04 editor: segmented jenis, Bill To (combobox), medan ikut jenis (Quotation validity; DO Ship To/PO), jadual item kad/baris, kad jumlah.
- [x] 5.3 Templat HTML dokumen A4 (Invois, Quotation, DO) dengan Carlito, aksen pengguna, cop/tandatangan, berbilang halaman, nota, bank.
- [x] 5.4 Draf tempatan (IndexedDB), senarai draf dalam S-06.
- [x] 5.5 Simpan pelanggan baharu daripada borang.

### Fasa 6 – Terbit (F-06, F-11, F-17)
- [x] 6.1 Worker `POST /api/issue` ikut BSD §3B (idempoten ikut `doc_id`, atomik, regex prefix/tarikh); ujian: dua `issue` serentak, kredit tepat 5, baki 4 ditolak, ulang sama dapat nombor sama tanpa caj, langganan aktif tiada caj.
- [x] 6.2 Klien: alur `issue → append Sheet → jana PDF → muat naik Drive → kemas kini baris (pdf_url, hash)`; status perantaraan pada S-05; cuba semula idempotent.
- [x] 6.3 `pdf.js`: html2canvas+jsPDF disalin ke repo, skala 2, A4 berbilang halaman, ujian visual dengan tangkapan skrin rujukan.
- [x] 6.4 Kongsi: `permissions.create` (jika `kongsi_awam`), butang WhatsApp, salin pautan, muat turun.
- [x] 6.5 `GET /api/issues?since=` + "Pulihkan" bagi nombor tanpa baris Sheet; `POST /api/void`.
- [x] 6.6 S-12 dialog tiada kredit/lesen tamat dengan butang beli (buka BCL tab baharu, `noopener`) dan "Semak semula".

### Fasa 7 – Rekod & Tukar (F-10, F-12, F-13)
- [x] 7.1 S-06: tapis jenis/status/bulan, carian, menu "⋯" ikut status, badge, kunci 24 jam (UI).
- [x] 7.2 Edit dalam 24 jam: kemas kini baris sama dan PDF diganti tanpa caj; selepas itu Batal dengan sebab; Salin sebagai draf.
- [x] 7.3 Tukar Quotation→Invois; Invois/Quotation→DO (bawa Bill To, item, rujukan, PO); kemas kini `status_quotation` dan `ditukar_kepada`.
- [x] 7.4 S-07 Pelanggan: CRUD, arkib, amaran duplikasi.

### Fasa 8 – Bayaran & dashboard pemilik (F-16, F-17, F-19)
- [x] 8.1 `POST /bcl/<key>`: respons 200 segera, kerja dalam `ctx.waitUntil`; ambil semula transaksi BCL, semak status/amaun/order; `payments` idempoten; kesan item (bulanan, tahunan, pek kredit dari v1.1) ikut `PACKS`/nama item/`YEARLY_MIN_AMOUNT`.
- [x] 8.2 Logik pelanjutan: tambat `day`, kuantiti, had 120, ihsan 7 hari (BSD §3B); ujian unit lengkap termasuk 31 Jan + 1 bulan.
- [x] 8.3 S-11 Langganan & Kredit: status, butang beli, sejarah ledger (`/api/ledger`).
- [x] 8.4 `admin/index.html` S-14: cari, tambah/lanjut bulan, laras kredit (dengan sebab), bayaran, log webhook + hantar semula, statistik (pelanggan berbayar, percubaan, hasil 30 hari, dokumen diterbit).
- [x] 8.5 Dashboard dilindungi `OWNER_EMAILS`; ujian akses ditolak.

### Fasa 9 – Pengukuhan (F-14, F-20)
- [x] 9.1 Service worker (precache `./`, jangan cache respons redirect, navigasi fallback), versi cache dinaikkan setiap rilis; banner luar talian.
- [x] 9.2 Had kadar Worker; semak CORS; audit keselamatan (`/security-review`).
- [x] 9.3 E2E Playwright dengan mock Google/Sheets/BCL: Journey A–D; masa tetap; `serviceWorkers:'block'`.
- [x] 9.4 Mod demo `/?demo` (data contoh, tanpa Google, tanpa terbit sebenar).
- [x] 9.5 `salepage/` (tangkapan skrin sebenar, FAQ, harga), `privasi.html` (BSD/TRD §6), `panduan/`, S-13 dan video ringkas. *(Video belum dibuat; tangkapan skrin & PDF panduan siap.)*
- [ ] 9.6 Hantar verifikasi OAuth (nama dahulu, logo kemudian); UAT dengan AZN Power Solution (cipta 10 dokumen sebenar).

### Fasa 10 – Launch
- [ ] 10.1 Domain + Worker, tambah origin pada OAuth client, `ALLOWED_ORIGINS`, `canonicalUrl` jika ada hos lama.
- [ ] 10.2 Tukar OAuth ke Production; ujian RM1 sebenar melalui BCL (item sementara), sahkan `payments` dan lesen.
- [ ] 10.3 Senarai semak launch skill `micro-saas-builder` §5 selesai; pantau webhook 48 jam.

### Fasa 11 – v1.1 Pek kredit (F-18)
- [ ] 11.1 Item BCL RM10/RM20/RM50; `PACKS` var; tambah kredit melalui webhook (ledger `pack`, `ref=order_no`).
- [ ] 11.2 S-11 butang beli pek, S-12 cadangan pek, notis kredit < 10, kemas kini panduan dan halaman jualan.

## 6. Pelan Testing
| Ujian | Cara | Lulus bila |
|-------|------|-----------|
| Unit kalkulator | `node --test tests/calc.test.js` | 5 kes cukai/diskaun/perkataan tepat dua tempat perpuluhan |
| Penomboran serentak | Test Worker dengan D1 mock/`miniflare`: 20 `issue` selari | 20 nombor unik, berturutan, jumlah caj tepat |
| Idempotensi | Hantar `issue` sama 3 kali | 1 nombor, 1 caj |
| Kredit tak cukup | Akaun 4 kredit tanpa langganan | 403 `tiada-kredit`, tiada rekod baharu |
| Trial sekali | `/check` dua kali dan token berbeza emel sama | 50 kredit sekali sahaja |
| Webhook BCL | Badan rakaman + `fetch` palsu; hantar dua kali | Lesen/kredit ditambah sekali; badan palsu ditolak bila API tak sepadan |
| Akses tanpa kebenaran | `/api/admin/*` dengan emel bukan pemilik; `/api/ledger` emel lain | 403 / hanya data sendiri |
| Tarikh langganan | 31 Jan + 1 bulan, kuantiti 3, ihsan | Tarikh betul, pembaharuan kembali ke hari 31 |
| E2E Journey A–D | Playwright, Google/Sheets/BCL dimock | Semua langkah AFD lulus |
| PDF | Bandingkan tangkapan skrin rujukan untuk 3 jenis, 1 dan 3 halaman | Tiada teks terpotong, cop/tandatangan pada kedudukan sama |
| Konflik Sheet | Ubah `Meta.dikemaskini` dari luar | S-17 dipaparkan, tiada timpaan senyap |
| Luar talian | Mod pesawat | App terbuka, draf boleh dibuat, Terbit paparkan mesej |
| Mobile | iPhone Safari (PWA dipasang) dan Android Chrome | Tiada skrol mendatar, butang ≥ 44px, bar Terbit tidak ditutup kekunci |
| Data besar | 500 dokumen dalam Sheet | Rekod buka < 3 saat, carian pantas |
| Keselamatan | Cuba SQL/HTML dalam medan, `prefix` jahat, token audience salah | Ditolak / dienkod |

## 7. Deployment
Langkah ringkas untuk pemilik (bukan orang IT). Claude akan beri arahan klik demi klik semasa Fasa 0, 8 dan 10.
1. **GitHub:** repo `annurpro-docs` dalam org `annurprosolutions-cell` (sudah dicipta).
2. **Cloudflare:** Workers & Pages → Create → import repo → arahan build kosong, deploy `npx wrangler deploy`.
3. **D1:** Storage & Databases → D1 → Create `annur-invoice` → Console → tampal isi `schema.sql` → Run.
4. **Pembolehubah & rahsia:** Worker → Settings → Variables: isi var dalam TRD §9; tambah *secrets* `BCL_API_TOKEN`, `BCL_WEBHOOK_KEY` (jana dengan `openssl rand -hex 24`), `ADMIN_TOKEN`. **Jangan tampal rahsia dalam chat.**
5. **Google Cloud:** Credentials → OAuth client (Web) → Authorized JavaScript origins = alamat `*.workers.dev` dan domain; salin Client ID ke `config.js` dan var `GOOGLE_CLIENT_ID`. Consent screen: Testing → tambah test users; Production sebelum jual.
6. **BCL:** cipta borang "Annur Invoice" dengan item Bulanan RM20 dan Tahunan RM200 (kuantiti dibenarkan), medan wajib "E-mel Google untuk sistem", webhook = `https://<domain>/bcl/<BCL_WEBHOOK_KEY>`, acara Payment Success.
7. **Domain:** Worker → Custom domains → tambah domain (dan www).
8. Setiap kemas kini: `git push` ke `main`; Cloudflare deploy ~30 saat; naikkan `version` dalam `config.js` dan nama cache `sw.js`.

## 8. Milestone
Sasaran tentatif bermula 04/11/2026; tarikh diselaraskan dengan masa kelulusan Google.
| Milestone | Tarikh sasaran | Pemilik | Status |
|-----------|----------------|---------|--------|
| M0 Prasyarat siap (akaun, OAuth Testing, repo, D1) | 06/11/2026 | Pemilik + Claude | Belum |
| M1 Fasa 1–2: log masuk, lesen, Sheet berfungsi | 12/11/2026 | Claude | Belum |
| M2 Fasa 3–5: tetapan, gambar, editor + pratonton | 20/11/2026 | Claude | Belum |
| M3 Fasa 6–7: terbit, PDF, rekod, tukar (alpha dengan AZN) | 28/11/2026 | Claude + AZN | Belum |
| M4 Fasa 8: bayaran BCL + dashboard pemilik (beta) | 04/12/2026 | Claude | Belum |
| M5 Fasa 9: pengukuhan, jualan, privasi, hantar verifikasi Google | 10/12/2026 | Claude + Pemilik | Belum |
| M6 Launch v1 (OAuth Production) | 20/12/2026 (bergantung Google) | Pemilik | Belum |
| M7 v1.1 Pek kredit | 30/12/2026 | Claude | Belum |

## 9. Serahan & Revisi
- **Serahan:** repo, akaun Cloudflare/Google/BCL dimiliki AnnurPro; manual pemilik (peribadi, tidak dalam repo awam), manual pengguna `/panduan/` (HTML + PDF), video ringkas, senarai rahsia dalam pengurus kata laluan.
- **Latihan:** satu sesi 1 jam untuk dashboard pemilik, operasi mingguan (padan bayaran BCL dengan lesen, hantar semula webhook gagal, pantau percubaan hampir tamat), dan pembaharuan tahunan (token BCL, domain, rahsia).
- **Revisi:** dua pusingan revisi UI selepas alpha (M3) dan selepas beta (M4) termasuk. Perubahan skop (feature baharu) rujuk jadual "Ditangguh" PRD §5 (F-21 hingga F-28) dan dikuotkan berasingan; setiap perubahan dicatat dalam Changelog PRD.

## 10. Risiko
| Risiko | Kesan | Mitigasi |
|--------|-------|----------|
| Verifikasi branding OAuth Google lambat | Tidak boleh jual awam (had 100 test users) | Hantar nama dan halaman privasi awal (Fasa 9 atau lebih awal), logo selepas lulus; launch beta kepada test users dahulu |
| Pengguna enggan guna internet untuk terbit | Aduan | Draf luar talian; komunikasi jelas; pertimbangkan nombor sementara pada versi 2 |
| Pengguna memintas caj kredit (PDF jana di browser) | Hasil hilang kecil | Penguatkuasaan pada pengeluaran nombor; langganan menggalakkan pengguna aktif; diterima |
| Kadar/format SST silap | Dokumen tidak mematuhi | Kod cukai boleh disunting; sahkan dengan Kastam sebelum launch; nyatakan pengguna bertanggungjawab ke atas ketepatan cukai |
| Kuota Sheets API / Cloudflare / D1 | Ralat 429 atau hentian | Debounce, batch, backoff; pantau; naik plan bila perlu |
| Webhook BCL gagal (tidak dicuba semula) | Pelanggan bayar tidak aktif | Dashboard "perlu tindakan", hantar semula; idempoten; semak mingguan |
| Pengguna padam/ubah Sheet sendiri | Data hilang atau rosak | Baca ikut nama lajur, amaran S-17, Pulihkan nombor, panduan sandaran; versi Sheet Google |
| Pautan PDF awam | Dokumen dilihat penerima pautan | Pilihan `kongsi_awam`, dinyatakan dalam panduan dan privasi |
| Staf perlukan akses kongsi | Permintaan awal | F-21 selepas prototaip Google Picker; model Sheet tiada kawalan peranan data |
| Skop merebak (PO, e-Invois, bayaran) | Lewat | Disenaraikan sebagai Ditangguh, kuot berasingan |

## Arahan penutup untuk AI coding tool
> Baca `docs/01-PRD.md` hingga `docs/06-IPD.md`, dan gunakan skill `micro-saas-builder`. Bina sistem mengikut IPD, mulakan dengan Fasa 0. Selepas setiap fasa, berhenti, ringkaskan apa yang siap dan cara untuk test, dan tunggu saya sahkan sebelum sambung fasa seterusnya. Jangan ubah skop atau skema tanpa tanya. Jangan minta saya tampal rahsia dalam chat; beritahu di mana saya perlu letak.
