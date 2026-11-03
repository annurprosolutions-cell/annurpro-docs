(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  AI.LIC_CACHE_DAYS = 7; // guna semakan lepas bila Worker tak dapat dihubungi
  const WARN_DAYS = 14, URGENT_DAYS = 3, LOW_CREDITS = 10;

  // POST /api/check. Pulang { status, body } atau lontar ralat (status) bila pelayan tak menjawab.
  AI.fetchCheck = async (apiBase, token, fetchFn, body) => {
    const res = await fetchFn(String(apiBase || '').replace(/\/$/, '') + '/api/check', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    let b = null;
    try { b = await res.json(); } catch (e) { /* bukan JSON */ }
    if (res.ok || (b && b.reason)) return { status: res.status, body: b || {} };
    const err = new Error('Pelayan lesen tidak menjawab (HTTP ' + res.status + ')'); err.status = res.status; throw err;
  };

  const pick = (b) => ({
    email: b.email || '', businessName: b.businessName || '', mode: b.mode || 'habis', entitled: !!b.entitled,
    trial: !!b.trial, credits: b.credits || 0, creditsPerDoc: b.creditsPerDoc || 5, docsLeft: b.docsLeft || 0,
    plan: b.plan || null, expires: b.expires || null, daysLeft: b.daysLeft == null ? null : b.daysLeft,
    graceLeft: b.graceLeft == null ? null : b.graceLeft, buyUrls: b.buyUrls || {}, reason: b.reason || ''
  });

  /**
   * Keputusan lesen (tulen). Data dan draf pengguna TIDAK pernah dikunci; yang dikawal hanya "terbit".
   * o.result: { body } daripada /api/check; o.error: ralat rangkaian; o.cache: semakan lepas; o.email; o.now
   * Pulang { state: 'live'|'cached'|'unreachable'|'denied', canIssue, ...pick, message, cache }
   */
  AI.licenseDecision = (o) => {
    const now = o.now != null ? o.now : Date.now();
    if (o.result) {
      const b = o.result.body || {};
      if (o.result.status === 401 || b.reason === 'token-tidak-sah') {
        return Object.assign(pick({}), { state: 'denied', canIssue: false, needsLogin: true, message: 'Sesi Google tidak sah. Log masuk semula.', cache: o.cache || null });
      }
      if (b.ok) {
        const d = pick(b);
        return Object.assign(d, { state: 'live', canIssue: d.entitled, message: '', cache: Object.assign({ checkedAt: now }, d) });
      }
      return Object.assign(pick(b), { state: 'unreachable', canIssue: false, message: b.error || 'Semakan lesen gagal. Cuba sebentar lagi.', cache: o.cache || null });
    }
    const c = o.cache;
    if (c && o.email && c.email === o.email && now - c.checkedAt <= AI.LIC_CACHE_DAYS * 864e5) {
      return Object.assign(pick(c), { state: 'cached', canIssue: !!c.entitled, message: 'Lesen disahkan sebelum ini. Akan disemak semula bila sambungan pulih.', cache: c });
    }
    return Object.assign(pick({ email: o.email }), { state: 'unreachable', canIssue: false,
      message: 'Tidak dapat menyemak lesen (tiada sambungan ke pelayan). Draf masih boleh dibuat; terbit dokumen bila sambungan pulih.', cache: c || null });
  };

  // Notis untuk skrin Utama (AFD §7). Pulang { tone: info|warn|urgent|critical, text, action } atau null.
  AI.licenseNotice = (d) => {
    if (!d || d.state === 'unreachable' || d.state === 'denied') return d && d.message ? { tone: 'warn', text: d.message, action: 'recheck' } : null;
    if (d.mode === 'langganan') {
      if (d.daysLeft != null && d.daysLeft <= URGENT_DAYS) return { tone: 'urgent', text: `Langganan tamat dalam ${d.daysLeft} hari (${AI.fmtDate(d.expires)}). Perbaharui supaya terbit dokumen tidak terganggu.`, action: 'buy-sub' };
      if (d.daysLeft != null && d.daysLeft <= WARN_DAYS) return { tone: 'warn', text: `Langganan tamat pada ${AI.fmtDate(d.expires)} (${d.daysLeft} hari lagi).`, action: 'buy-sub' };
      return null;
    }
    if (d.mode === 'ihsan') return { tone: 'urgent', text: `Langganan telah tamat. Tempoh ihsan berakhir dalam ${Math.max(0, d.graceLeft || 0)} hari. Perbaharui sekarang.`, action: 'buy-sub' };
    if (d.mode === 'habis') {
      return { tone: 'critical', text: d.reason === 'tamat'
        ? 'Langganan telah tamat dan baki kredit tidak cukup. Data anda selamat; langgan semula untuk terus terbit dokumen.'
        : `Baki kredit tidak cukup untuk terbit dokumen (${d.credits} kredit, perlu ${d.creditsPerDoc}). Data anda selamat.`, action: 'buy-sub' };
    }
    if (d.mode === 'kredit') {
      if (d.trial && d.docsLeft <= 3) return { tone: 'warn', text: `Percubaan percuma hampir habis: ${d.docsLeft} dokumen lagi. Langgan untuk terbit tanpa had.`, action: 'buy-sub' };
      if (d.trial) return null; // baki percubaan sudah jelas pada kad lesen
      if (d.credits < LOW_CREDITS) return { tone: 'warn', text: `Baki kredit rendah: ${d.credits} kredit (${d.docsLeft} dokumen).`, action: 'buy-sub' };
    }
    return null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
