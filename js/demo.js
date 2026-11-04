(function (root) {
  'use strict';
  // Mod demo: pautan bayar ke bahagian harga halaman jualan (bukan borang sebenar, supaya tiada bayaran dengan e-mel demo)
  const DEMO_BUY = { sub: 'salepage/#harga', pack: 'salepage/#harga' };
  const DEMO_PACKS = [{ price: 10, credits: 110 }, { price: 20, credits: 230 }, { price: 50, credits: 600 }];
  const AI = root.AI || (root.AI = {});

  // Mod demo (/?demo): tiada Google, tiada Worker sebenar. Semua data dalam memori tab ini sahaja.
  AI.DEMO_EMAIL = 'demo@annurinvoice.app';
  AI.isDemo = () => /(^|[?&])demo(\b|=|&|$)/.test(String(root.location && root.location.search || ''));

  AI.DemoAuth = function () {
    this.has = () => true;
    this.lastEmail = () => AI.DEMO_EMAIL;
    this.token = async () => 'demo-token';
    this.signIn = async () => 'demo-token';
    this.setEmail = () => {};
    this.signOut = () => {};
  };

  /**
   * Worker simulasi: /api/check, /api/issue, /api/void, /api/issues, /api/ledger, /api/payments.
   * Peraturan sama dengan Worker sebenar: 50 kredit percubaan, 5 kredit setiap dokumen, nombor berturutan, idempoten ikut docId.
   */
  AI.DemoWorker = function (now) {
    now = now || (() => Date.now());
    const iso = () => new Date(now()).toISOString();
    const st = { credits: 50, per: 5, counters: {}, issues: {}, ledger: [{ delta: 50, reason: 'trial', ref: 'trial', balance_after: 50, note: 'Kredit percubaan percuma', created_at: iso() }] };
    const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const ent = () => ({ credits: st.credits, creditsPerDoc: st.per, docsLeft: Math.floor(st.credits / st.per), plan: null, expires: null, daysLeft: null,
      mode: st.credits >= st.per ? 'kredit' : 'habis', entitled: st.credits >= st.per, trial: true, reason: st.credits >= st.per ? '' : 'tiada-kredit' });
    const out = (r, extra) => Object.assign({ ok: true, docId: r.docId, number: r.number, type: r.type, issuedAt: r.issuedAt, state: r.status, charged: r.charged,
      editableUntil: new Date(Date.parse(r.issuedAt) + 24 * 3600e3).toISOString() }, extra);
    this.state = st;
    this.fetch = async (url, init) => {
      init = init || {};
      const u = new URL(url, root.location ? root.location.href : 'https://demo.local/');
      const b = init.body ? JSON.parse(init.body) : {};
      switch ((init.method || 'GET') + ' ' + u.pathname) {
        case 'POST /api/check': return res(200, Object.assign({ ok: true, email: AI.DEMO_EMAIL, businessName: 'AnnurPro Solutions', newAccount: false, buyUrls: DEMO_BUY, packs: DEMO_PACKS }, ent()));
        case 'POST /api/issue': {
          if (st.issues[b.docId]) return res(200, out(st.issues[b.docId], { repeat: true, credits: st.credits }));
          if (st.credits < st.per) return res(403, Object.assign({ ok: false, error: 'Baki kredit tidak cukup.', buyUrls: DEMO_BUY, packs: DEMO_PACKS }, ent()));
          const period = b.date.slice(5, 7) + b.date.slice(2, 4), key = [b.type, b.prefix, period].join('|');
          const seq = st.counters[key] = (st.counters[key] || 0) + 1;
          const r = { docId: b.docId, number: `${b.prefix}/${period}-${String(seq).padStart(3, '0')}`, type: b.type, issuedAt: iso(), status: 'issued', charged: st.per };
          st.issues[b.docId] = r; st.credits -= st.per;
          st.ledger.push({ delta: -st.per, reason: 'issue', ref: b.docId, balance_after: st.credits, note: 'Terbit ' + b.type, created_at: r.issuedAt });
          return res(200, out(r, { repeat: false, credits: st.credits, mode: 'kredit' }));
        }
        case 'POST /api/void': { const r = st.issues[b.docId]; if (!r) return res(404, { ok: false, error: 'Dokumen tidak dijumpai' }); r.status = 'void'; return res(200, out(r)); }
        case 'GET /api/issues': return res(200, { ok: true, issues: Object.values(st.issues).map((r) => ({ docId: r.docId, type: r.type, number: r.number, issuedAt: r.issuedAt, status: r.status, charged: r.charged })) });
        case 'GET /api/ledger': return res(200, { ok: true, entries: st.ledger.slice().reverse() });
        case 'GET /api/payments': return res(200, { ok: true, payments: [] });
        default: return res(404, { ok: false, reason: 'tiada', error: 'Tidak tersedia dalam mod demo' });
      }
    };
  };

  // ---------- gambar contoh (dilukis, tiada fail luar) ----------
  async function canvasPng(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  const drawLogo = (g, w, h) => {
    g.fillStyle = '#1e3a8a'; g.beginPath(); g.arc(h / 2, h / 2, h / 2 - 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${h * 0.42}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AP', h / 2, h / 2 + 2);
    g.fillStyle = '#0f172a'; g.textAlign = 'left'; g.font = `bold ${h * 0.3}px Arial`; g.fillText('AnnurPro', h + 12, h * 0.42);
    g.fillStyle = '#c62828'; g.font = `${h * 0.2}px Arial`; g.fillText('SOLUTIONS', h + 14, h * 0.72);
  };
  const drawStamp = (g, w) => {
    const c = w / 2; g.strokeStyle = 'rgba(30,58,138,.9)'; g.fillStyle = 'rgba(30,58,138,.9)';
    g.lineWidth = 6; g.beginPath(); g.arc(c, c, c - 6, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(c, c, c - 22, 0, Math.PI * 2); g.stroke();
    g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ANNURPRO', c, c - 10); g.font = '15px Arial'; g.fillText('SOLUTIONS', c, c + 16);
  };
  const drawSign = (g, w, h) => {
    g.strokeStyle = '#1d3fa8'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath();
    g.moveTo(10, h * 0.7); g.bezierCurveTo(w * 0.15, h * 0.05, w * 0.25, h * 0.95, w * 0.35, h * 0.45);
    g.bezierCurveTo(w * 0.45, h * 0.1, w * 0.5, h * 0.85, w * 0.62, h * 0.5); g.bezierCurveTo(w * 0.72, h * 0.25, w * 0.8, h * 0.8, w - 10, h * 0.35); g.stroke();
  };

  // Ruang kerja contoh: syarikat, kod cukai SST 8% aktif, dua pelanggan, logo, cop, tandatangan
  AI.seedDemo = async (api) => {
    const ws = await AI.ensureWorkspace(api, { company: 'AnnurPro Solutions', email: AI.DEMO_EMAIL, writer: 'demo' });
    const store = new AI.Store(api, { id: ws.id, email: AI.DEMO_EMAIL, writer: 'demo', debounceMs: 0 });
    await store.load();
    const imgs = new AI.ImageStore({ api, idb: null, folderId: ws.folders.settings });
    const [logo, cop, tt] = await Promise.all([canvasPng(420, 120, drawLogo), canvasPng(200, 200, drawStamp), canvasPng(320, 120, drawSign)]);
    const L = await imgs.put('logo', logo), C = await imgs.put('cop', cop), T = await imgs.put('tt', tt);
    store.setKV('Syarikat', {
      nama: 'AnnurPro Solutions', ssm: '202401012345 (1234567-A)', alamat: 'No 1, Jalan Contoh 1/2\n50000 Kuala Lumpur', tel: '03-1234 5678', emel: 'hello@annurpro.com',
      kod_syarikat: 'APS', sst_berdaftar: 'YA', sst_no: 'W10-0000-00000001', bank_nama: 'MAYBANK', bank_akaun: '5123 4567 8901', bank_pemegang: 'AnnurPro Solutions',
      tt_nama: 'Ahmad bin Abdullah', tt_jawatan: 'Director', warna_aksen: '#1e3a8a', terma_default: '30 DAYS', logo_id: L.id, cop_id: C.id, tt_gambar_id: T.id,
      cop_x: '40', cop_y: '16', cop_saiz: '100', tt_x: '60', tt_y: '40', tt_lebar: '150'
    });
    store.update('KodCukai', 'kod', { kod: 'SST-PERKHIDMATAN-8', aktif: 'YA' });
    store.append('Pelanggan', [
      { id: 'p-demo1', nama: 'Contoh Trading Sdn Bhd', alamat: 'Lot 5, Jalan Industri 3\n40000 Shah Alam, Selangor', tel: '03-5511 2233', attn: 'Encik Ali', arkib: 'TIDAK', dicipta: new Date().toISOString() },
      { id: 'p-demo2', nama: 'Beta Engineering Enterprise', alamat: 'No 9, Jalan Teknologi\n47810 Petaling Jaya', tel: '012-345 6789', attn: 'Puan Siti', arkib: 'TIDAK', dicipta: new Date().toISOString() }
    ], 'id');
    await store.flush();
    return ws;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
