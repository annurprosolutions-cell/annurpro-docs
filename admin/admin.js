// Dashboard pemilik platform (S-14). Akses disemak di Worker: token Google dengan e-mel dalam OWNER_EMAILS.
(function (root) {
  'use strict';
  const AI = root.AI, CFG = root.APP_CONFIG || {}, esc = AI.esc;
  const auth = new AI.GoogleAuth(CFG.googleClientId, { key: 'ai-admin-gauth' });
  const S = { view: 'login', tab: 'pelanggan', q: '', data: null, error: '', busy: false, result: '' };
  const api = async (method, path, body) => {
    const t = await auth.token();
    const r = await root.fetch(String(CFG.apiBase || '').replace(/\/$/, '') + path, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, body: j };
  };
  const STATE = { langganan: ['green', 'Langganan'], ihsan: ['amber', 'Ihsan'], tamat: ['red', 'Tamat'], kredit: ['blue', 'Kredit'], habis: ['grey', 'Tiada kredit'] };
  const rm = (n) => 'RM' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dt = (iso) => (iso ? AI.fmtDate(String(iso).slice(0, 10)) : '—');

  async function load() {
    S.busy = true; render();
    try {
      const r = await api('GET', '/api/admin/overview');
      if (r.status === 403) { S.view = 'denied'; S.error = 'E-mel ini bukan pemilik platform (OWNER_EMAILS).'; }
      else if (!r.body.ok) { S.error = r.body.error || 'Gagal memuat (HTTP ' + r.status + ')'; }
      else { S.data = r.body; S.view = 'main'; S.error = ''; }
    } catch (e) { S.error = e.needsLogin ? 'Sesi tamat. Log masuk semula.' : 'Tiada sambungan.'; if (e.needsLogin) S.view = 'login'; }
    S.busy = false; render();
  }
  function toast(m, bad) { const t = document.getElementById('toast'); t.textContent = m; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3500); }
  async function act(path, body, okMsg) {
    const r = await api('POST', path, body);
    if (r.body && r.body.ok) { toast(okMsg(r.body)); await load(); } else toast((r.body && (r.body.error || r.body.reason)) || 'Gagal (HTTP ' + r.status + ')', true);
    return r;
  }

  const actions = {
    async signIn() { try { await auth.signIn(); await load(); } catch (e) { S.error = e.message; render(); } },
    signOut() { auth.signOut(); S.view = 'login'; S.data = null; render(); },
    reload() { load(); },
    tab(el) { S.tab = el.dataset.t; render(); },
    addMonths(el) { const n = Number(el.dataset.n); if (root.confirm(`Tambah ${n} bulan untuk ${el.dataset.e}?`)) act('/api/admin/subscription', { email: el.dataset.e, addMonths: n }, (b) => `${b.email}: aktif hingga ${dt(b.expires)}`); },
    setExpiry(el) {
      const v = root.prompt(`Tarikh tamat baharu untuk ${el.dataset.e} (YYYY-MM-DD):`, el.dataset.x || ''); if (!v) return;
      act('/api/admin/subscription', { email: el.dataset.e, expires: v.trim() }, (b) => `${b.email}: tamat ${dt(b.expires)}`);
    },
    credits(el) {
      const v = root.prompt(`Laras kredit ${el.dataset.e} (cth 25 atau -10):`); if (!v) return;
      const note = root.prompt('Sebab pelarasan:'); if (!note) return;
      act('/api/admin/credits', { email: el.dataset.e, delta: Number(v), note }, (b) => `${b.email}: baki ${b.credits} kredit`);
    },
    async newLicence() {
      const email = (document.getElementById('nlEmail').value || '').trim(), n = Number(document.getElementById('nlMonths').value);
      await act('/api/admin/subscription', { email, addMonths: n }, (b) => `${b.email}: aktif hingga ${dt(b.expires)}`);
    },
    async verify() {
      const order = (document.getElementById('voOrder').value || '').trim(), email = (document.getElementById('voEmail').value || '').trim();
      const r = await api('POST', '/api/admin/verify-order', { order, email });
      S.result = JSON.stringify(r.body, null, 2); render();
      if (r.body.ok && !r.body.duplicate) { toast('Pesanan diproses.'); load(); }
    }
  };

  function viewMain() {
    const D = S.data, st = D.stats;
    const card = (l, v, cls) => `<div class="stat ${cls || ''}"><small>${l}</small><b>${v}</b></div>`;
    const q = S.q.toLowerCase();
    const tenants = D.tenants.filter((t) => !q || t.email.includes(q) || String(t.business_name || '').toLowerCase().includes(q));
    const tabs = [['pelanggan', `Pelanggan (${D.tenants.length})`], ['bayaran', `Bayaran (${D.payments.length})`], ['log', 'Log webhook'], ['tindakan', 'Tindakan']];
    let body = '';
    if (S.tab === 'pelanggan') {
      body = `<input class="inp" id="q" placeholder="Cari e-mel atau nama syarikat" value="${esc(S.q)}" style="max-width:360px;margin-bottom:10px">
        <div class="table-wrap"><table class="atab"><thead><tr><th>Pelanggan</th><th>Status</th><th>Tamat</th><th class="num">Kredit</th><th class="num">Dokumen</th><th>Terakhir aktif</th><th></th></tr></thead><tbody>
        ${tenants.map((t) => { const [tone, label] = STATE[t.state] || ['grey', t.state]; return `<tr data-email="${esc(t.email)}">
          <td><b>${esc(t.business_name || '—')}</b><small>${esc(t.email)}</small></td>
          <td><span class="badge ${tone}">${label}</span>${t.plan ? `<small>${esc(t.plan)}</small>` : ''}</td>
          <td>${dt(t.expires)}${t.daysLeft != null ? `<small>${t.daysLeft >= 0 ? t.daysLeft + ' hari lagi' : -t.daysLeft + ' hari lalu'}</small>` : ''}</td>
          <td class="num">${esc(t.credits)}</td><td class="num">${esc(t.docs)}</td><td>${dt(t.last_seen)}</td>
          <td><div class="acts"><button class="btn" data-act="addMonths" data-n="1" data-e="${esc(t.email)}">+1 bln</button><button class="btn" data-act="addMonths" data-n="12" data-e="${esc(t.email)}">+12 bln</button>
            <button class="btn" data-act="setExpiry" data-e="${esc(t.email)}" data-x="${esc(t.expires || '')}">Tarikh</button><button class="btn" data-act="credits" data-e="${esc(t.email)}">Kredit ±</button></div></td></tr>`; }).join('')}
        </tbody></table></div>`;
    } else if (S.tab === 'bayaran') {
      body = `<div class="table-wrap"><table class="atab"><thead><tr><th>Tarikh</th><th>Pesanan</th><th>Pelanggan</th><th>Item</th><th class="num">Amaun</th></tr></thead><tbody>
        ${D.payments.map((p) => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.order_no)}</td><td>${esc(p.email)}</td><td>${esc(p.item || p.kind)}${p.months ? `<small>${p.months} bulan</small>` : ''}${p.credits ? `<small>+${p.credits} kredit</small>` : ''}</td><td class="num">${rm(p.amount)}</td></tr>`).join('') || '<tr><td colspan="5">Tiada bayaran.</td></tr>'}</tbody></table></div>`;
    } else if (S.tab === 'log') {
      body = `<p class="fine">Webhook BCL tidak dicuba semula oleh BCL. Untuk baris gagal: semak di BCL → Webhook Logs → Resend, atau guna "Sahkan pesanan" dalam tab Tindakan.</p>
        <div class="table-wrap"><table class="atab"><thead><tr><th>Masa</th><th>Pesanan</th><th>Hasil</th><th>Butiran</th></tr></thead><tbody>
        ${D.logs.map((l) => `<tr><td>${esc(String(l.ts).replace('T', ' ').slice(0, 16))}</td><td>${esc(l.order_no || '—')}</td><td><span class="badge ${l.ok ? 'green' : 'red'}">${l.ok ? 'OK' : 'Gagal'}</span></td><td class="detail">${esc(l.detail)}</td></tr>`).join('') || '<tr><td colspan="4">Tiada log.</td></tr>'}</tbody></table></div>`;
    } else {
      body = `<div class="adm-form"><h3>Sahkan pesanan BCL (webhook terlepas)</h3>
          <div class="row2"><input class="inp" id="voOrder" placeholder="No. pesanan BCL"><input class="inp" id="voEmail" placeholder="E-mel Google (pilihan)"></div>
          <button class="btn primary" data-act="verify">Sahkan &amp; proses</button>${S.result ? `<pre class="detail">${esc(S.result)}</pre>` : ''}
          <h3>Beri langganan (pilot / manual)</h3>
          <div class="row2"><input class="inp" id="nlEmail" placeholder="E-mel Google pelanggan"><select class="inp" id="nlMonths"><option value="1">1 bulan</option><option value="3">3 bulan</option><option value="12">12 bulan</option></select></div>
          <button class="btn" data-act="newLicence">Beri langganan</button></div>`;
    }
    return `<div class="adm"><header class="adm-head"><div class="brand"><img src="../brand/annurpro-icon-64.png" alt="" width="36" height="36"><div><b>Dashboard Pemilik</b><small>${esc(auth.lastEmail())} · ${dt(D.today)}</small></div></div>
        <div class="acts-row"><button class="btn" data-act="reload">${S.busy ? 'Memuat...' : 'Muat semula'}</button><button class="btn ghost" data-act="signOut">Log keluar</button></div></header>
      <div class="stats">${card('Pelanggan', st.tenants)}${card('Berlangganan', st.subscribed)}${card('Kredit sahaja', st.creditOnly)}${card('MRR', rm(st.mrr))}${card('Hasil 30 hari', rm(st.revenue30))}
        ${card('Dokumen 30 hari', st.docs30)}${card('Tamat ≤ 14 hari', st.expiring14, st.expiring14 ? 'warn' : '')}${card('Webhook gagal 7 hari', st.failedWebhooks7, st.failedWebhooks7 ? 'bad' : '')}</div>
      <section class="card"><div class="seg">${tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>${body}</section></div>`;
  }
  function render() {
    const app = document.getElementById('app');
    if (S.view === 'main' && S.data) { app.innerHTML = viewMain(); return; }
    app.innerHTML = `<div class="login"><div class="login-card"><div class="brand"><img src="../brand/annurpro-icon-64.png" alt="" width="40" height="40"><div><b>Dashboard Pemilik</b><small>Annur Docs</small></div></div>
      <h1>Log masuk pemilik</h1><p class="muted">Hanya e-mel dalam OWNER_EMAILS pada Worker boleh masuk.</p>
      <button class="btn primary block" data-act="signIn" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Menyambung...' : 'Sambung Google'}</button>
      ${S.error ? `<p class="note danger" role="alert">${esc(S.error)}</p>` : ''}${S.view === 'denied' ? '<button class="btn ghost block" data-act="signOut">Guna akaun lain</button>' : ''}</div></div>`;
  }
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el); } });
  document.addEventListener('input', (e) => { if (e.target.id === 'q') { S.q = e.target.value; const pos = e.target.selectionStart; render(); const q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos); } });
  if (auth.has()) load(); else render();
  root.AI_ADMIN = { S, load };
})(window);
