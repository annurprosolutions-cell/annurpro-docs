(function (root) {
  'use strict';
  const AI = root.AI;

  // S-13 Bantuan & Sokongan
  AI.FAQ = [
    ['Di mana data saya disimpan?', 'Semua dokumen, pelanggan dan tetapan disimpan dalam Google Sheet dan Google Drive milik anda, dalam folder bernama "[Nama Syarikat] – Annur Docs". AnnurPro hanya menyimpan e-mel Google, baki kredit, status langganan dan nombor dokumen yang dikeluarkan.'],
    ['Bagaimana nombor dokumen dikeluarkan?', 'Format PREFIX/MMYY-NNN, contohnya APS/1126-001. Nombor berturutan setiap bulan dan setiap jenis dokumen, dikeluarkan oleh pelayan semasa anda tekan Terbit, jadi tidak bertindih walaupun app digunakan pada beberapa peranti.'],
    ['Boleh saya edit dokumen selepas terbit?', 'Boleh, dalam masa 24 jam selepas terbit. Nombor dan pautan PDF kekal sama dan tiada kredit digunakan. Selepas 24 jam dokumen dikunci: batalkan (Rekod → ⋯ → Batal dokumen) dan terbit dokumen baharu.'],
    ['Bagaimana kredit dan langganan berfungsi?', 'Akaun baharu dapat 50 kredit percuma (10 dokumen). Setiap dokumen yang diterbit menggunakan 5 kredit; kredit tidak luput. Langganan RM20 sebulan atau RM200 setahun membolehkan anda terbit tanpa had dan tidak menggunakan kredit.'],
    ['Boleh guna tanpa internet?', 'Boleh buka app dan buat draf tanpa internet; draf disimpan di peranti. Terbit dokumen memerlukan internet kerana nombor rasmi dikeluarkan oleh pelayan dan PDF dimuat naik ke Drive anda.'],
    ['Siapa boleh buka pautan PDF?', 'Secara lalai, sesiapa yang menerima pautan boleh melihat PDF (sesuai untuk WhatsApp). Anda boleh mematikan ini dalam Tetapan → Dokumen, Penomboran & Cukai → Perkongsian PDF; kemudian hantar fail PDF secara manual.'],
    ['Bagaimana dengan SST?', 'Aktifkan dalam Tetapan → Dokumen, Penomboran & Cukai. Kadar default (cukai jualan 5% dan 10%, cukai perkhidmatan 6% dan 8%) boleh diubah dan perlu disemak dengan Kastam. Anda bertanggungjawab ke atas ketepatan cukai dalam dokumen anda.'],
    ['Adakah e-Invois LHDN (MyInvois) disokong?', 'Belum dalam versi ini. Medan TIN dan BRN sudah disediakan untuk syarikat dan pelanggan.'],
    ['Bagaimana pasang app di telefon?', 'Android (Chrome): menu ⋮ → Install app / Add to Home screen. iPhone (mesti Safari): butang Kongsi → Add to Home Screen.'],
    ['Boleh staf lain guna akaun yang sama?', 'Versi ini menyokong satu akaun Google bagi setiap syarikat. Perkongsian kepada staf akan datang.'],
    ['Saya sudah bayar tetapi langganan belum aktif?', 'Pastikan e-mel dalam medan "E-mel Google untuk sistem" pada borang bayaran sama dengan akaun Google anda, kemudian tekan Tetapan → Langganan & Kredit → Semak semula. Jika masih belum aktif, hubungi sokongan dengan nombor pesanan.']
  ];

  AI.HelpUI = function (ctx) {
    const { esc } = ctx;
    const wa = (n) => 'https://wa.me/6' + String(n || '').replace(/\D/g, '').replace(/^6/, '');
    function view() {
      const sup = ctx.support || {};
      return `<header class="page-head"><div><button class="link-back" data-act="go" data-v="tetapan">${ctx.icon('back')}Tetapan</button><h1>Bantuan &amp; Sokongan</h1></div></header>
        <section class="card"><h2>Hubungi kami</h2>
          <div class="acts-row">${sup.whatsapp ? `<a class="btn primary" href="${esc(wa(sup.whatsapp))}" target="_blank" rel="noopener">WhatsApp ${esc(sup.whatsapp)}</a>` : ''}
          ${sup.email ? `<a class="btn" href="mailto:${esc(sup.email)}">${esc(sup.email)}</a>` : ''}
          <a class="btn" href="panduan/" target="_blank" rel="noopener">Panduan pengguna</a></div>
          <p class="fine">Sertakan e-mel Google anda (${esc(ctx.email())}) dan nombor dokumen atau pesanan jika berkaitan.</p></section>
        <section class="card"><h2>Soalan lazim</h2><div class="faq">${AI.FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>
        <p class="fine center"><a href="privasi.html" target="_blank" rel="noopener">Dasar privasi</a> · ${esc(ctx.appName)} v${esc(ctx.version)}</p>`;
    }
    return { views: { bantuan: view }, actions: { openBantuan() { ctx.go('bantuan'); } } };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
