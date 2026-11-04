(function (root) {
  'use strict';
  const AI = root.AI;
  const str = (v) => (v == null ? '' : String(v)).trim();

  /**
   * S-11 Langganan & Kredit: status, cara bayar melalui BCL, sejarah kredit dan bayaran.
   * ctx: { UI, esc, icon, toast, render, email(), worker(), recheck(), support }
   */
  AI.BillingUI = function (ctx) {
    const { UI, esc } = ctx;
    const REASON = { trial: 'Kredit percubaan', issue: 'Terbit dokumen', pack: 'Pek kredit', adjust: 'Pelarasan', refund: 'Pelarasan' };

    async function load() {
      UI.bill = Object.assign(UI.bill || {}, { loading: true });
      ctx.render();
      try {
        const [l, p] = await Promise.all([ctx.worker('GET', '/api/ledger?limit=50'), ctx.worker('GET', '/api/payments')]);
        UI.bill = { ledger: (l.body && l.body.entries) || [], payments: (p.body && p.body.payments) || [], loading: false };
      } catch (e) { UI.bill = { error: e.network ? 'Tiada sambungan internet.' : 'Gagal memuat sejarah.', loading: false }; }
      ctx.render();
    }

    function statusCard(L) {
      if (!L) return '';
      const sub = L.mode === 'langganan' || L.mode === 'ihsan';
      const plan = L.plan === 'tahunan' ? 'Tahunan' : L.plan === 'pilot' ? 'Pilot' : 'Bulanan';
      return `<section class="card lic">
        <div><small>${sub ? 'Langganan ' + plan : L.trial ? 'Percubaan percuma' : 'Kredit'}</small>
          <div class="big">${sub ? 'Tanpa had' : esc(L.credits) + ' kredit'}</div>
          <small>${sub ? (L.mode === 'ihsan' ? 'Tamat ' + esc(AI.fmtDate(L.expires)) + ' · tempoh ihsan ' + esc(Math.max(0, L.graceLeft || 0)) + ' hari' : 'Aktif hingga ' + esc(AI.fmtDate(L.expires)) + ` (${esc(L.daysLeft)} hari)`)
            : `= ${esc(L.docsLeft)} dokumen · ${esc(L.creditsPerDoc)} kredit setiap dokumen`}</small>
          ${sub && L.credits ? `<small>Baki kredit simpanan: ${esc(L.credits)} (tidak luput)</small>` : ''}</div>
        <div class="lic-acts"><button class="btn ghost-light" data-act="billRecheck">Semak semula</button></div></section>`;
    }

    // Pek kredit: kad harga, setara dokumen, kos sedokumen. Pulang '' bila tiada pautan atau senarai pek.
    function packCards(L, compact) {
      const packs = (L && L.packs) || [], per = (L && L.creditsPerDoc) || 5;
      if (!(L && L.buyUrls && L.buyUrls.pack) || !packs.length) return '';
      return `<div class="plans packs">${packs.map((p) => {
        const docs = Math.floor(p.credits / per), bonus = Math.round((p.credits / p.price / 10 - 1) * 100);
        return `<div class="plan${p === packs[packs.length - 1] && packs.length > 1 ? ' best' : ''}"><b>${esc(p.credits)} kredit</b>
          <div class="price">RM${esc(p.price)}</div>
          <small class="muted">${esc(docs)} dokumen · RM${esc((p.price / docs).toFixed(2))} sedokumen${!compact && bonus > 0 ? ` · bonus ${esc(bonus)}%` : ''}</small></div>`;
      }).join('')}</div>`;
    }
    AI.packCards = packCards;

    function viewLangganan() {
      const L = UI.lic, B = UI.bill || {};
      const urls = (L && L.buyUrls) || {}, email = ctx.email();
      const steps = `<ol class="paysteps">
          <li><b>Salin e-mel Google anda</b><div class="copyrow"><code>${esc(email)}</code><button class="btn sm" data-act="billCopyEmail">Salin</button></div></li>
          <li><b>Buka borang bayaran</b> dan pilih pelan.</li>
          <li>Tampal e-mel tadi dalam medan <b>"E-mel Google untuk sistem"</b>. Jika e-mel berbeza, langganan akan masuk ke akaun lain.</li>
          <li>Selepas bayaran berjaya, tekan <b>Semak semula</b>. Biasanya aktif dalam seminit.</li></ol>`;
      const ledger = B.loading ? '<p class="muted">Memuatkan...</p>' : B.error ? `<p class="note warn">${esc(B.error)}</p>`
        : !(B.ledger || []).length ? '<p class="muted">Tiada rekod.</p>'
          : `<div class="table-wrap"><table class="ltab"><thead><tr><th>Tarikh</th><th>Butiran</th><th class="num">Kredit</th><th class="num">Baki</th></tr></thead><tbody>
            ${B.ledger.map((e) => `<tr><td>${esc(AI.fmtDate(str(e.created_at).slice(0, 10)))}</td><td>${esc(REASON[e.reason] || e.reason)}${e.reason === 'issue' ? '' : e.note && e.reason !== 'trial' ? ' · ' + esc(e.note) : ''}</td>
              <td class="num ${e.delta < 0 ? 'neg' : 'pos'}">${e.delta > 0 ? '+' : ''}${esc(e.delta)}</td><td class="num">${esc(e.balance_after)}</td></tr>`).join('')}</tbody></table></div>`;
      const pays = (B.payments || []).length ? `<div class="table-wrap"><table class="ltab"><thead><tr><th>Tarikh</th><th>Item</th><th class="num">Amaun</th></tr></thead><tbody>
          ${B.payments.map((p) => `<tr><td>${esc(AI.fmtDate(str(p.created_at).slice(0, 10)))}</td><td>${esc(p.item || (p.kind === 'kredit' ? 'Pek kredit' : 'Langganan'))}${p.months ? ` (${esc(p.months)} bulan)` : ''}${p.credits ? ` (+${esc(p.credits)} kredit)` : ''}</td><td class="num">RM${esc(AI.fmtMoney(AI.toCents(p.amount) || 0))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada bayaran.</p>';
      const sup = ctx.support || {};
      return `<header class="page-head"><div><button class="link-back" data-act="go" data-v="tetapan">${ctx.icon('back')}Tetapan</button><h1>Langganan &amp; Kredit</h1></div></header>
        ${statusCard(L)}
        <section class="card"><h2>Pelan</h2>
          <div class="plans">
            <div class="plan"><b>Bulanan</b><div class="price">RM20<small>/bulan</small></div><small class="muted">Terbit dokumen tanpa had</small></div>
            <div class="plan best"><b>Tahunan</b><div class="price">RM200<small>/tahun</small></div><small class="muted">Jimat RM40 berbanding bulanan</small></div>
          </div>
          ${urls.sub ? steps : `<p class="note warn">Pembayaran dalam talian belum dibuka. Hubungi sokongan${sup.whatsapp ? ` di WhatsApp <a href="https://wa.me/6${esc(String(sup.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(sup.whatsapp)}</a>` : ''} untuk melanggan.</p>`}
          <div class="acts-row">
            ${urls.sub ? `<a class="btn primary" href="${esc(urls.sub)}" target="_blank" rel="noopener">Buka borang langganan</a>` : ''}
            <button class="btn" data-act="billRecheck">Saya sudah bayar, semak semula</button>
          </div>
          <p class="fine">Pembayaran diproses oleh BCL (FPX dan kad). AnnurPro tidak menyimpan maklumat kad atau perbankan anda.</p>
        </section>
        ${packCards(L) ? `<section class="card"><h2>Pek kredit</h2>
          <p class="muted">Bayar ikut guna. ${esc((L && L.creditsPerDoc) || 5)} kredit untuk setiap dokumen, kredit tidak luput, dan kekal disimpan semasa anda berlangganan.</p>
          ${packCards(L)}
          <p class="fine">Cara bayar sama seperti langganan: salin e-mel di atas, buka borang, pilih pek, dan tampal e-mel dalam medan <b>"E-mel Google untuk sistem"</b>.</p>
          <div class="acts-row"><a class="btn primary" href="${esc(urls.pack)}" target="_blank" rel="noopener">Beli kredit</a>
            <button class="btn" data-act="billRecheck">Saya sudah bayar, semak semula</button></div>
        </section>` : ''}
        <section class="card"><h2>Sejarah kredit</h2>${ledger}</section>
        <section class="card"><h2>Bayaran</h2>${B.loading ? '<p class="muted">Memuatkan...</p>' : pays}</section>`;
    }

    const actions = {
      openLangganan() { UI.view = 'langganan'; root.scrollTo(0, 0); load(); },
      async billCopyEmail() { try { await root.navigator.clipboard.writeText(ctx.email()); ctx.toast('E-mel disalin.'); } catch (e) { ctx.toast('Salin secara manual: ' + ctx.email(), true); } },
      async billRecheck() {
        ctx.toast('Menyemak status langganan...');
        await ctx.recheck();
        if (UI.view === 'langganan') load();
        const L = UI.lic || {};
        ctx.toast(L.mode === 'langganan' ? 'Langganan aktif hingga ' + AI.fmtDate(L.expires) + '.' : 'Status dikemas kini.');
      }
    };
    return { views: { langganan: viewLangganan }, actions, load };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
