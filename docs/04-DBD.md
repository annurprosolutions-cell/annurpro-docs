# DBD: Annur Docs

## 1. Overview
Bersih, tenang, profesional dan laju pada telefon. Antara muka app berwarna biru laut AnnurPro dengan aksen merah kecil; **dokumen yang dijana pula neutral dan berjenama pengguna** (logo, warna aksen pilihan pengguna). Prinsip: borang ringkas, jumlah sentiasa kelihatan, pratonton dokumen sentiasa dekat, butang utama satu sahaja pada satu skrin. Telefon diutamakan (pengguna sering di lapangan atau di kaunter), desktop sebagai lajur dua (borang | pratonton).

## 2. Brand Identity
- **Produk:** Annur Docs (nama sementara). **Vendor:** AnnurPro Solutions (guna semula `brand/annurpro-logo.png` dan ikon dari repo ruztimetable).
- **Nada:** mesra tetapi formal, ayat pendek, Bahasa Malaysia santai-profesional dengan istilah teknikal English (Invoice, Quotation, Delivery Order, PDF, draf dikekalkan).
- **Pengguna & konteks:** pemilik/pengurus SME, kontraktor, peniaga; telefon di tapak atau kaunter, laptop di pejabat; ramai bukan orang IT, jadi label jelas dan tiada jargon.
- **Pengguna mengatur jenama dokumen sendiri:** logo, cop, tandatangan, warna aksen (hex). Jenama AnnurPro tidak muncul pada dokumen pengguna.

## 3. Color Palette
### App (UI)
| Peranan | Nama | Hex | Guna untuk |
|---------|------|-----|-----------|
| Primary | Biru AnnurPro | `#1e3a8a` | butang utama, pautan aktif, tab terpilih |
| Primary hover | Biru terang | `#2747a6` | hover/fokus butang utama |
| Navy | Navy | `#0b1d4d` | header, bar navigasi, kad status lesen |
| Accent | Merah AnnurPro | `#c62828` | penanda kecil, notis kritikal (guna jimat) |
| Background | Kelabu kebiruan | `#edf0f5` | latar halaman |
| Surface | Putih | `#ffffff` | kad, jadual, borang |
| Line | Garis | `#e4e8ef` | pemisah, sempadan input |
| Text | Dakwat | `#0f172a` | teks utama |
| Text sekunder | Slate | `#64748b` | label, bantuan |
| Success | Hijau | `#2e7d32` on `#e6f4e7` | status Terbit, baki mencukupi |
| Warning | Ambar | `#8a5a00` on `#fff2d9` | percubaan hampir tamat, kredit rendah, ihsan |
| Danger | Merah | `#c62828` on `#fdeceb` | Batal, tamat lesen, ralat |
| Info | Biru muda | `#1e3a8a` on `#e7edfb` | tip, nota |

Pasangan teks/latar di atas dipilih untuk kontras sekurang-kurangnya 4.5:1; semak dengan alat kontras semasa membina (terutama Warning dan Text sekunder pada Background).

### Dokumen (PDF)
| Peranan | Nilai | Catatan |
|---------|-------|---------|
| Teks | `#111827` | hitam lembut |
| Garis jadual | `#d1d5db` | |
| Header jadual | latar = **warna aksen pengguna**, teks putih (auto hitam jika aksen terlalu cerah) | default `#0f172a` |
| Jumlah akhir | kotak berbingkai warna aksen | |
| Status Batal | cap "BATAL / VOID" merah 30% di tengah muka surat | hanya pada pratonton rekod, bukan PDF asal |

## 4. Typography
| Guna | Font | Saiz / berat |
|------|------|--------------|
| UI | Inter, "Segoe UI", system-ui, Roboto, sans-serif (system font, tiada muat turun) | body 15px/1.5; H1 24px 600; H2 18px 600; label 13px 600; caption 12px |
| Nombor kewangan (UI) | sama, `font-variant-numeric: tabular-nums` | jumlah akhir 28px 700 |
| Dokumen PDF | **Carlito** (self-host woff2, 400 dan 700) | body 11px; tajuk dokumen 24px 700 huruf besar; jadual 10.5px |

Tiada Google Fonts pada runtime supaya laju, offline dan tiada kebergantungan luar.

## 5. Spacing & Layout
- **Skala jarak:** 4, 8, 12, 16, 24, 32 px. Jejari sudut kad 18px, input/butang 12px.
- **Lebar:** kandungan maksimum 1200px; editor 2 lajur pada ≥ 1024px (borang 560px | pratonton fleksibel, melekat atas).
- **Breakpoint:** telefon < 640px; tablet 640–1023px; desktop ≥ 1024px.
- **Telefon:** bar navigasi bawah (Utama, +, Rekod, Pelanggan, Tetapan); S-04 guna tab **Borang | Pratonton** dan bar bawah tetap berisi Jumlah + butang **Terbit** (bawah selamat untuk iPhone: `env(safe-area-inset-bottom)`).
- **Sasaran sentuh:** minimum 44×44px.
- **Halaman dokumen:** A4 210×297 mm, jidar 14 mm, pratonton dipaparkan skala-ke-lebar dengan `transform: scale`.

## 6. UI Components
| Komponen | Spesifikasi |
|----------|-------------|
| Butang primary | Latar `#1e3a8a`, teks putih, tinggi 44px, jejari 12px; hover `#2747a6`; disabled 45% opacity; loading dengan pemintal dan teks "Menjana PDF..." |
| Butang secondary | Putih, sempadan `#e4e8ef`, teks dakwat |
| Butang danger | Latar `#c62828`, hanya untuk Batal dokumen dengan dialog pengesahan |
| Butang ghost | Teks biru tanpa sempadan (Kosongkan, Reset) |
| Input & textarea | Tinggi 44px, sempadan `#e4e8ef`, fokus cincin biru 3px; label di atas 13px 600; ralat: sempadan merah + teks ralat 12px di bawah; medan huruf besar automatik untuk Bill To/alamat (kelas `uppercase-input`) |
| Combobox pelanggan | Taip untuk cari, senarai dropdown 6 baris, pilihan "+ Pelanggan baharu" |
| Jadual item (editor) | Telefon: setiap item ialah kad (Penerangan, Qty, Unit, Harga, Diskaun, Cukai, Jumlah baris); desktop: baris jadual. Butang "+ Tambah Item", ikon buang, susun semula dengan butang naik/turun |
| Kad jumlah | Latar navy, teks putih: Jumlah Kecil, Diskaun, Cukai ikut kod, **Jumlah Keseluruhan** besar, perkataan kecil di bawah |
| Jadual rekod | Lajur: No, Tarikh, Pelanggan, Jumlah, Status; baris boleh diklik; menu tindakan "⋯" (Buka PDF, Edit, Tukar, Buat DO, Batal, Salin sebagai draf) |
| Badge status | `Draf` kelabu; `Terbit` hijau; `Dikunci` biru; `Batal` merah; Quotation: `Menunggu` ambar, `Ditukar` hijau |
| Segmented control | Jenis dokumen: Invois / Quotation / DO (S-04), Hanya boleh tukar semasa draf |
| Modal / helaian bawah | Telefon: helaian dari bawah; desktop: modal tengah 480px; latar `rgba(15,23,42,.6)` |
| Toast | Bawah tengah, 3 saat, hijau/merah |
| Pill status Sheet | Tersimpan (hijau), Menyimpan (biru berdenyut), Sambung semula (ambar, boleh ditekan), Konflik (merah), Tiada kelayakan (ambar) |
| Kad status lesen (S-03) | Navy; tiga keadaan: Percubaan (baki kredit), Langganan (tarikh tamat), Kredit (baki) dengan butang tindakan |
| Editor kedudukan cop/tandatangan | Pratonton ruang tandatangan, item boleh diseret, item dipilih naik ke atas, butang ↑↓←→ dan slider saiz, butang Reset |
| Navigasi | Bar bawah 5 ikon pada telefon (butang tengah "+" bulat biru); sisi 240px pada desktop |

## 7. Ikon & Imej
- Set ikon SVG satu garis (stroke 1.75px), disimpan sebagai fail `icons.js` (gaya sama dengan Annur Time Table).
- Imej pengguna (logo/cop/tandatangan) disimpan PNG telus; maksimum 5 MB sebelum diubah saiz kepada ≤ 800px sisi panjang.
- Ilustrasi kosong (empty state): ikon besar kelabu + satu ayat + satu butang. Tiada gambar stok.
- Tangkapan skrin sebenar untuk halaman jualan dan manual (dijana oleh skrip Playwright, bukan dibuat tangan).

## 8. Rujukan
- **AZN Invoice** (repo `azndraft`): susun atur dokumen (header logo + syarikat, tajuk, blok Bill To/Attn/Ref, jadual item, jumlah dengan perkataan, nota, bank, kawasan cop & tandatangan), editor kedudukan cop/tandatangan, konsep "Tukar jadi Invoice" dan "Buat DO", `Received By` pada DO.
- **Annur Time Table** (repo `ruztimetable`): token warna dan komponen UI (`css/app.css`), pill status Sheet, notis lesen, dashboard pemilik, halaman jualan dan manual.
- **Rujukan baharu daripada pemilik:** belum ada. Cadangan palette di atas ialah cadangan dan boleh diubah.
