// Tetapan pemasangan. Ubah fail ini tanpa menyentuh kod lain.
window.APP_CONFIG = {
  appName: 'Annur Docs',
  version: '0.10.1',
  vendor: 'AnnurPro Solutions',
  // Client ID OAuth Google (jenis "Web application"). Kosong = log masuk dimatikan (mod pembangunan).
  googleClientId: '933747272196-5ub5jst04ff6e3b21ou8muouvvlmfgae.apps.googleusercontent.com',
  // Alamat API Worker. Kosong = asal yang sama (app dan API dihos oleh Worker yang sama).
  apiBase: '',
  // Domain utama. Bila diisi, pelawat ke alamat *.workers.dev dihantar ke domain ini (webhook /bcl/ tidak terjejas).
  // Isi HANYA selepas https://<domain>/ sudah dibuka dengan jayanya.
  canonicalHost: 'docs.annurpro.com',
  priceText: 'RM20 sebulan atau RM200 setahun. Atau beli kredit: 5 kredit setiap dokumen.',
  support: { whatsapp: '01120879149', email: 'annurprosolutions@gmail.com' }
};

(function (c, l) {
  if (c.canonicalHost && l && /\.workers\.dev$/.test(l.hostname) && l.hostname !== c.canonicalHost) {
    l.replace('https://' + c.canonicalHost + l.pathname + l.search + l.hash);
  }
})(window.APP_CONFIG, window.location);
