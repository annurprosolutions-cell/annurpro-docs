(function (root) {
  'use strict';
  const AI = root.AI;
  const CFG = root.APP_CONFIG || {};
  const esc = AI.esc;
  const LIC_KEY = 'ai-lic';

  const auth = new AI.GoogleAuth(CFG.googleClientId);
  const UI = {
    view: 'login',          // login | home | rekod | pelanggan | tetapan | editor
    busy: false,
    error: '',
    lic: null,              // keputusan AI.licenseDecision
    online: root.navigator ? root.navigator.onLine !== false : true
  };

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
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
  };
  const icon = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

  // ---------- semakan lesen ----------
  async function runCheck() {
    const cache = AI.local.get(LIC_KEY, null);
    let decision;
    try {
      const token = await auth.token();
      const result = await AI.fetchCheck(CFG.apiBase, token, (...a) => root.fetch(...a));
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
  }

  // ---------- tindakan ----------
  const actions = {
    async signIn() {
      UI.busy = true; UI.error = ''; render();
      try { await auth.signIn(); UI.busy = false; await runCheck(); }
      catch (e) { UI.busy = false; UI.error = e.message; render(); }
    },
    signOut() { auth.signOut(); UI.lic = null; UI.view = 'login'; UI.error = ''; render(); },
    go(el) { UI.view = el.dataset.v; render(); root.scrollTo(0, 0); },
    async recheck() { toast('Menyemak lesen...'); await runCheck(); },
    newDoc(el) { UI.view = 'editor'; UI.newType = el.dataset.t || 'invoice'; render(); },
    buy(el) {
      const u = (UI.lic && UI.lic.buyUrls && UI.lic.buyUrls[el.dataset.k || 'sub']) || '';
      if (u) root.open(u, '_blank', 'noopener'); else toast('Pautan pembayaran belum disediakan. Hubungi sokongan.', true);
    }
  };

  // ---------- paparan ----------
  const DOC_TYPES = [['invoice', 'Invois', 'doc'], ['quotation', 'Quotation', 'quote'], ['do', 'Delivery Order', 'truck']];

  function viewLogin() {
    const noClient = !CFG.googleClientId;
    return `<div class="login">
      <div class="login-card">
        <div class="brand"><img src="brand/annurpro-icon-64.png" alt="" width="40" height="40"><div><b>${esc(CFG.appName || 'Annur Invoice')}</b><small>${esc(CFG.vendor || '')}</small></div></div>
        <h1>Invois, Quotation dan DO yang kemas, dalam beberapa minit.</h1>
        <p class="muted">Log masuk dengan Google. Semua dokumen disimpan dalam Google Sheet dan Drive milik anda sendiri.</p>
        <button class="btn primary block" data-act="signIn" ${UI.busy || noClient ? 'disabled' : ''}>${icon('google')}${UI.busy ? 'Menyambung...' : 'Sambung Google'}</button>
        ${noClient ? '<p class="note warn">Mod pembangunan: Client ID Google belum diisi dalam <code>config.js</code>.</p>' : ''}
        ${UI.error ? `<p class="note danger" role="alert">${esc(UI.error)}</p>` : ''}
        <ul class="ticks"><li>10 dokumen percuma untuk mencuba</li><li>Logo, cop dan tandatangan syarikat anda</li><li>Tiada kad kredit diperlukan</li></ul>
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
      ${licCard(d)}
      <section class="card">
        <h2>Cipta dokumen</h2>
        <div class="quick">${DOC_TYPES.map(([t, label, ic]) => `<button class="qbtn" data-act="newDoc" data-t="${t}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
      </section>
      <section class="card">
        <h2>Dokumen terkini</h2>
        <div class="empty">${icon('doc', 'xl')}<p>Belum ada dokumen. Cipta yang pertama di atas.</p></div>
      </section>`;
  }

  const soon = (title, fasa, text) => `<header class="page-head"><h1>${esc(title)}</h1></header>
    <section class="card"><div class="empty">${icon('doc', 'xl')}<p>${esc(text)}</p><small class="muted">Dibina dalam ${esc(fasa)}.</small></div></section>`;

  function viewSettings() {
    return `<header class="page-head"><h1>Tetapan</h1></header>
      <section class="card"><h2>Akaun</h2>
        <div class="row"><span class="av">${esc(AI.initials(auth.lastEmail()))}</span><div><b>${esc(auth.lastEmail() || '-')}</b><small class="muted">Akaun Google</small></div></div>
        <button class="btn" data-act="signOut">${icon('out')}Log keluar</button>
      </section>
      <section class="card"><div class="empty"><p>Profil syarikat, logo, cop, tandatangan, penomboran dan cukai.</p><small class="muted">Dibina dalam Fasa 3 dan 4.</small></div></section>
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
    let main;
    if (UI.view === 'home') main = viewHome();
    else if (UI.view === 'rekod') main = soon('Rekod', 'Fasa 7', 'Senarai Invois, Quotation dan DO akan dipaparkan di sini.');
    else if (UI.view === 'pelanggan') main = soon('Pelanggan', 'Fasa 7', 'Simpan pelanggan untuk isi Bill To dengan satu klik.');
    else if (UI.view === 'editor') main = soon(({ invoice: 'Invois', quotation: 'Quotation', do: 'Delivery Order' })[UI.newType] + ' baharu', 'Fasa 5', 'Editor dokumen dengan pratonton langsung.');
    else main = viewSettings();
    app.innerHTML = `<div class="shell">
      <aside class="side"><div class="brand sm"><img src="brand/annurpro-icon-64.png" alt="" width="28" height="28"><b>${esc(CFG.appName)}</b></div>${nav()}</aside>
      <div class="content">${UI.online ? '' : '<div class="offline">Luar talian: draf boleh dicipta, terbit dokumen perlukan internet.</div>'}<main>${main}</main></div>
      <div class="bottom">${nav()}</div>
    </div>`;
  }

  let toastT;
  function toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
  }

  // ---------- mula ----------
  function boot() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const fn = actions[el.dataset.act];
      if (fn) { e.preventDefault(); fn(el); }
    });
    root.addEventListener('online', () => { UI.online = true; render(); if (UI.view !== 'login') runCheck(); });
    root.addEventListener('offline', () => { UI.online = false; render(); });
    if (auth.has()) { UI.view = 'home'; render(); runCheck(); }
    else render();
    if ('serviceWorker' in root.navigator && root.location.protocol === 'https:') root.navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  AI.app = { UI, actions, render, runCheck };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
