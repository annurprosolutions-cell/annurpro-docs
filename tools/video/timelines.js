/* Jadual masa video. Semua masa (saat) diambil daripada transkripsi audio (tools/video/asr_segments.py)
   dan jeda sebenar dalam fail WAV. Ubah nombor di sini kemudian render semula. */
(function () {
  // seg(mula, tamat, "bahagian1|bahagian2"): bahagikan masa mengikut bilangan huruf
  const seg = (a, b, text) => {
    const parts = text.split('|'), n = parts.map((p) => p.replace(/\*/g, '').length), tot = n.reduce((x, y) => x + y, 0);
    let t = a; const out = [];
    parts.forEach((p, i) => { const d = (b - a) * n[i] / tot; out.push([+t.toFixed(2), +(t + d).toFixed(2), p]); t += d; });
    return out;
  };
  const caps = (...rows) => [].concat(...rows.map((r) => seg(...r)));

  const intro = {
    duration: 80.52,
    steps: [],
    caps: caps(
      [0.0, 5.0, 'Kalau anda buat *invois, quotation*|atau *DO* guna Word atau Excel,'],
      [5.0, 6.9, 'anda tahu betapa *leceh*.'],
      [7.3, 8.3, '*Format* berubah,'],
      [8.6, 12.6, '*nombor dokumen* terlepas,|cari balik dokumen lama *makan masa*'],
      [13.2, 16.3, '*Annur Docs* buat semua kerja ni|dalam beberapa minit sahaja.'],
      [16.6, 19.0, 'Log masuk guna *akaun Google*,'],
      [19.1, 21.2, 'isi maklumat syarikat *sekali sahaja*,'],
      [21.4, 23.0, 'letak *logo, cop, tandatangan*'],
      [23.3, 26.1, 'Lepas tu isi *borang*, tekan *terbit*'],
      [26.5, 27.1, 'dan siap.'],
      [27.6, 31.6, '*PDF* kemas format *A4*,|sedia dihantar melalui *WhatsApp*.'],
      [32.1, 34.4, '*Nombor dokumen* disusun automatik,'],
      [34.7, 37.4, '*cukai* dikira ikut kod yang anda pilih.'],
      [37.7, 41.0, 'Malah *jumlah dalam perkataan*|pun dijana automatik.'],
      [41.4, 45.8, 'Lebih menarik, semua dokumen disimpan dalam *Google Drive*|dan *Google Sheet* anda sendiri.'],
      [46.0, 47.2, 'Bukan dalam *pelayan kami*.'],
      [47.9, 50.2, 'Jadi data kekal *milik anda*'],
      [50.3, 52.0, 'dan ini paling menarik.'],
      [52.3, 54.9, 'Anda dapat *50 kredit percuma*|untuk mencuba.'],
      [55.2, 57.6, 'Cukup untuk *10 dokumen*.'],
      [57.9, 64.6, 'Selepas itu langganan hanya *RM20 sebulan*|atau *RM200 setahun*'],
      [65.1, 67.7, 'untuk terbit *tanpa had*.'],
      [68.1, 70.0, 'Cuba sekarang secara *percuma*'],
      [70.7, 76.2, 'di *docs.annurpro.com*'],
      [76.4, 77.1, 'Sekali lagi,'],
      [77.4, 80.3, '*docs.annurpro.com*']
    ),
    scenes: [
      { s: 0, e: 13.0, type: 'pain', p: { head: 'Masih guna *Word* atau *Excel*?', at: 0.2,
        files: [{ k: 'W', at: 2.6, bad: 5.2 }, { k: 'X', at: 3.4, bad: 5.5 }],
        items: [{ t: 'Format berubah', at: 7.3 }, { t: 'Nombor dokumen terlepas', at: 8.7 }, { t: 'Cari dokumen lama makan masa', at: 10.6 }] } },
      { s: 13.0, e: 16.5, type: 'phone', p: { imgs: [{ src: 'utama-telefon.jpg', at: 13.0 }], co: [{ t: 'Siap dalam minit', x: 800, y: 190, at: 13.7 }] } },
      { s: 16.5, e: 23.3, type: 'card', p: { imgs: [{ src: 'wizard-desktop.jpg', at: 16.5, until: 19.1 }, { src: 'profil-desktop.jpg', at: 19.1, until: 21.4 }, { src: 'logo-cop-desktop.jpg', at: 21.4 }],
        co: [{ t: 'Log masuk Google', x: 540, y: 100, at: 16.7, until: 19.1 }, { t: 'Maklumat syarikat, sekali sahaja', x: 540, y: 100, at: 19.2, until: 21.4, k: 'b' }, { t: 'Logo · Cop · Tandatangan', x: 540, y: 100, at: 21.5 }] } },
      { s: 23.3, e: 27.4, type: 'phone', p: { imgs: [{ src: 'editor-telefon.jpg', at: 23.3, until: 26.3 }, { src: 'terbit-telefon.jpg', at: 26.3 }],
        co: [{ t: 'Isi borang', x: 800, y: 190, at: 23.6, until: 25.2 }, { t: 'Tekan Terbit', x: 800, y: 190, at: 25.3, until: 26.3 }, { t: 'Siap!', x: 800, y: 190, at: 26.5, k: 'g' }] } },
      { s: 27.4, e: 41.3, type: 'doc', p: {
        hl: [{ b: [64, 16.3, 31, 2.4], at: 32.2, until: 34.6 }, { b: [56.5, 37.4, 38.5, 3.4], at: 34.7, until: 37.6 }, { b: [5, 43.9, 90, 3.0], at: 37.7, until: 41.2 }],
        co: [{ t: 'PDF A4 yang kemas', x: 540, y: 55, at: 27.8, until: 29.8 }, { t: 'Hantar melalui WhatsApp', x: 540, y: 55, at: 29.9, until: 32.0, k: 'g' },
          { t: 'Nombor disusun automatik', x: 540, y: 930, at: 32.2, until: 34.6, k: 'b' }, { t: 'Cukai ikut kod anda', x: 540, y: 930, at: 34.7, until: 37.6, k: 'b' }, { t: 'Jumlah dalam perkataan', x: 540, y: 930, at: 37.7, k: 'b' }] } },
      { s: 41.2, e: 52.2, type: 'drive', p: { folder: 'AnnurPro Solutions – Annur Docs', t: { card: 41.5, folder: 41.8, sheet: 43.2, pdf: 44.3 },
        server: { at: 45.8, empty: true, emptyAt: 46.0 }, badge: { at: 47.9, t: 'Data kekal *milik anda*' } } },
      { s: 52.2, e: 68.0, type: 'price', p: { items: [
        { t: 'Percubaan percuma', s: '50 kredit = 10 dokumen', r: '50 <small>kredit</small>', at: 52.4 },
        { t: 'Bulanan', s: 'Terbit dokumen', r: 'RM20<small>/bulan</small>', at: 58.0, tag: { at: 65.2, t: 'Tanpa had' } },
        { t: 'Tahunan', s: 'Jimat RM40', r: 'RM200<small>/tahun</small>', best: true, at: 61.2, tag: { at: 65.4, t: 'Tanpa had' } }] } },
      { s: 68.0, e: 80.52, type: 'cta', p: { head: 'Cuba *percuma* sekarang', at: 68.2, urlAt: 70.7, sub: 'Invois · Quotation · Delivery Order' } }
    ]
  };

  const sistem = {
    duration: 194.4,
    steps: [
      { at: 5.9, n: 1, label: 'Log masuk & persediaan' }, { at: 35.4, n: 2, label: 'Tetapan' }, { at: 62.6, n: 3, label: 'Cipta dokumen' },
      { at: 85.9, n: 4, label: 'Terbit' }, { at: 113.7, n: 5, label: 'Urus rekod' }, { at: 142.9, n: 6, label: 'Harga & kredit' }
    ],
    caps: caps(
      [0.2, 3.4, 'Dalam audio ni, kita terangkan|langkah demi langkah'], [3.4, 6.0, 'macam mana *Annur Docs* berfungsi.'], [6.0, 6.9, '*Satu.*'],
      [7.2, 8.6, '*Log masuk* dan persediaan.'], [9.0, 12.6, 'Buka *docs.annurpro.com*'], [12.9, 14.6, 'dan tekan *Sambung Google*.'],
      [15.2, 16.9, 'Pilih akaun Google *syarikat* anda.'], [17.1, 23.5, 'Isi *nama syarikat*, dan sistem akan cipta|satu *folder* serta satu *Google Sheet* dalam Drive anda,'],
      [23.9, 25.7, 'dinamakan ikut syarikat anda.'], [25.9, 28.2, 'Semua data anda akan duduk di situ.'],
      [28.8, 30.6, 'Kami hanya simpan *e-mel* anda,'], [30.8, 35.0, 'baki kredit, status langganan|dan nombor dokumen.'], [35.3, 35.9, '*Dua.*'],
      [36.2, 37.1, '*Tetapan.*'], [37.1, 39.3, 'Isi alamat, nombor pendaftaran,'], [39.5, 41.8, 'akaun bank dan penandatangan.'],
      [42.4, 47.6, 'Kalau berdaftar *SST*, hidupkan|dan pilih *kod cukai*.'],
      [48.3, 50.0, 'Kemudian, muat naik *logo*,'], [50.4, 51.8, '*cop* dan'], [52.4, 53.4, '*tandatangan*.'],
      [53.7, 57.6, 'Sistem boleh *buang latar putih*|pada cop dan tandatangan secara automatik.'],
      [58.2, 62.4, 'Anda juga boleh *seret* dan letakkan imej|pada kedudukan yang betul.'], [62.7, 64.4, '*Tiga.* Cipta dokumen.'],
      [64.9, 67.2, 'Pilih jenis dokumen:'], [67.5, 70.5, '*invois*, *quotation*|atau *delivery order*.'],
      [71.1, 75.1, 'Isi nama pelanggan, tambah item,|masukkan kuantiti dan harga.'], [75.5, 79.5, '*Pratonton A4* akan berubah secara langsung|semasa anda menaip.'],
      [80.2, 82.4, 'Malah *draf* turut disimpan di peranti,'], [83.0, 85.6, 'jadi kalau internet terputus|anda masih boleh menaip.'],
      [86.1, 87.0, '*Empat.*'], [87.3, 88.1, '*Terbit.*'], [88.6, 89.7, 'Bila semuanya dah siap,'], [89.9, 91.0, 'tekan butang *Terbit*.'],
      [91.6, 94.5, 'Sistem akan keluarkan *nombor rasmi*|secara automatik.'], [94.8, 99.0, 'Contohnya, *kod syarikat*, bulan,|tahun dan nombor turutan.'],
      [99.3, 103.6, 'Nombor ni *tak akan bertindih*, walaupun|anda guna dua peranti berbeza.'], [104.1, 108.4, 'Selepas tu, *PDF* dijana dan disimpan|dalam folder Google Drive anda.'],
      [109.0, 113.3, 'Anda boleh terus hantar melalui *WhatsApp*,|salin pautan atau muat turun PDF.'], [113.8, 115.7, '*Lima.* Urus rekod.'],
      [116.7, 122.4, 'Dalam menu *Rekod*, anda boleh cari dokumen|ikut nombor, nama pelanggan atau nombor PO.'],
      [122.7, 128.0, 'Dalam masa *24 jam*, anda masih boleh|edit dokumen dan nombornya kekal.'], [128.6, 131.4, 'Selepas tempoh tersebut, dokumen *dikunci*.'],
      [132.0, 137.2, 'Tapi jangan risau, anda masih boleh|*batalkan* dan salin sebagai draf baharu.'], [137.8, 141.5, 'Lebih menarik, *quotation* boleh ditukar|jadi *invois* dengan satu klik.'],
      [141.9, 143.2, 'Invois boleh jadi *DO*.'], [143.3, 144.4, '*Enam.* Harga dan kredit.'],
      [145.0, 150.3, 'Setiap akaun baharu menerima|*50 kredit percuma*.'], [150.9, 156.5, 'Satu dokumen guna *5 kredit*, maknanya anda|boleh hasilkan *10 dokumen* percuma.'],
      [157.1, 164.6, 'Kalau kerap terbit dokumen, pilih langganan|*RM20 sebulan* atau *RM200 setahun*, tanpa had.'],
      [164.9, 168.3, 'Kalau jarang guna, anda boleh|beli *pek kredit*.'], [168.6, 171.6, 'Harga bermula *RM10*|untuk *110 kredit*.'],
      [172.1, 175.4, 'Kredit yang dibeli *tidak luput*.|Itu sahaja.'], [175.7, 178.7, 'Tak perlu *pasang apa-apa* perisian.'],
      [179.1, 182.5, 'Annur Docs boleh dibuka terus guna|*telefon* atau *komputer* anda.'], [183.2, 186.8, 'Jadi tunggu apa lagi?|Cuba *percuma* sekarang di'],
      [187.5, 190.4, '*docs.annurpro.com*'], [190.8, 191.5, 'Sekali lagi,'], [191.8, 194.4, '*docs.annurpro.com*']
    ),
    scenes: [
      { s: 0, e: 5.8, type: 'title', p: { at: 0.2, head: 'Bagaimana *Annur Docs* berfungsi', sub: '6 langkah ringkas' } },
      { s: 5.9, e: 9.0, type: 'step', p: { n: 1, head: 'Log masuk & persediaan', at: 6.0 } },
      { s: 9.0, e: 15.0, type: 'url', p: { at: 9.2, btnAt: 12.9 } },
      { s: 15.0, e: 23.9, type: 'card', p: { imgs: [{ src: 'wizard-desktop.jpg', at: 15.0 }], co: [{ t: 'Persediaan ringkas', x: 540, y: 100, at: 17.2, until: 21.0 }, { t: 'Folder + Google Sheet dicipta', x: 540, y: 100, at: 21.1, k: 'g' }] } },
      { s: 23.9, e: 35.4, type: 'drive', p: { folder: 'AnnurPro Solutions – Annur Docs', t: { card: 24.0, folder: 24.2, sheet: 26.0, pdf: 27.2 },
        server: { at: 28.6, items: [{ t: 'E-mel anda', at: 28.9 }, { t: 'Baki kredit', at: 30.8 }, { t: 'Status langganan', at: 32.0 }, { t: 'Nombor dokumen', at: 33.3 }] } } },
      { s: 35.4, e: 37.3, type: 'step', p: { n: 2, head: 'Tetapan', at: 35.5 } },
      { s: 37.3, e: 42.3, type: 'card', p: { imgs: [{ src: 'profil-desktop.jpg', at: 37.3 }], co: [{ t: 'Alamat & no. pendaftaran', x: 540, y: 100, at: 37.4, until: 39.4 }, { t: 'Akaun bank', x: 540, y: 100, at: 39.5, until: 41.0 }, { t: 'Penandatangan', x: 540, y: 100, at: 41.1 }] } },
      { s: 42.3, e: 48.2, type: 'card', p: { h: 700, imgs: [{ src: 'dokumen-cukai-desktop.jpg', at: 42.3, pos: 'bottom' }], co: [{ t: 'Hidupkan SST', x: 540, y: 55, at: 42.6, until: 45.0 }, { t: 'Pilih kod cukai', x: 540, y: 55, at: 45.1, k: 'b' }] } },
      { s: 48.2, e: 62.6, type: 'card', p: { h: 700, imgs: [{ src: 'logo-cop-desktop.jpg', at: 48.2, until: 58.1 }, { src: 'logo-cop-desktop.jpg', at: 58.1, pos: 'bottom' }],
        co: [{ t: 'Logo', x: 540, y: 55, at: 48.4, until: 50.3 }, { t: 'Cop', x: 540, y: 55, at: 50.4, until: 52.3 }, { t: 'Tandatangan', x: 540, y: 55, at: 52.4, until: 53.7 },
          { t: 'Buang latar putih automatik', x: 540, y: 55, at: 53.8, until: 58.0, k: 'g' }, { t: 'Seret untuk letak', x: 540, y: 55, at: 58.3 }] } },
      { s: 62.6, e: 64.8, type: 'step', p: { n: 3, head: 'Cipta dokumen', at: 62.7 } },
      { s: 64.8, e: 71.0, type: 'chips', p: { head: 'Pilih jenis dokumen', headAt: 64.9, items: [{ t: 'Invois', i: 'I', at: 67.6 }, { t: 'Quotation', i: 'Q', at: 68.8 }, { t: 'Delivery Order', i: 'DO', at: 69.8 }] } },
      { s: 71.0, e: 80.1, type: 'phone', p: { imgs: [{ src: 'editor-telefon.jpg', at: 71.0, until: 75.4 }, { src: 'pratonton-telefon.jpg', at: 75.4 }],
        co: [{ t: 'Nama pelanggan', x: 800, y: 190, at: 71.3, until: 73.0 }, { t: 'Item, kuantiti, harga', x: 780, y: 420, at: 73.1, until: 75.4 }, { t: 'Pratonton A4 langsung', x: 540, y: 150, at: 75.8, k: 'b' }] } },
      { s: 80.1, e: 85.9, type: 'chips', p: { head: 'Kerja anda *selamat*', headAt: 80.2, items: [{ t: 'Draf disimpan di peranti', i: '✓', k: 'good', at: 80.6 }, { t: 'Internet terputus?', s: 'Anda masih boleh menaip', i: '!', k: 'warn', at: 83.0 }] } },
      { s: 85.9, e: 88.1, type: 'step', p: { n: 4, head: 'Terbit', at: 86.0 } },
      { s: 88.1, e: 91.6, type: 'card', p: { imgs: [{ src: 'terbit-sahkan.jpg', at: 88.1 }], co: [{ t: 'Bila siap, tekan Terbit', x: 540, y: 100, at: 88.6, k: 'g' }] } },
      { s: 91.6, e: 104.0, type: 'number', p: { at: 91.8, parts: [{ v: 'APS/', l: 'Kod syarikat', at: 94.9 }, { v: '11', l: 'Bulan', at: 96.8 }, { v: '26', l: 'Tahun', at: 97.5 }, { v: '-001', l: 'Turutan', at: 98.2 }],
        dev: [{ t: 'Telefon', n: 'APS/1126-001', at: 99.6 }, { t: 'Komputer', n: 'APS/1126-002', at: 101.2 }] } },
      { s: 104.0, e: 113.7, type: 'card', p: { imgs: [{ src: 'terbit-berjaya.jpg', at: 104.0 }], co: [{ t: 'PDF masuk folder Drive anda', x: 540, y: 100, at: 104.3, until: 108.8, k: 'g' },
        { t: 'WhatsApp', x: 540, y: 905, at: 109.2, until: 110.8 }, { t: 'Salin pautan', x: 540, y: 905, at: 110.9, until: 112.2 }, { t: 'Muat turun', x: 540, y: 905, at: 112.3 }] } },
      { s: 113.7, e: 116.0, type: 'step', p: { n: 5, head: 'Urus rekod', at: 113.8 } },
      { s: 116.0, e: 122.6, type: 'phone', p: { imgs: [{ src: 'rekod-telefon.jpg', at: 116.0 }], co: [{ t: 'Cari no. · pelanggan · PO', x: 540, y: 160, at: 116.8 }] } },
      { s: 122.6, e: 128.4, type: 'big', p: { big: '24<small> jam</small>', at: 122.8, sub: 'Edit bebas, *nombor kekal*', subAt: 124.6 } },
      { s: 128.4, e: 137.6, type: 'chips', p: { head: 'Selepas itu, *dikunci*', headAt: 128.5, items: [{ t: 'Dokumen dikunci', s: 'Tidak boleh diedit lagi', i: '!', k: 'warn', at: 128.9 }, { t: 'Batalkan dokumen', s: 'Salin sebagai draf baharu', i: '×', k: 'info', at: 132.1 }] } },
      { s: 137.6, e: 142.8, type: 'chips', p: { head: 'Tukar dokumen', headAt: 137.7, items: [{ t: 'Quotation → Invois', s: 'Dengan satu klik', i: '1', at: 138.4 }, { t: 'Invois → Delivery Order', i: '2', at: 141.9 }] } },
      { s: 142.9, e: 145.0, type: 'step', p: { n: 6, head: 'Harga & kredit', at: 143.0 } },
      { s: 145.0, e: 157.0, type: 'price', p: { items: [{ t: 'Akaun baharu', s: '50 kredit percuma', r: '50 <small>kredit</small>', at: 145.2 }, { t: 'Setiap dokumen', s: '5 kredit, jadi 10 dokumen percuma', r: '5 <small>kredit</small>', at: 150.9, best: true }] } },
      { s: 157.0, e: 164.8, type: 'price', p: { items: [{ t: 'Bulanan', s: 'Terbit tanpa had', r: 'RM20<small>/bulan</small>', at: 159.0, tag: { at: 163.3, t: 'Tanpa had' } }, { t: 'Tahunan', s: 'Jimat RM40', r: 'RM200<small>/tahun</small>', best: true, at: 161.2, tag: { at: 163.5, t: 'Tanpa had' } }] } },
      { s: 164.8, e: 172.0, type: 'chips', p: { head: '*Pek kredit* untuk yang jarang terbit', headAt: 164.9, items: [{ t: 'RM10 = 110 kredit', i: '10', at: 168.7 }, { t: 'RM20 = 230 kredit', i: '20', at: 169.9 }, { t: 'RM50 = 600 kredit', i: '50', at: 171.0 }] } },
      { s: 172.0, e: 175.6, type: 'chips', p: { items: [{ t: 'Kredit tidak luput', s: 'Beli sekali, guna bila-bila', i: '✓', k: 'good', at: 172.2 }] } },
      { s: 175.6, e: 183.0, type: 'devices', p: { at: 175.8, phoneAt: 179.3 } },
      { s: 183.0, e: 194.4, type: 'cta', p: { head: 'Cuba *percuma* sekarang', at: 183.3, urlAt: 187.5, sub: 'Invois · Quotation · Delivery Order' } }
    ]
  };


  // ---- Versi 2 (pengenalan): buang ayat "Word atau Excel" (jenama pihak ketiga) dan ulangan URL; tanpa tera URL sepanjang video ----
  const OFF = 7.1, END = 76.3;
  const TK = new Set(['at', 'until', 'btnAt', 'urlAt', 'headAt', 'subAt', 'phoneAt', 'emptyAt', 'bad']);
  const shift = (o, key) => {
    if (Array.isArray(o)) return o.map((x) => shift(x));
    if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = shift(o[k], k); return r; }
    if (typeof o === 'number' && (TK.has(key) || key === '_t')) return +(o - OFF).toFixed(2);
    return o;
  };
  const shiftT = (o) => { const r = {}; for (const k of Object.keys(o)) r[k] = +(o[k] - OFF).toFixed(2); return r; };
  const introV2 = {
    duration: +(END - OFF).toFixed(2), steps: [], foot: false,
    caps: intro.caps.filter((c) => c[0] >= OFF && c[1] <= END + 0.1).map((c) => [+(c[0] - OFF).toFixed(2), +(c[1] - OFF).toFixed(2), c[2]]),
    scenes: [{ s: 0, e: 5.9, type: 'chips', p: { head: 'Dokumen jualan masih *leceh*?', headAt: 0.1, items: [
      { t: 'Format berubah', i: '×', k: 'bad', at: 0.2 }, { t: 'Nombor dokumen terlepas', i: '×', k: 'bad', at: 1.6 }, { t: 'Cari dokumen lama makan masa', i: '×', k: 'bad', at: 3.5 }] } }]
      .concat(intro.scenes.filter((x) => x.s >= 13.0).map((x) => {
        const y = shift(x); y.s = +(x.s - OFF).toFixed(2); y.e = +(Math.min(x.e, END) - OFF).toFixed(2);
        if (y.p && y.p.t && typeof y.p.t === 'object') y.p.t = shiftT(x.p.t);
        return y;
      }))
  };
  introV2.scenes.find((x) => x.type === 'phone').s = 5.9;
  window.TIMELINES = { intro, sistem, introV2 };
})();
