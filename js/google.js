(function (root) {
  'use strict';
  const AI = root.AI || (root.AI = {});

  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
  const MIME_FOLDER = 'application/vnd.google-apps.folder';
  AI.MIME_SHEET = MIME_SHEET; AI.MIME_FOLDER = MIME_FOLDER;

  const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; // literal rentetan dalam pertanyaan Drive
  AI.range = (tab, a1) => "'" + String(tab).replace(/'/g, "''") + "'" + (a1 ? '!' + a1 : '');

  // Mesej mesra untuk ralat Google biasa
  AI.googleErrorHint = (e) => {
    const m = String((e && e.message) || '');
    if (e && e.status === 401) return 'Sesi Google tamat. Tekan "Sambung semula".';
    if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m)) return 'Google Sheets API atau Drive API belum diaktifkan dalam projek Google Cloud.';
    if (e && e.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(String(e.reason) + ' ' + m)) return 'Kebenaran Drive belum lengkap. Akses perlu diberikan semula.';
    if (e && e.status === 403 && /storageQuotaExceeded|quota.*(storage|drive)|storage quota/i.test(String(e.reason) + ' ' + m)) return 'Ruang Google Drive anda penuh.';
    if (e && e.status === 403 && /rateLimit|userRateLimit|quotaExceeded/i.test(String(e.reason) + ' ' + m)) return 'Terlalu banyak permintaan ke Google. Cuba sebentar lagi.';
    if (e && e.status === 403) return 'Google menolak akses (403). Pastikan anda membenarkan akses Drive semasa log masuk.';
    if (e && e.status === 404) return 'Fail tidak dijumpai dalam Drive (mungkin dipadam).';
    if (e && e.status === 429) return 'Terlalu banyak permintaan ke Google. Cuba sebentar lagi.';
    if (e && e.network) return 'Tiada sambungan internet.';
    return m || 'Ralat Google';
  };

  // Maklumat ralat untuk dipaparkan (bukan tooltip): mesej, butiran teknikal dan langkah yang boleh dibuat pengguna
  AI.syncInfo = (e) => ({ message: AI.googleErrorHint(e), detail: { status: (e && e.status) || 0, reason: String((e && e.reason) || ''), raw: String((e && e.message) || '').slice(0, 200) } });
  AI.inAppBrowser = (ua) => /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Line\/|MicroMessenger|; wv\)/i.test(String(ua || ''));
  AI.syncAdvice = (info, ua) => {
    const d = (info && info.detail) || {}, m = String((info && info.message) || ''), out = [];
    if (AI.inAppBrowser(ua)) out.push('Anda mungkin membuka app dalam pelayar dalam aplikasi lain (Facebook, Instagram, TikTok, WhatsApp). Salin pautan dan buka dalam Chrome atau Safari.');
    if (/Kebenaran Drive|menolak akses/.test(m)) out.push('Tekan Log keluar di bawah. Buka myaccount.google.com/permissions, pilih Annur Docs dan buang akses. Kemudian log masuk semula dan benarkan akses Drive.');
    else if (/Ruang Google Drive/.test(m)) out.push('Kosongkan ruang pada drive.google.com/settings/storage, kemudian tekan Cuba lagi.');
    else if (/Terlalu banyak|HTTP 5\d\d/.test(m) || d.status >= 500 || d.status === 429) out.push('Tunggu seminit, kemudian tekan Cuba lagi. Ini biasanya sementara.');
    else if (/belum diaktifkan/.test(m)) out.push('Pemilik sistem: aktifkan Google Sheets API dan Google Drive API dalam Google Cloud Console (APIs & Services).');
    else if (d.status === 404 || /tidak dijumpai/.test(m)) out.push('Semak sama ada folder atau Google Sheet Annur Docs masih ada dalam Drive anda (periksa juga Trash). Jika dipadam, pulihkan dari Trash.');
    else if (/Tiada sambungan/.test(m)) out.push('Semak sambungan internet, kemudian tekan Cuba lagi.');
    else out.push('Tekan Cuba lagi. Jika berulang, log keluar dan log masuk semula, atau hubungi sokongan dengan butang Salin butiran.');
    return out;
  };

  /**
   * Klien kecil Google Sheets v4 + Drive v3.
   * opts: { token: async () => string, fetch, sleep(ms), retries }
   * Cuba semula dengan backoff untuk 429/500/502/503 (sehingga `retries` kali).
   */
  AI.GoogleApi = function (opts) {
    const fetchFn = opts.fetch || ((...a) => root.fetch(...a));
    const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const retries = opts.retries == null ? 3 : opts.retries;

    // opt: { raw: true, contentType } hantar `body` mentah (bait); { bytes: true } pulang { bytes, type } bukan JSON
    const req = async (method, url, body, opt) => {
      opt = opt || {};
      for (let attempt = 0; ; attempt++) {
        const tok = await opts.token();
        const headers = { Authorization: 'Bearer ' + tok };
        if (body !== undefined) headers['Content-Type'] = opt.raw ? (opt.contentType || 'application/octet-stream') : 'application/json';
        let res;
        try {
          res = await fetchFn(url, { method, headers, body: body !== undefined ? (opt.raw ? body : JSON.stringify(body)) : undefined });
        } catch (e) {
          const err = new Error('Tiada sambungan internet'); err.network = true; throw err;
        }
        if (res.ok) {
          if (opt.bytes) return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') || '' };
          return res.status === 204 ? {} : res.json();
        }
        if ([429, 500, 502, 503].includes(res.status) && attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
        let msg = 'HTTP ' + res.status, reason = '';
        try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; reason = String((((j || {}).error || {}).errors || [])[0] && j.error.errors[0].reason || ((j || {}).error || {}).status || ''); } catch (e) { /* bukan JSON */ }
        const err = new Error(msg); err.status = res.status; err.reason = reason;
        if (res.status === 401) err.needsLogin = true;
        throw err;
      }
    };
    this.req = req;

    // ---------- Drive ----------
    this.listFiles = async (query, fields) => {
      const u = `${DRIVE}/files?q=${encodeURIComponent(query)}&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=20&fields=${encodeURIComponent(fields || 'files(id,name,mimeType,modifiedTime,parents,appProperties)')}`;
      return (await req('GET', u)).files || [];
    };
    this.findByMark = (value, mime) => this.listFiles(`appProperties has { key=${q(AI.APP_MARK)} and value=${q(value)} } and mimeType=${q(mime)} and trashed=false`);
    this.findChildFolder = async (parentId, name) => (await this.listFiles(`name=${q(name)} and mimeType=${q(MIME_FOLDER)} and ${q(parentId)} in parents and trashed=false`))[0] || null;
    this.createFile = (meta) => req('POST', `${DRIVE}/files?fields=${encodeURIComponent('id,name,webViewLink')}`, meta);
    this.createFolder = (name, parentId, mark) => this.createFile(Object.assign({ name, mimeType: MIME_FOLDER },
      parentId ? { parents: [parentId] } : {}, mark ? { appProperties: { [AI.APP_MARK]: mark } } : {}));
    this.updateFile = (id, meta) => req('PATCH', `${DRIVE}/files/${encodeURIComponent(id)}?fields=id,name`, meta);
    this.trash = (id) => this.updateFile(id, { trashed: true });
    // kongsi "sesiapa dengan pautan boleh lihat"
    this.share = (id) => req('POST', `${DRIVE}/files/${encodeURIComponent(id)}/permissions?fields=id`, { role: 'reader', type: 'anyone' });
    this.findByProp = (key, value, mime) => this.listFiles(`appProperties has { key=${q(key)} and value=${q(value)} } and mimeType=${q(mime)} and trashed=false`, 'files(id,name,webViewLink,appProperties)');
    // kandungan fail: muat naik (media) dan muat turun (alt=media)
    this.uploadBytes = (id, bytes, mime) => req('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id`, bytes, { raw: true, contentType: mime });
    this.downloadBytes = (id) => req('GET', `${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, undefined, { bytes: true });

    // ---------- Sheets ----------
    this.info = async (id) => {
      const r = await req('GET', `${SHEETS}/${encodeURIComponent(id)}?fields=${encodeURIComponent('spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))')}`);
      return { id: r.spreadsheetId || id, url: r.spreadsheetUrl, title: r.properties && r.properties.title,
        tabs: (r.sheets || []).map((s) => ({ id: s.properties.sheetId, title: s.properties.title, cols: (s.properties.gridProperties || {}).columnCount || 0 })) };
    };
    this.batchUpdate = (id, requests) => req('POST', `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, { requests });
    this.batchGet = async (id, tabs) => {
      const qs = tabs.map((t) => 'ranges=' + encodeURIComponent(AI.range(t))).join('&');
      const r = await req('GET', `${SHEETS}/${encodeURIComponent(id)}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      const out = {};
      (r.valueRanges || []).forEach((vr, i) => { out[tabs[i]] = vr.values || []; });
      return out;
    };
    this.getValues = async (id, tab) => (await this.batchGet(id, [tab]))[tab];
    this.setValues = (id, data) => req('POST', `${SHEETS}/${encodeURIComponent(id)}/values:batchUpdate`, { valueInputOption: 'RAW', data });
    this.append = (id, tab, rows) => req('POST', `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(AI.range(tab, 'A1'))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: rows });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
