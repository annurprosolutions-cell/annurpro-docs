# PRD: Annur Invoice (nama sementara)
Tarikh: 03/11/2026 | Versi: 1.0 | Pemilik: AnnurPro Solutions

## 1. Overview
Annur Invoice ialah web app (PWA) berlangganan untuk perniagaan Malaysia, kecil hingga besar, yang mahu menjana **Invois, Quotation dan Delivery Order (DO)** berjenama sendiri dalam beberapa minit. Pengguna log masuk dengan Google, tetapkan maklumat syarikat, logo, cop dan tandatangan sekali sahaja, kemudian isi borang dan dapat PDF kemas yang disimpan dalam Google Drive mereka. Semua data dokumen disimpan dalam Google Sheet milik pengguna sendiri; AnnurPro hanya simpan akaun, lesen dan baki kredit. Bayaran ikut model hybrid: percubaan percuma, langganan RM20 sebulan, dan pek kredit.

Sistem ini dibina berdasarkan seni bina Annur Time Table (rujuk skill `micro-saas-builder`), bukan menyambung kod AZN Invoice lama.

## 2. Masalah Semasa
- Ramai SME buat invois dalam Word/Excel: nombor dokumen bertindih atau terlangkau, format tak seragam, cop dan tandatangan ditampal manual setiap kali.
- Quotation, invois dan DO ditaip semula untuk transaksi yang sama (kesilapan salin dan masa terbuang).
- Software akaunting sedia ada terlalu berat atau mahal untuk perniagaan yang cuma perlukan dokumen yang kemas.
- Rujukan sebenar: AZN Power Solution (repo `azndraft`) sudah guna tool dalaman Apps Script + Sheets untuk tiga dokumen ini. Ia berfungsi untuk satu syarikat tetapi tak boleh dijual: satu syarikat sahaja, API key dalam frontend, PIN admin lemah, tiada lesen.

## 3. Product Goal
1. Pengguna baru siap persediaan (syarikat, logo, cop, tandatangan) dan terbit dokumen pertama dalam **10 minit**.
2. Terbit satu dokumen daripada borang kosong dalam **kurang 2 minit**; tukar Quotation ke Invois atau DO dalam **kurang 30 saat**.
3. Tiada nombor dokumen bertindih walaupun digunakan di lebih satu peranti.
4. Kos operasi platform hampir **RM0** bagi setiap pengguna tambahan (data dalam Drive pengguna).
5. Bayaran dan pengaktifan lesen **automatik** (tanpa kerja manual pemilik) dalam seminit selepas bayaran.

## 4. Pengguna & Role
| ID | Role | Siapa | Apa yang mereka perlu buat |
|----|------|-------|----------------------------|
| R-01 | Pemilik Akaun (Admin Syarikat) | Pemilik/pengurus perniagaan yang log masuk dengan Google | Persediaan syarikat, logo/cop/tandatangan, cipta dan terbit dokumen, urus pelanggan, beli langganan/kredit |
| R-02 | Staf Syarikat | Kerani/staf yang dikongsi akses | Cipta dan terbit dokumen sahaja, tiada akses Tetapan dan bayaran. **Ditangguh ke versi 2** (lihat seksyen 6) |
| R-03 | Pentadbir Platform | Pemilik AnnurPro Solutions | Lihat pelanggan, tambah/lanjut lesen, beri kredit sokongan, semak bayaran dan webhook |
| R-04 | Penerima Dokumen | Pelanggan/klien kepada R-01 | Terima PDF melalui WhatsApp/emel/pautan. **Tiada login, tiada akses ke sistem** |

## 5. Features
| ID | Feature | Penerangan | Role | Keutamaan | Hasil yang dijangka |
|----|---------|-----------|------|-----------|--------------------|
| F-01 | Log masuk Google & ruang kerja | Sambung Google (scope `drive.file`), sistem cipta Sheet "Annur Invoice – [Syarikat]" dan folder Drive secara automatik; sambung semula bila token tamat | R-01 | Wajib | Pengguna ada Sheet dan folder sendiri tanpa setup manual |
| F-02 | Persediaan pertama (wizard) | Langkah: syarikat, kod syarikat/prefix, logo, cop, tandatangan, bank, SST | R-01 | Wajib | Akaun sedia untuk terbit dokumen |
| F-03 | Profil syarikat & tetapan admin | Nama, no. SSM, TIN/BRN (pilihan), alamat, emel, telefon, laman web, akaun bank, penandatangan, nota default setiap jenis dokumen, terma default, warna aksen, tajuk dokumen | R-01 | Wajib | Semua dokumen guna maklumat terkini tanpa sentuh kod |
| F-04 | Logo, cop & tandatangan | Muat naik gambar, buang latar putih, drag/nudge/saiz kedudukan cop dan tandatangan dengan pratonton, tandatangan DO berasingan, butang reset | R-01 | Wajib | Cop bertindih tandatangan dengan cantik seperti dalam dokumen sebenar |
| F-05 | Cukai SST & pengiraan | Kod cukai boleh ubah (kadar, nama), cukai per baris item, diskaun per baris, jumlah kecil, jumlah cukai ikut kod, jumlah akhir, jumlah dalam perkataan | R-01 | Wajib | Jumlah betul dan konsisten pada pratonton, PDF dan Sheet |
| F-06 | Penomboran dokumen berserial | Nombor `PREFIX/MMYY-NNN` dikeluarkan oleh server, berasingan bagi setiap jenis dan bulan, unik walaupun berbilang peranti | R-01 | Wajib | Tiada nombor bertindih atau hilang |
| F-07 | Invois | Borang + pratonton + PDF: Bill To, Attn, Our Ref, Your Ref/PO No, Terma, item, cukai, bank, nota, cop/tandatangan | R-01 | Wajib | Invois siap terbit |
| F-08 | Quotation | Sama seperti invois + tempoh sah (validity) + nota quotation, status Menunggu/Ditukar | R-01 | Wajib | Quotation siap terbit |
| F-09 | Delivery Order | Tanpa harga, Ship To berasingan ("sama dengan Bill To"), PO No, Ref No, ruang Received By | R-01 | Wajib | DO siap terbit |
| F-10 | Tukar dokumen | Quotation → Invois, Invois/Quotation → DO, data dan item diisi automatik, rujukan kedua-dua hala direkod | R-01 | Wajib | Tak perlu taip semula |
| F-11 | PDF, Drive & kongsi | Jana PDF A4 di peranti, simpan ke folder Drive, pautan boleh dikongsi, butang WhatsApp, salin pautan, muat turun | R-01, R-04 | Wajib | R-04 terima PDF yang boleh dibuka |
| F-12 | Rekod dokumen | Senarai semua dokumen: tapis ikut jenis/status/bulan, carian, buka PDF, buka semula untuk edit dalam 24 jam, **batal (void)** selepas itu | R-01 | Wajib | Semua dokumen boleh dijejak dan dibatalkan tanpa padam nombor |
| F-13 | Pelanggan | Simpan pelanggan (nama, alamat, telefon, attn, TIN/BRN pilihan), autolengkap dalam borang, simpan pelanggan baru daripada borang | R-01 | Penting | Isi Bill To dengan satu klik |
| F-14 | Draf & luar talian | Draf disimpan di peranti (IndexedDB) tanpa nombor; app dibuka tanpa internet; **terbit** memerlukan internet | R-01 | Penting | Kerja tak hilang bila talian putus |
| F-15 | Percubaan percuma & semakan lesen | Akaun baru dapat 50 kredit percuma (= 10 dokumen), sekali bagi setiap akaun Google; semakan kelayakan setiap kali log masuk dengan cache 7 hari | R-01 | Wajib | Pengguna boleh cuba tanpa bayar |
| F-16 | Langganan | Bulanan RM20 / Tahunan RM200 melalui borang BCL; lesen aktif automatik melalui webhook; tempoh ihsan 7 hari | R-01 | Wajib | Terbit dokumen tanpa had (fair use) semasa lesen aktif |
| F-17 | Ledger kredit & potongan | 1 dokumen diterbit = 5 kredit (semua jenis); tidak dipotong bila langganan aktif; baki tidak luput; sejarah transaksi kredit | R-01 | Wajib | Baki tepat, tiada potongan berganda |
| F-18 | Pek kredit | Beli kredit melalui BCL (RM1 = 10 kredit + bonus), baki masuk automatik. **Dilancar dalam v1.1** | R-01 | Penting | Pengguna kecil bayar ikut guna |
| F-19 | Dashboard Pentadbir Platform | Senarai pelanggan, status lesen, tambah/lanjut lesen, laras kredit, bayaran, log webhook, statistik asas | R-03 | Penting | Pemilik urus pelanggan tanpa console |
| F-20 | Halaman jualan, demo, privasi & panduan | `/salepage/`, mod demo `/?demo` tanpa log masuk, halaman privasi, panduan ringkas, sokongan WhatsApp/emel | R-01 (prospek) | Wajib | Memenuhi syarat verifikasi OAuth Google dan sedia dijual |

### Ditangguh (bukan sebahagian daripada delivery asal; boleh dikuotkan berasingan)
| ID | Feature | Catatan |
|----|---------|---------|
| F-21 | Staf berkongsi (R-02) | Perlu pengesahan Google Picker dengan `drive.file`; reka bentuk data sedia ada |
| F-22 | Purchase Order (PO) yang dikeluarkan kepada supplier | Jenis dokumen keempat; medan `jenis` direka boleh dilanjutkan |
| F-23 | e-Invois MyInvois (LHDN) | Menunggu cadangan pemilik; medan TIN/BRN sudah disimpan |
| F-24 | Penjejakan bayaran invois (dibayar/separa/lewat) | Di luar fokus "jana dokumen" |
| F-25 | Katalog item tersimpan | |
| F-26 | PIN kunci Tetapan | |
| F-27 | Jumlah dalam perkataan Bahasa Malaysia | v1 hanya English |
| F-28 | Dokumen berulang (recurring) | |

## 6. Di Luar Skop
- Akaunting, lejar, bayaran masuk, laporan cukai, inventori.
- PO, e-Invois, penjejakan bayaran, staf berkongsi (rujuk jadual "Ditangguh").
- Penghantaran emel automatik dari sistem (pengguna kongsi pautan/WhatsApp sendiri).
- Aplikasi mudah alih native (PWA sahaja).
- Berbilang syarikat dalam satu akaun Google (1 akaun Google = 1 syarikat dalam v1).
- Penyimpanan data dokumen pada server AnnurPro.

## 7. Kriteria Penerimaan
| Feature | Dianggap siap bila... |
|---------|-----------------------|
| F-01 | Pengguna baru tekan "Sambung Google", Sheet dan folder wujud, log masuk semula selepas token tamat tanpa kehilangan data |
| F-02 | Wizard selesai dengan logo/cop/tandatangan, dan pratonton dokumen contoh menunjukkan semuanya |
| F-03 | Ubah nama syarikat dan bank, dokumen baharu terus guna nilai baru pada semua peranti selepas muat semula |
| F-04 | Cop dan tandatangan boleh diseret dengan jari dan tetikus, diset kedudukan/saiz, dan kedudukan sama dalam PDF seperti pratonton |
| F-05 | 5 kes ujian pengiraan (tanpa cukai, SST 6%, SST 8%, campuran kod, diskaun) memberi jumlah betul 2 tempat perpuluhan dan perkataan betul |
| F-06 | Dua peranti terbit serentak 20 dokumen: semua nombor unik dan berturutan, tiada duplikasi |
| F-07 – F-09 | Setiap jenis dijana ke PDF A4 satu atau berbilang halaman dengan tajuk, jadual, jumlah (tiada harga untuk DO), nota dan cop/tandatangan betul |
| F-10 | Tukar Quotation ke Invois: semua item dan Bill To terisi, status quotation jadi "Ditukar" dengan nombor invois |
| F-11 | PDF muncul dalam folder Drive yang betul, pautan dibuka oleh orang tanpa akaun, butang WhatsApp membuka mesej berisi pautan |
| F-12 | Dokumen yang terbit boleh diedit dalam 24 jam tanpa potongan kredit baharu; selepas itu hanya boleh dibatalkan; nombor batal tidak digunakan semula |
| F-13 | Pilih pelanggan dari senarai mengisi Bill To, alamat, telefon dan Attn |
| F-14 | Mod pesawat: app dibuka, draf boleh dicipta dan disimpan, butang Terbit memaparkan mesej perlu internet |
| F-15 | Akaun baru dapat 50 kredit sekali; log masuk kali kedua tidak beri lagi |
| F-16 | Bayaran RM1 ujian melalui BCL mengaktifkan emel yang betul dalam 1 minit; webhook dihantar semula tidak menambah masa dua kali |
| F-17 | Terbit dokumen ke-11 semasa tanpa langganan ditolak dengan paparan beli; potongan 5 kredit berlaku sekali walaupun permintaan diulang |
| F-18 | Bayaran RM10 menambah 110 kredit sekali |
| F-19 | Pemilik boleh cari emel, tambah 1 bulan, laras kredit dan lihat bayaran tanpa console |
| F-20 | Demo boleh dicuba tanpa log masuk; halaman privasi menyatakan penggunaan data Google; OAuth verification boleh dihantar |

## 8. Andaian
1. **Nama produk sementara "Annur Invoice"**, domain `annurinvoice.com` belum disahkan wujud.
2. Konsep PO dalam permintaan asal digugurkan daripada v1 kerana arahan terkini "fokus invois, quotation dan DO". Medan "Your Ref / PO No" kekal pada ketiga-tiga dokumen.
3. SST dikekalkan dari awal (daripada keputusan terdahulu) sebagai kod cukai yang boleh disunting. Kadar default (jualan 5%/10%, perkhidmatan 6%/8%) **perlu disahkan dengan Kastam sebelum launch**.
4. Satu akaun Google = satu syarikat. Staf berkongsi ditangguh.
5. Harga: langganan RM20/bulan, RM200/tahun; kredit RM1 = 10 kredit; pek RM10 = 110, RM20 = 230, RM50 = 600 kredit (bonus ialah cadangan); minimum beli RM10; 5 kredit setiap dokumen; kredit tidak luput (keputusan pemilik).
6. Percubaan = 50 kredit percuma sekali bagi setiap akaun Google, tidak luput (bukan 14 hari).
7. Langganan "tanpa had" tertakluk fair use 500 dokumen sebulan (nilai cadangan).
8. Terbit dokumen perlu internet kerana nombor dikeluarkan oleh server.
9. Dokumen boleh diedit 24 jam selepas terbit tanpa kredit baharu; selepas itu dikunci dan hanya boleh dibatalkan (void tidak dikembalikan kredit).
10. Tajuk dokumen default "INVOICE"; pilihan "TAX INVOICE" disediakan, keperluan sebenar bagi syarikat berdaftar SST perlu disahkan.
11. Bahasa antara muka Bahasa Malaysia; kandungan dokumen English default (seperti dokumen AZN), boleh disunting pengguna.
12. Aset jenama AnnurPro (logo) diguna semula daripada repo ruztimetable.

## 9. Soalan Terbuka
1. Nama produk dan domain akhir?
2. Adakah pengguna perlu boleh terbit tanpa internet pada versi akan datang (nombor sementara)?
3. Had fair use sebenar untuk langganan?
4. Adakah AZN Power Solution mahu data lama (Invoices/Quotations/DO) diimport ke akaun baharu? (Dinyatakan "mula dari kosong", jadi tidak dirancang.)
5. Tajuk "Tax Invoice" dan format wajib SST bagi syarikat berdaftar: perlu disemak.

## 10. Changelog
| Tarikh | Perubahan |
|--------|-----------|
| 03/11/2026 | Versi 1.0 dicipta |
| 03/11/2026 | Dokumen dipindah ke repo `annurpro-docs`; pembinaan Fasa 0 dan Fasa 1 dimulakan |
