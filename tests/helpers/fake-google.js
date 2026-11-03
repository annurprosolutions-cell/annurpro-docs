// Google Sheets v4 + Drive v3 palsu (dalam memori) untuk ujian unit dan E2E.
// Meniru hanya endpoint yang digunakan oleh js/google.js. Baris/sel kosong di hujung dibuang seperti Google.
function fakeGoogle(token) {
  const files = new Map();   // id → { id, name, mimeType, parents, appProperties, trashed, modifiedTime }
  const books = new Map();   // id → { title, tabs: [{ id, title, rows }] , formats: [] }
  const calls = [];
  let seq = 0, clock = 0, failQueue = [];
  const nid = (p) => p + (++seq) + 'x'.repeat(24);
  const resp = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const err = (status, message) => resp(status, { error: { code: status, message } });

  const colNum = (s) => s.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const parseRange = (book, raw) => {
    const m = String(raw).match(/^'((?:[^']|'')+)'(?:!([A-Z]+)(\d+)(?::[A-Z]*\d*)?)?$/);
    if (!m) return null;
    const tab = book.tabs.find((t) => t.title === m[1].replace(/''/g, "'"));
    if (!tab) return null;
    return { tab, col: m[2] ? colNum(m[2]) - 1 : 0, row: m[3] ? +m[3] - 1 : 0 };
  };
  const trim = (rows) => {
    const out = rows.map((r) => { const x = (r || []).map((c) => (c == null ? '' : c)); while (x.length && x[x.length - 1] === '') x.pop(); return x; });
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  };
  const touch = (id) => { const f = files.get(id); if (f) f.modifiedTime = new Date(Date.UTC(2026, 0, 1) + (++clock) * 1000).toISOString(); };

  // pertanyaan Drive ringkas: gabungan syarat "and"
  const matchQ = (f, q) => {
    const conds = [];
    const ap = q.match(/appProperties has \{ key='([^']*)' and value='([^']*)' \}/);
    if (ap) conds.push(() => f.appProperties && f.appProperties[ap[1]] === ap[2]);
    const mt = q.match(/mimeType='([^']*)'/); if (mt) conds.push(() => f.mimeType === mt[1]);
    const nm = q.match(/(?:^|\s)name='((?:[^'\\]|\\.)*)'/); if (nm) conds.push(() => f.name === nm[1].replace(/\\(.)/g, '$1'));
    const pa = q.match(/'([^']*)' in parents/); if (pa) conds.push(() => (f.parents || []).includes(pa[1]));
    if (/trashed=false/.test(q)) conds.push(() => !f.trashed);
    return conds.every((c) => c());
  };

  async function fetch(url, init) {
    init = init || {};
    const method = init.method || 'GET';
    const u = new URL(url);
    calls.push(method + ' ' + u.pathname + (u.search ? '?' : ''));
    const auth = (init.headers || {}).Authorization || (init.headers || {}).authorization;
    if (auth !== 'Bearer ' + token) return err(401, 'Invalid Credentials');
    if (failQueue.length) { const s = failQueue.shift(); return err(s, 'Simulasi ralat ' + s); }
    const p = u.pathname;
    // muat naik kandungan mentah (uploadType=media)
    const up = p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (up && method === 'PATCH') {
      const f = files.get(decodeURIComponent(up[1])); if (!f) return err(404, 'File not found');
      f.bytes = Uint8Array.from(init.body instanceof Uint8Array || Buffer.isBuffer(init.body) ? init.body : Buffer.from(init.body || ''));
      f.contentType = (init.headers || {})['Content-Type'] || 'application/octet-stream'; touch(f.id);
      return resp(200, { id: f.id });
    }
    const body = init.body ? JSON.parse(init.body) : null;

    // ---------- Drive ----------
    if (p === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') || '';
      const list = [...files.values()].filter((f) => matchQ(f, q)).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
      return resp(200, { files: list.map((f) => ({ ...f })) });
    }
    if (p === '/drive/v3/files' && method === 'POST') {
      const isSheet = body.mimeType === 'application/vnd.google-apps.spreadsheet';
      const id = nid(isSheet ? 'sheet' : 'fold');
      files.set(id, { id, name: body.name, mimeType: body.mimeType, parents: body.parents || [], appProperties: body.appProperties || {}, trashed: false,
        webViewLink: 'https://drive.google.com/file/d/' + id + '/view', permissions: [] });
      touch(id);
      if (isSheet) books.set(id, { title: body.name, tabs: [{ id: 0, title: 'Sheet1', rows: [] }], formats: [] });
      return resp(200, { id, name: body.name, webViewLink: files.get(id).webViewLink });
    }
    const pm = p.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/);
    if (pm && method === 'POST') {
      const f = files.get(decodeURIComponent(pm[1])); if (!f) return err(404, 'File not found');
      if (fakeGoogle.blockShare) return err(403, 'The user does not have sufficient permissions for this file.');
      f.permissions.push(body); return resp(200, { id: 'anyoneWithLink' });
    }
    const fm = p.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (fm && method === 'GET' && u.searchParams.get('alt') === 'media') {
      const f = files.get(decodeURIComponent(fm[1]));
      if (!f || !f.bytes) return err(404, 'File not found');
      if (f.trashed) return err(404, 'File not found');
      return new Response(f.bytes, { status: 200, headers: { 'content-type': f.contentType || 'application/octet-stream' } });
    }
    if (fm && method === 'PATCH') {
      const f = files.get(fm[1]); if (!f) return err(404, 'File not found');
      Object.assign(f, body); if (body.name && books.get(f.id)) books.get(f.id).title = body.name; touch(f.id);
      return resp(200, { id: f.id, name: f.name });
    }

    // ---------- Sheets ----------
    const sm = p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
    if (!sm) return err(404, 'Tidak disokong: ' + p);
    const id = decodeURIComponent(sm[1]);
    const book = books.get(id);
    if (!book || (files.get(id) && files.get(id).trashed)) return err(404, 'Requested entity was not found.');
    const rest = decodeURIComponent(sm[2]);
    if (rest === '' && method === 'GET') {
      return resp(200, { spreadsheetId: id, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
        properties: { title: book.title }, sheets: book.tabs.map((t) => ({ properties: { sheetId: t.id, title: t.title } })) });
    }
    if (rest === ':batchUpdate' && method === 'POST') {
      for (const r of body.requests) {
        if (r.addSheet) {
          const title = r.addSheet.properties.title;
          if (book.tabs.some((t) => t.title === title)) return err(400, 'A sheet with the name "' + title + '" already exists.');
          book.tabs.push({ id: 1000 + (++seq), title, rows: [] });
        } else if (r.deleteSheet) {
          book.tabs = book.tabs.filter((t) => t.id !== r.deleteSheet.sheetId);
          if (!book.tabs.length) return err(400, 'cannot delete last sheet');
        } else book.formats.push(r);
      }
      touch(id);
      return resp(200, { replies: [] });
    }
    if (rest === '/values:batchGet' && method === 'GET') {
      const out = [];
      for (const rg of u.searchParams.getAll('ranges')) {
        const r = parseRange(book, rg);
        if (!r) return err(400, 'Unable to parse range: ' + rg);
        out.push({ range: rg, values: trim(r.tab.rows) });
      }
      return resp(200, { valueRanges: out });
    }
    if (rest === '/values:batchUpdate' && method === 'POST') {
      if (body.valueInputOption !== 'RAW') return err(400, 'valueInputOption mesti RAW');
      for (const d of body.data) {
        const r = parseRange(book, d.range); if (!r) return err(400, 'Unable to parse range: ' + d.range);
        d.values.forEach((row, i) => { const cur = r.tab.rows[r.row + i] || []; row.forEach((v, j) => { cur[r.col + j] = v; }); r.tab.rows[r.row + i] = cur; });
      }
      touch(id);
      return resp(200, {});
    }
    const am = rest.match(/^\/values\/(.+):append$/);
    if (am && method === 'POST') {
      const r = parseRange(book, am[1]); if (!r) return err(400, 'Unable to parse range');
      const rows = trim(r.tab.rows);
      r.tab.rows = rows.concat(body.values.map((x) => x.slice()));
      touch(id);
      return resp(200, { updates: { updatedRows: body.values.length } });
    }
    return err(500, 'Tidak disokong: ' + method + ' ' + rest);
  }

  return {
    fetch, files, books, calls,
    failNext: (status, n) => { for (let i = 0; i < (n || 1); i++) failQueue.push(status); },
    tab: (id, title) => { const b = books.get(id); const t = b && b.tabs.find((x) => x.title === title); return t ? trim(t.rows) : null; },
    // ubah sel terus (meniru pengguna edit dalam Google Sheets)
    edit: (id, title, row, col, v) => { const t = books.get(id).tabs.find((x) => x.title === title); (t.rows[row] = t.rows[row] || [])[col] = v; touch(id); }
  };
}

fakeGoogle.blockShare = false;
module.exports = { fakeGoogle };
