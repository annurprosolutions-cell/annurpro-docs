(function (root) {
  'use strict';
  const AI = root.AI;
  const CFG = root.APP_CONFIG || {};
  const esc = AI.esc;
  const LIC_KEY = 'ai-lic';

  // Mod demo (/?demo): Google & Worker disimulasikan dalam memori (js/demo.js, js/fakegoogle.js)
  const DEMO = !!(AI.isDemo && AI.isDemo());
  const auth = DEMO ? new AI.DemoAuth() : new AI.GoogleAuth(CFG.googleClientId);
  const demoG = DEMO ? AI.fakeGoogle('demo-token', { blobLinks: true }) : null;
  const demoW = DEMO ? new AI.DemoWorker() : null;
  const apiFetch = DEMO ? (...a) => demoW.fetch(...a) : (...a) => root.fetch(...a);
  let demoSeeded = false;
  const UI = {
    view: 'login',          // login | home | rekod | pelanggan | tetapan | editor
    busy: false,
    error: '',
    lic: null,              // keputusan AI.licenseDecision
    online: root.navigator ? root.navigator.onLine !== false : true,
    ws: null,               // { ready, id, url, folders }
    data: null,             // snapshot Sheet: syarikat, kodCukai, pelanggan, dokumen
    sync: { state: 'idle', info: {} },
    modal: ''               // '' | 'conflict'
  };
  let api = null, store = null;
  const WS_KEY = (e) => 'ai-ws:' + e;

  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    quote: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    google: '<path fill="#fff" stroke="none" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" stroke="none" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" opacity=".85"/><path fill="#fff" stroke="none" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" opacity=".7"/><path fill="#fff" stroke="none" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" opacity=".55"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    left: '<path d="M19 12H5M12 19l-7-7 7-7"/>', right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    chev: '<path d="M9 18l6-6-6-6"/>',
    building: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
  };
  const icon = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

  // ---------- semakan lesen ----------
  async function runCheck() {
    const cache = AI.local.get(LIC_KEY, null);
    let decision;
    try {
      const token = await auth.token();
      const result = await AI.fetchCheck(CFG.apiBase, token, apiFetch);
      decision = AI.licenseDecision({ result, cache, email: auth.lastEmail() });
    } catch (e) {
      if (e.needsLogin) { UI.view = 'login'; UI.error = e.message; render(); return; }
      decision = AI.licenseDecision({ error: e, cache, email: auth.lastEmail() });
    }
    if (decision.needsLogin) { auth.signOut(); UI.view = 'login'; UI.error = decision.message; render(); return; }
    if (decision.state === 'live') { AI.local.set(LIC_KEY, decision.cache); if (decision.email) auth.setEmail(decision.email); }
    UI.lic = decision;
    if (UI.view === 'login') UI.view = 'home';
    render();
    setupWorkspace();
  }

  // ---------- ruang kerja Google (Sheet + Drive) ----------
  // Lepas log masuk: CARI ruang kerja sedia ada sahaja. Jika tiada, wizard minta nama syarikat dahulu,
  // kemudian createWorkspace() mencipta folder & Sheet "<syarikat> – Annur Docs".
  async function openStore(ws, email) {
    AI.local.set(WS_KEY(email), { id: ws.id, url: ws.url, folders: ws.folders });
    store = new AI.Store(api, {
      id: ws.id, email, writer: AI.writerId(),
      persist: (p) => AI.idb.set('kv', 'pending:' + email, p),
      onStatus: (st, info) => {
        UI.sync = { state: st, info: info || {} };
        if (st === 'saved') { UI.data = Object.assign({}, UI.data, store.snapshot()); AI.idb.set('kv', 'snapshot:' + email, UI.data); }
        if (st === 'conflict') UI.modal = 'conflict';
        render();
      }
    });
    UI.data = await store.load();
    AI.idb.set('kv', 'snapshot:' + email, UI.data);
    UI.ws = { ready: true, id: ws.id, url: ws.url, folders: ws.folders };
    const pend = await AI.idb.get('kv', 'pending:' + email);
    if (pend && pend.length) { store.restore(pend); store.flush().catch(() => {}); }
    else UI.sync = { state: 'saved', info: {} };
    I.loadAll();
    if (ws.duplicates) toast('Ada lebih daripada satu Sheet Annur Docs dalam Drive. Yang terkini digunakan.');
  }

  const wsFail = async (e, email) => {
    const snap = await AI.idb.get('kv', 'snapshot:' + email);
    if (snap) UI.data = snap;
    UI.sync = { state: e.needsLogin ? 'reconnect' : e.network ? 'offline' : 'error', info: { message: AI.googleErrorHint(e) } };
  };

  async function setupWorkspace(force) {
    if (UI.ws && UI.ws.ready && !force) return;
    if (UI.sync.state === 'setup') return;
    const email = auth.lastEmail();
    UI.sync = { state: 'setup', info: {} }; render();
    api = api || new AI.GoogleApi({ token: () => auth.token(), fetch: DEMO ? demoG.fetch : undefined });
    try {
      if (DEMO && !demoSeeded) { demoSeeded = true; await AI.seedDemo(api); }
      const cached = AI.local.get(WS_KEY(email), null);
      const found = await AI.findWorkspace(api, { cachedId: cached && cached.id });
      if (!found) {
        UI.sync = { state: 'idle', info: {} };
        if (UI.view !== 'setup') S.startWizard();
        render(); return;
      }
      const ws = await AI.ensureWorkspace(api, { cachedId: found.id, email, writer: AI.writerId() });
      ws.duplicates = found.duplicates;
      await openStore(ws, email);
      if (!AI.setupComplete(UI.data.syarikat) && UI.view !== 'setup') S.startWizard();
    } catch (e) { await wsFail(e, email); }
    render();
  }

  async function createWorkspace(company, folderName) {
    const email = auth.lastEmail();
    api = api || new AI.GoogleApi({ token: () => auth.token(), fetch: DEMO ? demoG.fetch : undefined });
    UI.sync = { state: 'setup', info: {} }; render();
    try {
      const ws = await AI.ensureWorkspace(api, { company, folderName, email, writer: AI.writerId() });
      await openStore(ws, email);
    } catch (e) { await wsFail(e, email); toast(AI.googleErrorHint(e), true); }
    render();
  }

  async function renameWorkspace(company) {
    const name = await AI.renameWorkspace(api, UI.ws, company);
    return name;
  }

  // nama perniagaan untuk dashboard pemilik platform (bukan data dokumen)
  function saveBusinessName(nama) {
    auth.token().then((t) => AI.fetchCheck(CFG.apiBase, t, apiFetch, { businessName: nama }))
      .then((r) => { if (r && r.body && r.body.ok && UI.lic) UI.lic.businessName = r.body.businessName; }).catch(() => {});
  }

  // ---------- tindakan ----------
  const actions = {
    async signIn() {
      UI.busy = true; UI.error = ''; render();
      try { await auth.signIn(); UI.busy = false; await runCheck(); }
      catch (e) { UI.busy = false; UI.error = e.message; render(); }
    },
    signOut() {
      if (DEMO) { root.location.href = root.location.pathname; return; }
      auth.signOut(); store = null; I.reset(); UI.lic = null; UI.ws = null; UI.data = null; UI.modal = ''; UI.form = {}; UI.formErr = {};
      UI.sync = { state: 'idle', info: {} }; UI.view = 'login'; UI.error = ''; render();
    },
    // S-17: sambung semula Google (mesti dari klik) kemudian sambung tulisan tertangguh
    async reconnect() {
      try { await auth.signIn(); } catch (e) { toast(e.message, true); return; }
      if (UI.ws && UI.ws.ready && store) store.flush().catch(() => {}); else setupWorkspace(true);
    },
    retrySync() { if (UI.ws && UI.ws.ready && store) store.flush().catch(() => {}); else setupWorkspace(true); },
    openConflict() { UI.modal = 'conflict'; render(); },
    closeModal() { UI.modal = ''; render(); },
    async resolveReload() { UI.modal = ''; render(); try { await store.resolveConflict('reload'); toast('Data terkini dimuat dari Sheet.'); } catch (e) { /* status dipaparkan */ } },
    async resolveOverwrite() { UI.modal = ''; render(); try { await store.resolveConflict('overwrite'); toast('Perubahan anda disimpan.'); } catch (e) { /* status dipaparkan */ } },
    go(el) {
      if (UI.dirty && !root.confirm('Perubahan belum disimpan. Keluar juga?')) return;
      if (UI.view === 'editor') { E.saveNow(true); UI.ed = null; }
      UI.dirty = false; UI.view = el.dataset.v; render(); root.scrollTo(0, 0);
      if (UI.view === 'rekod') E.loadDrafts();
    },
    resumeSetup() { S.startWizard(); render(); },
    async recheck() { toast('Menyemak lesen...'); await runCheck(); },
    buy() { B.actions.openLangganan(); }
  };

  // ---------- paparan ----------
  const DOC_TYPES = [['invoice', 'Invois', 'doc'], ['quotation', 'Quotation', 'quote'], ['do', 'Delivery Order', 'truck']];

  function viewLogin() {
    const noClient = !CFG.googleClientId;
    return `<div class="login">
      <div class="login-card">
        <div class="brand"><img src="brand/annurpro-icon-64.png" alt="" width="40" height="40"><div><b>${esc(CFG.appName || 'Annur Docs')}</b><small>${esc(CFG.vendor || '')}</small></div></div>
        <h1>Invois, Quotation dan DO yang kemas, dalam beberapa minit.</h1>
        <p class="muted">Log masuk dengan Google. Semua dokumen disimpan dalam Google Sheet dan Drive milik anda sendiri.</p>
        <button class="btn primary block" data-act="signIn" ${UI.busy || noClient ? 'disabled' : ''}>${icon('google')}${UI.busy ? 'Menyambung...' : 'Sambung Google'}</button>
        ${noClient ? '<p class="note warn">Mod pembangunan: Client ID Google belum diisi dalam <code>config.js</code>.</p>' : ''}
        ${UI.error ? `<p class="note danger" role="alert">${esc(UI.error)}</p>` : ''}
        <ul class="ticks"><li>10 dokumen percuma untuk mencuba</li><li>Logo, cop dan tandatangan syarikat anda</li><li>Tiada kad kredit diperlukan</li></ul>
        <a class="btn ghost block" href="?demo">Cuba demo dahulu (tanpa log masuk)</a>
        <p class="fine">Dengan log masuk, anda bersetuju dengan <a href="privasi.html">dasar privasi</a>. App hanya boleh mengakses fail yang ia cipta dalam Drive anda.</p>
      </div>
    </div>`;
  }

  function licCard(d) {
    if (!d) return '';
    let title, big, sub;
    if (d.mode === 'langganan' || d.mode === 'ihsan') {
      title = d.mode === 'ihsan' ? 'Tempoh ihsan' : 'Langganan ' + (d.plan === 'tahunan' ? 'tahunan' : 'bulanan');
      big = 'Tanpa had'; sub = d.mode === 'ihsan' ? 'Perbaharui segera' : 'Tamat ' + AI.fmtDate(d.expires);
    } else {
      title = d.trial ? 'Percubaan percuma' : 'Baki kredit';
      big = `${d.credits} kredit`; sub = `= ${d.docsLeft} dokumen · ${d.creditsPerDoc} kredit setiap dokumen`;
    }
    const stale = d.state === 'cached' ? '<span class="chip amber">Dari cache</span>' : d.state === 'unreachable' ? '<span class="chip amber">Belum disahkan</span>' : '';
    return `<section class="card lic">
      <div><small>${esc(title)} ${stale}</small><div class="big">${esc(big)}</div><small>${esc(sub)}</small></div>
      <div class="lic-acts">
        ${d.mode === 'langganan' ? '' : '<button class="btn light" data-act="buy" data-k="sub">Langgan RM20/bulan</button>'}
        <button class="btn ghost-light" data-act="recheck">Semak semula</button>
      </div>
    </section>`;
  }

  function viewHome() {
    const d = UI.lic;
    const n = AI.licenseNotice(d);
    const notice = n ? `<div class="notice ${n.tone}" role="status"><span>${esc(n.text)}</span>${n.action === 'recheck'
      ? '<button class="btn sm" data-act="recheck">Cuba lagi</button>'
      : n.tone !== 'info' ? '<button class="btn sm" data-act="buy" data-k="sub">Langgan</button>' : ''}</div>` : '';
    return `<header class="page-head"><div><small class="muted">Selamat datang</small><h1>${esc((d && d.businessName) || 'Utama')}</h1></div></header>
      ${notice}
      ${UI.ws && UI.ws.ready && !AI.setupComplete(UI.data && UI.data.syarikat) ? '<div class="notice warn"><span>Persediaan syarikat belum lengkap.</span><button class="btn sm" data-act="resumeSetup">Teruskan</button></div>' : ''}
      ${licCard(d)}
      <section class="card">
        <h2>Cipta dokumen</h2>
        <div class="quick">${DOC_TYPES.map(([t, label, ic]) => `<button class="qbtn" data-act="newDoc" data-t="${t}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
      </section>
      <section class="card">
        <h2>Dokumen terkini</h2>
        ${recentDocs()}
      </section>`;
  }

  const DOC_LABEL = { invoice: 'Invois', quotation: 'Quotation', do: 'DO' };
  function recentDocs() {
    const docs = ((UI.data && UI.data.dokumen) || []).slice()
      .sort((a, b) => String(b.diterbit_pada).localeCompare(String(a.diterbit_pada))).slice(0, 10);
    if (!docs.length) return `<div class="empty">${icon('doc', 'xl')}<p>Belum ada dokumen. Cipta yang pertama di atas.</p></div>`;
    return `<div class="dlist">${docs.map((d) => `<div class="drow"><div><b>${esc(d.no_dokumen)}</b><small class="muted">${esc(DOC_LABEL[d.jenis] || d.jenis)} · ${esc(AI.fmtDate(d.tarikh))} · ${esc(d.bill_nama)}</small></div>
      <div class="dright">${d.jenis === 'do' ? '' : `<b>${esc(AI.fmtRM(d.jumlah))}</b>`}<span class="badge ${d.status === 'Batal' ? 'red' : 'green'}">${esc(d.status)}</span></div></div>`).join('')}</div>`;
  }

  // ---------- status Sheet (pill) & dialog S-17 ----------
  const SYNC = {
    idle: ['grey', 'Belum disambung'], setup: ['blue pulse', 'Menyediakan Sheet...'], saving: ['blue pulse', 'Menyimpan...'],
    saved: ['green', 'Tersimpan'], reconnect: ['amber', 'Sambung semula'], offline: ['amber', 'Luar talian'],
    conflict: ['red', 'Konflik'], error: ['red', 'Ralat storan']
  };
  function syncPill() {
    const st = UI.sync.state, [cls, label] = SYNC[st] || SYNC.idle;
    const act = { reconnect: 'reconnect', conflict: 'openConflict', error: 'retrySync', offline: 'retrySync' }[st];
    const tip = esc((UI.sync.info && UI.sync.info.message) || '');
    return act ? `<button class="pill ${cls}" data-act="${act}" title="${tip}"><i></i>${label}</button>`
      : `<span class="pill ${cls}" title="${tip}"><i></i>${label}</span>`;
  }
  function modal() {
    if (UI.modal === 'issue' || UI.modal === 'paywall') return E.modal();
    if (UI.modal === 'docmenu' || UI.modal === 'void' || UI.modal === 'cust') return R.modal();
    if (UI.modal === 'rename') return S.renameModal();
    if (UI.modal !== 'conflict') return '';
    const r = (UI.sync.info && UI.sync.info.remote) || {};
    const t = Date.parse(r.dikemaskini || '');
    const when = Number.isFinite(t) ? new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false }) : '';
    return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="mTitle"><div class="sheet">
      <h2 id="mTitle">Sheet telah diubah di tempat lain</h2>
      <p>Data dalam Google Sheet anda dikemas kini dari peranti atau tab lain${r.oleh ? ` (${esc(r.oleh)})` : ''}${when ? ` pada ${esc(when)}` : ''}. Perubahan anda belum disimpan supaya tiada data ditimpa tanpa sedar.</p>
      <div class="sheet-acts">
        <button class="btn primary" data-act="resolveReload">Muat data terkini</button>
        <button class="btn" data-act="resolveOverwrite">Simpan versi saya</button>
        <button class="btn ghost" data-act="closeModal">Tutup</button>
      </div>
      <p class="fine">"Muat data terkini" membuang perubahan yang belum disimpan pada peranti ini.</p>
    </div></div>`;
  }

  const soon = (title, fasa, text) => `<header class="page-head"><h1>${esc(title)}</h1></header>
    <section class="card"><div class="empty">${icon('doc', 'xl')}<p>${esc(text)}</p><small class="muted">Dibina dalam ${esc(fasa)}.</small></div></section>`;

  function viewSettings() {
    const ready = !!(UI.ws && UI.ws.ready && store);
    return `<header class="page-head"><h1>Tetapan</h1></header>
      <section class="card"><h2>Akaun</h2>
        <div class="row"><span class="av">${esc(AI.initials(auth.lastEmail()))}</span><div><b>${esc(auth.lastEmail() || '-')}</b><small class="muted">Akaun Google</small></div></div>
        <button class="btn" data-act="signOut">${icon('out')}Log keluar</button>
      </section>
      <section class="card"><h2>Storan Google</h2>
        <p class="muted">Semua dokumen, pelanggan dan tetapan disimpan dalam Google Sheet dan folder Drive milik anda.</p>
        <div class="row">${syncPill()}</div>
        ${DEMO ? '<p class="note info">Dalam mod demo, "Google Sheet" dan "Drive" disimulasikan dalam memori pelayar.</p>' : UI.ws && UI.ws.ready ? `<div class="links">
          <a class="btn" href="${esc(UI.ws.url)}" target="_blank" rel="noopener">Buka Google Sheet</a>
          <a class="btn" href="https://drive.google.com/drive/folders/${esc(UI.ws.folders.root)}" target="_blank" rel="noopener">Buka folder Drive</a>
        </div>` : ''}
        <button class="btn ghost" data-act="retrySync">Semak ruang kerja</button>
      </section>
      <section class="card menu">
        <button class="mrow" data-act="openProfil" ${ready ? '' : 'disabled'}>${icon('building')}<div><b>Profil Syarikat</b><small class="muted">Nama, alamat, bank, penandatangan, warna</small></div>${icon('chev')}</button>
        <button class="mrow" data-act="openDocset" ${ready ? '' : 'disabled'}>${icon('hash')}<div><b>Dokumen, Penomboran & Cukai</b><small class="muted">Prefix, nota, terma, SST</small></div>${icon('chev')}</button>
        <button class="mrow" data-act="openImej" ${ready ? '' : 'disabled'}>${icon('image')}<div><b>Logo, Cop & Tandatangan</b><small class="muted">Muat naik gambar, susun kedudukan cop dan tandatangan</small></div>${icon('chev')}</button>
        <button class="mrow" data-act="openLangganan">${icon('card')}<div><b>Langganan &amp; Kredit</b><small class="muted">Status pelan, bayaran, sejarah kredit</small></div>${icon('chev')}</button>
        <button class="mrow" data-act="openBantuan">${icon('help')}<div><b>Bantuan &amp; Sokongan</b><small class="muted">Soalan lazim, panduan, WhatsApp</small></div>${icon('chev')}</button>
      </section>
      <p class="fine center">${esc(CFG.appName)} v${esc(CFG.version)} · ${esc(CFG.vendor)}</p>`;
  }

  const NAV = [['home', 'Utama', 'home'], ['rekod', 'Rekod', 'list'], ['new', 'Baharu', 'plus'], ['pelanggan', 'Pelanggan', 'users'], ['tetapan', 'Tetapan', 'gear']];
  function nav() {
    return `<nav class="nav" aria-label="Navigasi utama">${NAV.map(([v, label, ic]) => v === 'new'
      ? `<button class="nav-new" data-act="newDoc" data-t="invoice" aria-label="Dokumen baharu">${icon(ic)}</button>`
      : `<button class="${UI.view === v ? 'on' : ''}" data-act="go" data-v="${v}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;
  }

  function render() {
    const app = document.getElementById('app');
    if (UI.view === 'login') { app.innerHTML = viewLogin(); return; }
    if (UI.view === 'setup') { app.innerHTML = `${UI.sync.state === 'idle' ? '' : `<div class="topbar fixed">${syncPill()}</div>`}${S.views.setup()}${modal()}`; return; }
    let main;
    if (UI.view === 'home') main = viewHome();
    else if (UI.view === 'rekod') main = E.views.rekod();
    else if (UI.view === 'pelanggan') main = R.views.pelanggan();
    else if (UI.view === 'langganan') main = B.views.langganan();
    else if (UI.view === 'bantuan') main = H.views.bantuan();
    else if (UI.view === 'profil') main = S.views.profil();
    else if (UI.view === 'docset') main = S.views.docset();
    else if (UI.view === 'imej') main = I.views.imej();
    else if (UI.view === 'editor' && UI.ed) main = E.views.editor();
    else main = viewSettings();
    app.innerHTML = `<div class="shell v-${UI.view}">
      <aside class="side"><div class="brand sm"><img src="brand/annurpro-icon-64.png" alt="" width="28" height="28"><b>${esc(CFG.appName)}</b></div>${nav()}</aside>
      <div class="content">${DEMO ? '<div class="demo-bar"><span><b>Mod demo.</b> Data disimpan dalam tab ini sahaja dan hilang bila ditutup. Tiada Google atau bayaran.</span><a class="btn sm" href="./">Mula dengan Google</a></div>' : ''}<div class="topbar">${syncPill()}</div>${UI.online ? '' : '<div class="offline">Luar talian: draf boleh dicipta, terbit dokumen perlukan internet.</div>'}<main>${main}</main></div>
      <div class="bottom">${nav()}</div>
    </div>${modal()}`;
    if (UI.view === 'editor') E.fitPreview();
  }

  let toastT;
  function toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
  }

  // ---------- gambar (js/ui-images.js) dan skrin tetapan (js/ui-settings.js) ----------
  const I = AI.ImagesUI({ UI, esc, icon, toast, render, store: () => store, api: () => api, email: () => auth.lastEmail(), header: () => S.docHeader(Object.assign({}, UI.data && UI.data.syarikat, UI.form)) });
  const S = AI.SettingsUI({ UI, esc, icon, toast, render, store: () => store, createWorkspace, renameWorkspace, saveBusinessName, email: () => auth.lastEmail(),
    imgOf: I.imgOf, signStatic: I.signStatic });
  // panggilan Worker dengan token Google pengguna
  async function worker(method, path, body) {
    const t = await auth.token();
    let res;
    try {
      res = await apiFetch(String(CFG.apiBase || '').replace(/\/$/, '') + path, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { const err = new Error('Tiada sambungan ke pelayan'); err.network = true; throw err; }
    let b = {}; try { b = await res.json(); } catch (e) { /* bukan JSON */ }
    return { status: res.status, body: b };
  }
  // kemas kini kad lesen selepas terbit (tanpa menunggu /api/check)
  function onIssued(r) {
    if (!UI.lic || r.credits == null) return;
    const L = UI.lic, per = L.creditsPerDoc || 5;
    L.credits = r.credits; L.docsLeft = Math.floor(r.credits / per);
    if (L.mode === 'kredit' && r.credits < per) { L.mode = 'habis'; L.canIssue = false; L.entitled = false; L.reason = 'tiada-kredit'; }
    if (L.cache) { L.cache.credits = L.credits; L.cache.docsLeft = L.docsLeft; AI.local.set(LIC_KEY, L.cache); }
  }
  let R = null;
  UI.demo = DEMO;
  const E = AI.EditorUI({ UI, esc, icon, toast, render, store: () => store, api: () => api, email: () => auth.lastEmail(), imgOf: I.imgOf, worker, onIssued, recheck: () => runCheck(),
    demo: DEMO, linkOf: DEMO ? (id) => (demoG.files.get(id) || {}).webViewLink : null,
    recordsSection: () => R.section(), go: (v) => { if (v === 'langganan') B.actions.openLangganan(); else { UI.view = v; render(); } } });
  R = AI.RecordsUI({ UI, esc, icon, toast, render, store: () => store, email: () => auth.lastEmail(), worker, openEditor: (d) => { UI.modal = ''; E.open(d); } });
  const newDoc = E.actions.newDoc;
  E.actions.newDoc = (el) => {
    if (!(UI.ws && UI.ws.ready && UI.data)) { toast('Ruang kerja Google belum sedia. Tunggu pill "Tersimpan" atau tekan Sambung semula.', true); return; }
    if (UI.view === 'editor') E.saveNow(true);
    newDoc(el);
  };
  const B = AI.BillingUI({ UI, esc, icon, toast, render, email: () => auth.lastEmail(), worker, recheck: () => runCheck(), support: CFG.support });
  const H = AI.HelpUI({ esc, icon, email: () => auth.lastEmail(), support: CFG.support, appName: CFG.appName, version: CFG.version, go: (v) => { UI.view = v; render(); root.scrollTo(0, 0); } });
  Object.assign(actions, S.actions, I.actions, E.actions, R.actions, B.actions, H.actions);

  // ---------- mula ----------
  function boot() {
    I.bind(document);
    document.addEventListener('submit', (e) => e.preventDefault());
    const RFORMS = '[data-form="rekod"],[data-form="cust-filter"],[data-form="cust"]';
    document.addEventListener('input', (e) => {
      if (e.target.closest && e.target.closest(RFORMS)) { R.onInput(e.target); return; }
      if (!I.onInput(e.target) && !E.onInput(e.target)) S.onInput(e.target);
    });
    root.addEventListener('resize', () => { if (UI.view === 'editor') E.fitPreview(); });
    document.addEventListener('change', (e) => {
      if (I.onChange(e.target)) return;
      if (e.target.closest && e.target.closest(RFORMS)) { R.onInput(e.target); return; }
      if (e.target.closest && e.target.closest('[data-form="editor"]')) { if (e.target.type === 'checkbox') E.onInput(e.target); return; }
      if (e.target.type === 'checkbox' || e.target.type === 'radio' || e.target.tagName === 'SELECT') S.onInput(e.target);
    });
    root.addEventListener('beforeunload', (e) => { if (UI.dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const fn = actions[el.dataset.act];
      if (fn) { e.preventDefault(); fn(el); }
    });
    root.addEventListener('online', () => {
      UI.online = true; render();
      if (UI.view === 'login') return;
      runCheck();
      if (store && UI.sync.state === 'offline') store.flush().catch(() => {});
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && UI.modal && !(UI.issue && UI.issue.phase === 'running')) actions.closeModal(); });
    root.addEventListener('offline', () => { UI.online = false; render(); });
    if (DEMO) AI.drafts.list(AI.DEMO_EMAIL).then((ds) => ds.forEach((x) => AI.drafts.del(x.id))).catch(() => {});
    if (auth.has()) { UI.view = 'home'; render(); runCheck(); }
    else render();
    if ('serviceWorker' in root.navigator && (root.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname))) root.navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  AI.app = { UI, actions, render, runCheck, setupWorkspace, store: () => store };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
