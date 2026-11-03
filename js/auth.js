(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  AI.SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';

  // Log masuk Google (Google Identity Services, model token). Tiada client secret dalam pelayar.
  // Token (~1 jam) disimpan dalam sessionStorage supaya muat semula tab tidak memutuskan sambungan;
  // ia hilang bila tab ditutup. Emel terakhir diingat (localStorage) sebagai hint sambung semula.
  AI.GoogleAuth = function (clientId, opts) {
    opts = opts || {};
    const KEY = opts.key || 'ai-gauth', HINT = KEY + '-hint';
    const fetchFn = opts.fetch || ((...a) => root.fetch(...a));
    let s = AI.session.get(KEY, null) || {};
    let token = s.token || null, exp = s.exp || 0, mail = s.mail || AI.local.get(HINT, '') || '';
    const persist = () => { if (token) AI.session.set(KEY, { token, exp, mail }); else AI.session.del(KEY); if (mail) AI.local.set(HINT, mail); };

    const load = () => new Promise((res, rej) => {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) { res(); return; }
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
      sc.onload = () => res();
      sc.onerror = () => rej(new Error('Gagal memuat log masuk Google. Semak sambungan internet.'));
      document.head.appendChild(sc);
    });

    this.has = () => !!token && Date.now() < exp - 60000;
    this.lastEmail = () => mail;

    // Mesti dipanggil terus daripada klik pengguna (popup).
    this.signIn = async () => {
      if (!clientId) throw new Error('Client ID Google belum diisi dalam config.js.');
      await load();
      token = await new Promise((res, rej) => {
        const client = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope: AI.SCOPE, hint: mail || undefined,
          callback: (r) => {
            if (r && r.access_token) { exp = Date.now() + (r.expires_in || 3600) * 1000; res(r.access_token); }
            else rej(new Error((r && (r.error_description || r.error)) || 'Log masuk gagal'));
          },
          error_callback: (e) => rej(new Error(e && e.type === 'popup_closed' ? 'Tetingkap log masuk ditutup.'
            : e && e.type === 'popup_failed_to_open' ? 'Popup disekat oleh pelayar. Benarkan popup untuk laman ini, kemudian cuba lagi.'
              : (e && (e.message || e.type)) || 'Log masuk gagal'))
        });
        client.requestAccessToken({ prompt: '' });
      });
      try {
        const r = await fetchFn('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
        if (r.ok) mail = String((await r.json()).email || '').toLowerCase();
      } catch (e) { /* emel akan datang dari /api/check */ }
      persist();
      return token;
    };

    this.token = async () => {
      if (this.has()) return token;
      const err = new Error('Sesi Google tamat. Tekan "Sambung semula".'); err.status = 401; err.needsLogin = true; throw err;
    };
    this.setEmail = (e) => { mail = String(e || '').toLowerCase(); persist(); };

    this.signOut = () => {
      if (token && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(token, () => {});
      token = null; exp = 0; persist();
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
