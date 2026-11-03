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
    if (e && e.status === 403) return 'Google menolak akses (403). Pastikan anda membenarkan akses Drive semasa log masuk.';
    if (e && e.status === 404) return 'Fail tidak dijumpai dalam Drive (mungkin dipadam).';
    if (e && e.status === 429) return 'Terlalu banyak permintaan ke Google. Cuba sebentar lagi.';
    if (e && e.network) return 'Tiada sambungan internet.';
    return m || 'Ralat Google';
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

    const req = async (method, url, body) => {
      for (let attempt = 0; ; attempt++) {
        const tok = await opts.token();
        const headers = { Authorization: 'Bearer ' + tok };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        let res;
        try {
          res = await fetchFn(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        } catch (e) {
          const err = new Error('Tiada sambungan internet'); err.network = true; throw err;
        }
        if (res.ok) return res.status === 204 ? {} : res.json();
        if ([429, 500, 502, 503].includes(res.status) && attempt < retries) { await sleep(1000 * Math.pow(2, attempt)); continue; }
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { /* bukan JSON */ }
        const err = new Error(msg); err.status = res.status;
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

    // ---------- Sheets ----------
    this.info = async (id) => {
      const r = await req('GET', `${SHEETS}/${encodeURIComponent(id)}?fields=${encodeURIComponent('spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)')}`);
      return { id: r.spreadsheetId || id, url: r.spreadsheetUrl, title: r.properties && r.properties.title,
        tabs: (r.sheets || []).map((s) => ({ id: s.properties.sheetId, title: s.properties.title })) };
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
