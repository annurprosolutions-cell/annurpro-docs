# Fasa 10: Lancar Annur Docs di docs.annurpro.com

Ikut bahagian A hingga H mengikut urutan. Bahagian bertanda **Claude** dibuat oleh Claude dalam repo; yang lain dibuat oleh pemilik.

Nilai tetap:

| Perkara | Nilai |
|---|---|
| Domain app | `https://docs.annurpro.com` |
| Worker Cloudflare | `annur-invoice` (nama dalaman, jangan tukar) |
| Client ID Google | `933747272196-5ub5jst04ff6e3b21ou8muouvvlmfgae.apps.googleusercontent.com` |
| E-mel sokongan & pemilik | `annurprosolutions@gmail.com` |
| Halaman utama (untuk Google) | `https://docs.annurpro.com/salepage/` |
| Dasar privasi | `https://docs.annurpro.com/privasi.html` |

## A. Sambung domain ke Worker

| # | Di mana | Buat apa | Semak |
|---|---|---|---|
| A1 | Cloudflare → Workers & Pages → `annur-invoice` → Settings → Domains & Routes | **+ Add** → **Custom domain** → taip `docs.annurpro.com` → Add domain | Status jadi *Active* (biasanya 1 hingga 5 minit) |
| A2 | Browser | Buka `https://docs.annurpro.com/` | Skrin log masuk Annur Docs keluar |
| A3 | Browser | Buka `https://docs.annurpro.com/api/ping` | Keluar JSON dengan `"ok":true` |

## B. Benarkan log masuk Google dari domain baharu

| # | Di mana | Buat apa | Semak |
|---|---|---|---|
| B1 | console.cloud.google.com → pilih projek → Google Auth Platform (atau APIs & Services) → **Clients / Credentials** → klik Client ID di atas | Bawah *Authorized JavaScript origins* → **+ Add URI** → `https://docs.annurpro.com` → **Save**. Jangan buang origin `workers.dev` lagi | Tersimpan |
| B2 | `https://docs.annurpro.com/` | Tunggu 5 minit (kadang-kadang lebih), kemudian log masuk Google | Masuk skrin Utama. Jika `origin_mismatch`, tunggu lagi |

## C. Sahkan pemilikan domain (Search Console)

Guna akaun Google yang sama dengan pemilik projek Google Cloud.

| # | Di mana | Buat apa | Semak |
|---|---|---|---|
| C1 | search.google.com/search-console | **Add property** → pilih **Domain** → `annurpro.com` → Continue | Google beri rekod TXT `google-site-verification=...` |
| C2 | Cloudflare → `annurpro.com` → DNS → Records | **Add record** → Type `TXT`, Name `@`, Content: tampal rekod tadi → Save. (Jika Search Console tawar butang sahkan automatik dengan Cloudflare, boleh guna itu) | Rekod tersenarai |
| C3 | Search Console | Tekan **Verify** | *Ownership verified* (kadang-kadang perlu tunggu beberapa minit) |

## D. Branding OAuth

Google Cloud → Google Auth Platform → **Branding**.

| Medan | Isi |
|---|---|
| App name | `Annur Docs` |
| User support email | `annurprosolutions@gmail.com` |
| App logo | Langkau dahulu (logo memerlukan semakan Google yang lebih lama; tambah selepas lulus) |
| Application home page | `https://docs.annurpro.com/salepage/` |
| Application privacy policy link | `https://docs.annurpro.com/privasi.html` |
| Application terms of service link | Kosongkan |
| Authorized domains | `annurpro.com` (tambah juga `workers.dev` hanya jika Google tidak benarkan simpan tanpanya) |
| Developer contact information | `annurprosolutions@gmail.com` |

Tekan **Save**.

## E. Skop dan Production

| # | Di mana | Buat apa | Semak |
|---|---|---|---|
| E1 | Google Auth Platform → **Data Access** | Pastikan skop hanya `openid`, `.../auth/userinfo.email` dan `.../auth/drive.file`. Buang skop lain jika ada | Tiada skop *sensitive* atau *restricted* |
| E2 | Google Auth Platform → **Audience** | **Publish app** → Confirm | Status *In production* |
| E3 | Google Auth Platform → **Branding** atau **Verification Center** | Jika ada butang **Verify branding / Submit for verification**, tekan dan ikut arahan | Status *Verification in progress*. Pantau e-mel Google dan balas jika diminta |
| E4 | Tetingkap inkognito | Log masuk dengan akaun Google lain yang bukan *Test user* | Boleh masuk. Sebelum branding lulus, skrin Google mungkin tunjuk domain dan bukan nama app |

## F. Hantar pelawat lama ke domain baharu (**Claude**)

| # | Siapa | Buat apa |
|---|---|---|
| F1 | Pemilik | Beritahu Claude bahawa A dan B sudah berjaya |
| F2 | Claude | Isi `canonicalHost: 'docs.annurpro.com'` dalam `config.js`, jana semula tangkapan skrin & PDF panduan, push |
| F3 | Pemilik | Buka alamat `workers.dev` lama: patut terus beralih ke `docs.annurpro.com`. Webhook `/bcl/` tidak terjejas |

Draf yang belum diterbit di alamat lama kekal dalam pelayar alamat lama sahaja. Terbitkan atau salin dulu sebelum F2. Dokumen diterbit, pelanggan dan tetapan semuanya dalam Google Sheet, jadi tidak terjejas.

## G. Tukar kunci webhook (disyorkan)

Kunci webhook semasa pernah dipaparkan dalam transkrip sesi, jadi tukar sekali sebelum pelanggan sebenar.

| # | Di mana | Buat apa |
|---|---|---|
| G1 | Chrome → F12 → Console | `crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','')` → salin |
| G2 | Cloudflare → `annur-invoice` → Settings → Variables and Secrets | Edit Secret `BCL_WEBHOOK_KEY` → tampal kunci baharu → Deploy |
| G3 | BCL → Forms → Annur Docs → Edit → bahagian Webhook | URL: `https://docs.annurpro.com/bcl/<kunci baharu>` → Save |
| G4 | Browser | Buka URL G3: mesti keluar `kaedah tidak disokong`. Beritahu Claude untuk semak dari API BCL |

## H. Ujian RM1 dan UAT

| # | Ujian | Jangkaan |
|---|---|---|
| H1 | Claude tukar harga LANGGANAN BULANAN ke RM1 (atas permintaan), pemilik bayar dengan e-mel Google sendiri | Bayaran berjaya, redirect ke WhatsApp |
| H2 | `https://docs.annurpro.com/admin/` | Bayaran tersenarai, Log webhook tiada ralat |
| H3 | App → Tetapan → Langganan & Kredit → *Saya sudah bayar, semak semula* | Pelan Bulanan, tamat sebulan dari hari bayar |
| H4 | Claude pulangkan harga ke RM20 | Form BCL RM20 |
| H5 | Cipta & terbit Invois, Quotation dan DO (sekurang-kurangnya 10 dokumen) | Nombor betul ikut kod syarikat, PDF dalam folder Drive ikut jenis |
| H6 | Edit dokumen dalam 24 jam | Nombor & pautan PDF sama, kandungan baharu |
| H7 | Batal satu dokumen | Status Batal, nombor tidak digunakan semula |
| H8 | Quotation → Tukar jadi Invois, Invois → Buat DO | Rujukan dua hala betul |
| H9 | Cetak satu PDF di printer sebenar | A4 kemas, logo/cop/tandatangan jelas |
| H10 | Pasang di telefon (Add to Home Screen) dan buka tanpa internet | App terbuka, draf boleh dibuat |
